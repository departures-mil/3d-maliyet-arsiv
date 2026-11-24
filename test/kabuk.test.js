// Kabuk (Go) testleri: go vet (linux + windows) + go test (FCD1, Node üreticisinin taze vektörleriyle), gerçek kabuk süreci:
// güncelleme uçları (yama / tam / bozuk yama / kurulum kanalı), pencere API'si, köken denetimi, OCR ucu, Wi‑Fi durum ucu;
// tarayıcıyla (Playwright varsa): arayüz kabukta açılır, bütün sayfalar hatasız çizilir, Ayarlar en sonda "Admin ile iletişim".
// go yoksa atlanır. CI (ubuntu): setup-go + playwright-core chromium.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHELL = path.join(ROOT, 'shell-exe');
const hasGo = spawnSync('go', ['version']).status === 0;
let pw = null;
for (const m of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright']) { if (!pw && m) try { pw = require(m); } catch (e) { } }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ma3d-test-'));
const BIN = path.join(TMP, 'ma3d-kabuk');
let basePort = 43000 + Math.floor(Math.random() * 2000);
const nextPort = () => ++basePort;

async function startShell(o) {
  const port = o.port || nextPort();
  const env = Object.assign({}, process.env, { MA3D_PENCERE_YOK: '1', MA3D_PORT: String(port), MA3D_LAN_YOK: '1' }, o.env || {});
  const p = spawn(o.bin || BIN, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.out = () => out; p.port = port; p.url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(p.url + '/__shell/info'); if (r.ok) { p.info = await r.json(); return p; } } catch (e) { }
    if (p.exitCode != null) break;
    await sleep(100);
  }
  p.kill(); throw new Error('kabuk açılmadı: ' + out);
}
const stop = (p) => new Promise((res) => { if (!p || p.exitCode != null) return res(); p.once('exit', res); p.kill(); });

test('go vet + go test (FCD1: Node üreticisinin taze vektörleri) + windows derlemesi', { skip: !hasGo && 'go yok', timeout: 300000 }, () => {
  execFileSync(process.execPath, [path.join(ROOT, 'araclar', 'paket.js'), path.join(TMP, 'app.zip')], { stdio: 'inherit' });
  const vec = path.join(TMP, 'vektor');
  execFileSync(process.execPath, [path.join(ROOT, 'araclar', 'fcd1-vektor.js'), vec], { stdio: 'inherit' });
  execFileSync('go', ['vet', './...'], { cwd: SHELL, stdio: 'inherit' });
  execFileSync('go', ['test', './...'], { cwd: SHELL, stdio: 'inherit', env: Object.assign({}, process.env, { FCD1_TESTDATA: vec }) });
  execFileSync('go', ['test', './...'], { cwd: SHELL, stdio: 'inherit' });
  execFileSync('go', ['build', '-o', BIN, '.'], { cwd: SHELL, stdio: 'inherit' });
  const w = spawnSync('go', ['vet', './...'], { cwd: SHELL, env: Object.assign({}, process.env, { GOOS: 'windows', GOARCH: 'amd64' }), encoding: 'utf8' });
  assert.strictEqual(w.status, 0, 'windows derlemesi: ' + w.stderr);
});

/** Paketin bir sonraki sürümü (index.html'e işaret, surum.json'da yeni sürüm). */
function nextBundle(version, mark) {
  const paket = require('../araclar/paket.js');
  const files = paket.list(path.join(ROOT, 'app'));
  const entries = files.map((n) => {
    let data = fs.readFileSync(path.join(ROOT, 'app', n));
    if (n === 'index.html') data = Buffer.from(String(data).replace('</body>', '<!-- ' + mark + ' --></body>'));
    return { name: n, data };
  });
  entries.push({ name: 'surum.json', data: Buffer.from(JSON.stringify({ app: '3d-maliyet-arsiv', version }) + '\n') });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  return paket.makeZip(entries);
}

test('güncelleme uçları: FCD1 yama, bozuk yama, yanlış SHA, açılışta indirilen paket, kurulum kanalı; pencere ve OCR', { skip: !hasGo && 'go yok', timeout: 120000 }, async () => {
  assert.ok(fs.existsSync(BIN), 'kabuk derlenmedi');
  const fcdelta = require('../cekirdek/fcdelta.js');
  const dir = path.join(TMP, 'g1');
  const env = { MA3D_VERI: path.join(dir, 'veri'), MA3D_CIKTI: path.join(dir, 'cikti') };
  let p = await startShell({ env });
  try {
    assert.strictEqual(p.info.app, '3d-maliyet-arsiv');
    assert.strictEqual(p.info.shell, 2);
    assert.strictEqual(p.info.version, require('../package.json').version);
    const cur = fs.readFileSync(path.join(SHELL, 'app.zip'));
    const next = nextBundle('99.0.0', 'YAMA-TESTI');
    const patch = await fcdelta.make(cur, next);
    assert.ok(patch.length < next.length / 4, 'yama küçük olmalı: ' + patch.length);
    const meta = { version: '99.0.0', channel: 'win-app', targetSha256: sha(next), targetSize: next.length, file: 'MaliyetArsiv3D-99.0.0-win-app.zip', patchSha256: sha(patch) };
    const H = (m) => ({ 'Content-Type': 'application/octet-stream', 'X-Meta': encodeURIComponent(JSON.stringify(m)) });

    const bad = Buffer.from(patch); bad[bad.length - 8] ^= 0xff;
    let r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: H(Object.assign({}, meta, { patchSha256: '' })), body: bad });
    assert.strictEqual(r.status, 409, await r.text());
    r = await fetch(p.url + '/__shell/guncelle/tam', { method: 'POST', headers: H(Object.assign({}, meta, { targetSha256: sha(Buffer.from('x')) })), body: next });
    assert.strictEqual(r.status, 500); assert.match(await r.text(), /BAD_HASH/);
    r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: Object.assign({ Origin: 'https://kotu.example' }, H(meta)), body: patch });
    assert.strictEqual(r.status, 403);
    r = await fetch(p.url + '/__shell/guncelle/yama', { method: 'POST', headers: H(meta), body: patch });
    assert.strictEqual(r.status, 200, await r.text());
    assert.strictEqual((await (await fetch(p.url + '/__shell/info')).json()).bundle, '99.0.0');
    assert.match(await (await fetch(p.url + '/')).text(), /YAMA-TESTI/);
    // pencere API (Linux'ta benzetim): açılışta tam ekran, orta ↔ tam, küçült
    r = await (await fetch(p.url + '/__shell/pencere/kaydet', { method: 'POST', body: '{"iz":"abc12345"}' })).json();
    assert.strictEqual(r.bulundu, true);
    let s = await (await fetch(p.url + '/__shell/pencere/orta', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.half], [false, true]);
    s = await (await fetch(p.url + '/__shell/pencere/orta', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.half], [true, false]);
    s = await (await fetch(p.url + '/__shell/pencere/kucult', { method: 'POST', body: '{}' })).json();
    assert.strictEqual(s.minimized, true);
    s = await (await fetch(p.url + '/__shell/pencere/tam-ac', { method: 'POST', body: '{}' })).json();
    assert.deepStrictEqual([s.fullscreen, s.minimized], [true, false]);
    // OCR ucu: Linux'ta okuyucu yok → 501 (arayüz yapay zekaya / elle girişe geçer); bozuk istek 400
    r = await fetch(p.url + '/__shell/ocr', { method: 'POST', body: Buffer.alloc(4) });
    assert.strictEqual(r.status, 400);
    r = await fetch(p.url + '/__shell/ocr', { method: 'POST', body: Buffer.alloc(64, 1) });
    assert.strictEqual(r.status, 501);
    // Wi‑Fi durum ucu
    const lan = await (await fetch(p.url + '/__shell/lan/durum')).json();
    assert.ok('acik' in lan && Array.isArray(lan.esler));
  } finally { await stop(p); }

  p = await startShell({ env });
  try {
    assert.strictEqual(p.info.bundle, '99.0.0');
    const exe = Buffer.from('MZ sahte kurulum');
    const r = await fetch(p.url + '/__shell/guncelle/tam', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Meta': encodeURIComponent(JSON.stringify({ version: '99.0.1', channel: 'win-setup', targetSha256: sha(exe), targetSize: exe.length, file: 'MaliyetArsiv3D-99.0.1-win-setup.exe' })) }, body: exe });
    assert.strictEqual(await r.text(), 'restarting');
    for (let i = 0; i < 40 && p.exitCode == null; i++) await sleep(100);
    assert.notStrictEqual(p.exitCode, null, 'kurulumdan sonra kabuk kapanmalı');
    assert.match(p.out(), /kurulum \(calistirilmadi\):.*MaliyetArsiv3D-99\.0\.1-win-setup\.exe/);
  } finally { await stop(p); }
});

test('tarayıcı: kabukta arayüz açılır, bütün sayfalar hatasız, malzeme → iş → stok düşer, Ayarlar en sonda iletişim, Arapça RTL', { skip: (!hasGo && 'go yok') || (!pw && 'playwright yok'), timeout: 180000 }, async () => {
  assert.ok(fs.existsSync(BIN), 'kabuk derlenmedi');
  const dir = path.join(TMP, 'g2');
  const p = await startShell({ env: { MA3D_VERI: path.join(dir, 'veri'), MA3D_CIKTI: path.join(dir, 'cikti') } });
  const b = await pw.chromium.launch({ headless: true });
  const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'tr-TR' });
    await ctx.route(/^https:/, (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(p.url + '/');
    await page.waitForFunction(() => window.APP && APP.S.settings && APP.S.settings.seeded && document.querySelector('#topRight *'), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.parentNode.removeChild(m)));
    const pages = await page.evaluate(() => Object.keys(APP.PAGES));
    for (const id of ['dashboard', 'calc', 'archive', 'materials', 'printers', 'customers', 'expenses', 'reports', 'assistant', 'settings']) assert.ok(pages.includes(id), id);
    for (const id of pages) { await page.evaluate((x) => APP.go(x), id); await page.waitForTimeout(250); }
    // Falcon düzeni: kategori ağacı (PLA ve PLA+ ayrı)
    await page.evaluate(() => APP.go('materials')); await page.waitForTimeout(250);
    const tree = await page.evaluate(() => APP.S.categories.map((c) => c.name));
    for (const n of ['Filament', 'ABS', 'ASA+', 'HYPER PLA', 'PA-CF', 'PETG', 'PLA', 'PLA+', 'TPU']) assert.ok(tree.includes(n), 'kategori ' + n);
    // malzeme + iş: kullanılan gram makaradan düşer
    const res = await page.evaluate(async () => {
      const cat = APP.S.categories.find((c) => c.name === 'PLA');
      await DB.put('materials', { id: 'mt1', name: 'Siyah', categoryId: cat.id, matType: 'PLA', weightG: 1000, kgPrice: 20, unitPrice: 20, serial: 'M-00001' });
      await DB.put('movements', { id: 'mv1', materialId: 'mt1', type: 'in', qty: 2, date: DB.now() });
      await APP.reload();
      const d = APP.calc.newDraft(); d.name = 'Deneme'; d.materials = [{ materialId: 'mt1', grams: 250 }]; d.printMin = 90;
      const j = await APP.calc.save(d, true, { quiet: true });
      return { stock: APP.stockOf('mt1'), cost: j.calc.cost, jobs: APP.S.jobs.length };
    });
    assert.strictEqual(res.jobs, 1);
    assert.ok(Math.abs(res.stock - 1.75) < 1e-6, 'stok ' + res.stock);
    assert.ok(res.cost > 5, 'maliyet ' + res.cost);
    // Ayarlar: son kart "Admin ile iletişim"
    await page.evaluate(() => APP.go('settings')); await page.waitForTimeout(400);
    const last = await page.evaluate(() => { const cs = [...document.querySelectorAll('#content .fc-card, #content .card')]; return cs.length ? cs[cs.length - 1].textContent : ''; });
    assert.match(last, /Admin|iletişim/i);
    // Arapça → RTL
    await page.evaluate(() => FC.i18n.set('ar')); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.deepStrictEqual(errors, []);
  } finally { await b.close(); await stop(p); }
});
