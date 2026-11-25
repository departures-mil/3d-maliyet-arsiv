/* Yerel veri katmanı — IndexedDB ("maliyet-arsiv-3d"; ADI DEĞİŞMEZ, kayıtlar buna bağlı).
   Her kayıt {id, updatedAt} taşır. Silme yumuşaktır: deleted + deletedAt (eşitleme diğer cihazda da görür).
   Eşitlemede uzakta silinen ama yerelde daha yeni olan kayıt "archived" olur (gizli, Ayarlar → Silinenler'den geri alınır).
   Görseller ve ekler "files" deposunda Blob olarak durur; kayıtlar yalnız kimliklerini taşır. */
(function () {
  'use strict';
  var DB_NAME = 'maliyet-arsiv-3d', DB_VER = 2;
  var STORES = ['meta', 'categories', 'locations', 'materials', 'movements', 'printers', 'printerLogs', 'customers',
    'jobs', 'projects', 'expenses', 'costItems', 'lists', 'fields', 'files', 'cakismalar'];
  /* eşitlenen depolar (meta ve çakışma yedekleri cihazda kalır) */
  var SYNCED = STORES.filter(function (s) { return s !== 'meta' && s !== 'cakismalar'; });
  var _db = null, subs = [];

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        STORES.forEach(function (s) { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
      };
      req.onsuccess = function (e) { _db = e.target.result; res(_db); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function os(store, mode) { return open().then(function (db) { return db.transaction(store, mode).objectStore(store); }); }
  function rq(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); };
  var now = function () { return new Date().toISOString(); };
  function live(x) { return x && !x.deleted && !x.archived; }

  async function all(store, withHidden) {
    var o = await os(store, 'readonly');
    var list = (await rq(o.getAll())) || [];
    return withHidden ? list : list.filter(live);
  }
  async function get(store, id) { if (!id) return null; var o = await os(store, 'readonly'); return (await rq(o.get(id))) || null; }
  async function put(store, doc, keepStamp) {
    if (!doc.id) doc.id = uid();
    if (!keepStamp || !doc.updatedAt) doc.updatedAt = now();
    if (!doc.createdAt) doc.createdAt = doc.updatedAt;
    var o = await os(store, 'readwrite');
    await rq(o.put(doc));
    if (!keepStamp) changed(store, doc);
    return doc;
  }
  async function putMany(store, docs, keepStamp) {
    if (!docs.length) return 0;
    var db = await open();
    await new Promise(function (res, rej) {
      var tx = db.transaction(store, 'readwrite'), o = tx.objectStore(store);
      docs.forEach(function (d) { if (!d.id) d.id = uid(); if (!keepStamp || !d.updatedAt) d.updatedAt = now(); o.put(d); });
      tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
    });
    if (!keepStamp) changed(store, null);
    return docs.length;
  }
  async function del(store, id) {
    var d = await get(store, id); if (!d) return false;
    d.deleted = true; d.deletedAt = now();
    await put(store, d);
    return true;
  }
  async function restore(store, id) {
    var d = await get(store, id); if (!d) return false;
    delete d.deleted; delete d.deletedAt; delete d.archived; delete d.archivedAt;
    await put(store, d);
    return true;
  }
  function changed(store, doc) { subs.forEach(function (f) { try { f(store, doc); } catch (e) { } }); }
  function onChange(f) { subs.push(f); }

  /* ---- dosyalar (görsel, STL/3MF/G-code eki) ---- */
  async function putFile(blob, meta) {
    var d = Object.assign({ id: uid(), name: 'dosya', mime: blob.type || 'application/octet-stream', size: blob.size }, meta || {});
    d.data = blob;
    await put('files', d);
    return d;
  }
  async function getFile(id) { return id ? get('files', id) : null; }
  var urlCache = {};
  async function fileUrl(id) {
    if (!id) return '';
    if (urlCache[id]) return urlCache[id];
    var f = await getFile(id);
    if (!f || !f.data) return '';
    urlCache[id] = URL.createObjectURL(f.data);
    return urlCache[id];
  }

  /* ---- ayarlar (cihaza özel) ---- */
  var FACTORY = {
    id: 'settings',
    currency: 'USD', rateTry: 48.92, rateSyp: 122, autoRates: true, ratesAt: null, ratesSrc: '',
    kwhPrice: 0.12, laborRate: 5, margin: 40, roundTo: 0, failPct: 5,
    defPrinterId: null,
    lowWarn: true,
    gh: null,              // {owner, repo, token, branch} — kullanıcının KENDİ GitHub deposu
    lastSync: null, syncShas: {},
    wifiAuto: false,
    ai: { provider: 'gemini', key: '', model: '', onlineFirst: true },
    modules: null,         // [{id, name, hidden}] — kenar çubuğu
    autoUpdate: true,
    seeded: false
  };
  async function getSettings() { var s = await get('meta', 'settings'); return Object.assign({}, FACTORY, s || {}); }
  async function saveSettings(patch) {
    var cur = await getSettings();
    var next = Object.assign(cur, patch, { id: 'settings' });
    await put('meta', next);
    return next;
  }

  /* ---- yedek (JSON; görseller base64) ---- */
  function blobToB64(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.readAsDataURL(b); }); }
  async function b64ToBlob(u) { var r = await fetch(u); return r.blob(); }
  async function exportAll(withFiles) {
    var out = { app: '3d-maliyet-arsiv', version: window.APP_VERSION, exportedAt: now(), data: {} };
    for (var i = 0; i < STORES.length; i++) {
      var s = STORES[i], list = await all(s, true);
      if (s === 'files') {
        var arr = [];
        for (var j = 0; j < list.length; j++) {
          var f = Object.assign({}, list[j]);
          if (withFiles !== false && f.data) f.data = await blobToB64(f.data); else delete f.data;
          arr.push(f);
        }
        list = arr;
      }
      if (s === 'meta') list = list.map(function (m) { if (m.id !== 'settings') return m; var c = Object.assign({}, m); if (c.gh) c.gh = Object.assign({}, c.gh, { token: '' }); if (c.ai) c.ai = Object.assign({}, c.ai, { key: '' }); return c; });
      out.data[s] = list;
    }
    return out;
  }
  /* İçe aktarma birleştirir: yoksa eklenir, varsa yeni olan kalır (eskisi çakışma yedeğine). Hiçbir şey silinmez. */
  async function importAll(bundle) {
    if (!bundle || !bundle.data) throw new Error('bozuk yedek');
    var n = 0;
    for (var i = 0; i < STORES.length; i++) {
      var s = STORES[i], inc = bundle.data[s];
      if (!Array.isArray(inc) || s === 'meta') continue;
      for (var j = 0; j < inc.length; j++) {
        var d = inc[j]; if (!d || !d.id) continue;
        if (s === 'files' && typeof d.data === 'string') d.data = await b64ToBlob(d.data);
        var cur = await get(s, d.id);
        if (!cur) { await put(s, d, true); n++; continue; }
        if (String(d.updatedAt || '') > String(cur.updatedAt || '')) {
          await conflict(s, cur, d, 'yedek');
          if (s === 'files' && !d.data) d.data = cur.data;
          await put(s, d, true); n++;
        }
      }
    }
    return n;
  }
  async function conflict(store, lost, kept, source, kind) {
    var c = { id: uid(), store: store, recId: lost.id, tur: kind || 'cakisma', kaynak: source, zaman: now(), kaybeden: lost, kalan: kept ? { id: kept.id, updatedAt: kept.updatedAt } : null };
    if (store === 'files') { c.kaybeden = Object.assign({}, lost); delete c.kaybeden.data; }
    var o = await os('cakismalar', 'readwrite');
    await rq(o.put(c));
  }

  /* ---- seri numarası: M-00001, Y-00001, P-00001 (eşitlemede çakışmasın diye en büyük + 1) ---- */
  function nextSerial(prefix, list, field) {
    field = field || 'serial';
    var max = 0;
    list.forEach(function (x) { var m = new RegExp('^' + prefix + '-(\\d+)$').exec(String(x[field] || '')); if (m) max = Math.max(max, +m[1]); });
    return prefix + '-' + String(max + 1).padStart(5, '0');
  }

  window.DB = { open: open, all: all, get: get, put: put, putMany: putMany, del: del, restore: restore, onChange: onChange,
    putFile: putFile, getFile: getFile, fileUrl: fileUrl, getSettings: getSettings, saveSettings: saveSettings,
    exportAll: exportAll, importAll: importAll, conflict: conflict, nextSerial: nextSerial, blobToB64: blobToB64, b64ToBlob: b64ToBlob,
    uid: uid, now: now, live: live, STORES: STORES, SYNCED: SYNCED, FACTORY: FACTORY, NAME: DB_NAME };
})();
