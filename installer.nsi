; NSIS Installer Script for CRMT (Lucide React)
; Builds a professional Windows installer with Setup Wizard support

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

; ===================================================================
; Global Definitions
; ===================================================================

SetCompressor /SOLID lzma
SetDatablockOptimize ON
SetOverwrite try
SetCompress force

Name "CRMT - Gestão Imobiliária"
OutFile "dist/nsis/CRMT-Setup.exe"

; Installation directory
!ifdef NSIS_ALLOW_REGISTRY_USAGE
  InstallDir "$PROGRAMFILES\CRMT"
!else
  InstallDir "C:\Program Files\CRMT"
!endif

; Avoid showing uninstall confirmation
!define INSTALL_DIR "$PROGRAMFILES\CRMT"
!define APPNAME "CRMT"
!define COMPANYNAME "Lucide React"
!define APPVERSION "1.0.0.0"

; ===================================================================
; MUI Configuration
; ===================================================================

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "Portuguese"
!insertmacro MUI_LANGUAGE "English"

; ===================================================================
; Installer Section
; ===================================================================

Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy application files
  File /r "dist\nsis\app\*"
  File /r "dist\nsis\server\*"
  File "package.json"

  ; Create start menu shortcuts
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\CRMT.exe"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; Create desktop shortcut
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\CRMT.exe"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Register uninstall in Control Panel
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "DisplayName" "${APPNAME} - Gestão Imobiliária"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "Publisher" "${COMPANYNAME}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" \
    "NoRepair" 1

  ; Initialize application directories
  CreateDirectory "$APPDATA\CRMT\config"
  CreateDirectory "$APPDATA\CRMT\data"
  CreateDirectory "$APPDATA\CRMT\backups"
  CreateDirectory "$APPDATA\CRMT\logs"

  ; Create .env template file for cloud database configuration
  FileOpen $0 "$APPDATA\CRMT\.env.template" w
  FileWrite $0 "# CRMT Environment Configuration (Phase 21)$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# Database Configuration$\r$\n"
  FileWrite $0 "# SQLite (default): file:./data/app.db$\r$\n"
  FileWrite $0 "# PostgreSQL: postgresql://user:password@host:5432/dbname$\r$\n"
  FileWrite $0 "DATABASE_URL=file:.\data\app.db$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# Connection Pooling (PostgreSQL)$\r$\n"
  FileWrite $0 "DATABASE_POOL_SIZE=20$\r$\n"
  FileWrite $0 "DATABASE_POOL_IDLE_TIMEOUT=30000$\r$\n"
  FileWrite $0 "DATABASE_SSL=require$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# Setup Wizard$\r$\n"
  FileWrite $0 "API_KEY=your-secure-api-key-min-32-chars$\r$\n"
  FileWrite $0 "SESSION_SECRET=your-session-secret-min-32-chars$\r$\n"
  FileWrite $0 "ENCRYPTION_MASTER_SECRET=your-encryption-key$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# Backup Configuration$\r$\n"
  FileWrite $0 "BACKUP_ENABLED=true$\r$\n"
  FileWrite $0 "BACKUP_SCHEDULE=0 2 * * *$\r$\n"
  FileWrite $0 "BACKUP_RETENTION_DAYS=30$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# Cloud Providers (Optional)$\r$\n"
  FileWrite $0 "# AWS S3$\r$\n"
  FileWrite $0 "# AWS_REGION=us-east-1$\r$\n"
  FileWrite $0 "# AWS_S3_BUCKET=crmt-backups-prod$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "# See documentation for complete configuration options$\r$\n"
  FileClose $0

  ; Run Setup Wizard on first launch (check if config exists)
  ${If} ${FileExists} "$APPDATA\CRMT\config\setup.db"
    MessageBox MB_OK "Installation completed! CRMT is ready to use."
  ${Else}
    ; First-time installation: Create scheduled task for daily backups (02:00 AM)
    ; Requires Windows Task Scheduler
    ; Note: Task creation requires elevated privileges (already running as admin)
    Exec 'schtasks.exe /create /tn "CRMT AutoBackup" /tr "$INSTDIR\CRMT.exe --backup" /sc daily /st 02:00 /f'

    ; Display helpful message about Setup Wizard and cloud database
    MessageBox MB_ICONINFORMATION|MB_OK \
      "Installation completed!$\r$\n$\r$\n" \
      "CRMT is ready to use. The Setup Wizard will open when you launch the application.$\r$\n$\r$\n" \
      "Quick Setup Checklist:$\r$\n" \
      "1. Configure AI Provider (Claude, OpenAI, or Local LLM)$\r$\n" \
      "2. Choose backup destination (Local, AWS S3, Google Drive)$\r$\n" \
      "3. Optional: Switch to PostgreSQL for production (see CLOUD-DATABASE.md)$\r$\n$\r$\n" \
      "For cloud database setup, see: $INSTDIR\CLOUD-DATABASE.md"
  ${EndIf}

SectionEnd

; ===================================================================
; Uninstaller Section
; ===================================================================

Section "Uninstall"
  ; Remove start menu shortcuts
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  ; Remove desktop shortcut
  Delete "$DESKTOP\${APPNAME}.lnk"

  ; Remove scheduled backup task
  Exec 'schtasks.exe /delete /tn "CRMT Backup" /f'

  ; Remove application files
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

  MessageBox MB_OK "CRMT has been uninstalled. Your data in %APPDATA%\CRMT has been preserved for safety."
SectionEnd

; ===================================================================
; Installer Attributes
; ===================================================================

BrandingText "CRMT - Professional Real Estate Management"
Icon "assets/crmt-icon-512.png"
