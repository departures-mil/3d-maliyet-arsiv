; 3D Maliyet ve Arşiv — Windows kurulumu (NSIS, kullanıcı başına, tek tık, tr/en/ar).
; Derleme (CI, windows-latest):  makensis /DVERSION=1.0.0 /DEXE=..\dist\MaliyetArsiv3D.exe /DOUTFILE=..\dist\MaliyetArsiv3D-Setup-1.0.0.exe kurulum\MaliyetArsiv3D.nsi
; Kurulum yeri: %LOCALAPPDATA%\Programs\MaliyetArsiv3D  (yönetici izni gerekmez). Yeni sürüm eskisinin ÜZERİNE kurulur.
; Veriler: %LOCALAPPDATA%\MaliyetArsiv3D-veri — kurulum klasörünün dışında; kaldırma ve yeniden kurulum ona DOKUNMAZ.

Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef EXE
  !define EXE "..\dist\MaliyetArsiv3D.exe"
!endif
!ifndef OUTFILE
  !define OUTFILE "..\dist\MaliyetArsiv3D-Setup-${VERSION}.exe"
!endif

!define APPNAME "3D Maliyet ve Arşiv"
!define EXENAME "MaliyetArsiv3D.exe"
!define UNINST "Kaldir.exe"
!define UKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MaliyetArsiv3D"
!define KAPAT_URL "http://127.0.0.1:41751/__shell/kapat"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\MaliyetArsiv3D"
RequestExecutionLevel user
ShowInstDetails nevershow
ShowUninstDetails nevershow
AutoCloseWindow true
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "3D Maliyet ve Arsiv"
VIAddVersionKey /LANG=1033 "FileDescription" "3D Maliyet ve Arsiv kurulum"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "departures-mil"
VIAddVersionKey /LANG=1033 "LegalCopyright" "departures-mil"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Arabic"

LangString MsgOpen ${LANG_TURKISH} "3D Maliyet ve Arşiv hâlâ açık. Programı kapatıp $\"Yeniden Dene$\"ye basın."
LangString MsgOpen ${LANG_ENGLISH} "3D Maliyet ve Arşiv is still open. Close the program and press $\"Retry$\"."
LangString MsgOpen ${LANG_ARABIC} "برنامج تكلفة وأرشيف الطباعة ثلاثية الأبعاد ما زال مفتوحًا. أغلقه ثم اضغط $\"إعادة المحاولة$\"."
LangString UnKeep ${LANG_TURKISH} "Program kaldırıldı. Kayıtlarınız silinmedi: $LOCALAPPDATA\MaliyetArsiv3D-veri"
LangString UnKeep ${LANG_ENGLISH} "The program was removed. Your records were not deleted: $LOCALAPPDATA\MaliyetArsiv3D-veri"
LangString UnKeep ${LANG_ARABIC} "أُزيل البرنامج. لم تُحذف سجلاتك: $LOCALAPPDATA\MaliyetArsiv3D-veri"

; Açık programdan kapanmasını ister (yerel API; program yoksa sessizce geçer).
!macro AskClose
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Method POST -Body ''{}'' -Uri ${KAPAT_URL} -TimeoutSec 3 | Out-Null } catch {}"'
  Pop $0
!macroend

Section "install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  !insertmacro AskClose
  SetOverwrite try
  StrCpy $R1 0
  retry:
    ClearErrors
    File "/oname=${EXENAME}" "${EXE}"
    IfErrors 0 written
    IntOp $R1 $R1 + 1
    IntCmp $R1 30 ask 0 ask
    Sleep 500
    Goto retry
  ask:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(MsgOpen)" IDRETRY again
    Abort
  again:
    StrCpy $R1 0
    Goto retry
  written:
  SetOverwrite on
  File "icon.ico"
  WriteUninstaller "$INSTDIR\${UNINST}"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "${UKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UKEY}" "Publisher" "departures-mil"
  WriteRegStr HKCU "${UKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UKEY}" "UninstallString" '"$INSTDIR\${UNINST}"'
  WriteRegStr HKCU "${UKEY}" "QuietUninstallString" '"$INSTDIR\${UNINST}" /S'
  WriteRegStr HKCU "${UKEY}" "URLInfoAbout" "https://github.com/departures-mil/3d-maliyet-arsiv"
  WriteRegDWORD HKCU "${UKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UKEY}" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  IfSilent +2
  Exec '"$INSTDIR\${EXENAME}"'
FunctionEnd

Section "uninstall"
  SetShellVarContext current
  !insertmacro AskClose
  Sleep 1500
  Delete "$INSTDIR\${EXENAME}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\${UNINST}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  DeleteRegKey HKCU "${UKEY}"
  ; Kayıtlar ($LOCALAPPDATA\MaliyetArsiv3D-veri) ve dışa aktarmalar (Belgeler) SİLİNMEZ.
  RMDir "$INSTDIR"
  IfSilent +2
  MessageBox MB_OK|MB_ICONINFORMATION "$(UnKeep)"
SectionEnd
