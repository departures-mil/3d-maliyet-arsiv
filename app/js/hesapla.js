/* HESAPLA — iş editörü: bir baskı işinin (tabla/parça) maliyeti, satış fiyatı ve kârı. Kaydedilen iş Arşiv'e geçer;
   arşivdeki iş "Düzenle" ile buraya açılır. Maliyet kalemleri (Ayarlar → Maliyet kalemleri) bu işe özel açılıp kapatılabilir
   ve tutarı değiştirilebilir. Malzeme satırları stoktaki filamentlerden seçilir ya da elle kg fiyatı girilir.
   "Stoktan düş" işaretliyse kayıtta kullanılan gram ilgili makaradan düşülür (hareket: kullanım). */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  function statuses() { return A.listOf('jobStatus'); }
  function defaultStatus() { var s = statuses(); var d = s.filter(function (x) { return x.key === 'done'; })[0] || s[0]; return d ? d.id : ''; }
  function newDraft() {
    var st = S.settings;
    var p = A.byId(S.printers, st.defPrinterId) || S.printers[0] || null;
    return {
      id: null, code: '', name: '', date: A.today(), statusId: defaultStatus(), categoryId: '', customerId: '', qty: 1, tags: '',
      printerId: p ? p.id : '', printMin: 0, prepMin: 0, laborMin: 0,
      materials: [{ materialId: (p && p.defMaterialId) || '', grams: 0, meters: 0, kgPrice: 0 }],
      settings: {}, items: {}, margin: st.margin, targetUnit: 0, roundTo: st.roundTo || 0,
      paid: 0, deliveryDate: '', photos: [], files: [], note: '', deduct: true, custom: {}
    };
  }
  function draft() { if (!S.draft) S.draft = newDraft(); return S.draft; }
  function loadJob(j) { S.draft = JSON.parse(JSON.stringify(j)); S.draft.deduct = j.stockDeducted !== false; if (!S.draft.materials || !S.draft.materials.length) S.draft.materials = [{ materialId: '', grams: 0 }]; }

  function itemState(d, it) { var o = d.items[it.id]; return { on: o && 'on' in o ? !!o.on : !!it.on, amount: o && 'amount' in o ? o.amount : it.amount }; }
  function matPrice(row) {
    var m = row.materialId ? A.byId(S.materials, row.materialId) : null;
    if (m) return A.kgPrice(m);
    return CALC.pos(row.kgPrice);
  }
  function calcInput(d) {
    var p = A.byId(S.printers, d.printerId) || {};
    return {
      materials: d.materials.map(function (r) { return { grams: CALC.pos(r.grams), kgPrice: matPrice(r) }; }),
      printMin: CALC.pos(d.printMin), laborMin: CALC.pos(d.laborMin) + CALC.pos(d.prepMin), qty: d.qty,
      printer: { watt: p.watt, price: p.price, lifeHours: p.lifeHours }, kwhPrice: S.settings.kwhPrice, laborRate: S.settings.laborRate,
      items: S.costItems.map(function (it) { var s = itemState(d, it); return Object.assign({}, it, { on: s.on, amount: s.amount }); }),
      margin: d.margin, targetUnit: d.targetUnit, roundTo: d.roundTo
    };
  }
  A.jobCalc = function (d) { return CALC.compute(calcInput(d)); };

  /* ---------------- ekran ---------------- */
  function render(host, arg) {
    if (arg && arg.jobId) { var j = A.byId(S.jobs, arg.jobId); if (j) loadJob(j); }
    if (arg && arg.fresh) S.draft = newDraft();
    if (arg && arg.prefill) { S.draft = Object.assign(newDraft(), arg.prefill); }
    var d = draft();
    var cur = S.settings.currency;
    var grid = ui.el('div.calc-grid');

    /* ---- sol: iş + baskı ---- */
    var c1 = ui.el('section.card');
    c1.innerHTML = '<h3 class="card-title">' + A.icon('tag') + '<span>' + esc(t('c.job')) + '</span>' + (d.id ? '<em class="badge info">' + esc(d.code) + '</em>' : '<em class="badge">' + esc(t('c.newJob')) + '</em>') + '</h3>' +
      '<div class="form-grid">' +
      fld('name', t('c.name'), '<input id="cName" value="' + esc(d.name) + '" placeholder="' + esc(t('c.namePh')) + '">', true) +
      fld('', t('a.date'), '<input id="cDate" type="date" value="' + esc(d.date || A.today()) + '">') +
      fld('', t('c.status'), '<select id="cStatus">' + A.opts(statuses(), d.statusId, false) + '</select>') +
      fld('', t('c.customer'), '<div class="inp-row"><select id="cCust">' + A.opts(S.customers.slice().sort(A.byName), d.customerId, t('c.noCustomer')) + '</select>' + A.iconBtn('plus', t('cu.new'), 'addCust') + '</div>') +
      fld('', t('c.category'), '<select id="cCat">' + A.opts(A.listOf('jobCategory'), d.categoryId, '—') + '</select>') +
      fld('', t('c.qty'), '<input id="cQty" type="number" min="1" step="1" value="' + esc(d.qty || 1) + '">') +
      fld('', t('c.tags'), '<input id="cTags" value="' + esc(d.tags || '') + '" placeholder="' + esc(t('c.tagsPh')) + '">') +
      '</div>' +
      '<div class="form-sec">' + esc(t('c.print')) + '</div><div class="form-grid">' +
      fld('', t('c.printer'), '<select id="cPrn">' + A.opts(S.printers.slice().sort(A.byName), d.printerId, t('c.noPrinter')) + '</select>') +
      fld('', t('c.printTime'), '<div class="inp-row"><input id="cH" type="number" min="0" step="1" value="' + Math.floor(CALC.pos(d.printMin) / 60) + '"><span class="unit">' + esc(t('u.h')) + '</span><input id="cM" type="number" min="0" max="59" step="1" value="' + Math.round(CALC.pos(d.printMin) % 60) + '"><span class="unit">' + esc(t('u.min')) + '</span></div>') +
      fld('', t('c.laborMin'), '<div class="inp-row"><input id="cLabor" type="number" min="0" step="1" value="' + esc(d.laborMin || 0) + '"><span class="unit">' + esc(t('u.min')) + '</span></div>', false, t('c.laborHint')) +
      '</div>' +
      '<details class="more"' + (Object.keys(d.settings || {}).some(function (k) { return d.settings[k]; }) ? ' open' : '') + '><summary>' + esc(t('c.slicerSettings')) + '</summary><div class="form-grid">' +
      ['nozzle', 'layer', 'infill', 'walls', 'supports', 'plate', 'process', 'profile', 'speed', 'nozzleTemp', 'bedTemp', 'slicer'].map(function (k) {
        return fld('', t('c.s.' + k), '<input data-set="' + k + '" value="' + esc((d.settings || {})[k] || '') + '">');
      }).join('') + '</div></details>' +
      '<div class="form-sec">' + esc(t('c.photosFiles')) + '</div>' +
      '<div class="media-row" id="cMedia"></div>' +
      '<div class="btn-row"><button type="button" class="btn small" id="cAddPhoto">' + A.icon('image') + esc(t('c.addPhoto')) + '</button><button type="button" class="btn small" id="cAddFile">' + A.icon('file') + esc(t('c.addFile')) + '</button></div>' +
      fld('', t('a.note'), '<textarea id="cNote" rows="3">' + esc(d.note || '') + '</textarea>', true);
    grid.appendChild(c1);

    /* ---- orta: malzemeler + maliyet kalemleri ---- */
    var c2 = ui.el('section.card');
    c2.innerHTML = '<h3 class="card-title">' + A.icon('spool') + '<span>' + esc(t('c.materials')) + '</span></h3><div id="cMats"></div>' +
      '<button type="button" class="btn small" id="cAddMat">' + A.icon('plus') + esc(t('c.addMaterial')) + '</button>' +
      '<div class="form-sec">' + esc(t('c.costItems')) + ' <a href="#" id="cEditItems" class="fc-small">' + esc(t('c.editItems')) + '</a></div><div id="cItems" class="items"></div>' +
      '<div class="form-sec">' + esc(t('c.pricing')) + '</div><div class="form-grid">' +
      fld('', t('c.margin'), '<div class="inp-row"><input id="cMargin" type="number" step="1" value="' + esc(d.margin) + '"><span class="unit">%</span></div>') +
      fld('', t('c.target', { c: cur }), '<input id="cTarget" type="number" min="0" step="any" value="' + (CALC.pos(d.targetUnit) ? +CALC.convert(d.targetUnit, cur, S.settings).toFixed(2) : '') + '" placeholder="' + esc(t('c.targetPh')) + '">') +
      fld('', t('c.round', { c: cur }), '<input id="cRound" type="number" min="0" step="any" value="' + (CALC.pos(d.roundTo) ? +CALC.convert(d.roundTo, cur, S.settings).toFixed(2) : '') + '" placeholder="0">') +
      fld('', t('c.paid', { c: cur }), '<input id="cPaid" type="number" min="0" step="any" value="' + (CALC.pos(d.paid) ? +CALC.convert(d.paid, cur, S.settings).toFixed(2) : '') + '">') +
      fld('', t('c.delivery'), '<input id="cDeliv" type="date" value="' + esc(d.deliveryDate || '') + '">') +
      '</div>';
    var cfBox = ui.el('div.form-grid', { id: 'cCustom' });
    c2.appendChild(cfBox);
    grid.appendChild(c2);

    /* ---- sağ: sonuç ---- */
    var c3 = ui.el('section.card.sticky.result');
    c3.innerHTML = '<h3 class="card-title">' + A.icon('calc') + '<span>' + esc(t('c.result')) + '</span></h3>' +
      '<div class="price-main"><span class="lbl">' + esc(t('c.unitPrice')) + '</span><b id="rUnit"></b><small id="rAlt"></small></div>' +
      '<div class="stackbar" id="rBar"></div><div id="rRows" class="rrows"></div>' +
      '<div class="totals" id="rTot"></div>' +
      '<label class="check"><input type="checkbox" id="cDeduct"' + (d.deduct ? ' checked' : '') + '><span>' + esc(t('c.deduct')) + '</span></label>' +
      '<div class="btn-row col">' +
      '<button type="button" class="btn primary" id="cSave">' + A.icon('archive') + esc(d.id ? t('c.update') : t('c.save')) + '</button>' +
      (d.id ? '<button type="button" class="btn" id="cSaveNew">' + A.icon('copy') + esc(t('c.saveAsNew')) + '</button>' : '') +
      '<button type="button" class="btn" id="cImport">' + A.icon('scan') + esc(t('c.import')) + '</button>' +
      '<button type="button" class="btn" id="cQuote">' + A.icon('print') + esc(t('c.quote')) + '</button>' +
      '<button type="button" class="btn ghost" id="cReset">' + esc(t('c.reset')) + '</button></div>' +
      '<p class="field-hint">' + esc(t('c.note')) + '</p>';
    grid.appendChild(c3);
    host.appendChild(grid);

    /* custom fields */
    A.fields.formFields('job', d).forEach(function (f) {
      if (f.type === 'section') { cfBox.appendChild(ui.el('div.form-sec.wide', { text: f.label })); return; }
      var inp;
      if (f.type === 'select') { inp = ui.el('select'); f.options.forEach(function (o) { var e = ui.el('option', { value: o.v, text: o.l }); if (String(o.v) === String(f.value || '')) e.selected = true; inp.appendChild(e); }); }
      else if (f.type === 'check') { inp = ui.el('input', { type: 'checkbox' }); inp.checked = !!f.value; }
      else { inp = ui.el('input', { type: f.type }); inp.value = f.value == null ? '' : f.value; }
      inp.setAttribute('data-cf', f.k.slice(3));
      inp.addEventListener('change', function () { d.custom = d.custom || {}; d.custom[f.k.slice(3)] = inp.type === 'checkbox' ? inp.checked : inp.value; });
      cfBox.appendChild(ui.el('label.field', null, [ui.el('span.field-label', { text: f.label }), inp]));
    });

    drawMats(host, d); drawItems(host, d); drawMedia(host, d); bind(host, d); paint(host, d);
  }
  function fld(id, label, inner, wide, hint) {
    return '<label class="field' + (wide ? ' wide' : '') + '"><span class="field-label">' + esc(label) + '</span>' + inner + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }

  function matLabel(m) {
    var q = A.stockOf(m.id), w = CALC.pos(m.weightG);
    return (m.serial ? m.serial + ' · ' : '') + (m.name || '') + (m.brand ? ' · ' + m.brand : '') + (m.matType ? ' · ' + m.matType : '') + ' (' + (w ? '≈' + Math.round(q * w) + ' g' : A.num(q, 2)) + ')';
  }
  function drawMats(host, d) {
    var box = host.querySelector('#cMats'); box.innerHTML = '';
    var mats = S.materials.slice().sort(function (a, b) { return A.catPath(a.categoryId).localeCompare(A.catPath(b.categoryId)) || A.byName(a, b); });
    d.materials.forEach(function (r, i) {
      var m = r.materialId ? A.byId(S.materials, r.materialId) : null;
      var row = ui.el('div.mat-row');
      row.innerHTML = '<span class="dot big" style="background:' + esc((m && m.color) || 'transparent') + '"></span>' +
        '<select class="mSel">' + '<option value="">' + esc(t('c.manualMat')) + '</option>' + mats.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === r.materialId ? ' selected' : '') + '>' + esc(matLabel(x)) + '</option>'; }).join('') + '</select>' +
        '<div class="inp-row"><input class="mG" type="number" min="0" step="any" value="' + (CALC.pos(r.grams) || '') + '" placeholder="0"><span class="unit">g</span></div>' +
        (m ? '<span class="mPrice muted">' + esc(A.money(A.kgPrice(m))) + '/kg</span>' : '<div class="inp-row"><input class="mKg" type="number" min="0" step="any" value="' + (CALC.pos(r.kgPrice) ? +CALC.convert(r.kgPrice, S.settings.currency, S.settings).toFixed(2) : '') + '" placeholder="' + esc(t('c.kgPrice')) + '"><span class="unit">/kg</span></div>') +
        (d.materials.length > 1 ? A.iconBtn('trash', t('a.delete'), 'mDel danger') : '<span></span>');
      if (m && CALC.pos(m.weightG) && CALC.pos(r.grams) > A.stockOf(m.id) * CALC.pos(m.weightG) + 0.5) row.appendChild(ui.el('div.field-hint.warn-text.wide', { text: t('c.notEnough') }));
      row.querySelector('.mSel').onchange = function (e) { r.materialId = e.target.value; drawMats(host, d); paint(host, d); };
      row.querySelector('.mG').oninput = function (e) { r.grams = CALC.num(e.target.value); paint(host, d); };
      var kg = row.querySelector('.mKg'); if (kg) kg.oninput = function (e) { r.kgPrice = CALC.toUsd(CALC.num(e.target.value), S.settings.currency, S.settings); paint(host, d); };
      var del = row.querySelector('.mDel'); if (del) del.onclick = function () { d.materials.splice(i, 1); drawMats(host, d); paint(host, d); };
      box.appendChild(row);
    });
  }
  function drawItems(host, d) {
    var box = host.querySelector('#cItems'); box.innerHTML = '';
    var cur = S.settings.currency;
    S.costItems.forEach(function (it) {
      var s = itemState(d, it);
      var unit = { fail: '%', pctCost: '%', pctPrice: '%', energy: cur + '/kWh', labor: cur + '/' + t('u.h'), perPiece: cur + '/' + t('u.pcs'), perHour: cur + '/' + t('u.h'), perGram: cur + '/g', fixed: cur }[it.type];
      var pct = /^(fail|pctCost|pctPrice)$/.test(it.type);
      var shown = it.type === 'material' || it.type === 'wear' ? null : (it.type === 'energy' && !CALC.pos(s.amount) ? S.settings.kwhPrice : it.type === 'labor' && !CALC.pos(s.amount) ? S.settings.laborRate : s.amount);
      var row = ui.el('label.item-row' + (s.on ? '' : '.off'));
      row.innerHTML = '<input type="checkbox"' + (s.on ? ' checked' : '') + '><i class="dot" style="background:' + esc(it.color || 'var(--accent)') + '"></i><span class="nm">' + esc(it.name) + '</span>' +
        (shown == null ? '<span class="muted auto">' + esc(t('c.auto')) + '</span>' : '<input type="number" step="any" min="0" class="amt" value="' + (pct ? CALC.num(shown) : +CALC.convert(CALC.num(shown), cur, S.settings).toFixed(4)) + '"><span class="unit">' + esc(unit || '') + '</span>');
      row.querySelector('input[type=checkbox]').onchange = function (e) { d.items[it.id] = Object.assign({}, d.items[it.id], { on: e.target.checked }); row.classList.toggle('off', !e.target.checked); paint(host, d); };
      var amt = row.querySelector('.amt');
      if (amt) amt.oninput = function () { var v = CALC.num(amt.value); d.items[it.id] = Object.assign({}, d.items[it.id], { amount: pct ? v : CALC.toUsd(v, cur, S.settings) }); paint(host, d); };
      box.appendChild(row);
    });
    if (!S.costItems.length) box.appendChild(ui.el('p.muted', { text: t('c.noItems') }));
  }
  function drawMedia(host, d) {
    var box = host.querySelector('#cMedia'); box.innerHTML = '';
    (d.photos || []).forEach(function (id, i) {
      var c = ui.el('div.media', { html: '<img data-thumb="' + esc(id) + '" alt="">' + A.iconBtn('x', t('a.delete'), 'rm') + (i === 0 ? '<em class="cover">' + esc(t('c.cover')) + '</em>' : '') });
      c.querySelector('img').onclick = function () { A.lightbox(d.photos, i); };
      c.querySelector('.rm').onclick = function () { d.photos.splice(i, 1); drawMedia(host, d); };
      box.appendChild(c);
    });
    (d.files || []).forEach(function (id, i) {
      var c = ui.el('div.media.file', { html: A.icon('file') + '<span class="fname" data-fname="' + esc(id) + '"></span>' + A.iconBtn('x', t('a.delete'), 'rm') });
      DB.getFile(id).then(function (f) { var s = c.querySelector('.fname'); if (s && f) s.textContent = f.name; });
      c.onclick = function (e) { if (!e.target.closest('.rm')) A.openFile(id); };
      c.querySelector('.rm').onclick = function () { d.files.splice(i, 1); drawMedia(host, d); };
      box.appendChild(c);
    });
    if (!(d.photos || []).length && !(d.files || []).length) {
      var drop = ui.el('div.drop', { html: A.icon('upload') + '<span>' + esc(t('c.dropHint')) + '</span>' });
      drop.onclick = function () { host.querySelector('#cAddPhoto').click(); };
      box.appendChild(drop);
    }
    A.fillThumbs(box);
  }
  async function addFiles(host, d, files) {
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (/^image\//.test(f.type)) d.photos.push(await A.saveImage(f, { ref: 'job' }));
      else d.files.push(await A.saveAttachment(f, { ref: 'job' }));
    }
    drawMedia(host, d);
  }

  function bind(host, d) {
    var q = function (s) { return host.querySelector(s); };
    q('#cName').oninput = function (e) { d.name = e.target.value; };
    q('#cDate').onchange = function (e) { d.date = e.target.value; };
    q('#cStatus').onchange = function (e) { d.statusId = e.target.value; };
    q('#cCust').onchange = function (e) { d.customerId = e.target.value; };
    q('#cCat').onchange = function (e) { d.categoryId = e.target.value; };
    q('#cTags').oninput = function (e) { d.tags = e.target.value; };
    q('#cQty').oninput = function (e) { d.qty = Math.max(1, Math.round(CALC.num(e.target.value)) || 1); paint(host, d); };
    q('#cPrn').onchange = function (e) { d.printerId = e.target.value; paint(host, d); };
    var tm = function () { d.printMin = CALC.pos(q('#cH').value) * 60 + CALC.pos(q('#cM').value); paint(host, d); };
    q('#cH').oninput = tm; q('#cM').oninput = tm;
    q('#cLabor').oninput = function (e) { d.laborMin = CALC.pos(e.target.value); paint(host, d); };
    A.$$('[data-set]', host).forEach(function (i) { i.oninput = function () { d.settings = d.settings || {}; d.settings[i.getAttribute('data-set')] = i.value; }; });
    q('#cNote').oninput = function (e) { d.note = e.target.value; };
    q('#cMargin').oninput = function (e) { d.margin = CALC.num(e.target.value); paint(host, d); };
    var cur = S.settings.currency;
    q('#cTarget').oninput = function (e) { d.targetUnit = CALC.toUsd(CALC.num(e.target.value), cur, S.settings); paint(host, d); };
    q('#cRound').oninput = function (e) { d.roundTo = CALC.toUsd(CALC.num(e.target.value), cur, S.settings); paint(host, d); };
    q('#cPaid').oninput = function (e) { d.paid = CALC.toUsd(CALC.num(e.target.value), cur, S.settings); };
    q('#cDeliv').onchange = function (e) { d.deliveryDate = e.target.value; };
    q('#cDeduct').onchange = function (e) { d.deduct = e.target.checked; };
    q('#cAddMat').onclick = function () { d.materials.push({ materialId: '', grams: 0 }); drawMats(host, d); };
    q('#cEditItems').onclick = function (e) { e.preventDefault(); A.go('settings', { focus: 'costItems' }); };
    q('#cAddPhoto').onclick = async function () { addFiles(host, d, await A.pickFiles('image/*', true)); };
    q('#cAddFile').onclick = async function () { addFiles(host, d, await A.pickFiles('.stl,.3mf,.gcode,.gco,.obj,.step,.stp,.f3d,.zip,.pdf,*/*', true)); };
    q('.addCust').onclick = function () { A.customers.form(null, function (c) { d.customerId = c.id; A.render(); }); };
    q('#cSave').onclick = function () { save(d, false); };
    var sn = q('#cSaveNew'); if (sn) sn.onclick = function () { save(d, true); };
    q('#cReset').onclick = function () { A.confirmBox(t('c.resetAsk'), function () { S.draft = newDraft(); A.render(); }, { danger: false }); };
    q('#cQuote').onclick = function () { quote(d); };
    q('#cImport').onclick = function () { A.importer.open(function (res) { applyImport(d, res); A.render(); }); };
    /* sürükle-bırak: görsel/STL/3MF → işe ekle; dilimleyici görüntüsü için İçe aktar */
    var g = host.querySelector('.calc-grid');
    g.addEventListener('dragover', function (e) { e.preventDefault(); g.classList.add('dragging'); });
    g.addEventListener('dragleave', function (e) { if (e.target === g) g.classList.remove('dragging'); });
    g.addEventListener('drop', function (e) { e.preventDefault(); g.classList.remove('dragging'); var fs = Array.prototype.slice.call(e.dataTransfer.files || []); if (fs.length) addFiles(host, d, fs); });
  }

  function paint(host, d) {
    var r = A.jobCalc(d), st = S.settings;
    host.querySelector('#rUnit').textContent = A.money(r.unitPrice);
    host.querySelector('#rAlt').textContent = A.moneyAlt(r.unitPrice);
    var parts = r.rows.filter(function (x) { return x.value > 0; }).concat(r.profit > 0 ? [{ name: t('c.profit'), value: r.profit, color: 'var(--ok)' }] : []);
    var tot = parts.reduce(function (s, x) { return s + x.value; }, 0) || 1;
    host.querySelector('#rBar').innerHTML = parts.map(function (x) { return '<i style="width:' + (x.value / tot * 100).toFixed(2) + '%;background:' + esc(x.color || 'var(--accent)') + '" title="' + esc(x.name) + '"></i>'; }).join('');
    host.querySelector('#rRows').innerHTML = r.rows.map(function (x) {
      return '<div class="rrow' + (x.value > 0 ? '' : ' zero') + '"><i class="dot" style="background:' + esc(x.color || 'var(--accent)') + '"></i><span>' + esc(x.name) + (x.pct ? ' <small>%' + A.num(x.pct, 1) + '</small>' : '') + '</span><b>' + esc(A.money(x.value)) + '</b></div>';
    }).join('');
    var pctTxt = A.num(r.margin, 1) + '%';
    host.querySelector('#rTot').innerHTML =
      row(t('c.totalCost'), A.money(r.cost), 'strong') +
      (r.fees > 0 ? row(t('c.fees'), A.money(r.fees)) : '') +
      row(t('c.totalPrice', { n: r.qty }), A.money(r.price), 'strong') +
      row(t('c.profit'), A.money(r.profit) + ' · ' + pctTxt, r.profit >= 0 ? 'ok' : 'bad') +
      row(t('c.unitCost'), A.money(r.unitCost)) +
      (r.grams ? row(t('c.grams'), A.num(r.grams, 1) + ' g' + (r.qty > 1 ? ' (' + A.num(r.unitGrams, 1) + ' g / ' + t('u.pcs') + ')' : '')) : '') +
      (r.grams ? row(t('c.perGram'), A.money(r.costPerGram)) : '') +
      (r.hours ? row(t('c.time'), CALC.fmtMin(d.printMin, t) + (r.hours ? ' · ' + A.money(r.costPerHour) + '/' + t('u.h') : '')) : '');
    function row(l, v, cls) { return '<div class="trow ' + (cls || '') + '"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }
    return r;
  }

  async function save(d, asNew, o) {
    o = o || {};
    if (!String(d.name || '').trim()) { A.toast(t('a.required', { f: t('c.name') }), 'bad'); var n = document.getElementById('cName'); if (n) n.focus(); return; }
    var r = A.jobCalc(d);
    var job = JSON.parse(JSON.stringify(d));
    delete job.deduct;
    if (asNew) { job.id = null; job.code = ''; job.createdAt = null; job.photos = (d.photos || []).slice(); }
    if (!job.code) job.code = DB.nextSerial('P', S.jobs, 'code');
    var c = A.byId(S.customers, job.customerId), p = A.byId(S.printers, job.printerId);
    job.customerName = c ? c.name : ''; job.printerName = p ? p.name : '';
    job.materials = job.materials.filter(function (m) { return m.materialId || CALC.pos(m.grams); }).map(function (m) {
      var mm = m.materialId ? A.byId(S.materials, m.materialId) : null;
      return Object.assign(m, { kgPrice: matPrice(m), name: mm ? mm.name : (m.name || ''), brand: mm ? mm.brand : (m.brand || ''), color: mm ? mm.color : (m.color || ''), matType: mm ? mm.matType : (m.matType || '') });
    });
    job.calc = { cost: r.cost, fees: r.fees, price: r.price, profit: r.profit, margin: r.margin, grams: r.grams, hours: r.hours, unitCost: r.unitCost, unitPrice: r.unitPrice,
      rows: r.rows.map(function (x) { return { id: x.id, name: x.name, value: x.value, color: x.color, pct: x.pct }; }) };
    job.rates = { rateTry: S.settings.rateTry, rateSyp: S.settings.rateSyp };
    var status = A.byId(S.lists, job.statusId) || {};
    /* stok: önceki kullanım hareketleri bu iş için silinir (yumuşak), yeniden yazılır */
    var old = S.movements.filter(function (m) { return m.jobId && m.jobId === job.id && m.type === 'use'; });
    for (var i = 0; i < old.length; i++) await DB.del('movements', old[i].id);
    job.stockDeducted = false;
    var saved = await DB.put('jobs', job);
    if (d.deduct && status.printed !== false) {
      for (var k = 0; k < saved.materials.length; k++) {
        var mr = saved.materials[k], mat = mr.materialId ? A.byId(S.materials, mr.materialId) : null;
        if (!mat || !CALC.pos(mr.grams)) continue;
        var w = CALC.pos(mat.weightG), unit = String(mat.unit || '').toLowerCase();
        var qty = w ? CALC.pos(mr.grams) / w : unit === 'kg' ? CALC.pos(mr.grams) / 1000 : unit === 'g' ? CALC.pos(mr.grams) : 0;
        if (qty > 0) await DB.put('movements', { materialId: mat.id, type: 'use', qty: qty, grams: CALC.pos(mr.grams), jobId: saved.id, date: saved.date || A.today(), party: saved.code + ' ' + saved.name });
      }
      saved.stockDeducted = true;
      await DB.put('jobs', saved);
    }
    await A.reload();
    if (o.quiet) return saved;
    S.draft = null;
    A.toast(t('c.saved', { c: saved.code }), 'good');
    A.go('archive', { open: saved.id });
    return saved;
  }

  /* dilimleyici içe aktarma sonucu → taslak */
  function applyImport(d, res) {
    if (!res) return;
    if (res.name && !d.name) d.name = res.name;
    if (res.qty) d.qty = res.qty;
    if (res.printMin) d.printMin = res.printMin;
    if (res.prepMin) d.prepMin = res.prepMin;
    if (res.printerId) d.printerId = res.printerId;
    if (res.materials && res.materials.length) d.materials = res.materials;
    d.settings = Object.assign({}, d.settings || {}, res.settings || {});
    if (res.photos) d.photos = (d.photos || []).concat(res.photos);
    if (res.files) d.files = (d.files || []).concat(res.files);
    if (res.note) d.note = (d.note ? d.note + '\n' : '') + res.note;
  }

  /* ---------------- teklif ---------------- */
  async function quote(d) {
    var r = A.jobCalc(d), c = A.byId(S.customers, d.customerId);
    var img = d.photos && d.photos[0] ? await DB.fileUrl(d.photos[0]) : '';
    var biz = S.settings.bizName || t('app.name');
    var html = '<table style="border:none"><tr><td style="border:none"><h1>' + esc(biz) + '</h1><div class="muted">' + esc(S.settings.bizInfo || '') + '</div></td><td style="border:none;text-align:end"><h2>' + esc(t('q.title')) + '</h2><div>' + esc(A.date(d.date || A.today())) + '</div>' + (d.code ? '<div class="muted">' + esc(d.code) + '</div>' : '') + '</td></tr></table>' +
      (c ? '<p><b>' + esc(t('c.customer')) + ':</b> ' + esc(c.name) + (c.phone ? ' · ' + esc(c.phone) : '') + '</p>' : '') +
      '<table><thead><tr><th>' + esc(t('q.item')) + '</th><th class="r">' + esc(t('c.qty')) + '</th><th class="r">' + esc(t('q.unit')) + '</th><th class="r">' + esc(t('q.total')) + '</th></tr></thead><tbody><tr><td>' +
      (img ? '<img class="ph" src="' + img + '"><br>' : '') + '<b>' + esc(d.name || '') + '</b><div class="muted">' +
      esc(d.materials.map(function (m) { var mm = A.byId(S.materials, m.materialId); return (mm ? (mm.matType || '') + ' ' + (mm.name || '') : '') + (m.grams ? ' ' + Math.round(m.grams) + ' g' : ''); }).join(', ')) + '</div></td>' +
      '<td class="r">' + r.qty + '</td><td class="r">' + esc(A.money(r.unitPrice)) + '</td><td class="r"><b>' + esc(A.money(r.price)) + '</b></td></tr></tbody></table>' +
      '<p class="big" style="text-align:end">' + esc(t('q.total')) + ': ' + esc(A.money(r.price)) + '</p><p class="muted" style="text-align:end">' + esc(A.moneyAlt(r.price)) + '</p>' +
      (d.deliveryDate ? '<p>' + esc(t('c.delivery')) + ': ' + esc(A.date(d.deliveryDate)) + '</p>' : '') +
      '<p class="muted">' + esc(S.settings.quoteNote || t('q.note')) + '</p>';
    A.printHtml(t('q.title') + ' ' + (d.name || ''), html);
  }

  A.page('calc', { icon: 'calc', group: 'production', render: render });
  A.calc = { save: save, newDraft: newDraft, loadJob: loadJob, quote: quote, applyImport: applyImport, statuses: statuses };
})();
