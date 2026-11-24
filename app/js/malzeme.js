/* MALZEMELER — Falcon Ofis "Malzemeler" düzeni: kategori ağacı (sayılı), arama, sıralama, yer süzgeci, "sadece azalanlar",
   renk çipleri, Yerler · Döküm al · QR etiket · Yeni malzeme; tablo: Ad (renk noktası, marka, Sıfır/Kullanılmış),
   Kategori, Seri No (M-xxxxx), Konum, Adet (+ birim fiyat), Asgari adet; satır: Giriş · Çıkış · QR · Geçmiş · Düzenle · Sil.
   Filament makaraları: ağırlık (g) girilirse baskıda kullanılan gram makara adedinden düşülür (1,43 adet ≈ 1430 g). */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;
  var F = { cat: 'all', q: '', sort: 'name', dir: 1, loc: '', low: false, color: '' };

  function unitName(m) { return m.unit || t('u.pcs'); }
  function catCount(id) {
    var ids = descendants(id);
    return S.materials.filter(function (m) { return ids.indexOf(m.categoryId) >= 0; }).length;
  }
  function descendants(id) {
    var out = [id], i = 0;
    while (i < out.length) { var cur = out[i++]; S.categories.forEach(function (c) { if (c.kind === 'material' && c.parentId === cur && out.indexOf(c.id) < 0) out.push(c.id); }); }
    return out;
  }
  function cats() { return S.categories.filter(function (c) { return c.kind === 'material'; }).sort(A.byName); }

  function filtered() {
    var q = F.q.trim().toLocaleLowerCase(FC.i18n.locale());
    var allowed = F.cat === 'all' ? null : F.cat === 'none' ? [] : descendants(F.cat);
    var list = S.materials.filter(function (m) {
      if (F.cat === 'none' && m.categoryId && A.byId(S.categories, m.categoryId)) return false;
      if (allowed && allowed.length && allowed.indexOf(m.categoryId) < 0) return false;
      if (F.loc && m.locationId !== F.loc) return false;
      if (F.low && !A.isLow(m)) return false;
      if (F.color && A.colorFamily(m.color) !== F.color) return false;
      if (q) {
        var hay = [m.name, m.brand, m.serial, m.note, m.matType, A.catPath(m.categoryId), A.nameOf(S.locations, m.locationId, '')].join(' ').toLocaleLowerCase(FC.i18n.locale());
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = {
      name: function (m) { return String(m.name || '').toLocaleLowerCase(); },
      qty: function (m) { return A.stockOf(m.id); },
      serial: function (m) { return m.serial || ''; },
      category: function (m) { return A.catPath(m.categoryId) + ' ' + (m.name || ''); },
      newest: function (m) { return m.createdAt || ''; },
      color: function (m) { return A.FAMILY_ORDER.indexOf(A.colorFamily(m.color)) * 1000 + (m.name ? m.name.charCodeAt(0) : 0); },
      price: function (m) { return CALC.num(m.unitPrice); },
      location: function (m) { return A.nameOf(S.locations, m.locationId, ''); }
    }[F.sort] || function (m) { return m.name; };
    list.sort(function (a, b) {
      var x = key(a), y = key(b);
      var r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), FC.i18n.locale(), { numeric: true });
      if (!r) r = String(a.name || '').localeCompare(String(b.name || ''));
      return r * F.dir;
    });
    return list;
  }

  /* ---------------- ekran ---------------- */
  function render(host) {
    var list = filtered();
    var wrap = ui.el('div.mat-layout');
    /* kategori ağacı */
    var side = ui.el('aside.card.mat-cats');
    side.innerHTML = '<div class="mat-cats-head"><span>' + A.icon('layers') + esc(t('m.categories')) + '</span>' + A.iconBtn('plus', t('m.addCategory'), 'add-cat') + '</div>';
    var tree = ui.el('div.cat-tree');
    function item(id, label, count, depth, isCat) {
      var b = ui.el('div.cat-item' + (F.cat === id ? '.active' : ''), { style: '--d:' + depth, 'data-cat': id });
      b.innerHTML = '<button type="button" class="cat-btn">' + A.icon(id === 'all' ? 'layers' : 'folder') + '<span>' + esc(label) + '</span><em>' + count + '</em></button>' +
        (isCat ? '<span class="cat-acts">' + A.iconBtn('plus', t('m.addSub'), 'sub') + A.iconBtn('edit', t('a.rename'), 'ren') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</span>' : '');
      b.querySelector('.cat-btn').onclick = function () { F.cat = id; A.render(); };
      if (isCat) {
        b.querySelector('.sub').onclick = function () { catForm(null, id); };
        b.querySelector('.ren').onclick = function () { catForm(A.byId(S.categories, id)); };
        b.querySelector('.del').onclick = function () { delCat(id); };
      }
      tree.appendChild(b);
    }
    item('all', t('m.all'), S.materials.length, 0, false);
    function walk(parent, depth) {
      cats().filter(function (c) { return (c.parentId || null) === parent; }).forEach(function (c) {
        item(c.id, c.name, catCount(c.id), depth, true);
        walk(c.id, depth + 1);
      });
    }
    walk(null, 0);
    var orphan = S.materials.filter(function (m) { return !m.categoryId || !A.byId(S.categories, m.categoryId); }).length;
    item('none', t('m.uncategorized'), orphan, 0, false);
    side.appendChild(tree);
    var addBtn = ui.el('button.btn.small.wide-btn', { type: 'button', html: A.icon('folder') + esc(t('m.addCategory')), onclick: function () { catForm(null, null); } });
    side.appendChild(addBtn);
    side.querySelector('.add-cat').onclick = function () { catForm(null, null); };
    wrap.appendChild(side);

    /* sağ: araç çubuğu + renk çipleri + tablo */
    var main = ui.el('div.mat-main');
    var tb = ui.el('div.toolbar');
    tb.innerHTML =
      '<label class="search">' + A.icon('search') + '<input type="search" id="mQ" placeholder="' + esc(t('a.search')) + '" value="' + esc(F.q) + '"></label>' +
      '<button type="button" class="icon-btn" id="mDir" title="' + esc(t('m.sortDir')) + '">' + A.icon('sort') + '</button>' +
      '<select id="mSort">' + ['name', 'qty', 'serial', 'category', 'location', 'color', 'price', 'newest'].map(function (k) { return '<option value="' + k + '"' + (F.sort === k ? ' selected' : '') + '>' + esc(t('m.sort.' + k)) + '</option>'; }).join('') + '</select>' +
      '<span class="tb-ic">' + A.icon('pin') + '</span><select id="mLoc">' + A.opts(S.locations.slice().sort(A.byName), F.loc, t('m.allLocations')) + '</select>' +
      '<label class="check"><input type="checkbox" id="mLow"' + (F.low ? ' checked' : '') + '><span>' + esc(t('m.lowOnly')) + '</span></label>' +
      '<span class="fc-spacer"></span>' +
      '<button type="button" class="btn small" id="mLocs">' + A.icon('pin') + esc(t('m.locations')) + '</button>' +
      '<button type="button" class="btn small" id="mDump">' + A.icon('file') + esc(t('m.dump')) + '</button>' +
      '<button type="button" class="btn small" id="mQr">' + A.icon('qr') + esc(t('m.qrLabel')) + '</button>' +
      '<button type="button" class="btn small primary" id="mNew">' + A.icon('plus') + esc(t('m.new')) + '</button>';
    main.appendChild(tb);

    var fams = {};
    S.materials.forEach(function (m) { var f = A.colorFamily(m.color); if (f !== 'none') fams[f] = (fams[f] || 0) + 1; });
    var chips = ui.el('div.chips');
    chips.innerHTML = '<span class="chips-l">' + esc(t('m.color')) + ':</span><button type="button" class="chip' + (!F.color ? ' active' : '') + '" data-c="">' + esc(t('m.allColors')) + '</button>' +
      A.FAMILY_ORDER.filter(function (f) { return fams[f]; }).map(function (f) {
        return '<button type="button" class="chip' + (F.color === f ? ' active' : '') + '" data-c="' + f + '"><i class="dot" style="background:' + A.FAMILY_DOT[f] + '"></i>' + esc(t('col.' + f)) + ' <em>' + fams[f] + '</em></button>';
      }).join('');
    main.appendChild(chips);

    var card = ui.el('div.card.table-card');
    if (!list.length) card.innerHTML = '<div class="empty">' + A.icon('spool') + '<p>' + esc(S.materials.length ? t('a.noMatch') : t('m.empty')) + '</p></div>';
    else {
      var rows = list.map(function (m) {
        var q = A.stockOf(m.id), low = A.isLow(m), w = CALC.pos(m.weightG);
        var qtyTxt = A.num(q, q % 1 ? 2 : 0) + ' ' + esc(unitName(m));
        var sub = [];
        if (w && q > 0) sub.push('≈ ' + A.num(q * w, 0) + ' g');
        if (CALC.pos(m.unitPrice)) sub.push(esc(A.money(m.unitPrice)) + ' / ' + esc(unitName(m)));
        var dot = m.color ? '<i class="dot" style="background:' + esc(m.color) + '"></i>' : '';
        return '<tr data-id="' + esc(m.id) + '"' + (low ? ' class="low"' : '') + '>' +
          '<td><div class="namecell"><span class="thumb">' + (m.photoId ? '<img data-thumb="' + esc(m.photoId) + '" alt="">' : A.icon('image')) + '</span><div>' +
          '<b>' + dot + esc(m.name || '—') + '</b><small>' + esc(m.brand || '') + (m.condition ? ' <span class="badge ' + (m.condition === 'used' ? 'warn' : 'ok') + '">' + esc(t(m.condition === 'used' ? 'm.used' : 'm.new0')) + '</span>' : '') + '</small></div></div></td>' +
          '<td class="muted">' + esc(A.catPath(m.categoryId) || '—') + '</td>' +
          '<td class="mono">' + esc(m.serial || '') + '</td>' +
          '<td>' + esc(A.nameOf(S.locations, m.locationId, '—')) + '</td>' +
          '<td class="r"><b' + (low ? ' class="lowtxt"' : '') + '>' + qtyTxt + '</b>' + (sub.length ? '<small>' + sub.join(' · ') + '</small>' : '') + '</td>' +
          '<td class="r">' + A.num(m.minQty || 0, 0) + '</td>' +
          '<td class="acts"><button type="button" class="btn small success in">' + A.icon('arrowIn') + esc(t('m.in')) + '</button>' +
          '<button type="button" class="btn small danger-soft out">' + A.icon('arrowOut') + esc(t('m.out')) + '</button>' +
          A.iconBtn('qr', t('m.qr'), 'qr') + A.iconBtn('history', t('m.history'), 'hist') + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>';
      }).join('');
      card.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>' + esc(t('m.col.name')) + '</th><th>' + esc(t('m.col.category')) + '</th><th>' + esc(t('m.col.serial')) +
        '</th><th>' + esc(t('m.col.location')) + '</th><th class="r">' + esc(t('m.col.qty')) + '</th><th class="r">' + esc(t('m.col.min')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="table-foot">' + esc(t('m.foot', { n: list.length, v: A.money(list.reduce(function (s, m) { return s + Math.max(0, A.stockOf(m.id)) * CALC.num(m.unitPrice); }, 0)) })) + '</div>';
    }
    main.appendChild(card);
    wrap.appendChild(main);
    host.appendChild(wrap);

    /* olaylar */
    var qi = host.querySelector('#mQ'), tmr = null;
    qi.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { F.q = qi.value; A.render().then(function () { var e = document.getElementById('mQ'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }); }, 200); };
    host.querySelector('#mDir').onclick = function () { F.dir = -F.dir; A.render(); };
    host.querySelector('#mSort').onchange = function (e) { F.sort = e.target.value; A.render(); };
    host.querySelector('#mLoc').onchange = function (e) { F.loc = e.target.value; A.render(); };
    host.querySelector('#mLow').onchange = function (e) { F.low = e.target.checked; A.render(); };
    host.querySelector('#mLocs').onclick = locationsDialog;
    host.querySelector('#mDump').onclick = function () { dump(list); };
    host.querySelector('#mQr').onclick = function () { qrLabels(list); };
    host.querySelector('#mNew').onclick = function () { materialForm(null); };
    A.$$('.chip', chips).forEach(function (c) { c.onclick = function () { F.color = c.getAttribute('data-c'); A.render(); }; });
    A.$$('tbody tr', card).forEach(function (tr) {
      var m = A.byId(S.materials, tr.getAttribute('data-id'));
      tr.querySelector('.in').onclick = function () { moveForm(m, 'in'); };
      tr.querySelector('.out').onclick = function () { moveForm(m, 'out'); };
      tr.querySelector('.qr').onclick = function () { qrLabels([m]); };
      tr.querySelector('.hist').onclick = function () { history(m); };
      tr.querySelector('.edit').onclick = function () { materialForm(m); };
      tr.querySelector('.del').onclick = function () { A.confirmBox(t('m.confirmDelete'), async function () { await DB.del('materials', m.id); await A.reload(); A.render(); }); };
      tr.querySelector('.namecell').onclick = function () { materialForm(m); };
    });
  }

  /* ---------------- kategoriler ---------------- */
  function catForm(cat, parentId) {
    var all = cats();
    var bad = cat ? descendants(cat.id) : [];
    A.formModal({ title: cat ? t('m.editCategory') : (parentId ? t('m.addSub') : t('m.addCategory')), icon: 'folder', cols: 1, fields: [
      { k: 'name', label: t('m.categoryName'), value: cat ? cat.name : '', req: true },
      { k: 'parentId', label: t('m.parent'), type: 'select', value: cat ? cat.parentId || '' : parentId || '', options: [{ v: '', l: t('m.noParent') }].concat(all.filter(function (c) { return bad.indexOf(c.id) < 0; }).map(function (c) { return { v: c.id, l: A.catPath(c.id) }; })) }
    ], onSave: async function (v) {
      var d = cat ? Object.assign({}, cat) : { kind: 'material' };
      d.name = v.name; d.parentId = v.parentId || null;
      await DB.put('categories', d); await A.reload(); A.render();
    } });
  }
  function delCat(id) {
    var c = A.byId(S.categories, id); if (!c) return;
    A.confirmBox(t('m.confirmDeleteCategory', { n: c.name }), async function () {
      // alt kategoriler bir üste, malzemeler üst kategoriye taşınır — hiçbir malzeme silinmez
      for (var i = 0; i < S.categories.length; i++) { var x = S.categories[i]; if (x.parentId === id) { x.parentId = c.parentId || null; await DB.put('categories', x); } }
      for (var j = 0; j < S.materials.length; j++) { var m = S.materials[j]; if (m.categoryId === id) { m.categoryId = c.parentId || null; await DB.put('materials', m); } }
      await DB.del('categories', id);
      if (F.cat === id) F.cat = 'all';
      await A.reload(); A.render();
    });
  }

  /* ---------------- yerler ---------------- */
  function locationsDialog() {
    var body = ui.el('div');
    function draw() {
      body.innerHTML = '';
      var ul = ui.el('ul.fc-list.edit-list');
      S.locations.slice().sort(A.byName).forEach(function (l) {
        var n = S.materials.filter(function (m) { return m.locationId === l.id; }).length;
        var li = ui.el('li', null, [ui.el('div', { html: A.icon('pin') + ' <b>' + esc(l.name) + '</b> <span class="muted">' + esc(t('m.itemsN', { n: n })) + '</span>' + (l.note ? '<div class="field-hint">' + esc(l.note) + '</div>' : '') })]);
        var acts = ui.el('div.row-acts', { html: A.iconBtn('edit', t('a.rename'), 'ren') + A.iconBtn('trash', t('a.delete'), 'del danger') });
        acts.querySelector('.ren').onclick = function () { locForm(l, draw); };
        acts.querySelector('.del').onclick = function () {
          A.confirmBox(t('m.confirmDeleteLocation', { n: l.name }), async function () {
            for (var i = 0; i < S.materials.length; i++) if (S.materials[i].locationId === l.id) { S.materials[i].locationId = null; await DB.put('materials', S.materials[i]); }
            for (var k = 0; k < S.printers.length; k++) if (S.printers[k].locationId === l.id) { S.printers[k].locationId = null; await DB.put('printers', S.printers[k]); }
            await DB.del('locations', l.id); await A.reload(); draw(); A.render();
          });
        };
        li.appendChild(acts); ul.appendChild(li);
      });
      if (!S.locations.length) body.appendChild(ui.el('p.muted', { text: t('m.noLocations') }));
      body.appendChild(ul);
    }
    draw();
    ui.modal({ title: t('m.locations'), icon: 'pin', body: body, buttons: [
      { label: t('m.newLocation'), icon: 'plus', onClick: function () { locForm(null, draw); return false; } }, 'spacer', { label: t('a.close'), cls: 'primary', onClick: function () { A.render(); } }] });
  }
  function locForm(l, after) {
    A.formModal({ title: l ? t('a.edit') : t('m.newLocation'), icon: 'pin', cols: 1, fields: [
      { k: 'name', label: t('a.name'), value: l ? l.name : '', req: true }, { k: 'note', label: t('a.note'), value: l ? l.note : '' }
    ], onSave: async function (v) { var d = l ? Object.assign({}, l) : {}; d.name = v.name; d.note = v.note; await DB.put('locations', d); await A.reload(); if (after) after(); } });
  }

  /* ---------------- malzeme formu ---------------- */
  var COLOR_PRESETS = [['Black', '#111111'], ['White', '#f5f5f5'], ['Grey', '#8a8f98'], ['Silver', '#c0c4cc'], ['Red', '#d62828'], ['Orange', '#f77f00'], ['Yellow', '#fcbf49'],
    ['Green', '#2a9d3f'], ['Blue', '#1d4ed8'], ['Purple', '#7b2cbf'], ['Pink', '#ff70a6'], ['Brown', '#7f4f24'], ['Beige', '#e9d8a6'], ['Transparent', 'transparent']];
  function materialForm(m) {
    var isNew = !m;
    m = m || { condition: 'new', unit: t('u.pcs'), categoryId: (F.cat !== 'all' && F.cat !== 'none') ? F.cat : null, locationId: F.loc || null, weightG: 1000, diameter: 1.75 };
    var brands = {}; S.materials.forEach(function (x) { if (x.brand) brands[x.brand] = 1; });
    var units = {}; [t('u.pcs'), 'kg', 'g', 'm', 'L', 'ml', t('u.pack'), t('u.box')].concat(A.listOf('unit').map(function (x) { return x.name; })).forEach(function (u) { units[u] = 1; });
    S.materials.forEach(function (x) { if (x.unit) units[x.unit] = 1; });
    var dl = '<datalist id="dlBrands">' + Object.keys(brands).sort().map(function (b) { return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dlUnits">' + Object.keys(units).map(function (b) { return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dlTypes">' + ['PLA', 'PLA+', 'HYPER PLA', 'PETG', 'ABS', 'ASA', 'ASA+', 'TPU', 'PA', 'PA-CF', 'PC', 'PETG-CF', 'PLA-CF', 'Resin'].map(function (b) { return '<option value="' + b + '">'; }).join('') + '</datalist>';
    var cur = S.settings.currency;
    var colorHtml = '<div class="field wide"><span class="field-label">' + esc(t('m.color')) + '</span><div class="color-row">' +
      '<input type="color" id="fmColor" value="' + esc(/^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : '#888888') + '">' +
      '<input type="text" id="fmColorHex" value="' + esc(m.color || '') + '" placeholder="#rrggbb" class="mono" style="max-width:120px">' +
      COLOR_PRESETS.map(function (c) { return '<button type="button" class="swatch" data-n="' + c[0] + '" data-c="' + c[1] + '" title="' + c[0] + '" style="background:' + (c[1] === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 50%/8px 8px' : c[1]) + '"></button>'; }).join('') +
      '</div></div>' + dl;
    var photoHtml = '<div class="field wide"><span class="field-label">' + esc(t('a.photo')) + '</span><div class="photo-pick" id="fmPhoto">' +
      (m.photoId ? '<img data-thumb="' + esc(m.photoId) + '" alt="">' : A.icon('image')) + '<span>' + esc(t('a.photoHint')) + '</span></div></div>';
    var photoId = m.photoId || null;
    var fields = [
      { k: 'name', label: t('m.f.name'), value: m.name, req: true, placeholder: 'Black, Silk Gold…' },
      { k: 'brand', label: t('m.f.brand'), value: m.brand, list: 'dlBrands', placeholder: 'eSUN, Creality, ELAS…' },
      { type: 'html', html: colorHtml },
      { k: 'condition', label: t('m.f.condition'), type: 'select', value: m.condition || 'new', options: [{ v: 'new', l: t('m.new0') }, { v: 'used', l: t('m.used') }, { v: '', l: '—' }] },
      { k: 'categoryId', label: t('m.col.category'), type: 'select', value: m.categoryId || '', options: [{ v: '', l: t('m.uncategorized') }].concat(cats().map(function (c) { return { v: c.id, l: A.catPath(c.id) }; })) },
      { k: 'serial', label: t('m.col.serial'), value: m.serial || DB.nextSerial('M', S.materials), hint: t('m.f.serialHint') },
      { k: 'locationId', label: t('m.col.location'), type: 'select', value: m.locationId || '', options: [{ v: '', l: '—' }].concat(S.locations.slice().sort(A.byName).map(function (l) { return { v: l.id, l: l.name }; })) },
      { k: 'unit', label: t('m.f.unit'), value: m.unit || t('u.pcs'), list: 'dlUnits' },
      { k: 'qty', label: isNew ? t('m.f.initialQty') : t('m.f.qtyNow'), type: 'number', value: isNew ? 1 : A.stockOf(m.id), hint: isNew ? '' : t('m.f.qtyHint') },
      { k: 'minQty', label: t('m.col.min'), type: 'number', value: m.minQty || 0, hint: t('m.f.minHint') },
      { k: 'unitPrice', label: t('m.f.unitPrice', { c: cur }), type: 'number', value: m.unitPrice ? +CALC.convert(m.unitPrice, cur, S.settings).toFixed(4) : '' },
      { type: 'section', label: t('m.f.filament') },
      { k: 'matType', label: t('m.f.type'), value: m.matType || '', list: 'dlTypes', placeholder: 'PLA, PETG, ABS…' },
      { k: 'weightG', label: t('m.f.weight'), type: 'number', value: m.weightG || '', hint: t('m.f.weightHint') },
      { k: 'diameter', label: t('m.f.diameter'), type: 'number', value: m.diameter || '' },
      { k: 'density', label: t('m.f.density'), type: 'number', value: m.density || '', hint: t('m.f.densityHint') },
      { k: 'nozzleTemp', label: t('m.f.nozzleTemp'), type: 'number', value: m.nozzleTemp || '' },
      { k: 'bedTemp', label: t('m.f.bedTemp'), type: 'number', value: m.bedTemp || '' },
      { type: 'html', html: photoHtml },
      { k: 'note', label: t('a.note'), type: 'textarea', value: m.note || '', wide: true }
    ].concat(A.fields.formFields('material', m));
    var md = A.formModal({ title: isNew ? t('m.new') : t('m.edit'), icon: 'spool', wide: true, fields: fields, onSave: async function (v) {
      var d = isNew ? {} : Object.assign({}, m);
      ['name', 'brand', 'condition', 'serial', 'unit', 'matType', 'note'].forEach(function (k) { d[k] = v[k]; });
      d.categoryId = v.categoryId || null; d.locationId = v.locationId || null;
      d.minQty = CALC.num(v.minQty); d.weightG = CALC.pos(v.weightG) || null; d.diameter = CALC.pos(v.diameter) || null; d.density = CALC.pos(v.density) || null;
      d.nozzleTemp = CALC.pos(v.nozzleTemp) || null; d.bedTemp = CALC.pos(v.bedTemp) || null;
      d.unitPrice = v.unitPrice === '' ? 0 : CALC.toUsd(CALC.num(v.unitPrice), cur, S.settings);
      d.color = md.el.querySelector('#fmColorHex').value.trim() || null;
      d.photoId = photoId;
      d.custom = Object.assign({}, d.custom || {}, A.fields.read('material', v));
      if (isNew) d.initialQty = CALC.num(v.qty);
      if (S.materials.some(function (x) { return x.id !== d.id && x.serial && x.serial === d.serial; })) { A.toast(t('m.serialTaken'), 'bad'); return false; }
      await DB.put('materials', d);
      if (!isNew) {
        var diff = CALC.num(v.qty) - A.stockOf(m.id);
        if (Math.abs(diff) > 1e-9) await DB.put('movements', { materialId: d.id, type: 'adjust', qty: diff, date: A.today(), note: t('m.adjustNote') });
      } else if (CALC.num(v.qty) > 0) {
        await DB.put('movements', { materialId: d.id, type: 'info', qty: 0, date: A.today(), note: t('m.createdNote', { n: A.num(v.qty, 2) }) });
      }
      await A.reload(); A.render(); A.toast(t('a.saved'), 'good');
    } });
    var cp = md.el.querySelector('#fmColor'), hx = md.el.querySelector('#fmColorHex'), nm = md.inputs.name;
    cp.oninput = function () { hx.value = cp.value; };
    hx.oninput = function () { if (/^#[0-9a-f]{6}$/i.test(hx.value.trim())) cp.value = hx.value.trim(); };
    A.$$('.swatch', md.el).forEach(function (s) { s.onclick = function () { hx.value = s.getAttribute('data-c'); if (/^#/.test(hx.value)) cp.value = hx.value; if (!nm.value.trim()) nm.value = s.getAttribute('data-n'); }; });
    var ph = md.el.querySelector('#fmPhoto');
    ph.onclick = async function () {
      var f = (await A.pickFiles('image/*'))[0]; if (!f) return;
      photoId = await A.saveImage(f, { ref: 'material' });
      ph.innerHTML = '<img data-thumb="' + esc(photoId) + '" alt=""><span>' + esc(t('a.photoHint')) + '</span>'; A.fillThumbs(ph);
    };
    A.fillThumbs(md.el);
  }

  /* ---------------- giriş / çıkış ---------------- */
  function moveForm(m, type) {
    var cur = S.settings.currency, w = CALC.pos(m.weightG);
    var parties = {}; S.movements.forEach(function (x) { if (x.party) parties[x.party] = 1; }); S.customers.forEach(function (c) { parties[c.name] = 1; });
    var dl = ui.el('datalist', { id: 'dlParty', html: Object.keys(parties).sort().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') });
    A.formModal({ title: (type === 'in' ? t('m.inLong') : t('m.outLong')) + ' — ' + (m.name || ''), icon: type === 'in' ? 'arrowIn' : 'arrowOut', extra: dl, fields: [
      { k: 'qty', label: t('m.f.qtyUnit', { u: unitName(m) }), type: 'number', value: 1, req: true, hint: t('m.stockNow', { n: A.num(A.stockOf(m.id), 2), u: unitName(m) }) },
      w ? { k: 'grams', label: t('m.f.orGrams'), type: 'number', value: '', hint: t('m.f.gramsHint', { w: w }) } : null,
      type === 'in' ? { k: 'unitPrice', label: t('m.f.unitPrice', { c: cur }), type: 'number', value: m.unitPrice ? +CALC.convert(m.unitPrice, cur, S.settings).toFixed(4) : '' } : null,
      { k: 'party', label: type === 'in' ? t('m.from') : t('m.to'), list: 'dlParty' },
      { k: 'date', label: t('a.date'), type: 'date', value: A.today() },
      { k: 'note', label: t('a.note'), wide: true }
    ].filter(Boolean), ok: type === 'in' ? t('m.in') : t('m.out'), onSave: async function (v) {
      var q = CALC.pos(v.qty);
      if (w && CALC.pos(v.grams)) q = CALC.pos(v.grams) / w;
      if (!q) { A.toast(t('a.required', { f: t('m.col.qty') }), 'bad'); return false; }
      var mv = { materialId: m.id, type: type, qty: q, grams: w ? q * w : null, party: v.party, date: v.date || A.today(), note: v.note };
      if (type === 'in' && v.unitPrice !== '' && v.unitPrice != null) {
        mv.unitPrice = CALC.toUsd(CALC.num(v.unitPrice), cur, S.settings);
        // son giriş fiyatı malzemenin birim fiyatı olur (maliyet hesabı güncel fiyattan yapılsın)
        if (mv.unitPrice > 0 && Math.abs(mv.unitPrice - CALC.num(m.unitPrice)) > 1e-9) { var d = Object.assign({}, m, { unitPrice: mv.unitPrice }); await DB.put('materials', d); }
      }
      await DB.put('movements', mv);
      await A.reload(); A.render(); A.toast(t('a.saved'), 'good');
    } });
  }

  function history(m) {
    var list = S.movements.filter(function (x) { return x.materialId === m.id; }).sort(function (a, b) { return String(b.date + b.createdAt).localeCompare(String(a.date + a.createdAt)); });
    var rows = list.map(function (x) {
      var sign = x.type === 'in' ? '+' : x.type === 'adjust' ? (CALC.num(x.qty) >= 0 ? '+' : '') : x.type === 'info' ? '' : '−';
      var job = x.jobId ? A.byId(S.jobs, x.jobId) : null;
      return '<tr><td>' + esc(A.date(x.date)) + '</td><td><span class="badge ' + ({ in: 'ok', out: 'danger', use: 'info', adjust: 'warn', info: '' }[x.type] || '') + '">' + esc(t('mv.' + x.type)) + '</span></td>' +
        '<td class="r mono">' + (x.type === 'info' ? '' : sign + A.num(Math.abs(CALC.num(x.qty)), 3).replace(/[.,]?0+$/, '')) + (x.grams ? ' <small>(' + A.num(x.grams, 0) + ' g)</small>' : '') + '</td>' +
        '<td>' + esc(x.party || '') + (job ? ' <a href="#" data-job="' + esc(job.id) + '">' + esc(job.code + ' ' + job.name) + '</a>' : '') + '</td><td class="muted">' + esc(x.note || '') + (x.unitPrice ? ' · ' + esc(A.money(x.unitPrice)) : '') + '</td>' +
        '<td>' + A.iconBtn('trash', t('a.delete'), 'del danger" data-mv="' + esc(x.id)) + '</td></tr>';
    }).join('');
    var body = ui.el('div', { html: '<p class="muted">' + esc(t('m.stockNow', { n: A.num(A.stockOf(m.id), 2), u: unitName(m) })) + '</p>' +
      (list.length ? '<div class="tablewrap"><table class="tbl compact"><thead><tr><th>' + esc(t('a.date')) + '</th><th></th><th class="r">' + esc(t('m.col.qty')) + '</th><th>' + esc(t('m.party')) + '</th><th>' + esc(t('a.note')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="empty">' + esc(t('m.noHistory')) + '</p>') });
    var md = ui.modal({ title: t('m.history') + ' — ' + (m.name || '') + ' ' + (m.serial || ''), icon: 'history', cls: 'wide', body: body, buttons: [{ label: t('a.close'), cls: 'primary' }] });
    A.$$('[data-mv]', body).forEach(function (b) { b.onclick = function () { A.confirmBox(t('m.confirmDeleteMove'), async function () { await DB.del('movements', b.getAttribute('data-mv')); await A.reload(); md.close(); history(m); A.render(); }); }; });
    A.$$('[data-job]', body).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); md.close(); A.go('archive', { open: a.getAttribute('data-job') }); }; });
  }

  /* ---------------- döküm ve QR ---------------- */
  function dump(list) {
    var body = ui.el('div', { html: '<p>' + esc(t('m.dumpAsk', { n: list.length })) + '</p>' });
    ui.modal({ title: t('m.dump'), icon: 'file', cls: 'small', body: body, buttons: [
      { label: 'CSV', icon: 'download', onClick: function () {
        var rows = [[t('m.col.serial'), t('m.f.name'), t('m.f.brand'), t('m.color'), t('m.f.condition'), t('m.col.category'), t('m.col.location'), t('m.col.qty'), t('m.f.unit'), t('m.col.min'), t('m.f.unitPrice', { c: 'USD' }), t('m.f.type'), t('a.note')]];
        list.forEach(function (m) { rows.push([m.serial, m.name, m.brand, m.color, m.condition ? t(m.condition === 'used' ? 'm.used' : 'm.new0') : '', A.catPath(m.categoryId), A.nameOf(S.locations, m.locationId, ''), A.stockOf(m.id), unitName(m), m.minQty || 0, CALC.num(m.unitPrice).toFixed(2), m.matType || '', m.note || '']); });
        A.saveOut('malzemeler-' + A.today() + '.csv', new Blob([A.csv(rows)], { type: 'text/csv' }));
      } }, 'spacer',
      { label: t('a.print'), icon: 'print', cls: 'primary', onClick: function () {
        var html = '<h1>' + esc(A.pageName('materials')) + '</h1><p class="muted">' + esc(A.dateTime(DB.now())) + ' · ' + list.length + '</p><table><thead><tr><th>' + esc(t('m.col.serial')) + '</th><th>' + esc(t('m.col.name')) + '</th><th>' + esc(t('m.col.category')) +
          '</th><th>' + esc(t('m.col.location')) + '</th><th class="r">' + esc(t('m.col.qty')) + '</th><th class="r">' + esc(t('m.col.min')) + '</th><th class="r">' + esc(t('m.f.unitPrice', { c: S.settings.currency })) + '</th></tr></thead><tbody>' +
          list.map(function (m) { return '<tr><td>' + esc(m.serial || '') + '</td><td>' + (m.color ? '<span class="dot" style="background:' + esc(m.color) + '"></span>' : '') + '<b>' + esc(m.name || '') + '</b> <span class="muted">' + esc(m.brand || '') + '</span></td><td>' + esc(A.catPath(m.categoryId)) + '</td><td>' + esc(A.nameOf(S.locations, m.locationId, '')) + '</td><td class="r">' + A.num(A.stockOf(m.id), 2) + ' ' + esc(unitName(m)) + '</td><td class="r">' + A.num(m.minQty || 0) + '</td><td class="r">' + esc(A.money(m.unitPrice || 0)) + '</td></tr>'; }).join('') + '</tbody></table>';
        A.printHtml(A.pageName('materials'), html);
      } }] });
  }
  function qrLabels(list) {
    if (!list.length) return;
    var html = '<div class="labels">' + list.map(function (m) {
      var txt = 'MA3D|' + (m.serial || m.id) + '|' + (m.name || '') + '|' + (m.brand || '') + '|' + (m.matType || A.catPath(m.categoryId));
      return '<div class="lbl">' + A.qrSvg(txt, 90) + '<div><b>' + (m.color ? '<span class="dot" style="background:' + esc(m.color) + '"></span>' : '') + esc(m.name || '') + '</b><small>' + esc(m.brand || '') + ' · ' + esc(A.catPath(m.categoryId)) + '</small><small class="mono">' + esc(m.serial || '') + '</small><small>' + esc(A.nameOf(S.locations, m.locationId, '')) + '</small></div></div>';
    }).join('') + '</div>';
    A.printHtml(t('m.qrLabel'), html);
  }

  A.page('materials', { icon: 'spool', group: 'inventory', render: render, badge: function () { var n = S.materials.filter(A.isLow).length; return n ? String(n) : ''; } });
  A.materials = { form: materialForm, move: moveForm, history: history, filter: F, unitName: unitName };
})();
