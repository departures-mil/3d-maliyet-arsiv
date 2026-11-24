/* MÜŞTERİLER — kişi/firma kartları, işleri, toplam ciro, ödenmemiş bakiye. GİDERLER — işe bağlı olmayan genel giderler
   (kira, internet, kargo malzemesi…) raporlarda net kârdan düşülür. Kategoriler Ayarlar → Listeler'den düzenlenir. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  function custStats(c) {
    var jobs = S.jobs.filter(function (j) { return j.customerId === c.id; });
    var r = { jobs: jobs.length, total: 0, paid: 0, profit: 0, last: '' };
    jobs.forEach(function (j) { var p = CALC.num(j.calc && j.calc.price); r.total += p; r.paid += Math.min(p, CALC.num(j.paid)); r.profit += CALC.num(j.calc && j.calc.profit); if ((j.date || '') > r.last) r.last = j.date; });
    r.due = r.total - r.paid;
    return r;
  }
  var CF = { q: '', onlyDue: false };
  function renderCustomers(host) {
    var tb = ui.el('div.toolbar');
    tb.innerHTML = '<label class="search">' + A.icon('search') + '<input type="search" id="cuQ" placeholder="' + esc(t('a.search')) + '" value="' + esc(CF.q) + '"></label>' +
      '<label class="check"><input type="checkbox" id="cuDue"' + (CF.onlyDue ? ' checked' : '') + '><span>' + esc(t('cu.onlyDue')) + '</span></label><span class="fc-spacer"></span>' +
      '<button type="button" class="btn small primary" id="cuNew">' + A.icon('plus') + esc(t('cu.new')) + '</button>';
    host.appendChild(tb);
    var q = CF.q.toLocaleLowerCase(FC.i18n.locale());
    var list = S.customers.filter(function (c) { return !q || [c.name, c.phone, c.email, c.city, c.note].join(' ').toLocaleLowerCase(FC.i18n.locale()).indexOf(q) >= 0; })
      .map(function (c) { return { c: c, s: custStats(c) }; }).filter(function (x) { return !CF.onlyDue || x.s.due > 0.005; })
      .sort(function (a, b) { return b.s.total - a.s.total || A.byName(a.c, b.c); });
    if (!list.length) host.appendChild(ui.el('div.card.empty', { html: A.icon('users') + '<p>' + esc(S.customers.length ? t('a.noMatch') : t('cu.empty')) + '</p>' }));
    else {
      var card = ui.el('div.card.table-card');
      card.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>' + esc(t('a.name')) + '</th><th>' + esc(t('cu.contact')) + '</th><th class="r">' + esc(t('cu.jobs')) + '</th><th class="r">' + esc(t('cu.total')) + '</th><th class="r">' + esc(t('cu.profit')) + '</th><th class="r">' + esc(t('cu.due')) + '</th><th>' + esc(t('cu.last')) + '</th><th></th></tr></thead><tbody>' +
        list.map(function (x) {
          var c = x.c, s = x.s;
          return '<tr data-id="' + esc(c.id) + '"><td><b>' + esc(c.name) + '</b>' + (c.company ? '<small>' + esc(c.company) + '</small>' : '') + '</td><td>' + esc([c.phone, c.email].filter(Boolean).join(' · ')) + (c.city ? '<small>' + esc(c.city) + '</small>' : '') + '</td><td class="r">' + s.jobs + '</td><td class="r">' + esc(A.money(s.total)) +
            '</td><td class="r">' + esc(A.money(s.profit)) + '</td><td class="r ' + (s.due > 0.005 ? 'bad-text' : '') + '"><b>' + esc(A.money(s.due)) + '</b></td><td>' + esc(A.date(s.last)) + '</td><td class="acts">' + A.iconBtn('archive', t('cu.showJobs'), 'jobs') + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      host.appendChild(card);
      A.$$('tbody tr', card).forEach(function (tr) {
        var c = A.byId(S.customers, tr.getAttribute('data-id'));
        tr.querySelector('.jobs').onclick = function () { A.go('archive', { customer: c.id }); };
        tr.querySelector('.edit').onclick = function () { form(c); };
        tr.querySelector('.del').onclick = function () { A.confirmBox(t('cu.confirmDelete', { n: c.name }), async function () { await DB.del('customers', c.id); await A.reload(); A.render(); }); };
      });
    }
    var qi = host.querySelector('#cuQ'), tm;
    qi.oninput = function () { clearTimeout(tm); tm = setTimeout(function () { CF.q = qi.value; A.render().then(function () { var e = document.getElementById('cuQ'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }); }, 200); };
    host.querySelector('#cuDue').onchange = function (e) { CF.onlyDue = e.target.checked; A.render(); };
    host.querySelector('#cuNew').onclick = function () { form(null); };
  }
  function form(c, after) {
    var isNew = !c; c = c || {};
    A.formModal({ title: isNew ? t('cu.new') : t('cu.edit'), icon: 'users', fields: [
      { k: 'name', label: t('a.name'), value: c.name, req: true }, { k: 'company', label: t('cu.company'), value: c.company },
      { k: 'phone', label: t('cu.phone'), value: c.phone, type: 'tel' }, { k: 'email', label: t('cu.email'), value: c.email, type: 'email' },
      { k: 'city', label: t('cu.city'), value: c.city }, { k: 'address', label: t('cu.address'), value: c.address },
      { k: 'note', label: t('a.note'), type: 'textarea', value: c.note, wide: true }
    ].concat(A.fields.formFields('customer', c)), onSave: async function (v) {
      var d = Object.assign({}, c);
      ['name', 'company', 'phone', 'email', 'city', 'address', 'note'].forEach(function (k) { d[k] = v[k]; });
      d.custom = Object.assign({}, d.custom || {}, A.fields.read('customer', v));
      var saved = await DB.put('customers', d); await A.reload();
      if (after) after(saved); else A.render();
    } });
  }

  /* ---------------- giderler ---------------- */
  var EF = { period: 'month', cat: '' };
  function renderExpenses(host) {
    var cats = A.listOf('expenseCat');
    var list = S.expenses.filter(function (e) { return A.inPeriod(e.date, EF.period) && (!EF.cat || e.categoryId === EF.cat); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var tb = ui.el('div.toolbar');
    tb.innerHTML = '<select id="exPer">' + ['all', 'month', 'lastMonth', '30', 'year'].map(function (k) { return '<option value="' + k + '"' + (EF.period === k ? ' selected' : '') + '>' + esc(t('per.' + k)) + '</option>'; }).join('') + '</select>' +
      '<select id="exCat">' + A.opts(cats, EF.cat, t('ex.allCats')) + '</select><span class="fc-spacer"></span>' +
      '<button type="button" class="btn small primary" id="exNew">' + A.icon('plus') + esc(t('ex.new')) + '</button>';
    host.appendChild(tb);
    var total = list.reduce(function (s, e) { return s + CALC.num(e.amount); }, 0);
    var byCat = {}; list.forEach(function (e) { byCat[e.categoryId || ''] = (byCat[e.categoryId || ''] || 0) + CALC.num(e.amount); });
    host.appendChild(ui.el('div.stats', { html: '<div class="stat"><span>' + esc(t('ex.total')) + '</span><b>' + esc(A.money(total)) + '</b></div>' +
      Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).slice(0, 5).map(function (k) { return '<div class="stat"><span>' + esc(A.nameOf(S.lists, k, t('ex.noCat'))) + '</span><b>' + esc(A.money(byCat[k])) + '</b></div>'; }).join('') }));
    if (!list.length) { host.appendChild(ui.el('div.card.empty', { html: A.icon('wallet') + '<p>' + esc(t('ex.empty')) + '</p>' })); }
    else {
      var card = ui.el('div.card.table-card');
      card.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>' + esc(t('a.date')) + '</th><th>' + esc(t('c.category')) + '</th><th>' + esc(t('ex.desc')) + '</th><th class="r">' + esc(t('ex.amount')) + '</th><th></th></tr></thead><tbody>' +
        list.map(function (e) { return '<tr data-id="' + esc(e.id) + '"><td>' + esc(A.date(e.date)) + '</td><td>' + esc(A.nameOf(S.lists, e.categoryId, '—')) + '</td><td>' + esc(e.title || '') + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</td><td class="r"><b>' + esc(A.money(e.amount)) + '</b></td><td class="acts">' + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      host.appendChild(card);
      A.$$('tbody tr', card).forEach(function (tr) {
        var e = A.byId(S.expenses, tr.getAttribute('data-id'));
        tr.querySelector('.edit').onclick = function () { expForm(e); };
        tr.querySelector('.del').onclick = function () { A.confirmBox(t('a.deleteAsk', { n: e.title || '' }), async function () { await DB.del('expenses', e.id); await A.reload(); A.render(); }); };
      });
    }
    host.querySelector('#exPer').onchange = function (e) { EF.period = e.target.value; A.render(); };
    host.querySelector('#exCat').onchange = function (e) { EF.cat = e.target.value; A.render(); };
    host.querySelector('#exNew').onclick = function () { expForm(null); };
  }
  function expForm(e) {
    var cur = S.settings.currency; e = e || {};
    A.formModal({ title: e.id ? t('a.edit') : t('ex.new'), icon: 'wallet', fields: [
      { k: 'date', label: t('a.date'), type: 'date', value: e.date || A.today() },
      { k: 'categoryId', label: t('c.category'), type: 'select', value: e.categoryId || '', options: [{ v: '', l: '—' }].concat(A.listOf('expenseCat').map(function (x) { return { v: x.id, l: x.name }; })) },
      { k: 'title', label: t('ex.desc'), value: e.title, req: true, wide: true },
      { k: 'amount', label: t('ex.amountC', { c: cur }), type: 'number', value: e.amount ? +CALC.convert(e.amount, cur, S.settings).toFixed(2) : '', req: true },
      { k: 'note', label: t('a.note'), value: e.note }
    ], onSave: async function (v) {
      var d = Object.assign({}, e); d.date = v.date; d.categoryId = v.categoryId || null; d.title = v.title; d.note = v.note; d.amount = CALC.toUsd(CALC.num(v.amount), cur, S.settings);
      await DB.put('expenses', d); await A.reload(); A.render();
    } });
  }

  A.page('customers', { icon: 'users', group: 'finance', render: renderCustomers });
  A.page('expenses', { icon: 'wallet', group: 'finance', render: renderExpenses });
  A.customers = { form: form, stats: custStats };
})();
