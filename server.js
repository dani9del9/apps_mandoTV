// MandoPC — controla el ratón y el teclado del PC desde el móvil (misma WiFi).
// Sin dependencias: solo Node.js. Ejecuta: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 8765;
const CFG_FILE = path.join(__dirname, 'config.json');
const PUB = path.join(__dirname, 'public');

// ---------- Registro en fichero (cuando se lanza desde la bandeja, sin ventana) ----------
if (process.env.MANDOPC_LOG) {
  const util = require('util');
  const logStream = fs.createWriteStream(path.join(__dirname, 'mando.log'), { flags: 'w' });
  for (const k of ['log', 'error']) {
    const orig = console[k];
    console[k] = (...a) => {
      try { orig(...a); } catch {}
      const t = new Date().toLocaleTimeString('es-ES');
      logStream.write(`[${t}] ` + a.map(x => (typeof x === 'string' ? x : util.inspect(x))).join(' ') + '\n');
    };
  }
}

// ---------- Config (PIN persistente) ----------
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch {}
if (!cfg.pin) {
  cfg.pin = String(crypto.randomInt(1000, 10000));
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
}

// ---------- Favoritos (se guardan en el PC) ----------
const FAV_FILE = path.join(__dirname, 'favoritos.json');
const DEFAULT_FAVS = [
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Netflix', url: 'https://www.netflix.com/' },
  { name: 'Twitch', url: 'https://www.twitch.tv/' },
];
function normUrl(u) {
  u = String(u || '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
  } catch { return null; }
}
function cleanFavs(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 300)
    .map(f => ({ name: String((f && f.name) || '').trim().slice(0, 80), url: normUrl(f && f.url) }))
    .filter(f => f.url)
    .map(f => ({ name: f.name || new URL(f.url).hostname, url: f.url }));
}
let favs = [];
function loadFavs() {
  if (!fs.existsSync(FAV_FILE)) {
    favs = DEFAULT_FAVS;
    fs.writeFileSync(FAV_FILE, JSON.stringify(favs, null, 2));
    return true;
  }
  try {
    const txt = fs.readFileSync(FAV_FILE, 'utf8').replace(/^﻿/, ''); // tolera el BOM del Bloc de notas
    favs = cleanFavs(JSON.parse(txt)) || [];
    return true;
  } catch (e) {
    console.error(`⚠ favoritos.json tiene un error y no lo puedo leer: ${e.message}`);
    return false; // no lo sobrescribo para no perder lo que hayas escrito
  }
}
loadFavs();
// Si editas favoritos.json a mano, se recarga solo y se envía a los móviles
fs.watchFile(FAV_FILE, { interval: 1000 }, () => {
  if (loadFavs()) { console.log(`★ favoritos.json recargado (${favs.length})`); broadcastFavs(); }
});
function broadcastFavs() { for (const c of conns) sendJSON(c, { t: 'favs', list: favs }); }

// ---------- Abrir URLs en Chrome ----------
function findChrome() {
  if (cfg.chrome && fs.existsSync(cfg.chrome)) return cfg.chrome;
  return [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean)
    .map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    .find(p => fs.existsSync(p));
}
const CHROME = process.platform === 'win32' ? findChrome() : null;
function openUrl(url) {
  url = normUrl(url);
  if (!url) return;
  console.log('🌐 Abriendo', url);
  if (process.platform !== 'win32') return;
  // Si Chrome ya está abierto, esto abre una pestaña nueva en la ventana existente.
  const exe = CHROME || 'explorer.exe'; // sin Chrome: navegador predeterminado
  spawn(exe, [url], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- Proceso que inyecta raton/teclado (PowerShell + C#) ----------
let backend = null;
function startBackend() {
  if (process.platform !== 'win32') {
    console.log('(Modo prueba: no es Windows, solo muestro los comandos)');
    backend = { write: l => console.log('>', l.trim()) };
    return;
  }
  const ps = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'backend', 'input.ps1'),
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  ps.stdout.on('data', d => { if (String(d).includes('READY')) console.log('✔ Control de ratón y teclado listo.'); });
  ps.stderr.on('data', d => console.error('[entrada]', String(d).trim()));
  ps.stdin.on('error', () => {});
  ps.on('exit', code => {
    console.error(`El proceso de entrada se cerró (código ${code}). Reiniciando...`);
    backend = null;
    setTimeout(startBackend, 1000);
  });
  backend = { write: l => { if (ps.stdin.writable) ps.stdin.write(l); } };
}
const out = line => backend && backend.write(line + '\n');

// ---------- Traduccion de mensajes del movil ----------
const VK = {
  backspace: 8, tab: 9, enter: 13, shift: 16, ctrl: 17, alt: 18, pause: 19, capslock: 20, esc: 27,
  space: 32, pageup: 33, pagedown: 34, end: 35, home: 36, left: 37, up: 38, right: 39, down: 40,
  printscreen: 44, insert: 45, delete: 46, win: 91, menu: 93,
  volmute: 173, voldown: 174, volup: 175, next: 176, prev: 177, stop: 178, playpause: 179,
};
const MODS = { ctrl: 17, alt: 18, shift: 16, win: 91 };
const BTN = { l: 'l', r: 'r', m: 'm' };

function vkOf(k) {
  k = String(k || '').toLowerCase();
  if (/^[a-z]$/.test(k)) return k.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(k)) return k.charCodeAt(0);
  const f = /^f([1-9]|1[0-2])$/.exec(k);
  if (f) return 111 + Number(f[1]);
  return VK[k];
}
const int = (v, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(v) || 0)));
const modVks = m => [...new Set((Array.isArray(m) ? m : []).map(x => MODS[x]).filter(Boolean))];

function withMods(m, fn) {
  const vks = modVks(m);
  vks.forEach(v => out(`kd ${v}`));
  fn();
  vks.slice().reverse().forEach(v => out(`ku ${v}`));
}

function handle(msg, conn) {
  const b = BTN[msg.b] || 'l';
  switch (msg.t) {
    case 'm': {
      const x = int(msg.x, -800, 800), y = int(msg.y, -800, 800);
      if (x || y) out(`m ${x} ${y}`);
      break;
    }
    case 'c': withMods(msg.m, () => out(`c ${b}`)); break;
    case 'dc': out('c l'); out('c l'); break;
    case 'd': conn.held.add(b); modVks(msg.m).forEach(v => out(`kd ${v}`)); out(`d ${b}`); break;
    case 'u': conn.held.delete(b); out(`u ${b}`); modVks(msg.m).reverse().forEach(v => out(`ku ${v}`)); break;
    case 's': { const y = int(msg.y, -2400, 2400); if (y) out(`s ${y}`); break; }
    case 'h': { const x = int(msg.x, -2400, 2400); if (x) out(`h ${x}`); break; }
    case 'z': { // zoom = Ctrl + rueda (un paso por "muesca")
      const n = int(msg.n, -10, 10);
      if (n) { out('kd 17'); out(`s ${n * 120}`); out('ku 17'); }
      break;
    }
    case 'txt':
      if (typeof msg.s === 'string' && msg.s.length && msg.s.length <= 5000)
        out('t ' + Buffer.from(msg.s, 'utf8').toString('base64'));
      break;
    case 'k': {
      const vk = vkOf(msg.k);
      if (!vk) return;
      const n = int(msg.n || 1, 1, 60);
      out(`k ${[...modVks(msg.m).filter(v => v !== vk), vk].join(',')} ${n}`);
      break;
    }
    case 'open': openUrl(msg.url); break;
    case 'fav_save': {
      const list = cleanFavs(msg.list);
      if (!list) return;
      favs = list;
      fs.writeFileSync(FAV_FILE, JSON.stringify(favs, null, 2));
      broadcastFavs(); // sincroniza otros móviles
      break;
    }
    case 'fav_get': sendJSON(conn, { t: 'favs', list: favs }); break;
  }
}
const conns = new Set();
function sendJSON(conn, o) { if (!conn.sock.destroyed) conn.sock.write(frame(0x1, Buffer.from(JSON.stringify(o)))); }

// ---------- Servidor HTTP (sirve la web del movil) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // Un MandoPC nuevo pide al viejo que se cierre (solo desde este mismo PC y con el PIN)
  if (url.pathname === '/__salir') {
    const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
    if (local && url.searchParams.get('pin') === cfg.pin) {
      res.end('adios');
      console.log('Otro MandoPC ha arrancado: cierro este.');
      setTimeout(() => process.exit(0), 200);
    } else { res.writeHead(403); res.end(); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- WebSocket minimo (sin dependencias) ----------
function frame(op, payload = Buffer.alloc(0)) {
  const n = payload.length;
  let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, payload]);
}
function closePayload(code, reason) {
  const r = Buffer.from(reason || '');
  const b = Buffer.alloc(2 + r.length); b.writeUInt16BE(code, 0); r.copy(b, 2); return b;
}
function parse(b) {
  if (b.length < 2) return null;
  const op = b[0] & 0x0f, masked = b[1] & 0x80;
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  if (len > 1 << 20) return { op: -1 };
  let mask = null;
  if (masked) { if (b.length < off + 4) return null; mask = b.subarray(off, off + 4); off += 4; }
  if (b.length < off + len) return null;
  const p = Buffer.from(b.subarray(off, off + len));
  if (mask) for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
  return { op, p, size: off + len };
}

server.on('upgrade', (req, sock) => {
  const u = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (u.pathname !== '/ws' || !key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const who = (req.socket.remoteAddress || '').replace('::ffff:', '');

  if (u.searchParams.get('pin') !== cfg.pin) {
    console.log(`✖ Intento con PIN incorrecto desde ${who}`);
    sock.end(frame(0x8, closePayload(4001, 'pin')));
    return;
  }
  console.log(`📱 Móvil conectado: ${who}`);

  const conn = { held: new Set(), alive: true, sock };
  conns.add(conn);
  sendJSON(conn, { t: 'favs', list: favs });
  let buf = Buffer.alloc(0);
  const ping = setInterval(() => {
    if (!conn.alive) return sock.destroy();
    conn.alive = false;
    sock.write(frame(0x9));
  }, 20000);

  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const f = parse(buf);
      if (!f) break;
      if (f.op === -1) return sock.destroy();
      buf = buf.subarray(f.size);
      conn.alive = true;
      if (f.op === 0x1) {
        try { handle(JSON.parse(f.p.toString('utf8')), conn); } catch {}
      } else if (f.op === 0x8) { sock.end(frame(0x8)); }
      else if (f.op === 0x9) { sock.write(frame(0xA, f.p)); }
    }
  });
  const bye = () => {
    clearInterval(ping);
    conns.delete(conn);
    conn.held.forEach(b => out(`u ${b}`)); // no dejar botones pulsados
    conn.held.clear();
  };
  sock.on('close', () => { bye(); console.log(`📴 Móvil desconectado: ${who}`); });
  sock.on('error', () => {});
});

// ---------- Arranque ----------
function lanIPs() {
  const r = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) r.push(i.address);
  return r;
}

let tries = 0;
function listen() { server.listen(PORT, '0.0.0.0'); }
server.on('listening', () => {
  fs.writeFileSync(path.join(__dirname, 'mando.pid'), String(process.pid));
  fs.writeFileSync(path.join(__dirname, 'estado.json'), JSON.stringify({
    pin: cfg.pin, port: PORT, urls: lanIPs().map(ip => `http://${ip}:${PORT}/?pin=${cfg.pin}`),
  }, null, 2));
  startBackend();
  console.log('\n========================================');
  console.log('  MandoPC en marcha');
  console.log('========================================');
  console.log('Abre esto en el navegador del móvil (misma WiFi):\n');
  lanIPs().forEach(ip => console.log(`   http://${ip}:${PORT}/?pin=${cfg.pin}`));
  console.log(`\nPIN: ${cfg.pin}   (está en config.json, puedes cambiarlo)`);
  if (process.platform === 'win32')
    console.log(CHROME ? `Chrome: ${CHROME}` : 'No encuentro Chrome: los favoritos se abrirán con el navegador predeterminado (puedes poner "chrome" en config.json).');
  console.log(`Favoritos: ${favs.length}`);
  console.log('Deja esta ventana abierta. Ctrl+C para cerrar.\n');
});
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') { console.error(e); process.exit(1); }
  if (tries === 0) {
    console.log('Ya había un MandoPC abierto: le pido que se cierre para arrancar esta versión...');
    http.get(`http://127.0.0.1:${PORT}/__salir?pin=${encodeURIComponent(cfg.pin)}`, r => r.resume()).on('error', () => {});
  }
  if (++tries > 10) {
    console.error(`\n✖ El puerto ${PORT} sigue ocupado por un MandoPC antiguo que no se deja cerrar.`);
    console.error('  Ciérralo a mano: Administrador de tareas → "Node.js JavaScript Runtime" → Finalizar tarea.');
    console.error('  Después vuelve a abrir iniciar.bat.\n');
    process.exit(1);
  }
  setTimeout(listen, 700);
});
listen();
