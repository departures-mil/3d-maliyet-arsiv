# 3D Maliyet ve Arşiv

3D baskı işleri için Windows masaüstü programı (kurulumlu): maliyet ve kâr hesabı, basılan parçaların görselli arşivi,
malzeme/filament stoku (Falcon Ofis düzeni), yazıcı kayıtları ve bakım planı, müşteriler, giderler, raporlar.
Türkçe · English · العربية.

## Özellikler
- **Hesapla:** her maliyet kalemi eklenir/çıkarılır/yeniden adlandırılır (malzeme, elektrik, aşınma, işçilik, fire, sabit, adet/saat/gram başına, yüzde payları). Kullanılan filament gramı makaradan düşer.
- **Dilimleyiciden al:** Orca/Zaxe/Bambu/Cura ekran görüntüsü, G-code veya 3MF bırakın/yapıştırın; süre, gram, yazıcı, malzeme ve ayarlar okunur, siz onaylayınca (ya da düzeltince) kayda geçer. Dosya adındaki ad ve adet ("BallastBox 1 adet") alınır. Önce yapay zeka (kendi anahtarınız), yoksa Windows yazı tanıma.
- **Arşiv:** görseller, dosyalar, teklif, tekrar basım, ödeme durumu.
- **Malzemeler:** kategori ağacı, renk, konum, seri no (M-xxxxx), giriş/çıkış, QR etiket, döküm.
- **Yazıcılar:** bakım görevleri (saat aralığı), arıza/bakım geçmişi, saat, ciro ve kâr.
- **Eşitleme:** kendi özel GitHub deponuzla (her kullanıcı kendi hesabı) ve internetsiz aynı Wi‑Fi üzerinden; hiçbir kayıt silinmez ya da ezilmez, eski sürümler çakışmalarda saklanır.
- **Güncelleme:** sağ üstteki düğmeyle tek tıkla; yalnızca değişen kısımlar (FCD1 yaması), olmazsa tam dosya; SHA-256 doğrulaması.

## Geliştirme
```
npm test                       # Node + Go + (varsa) Playwright
node araclar/surum.js 1.0.1    # sürüm; release-notes.json ve app/js/kabuk.js NEWS notlarını da yazın
```
Yayın: `main`'e gönderip Actions → release → Run workflow (main). Çıktılar: `MaliyetArsiv3D-Setup-X.Y.Z.exe` (win-setup) ve `app.zip` (win-app) + son 5 sürümden yamalar.
