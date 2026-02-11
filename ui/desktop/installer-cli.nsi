; Super-Goose CLI Installer (NSIS)
; Installs goose.exe CLI tool and adds to PATH

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "EnvVarUpdate.nsh"

; ─── Configuration ───────────────────────────────────────────────
!define PRODUCT_NAME "Goose CLI"
!define PRODUCT_EXE_NAME "goose"
!define PRODUCT_PUBLISHER "Ghenghis"
!define PRODUCT_WEB_SITE "https://ghenghis.github.io/Super-Goose/"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\GooseCLI"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif

; CLI binary path passed from CI
!ifndef CLI_BINARY
  !define CLI_BINARY "goose.exe"
!endif

!ifndef OUTDIR
  !define OUTDIR "out\make\nsis"
!endif

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "${OUTDIR}\Goose-CLI-Setup.exe"
InstallDir "$PROGRAMFILES64\Goose\bin"
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin

; ─── Modern UI ───────────────────────────────────────────────────
!define MUI_ABORTWARNING
!define MUI_ICON "src\images\icon.ico"
!define MUI_UNICON "src\images\icon.ico"

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

  ; Copy CLI binary
  File "${CLI_BINARY}"

  ; Add to system PATH
  ${EnvVarUpdate} $0 "PATH" "A" "HKLM" "$INSTDIR"

SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst-cli.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst-cli.exe"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
SectionEnd

; ─── Uninstall Section ───────────────────────────────────────────
Section Uninstall
  ; Remove from PATH
  ${un.EnvVarUpdate} $0 "PATH" "R" "HKLM" "$INSTDIR"

  ; Remove files
  Delete "$INSTDIR\goose.exe"
  Delete "$INSTDIR\uninst-cli.exe"
  RMDir "$INSTDIR"

  ; Remove registry
  DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"

  SetAutoClose true
SectionEnd
