# 3D Maliyet ve Arşiv — çalışma notları

- Yapı: `shell-exe/` Go kabuk (app.zip gömülü, 127.0.0.1:41751, Edge/Chrome --app tam ekran); `app/` düz JS arayüz; `app/cekirdek/` ortak çekirdek kopyası (değiştirmeyin, ortak-cekirdek'ten kopyalanır).
- Veri: tarayıcı IndexedDB `maliyet-arsiv-3d` (adı ASLA değişmez), kabuk verisi `%LOCALAPPDATA%\MaliyetArsiv3D-veri`.
- Sürüm tek kaynak: package.json → `node araclar/surum.js X.Y.Z`. Her sürümde release-notes.json + kabuk.js NEWS (tr/en/ar).
- Metinler: app/js/metin.js (tr/en/ar aynı anahtarlar; test bunu denetler).
- Kurallar: masaüstü yalnızca kurulumlu (NSIS), taşınabilir yok; Ayarlar'ın sonunda "Admin ile iletişim"; yapay zeka kullanıcının kendi anahtarıyla; eşitleme kullanıcının kendi GitHub deposuna; Firebase yok.
- Test: `npm test`. Yayın: Actions → release → workflow_dispatch (main).
