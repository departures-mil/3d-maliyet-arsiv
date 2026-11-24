package main

// Çevrim dışı yazı tanıma: dilimleyici (slicer) ekran görüntülerinden gram, süre, filament, nozzle okumak için.
// Windows'un kendi OCR motoru (Windows.Media.Ocr) PowerShell üzerinden çalıştırılır: ek indirme, internet gerekmez.
//   POST /__shell/ocr  (gövde: görüntü baytları, PNG/JPG/BMP) → {kelimeler:[{t, x, y, w, h}], satirlar:[...], dil}
// Arayüz önce kullanıcının kendi AI anahtarıyla (görsel okuyabilen model) dener; yoksa / internet yoksa burası.

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type ocrWord struct {
	T string  `json:"t"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type ocrResult struct {
	Words []ocrWord `json:"kelimeler"`
	Lines []string  `json:"satirlar"`
	Lang  string    `json:"dil"`
}

func ocrAPI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "yok")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 40<<20))
	if err != nil || len(body) < 16 {
		fail(w, http.StatusBadRequest, "BOZUK")
		return
	}
	dir := filepath.Join(os.TempDir(), "ma3d-ocr")
	_ = os.MkdirAll(dir, 0o755)
	img := filepath.Join(dir, time.Now().Format("150405.000000")+".img")
	if err := os.WriteFile(img, body, 0o600); err != nil {
		fail(w, http.StatusInternalServerError, "NO_WRITE")
		return
	}
	defer os.Remove(img)
	out, err := runOCR(img)
	if err != nil {
		fail(w, http.StatusNotImplemented, err.Error())
		return
	}
	var res ocrResult
	if json.Unmarshal(out, &res) != nil {
		fail(w, http.StatusInternalServerError, "OCR_BOZUK")
		return
	}
	writeJSON(w, res)
}
