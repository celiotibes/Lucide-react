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

  ; Run Setup Wizard on first launch (check if config exists)
  ${If} ${FileExists} "$APPDATA\CRMT\config\setup.db"
    MessageBox MB_OK "Installation completed! CRMT is ready to use."
  ${Else}
    CreateDirectory "$APPDATA\CRMT\config"
    CreateDirectory "$APPDATA\CRMT\data"
    CreateDirectory "$APPDATA\CRMT\backups"

    ; Create scheduled task for daily backups (02:00 AM)
    ; Requires Windows Task Scheduler
    Exec 'schtasks.exe /create /tn "CRMT Backup" /tr "$INSTDIR\CRMT.exe --backup" /sc daily /st 02:00'
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
