// Duman testleri (Node, bağımlılıksız): sürüm tutarlılığı, çekirdek kopyası, paket, çeviriler, maliyet motoru,
// dilimleyici içe aktarma ayrıştırıcıları (ekran yazısı, dosya adı, G-code), Wi‑Fi/GitHub birleştirme kuralı.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const VER = require('../package.json').version;

/** Tarayıcı betiğini yalın bir pencere benzetimine yükler. */
function sandbox(files, extra) {
  const ctx = Object.assign({ console, setTimeout, clearTimeout, Date, Math, JSON, Promise, Uint8Array, TextDecoder, TextEncoder }, extra || {});
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

test('sürüm: package.json = surum.js = main.go = kabuk.js NEWS = release-notes; v1.0.0 düzeni', () => {
  assert.match(VER, /^\d+\.\d+\.\d+$/);
  assert.match(read('app/js/surum.js'), new RegExp('window\\.APP_VERSION = "' + VER.replace(/\./g, '\\.') + '"'));
  assert.match(read('shell-exe/main.go'), new RegExp('var appVersion = "' + VER.replace(/\./g, '\\.') + '"'));
  assert.ok(read('app/js/kabuk.js').includes("'" + VER + "': {"), 'NEWS kaydı');
  const n = JSON.parse(read('release-notes.json'));
  for (const l of ['tr', 'en', 'ar']) assert.ok(n[l] && n[l].length > 20, 'release-notes ' + l);
});

test('çekirdek kopyası ve kimlik: dosyalar yerinde, depo/uygulama adı, veritabanı adı sabit', () => {
  for (const f of ['app/cekirdek/fc-core.js', 'app/cekirdek/css/tokens.css', 'app/cekirdek/css/core.css', 'cekirdek/fcdelta.js', 'app/lib/qrcode.js', 'app/icon.png'])
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const html = read('app/index.html');
  assert.ok(html.indexOf('cekirdek/fc-core.js') < html.indexOf('js/ana.js'));
  const k = read('app/js/kabuk.js');
  assert.match(k, /OWNER = 'departures-mil', REPO = '3d-maliyet-arsiv'/);
  assert.match(k, /setupChannel: 'win-setup'/);
  assert.match(read('app/js/db.js'), /'maliyet-arsiv-3d'/);
  assert.match(read('shell-exe/main.go'), /const appID = "3d-maliyet-arsiv"/);
  const yml = read('.github/workflows/release.yml');
  assert.ok(!/Baski|baski/.test(yml), 'release.yml eski adlar');
  assert.match(yml, /win-setup=MaliyetArsiv3D-Setup-\*\.exe/);
  // her script dosyası index.html'de
  for (const f of fs.readdirSync(path.join(ROOT, 'app/js'))) assert.ok(html.includes('js/' + f), 'index.html: ' + f);
});

test('paket: belirleyici zip, bütün app dosyaları + surum.json', () => {
  const paket = require('../araclar/paket.js');
  const a = paket.build(), b = paket.build();
  assert.strictEqual(crypto.createHash('sha256').update(a.zip).digest('hex'), crypto.createHash('sha256').update(b.zip).digest('hex'));
  for (const f of paket.list(path.join(ROOT, 'app'))) assert.ok(a.files.includes(f), f);
  assert.ok(a.files.includes('surum.json'));
  assert.strictEqual(a.version, VER);
  assert.strictEqual(a.zip.readUInt32LE(0), 0x04034b50);
});

test('çeviriler: tr/en/ar aynı anahtarlar, yer tutucular tutarlı, kodda kullanılan anahtarlar var', () => {
  const ctx = sandbox(['app/js/metin.js'], { FC: { i18n: { add() { } } } });
  const M = ctx.METIN;
  const keys = (l) => Object.keys(M[l]).sort();
  assert.deepStrictEqual(keys('en'), keys('tr'));
  assert.deepStrictEqual(keys('ar'), keys('tr'));
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const k of keys('tr')) for (const l of ['en', 'ar']) assert.strictEqual(ph(M[l][k]), ph(M.tr[k]), l + ':' + k);
  // kodda t('…') ile çağrılan sabit anahtarlar
  const core = read('app/cekirdek/fc-core.js');
  const miss = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'app/js'))) {
    if (f === 'metin.js') continue;
    for (const m of read('app/js/' + f).matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) {
      const k = m[1]; if (k.endsWith('.')) continue;
      if (k.startsWith('fc.')) { if (!core.includes("'" + k + "'")) miss.push(f + ':' + k); continue; }
      if (!(k in M.tr)) miss.push(f + ':' + k);
    }
  }
  assert.deepStrictEqual(miss, []);
  assert.ok(/[؀-ۿ]/.test(M.ar['app.name'] || M.ar['nav.dashboard']), 'Arapça metin');
});

test('maliyet motoru: malzeme, elektrik, aşınma, işçilik, fire, yüzde payları, hedef fiyat', () => {
  const ctx = sandbox(['app/js/hesap.js']);
  const C = ctx.CALC;
  const items = C.defaultItems((k) => k).map((x) => Object.assign({}, x, { on: true, amount: x.type === 'fail' ? 10 : x.type === 'pctPrice' ? 0 : x.type === 'pctCost' ? 0 : x.amount }));
  const r = C.compute({ qty: 2, printMin: 120, laborMin: 30, laborRate: 6, kwhPrice: 0.2, margin: 50,
    materials: [{ grams: 100, kgPrice: 20 }, { grams: 50, kgPrice: 30 }], printer: { watt: 300, price: 500, lifeHours: 5000 },
    items: items.filter((x) => /^(material|energy|wear|labor|fail)$/.test(x.type)).map((x) => Object.assign({}, x, { amount: x.type === 'fail' ? 10 : 0 })) });
  // malzeme 2 + 1.5 = 3.5; elektrik 0.3×2×0.2 = 0.12; aşınma 0.1×2 = 0.2; işçilik 6×0.5 = 3 → 6.82; fire %10 → 7.502
  assert.ok(Math.abs(r.materialCost - 3.5) < 1e-9);
  assert.ok(Math.abs(r.cost - 7.502) < 1e-9, 'maliyet ' + r.cost);
  assert.ok(Math.abs(r.price - 7.502 * 1.5) < 1e-9);
  assert.strictEqual(r.grams, 150);
  assert.ok(Math.abs(r.unitCost - 7.502 / 2) < 1e-9);
  // komisyon %10: fiyat, komisyon düşülünce hedef kâr kalacak biçimde
  const r2 = C.compute({ qty: 1, margin: 0, materials: [{ grams: 1000, kgPrice: 9 }], items: [{ id: 'm', type: 'material', on: true }, { id: 'c', type: 'pctPrice', on: true, amount: 10 }] });
  assert.ok(Math.abs(r2.price - 10) < 1e-9 && Math.abs(r2.profit) < 1e-9);
  // hedef birim fiyat
  const r3 = C.compute({ qty: 3, targetUnit: 5, materials: [{ grams: 1000, kgPrice: 6 }], items: [{ id: 'm', type: 'material', on: true }] });
  assert.strictEqual(r3.price, 15); assert.ok(Math.abs(r3.profit - 9) < 1e-9);
  // kapalı kalem hesaba girmez
  const r4 = C.compute({ materials: [{ grams: 1000, kgPrice: 6 }], items: [{ id: 'm', type: 'material', on: false }] });
  assert.strictEqual(r4.cost, 0);
});

function importer() {
  const ctx = sandbox([], {});
  ctx.FC = { ui: { esc: (s) => s } };
  ctx.CALC = { pos: (v) => Math.max(0, +v || 0), num: (v) => +v || 0 };
  ctx.APP = { S: { printers: [{ id: 'p1', name: 'Zaxe Z3S', model: 'Z3S', brand: 'Zaxe', aliases: 'Revo HF' }], materials: [{ id: 'm1', name: 'Beyaz', brand: 'Zaxe', matType: 'ABS', color: '#ffffff' }, { id: 'm2', name: 'Siyah', brand: 'Elas', matType: 'PLA+' }] },
    t: (k) => k, esc: (s) => s, colorFamily: () => '', stockOf: () => 1, catPath: () => '' };
  vm.runInContext(read('app/js/iceaktar.js'), ctx, { filename: 'iceaktar.js' });
  return ctx.APP.importer;
}

test('içe aktarma: dilimleyici ekran yazısı (Orca/Zaxe "Total estimation") → süre, gram, yazıcı, malzeme', () => {
  const I = importer();
  const r = I._parseText(['Total estimation', 'Total Filament: 12.34 m 37.21 g', 'Model Filament: 11.52 m 34.8 g', 'Prepare time: 6m40s', 'Model printing time: 1h8m', 'Total time: 1h15m',
    'Printer Type Zaxe Z3S - Revo HF 0.4 nozzle', 'Plate Type Textured PEI Plate', 'Filament Zaxe ABS', 'Process 0.15mm, Recommended @Z3S'].join('\n'));
  assert.strictEqual(r.grams, 37.21);
  assert.strictEqual(r.printMin, 75);
  assert.strictEqual(I._matchPrinter(r.printer), 'p1');
  assert.strictEqual(I._matchMaterial({ name: r.filament, type: r.filamentType }), 'm1');
});

test('içe aktarma: dosya adından ad ve adet; süre biçimleri', () => {
  const I = importer();
  const a = I._fromName('Alerion-R1-VersionB adet 1.png'); assert.strictEqual(a.name, 'Alerion-R1-VersionB'); assert.strictEqual(a.qty, 1);
  const b = I._fromName('BallastBox 1 adet.png'); assert.strictEqual(b.name, 'BallastBox'); assert.strictEqual(b.qty, 1);
  const c = I._fromName('Bracket x4.3mf'); assert.strictEqual(c.qty, 4);
  for (const [s, m] of [['1h8m', 68], ['2h2m', 122], ['6m40s', 6 + 40 / 60], ['1d2h', 1560], ['1 saat 8 dk', 68], ['01:08:00', 68]]) assert.ok(Math.abs(I._dur(s) - m) < 0.01, s + ' → ' + I._dur(s));
});

test('içe aktarma: G-code (OrcaSlicer ve Cura başlıkları)', () => {
  const I = importer();
  const g = I._parseGcode('; generated by OrcaSlicer 2.1.1\n; model printing time: 1h 8m 3s; total estimated time: 1h 15m 2s\n; filament used [mm] = 12340.50\n; filament used [g] = 37.21\n; filament_type = ABS\n; layer_height = 0.15\n; printer_settings_id = Zaxe Z3S - Revo HF 0.4 nozzle\n; sparse_infill_density = 15%\n');
  assert.strictEqual(g.grams, 37.21);
  assert.ok(Math.abs(g.printMin - 75.03) < 0.05, 'süre ' + g.printMin);
  assert.strictEqual(I._matchPrinter(g.printer), 'p1');
  const c = I._parseGcode(';FLAVOR:Marlin\n;TIME:4083\n;Filament used: 12.34m\n;Layer height: 0.2\n;Generated with Cura_SteamEngine 5.0');
  assert.ok(Math.abs(c.printMin - 4083 / 60) < 0.01);
  assert.ok(c.meters > 12 && c.meters < 13);
});

test('eşitleme kuralı (GitHub ve Wi‑Fi aynı): yeni olan kalır, eskisi çakışmalara, silme işareti korunur', () => {
  const ctx = sandbox(['app/cekirdek/fc-core.js'], { document: undefined, navigator: { language: 'tr' }, localStorage: undefined });
  const L = ctx.FC.lanMerge;
  const local = [{ id: 'a', name: 'yerel', updatedAt: '2026-01-02T00:00:00Z' }, { id: 'b', name: 'B', updatedAt: '2026-01-01T00:00:00Z' }];
  const remote = [{ id: 'a', name: 'uzak', updatedAt: '2026-01-01T00:00:00Z' }, { id: 'c', name: 'C', updatedAt: '2026-01-03T00:00:00Z' }, { id: 'b', name: 'B', deleted: true, updatedAt: '2026-01-05T00:00:00Z' }];
  const r = L.merge(local, remote);
  const by = Object.fromEntries(r.records.map((x) => [x.id, x]));
  assert.strictEqual(by.a.name, 'yerel');
  assert.ok(by.c, 'eksik kayıt eklenir');
  assert.ok(by.b.archived, 'silinen kayıt arşivlenir, kaybolmaz'); assert.strictEqual(r.archived.length, 1);
  assert.ok(r.conflicts.length >= 1, 'üstüne yazılan sürüm saklanır');
});

test('malzeme içe aktarma: Falcon Ofis döküm CSV başlıkları, kategori yolu, renk adları, durum', () => {
  const ctx = sandbox([], {});
  ctx.FC = { ui: {} };
  ctx.APP = { S: { materials: [], categories: [], locations: [] }, t: (k) => k, esc: (s) => s };
  vm.runInContext(read('app/js/malzeme-aktar.js'), ctx, { filename: 'malzeme-aktar.js' });
  const I = ctx.APP.matImport;
  const csv = '\uFEFFSeri No;Ad;Marka;Durum;Kategori;Konum;Adet;Birim;Asgari adet;Birim fiyat (USD)\nM-00024;Beige;eSUN;Sıfır;Filament › PLA+;AMTN Home;1;adet;0;13,00\nM-00005;"Olive Green";eSUN;Kullanılmış;Filament › PLA+;AMTN Home;5;adet;0;\n';
  const items = I._rowsToItems(I._parseCsv(csv));
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].serial, 'M-00024');
  assert.strictEqual(items[0].category, 'Filament › PLA+');
  assert.strictEqual(I._num(items[0].unitPrice), 13);
  assert.strictEqual(I._num(items[1].qty), 5);
  assert.strictEqual(I._condOf('Sıfır'), 'new'); assert.strictEqual(I._condOf('Kullanılmış'), 'used'); assert.strictEqual(I._condOf('Used'), 'used');
  assert.strictEqual(I._colorOf('', 'Black'), '#111111');
  assert.strictEqual(I._colorOf('', 'Dark Gray'), '#4b5563');
  assert.strictEqual(I._colorOf('#ABCDEF', 'x'), '#abcdef');
  const en = I._rowsToItems(I._parseCsv('Name,Brand,Category,Qty\nRed,eSUN,Filament > PETG,2\n'));
  assert.strictEqual(en[0].name, 'Red'); assert.strictEqual(en[0].qty, '2');
  assert.strictEqual(I._jsonToItems({ materials: [{ name: 'X', serial: 'M-1', categoryPath: 'Filament › ABS', initialQty: 3 }] })[0].qty, 3);
});
