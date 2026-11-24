package main

// Wi-Fi (aynı ağ / aynı modem) eşitleme — internet gerekmez.
//
// Her bilgisayarın kabuğu, eşitleme AÇIKKEN:
//   - UDP 41753'e 3 sn'de bir "buradayım" yayını yapar ve aynı porttan başkalarını dinler (eş listesi);
//   - 0.0.0.0:41752'de küçük bir HTTP ucu açar: /lan/kimlik, /lan/anlik (son yayınlanan kayıt anlığı),
//     /lan/gelen (karşı tarafın gönderdiği anlık gelen kutusuna yazılır).
// Kayıtlar tarayıcının IndexedDB'sinde olduğundan birleştirmeyi ARAYÜZ yapar (app/js/lan.js, FC.lanMerge kuralı:
// hiçbir kayıt silinmez/ezilmez; çakışmada yeni olan kalır, eskisi çakışma yedeğine). Kabuk yalnız taşır.
// Erişim: aynı "eşleşme kodu" girilmiş bilgisayarlar birbirini görür; her istek kodun SHA-256'sını taşır.
//
// Yerel API (yalnız 127.0.0.1, localOnly):
//   GET  /__shell/lan/durum               → {acik, id, ad, ip, port, esler:[{id, ad, ip, port, gorulme}]}
//   POST /__shell/lan/ayar  {acik, kod, ad}
//   POST /__shell/lan/yayinla  (gövde: anlık JSON)  — karşı taraf /lan/anlik ile alır
//   GET  /__shell/lan/cek?es=<id>         → eşin anlığı
//   POST /__shell/lan/gonder?es=<id>      (gövde: anlık JSON) → eşin gelen kutusuna
//   GET  /__shell/lan/gelen               → [{dosya, kimden, ad, zaman}]  ·  GET /__shell/lan/gelen-oku?dosya=  · POST /__shell/lan/gelen-sil?dosya=
//   POST /__shell/lan/ekle {ip}           → yayın engelliyse IP ile elle eş ekleme
//   POST /__shell/lan/dosya-yayinla?id=   · GET /__shell/lan/dosya-liste · GET /__shell/lan/dosya-cek?es=&id=  (görseller/ekler ayrı taşınır)

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	lanHTTPPort = 41752
	lanUDPPort  = 41753
	lanMaxBody  = 768 << 20
)

type lanConf struct {
	On   bool   `json:"acik"`
	Code string `json:"kod"`
	Name string `json:"ad"`
	ID   string `json:"id"`
}

type lanPeer struct {
	ID     string    `json:"id"`
	Name   string    `json:"ad"`
	IP     string    `json:"ip"`
	Port   int       `json:"port"`
	Seen   time.Time `json:"gorulme"`
	Manual bool      `json:"elle"`
}

var (
	lanMu     sync.Mutex
	lanCfg    lanConf
	lanPeers  = map[string]*lanPeer{}
	lanSrv    *http.Server
	lanUDP    *net.UDPConn
	lanStop   chan struct{}
	lanErr    string
	lanSnapMu sync.RWMutex
)

func lanFile() string     { return filepath.Join(dataDir, "wifi.json") }
func lanSnapFile() string { return filepath.Join(dataDir, "wifi-anlik.json") }
func lanInbox() string    { return filepath.Join(dataDir, "wifi-gelen") }
func lanFilesDir() string { return filepath.Join(dataDir, "wifi-dosyalar") }

var fileIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{4,80}$`)

func codeHash(code string) string {
	s := sha256.Sum256([]byte("ma3d-wifi:" + strings.TrimSpace(code)))
	return hex.EncodeToString(s[:])
}

func randID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func loadLanConf() {
	lanMu.Lock()
	defer lanMu.Unlock()
	if b, err := os.ReadFile(lanFile()); err == nil {
		_ = json.Unmarshal(b, &lanCfg)
	}
	if lanCfg.ID == "" {
		lanCfg.ID = randID()
	}
	if lanCfg.Name == "" {
		lanCfg.Name, _ = os.Hostname()
	}
	saveLanConfLocked()
}

func saveLanConfLocked() {
	b, _ := json.MarshalIndent(lanCfg, "", " ")
	_ = os.MkdirAll(dataDir, 0o755)
	_ = writeAtomic(lanFile(), b)
}

func startLAN() {
	loadLanConf()
	lanMu.Lock()
	on := lanCfg.On && lanCfg.Code != ""
	lanMu.Unlock()
	if on {
		lanUp()
	}
}

// lanUp: dinleyicileri açar (zaten açıksa dokunmaz).
func lanUp() {
	lanMu.Lock()
	defer lanMu.Unlock()
	if lanSrv != nil {
		return
	}
	lanErr = ""
	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", lanHTTPPort))
	if err != nil {
		lanErr = "PORT_BUSY"
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/lan/", lanPeerAPI)
	lanSrv = &http.Server{Handler: mux, ReadHeaderTimeout: 20 * time.Second}
	go lanSrv.Serve(ln)

	uc, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: lanUDPPort})
	if err == nil {
		lanUDP = uc
		go lanListenUDP(uc)
	} else {
		lanErr = "UDP_BUSY"
	}
	lanStop = make(chan struct{})
	go lanBeacon(lanStop)
}

func lanDown() {
	lanMu.Lock()
	defer lanMu.Unlock()
	if lanSrv != nil {
		_ = lanSrv.Close()
		lanSrv = nil
	}
	if lanUDP != nil {
		_ = lanUDP.Close()
		lanUDP = nil
	}
	if lanStop != nil {
		close(lanStop)
		lanStop = nil
	}
	for k, p := range lanPeers {
		if !p.Manual {
			delete(lanPeers, k)
		}
	}
}

type beacon struct {
	App  string `json:"app"`
	ID   string `json:"id"`
	Name string `json:"ad"`
	Port int    `json:"port"`
	Hash string `json:"h"`
}

func lanBeacon(stop chan struct{}) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		lanMu.Lock()
		b, _ := json.Marshal(beacon{App: appID, ID: lanCfg.ID, Name: lanCfg.Name, Port: lanHTTPPort, Hash: codeHash(lanCfg.Code)[:16]})
		lanMu.Unlock()
		for _, dst := range broadcastAddrs() {
			if c, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: dst, Port: lanUDPPort}); err == nil {
				_, _ = c.Write(b)
				c.Close()
			}
		}
		select {
		case <-stop:
			return
		case <-t.C:
		}
	}
}

// broadcastAddrs: 255.255.255.255 + her IPv4 arayüzün yönlendirilmiş yayın adresi (bazı modemler genel yayını geçirmez).
func broadcastAddrs() []net.IP {
	out := []net.IP{net.IPv4bcast}
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 || i.Flags&net.FlagBroadcast == 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			n, ok := a.(*net.IPNet)
			if !ok || n.IP.To4() == nil {
				continue
			}
			ip := n.IP.To4()
			m := n.Mask
			if len(m) == 16 {
				m = m[12:]
			}
			bc := make(net.IP, 4)
			for k := 0; k < 4; k++ {
				bc[k] = ip[k] | ^m[k]
			}
			out = append(out, bc)
		}
	}
	return out
}

func localIPs() []string {
	var out []string
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil && !n.IP.IsLinkLocalUnicast() {
				out = append(out, n.IP.String())
			}
		}
	}
	return out
}

func lanListenUDP(c *net.UDPConn) {
	buf := make([]byte, 2048)
	for {
		n, from, err := c.ReadFromUDP(buf)
		if err != nil {
			return
		}
		var b beacon
		if json.Unmarshal(buf[:n], &b) != nil || b.App != appID || b.ID == "" {
			continue
		}
		lanMu.Lock()
		if b.ID != lanCfg.ID && b.Hash == codeHash(lanCfg.Code)[:16] {
			p := lanPeers[b.ID]
			if p == nil {
				p = &lanPeer{ID: b.ID}
				lanPeers[b.ID] = p
			}
			p.Name, p.IP, p.Port, p.Seen = b.Name, from.IP.String(), b.Port, time.Now()
		}
		lanMu.Unlock()
	}
}

func lanAuth(r *http.Request) bool {
	lanMu.Lock()
	want := codeHash(lanCfg.Code)
	on := lanCfg.On && lanCfg.Code != ""
	lanMu.Unlock()
	got := r.Header.Get("X-MA3D-Kod")
	return on && subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

// lanPeerAPI: ağdaki diğer bilgisayarların çağırdığı uç (0.0.0.0:41752).
func lanPeerAPI(w http.ResponseWriter, r *http.Request) {
	if !lanAuth(r) {
		fail(w, http.StatusForbidden, "KOD")
		return
	}
	switch strings.TrimPrefix(r.URL.Path, "/lan/") {
	case "kimlik":
		lanMu.Lock()
		writeJSON(w, map[string]any{"app": appID, "id": lanCfg.ID, "ad": lanCfg.Name, "surum": appVersion})
		lanMu.Unlock()
	case "anlik":
		lanSnapMu.RLock()
		defer lanSnapMu.RUnlock()
		f, err := os.Open(lanSnapFile())
		if err != nil {
			fail(w, http.StatusNotFound, "ANLIK_YOK")
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = io.Copy(w, f)
	case "dosya":
		id := r.URL.Query().Get("id")
		if !fileIDRe.MatchString(id) {
			fail(w, http.StatusBadRequest, "ID")
			return
		}
		f, err := os.Open(filepath.Join(lanFilesDir(), id))
		if err != nil {
			fail(w, http.StatusNotFound, "DOSYA_YOK")
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = io.Copy(w, f)
	case "gelen":
		if r.Method != http.MethodPost {
			fail(w, http.StatusMethodNotAllowed, "yok")
			return
		}
		from := safeName(r.Header.Get("X-MA3D-Kimden"))
		name := r.Header.Get("X-MA3D-Ad")
		body, err := io.ReadAll(io.LimitReader(r.Body, lanMaxBody))
		if err != nil || !json.Valid(body) {
			fail(w, http.StatusBadRequest, "BOZUK")
			return
		}
		_ = os.MkdirAll(lanInbox(), 0o755)
		fn := fmt.Sprintf("%d-%s.json", time.Now().UnixNano(), from)
		meta, _ := json.Marshal(map[string]any{"kimden": from, "ad": name, "zaman": time.Now().Format(time.RFC3339)})
		_ = writeAtomic(filepath.Join(lanInbox(), fn+".meta"), meta)
		if err := writeAtomic(filepath.Join(lanInbox(), fn), body); err != nil {
			fail(w, http.StatusInternalServerError, "NO_WRITE")
			return
		}
		writeJSON(w, true)
	default:
		fail(w, http.StatusNotFound, "yok")
	}
}

var safeRe = regexp.MustCompile(`[^A-Za-z0-9_.-]`)

func safeName(s string) string {
	s = safeRe.ReplaceAllString(s, "_")
	if len(s) > 60 {
		s = s[:60]
	}
	if s == "" {
		s = "es"
	}
	return s
}

func peerByID(id string) *lanPeer {
	lanMu.Lock()
	defer lanMu.Unlock()
	if p := lanPeers[id]; p != nil {
		c := *p
		return &c
	}
	return nil
}

func peerReq(method string, p *lanPeer, path string, body []byte) (*http.Response, error) {
	lanMu.Lock()
	h, id, name := codeHash(lanCfg.Code), lanCfg.ID, lanCfg.Name
	lanMu.Unlock()
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, _ := http.NewRequest(method, fmt.Sprintf("http://%s:%d/lan/%s", p.IP, p.Port, path), rd)
	req.Header.Set("X-MA3D-Kod", h)
	req.Header.Set("X-MA3D-Kimden", id)
	req.Header.Set("X-MA3D-Ad", name)
	cli := &http.Client{Timeout: 10 * time.Minute}
	return cli.Do(req)
}

// lanAPI: sayfanın çağırdığı yerel uç (/__shell/lan/*).
func lanAPI(w http.ResponseWriter, r *http.Request, op string) {
	switch op {
	case "durum":
		lanMu.Lock()
		peers := []lanPeer{}
		for _, p := range lanPeers {
			if p.Manual || time.Since(p.Seen) < 20*time.Second {
				peers = append(peers, *p)
			}
		}
		sort.Slice(peers, func(i, j int) bool { return peers[i].Name < peers[j].Name })
		out := map[string]any{"acik": lanCfg.On && lanCfg.Code != "", "kodVar": lanCfg.Code != "", "id": lanCfg.ID, "ad": lanCfg.Name,
			"ip": localIPs(), "port": lanHTTPPort, "esler": peers, "hata": lanErr, "dinliyor": lanSrv != nil}
		lanMu.Unlock()
		writeJSON(w, out)

	case "ayar":
		var body struct {
			Acik *bool   `json:"acik"`
			Kod  *string `json:"kod"`
			Ad   *string `json:"ad"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil {
			fail(w, http.StatusBadRequest, "bozuk istek")
			return
		}
		lanMu.Lock()
		if body.Kod != nil {
			lanCfg.Code = strings.TrimSpace(*body.Kod)
			for k := range lanPeers {
				delete(lanPeers, k)
			}
		}
		if body.Ad != nil && strings.TrimSpace(*body.Ad) != "" {
			lanCfg.Name = strings.TrimSpace(*body.Ad)
		}
		if body.Acik != nil {
			lanCfg.On = *body.Acik
		}
		on := lanCfg.On && lanCfg.Code != ""
		saveLanConfLocked()
		lanMu.Unlock()
		if on {
			lanUp()
		} else {
			lanDown()
		}
		writeJSON(w, true)

	case "ekle":
		var body struct{ IP string }
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
		ip := net.ParseIP(strings.TrimSpace(body.IP))
		if ip == nil || ip.To4() == nil {
			fail(w, http.StatusBadRequest, "IP")
			return
		}
		p := &lanPeer{ID: "ip-" + ip.String(), IP: ip.String(), Port: lanHTTPPort, Manual: true, Seen: time.Now()}
		res, err := peerReq("GET", p, "kimlik", nil)
		if err != nil {
			fail(w, http.StatusBadGateway, "ULASILAMADI")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			fail(w, http.StatusBadGateway, fmt.Sprintf("HTTP_%d", res.StatusCode))
			return
		}
		var k struct{ ID, Ad string }
		_ = json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&k)
		if k.ID != "" {
			p.ID, p.Name = k.ID, k.Ad
		}
		lanMu.Lock()
		lanPeers[p.ID] = p
		lanMu.Unlock()
		writeJSON(w, p)

	case "yayinla":
		body, err := io.ReadAll(io.LimitReader(r.Body, lanMaxBody))
		if err != nil || !json.Valid(body) {
			fail(w, http.StatusBadRequest, "BOZUK")
			return
		}
		lanSnapMu.Lock()
		err = writeAtomic(lanSnapFile(), body)
		lanSnapMu.Unlock()
		if err != nil {
			fail(w, http.StatusInternalServerError, "NO_WRITE")
			return
		}
		writeJSON(w, true)

	case "dosya-yayinla":
		id := r.URL.Query().Get("id")
		if !fileIDRe.MatchString(id) {
			fail(w, http.StatusBadRequest, "ID")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 300<<20))
		if err != nil {
			fail(w, http.StatusBadRequest, "BOZUK")
			return
		}
		_ = os.MkdirAll(lanFilesDir(), 0o755)
		if err := writeAtomic(filepath.Join(lanFilesDir(), id), body); err != nil {
			fail(w, http.StatusInternalServerError, "NO_WRITE")
			return
		}
		writeJSON(w, true)

	case "dosya-liste":
		ents, _ := os.ReadDir(lanFilesDir())
		ids := []string{}
		for _, e := range ents {
			if !e.IsDir() && fileIDRe.MatchString(e.Name()) {
				ids = append(ids, e.Name())
			}
		}
		writeJSON(w, ids)

	case "dosya-cek":
		p := peerByID(r.URL.Query().Get("es"))
		id := r.URL.Query().Get("id")
		if p == nil || !fileIDRe.MatchString(id) {
			fail(w, http.StatusNotFound, "ES_YOK")
			return
		}
		res, err := peerReq("GET", p, "dosya?id="+id, nil)
		if err != nil {
			fail(w, http.StatusBadGateway, "ULASILAMADI")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			fail(w, res.StatusCode, fmt.Sprintf("HTTP_%d", res.StatusCode))
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.Copy(w, io.LimitReader(res.Body, 300<<20))

	case "cek":
		p := peerByID(r.URL.Query().Get("es"))
		if p == nil {
			fail(w, http.StatusNotFound, "ES_YOK")
			return
		}
		res, err := peerReq("GET", p, "anlik", nil)
		if err != nil {
			fail(w, http.StatusBadGateway, "ULASILAMADI")
			return
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			b, _ := io.ReadAll(io.LimitReader(res.Body, 200))
			fail(w, http.StatusBadGateway, strings.TrimSpace(string(b)))
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.Copy(w, io.LimitReader(res.Body, lanMaxBody))

	case "gonder":
		p := peerByID(r.URL.Query().Get("es"))
		if p == nil {
			fail(w, http.StatusNotFound, "ES_YOK")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, lanMaxBody))
		if err != nil {
			fail(w, http.StatusBadRequest, "BOZUK")
			return
		}
		res, err := peerReq("POST", p, "gelen", body)
		if err != nil {
			fail(w, http.StatusBadGateway, "ULASILAMADI")
			return
		}
		res.Body.Close()
		if res.StatusCode != 200 {
			fail(w, http.StatusBadGateway, fmt.Sprintf("HTTP_%d", res.StatusCode))
			return
		}
		writeJSON(w, true)

	case "gelen":
		ents, _ := os.ReadDir(lanInbox())
		list := []map[string]any{}
		for _, e := range ents {
			n := e.Name()
			if !strings.HasSuffix(n, ".json") {
				continue
			}
			m := map[string]any{"dosya": n}
			if b, err := os.ReadFile(filepath.Join(lanInbox(), n+".meta")); err == nil {
				_ = json.Unmarshal(b, &m)
				m["dosya"] = n
			}
			list = append(list, m)
		}
		writeJSON(w, list)

	case "gelen-oku":
		n := filepath.Base(r.URL.Query().Get("dosya"))
		f, err := os.Open(filepath.Join(lanInbox(), n))
		if err != nil || !strings.HasSuffix(n, ".json") {
			fail(w, http.StatusNotFound, "yok")
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = io.Copy(w, f)

	case "gelen-sil":
		// Birleştirilen gelen dosyası silinmez: "islendi" klasörüne taşınır (son 10 tutulur).
		n := filepath.Base(r.URL.Query().Get("dosya"))
		if !strings.HasSuffix(n, ".json") {
			fail(w, http.StatusBadRequest, "yok")
			return
		}
		done := filepath.Join(lanInbox(), "islendi")
		_ = os.MkdirAll(done, 0o755)
		_ = os.Rename(filepath.Join(lanInbox(), n), filepath.Join(done, n))
		_ = os.Remove(filepath.Join(lanInbox(), n+".meta"))
		if old, err := os.ReadDir(done); err == nil && len(old) > 10 {
			for _, e := range old[:len(old)-10] {
				_ = os.Remove(filepath.Join(done, e.Name()))
			}
		}
		writeJSON(w, true)

	default:
		fail(w, http.StatusNotFound, "yok")
	}
}
