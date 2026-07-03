; Script do Inno Setup para o YouTube Downloader Ultimate
; Gerado automaticamente pela IA Antigravity

[Setup]
AppId={{2FBA2F76-EEF6-466D-8BD8-BA6FA23A63B4}
AppName=YouTube Downloader Ultimate
AppVersion=2.0.1
AppPublisher=Siriux
AppPublisherURL=https://github.com/sxrius-03/YoutuberDownloader
AppSupportURL=https://github.com/sxrius-03/YoutuberDownloader/issues
AppUpdatesURL=https://github.com/sxrius-03/YoutuberDownloader
DefaultDirName={autopf}\YouTube Downloader Ultimate
DefaultGroupName=YouTube Downloader Ultimate
AllowNoIcons=yes
OutputDir=dist\Output
OutputBaseFilename=YoutubeDownloader_Setup_v2.0.1
SetupIconFile=icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Dirs]
; Concede permissão de escrita/modificação para o grupo de usuários padrão na pasta de instalação.
; Isso é essencial para que o aplicativo consiga salvar as configurações (settings.json, history.json),
; baixar novas atualizações (update_new.exe) e carregar o cookies.txt sem precisar de privilégios de Administrador.
Name: "{app}"; Permissions: users-modify

[Files]
Source: "dist\YoutubeDownloader\YoutubeDownloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\YoutubeDownloader\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\YouTube Downloader Ultimate"; Filename: "{app}\YoutubeDownloader.exe"; IconFilename: "{app}\_internal\icon.ico"
Name: "{autodesktop}\YouTube Downloader Ultimate"; Filename: "{app}\YoutubeDownloader.exe"; IconFilename: "{app}\_internal\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\YoutubeDownloader.exe"; Description: "{cm:LaunchProgram,YouTube Downloader Ultimate}"; Flags: nowait postinstall skipifsilent
