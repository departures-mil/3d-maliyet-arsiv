/* YAZICILAR — her yazıcının kartı ve kayıtları: bilgiler, toplam baskı saati, işler, filament, ciro/kâr, başarısız baskılar,
   bakım/arıza/parça değişimi geçmişi ve saat aralıklı bakım planı (ör. 500 saatte bir nozzle). Hepsi eklenir, silinir, adı değişir. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  function stats(p) {
    var jobs = S.jobs.filter(function (j) { return j.printerId === p.id; });
    var r = { jobs: jobs.length, printed: 0, min: 0, grams: 0, revenue: 0, profit: 0, failed: 0, cost: 0 };
    jobs.forEach(function (j) {
      var s = A.byId(S.lists, j.statusId) || {};
      if (s.printed !== false) { r.printed++; r.min += CALC.pos(j.printMin); r.grams += CALC.num(j.calc && j.calc.grams); }
      if (s.key === 'failed') r.failed++;
      if (s.sold !== false && s.printed !== false) { r.revenue += CALC.num(j.calc && j.calc.price); r.profit += CALC.num(j.calc && j.calc.profit); }
    });
    var logs = S.printerLogs.filter(function (l) { return l.printerId === p.id; });
    r.logCost = logs.reduce(function (s, l) { return s + CALC.num(l.cost); }, 0);
    r.hours = CALC.pos(p.initialHours) + r.min / 60;
    return r;
  }
  function dueTasks(p, st) {
    st = st || stats(p);
    return (p.tasks || []).map(function (k) {
      var since = st.hours - CALC.num(k.lastHours), every = CALC.pos(k.every);
      return { task: k, since: since, left: every ? every - since : Infinity, due: every > 0 && since >= every, soon: every > 0 && since >= every * 0.9 };
    });
  }
  A.printerStats = stats;

  function render(host) {
    var tb = ui.el('div.toolbar');
    tb.innerHTML = '<span class="muted">' + esc(t('p.count', { n: S.printers.length })) + '</span><span class="fc-spacer"></span><button type="button" class="btn small primary" id="pNew">' + A.icon('plus') + esc(t('p.new')) + '</button>';
    host.appendChild(tb);
    tb.querySelector('#pNew').onclick = function () { form(null); };
    if (!S.printers.length) { host.appendChild(ui.el('div.card.empty', { html: A.icon('printer') + '<p>' + esc(t('p.empty')) + '</p>' })); return; }
    var g = ui.el('div.pgrid');
    S.printers.slice().sort(A.byName).forEach(function (p) {
      var st = stats(p), due = dueTasks(p, st).filter(function (d) { return d.due || d.soon; });
      var stl = A.byId(S.lists, p.statusId) || {};
      var c = ui.el('article.card.pcard');
      c.innerHTML = '<div class="pc-head"><span class="thumb lg">' + (p.photoId ? '<img data-thumb="' + esc(p.photoId) + '" alt="">' : A.icon('printer')) + '</span><div><h3>' + esc(p.name) + '</h3><small class="muted">' + esc([p.brand, p.model].filter(Boolean).join(' ')) + (p.serial ? ' · <span class="mono">' + esc(p.serial) + '</span>' : '') + '</small>' +
        (stl.name ? '<div><span class="badge st" style="--c:' + esc(stl.color || 'var(--accent)') + '">' + esc(stl.name) + '</span></div>' : '') + '</div></div>' +
        '<div class="pc-stats">' + kv(t('p.hours'), A.num(st.hours, 1)) + kv(t('p.jobs'), A.num(st.printed)) + kv(t('p.filament'), A.num(st.grams / 1000, 2) + ' kg') + kv(t('p.revenue'), A.money(st.revenue)) + kv(t('p.profit'), A.money(st.profit)) + kv(t('p.failed'), A.num(st.failed)) + '</div>' +
        (due.length ? '<div class="pc-due">' + due.map(function (d) { return '<span class="badge ' + (d.due ? 'danger' : 'warn') + '">' + A.icon('tool') + esc(d.task.name) + (d.due ? ' — ' + esc(t('p.due')) : ' — ' + esc(t('p.leftH', { n: A.num(d.left, 0) }))) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="btn-row"><button type="button" class="btn small" data-a="log">' + A.icon('plus') + esc(t('p.addLog')) + '</button><button type="button" class="btn small" data-a="jobs">' + A.icon('archive') + esc(t('p.showJobs')) + '</button><span class="fc-spacer"></span>' + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</div>';
      c.querySelector('.pc-head').onclick = function () { detail(p); };
      c.querySelector('.pc-stats').onclick = function () { detail(p); };
      c.querySelector('[data-a=log]').onclick = function () { logForm(p, null); };
      c.querySelector('[data-a=jobs]').onclick = function () { A.go('archive', { printer: p.id }); };
      c.querySelector('.edit').onclick = function () { form(p); };
      c.querySelector('.del').onclick = function () { A.confirmBox(t('p.confirmDelete', { n: p.name }), async function () { await DB.del('printers', p.id); await A.reload(); A.render(); }); };
      g.appendChild(c);
    });
    host.appendChild(g);
  }
  function kv(l, v) { return '<div><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }

  function form(p, after) {
    var isNew = !p; p = p || { watt: 150, price: 400, lifeHours: 5000, nozzle: '0.4', tasks: [] };
    var cur = S.settings.currency, photoId = p.photoId || null;
    var photoHtml = '<div class="field wide"><span class="field-label">' + esc(t('a.photo')) + '</span><div class="photo-pick" id="fpPhoto">' + (p.photoId ? '<img data-thumb="' + esc(p.photoId) + '" alt="">' : A.icon('image')) + '<span>' + esc(t('a.photoHint')) + '</span></div></div>';
    var md = A.formModal({ title: isNew ? t('p.new') : t('p.edit'), icon: 'printer', wide: true, fields: [
      { k: 'name', label: t('a.name'), value: p.name, req: true, placeholder: 'Zaxe Z3S, Bambu P1S…' },
      { k: 'brand', label: t('p.brand'), value: p.brand }, { k: 'model', label: t('p.model'), value: p.model },
      { k: 'serial', label: t('m.col.serial'), value: p.serial || DB.nextSerial('Y', S.printers) },
      { k: 'statusId', label: t('c.status'), type: 'select', value: p.statusId || '', options: [{ v: '', l: '—' }].concat(A.listOf('printerStatus').map(function (x) { return { v: x.id, l: x.name }; })) },
      { k: 'locationId', label: t('m.col.location'), type: 'select', value: p.locationId || '', options: [{ v: '', l: '—' }].concat(S.locations.map(function (l) { return { v: l.id, l: l.name }; })) },
      { k: 'nozzle', label: t('p.nozzle'), value: p.nozzle, placeholder: '0.4' }, { k: 'bed', label: t('p.bed'), value: p.bed, placeholder: '256×256×256' },
      { k: 'watt', label: t('p.watt'), type: 'number', value: p.watt, hint: t('p.wattHint') },
      { k: 'price', label: t('p.price', { c: cur }), type: 'number', value: p.price ? +CALC.convert(p.price, cur, S.settings).toFixed(2) : '' },
      { k: 'lifeHours', label: t('p.life'), type: 'number', value: p.lifeHours, hint: t('p.lifeHint') },
      { k: 'initialHours', label: t('p.initialHours'), type: 'number', value: p.initialHours || 0, hint: t('p.initialHint') },
      { k: 'purchaseDate', label: t('p.purchase'), type: 'date', value: p.purchaseDate || '' },
      { k: 'defMaterialId', label: t('p.defMaterial'), type: 'select', value: p.defMaterialId || '', options: [{ v: '', l: '—' }].concat(S.materials.map(function (m) { return { v: m.id, l: [m.serial, m.name, m.brand, m.matType].filter(Boolean).join(' · ') }; })) },
      { k: 'aliases', label: t('p.aliases'), value: p.aliases || '', wide: true, hint: t('p.aliasesHint') },
      { type: 'html', html: photoHtml },
      { k: 'note', label: t('a.note'), type: 'textarea', value: p.note, wide: true }
    ].concat(A.fields.formFields('printer', p)), onSave: async function (v) {
      var d = isNew ? { tasks: defaultTasks() } : Object.assign({}, p);
      ['name', 'brand', 'model', 'serial', 'nozzle', 'bed', 'purchaseDate', 'note', 'aliases'].forEach(function (k) { d[k] = v[k]; });
      d.statusId = v.statusId || null; d.locationId = v.locationId || null; d.defMaterialId = v.defMaterialId || null;
      d.watt = CALC.pos(v.watt); d.price = CALC.toUsd(CALC.pos(v.price), cur, S.settings); d.lifeHours = CALC.pos(v.lifeHours); d.initialHours = CALC.pos(v.initialHours);
      d.photoId = photoId; d.custom = Object.assign({}, d.custom || {}, A.fields.read('printer', v));
      var saved = await DB.put('printers', d);
      if (!S.settings.defPrinterId) await DB.saveSettings({ defPrinterId: saved.id });
      await A.reload(); A.render(); if (after) after(saved);
    } });
    var ph = md.el.querySelector('#fpPhoto');
    ph.onclick = async function () { var f = (await A.pickFiles('image/*'))[0]; if (!f) return; photoId = await A.saveImage(f, { ref: 'printer' }); ph.innerHTML = '<img data-thumb="' + esc(photoId) + '" alt="">'; A.fillThumbs(ph); };
    A.fillThumbs(md.el);
  }
  function defaultTasks() {
    return [{ id: DB.uid(), name: t('p.t.nozzle'), every: 500, lastHours: 0 }, { id: DB.uid(), name: t('p.t.lube'), every: 200, lastHours: 0 },
      { id: DB.uid(), name: t('p.t.belts'), every: 300, lastHours: 0 }, { id: DB.uid(), name: t('p.t.clean'), every: 100, lastHours: 0 }];
  }

  function detail(p) {
    var st = stats(p);
    var body = ui.el('div.pdetail');
    function draw() {
      st = stats(p);
      var logs = S.printerLogs.filter(function (l) { return l.printerId === p.id; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var info = [[t('p.brand'), p.brand], [t('p.model'), p.model], [t('m.col.serial'), p.serial], [t('p.nozzle'), p.nozzle], [t('p.bed'), p.bed], [t('p.watt'), p.watt ? p.watt + ' W' : ''],
        [t('p.price', { c: S.settings.currency }), p.price ? A.money(p.price) : ''], [t('p.life'), p.lifeHours ? A.num(p.lifeHours) + ' ' + t('u.h') : ''], [t('p.purchase'), p.purchaseDate ? A.date(p.purchaseDate) : ''],
        [t('m.col.location'), A.nameOf(S.locations, p.locationId, '')], [t('p.wearPerH'), p.lifeHours ? A.money(CALC.pos(p.price) / CALC.pos(p.lifeHours)) : ''], [t('p.logCost'), A.money(st.logCost)]].concat(A.fields.show('printer', p)).filter(function (x) { return x[1]; });
      body.innerHTML = '<div class="pc-stats wide">' + kv(t('p.hours'), A.num(st.hours, 1)) + kv(t('p.jobs'), A.num(st.printed)) + kv(t('p.filament'), A.num(st.grams / 1000, 2) + ' kg') + kv(t('p.revenue'), A.money(st.revenue)) + kv(t('p.profit'), A.money(st.profit)) + kv(t('p.failed'), A.num(st.failed)) + '</div>' +
        '<div class="two-col"><div><h4>' + esc(t('p.info')) + '</h4><table class="kv">' + info.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(String(x[1])) + '</td></tr>'; }).join('') + '</table>' + (p.note ? '<p class="pre">' + esc(p.note) + '</p>' : '') +
        '<h4>' + esc(t('p.plan')) + ' <button type="button" class="btn small" id="pdAddTask">' + A.icon('plus') + esc(t('p.addTask')) + '</button></h4><div id="pdTasks"></div></div>' +
        '<div><h4>' + esc(t('p.logs')) + ' <button type="button" class="btn small" id="pdAddLog">' + A.icon('plus') + esc(t('p.addLog')) + '</button></h4>' +
        (logs.length ? '<ul class="timeline">' + logs.map(function (l) {
          var ty = A.byId(S.lists, l.typeId) || {};
          return '<li data-id="' + esc(l.id) + '"><i class="dot" style="background:' + esc(ty.color || 'var(--accent)') + '"></i><div><b>' + esc(l.title || ty.name || '') + '</b> <span class="badge">' + esc(ty.name || '') + '</span><small class="muted">' + esc(A.date(l.date)) + (l.hours ? ' · ' + A.num(l.hours, 0) + ' ' + esc(t('u.h')) : '') + (l.cost ? ' · ' + esc(A.money(l.cost)) : '') + '</small>' + (l.note ? '<p class="pre">' + esc(l.note) + '</p>' : '') +
            (l.photos && l.photos.length ? '<div class="media-row">' + l.photos.map(function (id) { return '<div class="media sm"><img data-thumb="' + esc(id) + '" alt=""></div>'; }).join('') + '</div>' : '') + '</div><span class="row-acts">' + A.iconBtn('edit', t('a.edit'), 'ed') + A.iconBtn('trash', t('a.delete'), 'dl danger') + '</span></li>';
        }).join('') + '</ul>' : '<p class="muted">' + esc(t('p.noLogs')) + '</p>') + '</div></div>';
      var tbox = body.querySelector('#pdTasks');
      dueTasks(p, st).forEach(function (d) {
        var k = d.task, pct = CALC.pos(k.every) ? Math.min(100, d.since / k.every * 100) : 0;
        var el = ui.el('div.task' + (d.due ? '.due' : d.soon ? '.soon' : ''), { html: '<div class="task-h"><b>' + esc(k.name) + '</b><small>' + esc(t('p.every', { n: A.num(k.every) })) + ' · ' + esc(d.due ? t('p.due') : t('p.leftH', { n: A.num(Math.max(0, d.left), 0) })) + '</small></div>' +
          '<div class="update-bar"><span style="width:' + pct + '%"></span></div><div class="row-acts"><button type="button" class="btn small success done">' + A.icon('check') + esc(t('p.done')) + '</button>' + A.iconBtn('edit', t('a.edit'), 'ed') + A.iconBtn('trash', t('a.delete'), 'dl danger') + '</div>' });
        el.querySelector('.done').onclick = async function () {
          k.lastHours = st.hours; await DB.put('printers', p);
          var ty = A.listOf('logType').filter(function (x) { return x.key === 'maintenance'; })[0];
          await DB.put('printerLogs', { printerId: p.id, typeId: ty ? ty.id : null, title: k.name, date: A.today(), hours: st.hours });
          await A.reload(); p = A.byId(S.printers, p.id); draw(); A.render();
        };
        el.querySelector('.ed').onclick = function () { taskForm(p, k, function () { p = A.byId(S.printers, p.id); draw(); }); };
        el.querySelector('.dl').onclick = function () { A.confirmBox(t('a.deleteAsk', { n: k.name }), async function () { p.tasks = p.tasks.filter(function (x) { return x.id !== k.id; }); await DB.put('printers', p); await A.reload(); draw(); }); };
        tbox.appendChild(el);
      });
      if (!(p.tasks || []).length) tbox.appendChild(ui.el('p.muted', { text: t('p.noTasks') }));
      body.querySelector('#pdAddTask').onclick = function () { taskForm(p, null, function () { p = A.byId(S.printers, p.id); draw(); }); };
      body.querySelector('#pdAddLog').onclick = function () { logForm(p, null, draw); };
      A.$$('.timeline li', body).forEach(function (li) {
        var l = A.byId(S.printerLogs, li.getAttribute('data-id'));
        li.querySelector('.ed').onclick = function () { logForm(p, l, draw); };
        li.querySelector('.dl').onclick = function () { A.confirmBox(t('a.deleteAsk', { n: l.title || '' }), async function () { await DB.del('printerLogs', l.id); await A.reload(); draw(); }); };
        A.$$('.media img', li).forEach(function (im, i) { im.onclick = function () { A.lightbox(l.photos, i); }; });
      });
      A.fillThumbs(body);
    }
    draw();
    ui.modal({ title: p.name, icon: 'printer', cls: 'wide xl', body: body, buttons: [
      { label: t('p.showJobs'), icon: 'archive', onClick: function () { A.go('archive', { printer: p.id }); } }, 'spacer',
      { label: t('a.edit'), icon: 'edit', onClick: function () { form(p); } }, { label: t('a.close'), cls: 'primary' }] });
  }
  function taskForm(p, k, after) {
    A.formModal({ title: k ? t('a.edit') : t('p.addTask'), icon: 'tool', cols: 1, fields: [
      { k: 'name', label: t('a.name'), value: k ? k.name : '', req: true }, { k: 'every', label: t('p.everyH'), type: 'number', value: k ? k.every : 200, req: true },
      { k: 'lastHours', label: t('p.lastDone'), type: 'number', value: k ? k.lastHours : Math.round(stats(p).hours), hint: t('p.lastDoneHint', { n: A.num(stats(p).hours, 0) }) }
    ], onSave: async function (v) {
      p.tasks = p.tasks || [];
      if (k) Object.assign(k, { name: v.name, every: CALC.pos(v.every), lastHours: CALC.num(v.lastHours) });
      else p.tasks.push({ id: DB.uid(), name: v.name, every: CALC.pos(v.every), lastHours: CALC.num(v.lastHours) });
      await DB.put('printers', p); await A.reload(); A.render(); if (after) after();
    } });
  }
  function logForm(p, l, after) {
    var cur = S.settings.currency, photos = l && l.photos ? l.photos.slice() : [];
    var md = A.formModal({ title: l ? t('a.edit') : t('p.addLog'), icon: 'history', fields: [
      { k: 'typeId', label: t('p.logType'), type: 'select', value: l ? l.typeId : '', options: A.listOf('logType').map(function (x) { return { v: x.id, l: x.name }; }) },
      { k: 'date', label: t('a.date'), type: 'date', value: l ? l.date : A.today() },
      { k: 'title', label: t('p.logTitle'), value: l ? l.title : '', wide: true, req: true, placeholder: t('p.logTitlePh') },
      { k: 'cost', label: t('p.logCostF', { c: cur }), type: 'number', value: l && l.cost ? +CALC.convert(l.cost, cur, S.settings).toFixed(2) : '' },
      { k: 'hours', label: t('p.hoursAt'), type: 'number', value: l ? l.hours : Math.round(stats(p).hours) },
      { k: 'note', label: t('a.note'), type: 'textarea', value: l ? l.note : '', wide: true },
      { type: 'html', html: '<div class="field wide"><span class="field-label">' + esc(t('c.photosFiles')) + '</span><div class="media-row" id="lgPh"></div><button type="button" class="btn small" id="lgAdd">' + A.icon('image') + esc(t('c.addPhoto')) + '</button></div>' }
    ], onSave: async function (v) {
      var d = l ? Object.assign({}, l) : { printerId: p.id };
      d.typeId = v.typeId || null; d.date = v.date; d.title = v.title; d.cost = CALC.toUsd(CALC.pos(v.cost), cur, S.settings); d.hours = CALC.pos(v.hours); d.note = v.note; d.photos = photos;
      await DB.put('printerLogs', d); await A.reload(); A.render(); if (after) after();
    } });
    function drawPh() { var b = md.el.querySelector('#lgPh'); b.innerHTML = photos.map(function (id) { return '<div class="media sm"><img data-thumb="' + esc(id) + '" alt=""></div>'; }).join(''); A.fillThumbs(b); }
    drawPh();
    md.el.querySelector('#lgAdd').onclick = async function () { var fs = await A.pickFiles('image/*', true); for (var i = 0; i < fs.length; i++) photos.push(await A.saveImage(fs[i], { ref: 'printerLog' })); drawPh(); };
  }

  A.page('printers', { icon: 'printer', group: 'production', render: render, badge: function () { var n = 0; S.printers.forEach(function (p) { n += dueTasks(p).filter(function (d) { return d.due; }).length; }); return n ? String(n) : ''; } });
  A.printers = { form: form, detail: detail, stats: stats, dueTasks: dueTasks };
})();
