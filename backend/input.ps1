$ErrorActionPreference = 'Stop'
$src = Get-Content -Raw -Path (Join-Path $PSScriptRoot 'Input.cs')
Add-Type -TypeDefinition $src -Language CSharp
[MandoInput]::Loop()
