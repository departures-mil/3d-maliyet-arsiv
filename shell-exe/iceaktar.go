package main

// Gelen kutusu: <veri>\ice-aktar\*.json dosyalarını arayüz açılışta okur ve kendi kayıtlarına birleştirir
// (ör. Falcon Ofis malzemeleri). İşlenen dosya ice-aktar\islenen\ altına taşınır; hiçbir şey silinmez.
//   GET  /__shell/ice-aktar          → {"dosyalar":[{"ad":"x.json","veri":{...}}]}
//   POST /__shell/ice-aktar/bitti    {"ad":"x.json"} → dosya islenen\ altına

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func importInbox(w http.ResponseWriter, r *http.Request, done bool) {
	dir := filepath.Join(dataDir, "ice-aktar")
	if !done {
		_ = os.MkdirAll(dir, 0o755)
		out := []map[string]any{}
		ents, _ := os.ReadDir(dir)
		for _, e := range ents {
			if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".json") {
				continue
			}
			b, err := os.ReadFile(filepath.Join(dir, e.Name()))
			if err != nil || len(b) > 64<<20 {
				continue
			}
			var v any
			if json.Unmarshal(b, &v) != nil {
				continue
			}
			out = append(out, map[string]any{"ad": e.Name(), "veri": v})
		}
		writeJSON(w, map[string]any{"dosyalar": out})
		return
	}
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "yok")
		return
	}
	var body struct{ Ad string }
	_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
	name := filepath.Base(body.Ad)
	if name == "." || name == "" || name != body.Ad || !strings.EqualFold(filepath.Ext(name), ".json") {
		fail(w, http.StatusBadRequest, "ad")
		return
	}
	dst := filepath.Join(dir, "islenen")
	_ = os.MkdirAll(dst, 0o755)
	if err := os.Rename(filepath.Join(dir, name), filepath.Join(dst, time.Now().Format("20060102-150405")+"-"+name)); err != nil {
		fail(w, http.StatusNotFound, "yok")
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
