$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeBinary = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if ($nodeBinary) {
    $nodeVersion = [version]((& $nodeBinary --version).TrimStart('v'))
    if ($nodeVersion -lt [version]'22.12.0') { $nodeBinary = $null }
}
if (-not $nodeBinary) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $nodeBinary = $bundledNode }
}
if (-not $nodeBinary) { throw 'Please install Node.js 22.12 or newer.' }
$viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Dependencies are missing. Run pnpm install with a supported Node.js first.' }
Push-Location -LiteralPath $projectRoot
try { & $nodeBinary $viteEntry --host 0.0.0.0 } finally { Pop-Location }
