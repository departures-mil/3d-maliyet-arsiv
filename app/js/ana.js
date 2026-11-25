/* AÇILIŞ — veritabanı, ilk kurulum (varsayılan kategoriler, listeler, maliyet kalemleri), çekirdek, ilk sayfa,
   eşitleme ve Wi‑Fi, kur güncelleme, yapıştır/sürükle-bırak ile dilimleyici görseli içe aktarma, mobil çekmece. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t;

  async function seed() {
    var have = await DB.all('lists', true);
    if (!have.length) {
      var L = [];
      function add(list, key, name, color, extra) { L.push(Object.assign({ id: 'l-' + list + '-' + key, list: list, key: key, name: name, color: color, order: L.filter(function (x) { return x.list === list; }).length + 1 }, extra || {})); }
      add('jobStatus', 'quote', t('seed.st.quote'), '#94a3b8', { printed: false, sold: false });
      add('jobStatus', 'planned', t('seed.st.planned'), '#6366f1', { printed: false, sold: false });
      add('jobStatus', 'printing', t('seed.st.printing'), '#0ea5e9', { printed: true, sold: false });
      add('jobStatus', 'done', t('seed.st.done'), '#22c55e', { printed: true, sold: true });
      add('jobStatus', 'delivered', t('seed.st.delivered'), '#14b8a6', { printed: true, sold: true });
      add('jobStatus', 'stock', t('seed.st.stock'), '#a855f7', { printed: true, sold: false });
      add('jobStatus', 'failed', t('seed.st.failed'), '#ef4444', { printed: true, sold: false });
      ['proto', 'spare', 'hobby', 'order', 'own'].forEach(function (k, i) { add('jobCategory', k, t('seed.jc.' + k), ['#0ea5e9', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6'][i]); });
      ['rent', 'power', 'net', 'ship', 'parts', 'tools', 'other'].forEach(function (k, i) { add('expenseCat', k, t('seed.ex.' + k), ['#64748b', '#eab308', '#0ea5e9', '#14b8a6', '#f97316', '#8b5cf6', '#94a3b8'][i]); });
      ['active', 'maintenance', 'broken', 'retired'].forEach(function (k, i) { add('printerStatus', k, t('seed.ps.' + k), ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'][i]); });
      ['maintenance', 'fault', 'repair', 'upgrade', 'calibration', 'note'].forEach(function (k, i) { add('logType', k, t('seed.lt.' + k), ['#0ea5e9', '#ef4444', '#f59e0b', '#8b5cf6', '#14b8a6', '#94a3b8'][i]); });
      add('unit', 'spool', t('u.spool'), '#94a3b8');
      await DB.putMany('lists', L);
    }
    if (!(await DB.all('categories', true)).length) {
      var root = { id: 'cat-filament', name: 'Filament', kind: 'material', parentId: null, order: 1 };
      var subs = ['ABS', 'ASA+', 'HYPER PLA', 'PA-CF', 'PETG', 'PLA', 'PLA+', 'TPU'].map(function (n, i) { return { id: 'cat-f-' + n.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]+/g, ''), name: n, kind: 'material', parentId: root.id, order: i + 1 }; });
      var other = [{ id: 'cat-resin', name: t('seed.cat.resin'), kind: 'material', parentId: null, order: 2 }, { id: 'cat-parts', name: t('seed.cat.parts'), kind: 'material', parentId: null, order: 3 }, { id: 'cat-consum', name: t('seed.cat.consumables'), kind: 'material', parentId: null, order: 4 }];
      await DB.putMany('categories', [root].concat(subs, other));
    }
    if (!(await DB.all('locations', true)).length) await DB.putMany('locations', [{ id: 'loc-1', name: t('seed.loc.shelf') }, { id: 'loc-2', name: t('seed.loc.box') }]);
    if (!(await DB.all('costItems', true)).length) await DB.putMany('costItems', CALC.defaultItems(t));
    if (!(await DB.all('printers', true)).length) {
      var ps = A.byId(await DB.all('lists'), 'l-printerStatus-active');
      await DB.put('printers', { id: 'prn-zaxe-z3s', name: 'Zaxe Z3S', brand: 'Zaxe', model: 'Z3S', serial: 'Y-00001', statusId: ps ? ps.id : '', nozzle: '0.4', bed: '300×300×300', watt: 350, price: 0, lifeHours: 5000, initialHours: 0, aliases: 'Zaxe Z3S, Z3S, Revo HF',
        tasks: ['nozzle', 'lube', 'belts', 'clean'].map(function (k, i) { return { id: 'tk-' + k, name: t('p.t.' + k), every: [300, 200, 500, 50][i], lastHours: 0 }; }) });
    }
    await DB.saveSettings({ seeded: true, defPrinterId: 'prn-zaxe-z3s' });
  }

  /* kurlar: açılışta 12 saatten eskiyse arka planda */
  async function rates() {
    var st = S.settings; if (!st.autoRates || navigator.onLine === false) return;
    if (st.ratesAt && Date.now() - Date.parse(st.ratesAt) < 12 * 3600000) return;
    try { var r = await CALC.fetchRates(); var p = { ratesAt: DB.now(), ratesSrc: r.src }; if (r.rateTry) p.rateTry = +r.rateTry.toFixed(4); if (r.rateSyp) p.rateSyp = +r.rateSyp.toFixed(2); await DB.saveSettings(p); await A.reload(); if (S.page === 'dashboard' || S.page === 'calc') A.render(); } catch (e) { }
  }

  /* yapıştır / sürükle-bırak: dilimleyici görseli, G-code, 3MF → içe aktarma */
  function importable(files) { return files.filter(function (f) { return /^image\//.test(f.type) || /\.(gcode|gco|3mf|bgcode)$/i.test(f.name || ''); }); }
  function handleFiles(files) {
    files = importable(files); if (!files.length) return false;
    if (S.page === 'calc') A.importer.open(function (res) { if (!S.draft) S.draft = A.calc.newDraft(); A.calc.applyImport(S.draft, res); A.render(); }, files);
    else A.importer.batch(files);
    return true;
  }
  function wireDrop() {
    document.addEventListener('paste', function (e) {
      if (document.querySelector('.modal-backdrop')) return;
      var tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA') && !(e.clipboardData && e.clipboardData.files && e.clipboardData.files.length)) return;
      var fs = Array.prototype.slice.call((e.clipboardData && e.clipboardData.files) || []).map(function (f, i) { return f.name && f.name !== 'image.png' ? f : new File([f], t('imp.pasted') + ' ' + (i + 1) + '.png', { type: f.type }); });
      if (fs.length && handleFiles(fs)) e.preventDefault();
    });
    var over = 0;
    document.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { over++; document.body.classList.add('dropping'); } });
    document.addEventListener('dragleave', function () { over = Math.max(0, over - 1); if (!over) document.body.classList.remove('dropping'); });
    document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      over = 0; document.body.classList.remove('dropping');
      if (document.querySelector('.modal-backdrop') || e.defaultPrevented) return;
      var fs = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (fs.length) { e.preventDefault(); if (!handleFiles(fs)) A.toast(t('imp.unknownType'), 'bad'); }
    });
  }

  async function boot() {
    try { await DB.open(); }
    catch (e) { document.getElementById('content').innerHTML = '<div class="notice error">' + A.esc(t('k.dbError')) + ' ' + A.esc(e.message || e) + '</div>'; return; }
    await A.reload();
    if (!S.settings.seeded) { await seed(); await A.reload(); }
    A.kabuk.init();
    var go = A.go;
    A.go = function (id, arg) { try { FC.storage.set('ma3d.page', id); } catch (e) { } go(id, arg); };
    document.getElementById('menuBtn').onclick = function () { document.getElementById('shell').classList.toggle('drawer-open'); };
    document.getElementById('backdrop').onclick = function () { document.getElementById('shell').classList.remove('drawer-open'); };
    document.getElementById('brandVer').textContent = 'v' + (window.APP_VERSION || '');
    FC.i18n.onChange(function () { document.title = t('app.name'); A.render(); });
    document.title = t('app.name');
    var last = FC.storage.get('ma3d.page', 'dashboard');
    A.go(A.PAGES[last] && !A.moduleList().some(function (m) { return m.id === last && m.hidden; }) ? last : 'dashboard');
    wireDrop();
    A.sync.start();
    A.wifi.start();
    A.kabuk.started();
    setTimeout(function () { A.matImport.inbox(); }, 1200);
    setTimeout(rates, 2500);
    if (S.settings.lowWarn !== false) { var low = S.materials.filter(A.isLow).length; if (low) setTimeout(function () { A.toast(t('m.lowToast', { n: low }), 'info'); }, 2000); }
    /* rozetler (düşük stok, bakım) değişikliklerden sonra tazelenir */
    DB.onChange(function () { clearTimeout(boot._n); boot._n = setTimeout(A.drawNav, 400); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  A.seed = seed;
})();
