# MandoPC en la bandeja del sistema (abajo a la derecha). Lo lanza MandoPC.vbs sin ventana.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$dir = Split-Path -Parent $PSScriptRoot

# Solo una bandeja a la vez
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'MandoPC_Bandeja', [ref]$created)
if (-not $created) {
  [System.Windows.Forms.MessageBox]::Show('MandoPC ya está abierto en la bandeja del sistema (abajo a la derecha, junto al reloj).', 'MandoPC') | Out-Null
  exit
}

function Show-Msg([string]$text, [string]$icon = 'Information') {
  [System.Windows.Forms.MessageBox]::Show($text, 'MandoPC', 'OK', $icon) | Out-Null
}

# Icono dibujado al vuelo (un ratón)
function New-MandoIcon([string]$color) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $c = [System.Drawing.ColorTranslator]::FromHtml($color)
  $pen = New-Object System.Drawing.Pen($c, 3)
  $fill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#181b22'))
  $g.FillEllipse($fill, 6, 1, 20, 30)
  $g.DrawEllipse($pen, 6, 1, 20, 30)
  $g.DrawLine($pen, 16, 2, 16, 13)
  $g.DrawLine($pen, 7, 13, 25, 13)
  $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
function Get-PngIcon([string]$file, [string]$fallbackColor) {
  $p = Join-Path $PSScriptRoot $file
  try {
    $bmp = New-Object System.Drawing.Bitmap $p
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  } catch { return New-MandoIcon $fallbackColor }
}
$iconOn = Get-PngIcon 'bandeja-on.png' '#4f8cff'
$iconOff = Get-PngIcon 'bandeja-off.png' '#8a90a0'

# ---------- Servidor (node server.js sin ventana) ----------
$script:proc = $null
$script:wantRunning = $false

function Start-Mando {
  $node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $node) { Show-Msg 'No encuentro Node.js. Instálalo desde https://nodejs.org' 'Error'; return }
  Remove-Item (Join-Path $dir 'estado.json') -ErrorAction SilentlyContinue
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node.Source
  $psi.Arguments = '"' + (Join-Path $dir 'server.js') + '"'
  $psi.WorkingDirectory = $dir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables['MANDOPC_LOG'] = '1'
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $script:wantRunning = $true
}

function Stop-Mando {
  $script:wantRunning = $false
  if ($script:proc -and -not $script:proc.HasExited) {
    try { $script:proc.Kill() } catch {}
    try { $script:proc.WaitForExit(3000) | Out-Null } catch {}
  }
}

function Get-Estado {
  $f = Join-Path $dir 'estado.json'
  if (-not (Test-Path $f)) { return $null }
  try { return Get-Content -Raw -Encoding UTF8 $f | ConvertFrom-Json } catch { return $null }
}

function Show-Address {
  $e = Get-Estado
  if (-not $e) { Show-Msg 'MandoPC todavía está arrancando (o está parado). Prueba en unos segundos.'; return }
  $urls = @($e.urls)
  $text = "Abre esto en el navegador del móvil (misma WiFi):`n`n" + ($urls -join "`n") + "`n`nPIN: $($e.pin)"
  if ($urls.Count -gt 0) {
    try { [System.Windows.Forms.Clipboard]::SetText($urls[0]); $text += "`n`n(Dirección copiada al portapapeles)" } catch {}
  }
  Show-Msg $text
}

# ---------- Arranque con Windows ----------
$startupLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'MandoPC.lnk'
function Set-Autostart([bool]$on) {
  if ($on) {
    $sh = New-Object -ComObject WScript.Shell
    $l = $sh.CreateShortcut($startupLnk)
    $l.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $l.Arguments = '"' + (Join-Path $dir 'MandoPC.vbs') + '"'
    $l.WorkingDirectory = $dir
    $l.Description = 'MandoPC'
    $l.IconLocation = (Join-Path $dir 'public\favicon.ico') + ',0'
    $l.Save()
  } else {
    Remove-Item $startupLnk -ErrorAction SilentlyContinue
  }
}

# ---------- Icono y menú ----------
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $iconOff
$tray.Text = 'MandoPC'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itTitle = $menu.Items.Add('MandoPC: arrancando...')
$itTitle.Enabled = $false
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$itAddr = $menu.Items.Add('Dirección para el móvil...')
$itAddr.Font = New-Object System.Drawing.Font($itAddr.Font, [System.Drawing.FontStyle]::Bold)
$itAddr.add_Click({ Show-Address })

$itLocal = $menu.Items.Add('Abrir el mando en este PC')
$itLocal.add_Click({
  $e = Get-Estado
  if ($e) { Start-Process "http://localhost:$($e.port)/?pin=$($e.pin)" } else { Show-Msg 'MandoPC no está en marcha.' }
})

$itFav = $menu.Items.Add('Editar favoritos.json')
$itFav.add_Click({ Start-Process notepad.exe -ArgumentList ('"' + (Join-Path $dir 'favoritos.json') + '"') })

$itLog = $menu.Items.Add('Ver registro')
$itLog.add_Click({
  $f = Join-Path $dir 'mando.log'
  if (Test-Path $f) { Start-Process notepad.exe -ArgumentList ('"' + $f + '"') } else { Show-Msg 'Todavía no hay registro.' }
})

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$itRestart = $menu.Items.Add('Reiniciar')
$itRestart.add_Click({ Stop-Mando; Start-Sleep -Milliseconds 500; Start-Mando })

$itAuto = $menu.Items.Add('Arrancar con Windows')
$itAuto.Checked = Test-Path $startupLnk
$itAuto.add_Click({
  Set-Autostart (-not (Test-Path $startupLnk))
  $itAuto.Checked = Test-Path $startupLnk
})

[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

$itExit = $menu.Items.Add('Salir')
$itExit.add_Click({
  Stop-Mando
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$tray.ContextMenuStrip = $menu
$tray.add_MouseDoubleClick({ Show-Address })

# ---------- Estado (cada 2 s) ----------
$script:lastState = $null
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
  $running = [bool]($script:proc -and -not $script:proc.HasExited)
  if ($running -ne $script:lastState) {
    $script:lastState = $running
    if ($running) {
      $tray.Icon = $iconOn; $tray.Text = 'MandoPC: en marcha'; $itTitle.Text = 'MandoPC: en marcha'
    } else {
      $tray.Icon = $iconOff; $tray.Text = 'MandoPC: parado'; $itTitle.Text = 'MandoPC: parado'
    }
  }
  if (-not $running -and $script:wantRunning) {
    $script:wantRunning = $false
    $tray.ShowBalloonTip(6000, 'MandoPC', 'El servidor se ha cerrado. Mira "Ver registro" o pulsa "Reiniciar".', [System.Windows.Forms.ToolTipIcon]::Warning)
  }
})
$timer.Start()

Start-Mando
$tray.ShowBalloonTip(4000, 'MandoPC', 'En marcha. Doble clic en el icono para ver la dirección del móvil.', [System.Windows.Forms.ToolTipIcon]::Info)

[System.Windows.Forms.Application]::Run()

# ---------- Al salir ----------
$timer.Stop()
Stop-Mando
$tray.Dispose()
try { $mutex.ReleaseMutex() } catch {}
