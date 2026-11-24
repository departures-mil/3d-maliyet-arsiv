/* ARŞİV — basılan her işin (parçanın) kalıcı kaydı: görseller, STL/3MF/G-code ekleri, dilimleyici ayarları, malzeme,
   süre, maliyet dökümü, fiyat, ödeme, müşteri, yazıcı. Galeri ya da liste görünümü; arama ve süzgeçler.
   "İçe aktar" ile dilimleyici ekran görüntüleri / G-code / 3MF dosyalarından toplu kayıt (her biri onayla). */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;
  var F = { q: '', status: '', cat: '', cust: '', prn: '', period: 'all', view: 'grid', sort: 'date', pay: '' };

  function status(j) { return A.byId(S.lists, j.statusId) || {}; }
  function payState(j) {
    var price = CALC.num(j.calc && j.calc.price), paid = CALC.num(j.paid);
    if (!(price > 0)) return '';
    if (paid >= price - 0.005) return 'paid';
    return paid > 0 ? 'partial' : 'unpaid';
  }
  function inPeriod(dt, p) {
    if (p === 'all' || !dt) return true;
    var d = new Date(dt), n = new Date();
    if (p === 'month') return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    if (p === 'lastMonth') { var lm = new Date(n.getFullYear(), n.getMonth() - 1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
    if (p === 'year') return d.getFullYear() === n.getFullYear();
    if (p === '30') return (n - d) / 86400000 <= 30;
    return true;
  }
  A.inPeriod = inPeriod;
  function filtered() {
    var q = F.q.trim().toLocaleLowerCase(FC.i18n.locale());
    var list = S.jobs.filter(function (j) {
      if (F.status && j.statusId !== F.status) return false;
      if (F.cat && j.categoryId !== F.cat) return false;
      if (F.cust && j.customerId !== F.cust) return false;
      if (F.prn && j.printerId !== F.prn) return false;
      if (F.pay && payState(j) !== F.pay) return false;
      if (!inPeriod(j.date, F.period)) return false;
      if (q) {
        var hay = [j.code, j.name, j.tags, j.note, j.customerName, j.printerName, (j.materials || []).map(function (m) { return [m.name, m.brand, m.matType].join(' '); }).join(' '),
          Object.keys(j.settings || {}).map(function (k) { return j.settings[k]; }).join(' ')].join(' ').toLocaleLowerCase(FC.i18n.locale());
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = { date: function (j) { return (j.date || '') + (j.createdAt || ''); }, name: function (j) { return j.name || ''; }, price: function (j) { return CALC.num(j.calc && j.calc.price); }, profit: function (j) { return CALC.num(j.calc && j.calc.profit); }, grams: function (j) { return CALC.num(j.calc && j.calc.grams); }, code: function (j) { return j.code || ''; } }[F.sort];
    list.sort(function (a, b) { var x = key(a), y = key(b); var r = typeof x === 'number' ? y - x : String(y).localeCompare(String(x), undefined, { numeric: true }); return F.sort === 'name' ? -r : r; });
    return list;
  }

  function render(host, arg) {
    if (arg && arg.customer) { F.cust = arg.customer; F.status = ''; F.period = 'all'; }
    if (arg && arg.printer) { F.prn = arg.printer; F.status = ''; F.period = 'all'; }
    var list = filtered();
    var tb = ui.el('div.toolbar.wrap');
    tb.innerHTML = '<label class="search">' + A.icon('search') + '<input type="search" id="aQ" placeholder="' + esc(t('ar.searchPh')) + '" value="' + esc(F.q) + '"></label>' +
      sel('aStatus', A.opts(A.calc.statuses(), F.status, t('ar.allStatus'))) +
      sel('aCat', A.opts(A.listOf('jobCategory'), F.cat, t('ar.allCats'))) +
      sel('aCust', A.opts(S.customers.slice().sort(A.byName), F.cust, t('ar.allCustomers'))) +
      sel('aPrn', A.opts(S.printers.slice().sort(A.byName), F.prn, t('ar.allPrinters'))) +
      sel('aPay', ['', 'paid', 'partial', 'unpaid'].map(function (k) { return '<option value="' + k + '"' + (F.pay === k ? ' selected' : '') + '>' + esc(k ? t('pay.' + k) : t('ar.allPay')) + '</option>'; }).join('')) +
      sel('aPeriod', ['all', 'month', 'lastMonth', '30', 'year'].map(function (k) { return '<option value="' + k + '"' + (F.period === k ? ' selected' : '') + '>' + esc(t('per.' + k)) + '</option>'; }).join('')) +
      sel('aSort', ['date', 'code', 'name', 'price', 'profit', 'grams'].map(function (k) { return '<option value="' + k + '"' + (F.sort === k ? ' selected' : '') + '>' + esc(t('ar.sort.' + k)) + '</option>'; }).join('')) +
      '<span class="fc-spacer"></span><div class="segmented"><button type="button" data-v="grid"' + (F.view === 'grid' ? ' class="active"' : '') + ' title="' + esc(t('ar.grid')) + '">' + A.icon('grid') + '</button><button type="button" data-v="list"' + (F.view === 'list' ? ' class="active"' : '') + ' title="' + esc(t('ar.list')) + '">' + A.icon('list') + '</button></div>' +
      '<button type="button" class="btn small" id="aCsv">' + A.icon('download') + 'CSV</button>' +
      '<button type="button" class="btn small" id="aImp">' + A.icon('scan') + esc(t('ar.import')) + '</button>' +
      '<button type="button" class="btn small primary" id="aNew">' + A.icon('plus') + esc(t('ar.new')) + '</button>';
    host.appendChild(tb);

    var sum = list.reduce(function (s, j) { var c = j.calc || {}; s.price += CALC.num(c.price); s.profit += CALC.num(c.profit); s.g += CALC.num(c.grams); s.h += CALC.num(c.hours); s.unpaid += Math.max(0, CALC.num(c.price) - CALC.num(j.paid)); return s; }, { price: 0, profit: 0, g: 0, h: 0, unpaid: 0 });
    host.appendChild(ui.el('div.stats', { html:
      stat(t('ar.count'), A.num(list.length)) + stat(t('ar.revenue'), A.money(sum.price)) + stat(t('ar.profit'), A.money(sum.profit), sum.profit >= 0 ? 'ok' : 'bad') +
      stat(t('ar.filament'), A.num(sum.g / 1000, 2) + ' kg') + stat(t('ar.hours'), A.num(sum.h, 1) + ' ' + t('u.h')) + stat(t('ar.unpaid'), A.money(sum.unpaid), sum.unpaid > 0 ? 'warn' : '') }));

    if (!list.length) {
      host.appendChild(ui.el('div.card.empty', { html: A.icon('archive') + '<p>' + esc(S.jobs.length ? t('a.noMatch') : t('ar.empty')) + '</p>' }));
    } else if (F.view === 'grid') {
      var g = ui.el('div.gallery');
      g.innerHTML = list.map(function (j) {
        var s = status(j), c = j.calc || {}, ps = payState(j);
        return '<article class="gcard" data-id="' + esc(j.id) + '"><div class="gimg">' + (j.photos && j.photos[0] ? '<img data-thumb="' + esc(j.photos[0]) + '" alt="">' : A.icon('image')) +
          (j.photos && j.photos.length > 1 ? '<em class="cnt">' + A.icon('image') + j.photos.length + '</em>' : '') +
          '<span class="badge st" style="--c:' + esc(s.color || 'var(--accent)') + '">' + esc(s.name || '') + '</span></div>' +
          '<div class="gbody"><div class="gtitle"><b>' + esc(j.name || '—') + '</b><small class="mono">' + esc(j.code || '') + '</small></div>' +
          '<div class="gmeta">' + (j.materials || []).map(function (m) { return '<i class="dot" title="' + esc((m.name || '') + ' ' + (m.matType || '')) + '" style="background:' + esc(m.color || 'transparent') + '"></i>'; }).join('') +
          '<span>' + A.num(c.grams || 0, 1) + ' g</span><span>' + esc(CALC.fmtMin(j.printMin, t)) + '</span>' + (j.qty > 1 ? '<span>×' + j.qty + '</span>' : '') + '</div>' +
          '<div class="gfoot"><span class="muted">' + esc(A.date(j.date)) + (j.customerName ? ' · ' + esc(j.customerName) : '') + '</span><b>' + esc(A.money(c.price || 0)) + '</b></div>' +
          (ps ? '<div class="gpay ' + ps + '">' + esc(t('pay.' + ps)) + '</div>' : '') + '</div></article>';
      }).join('');
      host.appendChild(g);
      A.$$('.gcard', g).forEach(function (c) { c.onclick = function () { detail(A.byId(S.jobs, c.getAttribute('data-id'))); }; });
    } else {
      var card = ui.el('div.card.table-card');
      card.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th></th><th>' + esc(t('ar.sort.code')) + '</th><th>' + esc(t('c.name')) + '</th><th>' + esc(t('a.date')) + '</th><th>' + esc(t('c.status')) + '</th><th>' + esc(t('c.customer')) +
        '</th><th>' + esc(t('c.printer')) + '</th><th class="r">g</th><th class="r">' + esc(t('c.time')) + '</th><th class="r">' + esc(t('c.totalCost')) + '</th><th class="r">' + esc(t('ar.price')) + '</th><th class="r">' + esc(t('c.profit')) + '</th><th>' + esc(t('ar.payment')) + '</th></tr></thead><tbody>' +
        list.map(function (j) {
          var s = status(j), c = j.calc || {}, ps = payState(j);
          return '<tr data-id="' + esc(j.id) + '" class="click"><td><span class="thumb sm">' + (j.photos && j.photos[0] ? '<img data-thumb="' + esc(j.photos[0]) + '" alt="">' : A.icon('image')) + '</span></td><td class="mono">' + esc(j.code || '') + '</td><td><b>' + esc(j.name || '') + '</b>' + (j.qty > 1 ? ' <small>×' + j.qty + '</small>' : '') + '</td><td>' + esc(A.date(j.date)) +
            '</td><td><span class="badge st" style="--c:' + esc(s.color || 'var(--accent)') + '">' + esc(s.name || '') + '</span></td><td>' + esc(j.customerName || '') + '</td><td>' + esc(j.printerName || '') + '</td><td class="r">' + A.num(c.grams || 0, 1) +
            '</td><td class="r">' + esc(CALC.fmtMin(j.printMin, t)) + '</td><td class="r">' + esc(A.money(c.cost || 0)) + '</td><td class="r"><b>' + esc(A.money(c.price || 0)) + '</b></td><td class="r ' + (CALC.num(c.profit) >= 0 ? 'ok-text' : 'bad-text') + '">' + esc(A.money(c.profit || 0)) + '</td><td>' + (ps ? '<span class="badge ' + ({ paid: 'ok', partial: 'warn', unpaid: 'danger' }[ps]) + '">' + esc(t('pay.' + ps)) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      host.appendChild(card);
      A.$$('tbody tr', card).forEach(function (r) { r.onclick = function () { detail(A.byId(S.jobs, r.getAttribute('data-id'))); }; });
    }

    var qi = host.querySelector('#aQ'), tmr;
    qi.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { F.q = qi.value; A.render().then(function () { var e = document.getElementById('aQ'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }); }, 220); };
    [['aStatus', 'status'], ['aCat', 'cat'], ['aCust', 'cust'], ['aPrn', 'prn'], ['aPay', 'pay'], ['aPeriod', 'period'], ['aSort', 'sort']].forEach(function (p) { host.querySelector('#' + p[0]).onchange = function (e) { F[p[1]] = e.target.value; A.render(); }; });
    A.$$('.segmented button', tb).forEach(function (b) { b.onclick = function () { F.view = b.getAttribute('data-v'); A.render(); }; });
    host.querySelector('#aNew').onclick = function () { A.go('calc', { fresh: true }); };
    host.querySelector('#aImp').onclick = function () { A.importer.batch(); };
    host.querySelector('#aCsv').onclick = function () { exportCsv(list); };
    if (arg && arg.open) { var j = A.byId(S.jobs, arg.open); if (j) setTimeout(function () { detail(j); }, 50); }
  }
  function sel(id, html) { return '<select id="' + id + '">' + html + '</select>'; }
  function stat(l, v, cls) { return '<div class="stat ' + (cls || '') + '"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; }

  /* ---------------- ayrıntı ---------------- */
  async function detail(j) {
    if (!j) return;
    var s = status(j), c = j.calc || {}, ps = payState(j);
    var body = ui.el('div.job-detail');
    var gal = ui.el('div.jd-gallery');
    function drawGal() {
      gal.innerHTML = (j.photos || []).map(function (id, i) { return '<div class="jd-img' + (i === 0 ? ' main' : '') + '" data-i="' + i + '"><img data-thumb="' + esc(id) + '" alt="">' + A.iconBtn('x', t('a.delete'), 'rm') + (i ? A.iconBtn('up', t('ar.makeCover'), 'cov') : '') + '</div>'; }).join('') +
        '<button type="button" class="jd-add">' + A.icon('plus') + '<span>' + esc(t('c.addPhoto')) + '</span></button>';
      A.fillThumbs(gal);
      A.$$('.jd-img', gal).forEach(function (el) {
        var i = +el.getAttribute('data-i');
        el.querySelector('img').onclick = function () { A.lightbox(j.photos, i); };
        el.querySelector('.rm').onclick = function (e) { e.stopPropagation(); A.confirmBox(t('ar.removePhoto'), async function () { j.photos.splice(i, 1); await DB.put('jobs', j); drawGal(); A.render(); }); };
        var cv = el.querySelector('.cov'); if (cv) cv.onclick = async function (e) { e.stopPropagation(); var x = j.photos.splice(i, 1)[0]; j.photos.unshift(x); await DB.put('jobs', j); drawGal(); A.render(); };
      });
      gal.querySelector('.jd-add').onclick = async function () {
        var fs = await A.pickFiles('image/*', true); if (!fs.length) return;
        j.photos = j.photos || [];
        for (var i = 0; i < fs.length; i++) j.photos.push(await A.saveImage(fs[i], { ref: 'job' }));
        await DB.put('jobs', j); drawGal(); A.render();
      };
    }
    drawGal();
    body.appendChild(gal);

    var info = [
      [t('ar.sort.code'), j.code], [t('a.date'), A.date(j.date)], [t('c.status'), '<span class="badge st" style="--c:' + esc(s.color || 'var(--accent)') + '">' + esc(s.name || '') + '</span>', 1],
      [t('c.category'), A.nameOf(S.lists, j.categoryId, '')], [t('c.customer'), j.customerName], [t('c.printer'), j.printerName], [t('c.qty'), j.qty],
      [t('c.printTime'), CALC.fmtMin(j.printMin, t)], j.prepMin ? [t('c.prepTime'), CALC.fmtMin(j.prepMin, t)] : null, j.laborMin ? [t('c.laborMin'), CALC.fmtMin(j.laborMin, t)] : null,
      [t('c.grams'), A.num(c.grams || 0, 2) + ' g'], j.deliveryDate ? [t('c.delivery'), A.date(j.deliveryDate)] : null, j.tags ? [t('c.tags'), j.tags] : null
    ].filter(function (x) { return x && x[1] !== '' && x[1] != null; });
    Object.keys(j.settings || {}).forEach(function (k) { if (j.settings[k]) info.push([t('c.s.' + k), j.settings[k]]); });
    A.fields.show('job', j).forEach(function (x) { info.push(x); });
    var mats = (j.materials || []).map(function (m) {
      return '<li><i class="dot" style="background:' + esc(m.color || 'transparent') + '"></i><b>' + esc(m.name || t('c.manualMat')) + '</b> <span class="muted">' + esc([m.brand, m.matType].filter(Boolean).join(' · ')) + '</span><span class="r">' + A.num(m.grams || 0, 2) + ' g' + (m.meters ? ' · ' + A.num(m.meters, 2) + ' m' : '') + ' · ' + esc(A.money(CALC.pos(m.grams) / 1000 * CALC.pos(m.kgPrice))) + '</span></li>';
    }).join('');
    var rows = (c.rows || []).filter(function (r) { return r.value > 0; }).map(function (r) { return '<div class="rrow"><i class="dot" style="background:' + esc(r.color || 'var(--accent)') + '"></i><span>' + esc(r.name) + '</span><b>' + esc(A.money(r.value)) + '</b></div>'; }).join('');
    var right = ui.el('div.jd-info', { html:
      '<table class="kv">' + info.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + (x[2] ? x[1] : esc(String(x[1]))) + '</td></tr>'; }).join('') + '</table>' +
      (mats ? '<h4>' + esc(t('c.materials')) + '</h4><ul class="mat-list">' + mats + '</ul>' : '') +
      '<h4>' + esc(t('ar.costBreakdown')) + '</h4><div class="rrows">' + rows + '</div>' +
      '<div class="totals"><div class="trow strong"><span>' + esc(t('c.totalCost')) + '</span><b>' + esc(A.money(c.cost || 0)) + '</b></div>' +
      '<div class="trow strong"><span>' + esc(t('ar.price')) + '</span><b>' + esc(A.money(c.price || 0)) + '</b></div>' +
      '<div class="trow ' + (CALC.num(c.profit) >= 0 ? 'ok' : 'bad') + '"><span>' + esc(t('c.profit')) + '</span><b>' + esc(A.money(c.profit || 0)) + ' · ' + A.num(c.margin || 0, 1) + '%</b></div>' +
      '<div class="trow"><span>' + esc(t('ar.payment')) + '</span><b>' + esc(A.money(j.paid || 0)) + (ps ? ' · ' + esc(t('pay.' + ps)) : '') + '</b></div></div>' +
      '<h4>' + esc(t('ar.files')) + '</h4><div class="media-row" id="jdFiles"></div>' +
      (j.note ? '<h4>' + esc(t('a.note')) + '</h4><p class="pre" dir="auto">' + esc(j.note) + '</p>' : '') +
      '<div id="jdTr"></div>' });
    body.appendChild(right);
    var fbox = right.querySelector('#jdFiles');
    function drawFiles() {
      fbox.innerHTML = '';
      (j.files || []).forEach(function (id, i) {
        var el = ui.el('div.media.file', { html: A.icon('file') + '<span class="fname"></span>' + A.iconBtn('x', t('a.delete'), 'rm') });
        DB.getFile(id).then(function (f) { if (f) el.querySelector('.fname').textContent = f.name + ' · ' + A.num((f.size || 0) / 1048576, 2) + ' MB'; });
        el.onclick = function (e) { if (!e.target.closest('.rm')) A.openFile(id); };
        el.querySelector('.rm').onclick = function () { A.confirmBox(t('ar.removeFile'), async function () { j.files.splice(i, 1); await DB.put('jobs', j); drawFiles(); }); };
        fbox.appendChild(el);
      });
      var add = ui.el('button.btn.small', { type: 'button', html: A.icon('plus') + esc(t('c.addFile')) });
      add.onclick = async function () { var fs = await A.pickFiles('', true); if (!fs.length) return; j.files = j.files || []; for (var i = 0; i < fs.length; i++) j.files.push(await A.saveAttachment(fs[i], { ref: 'job' })); await DB.put('jobs', j); drawFiles(); };
      fbox.appendChild(add);
    }
    drawFiles();

    var md = ui.modal({ title: (j.code ? j.code + ' · ' : '') + (j.name || ''), icon: 'archive', cls: 'wide xl', body: body, buttons: [
      { label: t('a.delete'), icon: 'trash', cls: 'danger-soft', onClick: function (close) { A.confirmBox(t('ar.confirmDelete'), async function () { await removeJob(j); close(); }); return false; } },
      { label: t('ar.translate'), icon: 'globe', onClick: function () { translateBox(j, right.querySelector('#jdTr')); return false; } },
      'spacer',
      ps && ps !== 'paid' ? { label: t('ar.markPaid'), icon: 'check', onClick: async function (close) { j.paid = CALC.num(c.price); await DB.put('jobs', j); await A.reload(); close(); A.render(); A.toast(t('a.saved'), 'good'); } } : null,
      { label: t('c.quote'), icon: 'print', onClick: function () { var d = JSON.parse(JSON.stringify(j)); A.calc.quote(d); return false; } },
      { label: t('ar.reprint'), icon: 'copy', onClick: function () { var d = JSON.parse(JSON.stringify(j)); delete d.id; d.code = ''; d.date = A.today(); d.paid = 0; d.createdAt = null; d.deduct = true; S.draft = d; A.go('calc'); } },
      { label: t('a.edit'), icon: 'edit', cls: 'primary', onClick: function () { A.go('calc', { jobId: j.id }); } }
    ].filter(Boolean) });
    return md;
  }
  async function removeJob(j) {
    var mv = S.movements.filter(function (m) { return m.jobId === j.id && m.type === 'use'; });
    for (var i = 0; i < mv.length; i++) await DB.del('movements', mv[i].id);   // stoktan düşülen geri gelir
    await DB.del('jobs', j.id);
    await A.reload(); A.render(); A.toast(t('ar.deleted'), 'good');
  }
  function translateBox(j, host) {
    host.innerHTML = '';
    var box = ui.el('div.card.inset');
    box.innerHTML = '<div class="fc-row">' + ['tr', 'en', 'ar'].map(function (l) { return '<button type="button" class="btn small" data-l="' + l + '">' + esc(FC.i18n.names[l] || l) + '</button>'; }).join('') + '</div><div class="tr-out muted"></div>';
    A.$$('[data-l]', box).forEach(function (b) {
      b.onclick = async function () {
        var out = box.querySelector('.tr-out'); out.textContent = t('a.working');
        var src = [j.name, j.note].filter(Boolean).join('\n\n');
        var r = await A.ai.translate(src, b.getAttribute('data-l'));
        out.innerHTML = '<p class="pre" dir="auto">' + esc(r.text) + '</p><small>' + esc(t(r.online ? 'ai.viaOnline' : 'ai.viaOffline', { p: r.provider || '' })) + '</small>';
      };
    });
    host.appendChild(box);
  }

  function exportCsv(list) {
    var rows = [[t('ar.sort.code'), t('c.name'), t('a.date'), t('c.status'), t('c.category'), t('c.customer'), t('c.printer'), t('c.qty'), 'g', t('c.printTime') + ' (min)', t('c.materials'), t('c.totalCost') + ' USD', t('ar.price') + ' USD', t('c.profit') + ' USD', t('ar.payment') + ' USD', t('c.tags'), t('a.note')]];
    list.forEach(function (j) {
      var c = j.calc || {};
      rows.push([j.code, j.name, j.date, status(j).name || '', A.nameOf(S.lists, j.categoryId, ''), j.customerName || '', j.printerName || '', j.qty, (c.grams || 0).toFixed(2), Math.round(j.printMin || 0),
        (j.materials || []).map(function (m) { return [m.name, m.brand, m.matType, Math.round(m.grams || 0) + 'g'].filter(Boolean).join(' '); }).join(' | '),
        CALC.num(c.cost).toFixed(2), CALC.num(c.price).toFixed(2), CALC.num(c.profit).toFixed(2), CALC.num(j.paid).toFixed(2), j.tags || '', j.note || '']);
    });
    A.saveOut('arsiv-' + A.today() + '.csv', new Blob([A.csv(rows)], { type: 'text/csv' }));
  }

  A.page('archive', { icon: 'archive', group: 'production', render: render });
  A.archive = { detail: detail, payState: payState, filter: F, status: status };
})();
