//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const ocrScript = `param([string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + `1' })[0]
function Await($op, $type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = $null
foreach ($tag in @('en-US', 'en-GB', 'tr-TR')) {
  $lang = New-Object Windows.Globalization.Language $tag
  if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($lang)) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang); break }
}
if ($engine -eq $null) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if ($engine -eq $null) { throw 'OCR_DIL_YOK' }
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$words = New-Object System.Collections.ArrayList
$lines = New-Object System.Collections.ArrayList
foreach ($l in $result.Lines) {
  [void]$lines.Add($l.Text)
  foreach ($wd in $l.Words) { $r = $wd.BoundingRect; [void]$words.Add(@{ t = $wd.Text; x = $r.X; y = $r.Y; w = $r.Width; h = $r.Height }) }
}
@{ kelimeler = $words; satirlar = $lines; dil = $engine.RecognizerLanguage.LanguageTag } | ConvertTo-Json -Depth 4 -Compress
`

func runOCR(img string) ([]byte, error) {
	dir := filepath.Dir(img)
	ps1 := filepath.Join(dir, "ocr.ps1")
	if err := os.WriteFile(ps1, append([]byte{0xEF, 0xBB, 0xBF}, ocrScript...), 0o600); err != nil {
		return nil, errors.New("NO_WRITE")
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Path", img)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	done := make(chan struct{})
	var out []byte
	var err error
	go func() { out, err = cmd.Output(); close(done) }()
	select {
	case <-done:
	case <-time.After(60 * time.Second):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		return nil, errors.New("OCR_ZAMAN_ASIMI")
	}
	if err != nil {
		msg := "OCR_HATA"
		if ee, ok := err.(*exec.ExitError); ok && len(ee.Stderr) > 0 && strings.Contains(string(ee.Stderr), "OCR_DIL_YOK") {
			msg = "OCR_DIL_YOK"
		}
		return nil, errors.New(msg)
	}
	s := strings.TrimSpace(strings.TrimPrefix(string(out), "\uFEFF"))
	return []byte(s), nil
}
