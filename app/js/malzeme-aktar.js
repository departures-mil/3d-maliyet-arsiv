/* Malzeme içe aktarma: Falcon Ofis "Döküm al" CSV'si, bu programın kendi dökümü, ya da JSON.
   Sütunlar başlıktan tanınır (Türkçe / English / العربية). Kategori yolu ("Filament › PLA+") ve konum yoksa açılır.
   Birleştirme: aynı Seri No (yoksa aynı ad + marka + kategori) varsa kayıt güncellenir, adet farkı "sayım düzeltmesi"
   hareketi olarak yazılır; yoksa yeni malzeme açılır. Hiçbir kayıt silinmez, çift kayıt oluşmaz. Önce önizleme gösterilir. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  var COLS = {
    serial: ['seri no', 'seri', 'serial no', 'serial', 'الرقم التسلسلي', 'code', 'kod'],
    name: ['ad', 'adı', 'malzeme', 'name', 'الاسم', 'material'],
    brand: ['marka', 'brand', 'العلامة', 'العلامة التجارية', 'manufacturer'],
    color: ['renk', 'colour', 'color', 'اللون'],
    condition: ['durum', 'condition', 'الحالة', 'state'],
    category: ['kategori', 'category', 'الفئة'],
    location: ['konum', 'yer', 'location', 'place', 'الموقع', 'المكان'],
    qty: ['adet', 'miktar', 'qty', 'quantity', 'stock', 'الكمية', 'stok'],
    unit: ['birim', 'unit', 'الوحدة'],
    minQty: ['asgari adet', 'asgari', 'minimum qty', 'min qty', 'minimum', 'min', 'الحد الأدنى'],
    unitPrice: ['birim fiyat', 'fiyat', 'unit price', 'price', 'سعر الوحدة', 'السعر'],
    matType: ['tür', 'malzeme türü', 'type', 'material type', 'النوع'],
    note: ['not', 'açıklama', 'note', 'notes', 'ملاحظة'],
    weightG: ['makara ağırlığı', 'ağırlık', 'weight', 'spool weight', 'الوزن'],
    currency: ['para birimi', 'currency', 'العملة', 'döviz']
  };
  function norm(s) { return String(s == null ? '' : s).toLocaleLowerCase('tr').replace(/\(.*?\)/g, '').replace(/[*:]/g, '').replace(/\s+/g, ' ').trim(); }
  function colOf(h) {
    var n = norm(h);
    for (var k in COLS) if (COLS[k].indexOf(n) >= 0) return k;
    for (var k2 in COLS) if (COLS[k2].some(function (x) { return x.length > 3 && n.indexOf(x) === 0; })) return k2;
    return null;
  }

  /* CSV (virgül, noktalı virgül ya da sekme; tırnaklı alanlar) */
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var sep = [';', '\t', ','].sort(function (a, b) { return first.split(b).length - first.split(a).length; })[0];
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
      if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }

  /* renk: #hex ya da ad (Black, Siyah, أسود, Peach Pink…) → #hex */
  var NAMED = {
    black: '#111111', siyah: '#111111', 'أسود': '#111111', white: '#f5f5f5', beyaz: '#f5f5f5', 'أبيض': '#f5f5f5',
    'dark gray': '#4b5563', 'dark grey': '#4b5563', 'koyu gri': '#4b5563', gray: '#9ca3af', grey: '#9ca3af', gri: '#9ca3af', 'رمادي': '#9ca3af',
    silver: '#c0c0c0', gümüş: '#c0c0c0', 'فضي': '#c0c0c0', red: '#dc2626', kırmızı: '#dc2626', 'أحمر': '#dc2626',
    orange: '#f97316', turuncu: '#f97316', 'برتقالي': '#f97316', yellow: '#facc15', sarı: '#facc15', 'أصفر': '#facc15', gold: '#d4a017', altın: '#d4a017',
    green: '#16a34a', yeşil: '#16a34a', 'أخضر': '#16a34a', 'olive green': '#4f7a28', 'zeytin yeşili': '#4f7a28', olive: '#4f7a28',
    blue: '#2563eb', mavi: '#2563eb', 'أزرق': '#2563eb', 'sky blue': '#38bdf8', navy: '#1e3a8a', lacivert: '#1e3a8a',
    purple: '#7c3aed', mor: '#7c3aed', 'بنفسجي': '#7c3aed', pink: '#ec4899', pembe: '#ec4899', 'وردي': '#ec4899', 'peach pink': '#f8a5c2', peach: '#f6b48f',
    brown: '#7c4a1e', kahverengi: '#7c4a1e', 'بني': '#7c4a1e', beige: '#e8d9b5', bej: '#e8d9b5', 'بيج': '#e8d9b5', ivory: '#f3ecd8', cream: '#f3ead2', krem: '#f3ead2',
    transparent: 'transparent', clear: 'transparent', şeffaf: 'transparent', natural: '#efe6d2', doğal: '#efe6d2', 'skin': '#e8b996', ten: '#e8b996'
  };
  function colorOf(v, name) {
    var s = String(v || '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(s)) return s[0] === '#' ? s.toLowerCase() : '#' + s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) return s.toLowerCase();
    var k = norm(s || name);
    if (NAMED[k]) return NAMED[k];
    var hit = Object.keys(NAMED).sort(function (a, b) { return b.length - a.length; }).filter(function (x) { return (' ' + k + ' ').indexOf(' ' + x + ' ') >= 0; })[0];
    return hit ? NAMED[hit] : '';
  }
  function condOf(v) {
    var n = norm(v); if (!n) return '';
    if (/^(sıfır|sifir|yeni|new|جديد)/.test(n)) return 'new';
    if (/(kullan|used|açık|acik|مستعمل)/.test(n)) return 'used';
    return '';
  }
  function num(v) { var s = String(v == null ? '' : v).replace(/[^\d,.\-]/g, ''); if (/,\d{1,3}$/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.'); else s = s.replace(/,/g, ''); var n = parseFloat(s); return isFinite(n) ? n : null; }

  /* satırlar → ortak kayıt biçimi */
  function rowsToItems(rows) {
    if (rows.length < 2) return [];
    var head = rows[0].map(colOf);
    if (head.indexOf('name') < 0) return [];
    return rows.slice(1).map(function (r) {
      var o = {}; head.forEach(function (k, i) { if (k && o[k] == null) o[k] = r[i]; });
      return o;
    }).filter(function (o) { return String(o.name || '').trim(); });
  }
  function jsonToItems(data) {
    var list = Array.isArray(data) ? data : (data && (data.materials || data.malzemeler || (data.data && data.data.materials))) || [];
    return list.map(function (m) {
      var o = {};
      Object.keys(m || {}).forEach(function (k) { var c = COLS[k] ? k : colOf(k); if (c && o[c] == null) o[c] = m[k]; });
      if (m.categoryPath) o.category = m.categoryPath;
      if (o.qty == null && m.initialQty != null) o.qty = m.initialQty;
      if (m.colorDerivedFromName) delete o.color;
      if (Array.isArray(m.movements)) o.movements = m.movements;
      if (m.falconId != null) o.srcId = String(m.falconId);   /* yaklaşık renk: kendi renk adı tablomuz Falcon'daki aileyi verir */
      return o;
    }).filter(function (o) { return String(o.name || '').trim(); });
  }

  /* kategori yolu "Filament › PLA+" → kimlik (yoksa açar) */
  async function catId(path, made) {
    var parts = String(path || '').split(/\s*(?:›|>|\/|\\|»)\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!parts.length || /^(kategorisiz|uncategori[sz]ed|بلا فئة|—|-)$/i.test(parts[0])) return null;
    var parent = null;
    for (var i = 0; i < parts.length; i++) {
      var nm = parts[i];
      var hit = S.categories.filter(function (c) { return !c.deleted && (c.parentId || null) === parent && norm(c.name) === norm(nm); })[0];
      if (!hit) {
        hit = { name: nm, kind: 'material', parentId: parent, order: S.categories.filter(function (c) { return (c.parentId || null) === parent; }).length + 1 };
        hit = await DB.put('categories', hit); S.categories.push(hit); made.cats++;
      }
      parent = hit.id;
    }
    return parent;
  }
  async function locId(name, made) {
    var n = String(name || '').trim(); if (!n || n === '—' || n === '-') return null;
    var hit = S.locations.filter(function (l) { return !l.deleted && norm(l.name) === norm(n); })[0];
    if (!hit) { hit = await DB.put('locations', { name: n }); S.locations.push(hit); made.locs++; }
    return hit.id;
  }
  function findExisting(o, catIdV) {
    var ser = String(o.serial || '').trim();
    if (ser) { var a = S.materials.filter(function (m) { return !m.deleted && String(m.serial || '').trim().toUpperCase() === ser.toUpperCase(); })[0]; if (a) return a; }
    return S.materials.filter(function (m) { return !m.deleted && norm(m.name) === norm(o.name) && norm(m.brand) === norm(o.brand) && (m.categoryId || null) === (catIdV || null) && (!ser || !m.serial); })[0] || null;
  }

  /* önizleme: kaç yeni, kaç güncellenecek */
  function plan(items) {
    var nNew = 0, nUpd = 0;
    items.forEach(function (o) {
      var ser = String(o.serial || '').trim().toUpperCase();
      var ex = ser && S.materials.some(function (m) { return !m.deleted && String(m.serial || '').toUpperCase() === ser; });
      if (!ex) ex = S.materials.some(function (m) { return !m.deleted && norm(m.name) === norm(o.name) && norm(m.brand) === norm(o.brand) && norm(A.catPath(m.categoryId)) === norm(String(o.category || '').replace(/\s*(?:›|>|\/|»)\s*/g, ' › ')); });
      if (ex) nUpd++; else nNew++;
    });
    return { nNew: nNew, nUpd: nUpd };
  }

  function mvType(v) {
    var n = norm(v);
    if (/^(in|giriş|giris|stok girişi|إدخال|purchase|alış)/.test(n)) return 'in';
    if (/^(out|çıkış|cikis|stok çıkışı|إخراج|sale|satış)/.test(n)) return 'out';
    if (/^(use|kullanım|kullanim|consume)/.test(n)) return 'use';
    if (/^(adjust|düzeltme|sayım|correction|تصحيح)/.test(n)) return 'adjust';
    return 'info';
  }
  function dayOf(v) { var s = String(v || ''); var m = /^(\d{4}-\d{2}-\d{2})/.exec(s); return m ? m[1] : A.today(); }
  /* kaynak hareketleri (Falcon giriş/çıkış geçmişi) aynı kimlikle yazılır: ikinci aktarımda çoğalmaz */
  async function writeMoves(mat, o) {
    var list = o.movements || [];
    for (var j = 0; j < list.length; j++) {
      var v = list[j] || {}, ty = mvType(v.type || v.kind || v.direction || v.tur || v.tip);
      var q = num(v.qty != null ? v.qty : v.quantity != null ? v.quantity : v.adet != null ? v.adet : v.miktar);
      var key = v.id != null ? String(v.id) : (dayOf(v.date || v.createdAt) + '-' + ty + '-' + q + '-' + j);
      var cur = String(v.currency || '').trim().toUpperCase().replace('TL', 'TRY');
      var up = num(v.unitPrice != null ? v.unitPrice : v.price);
      await DB.put('movements', { id: 'imp-' + (o.srcId || mat.serial || mat.id) + '-' + key.replace(/[^A-Za-z0-9_-]/g, ''), materialId: mat.id, type: ty, qty: Math.abs(q || 0) * (ty === 'adjust' && q < 0 ? -1 : 1),
        date: dayOf(v.date || v.createdAt), party: v.party || v.from || v.to || v.kimden || v.kime || '', note: v.note || v.aciklama || t('mi.note'),
        unitPrice: up && up > 0 ? (cur && cur !== 'USD' && CALC.CUR[cur] ? CALC.toUsd(up, cur, S.settings) : up) : undefined });
    }
  }

  async function apply(items) {
    var made = { added: 0, updated: 0, cats: 0, locs: 0 }, pend = [];
    for (var i = 0; i < items.length; i++) {
      var o = items[i], cid = await catId(o.category, made), lid = await locId(o.location, made);
      var ex = findExisting(o, cid);
      var type = String(o.matType || '').trim() || (o.category ? String(o.category).split(/\s*(?:›|>|\/|»)\s*/).pop() : '');
      if (/^(filament|kategorisiz)$/i.test(type)) type = '';
      var d = ex ? Object.assign({}, ex) : { condition: 'new', unit: t('u.pcs'), weightG: 1000, diameter: 1.75 };
      d.name = String(o.name).trim();
      if (o.brand != null && String(o.brand).trim()) d.brand = String(o.brand).trim();
      var col = colorOf(o.color, o.name); if (col) d.color = col;
      var cd = condOf(o.condition); if (cd) d.condition = cd;
      d.categoryId = cid != null ? cid : (ex ? ex.categoryId : null);
      if (lid) d.locationId = lid;
      var un = String(o.unit || '').trim(); if (/^(pcs|pc|piece|pieces|adet|قطعة)$/i.test(un)) un = t('u.pcs'); if (un) d.unit = un;
      if (num(o.minQty) != null) d.minQty = num(o.minQty);
      var cur = String(o.currency || '').trim().toUpperCase().replace('TL', 'TRY').replace('₺', 'TRY').replace('$', 'USD');
      if (num(o.unitPrice) != null && num(o.unitPrice) > 0) d.unitPrice = cur && cur !== 'USD' && CALC.CUR[cur] ? CALC.toUsd(num(o.unitPrice), cur, S.settings) : num(o.unitPrice);
      if (num(o.weightG) != null && num(o.weightG) > 0) d.weightG = num(o.weightG);
      if (type) d.matType = type;
      if (o.note && String(o.note).trim() && norm(o.note) !== norm(o.brand)) d.note = String(o.note).trim();
      var ser = String(o.serial || '').trim();
      if (ser && !S.materials.some(function (m) { return m.id !== d.id && !m.deleted && String(m.serial || '').toUpperCase() === ser.toUpperCase(); })) d.serial = ser;
      else if (!d.serial) d.serial = DB.nextSerial('M', S.materials);
      var q = num(o.qty), hasMv = Array.isArray(o.movements) && o.movements.length > 0;
      if (hasMv) {
        if (!ex) d.initialQty = 0;
        var mt = await DB.put('materials', d);
        if (ex) { S.materials[S.materials.indexOf(ex)] = mt; made.updated++; } else { S.materials.push(mt); made.added++; }
        await writeMoves(mt, o);
        pend.push({ id: mt.id, q: q });
        continue;
      }
      if (ex) {
        var saved = await DB.put('materials', d); S.materials[S.materials.indexOf(ex)] = saved; made.updated++;
        if (q != null) { var diff = q - A.stockOf(ex.id); if (Math.abs(diff) > 1e-9) await DB.put('movements', { materialId: ex.id, type: 'adjust', qty: diff, date: A.today(), note: t('mi.note') }); }
      } else {
        d.initialQty = q != null ? q : 1;
        var nw = await DB.put('materials', d); S.materials.push(nw); made.added++;
        await DB.put('movements', { materialId: nw.id, type: 'info', qty: 0, date: A.today(), note: t('mi.note') });
      }
    }
    await A.reload();
    /* hareketlerle gelen kayıtlar: kaynaktaki stokla fark kalırsa sayım düzeltmesi */
    if (pend.length) {
      for (var k = 0; k < pend.length; k++) { var pq = pend[k]; if (pq.q == null) continue; var df = pq.q - A.stockOf(pq.id); if (Math.abs(df) > 1e-9) await DB.put('movements', { id: 'imp-fix-' + pq.id, materialId: pq.id, type: 'adjust', qty: df, date: A.today(), note: t('m.adjustNote') }); }
      await A.reload();
    }
    return made;
  }
  /* Falcon'dan gelince: hiç kullanılmamış örnek kategoriler (Reçine, Sarf, Yedek parça) kaldırılır, ağaç Falcon'daki gibi olur */
  async function tidySeed() {
    var ids = ['cat-resin', 'cat-parts', 'cat-consum'];
    for (var i = 0; i < ids.length; i++) {
      var c = A.byId(S.categories, ids[i]);
      if (c && !c.deleted && !S.materials.some(function (m) { return m.categoryId === c.id; }) && !S.categories.some(function (x) { return x.parentId === c.id && !x.deleted; })) await DB.del('categories', c.id);
    }
    await A.reload();
  }

  async function readFile(f) {
    var text = await f.text();
    if (/\.json$/i.test(f.name) || /^\s*[\[{]/.test(text)) { try { return jsonToItems(JSON.parse(text)); } catch (e) { } }
    return rowsToItems(parseCsv(text));
  }

  async function open() {
    var files = await A.pickFiles('.csv,.tsv,.txt,.json,text/csv,application/json', false);
    if (!files.length) return;
    var items = [];
    try { items = await readFile(files[0]); } catch (e) { }
    if (!items.length) { A.toast(t('mi.none'), 'bad'); return; }
    var p = plan(items);
    var body = ui.el('div');
    body.appendChild(ui.el('p', { text: t('mi.summary', { n: items.length, a: p.nNew, u: p.nUpd }) }));
    var tbl = '<div class="tablewrap" style="max-height:50vh"><table class="tbl compact"><thead><tr><th>' + esc(t('m.col.serial')) + '</th><th>' + esc(t('m.col.name')) + '</th><th>' + esc(t('m.col.category')) + '</th><th>' + esc(t('m.col.location')) + '</th><th class="r">' + esc(t('m.col.qty')) + '</th></tr></thead><tbody>' +
      items.map(function (o) { var c = colorOf(o.color, o.name); return '<tr><td class="mono">' + esc(o.serial || '') + '</td><td>' + (c ? '<span class="dot" style="background:' + esc(c) + '"></span> ' : '') + '<b>' + esc(o.name) + '</b> <small class="muted">' + esc(o.brand || '') + '</small></td><td>' + esc(o.category || '') + '</td><td>' + esc(o.location || '') + '</td><td class="r">' + esc(o.qty == null ? '' : o.qty) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    body.appendChild(ui.el('div', { html: tbl }));
    body.appendChild(ui.el('p.muted.small', { text: t('mi.safe') }));
    ui.modal({ title: t('mi.title'), icon: 'download', cls: 'wide', body: body, buttons: [
      { label: t('a.cancel'), cls: 'ghost' }, 'spacer',
      { label: t('mi.go'), icon: 'check', cls: 'primary', onClick: function (close, btn) {
        if (btn) btn.disabled = true;
        apply(items).then(function (r) { close(); A.toast(t('mi.done', { a: r.added, u: r.updated, c: r.cats, l: r.locs }), 'ok'); A.render(); })
          .catch(function (e) { if (btn) btn.disabled = false; A.toast(String(e && e.message || e), 'bad'); });
        return false;
      } }
    ] });
  }

  /* açılışta gelen kutusu: <veri>\ice-aktar\*.json (kabuk) → sessizce birleştir, dosyayı "işlenen"e taşı */
  async function take(veri, name) {
    var items = jsonToItems(veri);
    if (!items.length) return false;
    var m = await apply(items);
    if (/falcon/i.test(String(name || '')) || /falcon/i.test(String((veri && (veri.source || veri.kaynak)) || ''))) await tidySeed();
    A.toast(t('mi.done', { a: m.added, u: m.updated, c: m.cats, l: m.locs }), 'ok');
    return true;
  }
  async function inbox() {
    if (!window.MA3D_KABUK) return;
    var any = false;
    try {
      var r = await fetch('/__shell/ice-aktar');
      if (r.ok) {
        var list = (await r.json()).dosyalar || [];
        for (var i = 0; i < list.length; i++) {
          if (await take(list[i].veri, list[i].ad)) any = true;
          await fetch('/__shell/ice-aktar/bitti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad: list[i].ad }) });
        }
      }
    } catch (e) { }
    /* eski kabuklar (ice-aktar ucu yok): aynı dosya Wi‑Fi gelen kutusuna (veri\wifi-gelen) konabilir */
    try {
      var g = await fetch('/__shell/lan/gelen');
      if (g.ok) {
        var gl = await g.json();
        for (var j = 0; j < gl.length; j++) {
          var msg = await (await fetch('/__shell/lan/gelen-oku?dosya=' + encodeURIComponent(gl[j].dosya))).json();
          if (!msg || msg.data || !(msg.materials || msg.malzemeler)) continue;
          if (await take(msg, gl[j].dosya)) any = true;
          await fetch('/__shell/lan/gelen-sil?dosya=' + encodeURIComponent(gl[j].dosya), { method: 'POST', body: '' });
        }
      }
    } catch (e) { }
    if (any) A.render();
  }

  A.matImport = { inbox: inbox, take: take, open: open, _parseCsv: parseCsv, _rowsToItems: rowsToItems, _jsonToItems: jsonToItems, _colorOf: colorOf, _condOf: condOf, _num: num, _apply: apply };
})();
