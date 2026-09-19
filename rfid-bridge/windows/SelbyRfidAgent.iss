#define AgentName "Selby RFID Agent"
#define AgentVersion "1.0.0"
#define AgentPublisher "Selby Archery Club"
#define AgentExecutable "SelbyRfidAgent.exe"

[Setup]
AppId={{D6AECEB1-8A8D-4D3A-B0E5-E85F93C50D20}
AppName={#AgentName}
AppVersion={#AgentVersion}
AppPublisher={#AgentPublisher}
DefaultDirName={localappdata}\Programs\Selby RFID Agent
DefaultGroupName={#AgentName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\installer
OutputBaseFilename=Selby-RFID-Agent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AgentExecutable}
CloseApplications=force
RestartApplications=no

[Files]
Source: "..\dist\windows-agent\{#AgentExecutable}"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Selby RFID Agent"; ValueData: """{app}\{#AgentExecutable}"""; Flags: uninsdeletevalue

[Icons]
Name: "{group}\RFID Agent logs"; Filename: "{localappdata}\Selby Archery Club\RFID Agent\logs"
Name: "{group}\Uninstall {#AgentName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#AgentExecutable}"; Description: "Start {#AgentName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AgentExecutable}"; Parameters: "--stop"; Flags: runhidden waituntilterminated skipifdoesntexist; RunOnceId: "StopAgent"
