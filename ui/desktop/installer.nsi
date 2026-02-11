; Super-Goose Desktop Installer (NSIS)
; Builds from the dist-windows/ flat directory

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ─── Configuration ───────────────────────────────────────────────
!define PRODUCT_NAME "Goose"
!define PRODUCT_PUBLISHER "Ghenghis"
!define PRODUCT_WEB_SITE "https://ghenghis.github.io/Super-Goose/"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\Goose.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

; Version passed from CI via /DVERSION=x.y.z
!ifndef VERSION
  !define VERSION "0.0.0"
!endif

; Source directory passed from CI via /DSOURCE_DIR=path
!ifndef SOURCE_DIR
  !define SOURCE_DIR "dist-windows"
!endif

; Output directory
!ifndef OUTDIR
  !define OUTDIR "out\make\nsis"
!endif

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "${OUTDIR}\Goose-Setup-NSIS.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin

; ─── Modern UI Configuration ─────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ICON "src\images\icon.ico"
!define MUI_UNICON "src\images\icon.ico"

; ─── Pages ───────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ─── Install Section ─────────────────────────────────────────────
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite on

  ; Copy all files from the flat distribution
  File /r "${SOURCE_DIR}\*.*"

  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\Goose.exe"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\uninst.exe"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\Goose.exe"

  ; Register goose:// protocol handler
  WriteRegStr HKCR "goose" "" "URL:Goose Protocol"
  WriteRegStr HKCR "goose" "URL Protocol" ""
  WriteRegStr HKCR "goose\shell\open\command" "" '"$INSTDIR\Goose.exe" "%1"'

SectionEnd

; ─── Post-Install ────────────────────────────────────────────────
Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\Goose.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\Goose.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"

  ; Calculate installed size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

; ─── Uninstall Section ───────────────────────────────────────────
Section Uninstall
  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

  ; Remove protocol handler
  DeleteRegKey HKCR "goose"

  ; Remove application files
  RMDir /r "$INSTDIR"

  ; Remove registry entries
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"

  SetAutoClose true
SectionEnd
