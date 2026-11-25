/* AYARLAR — her şey eklenebilir, çıkarılabilir, yeniden adlandırılabilir:
   Görünüm (tema, renk şeması, dil, yazı boyutu — çekirdek) · Genel ve para · İşletme bilgisi · Maliyet kalemleri · Modüller ·
   Listeler (iş durumları, kategoriler, gider türleri, yazıcı durumları, kayıt türleri, birimler) · Özel alanlar ·
   GitHub eşitleme · Wi‑Fi eşitleme · Yapay zeka · Yedek · Silinenler ve çakışma yedekleri ·
   (çekirdek) Asistan · Kullanım Limitleri · Hata raporu · Hakkında · Admin ile iletişim (EN SON). */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  function cardEl(key, icon, title, desc) {
    var c = ui.el('section.card', { 'data-card': key, id: 'set-' + key });
    c.innerHTML = '<h3 class="card-title">' + A.icon(icon) + '<span>' + esc(title) + '</span></h3>' + (desc ? '<p class="card-desc">' + esc(desc) + '</p>' : '');
    return c;
  }
  async function saveSet(patch, rerender) { await DB.saveSettings(patch); await A.reload(); if (rerender !== false) A.render(); }
  function money(v) { return +CALC.convert(CALC.num(v), S.settings.currency, S.settings).toFixed(4); }
  function usd(v) { return CALC.toUsd(CALC.num(v), S.settings.currency, S.settings); }

  /* ---------------- genel ve para ---------------- */
  function general() {
    var st = S.settings, cur = st.currency;
    var c = cardEl('general', 'calc', t('st.general'), t('st.generalDesc'));
    var f = ui.el('div.form-grid');
    f.innerHTML =
      '<label class="field"><span class="field-label">' + esc(t('st.currency')) + '</span><select id="sCur">' + ['USD', 'TRY', 'SYP'].map(function (k) { return '<option' + (k === cur ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="field-label">1 USD = TRY</span><input id="sTry" type="number" step="any" value="' + esc(st.rateTry) + '"></label>' +
      '<label class="field"><span class="field-label">1 USD = SYP</span><input id="sSyp" type="number" step="any" value="' + esc(st.rateSyp) + '"></label>' +
      '<label class="check"><input type="checkbox" id="sAutoR"' + (st.autoRates ? ' checked' : '') + '><span>' + esc(t('st.autoRates')) + '</span></label>' +
      '<div class="wide fc-row"><button type="button" class="btn small" id="sRates">' + A.icon('sync') + esc(t('st.fetchRates')) + '</button><small class="muted" id="sRatesInfo">' + esc(st.ratesAt ? t('st.ratesAt', { d: A.dateTime(st.ratesAt), s: st.ratesSrc || '' }) : '') + '</small></div>' +
      '<div class="form-sec">' + esc(t('st.defaults')) + '</div>' +
      '<label class="field"><span class="field-label">' + esc(t('st.kwh', { c: cur })) + '</span><input id="sKwh" type="number" step="any" value="' + money(st.kwhPrice) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.labor', { c: cur })) + '</span><input id="sLabor" type="number" step="any" value="' + money(st.laborRate) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.margin')) + '</span><input id="sMargin" type="number" step="any" value="' + esc(st.margin) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.round', { c: cur })) + '</span><input id="sRound" type="number" step="any" value="' + esc(st.roundTo || 0) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.failPct')) + '</span><input id="sFail" type="number" step="any" value="' + esc(st.failPct) + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.defPrinter')) + '</span><select id="sPrn">' + A.opts(S.printers, st.defPrinterId, '—') + '</select></label>' +
      '<label class="check wide"><input type="checkbox" id="sLow"' + (st.lowWarn !== false ? ' checked' : '') + '><span>' + esc(t('st.lowWarn')) + '</span></label>' +
      '<label class="check wide"><input type="checkbox" id="sAutoUp"' + (st.autoUpdate !== false ? ' checked' : '') + '><span>' + esc(t('st.autoUpdate')) + '</span></label>';
    c.appendChild(f);
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn primary small">' + A.icon('check') + esc(t('a.save')) + '</button>' }); c.appendChild(row);
    row.querySelector('button').onclick = async function () {
      var q = function (s) { return f.querySelector(s); };
      var newCur = q('#sCur').value;
      var rates = { rateTry: CALC.pos(q('#sTry').value) || st.rateTry, rateSyp: CALC.pos(q('#sSyp').value) || st.rateSyp };
      var tmp = Object.assign({}, st, rates);
      await saveSet({ currency: newCur, rateTry: rates.rateTry, rateSyp: rates.rateSyp, autoRates: q('#sAutoR').checked,
        kwhPrice: CALC.toUsd(CALC.num(q('#sKwh').value), cur, tmp), laborRate: CALC.toUsd(CALC.num(q('#sLabor').value), cur, tmp),
        margin: CALC.num(q('#sMargin').value), roundTo: CALC.pos(q('#sRound').value), failPct: CALC.pos(q('#sFail').value), defPrinterId: q('#sPrn').value || null,
        lowWarn: q('#sLow').checked, autoUpdate: q('#sAutoUp').checked });
      A.toast(t('a.saved'), 'good');
    };
    f.querySelector('#sRates').onclick = async function () {
      var b = this; b.disabled = true; f.querySelector('#sRatesInfo').textContent = t('a.working');
      try { var r = await CALC.fetchRates(); var p = { ratesAt: DB.now(), ratesSrc: r.src }; if (r.rateTry) p.rateTry = +r.rateTry.toFixed(4); if (r.rateSyp) p.rateSyp = +r.rateSyp.toFixed(2); await saveSet(p); A.toast(t('st.ratesOk'), 'good'); }
      catch (e) { f.querySelector('#sRatesInfo').textContent = t('st.ratesFail') + ' ' + (e.message || e); b.disabled = false; }
    };
    return c;
  }

  /* ---------------- işletme ---------------- */
  function business() {
    var st = S.settings, c = cardEl('biz', 'tag', t('st.biz'), t('st.bizDesc'));
    var f = ui.el('div.form-grid');
    f.innerHTML = '<label class="field wide"><span class="field-label">' + esc(t('st.bizName')) + '</span><input id="bName" value="' + esc(st.bizName || '') + '"></label>' +
      '<label class="field wide"><span class="field-label">' + esc(t('st.bizInfo')) + '</span><textarea id="bInfo" rows="2">' + esc(st.bizInfo || '') + '</textarea></label>' +
      '<label class="field wide"><span class="field-label">' + esc(t('st.quoteNote')) + '</span><textarea id="bNote" rows="2" placeholder="' + esc(t('q.note')) + '">' + esc(st.quoteNote || '') + '</textarea></label>';
    c.appendChild(f);
    var b = ui.el('button.btn.primary.small', { type: 'button', html: A.icon('check') + esc(t('a.save')) }); c.appendChild(b);
    b.onclick = async function () { await saveSet({ bizName: f.querySelector('#bName').value.trim(), bizInfo: f.querySelector('#bInfo').value.trim(), quoteNote: f.querySelector('#bNote').value.trim() }); A.toast(t('a.saved'), 'good'); };
    return c;
  }

  /* ---------------- maliyet kalemleri ---------------- */
  function costItems() {
    var c = cardEl('costItems', 'layers', t('st.costItems'), t('st.costItemsDesc'));
    var cur = S.settings.currency;
    var unit = function (ty) { return { fail: '%', pctCost: '%', pctPrice: '%', energy: cur + '/kWh', labor: cur + '/' + t('u.h'), perPiece: cur + '/' + t('u.pcs'), perHour: cur + '/' + t('u.h'), perGram: cur + '/g', fixed: cur }[ty] || ''; };
    var pct = function (ty) { return /^(fail|pctCost|pctPrice)$/.test(ty); };
    var tbl = ui.el('div.tablewrap');
    tbl.innerHTML = '<table class="tbl"><thead><tr><th></th><th>' + esc(t('a.name')) + '</th><th>' + esc(t('st.ciType')) + '</th><th class="r">' + esc(t('st.ciAmount')) + '</th><th>' + esc(t('st.ciOn')) + '</th><th></th></tr></thead><tbody>' +
      S.costItems.map(function (it, i) {
        var auto = it.type === 'material' || it.type === 'wear';
        return '<tr data-id="' + esc(it.id) + '"><td><i class="dot" style="background:' + esc(it.color || 'var(--accent)') + '"></i></td><td><b>' + esc(it.name) + '</b></td><td>' + esc(t('ct.' + it.type)) + '</td><td class="r">' +
          (auto ? '<span class="muted">' + esc(t('c.auto')) + '</span>' : esc(pct(it.type) ? A.num(it.amount, 2) : (it.type === 'energy' || it.type === 'labor') && !CALC.pos(it.amount) ? t('st.fromDefaults') : A.num(money(it.amount), 4)) + ' <small>' + esc(unit(it.type)) + '</small>') + '</td>' +
          '<td>' + (it.on ? '<span class="badge ok">' + esc(t('a.on')) + '</span>' : '<span class="badge">' + esc(t('a.off')) + '</span>') + '</td><td class="acts">' +
          A.iconBtn('up', t('a.up'), 'up') + A.iconBtn('down', t('a.down'), 'down') + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>';
      }).join('') + '</tbody></table>';
    c.appendChild(tbl);
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn small primary" id="ciAdd">' + A.icon('plus') + esc(t('st.ciAdd')) + '</button><button type="button" class="btn small ghost" id="ciReset">' + esc(t('st.ciReset')) + '</button>' });
    c.appendChild(row);
    A.$$('tbody tr', tbl).forEach(function (tr, i) {
      var it = A.byId(S.costItems, tr.getAttribute('data-id'));
      tr.querySelector('.edit').onclick = function () { itemForm(it); };
      tr.querySelector('.del').onclick = function () { A.confirmBox(t('a.deleteAsk', { n: it.name }), async function () { await DB.del('costItems', it.id); await A.reload(); A.render(); }); };
      tr.querySelector('.up').onclick = function () { move(S.costItems, 'costItems', i, -1); };
      tr.querySelector('.down').onclick = function () { move(S.costItems, 'costItems', i, 1); };
    });
    row.querySelector('#ciAdd').onclick = function () { itemForm(null); };
    row.querySelector('#ciReset').onclick = function () {
      A.confirmBox(t('st.ciResetQ'), async function () {
        var defs = CALC.defaultItems(t), have = {}; (await DB.all('costItems', true)).forEach(function (x) { have[x.id] = x; });
        for (var i = 0; i < defs.length; i++) { var d = defs[i], h = have[d.id]; if (!h) await DB.put('costItems', d); else if (h.deleted || h.archived) await DB.restore('costItems', d.id); }
        await A.reload(); A.render(); A.toast(t('a.saved'), 'good');
      }, { danger: false });
    };
    function itemForm(it) {
      var isNew = !it; it = it || { type: 'fixed', on: true, color: '#14b8a6', amount: 0 };
      var m = A.formModal({ title: isNew ? t('st.ciAdd') : t('a.edit'), icon: 'layers', fields: [
        { k: 'name', label: t('a.name'), value: it.name, req: true, wide: true },
        { k: 'type', label: t('st.ciType'), type: 'select', value: it.type, options: CALC.TYPES.map(function (x) { return { v: x, l: t('ct.' + x) + ' — ' + t('ct.' + x + '.d') }; }), wide: true },
        { k: 'amount', label: t('st.ciAmount'), type: 'number', value: pct(it.type) ? it.amount : money(it.amount), hint: t('st.ciAmountHint') },
        { k: 'color', label: t('a.color'), type: 'color', value: it.color || '#14b8a6' },
        { k: 'on', label: t('st.ciOnDefault'), type: 'check', value: it.on !== false, wide: true }
      ], onSave: async function (v) {
        var d = Object.assign({}, it, { name: v.name, type: v.type, color: v.color, on: v.on, amount: pct(v.type) ? CALC.num(v.amount) : usd(v.amount) });
        if (isNew) d.order = (S.costItems.reduce(function (s, x) { return Math.max(s, x.order || 0); }, 0)) + 1;
        await DB.put('costItems', d); await A.reload(); A.render();
      } });
      var ty = m.inputs.type, un = ui.el('span.field-hint'); m.inputs.amount.parentNode.appendChild(un);
      function upd() { un.textContent = unit(ty.value) + (ty.value === 'material' || ty.value === 'wear' ? ' · ' + t('c.auto') : ''); }
      ty.onchange = upd; upd();
    }
    return c;
  }
  async function move(list, store, i, dir) {
    var j = i + dir; if (j < 0 || j >= list.length) return;
    var arr = list.slice(); var x = arr[i]; arr[i] = arr[j]; arr[j] = x;
    for (var k = 0; k < arr.length; k++) if (arr[k].order !== k + 1) { arr[k].order = k + 1; await DB.put(store, arr[k]); }
    await A.reload(); A.render();
  }

  /* ---------------- modüller ---------------- */
  function modules() {
    var c = cardEl('modules', 'grid', t('st.modules'), t('st.modulesDesc'));
    var mods = A.moduleList();
    var tbl = ui.el('div.tablewrap');
    tbl.innerHTML = '<table class="tbl"><thead><tr><th></th><th>' + esc(t('st.modName')) + '</th><th>' + esc(t('st.modGroup')) + '</th><th>' + esc(t('st.modShow')) + '</th><th></th></tr></thead><tbody>' +
      mods.map(function (m) { return '<tr data-id="' + esc(m.id) + '"><td>' + A.icon(m.icon) + '</td><td><input class="mn" value="' + esc(m.name) + '" placeholder="' + esc(t('nav.' + m.id)) + '"></td><td><small class="muted">' + esc(t('navg.' + m.group)) + '</small></td><td><input type="checkbox" class="mh"' + (m.hidden ? '' : ' checked') + (m.fixed ? ' disabled' : '') + '></td><td class="acts">' + A.iconBtn('up', t('a.up'), 'up') + A.iconBtn('down', t('a.down'), 'down') + '</td></tr>'; }).join('') + '</tbody></table>';
    c.appendChild(tbl);
    function read() { return A.$$('tbody tr', tbl).map(function (tr) { return { id: tr.getAttribute('data-id'), name: tr.querySelector('.mn').value.trim(), hidden: !tr.querySelector('.mh').checked }; }); }
    async function save(list) { await saveSet({ modules: list }); }
    A.$$('tbody tr', tbl).forEach(function (tr, i) {
      tr.querySelector('.up').onclick = function () { var l = read(); if (i > 0) { var x = l[i]; l[i] = l[i - 1]; l[i - 1] = x; save(l); } };
      tr.querySelector('.down').onclick = function () { var l = read(); if (i < l.length - 1) { var x = l[i]; l[i] = l[i + 1]; l[i + 1] = x; save(l); } };
      tr.querySelector('.mh').onchange = function () { save(read()); };
      tr.querySelector('.mn').onchange = function () { save(read()); };
    });
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn small ghost">' + esc(t('st.modReset')) + '</button>' }); c.appendChild(row);
    row.querySelector('button').onclick = function () { save(null); };
    return c;
  }

  /* ---------------- listeler ---------------- */
  var LISTS = ['jobStatus', 'jobCategory', 'expenseCat', 'printerStatus', 'logType', 'unit'];
  var LK = { kind: 'jobStatus' };
  function lists() {
    var c = cardEl('lists', 'list', t('st.lists'), t('st.listsDesc'));
    var tabs = ui.el('div.chips');
    tabs.innerHTML = LISTS.map(function (k) { return '<button type="button" class="chip' + (LK.kind === k ? ' on' : '') + '" data-k="' + k + '">' + esc(t('ls.' + k)) + ' <em>' + A.listOf(k).length + '</em></button>'; }).join('');
    c.appendChild(tabs);
    A.$$('[data-k]', tabs).forEach(function (b) { b.onclick = function () { LK.kind = b.getAttribute('data-k'); A.render(); }; });
    var items = A.listOf(LK.kind), isSt = LK.kind === 'jobStatus';
    var tbl = ui.el('div.tablewrap');
    tbl.innerHTML = '<table class="tbl"><thead><tr><th></th><th>' + esc(t('a.name')) + '</th>' + (isSt ? '<th>' + esc(t('ls.printed')) + '</th><th>' + esc(t('ls.sold')) + '</th>' : '') + '<th class="r">' + esc(t('ls.used')) + '</th><th></th></tr></thead><tbody>' +
      items.map(function (x) { return '<tr data-id="' + esc(x.id) + '"><td><i class="dot" style="background:' + esc(x.color || 'var(--muted)') + '"></i></td><td><b>' + esc(x.name) + '</b></td>' + (isSt ? '<td>' + (x.printed !== false ? '✓' : '—') + '</td><td>' + (x.sold !== false ? '✓' : '—') + '</td>' : '') + '<td class="r">' + usage(LK.kind, x.id) + '</td><td class="acts">' + A.iconBtn('up', t('a.up'), 'up') + A.iconBtn('down', t('a.down'), 'down') + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>'; }).join('') + '</tbody></table>';
    c.appendChild(tbl);
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn small primary">' + A.icon('plus') + esc(t('ls.add')) + '</button>' + (LK.kind === 'jobStatus' || LK.kind === 'logType' ? '<small class="muted">' + esc(t('ls.keyHint')) + '</small>' : '') }); c.appendChild(row);
    row.querySelector('button').onclick = function () { listForm(null); };
    A.$$('tbody tr', tbl).forEach(function (tr, i) {
      var x = A.byId(S.lists, tr.getAttribute('data-id'));
      tr.querySelector('.edit').onclick = function () { listForm(x); };
      tr.querySelector('.del').onclick = function () { A.confirmBox(t('ls.delAsk', { n: x.name, u: usage(LK.kind, x.id) }), async function () { await DB.del('lists', x.id); await A.reload(); A.render(); }); };
      tr.querySelector('.up').onclick = function () { move(items, 'lists', i, -1); };
      tr.querySelector('.down').onclick = function () { move(items, 'lists', i, 1); };
    });
    function listForm(x) {
      var isNew = !x; x = x || { list: LK.kind, color: '#64748b' };
      var fields = [{ k: 'name', label: t('a.name'), value: x.name, req: true, wide: true }, { k: 'color', label: t('a.color'), type: 'color', value: x.color || '#64748b' }];
      if (isSt) fields.push({ k: 'printed', label: t('ls.printedL'), type: 'check', value: x.printed !== false, wide: true }, { k: 'sold', label: t('ls.soldL'), type: 'check', value: x.sold !== false, wide: true });
      A.formModal({ title: isNew ? t('ls.add') : t('a.edit'), icon: 'list', fields: fields, onSave: async function (v) {
        var d = Object.assign({}, x, { name: v.name, color: v.color });
        if (isSt) { d.printed = v.printed; d.sold = v.sold; }
        if (isNew) d.order = items.length + 1;
        await DB.put('lists', d); await A.reload(); A.render();
      } });
    }
    return c;
  }
  function usage(kind, id) {
    var n = 0;
    if (kind === 'jobStatus') n = S.jobs.filter(function (j) { return j.statusId === id; }).length;
    else if (kind === 'jobCategory') n = S.jobs.filter(function (j) { return j.categoryId === id; }).length;
    else if (kind === 'expenseCat') n = S.expenses.filter(function (e) { return e.categoryId === id; }).length;
    else if (kind === 'printerStatus') n = S.printers.filter(function (p) { return p.statusId === id; }).length;
    else if (kind === 'logType') n = S.printerLogs.filter(function (l) { return l.typeId === id; }).length;
    else if (kind === 'unit') { var nm = (A.byId(S.lists, id) || {}).name; n = S.materials.filter(function (m) { return m.unit === nm; }).length; }
    return n;
  }

  /* ---------------- özel alanlar ---------------- */
  var ENT = ['job', 'material', 'printer', 'customer'];
  function fields() {
    var c = cardEl('fields', 'edit', t('st.fields'), t('st.fieldsDesc'));
    var list = S.fields.slice().sort(function (a, b) { return ENT.indexOf(a.entity) - ENT.indexOf(b.entity) || (a.order || 0) - (b.order || 0); });
    var tbl = ui.el('div.tablewrap');
    tbl.innerHTML = list.length ? '<table class="tbl"><thead><tr><th>' + esc(t('a.name')) + '</th><th>' + esc(t('st.fEntity')) + '</th><th>' + esc(t('st.fType')) + '</th><th></th></tr></thead><tbody>' +
      list.map(function (f) { return '<tr data-id="' + esc(f.id) + '"><td><b>' + esc(f.name) + '</b>' + (f.options ? '<small>' + esc(f.options) + '</small>' : '') + '</td><td>' + esc(t('fe.' + f.entity)) + '</td><td>' + esc(t('ft.' + f.type)) + '</td><td class="acts">' + A.iconBtn('edit', t('a.edit'), 'edit') + A.iconBtn('trash', t('a.delete'), 'del danger') + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">' + esc(t('st.fNone')) + '</p>';
    c.appendChild(tbl);
    var b = ui.el('button.btn.small.primary', { type: 'button', html: A.icon('plus') + esc(t('st.fAdd')) }); c.appendChild(b);
    b.onclick = function () { form(null); };
    A.$$('tbody tr', tbl).forEach(function (tr) {
      var f = A.byId(S.fields, tr.getAttribute('data-id'));
      tr.querySelector('.edit').onclick = function () { form(f); };
      tr.querySelector('.del').onclick = function () { A.confirmBox(t('a.deleteAsk', { n: f.name }), async function () { await DB.del('fields', f.id); await A.reload(); A.render(); }); };
    });
    function form(f) {
      var isNew = !f; f = f || { entity: 'job', type: 'text' };
      A.formModal({ title: isNew ? t('st.fAdd') : t('a.edit'), icon: 'edit', fields: [
        { k: 'name', label: t('a.name'), value: f.name, req: true, wide: true },
        { k: 'entity', label: t('st.fEntity'), type: 'select', value: f.entity, options: ENT.map(function (e) { return { v: e, l: t('fe.' + e) }; }) },
        { k: 'type', label: t('st.fType'), type: 'select', value: f.type, options: ['text', 'number', 'date', 'select', 'check'].map(function (e) { return { v: e, l: t('ft.' + e) }; }) },
        { k: 'options', label: t('st.fOptions'), value: f.options, wide: true, hint: t('st.fOptionsHint') }
      ], onSave: async function (v) {
        var d = Object.assign({}, f, v);
        if (isNew) d.order = S.fields.filter(function (x) { return x.entity === v.entity; }).length + 1;
        await DB.put('fields', d); await A.reload(); A.render();
      } });
    }
    return c;
  }

  /* ---------------- yapay zeka ---------------- */
  function ai() {
    var c = cardEl('ai', 'bot', t('st.ai'), t('st.aiDesc'));
    var a = A.ai.cfg(), P = A.ai.PROVIDERS;
    var keyUrl = { gemini: 'https://aistudio.google.com/app/apikey', openai: 'https://platform.openai.com/api-keys', anthropic: 'https://console.anthropic.com/settings/keys', groq: 'https://console.groq.com/keys' };
    var f = ui.el('div.form-grid');
    f.innerHTML = '<label class="field"><span class="field-label">' + esc(t('st.aiProvider')) + '</span><select id="aiP">' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (k === a.provider ? ' selected' : '') + '>' + esc(P[k].name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="field-label">' + esc(t('st.aiModel')) + '</span><input id="aiM" value="' + esc(a.model) + '" placeholder="' + esc(t('st.aiModelAuto')) + '"></label>' +
      '<label class="field wide"><span class="field-label">' + esc(t('st.aiKey')) + '</span><input id="aiK" type="password" value="' + esc(a.key) + '" autocomplete="off"><span class="field-hint">' + esc(t('st.aiKeyHint')) + ' <a href="#" id="aiGet">' + esc(t('st.aiGetKey')) + '</a></span></label>' +
      '<label class="check wide"><input type="checkbox" id="aiOn"' + (a.onlineFirst ? ' checked' : '') + '><span>' + esc(t('st.aiOnline')) + '</span></label>' +
      '<p class="field-hint wide">' + esc(t('st.aiOffline')) + '</p>';
    c.appendChild(f);
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn small primary" id="aiSave">' + A.icon('check') + esc(t('sy.saveTest')) + '</button><small class="muted" id="aiRes"></small>' }); c.appendChild(row);
    f.querySelector('#aiGet').onclick = function (e) { e.preventDefault(); ui.openUrl(keyUrl[f.querySelector('#aiP').value]); };
    row.querySelector('#aiSave').onclick = async function () {
      var v = { provider: f.querySelector('#aiP').value, key: f.querySelector('#aiK').value.trim(), model: f.querySelector('#aiM').value.trim(), onlineFirst: f.querySelector('#aiOn').checked };
      await DB.saveSettings({ ai: v }); await A.reload();
      var res = row.querySelector('#aiRes');
      if (!v.key) { res.textContent = t('a.saved'); return; }
      res.textContent = t('sy.testing');
      var r = await FC.onboarding.testAi(v.provider, v.key);
      res.textContent = r === 'ok' ? t('st.aiOk') : r === 'bad' ? t('st.aiBad') : t('st.aiUnknown');
    };
    return c;
  }

  /* ---------------- yedek ---------------- */
  function backup() {
    var c = cardEl('backup', 'download', t('st.backup'), t('st.backupDesc'));
    var row = ui.el('div.fc-row', { html: '<button type="button" class="btn small primary" id="bkOut">' + A.icon('download') + esc(t('st.backupOut')) + '</button><button type="button" class="btn small" id="bkOutLite">' + esc(t('st.backupLite')) + '</button><button type="button" class="btn small" id="bkIn">' + A.icon('upload') + esc(t('st.backupIn')) + '</button>' });
    c.appendChild(row);
    async function out(withFiles) {
      var data = await DB.exportAll(withFiles);
      await A.saveOut('3d-maliyet-yedek-' + A.today() + (withFiles ? '' : '-gorselsiz') + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }));
      await saveSet({ lastBackup: DB.now() }, false);
    }
    row.querySelector('#bkOut').onclick = function () { out(true); };
    row.querySelector('#bkOutLite').onclick = function () { out(false); };
    row.querySelector('#bkIn').onclick = async function () {
      var fs = await A.pickFiles('.json,application/json'); if (!fs.length) return;
      try { var n = await DB.importAll(JSON.parse(await fs[0].text())); await A.reload(); A.render(); A.toast(t('st.backupDone', { n: n }), 'good'); }
      catch (e) { A.toast(t('st.backupBad') + ' ' + (e.message || e), 'bad'); }
    };
    if (S.settings.lastBackup) c.appendChild(ui.el('p.status', { text: t('st.lastBackup', { d: A.dateTime(S.settings.lastBackup) }) }));
    return c;
  }

  /* ---------------- silinenler ve çakışma yedekleri ---------------- */
  var STORE_NAMES = ['jobs', 'projects', 'materials', 'movements', 'printers', 'printerLogs', 'customers', 'expenses', 'categories', 'locations', 'costItems', 'lists', 'fields'];
  function recName(r) { return r ? (r.name || r.title || r.code || r.party || r.serial || r.id) : ''; }
  function trash() {
    var c = cardEl('trash', 'trash', t('st.trash'), t('st.trashDesc'));
    var box = ui.el('div', { html: '<p class="muted">' + esc(t('a.working')) + '</p>' }); c.appendChild(box);
    (async function () {
      var rows = [];
      for (var i = 0; i < STORE_NAMES.length; i++) {
        var s = STORE_NAMES[i]; (await DB.all(s, true)).forEach(function (r) { if (r.deleted || r.archived) rows.push({ s: s, r: r }); });
      }
      rows.sort(function (a, b) { return String(b.r.deletedAt || b.r.archivedAt || '').localeCompare(String(a.r.deletedAt || a.r.archivedAt || '')); });
      var cf = (await DB.all('cakismalar', true)).sort(function (a, b) { return String(b.zaman).localeCompare(String(a.zaman)); });
      var h = '<div class="form-sec">' + esc(t('st.deleted')) + ' (' + rows.length + ')</div>';
      h += rows.length ? '<div class="tablewrap short"><table class="tbl small"><tbody>' + rows.slice(0, 200).map(function (x, i) { return '<tr><td>' + esc(t('sn.' + x.s)) + '</td><td><b>' + esc(recName(x.r)) + '</b>' + (x.r.archived ? ' <span class="badge warn">' + esc(t('st.archivedBySync')) + '</span>' : '') + '</td><td>' + esc(A.dateTime(x.r.deletedAt || x.r.archivedAt)) + '</td><td class="acts"><button type="button" class="btn tiny" data-rs="' + i + '">' + esc(t('st.restore')) + '</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">' + esc(t('st.noDeleted')) + '</p>';
      h += '<div class="form-sec">' + esc(t('st.conflicts')) + ' (' + cf.length + ')</div>';
      h += cf.length ? '<div class="tablewrap short"><table class="tbl small"><tbody>' + cf.slice(0, 200).map(function (x, i) { return '<tr><td>' + esc(t('sn.' + x.store)) + '</td><td><b>' + esc(recName(x.kaybeden)) + '</b><small>' + esc((x.tur === 'silinen' ? t('st.cfDeleted') : t('st.cfLost')) + ' · ' + (x.kaynak || '')) + '</small></td><td>' + esc(A.dateTime(x.zaman)) + '</td><td class="acts"><button type="button" class="btn tiny" data-cv="' + i + '">' + esc(t('st.cfUse')) + '</button>' + A.iconBtn('trash', t('a.delete'), 'cfdel danger') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">' + esc(t('st.noConflicts')) + '</p>';
      box.innerHTML = h;
      A.$$('[data-rs]', box).forEach(function (b) { b.onclick = async function () { var x = rows[+b.getAttribute('data-rs')]; await DB.restore(x.s, x.r.id); await A.reload(); A.render(); A.toast(t('st.restored'), 'good'); }; });
      A.$$('[data-cv]', box).forEach(function (b) {
        b.onclick = function () {
          var x = cf[+b.getAttribute('data-cv')];
          A.confirmBox(t('st.cfUseQ', { n: recName(x.kaybeden) }), async function () {
            var cur = await DB.get(x.store, x.recId);
            if (cur) await DB.conflict(x.store, cur, x.kaybeden, t('st.cfManual'));
            var d = Object.assign({}, x.kaybeden); delete d.deleted; delete d.deletedAt; delete d.archived; delete d.archivedAt;
            if (x.store === 'files' && cur) d.data = cur.data;
            await DB.put(x.store, d); await A.reload(); A.render(); A.toast(t('st.restored'), 'good');
          }, { danger: false });
        };
      });
      A.$$('.cfdel', box).forEach(function (b, i) { b.onclick = function () { A.confirmBox(t('st.cfDelQ'), async function () { var o = await DB.open(); o.transaction('cakismalar', 'readwrite').objectStore('cakismalar').delete(cf[i].id); setTimeout(A.render, 150); }); }; });
    })();
    return c;
  }

  /* ---------------- sayfa ---------------- */
  function render(host, arg) {
    var nav = ui.el('div.chips.set-nav');
    var keys = [['general', 'st.general'], ['costItems', 'st.costItems'], ['modules', 'st.modules'], ['lists', 'st.lists'], ['fields', 'st.fields'], ['sync', 'sy.title'], ['wifi', 'wf.title'], ['ai', 'st.ai'], ['backup', 'st.backup'], ['trash', 'st.trash'], ['contact', 'st.contact']];
    nav.innerHTML = keys.map(function (k) { return '<button type="button" class="chip" data-j="' + k[0] + '">' + esc(t(k[1])) + '</button>'; }).join('');
    host.appendChild(nav);
    var wrap = ui.el('div');
    host.appendChild(wrap);
    FC.settings.build(wrap, A.kabuk ? A.kabuk.settingsOptions([general(), business(), costItems(), modules(), lists(), fields(), A.sync.card(), A.wifi.card(), ai(), backup(), trash()]) :
      { cards: [general(), business(), costItems(), modules(), lists(), fields(), A.sync.card(), A.wifi.card(), ai(), backup(), trash()], usage: { firebase: false, ai: true } });
    A.$$('[data-j]', nav).forEach(function (b) { b.onclick = function () { jump(host, b.getAttribute('data-j')); }; });
    if (arg && arg.focus) setTimeout(function () { jump(host, arg.focus); }, 60);
  }
  function jump(host, key) {
    var el = host.querySelector('[data-card="' + key + '"],[data-fc-card="' + key + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600);
  }

  A.page('settings', { icon: 'settings', group: 'system', render: render, fixed: true });
})();
