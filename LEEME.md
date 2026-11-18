# MandoPC

Controla el ratón y el teclado del PC desde el móvil por WiFi. Pensado para usarlo en el sofá con Moonlight/Sunshine.

## Requisitos
- Windows 10/11 con **Node.js** instalado (no hace falta `npm install`, no tiene dependencias).
- El móvil y el PC en la misma red WiFi.

## Uso
1. Doble clic en **iniciar.bat**.
2. La primera vez, Windows preguntará si permites el acceso a la red a Node.js: marca **Redes privadas** y acepta.
3. En la ventana verás algo como `http://192.168.1.50:8765/?pin=1234`. Ábrelo en el navegador del móvil.
4. En Chrome (Android): menú ⋮ → **Añadir a pantalla de inicio**. Así queda como una app a pantalla completa. El PIN se guarda en el móvil.

## Gestos del touchpad
| Gesto | Acción |
|---|---|
| Mover 1 dedo | Mover el ratón |
| Toque | Clic izquierdo |
| Doble toque | Doble clic |
| Doble toque y arrastrar | Arrastrar (mantener clic) |
| Toque con 2 dedos | Clic derecho |
| Toque con 3 dedos | Clic central |
| Mover 2 dedos | Scroll (vertical y horizontal) |
| Pellizcar (abrir/cerrar 2 dedos) | Zoom (Ctrl + rueda: navegador, fotos, Office…) |

Los botones de abajo (Izquierdo / Medio / Derecho) también sirven para arrastrar si los mantienes pulsados.

## Teclado
- **⌨️**: abre el teclado del móvil y lo que escribes va directo al PC (también el borrado y el Enter).
- **⌘**: teclas especiales (Esc, Tab, flechas, F1–F12, multimedia, atajos) y un campo para escribir o dictar un texto largo y enviarlo de golpe.
- **Ctrl / Alt / Shift / Win**: un toque las activa para la siguiente tecla, un segundo toque las deja fijas (naranja) y un tercero las quita. Ejemplo: Ctrl y luego la letra `c` = copiar.

## Favoritos (★)
- Toca un favorito y se abre en Chrome en el PC: si Chrome está cerrado lo abre y, si ya está abierto, abre una pestaña nueva.
- **Editar**: añadir (nombre + URL, puedes poner solo `youtube.com`), tocar uno para modificarlo, ↑ ↓ para reordenar, 🗑 dos veces para borrarlo.
- Se guardan en el PC, en `favoritos.json`, así que valen para cualquier móvil que conectes.
- Si Chrome está instalado en un sitio raro, añade su ruta en `config.json`: `"chrome": "D:\\Chrome\\chrome.exe"`.

## Sin ventana, en la bandeja del sistema (recomendado)
Doble clic en **MandoPC.vbs**: no sale ninguna ventana y aparece un icono de ratón abajo a la derecha, junto al reloj. Si no lo ves, mira en la flechita ^ de iconos ocultos; puedes arrastrarlo fuera para que se vea siempre.

- **Doble clic en el icono**: muestra la dirección y el PIN para el móvil, y copia la dirección al portapapeles.
- **Clic derecho**: menú con *Abrir el mando en este PC*, *Editar favoritos.json*, *Ver registro*, *Reiniciar*, **Arrancar con Windows** (marcar/desmarcar) y *Salir*.
- Icono azul = en marcha · gris = parado.

`iniciar.bat` sigue sirviendo si quieres verlo con ventana (para depurar). Si abres uno mientras el otro está en marcha, el nuevo sustituye al viejo.

## Notas
- El PIN está en `config.json`. Si lo cambias, reinicia MandoPC.
- Si una ventana se está ejecutando **como administrador** (Administrador de tareas, algunos instaladores o juegos), Windows bloquea el control desde un programa normal. Solución: ejecutar `iniciar.bat` como administrador.
- Puerto por defecto: 8765. Para cambiarlo: `set PORT=9000` antes de `node server.js`.
