param(
    [string]$Python = "python",
    [string]$InnoSetupCompiler = ""
)

$ErrorActionPreference = "Stop"
$bridgeDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDirectory = Join-Path $bridgeDirectory ".venv-build"
$pythonExecutable = Join-Path $venvDirectory "Scripts\python.exe"
$agentOutput = Join-Path $bridgeDirectory "dist\windows-agent"
$installerOutput = Join-Path $bridgeDirectory "dist\installer"

if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    & $Python -m venv $venvDirectory
}

& $pythonExecutable -m pip install --disable-pip-version-check -r (Join-Path $bridgeDirectory "requirements-windows-build.txt")
& $pythonExecutable -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name SelbyRfidAgent `
    --distpath $agentOutput `
    --workpath (Join-Path $bridgeDirectory "build\pyinstaller") `
    --specpath (Join-Path $bridgeDirectory "build") `
    (Join-Path $bridgeDirectory "bridge.py")

if (-not $InnoSetupCompiler) {
    $compilerCandidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    )
    $InnoSetupCompiler = $compilerCandidates |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Select-Object -First 1
}

if (-not $InnoSetupCompiler -or -not (Test-Path -LiteralPath $InnoSetupCompiler)) {
    throw "Inno Setup 6 is required to build the installer. Pass its ISCC.exe path with -InnoSetupCompiler."
}

New-Item -ItemType Directory -Force -Path $installerOutput | Out-Null
& $InnoSetupCompiler (Join-Path $bridgeDirectory "windows\SelbyRfidAgent.iss")

Write-Output "Agent: $(Join-Path $agentOutput 'SelbyRfidAgent.exe')"
Write-Output "Installer: $(Join-Path $installerOutput 'Selby-RFID-Agent-Setup.exe')"
