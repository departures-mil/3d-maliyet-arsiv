/* PROJE MALİYETİ — çok sayıda dilimleyici görseli / G-code / 3MF tek projede: her dosya okunur (ad, adet, gram, süre, filament,
   yazıcı), aynı adlı dosyalar tek satırda birleşir; satırlar tabloda düzeltilir, yazıcı projeye bir kez (ya da satır satır) seçilir.
   Toplu hesap: toplam süre, filament (türe göre), elektrik (kWh + tutar), aşınma, işçilik, fire, diğer kalemler, maliyet, fiyat, kâr.
   "Arşive işle" her satırı ayrı iş olarak kaydeder (stoktan düşme dahil). Rapor / teklif yazdırılır. Depo: projects. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;
  var cur = null;   /* açık proje (düzenleme taslağı) */

  function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function newProject() {
    var st = S.settings, p = A.byId(S.printers, st.defPrinterId) || S.printers[0] || null;
    return { id: null, code: '', name: '', date: A.today(), customerId: '', printerId: p ? p.id : '', margin: st.margin, roundTo: st.roundTo || 0, laborMin: 0, note: '', rows: [], jobIds: [] };
  }
  function newRow() { return { id: uid(), name: '', qty: 1, times: 1, printMin: 0, prepMin: 0, printerId: '', materials: [{ materialId: '', grams: 0 }], photos: [], files: [], settings: {}, note: '' }; }

  function matKg(r) { var m = r.materialId ? A.byId(S.materials, r.materialId) : null; return m ? A.kgPrice(m) : CALC.pos(r.kgPrice); }
  function rowPrinter(p, r) { return A.byId(S.printers, r.printerId || p.printerId) || {}; }
  function items() { return S.costItems.map(function (it) { return Object.assign({}, it); }); }

  /* bir satırın hesabı (tekrar sayısıyla çarpılmış) */
  function rowCalc(p, r) {
    var k = Math.max(1, Math.round(CALC.pos(r.times) || 1)), pr = rowPrinter(p, r);
    var res = CALC.compute({
      materials: (r.materials || []).map(function (m) { return { grams: CALC.pos(m.grams) * k, kgPrice: matKg(m) }; }),
      printMin: CALC.pos(r.printMin) * k, laborMin: CALC.pos(r.prepMin) * k, qty: Math.max(1, Math.round(CALC.pos(r.qty) || 1)) * k,
      printer: { watt: pr.watt, price: pr.price, lifeHours: pr.lifeHours }, kwhPrice: S.settings.kwhPrice, laborRate: S.settings.laborRate,
      items: items(), margin: p.margin, roundTo: 0
    });
    var energyOn = S.costItems.some(function (it) { return it.type === 'energy' && it.on; });
    res.kwh = energyOn ? CALC.pos(pr.watt) / 1000 * res.hours : CALC.pos(pr.watt) / 1000 * res.hours;
    res.times = k;
    return res;
  }
  /* proje toplamı */
  function total(p) {
    var T = { pieces: 0, plates: 0, hours: 0, grams: 0, kwh: 0, cost: 0, fees: 0, price: 0, profit: 0, byType: {}, byMat: {}, byItem: {}, laborMin: 0, rows: [] };
    (p.rows || []).forEach(function (r) {
      var c = rowCalc(p, r); T.rows.push(c);
      T.pieces += c.qty; T.plates += c.times; T.hours += c.hours; T.grams += c.grams; T.kwh += c.kwh; T.cost += c.cost; T.fees += c.fees; T.price += c.price; T.profit += c.profit;
      T.laborMin += CALC.pos(r.prepMin) * c.times;
      c.rows.forEach(function (x) { var b = T.byItem[x.id] || (T.byItem[x.id] = { name: x.name, color: x.color, type: x.type, value: 0 }); b.value += x.value; });
      (r.materials || []).forEach(function (m) {
        var g = CALC.pos(m.grams) * c.times; if (!g) return;
        var mm = m.materialId ? A.byId(S.materials, m.materialId) : null;
        var ty = (mm && mm.matType) || m.matType || t('pj.unknownType');
        T.byType[ty] = (T.byType[ty] || 0) + g;
        var key = m.materialId || ('x:' + ty + ':' + (m.name || ''));
        var bm = T.byMat[key] || (T.byMat[key] = { mat: mm, name: mm ? [mm.matType, mm.brand, mm.name].filter(Boolean).join(' · ') : [m.matType, m.name].filter(Boolean).join(' · ') || t('pj.unknownMat'), color: mm ? mm.color : m.color, grams: 0, cost: 0 });
        bm.grams += g; bm.cost += g / 1000 * matKg(m);
      });
    });
    /* proje geneli işçilik (montaj, paketleme) */
    var lab = CALC.pos(p.laborMin);
    if (lab) { var lc = CALC.pos(S.settings.laborRate) * lab / 60; T.cost += lc; T.laborMin += lab; var bl = T.byItem.__labor || (T.byItem.__labor = { name: t('pj.projLabor'), color: '#64748b', value: 0 }); bl.value += lc; var lp = lc * (1 + CALC.num(p.margin) / 100); T.price += lp; T.profit += lp - lc; }
    var r0 = CALC.pos(p.roundTo); if (r0 > 0 && T.price > 0) { var np = Math.ceil(T.price / r0) * r0; T.profit += np - T.price; T.price = np; }
    T.margin = T.cost > 0 ? T.profit / T.cost * 100 : 0;
    T.energy = Object.keys(T.byItem).filter(function (k) { return T.byItem[k].type === 'energy'; }).reduce(function (s, k) { return s + T.byItem[k].value; }, 0);
    return T;
  }

  /* ---------------- dosyalardan satır ---------------- */
  function normName(s) { return String(s || '').toLocaleLowerCase('tr').replace(/\s*\(\d+\)\s*$/, '').replace(/[\s_-]+/g, ' ').trim(); }
  async function rowsFromFiles(p, files) {
    var I = A.importer, b = I.busy(t('imp.reading')), list = [];
    try {
      for (var i = 0; i < files.length; i++) {
        b.set((i + 1) + ' / ' + files.length + ' · ' + (files[i].name || ''));
        try { list.push(await I.analyze(files[i], function (s) { b.set((i + 1) + ' / ' + files.length + ' · ' + s); })); }
        catch (e) { A.toast((files[i].name || '') + ': ' + (e.message || e), 'bad'); }
      }
      /* aynı parça adıyla gelen dosyalar (süre ekranı + ayar ekranı gibi) tek satırda birleşir */
      var groups = {}, order = [];
      list.forEach(function (r) { var k = normName(r.name) || ('#' + order.length); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
      var added = 0;
      for (var g = 0; g < order.length; g++) {
        var src = groups[order[g]], m = I.mergeAll(src);
        b.set(t('pj.saving') + ' ' + (g + 1) + ' / ' + order.length);
        var row = newRow();
        row.name = m.name || src[0].file.name;
        row.qty = Math.max(1, Math.round(CALC.pos(m.qty) || 1));
        row.printMin = CALC.pos(m.printMin) || (CALC.pos(m.modelMin) + CALC.pos(m.prepMin));
        var pid = I._matchPrinter(m.printer); row.printerId = pid && pid !== p.printerId ? pid : '';
        if (m.printer && !pid) row.note = t('c.printer') + ': ' + m.printer;
        var fil = m.filaments && m.filaments.length ? m.filaments : [{ name: m.filament, type: m.filamentType, grams: m.grams, meters: m.meters, color: m.color }];
        row.materials = fil.filter(function (x) { return CALC.pos(x.grams) || x.name || x.type; }).map(function (x) {
          return { materialId: I._matchMaterial(x), grams: CALC.pos(x.grams) || (x.meters ? I._gramsFromMeters(x.meters, null, null, x.type) : 0), meters: CALC.pos(x.meters), name: x.name || '', matType: I._typeOf(x.type) || I._typeOf(x.name) || x.type || '', color: x.color || '' };
        });
        if (!row.materials.length) row.materials = [{ materialId: '', grams: CALC.pos(m.grams) }];
        row.settings = m.settings || {};
        for (var s = 0; s < src.length; s++) {
          var x = src[s];
          try {
            if (x.kind === 'image') row.photos.push(await A.saveImage(x.file, { source: 'slicer' }));
            else { if (x.thumb) row.photos.push(await A.saveImage(x.thumb, { source: 'slicer' })); row.files.push(await A.saveAttachment(x.file, { source: 'slicer' })); }
          } catch (e) { }
        }
        if (!row.printMin && !row.materials.some(function (mm) { return mm.grams; })) row.note = (row.note ? row.note + ' · ' : '') + t('pj.notRead');
        p.rows.push(row); added++;
      }
      return added;
    } finally { b.close(); }
  }
  async function addFiles(host, preset) {
    var files = await A.importer.chooser({ batch: true, files: preset });
    if (!files || !files.length) return;
    var n = await rowsFromFiles(cur, files);
    if (n) A.toast(t('pj.added', { n: n }), 'good');
    draw(host);
  }

  /* ---------------- liste ---------------- */
  function projects() { return (S.projects || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || String(b.code).localeCompare(String(a.code)); }); }
  function renderList(host) {
    var box = ui.el('div');
    var tb = ui.el('div.toolbar', { html: '<span class="muted">' + esc(t('pj.count', { n: projects().length })) + '</span><span class="fc-spacer"></span>' +
      '<button type="button" class="btn small primary" id="pjNew">' + A.icon('plus') + esc(t('pj.new')) + '</button>' });
    box.appendChild(tb);
    var list = projects();
    if (!list.length) {
      box.appendChild(ui.el('section.card', { html: '<div class="empty">' + A.icon('layers') + '<p>' + esc(t('pj.empty')) + '</p><button type="button" class="btn primary" id="pjNew2">' + A.icon('scan') + esc(t('pj.startFiles')) + '</button></div>' }));
    } else {
      var card = ui.el('section.card');
      card.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>' + esc(t('pj.code')) + '</th><th>' + esc(t('pj.name')) + '</th><th>' + esc(t('a.date')) + '</th><th class="r">' + esc(t('pj.parts')) + '</th><th class="r">' + esc(t('pj.time')) + '</th><th class="r">' + esc(t('pj.filament')) + '</th><th class="r">' + esc(t('pj.cost')) + '</th><th class="r">' + esc(t('pj.price')) + '</th><th class="r">' + esc(t('pj.profit')) + '</th><th></th></tr></thead><tbody>' +
        list.map(function (p) { var T = total(p), c = A.byId(S.customers, p.customerId);
          return '<tr data-id="' + esc(p.id) + '" class="clickable"><td class="mono">' + esc(p.code) + '</td><td><b>' + esc(p.name || '—') + '</b>' + (c ? '<small class="muted"> · ' + esc(c.name) + '</small>' : '') + ((p.jobIds || []).length ? ' <span class="badge ok">' + esc(t('pj.archived')) + '</span>' : '') + '</td><td>' + esc(A.date(p.date)) + '</td>' +
            '<td class="r">' + A.num(T.pieces) + '</td><td class="r">' + esc(CALC.fmtMin(T.hours * 60, t)) + '</td><td class="r">' + A.num(T.grams, 0) + ' g</td><td class="r">' + esc(A.money(T.cost)) + '</td><td class="r"><b>' + esc(A.money(T.price)) + '</b></td><td class="r ' + (T.profit >= 0 ? 'ok-text' : 'bad-text') + '">' + esc(A.money(T.profit)) + '</td>' +
            '<td class="acts">' + A.iconBtn('edit', t('a.edit'), 'ed') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      box.appendChild(card);
      A.$$('tr[data-id]', card).forEach(function (tr) {
        var p = A.byId(S.projects, tr.getAttribute('data-id'));
        tr.onclick = function (e) { if (e.target.closest('.del')) return; open(p); };
        tr.querySelector('.del').onclick = function () { A.confirmBox(t('pj.confirmDelete', { n: p.name || p.code }), async function () { await DB.del('projects', p.id); await A.reload(); A.render(); }); };
      });
    }
    host.appendChild(box);
    var go = function () { cur = newProject(); A.render(); };
    var n1 = box.querySelector('#pjNew'); if (n1) n1.onclick = go;
    var n2 = box.querySelector('#pjNew2'); if (n2) n2.onclick = function () { cur = newProject(); A.render(); setTimeout(function () { addFiles(document.getElementById('content')); }, 50); };
  }
  function open(p) { cur = JSON.parse(JSON.stringify(p)); A.render(); }

  /* ---------------- editör ---------------- */
  function render(host, arg) {
    if (arg && arg.open) { var pp = A.byId(S.projects || [], arg.open); if (pp) cur = JSON.parse(JSON.stringify(pp)); }
    if (arg && arg.files) { cur = cur || newProject(); setTimeout(function () { addFiles(host, arg.files); }, 30); }
    if (!cur) return renderList(host);
    draw(host);
  }
  function draw(host) {
    host = host || document.getElementById('content');
    var p = cur; host.innerHTML = '';
    var wrap = ui.el('div.pj');

    /* üst: proje bilgileri */
    var head = ui.el('section.card');
    head.innerHTML = '<h3 class="card-title">' + A.icon('layers') + '<span>' + esc(t('pj.project')) + '</span>' + (p.code ? '<em class="badge info">' + esc(p.code) + '</em>' : '<em class="badge">' + esc(t('c.newJob')) + '</em>') +
      '<span class="fc-spacer"></span><button type="button" class="btn small ghost" id="pjBack">' + A.icon('list') + esc(t('pj.all')) + '</button></h3>' +
      '<div class="form-grid pj-head">' +
      '<label class="field wide"><span class="field-label">' + esc(t('pj.name')) + ' *</span><input id="pjName" value="' + esc(p.name) + '" placeholder="' + esc(t('pj.namePh')) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('a.date')) + '</span><input id="pjDate" type="date" value="' + esc(p.date || A.today()) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('c.customer')) + '</span><select id="pjCust">' + A.opts(S.customers.slice().sort(A.byName), p.customerId, t('c.noCustomer')) + '</select></label>' +
      '<label class="field"><span class="field-label">' + esc(t('pj.printer')) + '</span><select id="pjPrn">' + A.opts(S.printers.slice().sort(A.byName), p.printerId, t('imp.noPrinter')) + '</select><span class="field-hint">' + esc(t('pj.printerHint')) + '</span></label>' +
      '<label class="field"><span class="field-label">' + esc(t('pj.margin')) + '</span><div class="inp-row"><input id="pjMargin" type="number" step="any" value="' + esc(CALC.num(p.margin)) + '"><span class="unit">%</span></div></label>' +
      '<label class="field"><span class="field-label">' + esc(t('pj.projLabor')) + '</span><div class="inp-row"><input id="pjLabor" type="number" min="0" step="any" value="' + esc(CALC.pos(p.laborMin) || '') + '" placeholder="0"><span class="unit">' + esc(t('u.min')) + '</span></div><span class="field-hint">' + esc(t('pj.projLaborHint')) + '</span></label>' +
      '<label class="field"><span class="field-label">' + esc(t('pj.round')) + '</span><div class="inp-row"><input id="pjRound" type="number" min="0" step="any" value="' + esc(CALC.pos(p.roundTo) ? +CALC.convert(p.roundTo, S.settings.currency, S.settings).toFixed(2) : '') + '" placeholder="0"><span class="unit">' + esc(S.settings.currency) + '</span></div></label>' +
      '<label class="field wide"><span class="field-label">' + esc(t('a.note')) + '</span><input id="pjNote" value="' + esc(p.note || '') + '"></label>' +
      '</div>';
    wrap.appendChild(head);

    /* parçalar tablosu */
    var rowsCard = ui.el('section.card');
    var T = total(p);
    rowsCard.innerHTML = '<h3 class="card-title">' + A.icon('list') + '<span>' + esc(t('pj.rows')) + '</span><em class="badge">' + p.rows.length + '</em><span class="fc-spacer"></span>' +
      '<button type="button" class="btn small" id="pjRow">' + A.icon('plus') + esc(t('pj.addRow')) + '</button>' +
      '<button type="button" class="btn small primary" id="pjFiles">' + A.icon('scan') + esc(t('pj.addFiles')) + '</button></h3>' +
      (p.rows.length ? '' : '<div class="drop pj-drop" id="pjDrop">' + A.icon('upload') + '<b>' + esc(t('pj.dropTitle')) + '</b><span>' + esc(t('pj.dropHint')) + '</span></div>');
    if (p.rows.length) {
      var matSorted = S.materials.slice().sort(function (a, b) { return String(a.matType || '').localeCompare(String(b.matType || '')) || A.byName(a, b); });
      var mLabel = function (m) { return [m.serial, m.matType, m.brand, m.name].filter(Boolean).join(' · '); };
      var tbl = '<div class="tablewrap"><table class="tbl pj-tbl"><thead><tr><th></th><th>' + esc(t('pj.part')) + '</th><th class="r">' + esc(t('c.qty')) + '</th><th class="r" title="' + esc(t('pj.timesHint')) + '">' + esc(t('pj.times')) + '</th><th>' + esc(t('pj.time')) + '</th><th>' + esc(t('pj.filament')) + '</th><th>' + esc(t('c.printer')) + '</th><th class="r">' + esc(t('pj.cost')) + '</th><th class="r">' + esc(t('pj.price')) + '</th><th></th></tr></thead><tbody>' +
        p.rows.map(function (r, i) {
          var c = T.rows[i];
          return '<tr data-i="' + i + '"><td>' + (r.photos && r.photos[0] ? '<span class="thumb sm pj-ph"><img data-thumb="' + esc(r.photos[0]) + '" alt=""></span>' : '<span class="thumb sm">' + A.icon(r.files && r.files.length ? 'file' : 'image') + '</span>') + '</td>' +
            '<td><input class="rN" value="' + esc(r.name) + '">' + (r.note ? '<small class="muted pj-note">' + esc(r.note) + '</small>' : '') + '</td>' +
            '<td class="r"><input class="rQ num" type="number" min="1" step="1" value="' + esc(r.qty || 1) + '"></td>' +
            '<td class="r"><input class="rK num" type="number" min="1" step="1" value="' + esc(r.times || 1) + '"></td>' +
            '<td><input class="rT" value="' + esc(A.importer.fmtDur(r.printMin)) + '" placeholder="1h15m"><small class="muted">' + esc(t('pj.prep')) + ' <input class="rP mini" value="' + esc(A.importer.fmtDur(r.prepMin)) + '" placeholder="0m"></small></td>' +
            '<td class="pj-mats">' + (r.materials || []).map(function (m, j) {
              var hint = !m.materialId && (m.matType || m.name) ? ' title="“' + esc([m.matType, m.name].filter(Boolean).join(' · ')) + '”"' : '';
              return '<div class="pj-mat" data-j="' + j + '"><span class="dot" style="background:' + esc(((m.materialId && (A.byId(S.materials, m.materialId) || {}).color) || m.color || 'transparent')) + '"></span><select class="rM"' + hint + '>' + A.opts(matSorted, m.materialId, (m.matType || m.name) ? '? ' + [m.matType, m.name].filter(Boolean).join(' · ') : t('imp.noMaterial'), mLabel) + '</select><input class="rG num" type="number" min="0" step="any" value="' + esc(m.grams ? +(+m.grams).toFixed(2) : '') + '" placeholder="0"><span class="unit">g</span>' + ((r.materials.length > 1) ? A.iconBtn('x', t('a.delete'), 'rMx') : '') + '</div>';
            }).join('') + '<button type="button" class="link-btn rMadd">+ ' + esc(t('pj.addMat')) + '</button></td>' +
            '<td><select class="rPr">' + '<option value="">' + esc(t('pj.projPrinter')) + '</option>' + S.printers.slice().sort(A.byName).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === r.printerId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></td>' +
            '<td class="r"><b>' + esc(A.money(c.cost)) + '</b><small class="muted">' + A.num(c.grams, 0) + ' g · ' + esc(CALC.fmtMin(c.hours * 60, t)) + '</small></td>' +
            '<td class="r">' + esc(A.money(c.price)) + '<small class="muted">' + esc(A.money(c.unitPrice)) + ' / ' + esc(t('u.pcs')) + '</small></td>' +
            '<td class="acts">' + A.iconBtn('copy', t('a.copy'), 'rDup') + A.iconBtn('trash', t('a.delete'), 'rDel danger') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      rowsCard.insertAdjacentHTML('beforeend', tbl);
    }
    wrap.appendChild(rowsCard);

    /* toplu hesap */
    wrap.appendChild(summary(p, T));

    /* alt düğmeler */
    var foot = ui.el('div.pj-foot');
    foot.innerHTML = (p.id ? '<button type="button" class="btn danger-soft" id="pjDel">' + A.icon('trash') + esc(t('a.delete')) + '</button>' : '') + '<span class="fc-spacer"></span>' +
      '<button type="button" class="btn" id="pjCsv">' + A.icon('download') + 'CSV</button>' +
      '<button type="button" class="btn" id="pjPrint">' + A.icon('print') + esc(t('pj.report')) + '</button>' +
      '<button type="button" class="btn" id="pjQuote">' + A.icon('file') + esc(t('q.title')) + '</button>' +
      '<button type="button" class="btn" id="pjArch">' + A.icon('archive') + esc(t('pj.toArchive')) + '</button>' +
      '<button type="button" class="btn primary" id="pjSave">' + A.icon('check') + esc(t('a.save')) + '</button>';
    wrap.appendChild(foot);
    host.appendChild(wrap);
    A.fillThumbs(host);
    wire(host);
  }

  function summary(p, T) {
    var box = ui.el('section.card.pj-sum');
    var cards = [
      [t('pj.parts'), A.num(T.pieces) + (T.plates !== p.rows.length ? ' · ' + t('pj.plates', { n: T.plates }) : '')],
      [t('pj.totalTime'), CALC.fmtMin(T.hours * 60, t)],
      [t('pj.totalFil'), A.num(T.grams, 0) + ' g' + (T.grams >= 1000 ? ' (' + A.num(T.grams / 1000, 2) + ' kg)' : '')],
      [t('pj.energy'), A.num(T.kwh, 2) + ' kWh · ' + A.money(T.energy)],
      [t('pj.totalCost'), A.money(T.cost)],
      [t('pj.totalPrice'), A.money(T.price)],
      [t('pj.totalProfit'), A.money(T.profit) + ' · %' + A.num(T.margin, 1)],
      [t('pj.perPiece'), T.pieces ? A.money(T.cost / T.pieces) + ' → ' + A.money(T.price / T.pieces) : '—']
    ];
    var h = '<h3 class="card-title">' + A.icon('chart') + '<span>' + esc(t('pj.summary')) + '</span></h3><div class="stats pj-stats">' +
      cards.map(function (c, i) { return '<div class="stat' + (i === 6 ? (T.profit >= 0 ? ' ok' : ' bad') : '') + '"><span>' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b></div>'; }).join('') + '</div>';
    var items = Object.keys(T.byItem).map(function (k) { return T.byItem[k]; }).filter(function (x) { return x.value > 0.00001; }).sort(function (a, b) { return b.value - a.value; });
    h += '<div class="pj-cols"><div><h4>' + esc(t('pj.breakdown')) + '</h4><table class="kv">' + items.map(function (x) { return '<tr><th><i class="dot" style="background:' + esc(x.color || 'var(--muted)') + '"></i> ' + esc(x.name) + '</th><td class="r">' + esc(A.money(x.value)) + '</td><td class="r muted">' + (T.cost ? A.num(x.value / T.cost * 100, 1) + '%' : '') + '</td></tr>'; }).join('') +
      (T.fees > 0.00001 ? '<tr><th>' + esc(t('pj.fees')) + '</th><td class="r">' + esc(A.money(T.fees)) + '</td><td></td></tr>' : '') + '<tr><th><b>' + esc(t('pj.totalCost')) + '</b></th><td class="r"><b>' + esc(A.money(T.cost)) + '</b></td><td></td></tr></table></div>';
    var mats = Object.keys(T.byMat).map(function (k) { return T.byMat[k]; }).sort(function (a, b) { return b.grams - a.grams; });
    h += '<div><h4>' + esc(t('pj.filUse')) + '</h4><table class="kv">' + mats.map(function (m) {
      var warn = '';
      if (m.mat) { var w = CALC.pos(m.mat.weightG), left = A.stockOf(m.mat.id) * w; if (w && m.grams > left + 0.5) warn = ' <span class="badge danger">' + esc(t('pj.short', { g: A.num(m.grams - left, 0) })) + '</span>'; }
      else warn = ' <span class="badge warn">' + esc(t('pj.noStock')) + '</span>';
      return '<tr><th><i class="dot" style="background:' + esc(m.color || 'transparent') + '"></i> ' + esc(m.name) + warn + '</th><td class="r">' + A.num(m.grams, 0) + ' g</td><td class="r">' + esc(A.money(m.cost)) + '</td></tr>';
    }).join('') + Object.keys(T.byType).sort().map(function (k, i) { return (i === 0 ? '<tr><td colspan="3" class="muted small">' + esc(t('pj.byType')) + '</td></tr>' : '') + '<tr><th>' + esc(k) + '</th><td class="r">' + A.num(T.byType[k], 0) + ' g</td><td></td></tr>'; }).join('') + '</table>' +
      '<p class="muted small">' + esc(t('pj.energyNote', { k: A.num(S.settings.kwhPrice ? CALC.convert(S.settings.kwhPrice, S.settings.currency, S.settings) : 0, 2), c: S.settings.currency })) + '</p></div></div>';
    box.innerHTML = h;
    return box;
  }

  function readHead(host) {
    var q = function (s) { return host.querySelector(s); };
    cur.name = q('#pjName').value.trim(); cur.date = q('#pjDate').value; cur.customerId = q('#pjCust').value; cur.printerId = q('#pjPrn').value;
    cur.margin = CALC.num(q('#pjMargin').value); cur.laborMin = CALC.pos(q('#pjLabor').value); cur.note = q('#pjNote').value;
    cur.roundTo = CALC.toUsd(CALC.pos(q('#pjRound').value), S.settings.currency, S.settings);
  }
  var redrawT = null;
  function soon(host) { clearTimeout(redrawT); redrawT = setTimeout(function () { var a = document.activeElement, sel = a && a.closest && a.closest('tr[data-i]') ? { i: a.closest('tr[data-i]').getAttribute('data-i'), c: a.className, j: a.closest('.pj-mat') ? a.closest('.pj-mat').getAttribute('data-j') : null, s: a.selectionStart } : a && a.id ? { id: a.id, s: a.selectionStart } : null;
    draw(host);
    if (sel) { var el = sel.id ? host.querySelector('#' + sel.id) : host.querySelector('tr[data-i="' + sel.i + '"] ' + (sel.j != null ? '.pj-mat[data-j="' + sel.j + '"] ' : '') + '.' + String(sel.c).split(' ')[0]); if (el) { el.focus(); try { if (sel.s != null) el.setSelectionRange(sel.s, sel.s); } catch (e) { } } }
  }, 450); }

  function wire(host) {
    var q = function (s) { return host.querySelector(s); };
    q('#pjBack').onclick = function () { cur = null; A.render(); };
    ['#pjName', '#pjDate', '#pjNote'].forEach(function (s) { q(s).oninput = function () { readHead(host); }; });
    ['#pjCust', '#pjPrn'].forEach(function (s) { q(s).onchange = function () { readHead(host); draw(host); }; });
    ['#pjMargin', '#pjLabor', '#pjRound'].forEach(function (s) { q(s).oninput = function () { readHead(host); soon(host); }; });
    q('#pjFiles').onclick = function () { readHead(host); addFiles(host); };
    q('#pjRow').onclick = function () { readHead(host); cur.rows.push(newRow()); draw(host); };
    var drop = q('#pjDrop');
    if (drop) {
      drop.onclick = function () { readHead(host); addFiles(host); };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); readHead(host); var fs = Array.prototype.slice.call(e.dataTransfer.files || []); if (fs.length) rowsFromFiles(cur, fs).then(function () { draw(host); }); };
    }
    A.$$('tr[data-i]', host).forEach(function (tr) {
      var r = cur.rows[+tr.getAttribute('data-i')];
      var s = function (sel) { return tr.querySelector(sel); };
      s('.rN').oninput = function (e) { r.name = e.target.value; };
      s('.rQ').oninput = function (e) { r.qty = Math.max(1, Math.round(CALC.pos(e.target.value)) || 1); soon(host); };
      s('.rK').oninput = function (e) { r.times = Math.max(1, Math.round(CALC.pos(e.target.value)) || 1); soon(host); };
      s('.rT').onchange = function (e) { r.printMin = A.importer.dur(e.target.value); draw(host); };
      s('.rP').onchange = function (e) { r.prepMin = A.importer.dur(e.target.value); draw(host); };
      s('.rPr').onchange = function (e) { r.printerId = e.target.value; draw(host); };
      A.$$('.pj-mat', tr).forEach(function (md) {
        var j = +md.getAttribute('data-j'), m = r.materials[j];
        md.querySelector('.rM').onchange = function (e) { m.materialId = e.target.value; draw(host); };
        md.querySelector('.rG').oninput = function (e) { m.grams = CALC.pos(e.target.value); soon(host); };
        var x = md.querySelector('.rMx'); if (x) x.onclick = function () { r.materials.splice(j, 1); draw(host); };
      });
      s('.rMadd').onclick = function () { r.materials.push({ materialId: '', grams: 0 }); draw(host); };
      s('.rDup').onclick = function () { var c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.jobId = null; cur.rows.splice(cur.rows.indexOf(r) + 1, 0, c); draw(host); };
      s('.rDel').onclick = function () { cur.rows.splice(cur.rows.indexOf(r), 1); draw(host); };
      var ph = tr.querySelector('.pj-ph'); if (ph) ph.onclick = function () { A.lightbox(r.photos, 0); };
    });
    q('#pjSave').onclick = function () { readHead(host); save(true); };
    q('#pjArch').onclick = function () { readHead(host); toArchive(host); };
    q('#pjPrint').onclick = function () { readHead(host); report(false); };
    q('#pjQuote').onclick = function () { readHead(host); report(true); };
    q('#pjCsv').onclick = function () { readHead(host); csv(); };
    var del = q('#pjDel'); if (del) del.onclick = function () { A.confirmBox(t('pj.confirmDelete', { n: cur.name || cur.code }), async function () { await DB.del('projects', cur.id); cur = null; await A.reload(); A.render(); }); };
  }

  async function save(toast) {
    if (!cur.name) { if (cur.rows[0]) cur.name = cur.rows.length === 1 ? cur.rows[0].name : cur.rows[0].name + ' +' + (cur.rows.length - 1); else { A.toast(t('a.required', { f: t('pj.name') }), 'bad'); var n = document.getElementById('pjName'); if (n) n.focus(); return null; } }
    var T = total(cur);
    var d = JSON.parse(JSON.stringify(cur));
    if (!d.code) d.code = DB.nextSerial('PR', S.projects || [], 'code');
    d.totals = { pieces: T.pieces, hours: T.hours, grams: T.grams, kwh: T.kwh, energy: T.energy, cost: T.cost, price: T.price, profit: T.profit };
    var saved = await DB.put('projects', d);
    cur = JSON.parse(JSON.stringify(saved));
    await A.reload();
    if (toast) A.toast(t('pj.saved', { c: saved.code }), 'good');
    draw();
    return saved;
  }

  /* her satır → Arşiv'de ayrı iş (proje kodu etiketli); daha önce işlenmiş satır güncellenir */
  function toArchive(host) {
    if (!cur.rows.length) return;
    var st = A.calc.statuses(), def = st.filter(function (x) { return x.key === 'done'; })[0] || st[0];
    var body = ui.el('div', { html: '<p>' + esc(t('pj.archAsk', { n: cur.rows.length })) + '</p><div class="form-grid"><label class="field"><span class="field-label">' + esc(t('c.status')) + '</span><select id="aSt">' + A.opts(st, def ? def.id : '', false) + '</select></label>' +
      '<label class="check wide"><input type="checkbox" id="aDed" checked><span>' + esc(t('pj.deduct')) + '</span></label></div>' });
    ui.modal({ title: t('pj.toArchive'), icon: 'archive', cls: 'small', body: body, buttons: [{ label: t('a.cancel'), cls: 'ghost' }, 'spacer', { label: t('pj.toArchive'), icon: 'check', cls: 'primary', onClick: function (close, btn) {
      if (btn) btn.disabled = true;
      var sid = body.querySelector('#aSt').value, ded = body.querySelector('#aDed').checked;
      (async function () {
        var p = await save(false); if (!p) return;
        var n = 0;
        for (var i = 0; i < cur.rows.length; i++) {
          var r = cur.rows[i], k = Math.max(1, Math.round(CALC.pos(r.times) || 1));
          var old = r.jobId ? A.byId(S.jobs, r.jobId) : null;
          var d = old ? JSON.parse(JSON.stringify(old)) : A.calc.newDraft();
          d.name = r.name || (cur.name + ' #' + (i + 1)); d.qty = Math.max(1, Math.round(CALC.pos(r.qty) || 1)) * k; d.printMin = CALC.pos(r.printMin) * k; d.prepMin = CALC.pos(r.prepMin) * k;
          d.printerId = r.printerId || cur.printerId; d.customerId = cur.customerId; d.date = cur.date || A.today(); d.statusId = sid; d.margin = cur.margin;
          d.materials = (r.materials || []).filter(function (m) { return m.materialId || CALC.pos(m.grams); }).map(function (m) { return { materialId: m.materialId, grams: CALC.pos(m.grams) * k, meters: CALC.pos(m.meters) * k, kgPrice: CALC.pos(m.kgPrice), name: m.name, matType: m.matType, color: m.color }; });
          if (!d.materials.length) d.materials = [{ materialId: '', grams: 0 }];
          d.settings = Object.assign({}, d.settings || {}, r.settings || {}); d.photos = (r.photos || []).slice(); d.files = (r.files || []).slice();
          d.tags = [cur.code, cur.name].filter(Boolean).join(', '); d.projectId = p.id; d.note = [r.note, t('pj.fromProject', { c: cur.code + ' ' + cur.name })].filter(Boolean).join('\n');
          d.deduct = ded;
          var job = await A.calc.save(d, false, { quiet: true });
          if (job) { r.jobId = job.id; n++; }
        }
        cur.jobIds = cur.rows.map(function (r) { return r.jobId; }).filter(Boolean);
        await save(false);
        close();
        A.toast(t('pj.archDone', { n: n }), 'good');
      })().catch(function (e) { if (btn) btn.disabled = false; A.toast(String(e && e.message || e), 'bad'); });
      return false;
    } }] });
  }

  function rowsText(p, T, quote) {
    return p.rows.map(function (r, i) {
      var c = T.rows[i];
      var mats = (r.materials || []).map(function (m) { var mm = m.materialId ? A.byId(S.materials, m.materialId) : null; return (mm ? [mm.matType, mm.name].filter(Boolean).join(' ') : [m.matType, m.name].filter(Boolean).join(' ')) + (m.grams ? ' ' + Math.round(CALC.pos(m.grams) * c.times) + ' g' : ''); }).join(', ');
      return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.name || '') + '</b><div class="muted">' + esc(mats) + '</div></td><td class="r">' + c.qty + '</td>' +
        (quote ? '<td class="r">' + esc(A.money(c.unitPrice)) + '</td><td class="r"><b>' + esc(A.money(c.price)) + '</b></td>'
          : '<td class="r">' + esc(CALC.fmtMin(c.hours * 60, t)) + '</td><td class="r">' + A.num(c.grams, 0) + ' g</td><td class="r">' + A.num(c.kwh, 2) + '</td><td class="r">' + esc(A.money(c.cost)) + '</td><td class="r">' + esc(A.money(c.price)) + '</td><td class="r">' + esc(A.money(c.profit)) + '</td>') + '</tr>';
    }).join('');
  }
  function report(quote) {
    var p = cur, T = total(p), c = A.byId(S.customers, p.customerId), biz = S.settings.bizName || t('app.name');
    var h = '<table style="border:none"><tr><td style="border:none"><h1>' + esc(biz) + '</h1><div class="muted">' + esc(S.settings.bizInfo || '') + '</div></td><td style="border:none;text-align:end"><h2>' + esc(quote ? t('q.title') : t('pj.report')) + '</h2><div>' + esc(A.date(p.date || A.today())) + '</div><div class="muted">' + esc([p.code, p.name].filter(Boolean).join(' · ')) + '</div></td></tr></table>' +
      (c ? '<p><b>' + esc(t('c.customer')) + ':</b> ' + esc(c.name) + '</p>' : '');
    if (quote) {
      h += '<table><thead><tr><th>#</th><th>' + esc(t('q.item')) + '</th><th class="r">' + esc(t('c.qty')) + '</th><th class="r">' + esc(t('q.unit')) + '</th><th class="r">' + esc(t('q.total')) + '</th></tr></thead><tbody>' + rowsText(p, T, true) + '</tbody></table>' +
        '<p class="big" style="text-align:end">' + esc(t('q.total')) + ': ' + esc(A.money(T.price)) + '</p><p class="muted" style="text-align:end">' + esc(A.moneyAlt(T.price)) + '</p><p class="muted">' + esc(S.settings.quoteNote || t('q.note')) + '</p>';
    } else {
      h += '<table><thead><tr><th>#</th><th>' + esc(t('pj.part')) + '</th><th class="r">' + esc(t('c.qty')) + '</th><th class="r">' + esc(t('pj.time')) + '</th><th class="r">' + esc(t('pj.filament')) + '</th><th class="r">kWh</th><th class="r">' + esc(t('pj.cost')) + '</th><th class="r">' + esc(t('pj.price')) + '</th><th class="r">' + esc(t('pj.profit')) + '</th></tr></thead><tbody>' + rowsText(p, T, false) +
        '<tr><td></td><td><b>' + esc(t('q.total')) + '</b></td><td class="r"><b>' + T.pieces + '</b></td><td class="r"><b>' + esc(CALC.fmtMin(T.hours * 60, t)) + '</b></td><td class="r"><b>' + A.num(T.grams, 0) + ' g</b></td><td class="r"><b>' + A.num(T.kwh, 2) + '</b></td><td class="r"><b>' + esc(A.money(T.cost)) + '</b></td><td class="r"><b>' + esc(A.money(T.price)) + '</b></td><td class="r"><b>' + esc(A.money(T.profit)) + '</b></td></tr></tbody></table>';
      var items = Object.keys(T.byItem).map(function (k) { return T.byItem[k]; }).filter(function (x) { return x.value > 0.00001; });
      h += '<h2>' + esc(t('pj.breakdown')) + '</h2><table>' + items.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="r">' + esc(A.money(x.value)) + '</td></tr>'; }).join('') + '<tr><td><b>' + esc(t('pj.totalCost')) + '</b></td><td class="r"><b>' + esc(A.money(T.cost)) + '</b></td></tr></table>';
      h += '<h2>' + esc(t('pj.filUse')) + '</h2><table>' + Object.keys(T.byMat).map(function (k) { var m = T.byMat[k]; return '<tr><td>' + (m.color ? '<span class="dot" style="background:' + esc(m.color) + '"></span>' : '') + esc(m.name) + '</td><td class="r">' + A.num(m.grams, 0) + ' g</td><td class="r">' + esc(A.money(m.cost)) + '</td></tr>'; }).join('') + '</table>';
      h += '<p>' + esc(t('pj.energy')) + ': ' + A.num(T.kwh, 2) + ' kWh · ' + esc(A.money(T.energy)) + ' &nbsp; · &nbsp; ' + esc(t('pj.totalTime')) + ': ' + esc(CALC.fmtMin(T.hours * 60, t)) + '</p>' + (p.note ? '<p class="muted">' + esc(p.note) + '</p>' : '');
    }
    A.printHtml((quote ? t('q.title') : t('pj.report')) + ' ' + (p.name || ''), h);
  }
  function csv() {
    var p = cur, T = total(p);
    var rows = [[t('pj.part'), t('c.qty'), t('pj.times'), t('pj.time') + ' (' + t('u.min') + ')', t('pj.filament') + ' (g)', 'kWh', t('pj.cost'), t('pj.price'), t('pj.profit'), t('c.printer')]];
    p.rows.forEach(function (r, i) { var c = T.rows[i]; rows.push([r.name, c.qty, c.times, Math.round(c.hours * 60), +c.grams.toFixed(2), +c.kwh.toFixed(3), +CALC.convert(c.cost, S.settings.currency, S.settings).toFixed(2), +CALC.convert(c.price, S.settings.currency, S.settings).toFixed(2), +CALC.convert(c.profit, S.settings.currency, S.settings).toFixed(2), (rowPrinter(p, r).name || '')]); });
    rows.push([t('q.total'), T.pieces, T.plates, Math.round(T.hours * 60), +T.grams.toFixed(2), +T.kwh.toFixed(3), +CALC.convert(T.cost, S.settings.currency, S.settings).toFixed(2), +CALC.convert(T.price, S.settings.currency, S.settings).toFixed(2), +CALC.convert(T.profit, S.settings.currency, S.settings).toFixed(2), '']);
    A.saveOut((p.code || 'proje') + '-' + A.today() + '.csv', new Blob([A.csv(rows)], { type: 'text/csv' }));
  }

  A.page('projects', { icon: 'layers', group: 'production', render: render });
  A.projects = { total: total, rowCalc: rowCalc, newProject: newProject, newRow: newRow, rowsFromFiles: rowsFromFiles, current: function () { return cur; }, set: function (p) { cur = p; } };
})();
