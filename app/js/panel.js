/* GENEL BAKIŞ (panel) ve RAPORLAR. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  function soldJobs(list) { return list.filter(function (j) { var s = A.byId(S.lists, j.statusId) || {}; return s.sold !== false && s.printed !== false; }); }
  function printedJobs(list) { return list.filter(function (j) { var s = A.byId(S.lists, j.statusId) || {}; return s.printed !== false; }); }
  function sum(list, f) { return list.reduce(function (s, x) { return s + CALC.num(f(x)); }, 0); }

  function renderDash(host) {
    var month = S.jobs.filter(function (j) { return A.inPeriod(j.date, 'month'); });
    var sold = soldJobs(month), printed = printedJobs(month);
    var rev = sum(sold, function (j) { return j.calc && j.calc.price; }), prof = sum(sold, function (j) { return j.calc && j.calc.profit; });
    var exp = sum(S.expenses.filter(function (e) { return A.inPeriod(e.date, 'month'); }), function (e) { return e.amount; });
    var due = sum(S.jobs, function (j) { return Math.max(0, CALC.num(j.calc && j.calc.price) - CALC.num(j.paid)); });
    var g = sum(printed, function (j) { return j.calc && j.calc.grams; }), h = sum(printed, function (j) { return j.printMin; }) / 60;
    host.appendChild(ui.el('div.stats.big', { html:
      st(t('d.revenue'), A.money(rev), '') + st(t('d.profit'), A.money(prof), prof >= 0 ? 'ok' : 'bad') + st(t('d.net'), A.money(prof - exp), prof - exp >= 0 ? 'ok' : 'bad') +
      st(t('d.jobs'), A.num(printed.length), '') + st(t('d.filament'), A.num(g / 1000, 2) + ' kg', '') + st(t('d.hours'), A.num(h, 1) + ' ' + t('u.h'), '') + st(t('d.unpaid'), A.money(due), due > 0 ? 'warn' : '') }));

    var row = ui.el('div.dash-grid');
    /* son işler */
    var recent = S.jobs.slice().sort(function (a, b) { return String(b.date + b.createdAt).localeCompare(String(a.date + a.createdAt)); }).slice(0, 8);
    var c1 = ui.el('section.card.span2', { html: '<h3 class="card-title">' + A.icon('archive') + '<span>' + esc(t('d.recent')) + '</span><a href="#" class="fc-small more-link" data-go="archive">' + esc(t('d.all')) + '</a></h3>' +
      (recent.length ? '<div class="mini-gallery">' + recent.map(function (j) { var s = A.byId(S.lists, j.statusId) || {}; return '<div class="mg" data-id="' + esc(j.id) + '"><div class="gimg">' + (j.photos && j.photos[0] ? '<img data-thumb="' + esc(j.photos[0]) + '" alt="">' : A.icon('image')) + '<span class="badge st" style="--c:' + esc(s.color || 'var(--accent)') + '">' + esc(s.name || '') + '</span></div><b>' + esc(j.name) + '</b><small>' + esc(A.date(j.date)) + ' · ' + esc(A.money(j.calc && j.calc.price || 0)) + '</small></div>'; }).join('') + '</div>'
        : '<div class="empty">' + A.icon('calc') + '<p>' + esc(t('d.start')) + '</p><button type="button" class="btn primary" data-go="calc">' + A.icon('plus') + esc(t('d.firstJob')) + '</button></div>') });
    row.appendChild(c1);
    /* azalan stok */
    var low = S.materials.filter(A.isLow).slice(0, 10);
    row.appendChild(ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('spool') + '<span>' + esc(t('d.lowStock')) + '</span><a href="#" class="fc-small more-link" data-go="materials">' + esc(t('d.all')) + '</a></h3>' +
      (low.length ? '<ul class="fc-list">' + low.map(function (m) { return '<li><span><i class="dot" style="background:' + esc(m.color || 'transparent') + '"></i><b>' + esc(m.name) + '</b> <small class="muted">' + esc([m.brand, m.matType].filter(Boolean).join(' · ')) + '</small></span><b class="bad-text">' + A.num(A.stockOf(m.id), 2) + ' ' + esc(A.materials.unitName(m)) + '</b></li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('d.stockOk')) + '</p>') }));
    /* yazıcılar */
    row.appendChild(ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('printer') + '<span>' + esc(t('d.printers')) + '</span><a href="#" class="fc-small more-link" data-go="printers">' + esc(t('d.all')) + '</a></h3>' +
      (S.printers.length ? '<ul class="fc-list">' + S.printers.map(function (p) { var s = A.printers.stats(p), due = A.printers.dueTasks(p, s).filter(function (d) { return d.due; }); return '<li><span><b>' + esc(p.name) + '</b> <small class="muted">' + A.num(s.hours, 0) + ' ' + esc(t('u.h')) + '</small></span>' + (due.length ? '<span class="badge danger">' + esc(t('d.maint', { n: due.length })) + '</span>' : '<span class="badge ok">' + esc(t('d.ok')) + '</span>') + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('p.empty')) + '</p>') }));
    /* ödenmemiş */
    var unpaid = S.jobs.filter(function (j) { return A.archive.payState(j) === 'unpaid' || A.archive.payState(j) === 'partial'; }).slice(0, 8);
    row.appendChild(ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('wallet') + '<span>' + esc(t('d.unpaidJobs')) + '</span></h3>' +
      (unpaid.length ? '<ul class="fc-list">' + unpaid.map(function (j) { return '<li class="click" data-id="' + esc(j.id) + '"><span><b>' + esc(j.name) + '</b> <small class="muted">' + esc(j.customerName || '') + '</small></span><b class="warn-text">' + esc(A.money(CALC.num(j.calc && j.calc.price) - CALC.num(j.paid))) + '</b></li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('d.noneUnpaid')) + '</p>') }));
    /* asistan önerileri (çevrim dışı kurallar) */
    var tips = A.ai.tips();
    row.appendChild(ui.el('section.card.span2', { html: '<h3 class="card-title">' + A.icon('sparkles') + '<span>' + esc(t('d.tips')) + '</span><a href="#" class="fc-small more-link" data-go="assistant">' + esc(t('d.ask')) + '</a></h3>' +
      (tips.length ? '<ul class="tips">' + tips.map(function (x) { return '<li class="' + (x.kind || '') + '">' + esc(x.text) + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('d.noTips')) + '</p>') }));
    host.appendChild(row);
    A.$$('[data-go]', host).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); A.go(a.getAttribute('data-go'), a.getAttribute('data-go') === 'calc' ? { fresh: true } : null); }; });
    A.$$('.mg[data-id], li[data-id]', host).forEach(function (x) { x.onclick = function () { A.archive.detail(A.byId(S.jobs, x.getAttribute('data-id'))); }; });
  }
  function st(l, v, cls) { return '<div class="stat ' + cls + '"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }

  /* ---------------- raporlar ---------------- */
  var RF = { period: 'year' };
  function renderReports(host) {
    var tb = ui.el('div.toolbar');
    tb.innerHTML = '<select id="rpPer">' + ['month', 'lastMonth', '30', 'year', 'all'].map(function (k) { return '<option value="' + k + '"' + (RF.period === k ? ' selected' : '') + '>' + esc(t('per.' + k)) + '</option>'; }).join('') + '</select><span class="fc-spacer"></span>' +
      '<button type="button" class="btn small" id="rpCsv">' + A.icon('download') + 'CSV</button><button type="button" class="btn small" id="rpPrint">' + A.icon('print') + esc(t('a.print')) + '</button>';
    host.appendChild(tb);
    var jobs = S.jobs.filter(function (j) { return A.inPeriod(j.date, RF.period); });
    var sold = soldJobs(jobs), printed = printedJobs(jobs);
    var exps = S.expenses.filter(function (e) { return A.inPeriod(e.date, RF.period); });
    var rev = sum(sold, function (j) { return j.calc && j.calc.price; }), cost = sum(sold, function (j) { return j.calc && j.calc.cost; }), fees = sum(sold, function (j) { return j.calc && j.calc.fees; });
    var prof = sum(sold, function (j) { return j.calc && j.calc.profit; }), exp = sum(exps, function (e) { return e.amount; });
    var failed = jobs.filter(function (j) { var s = A.byId(S.lists, j.statusId) || {}; return s.key === 'failed'; });
    var failCost = sum(failed, function (j) { return j.calc && j.calc.cost; });
    var maint = sum(S.printerLogs.filter(function (l) { return A.inPeriod(l.date, RF.period); }), function (l) { return l.cost; });
    var paid = sum(sold, function (j) { return Math.min(CALC.num(j.calc && j.calc.price), CALC.num(j.paid)); });
    host.appendChild(ui.el('div.stats.big', { html: st(t('r.revenue'), A.money(rev), '') + st(t('r.cost'), A.money(cost), '') + st(t('r.fees'), A.money(fees), '') + st(t('r.gross'), A.money(prof), prof >= 0 ? 'ok' : 'bad') +
      st(t('r.expenses'), A.money(exp + maint + failCost), '') + st(t('r.net'), A.money(prof - exp - maint - failCost), prof - exp - maint - failCost >= 0 ? 'ok' : 'bad') + st(t('r.collected'), A.money(paid), '') + st(t('r.receivable'), A.money(rev - paid), rev - paid > 0 ? 'warn' : '') }));

    /* aylık grafik (son 12 ay) */
    var months = [], now = new Date();
    for (var i = 11; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), l: d.toLocaleDateString(FC.i18n.locale(), { month: 'short' }), v: [0, 0, 0] }); }
    soldJobs(S.jobs).forEach(function (j) { var m = months.filter(function (x) { return String(j.date || '').slice(0, 7) === x.k; })[0]; if (m) { m.v[0] += CALC.num(j.calc && j.calc.price); m.v[1] += CALC.num(j.calc && j.calc.profit); } });
    S.expenses.forEach(function (e) { var m = months.filter(function (x) { return String(e.date || '').slice(0, 7) === x.k; })[0]; if (m) m.v[2] += CALC.num(e.amount); });
    var cg = ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('chart') + '<span>' + esc(t('r.monthly')) + '</span></h3><div class="legend"><span><i class="dot" style="background:var(--accent)"></i>' + esc(t('r.revenue')) + '</span><span><i class="dot" style="background:var(--ok)"></i>' + esc(t('r.gross')) + '</span><span><i class="dot" style="background:var(--warn)"></i>' + esc(t('r.expenses')) + '</span></div>' +
      A.bars(months.map(function (m) { return { l: m.l, v: m.v }; }), { w: 900, h: 230, fmt: function (v) { return A.money(v); } }) });
    host.appendChild(cg);

    var grid = ui.el('div.dash-grid');
    grid.appendChild(breakdown(t('r.byCustomer'), sold, function (j) { return j.customerName || t('c.noCustomer'); }));
    grid.appendChild(breakdown(t('r.byPrinter'), sold, function (j) { return j.printerName || t('c.noPrinter'); }));
    grid.appendChild(breakdown(t('r.byCategory'), sold, function (j) { return A.nameOf(S.lists, j.categoryId, t('ex.noCat')); }));
    /* malzeme tüketimi */
    var mat = {};
    printed.forEach(function (j) { (j.materials || []).forEach(function (m) { var k = [m.matType, m.name, m.brand].filter(Boolean).join(' · ') || t('c.manualMat'); mat[k] = mat[k] || { g: 0, c: 0, color: m.color }; mat[k].g += CALC.pos(m.grams); mat[k].c += CALC.pos(m.grams) / 1000 * CALC.pos(m.kgPrice); }); });
    var mk = Object.keys(mat).sort(function (a, b) { return mat[b].g - mat[a].g; });
    grid.appendChild(ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('spool') + '<span>' + esc(t('r.byMaterial')) + '</span></h3>' +
      (mk.length ? '<table class="tbl compact"><tbody>' + mk.slice(0, 15).map(function (k) { return '<tr><td><i class="dot" style="background:' + esc(mat[k].color || 'transparent') + '"></i>' + esc(k) + '</td><td class="r">' + A.num(mat[k].g, 0) + ' g</td><td class="r">' + esc(A.money(mat[k].c)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">—</p>') }));
    host.appendChild(grid);

    host.querySelector('#rpPer').onchange = function (e) { RF.period = e.target.value; A.render(); };
    host.querySelector('#rpCsv').onclick = function () {
      var rows = [[t('a.date'), t('ar.sort.code'), t('c.name'), t('c.customer'), t('c.printer'), 'g', t('r.cost') + ' USD', t('r.revenue') + ' USD', t('r.gross') + ' USD']];
      sold.forEach(function (j) { var c = j.calc || {}; rows.push([j.date, j.code, j.name, j.customerName || '', j.printerName || '', CALC.num(c.grams).toFixed(1), CALC.num(c.cost).toFixed(2), CALC.num(c.price).toFixed(2), CALC.num(c.profit).toFixed(2)]); });
      exps.forEach(function (e) { rows.push([e.date, '', e.title, A.nameOf(S.lists, e.categoryId, ''), '', '', CALC.num(e.amount).toFixed(2), '', (-CALC.num(e.amount)).toFixed(2)]); });
      A.saveOut('rapor-' + RF.period + '-' + A.today() + '.csv', new Blob([A.csv(rows)], { type: 'text/csv' }));
    };
    host.querySelector('#rpPrint').onclick = function () { A.printHtml(A.pageName('reports'), '<h1>' + esc(A.pageName('reports')) + ' — ' + esc(t('per.' + RF.period)) + '</h1>' + host.querySelector('.stats').outerHTML.replace(/class="stat[^"]*"/g, 'style="display:inline-block;margin:6px 14px 6px 0"') + host.querySelector('.dash-grid').innerHTML); };
  }
  function breakdown(title, list, keyFn) {
    var m = {};
    list.forEach(function (j) { var k = keyFn(j); m[k] = m[k] || { n: 0, r: 0, p: 0 }; m[k].n++; m[k].r += CALC.num(j.calc && j.calc.price); m[k].p += CALC.num(j.calc && j.calc.profit); });
    var ks = Object.keys(m).sort(function (a, b) { return m[b].r - m[a].r; });
    return ui.el('section.card', { html: '<h3 class="card-title">' + A.icon('chart') + '<span>' + esc(title) + '</span></h3>' +
      (ks.length ? '<table class="tbl compact"><thead><tr><th></th><th class="r">#</th><th class="r">' + esc(t('r.revenue')) + '</th><th class="r">' + esc(t('r.gross')) + '</th></tr></thead><tbody>' + ks.slice(0, 15).map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="r">' + m[k].n + '</td><td class="r">' + esc(A.money(m[k].r)) + '</td><td class="r">' + esc(A.money(m[k].p)) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">—</p>') });
  }

  A.page('dashboard', { icon: 'home', group: 'general', render: renderDash, fixed: true });
  A.page('reports', { icon: 'chart', group: 'finance', render: renderReports });
})();
