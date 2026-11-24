/* Ortak yardımcılar, uygulama durumu (S), kenar çubuğu ve sayfa yönlendirme.
   Sayfalar APP.page(id, {icon, group, render(host), title?}) ile kaydolur; ad/görünürlük/sıra Ayarlar → Modüller'den değişir. */
(function () {
  'use strict';
  var ui = FC.ui;
  var t = function (k, v) { return FC.t(k, v); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = ui.esc;

  var S = {
    settings: null,
    categories: [], locations: [], materials: [], movements: [], printers: [], printerLogs: [], customers: [],
    jobs: [], expenses: [], costItems: [], lists: [], fields: [],
    page: 'dashboard'
  };

  async function reload() {
    S.settings = await DB.getSettings();
    var names = ['categories', 'locations', 'materials', 'movements', 'printers', 'printerLogs', 'customers', 'jobs', 'expenses', 'costItems', 'lists', 'fields'];
    var res = await Promise.all(names.map(function (n) { return DB.all(n); }));
    names.forEach(function (n, i) { S[n] = res[i]; });
    S.costItems.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    S.lists.sort(function (a, b) { return (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)); });
    /* Stok, hareketlerden hesaplanır (başlangıç + giriş − çıkış − kullanım ± düzeltme): eşitlemede hareketler
       birleştiği için iki cihazdaki girişler/çıkışlar kaybolmaz. */
    var st = {};
    S.materials.forEach(function (m) { st[m.id] = CALC.num(m.initialQty); });
    S.movements.forEach(function (v) {
      if (!(v.materialId in st)) return;
      var q = CALC.num(v.qty);
      st[v.materialId] += v.type === 'in' ? q : v.type === 'adjust' ? q : -q;
    });
    S.stock = st;
  }
  function stockOf(id) { var v = (S.stock || {})[id]; return Math.round((v || 0) * 1000) / 1000; }
  /* Filament: kg fiyatı = makara fiyatı / makara ağırlığı (kg). Ağırlık yoksa birim fiyat kg fiyatı sayılır. */
  function kgPrice(m) {
    if (!m) return 0;
    if (CALC.pos(m.kgPrice)) return CALC.pos(m.kgPrice);
    var w = CALC.pos(m.weightG);
    return w ? CALC.pos(m.unitPrice) / (w / 1000) : CALC.pos(m.unitPrice);
  }
  function isLow(m) { return CALC.num(m.minQty) > 0 ? stockOf(m.id) <= CALC.num(m.minQty) : stockOf(m.id) <= 0; }
  function catPath(id) {
    var parts = [], seen = {}, c = byId(S.categories, id);
    while (c && !seen[c.id]) { seen[c.id] = 1; parts.unshift(c.name); c = byId(S.categories, c.parentId); }
    return parts.join(' › ');
  }

  /* ---------- biçimler ---------- */
  function num(v, d) { return FC.i18n.num(CALC.num(v), d == null ? 0 : d); }
  function money(usd, cur) { return CALC.fmt(usd, cur || S.settings.currency, S.settings); }
  function moneyAlt(usd) {
    var main = S.settings.currency, out = [];
    ['USD', 'TRY', 'SYP'].forEach(function (c) { if (c !== main) out.push(CALC.fmt(usd, c, S.settings)); });
    return out.join(' · ');
  }
  function date(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString(FC.i18n.locale());
  }
  function dateTime(iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(FC.i18n.locale(), { dateStyle: 'short', timeStyle: 'short' }); }
  var today = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function nameOf(list, id, fb) { var x = byId(list, id); return x ? x.name : (fb == null ? '—' : fb); }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), FC.i18n.locale()); }
  function opts(list, sel, ph, labelFn) {
    var h = ph === false ? '' : '<option value="">' + esc(ph || '—') + '</option>';
    list.forEach(function (x) { h += '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(labelFn ? labelFn(x) : x.name) + '</option>'; });
    return h;
  }
  function listOf(kind) { return S.lists.filter(function (x) { return x.list === kind; }); }

  /* ---------- bildirim / onay / form ---------- */
  function toast(msg, kind) { ui.toast(msg, kind === 'bad' ? 'error' : kind === 'good' ? '' : 'info'); }
  function confirmBox(text, onYes, o) {
    o = o || {};
    ui.modal({ title: o.title || t('a.confirm'), icon: o.icon || 'alert', cls: 'small', body: '<p>' + esc(text) + '</p>', buttons: [
      { label: t('a.cancel'), cls: 'ghost' }, 'spacer',
      { label: o.yes || t('a.yes'), cls: o.danger === false ? 'primary' : 'danger', onClick: function () { onYes(); } }] });
  }
  function prompt(title, value, onOk, o) {
    o = o || {};
    var body = ui.el('div');
    var inp = ui.el('input', { type: o.type || 'text', value: value || '', placeholder: o.placeholder || '' });
    body.appendChild(ui.el('label.field', null, [ui.el('span.field-label', { text: o.label || title }), inp]));
    var m = ui.modal({ title: title, icon: o.icon || 'edit', cls: 'small', body: body, buttons: [
      { label: t('a.cancel'), cls: 'ghost' }, 'spacer',
      { label: o.ok || t('a.save'), cls: 'primary', onClick: function () { var v = inp.value.trim(); if (!v && !o.allowEmpty) { inp.focus(); return false; } onOk(v); } }] });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); m.el.querySelector('.modal-footer .btn.primary').click(); } });
    setTimeout(function () { inp.focus(); inp.select(); }, 30);
    return m;
  }
  /* Basit form: fields [{k, label, type:'text'|'number'|'date'|'select'|'textarea'|'color'|'check'|'html', options:[{v,l}], value, hint, wide, step, attrs}] */
  function formModal(o) {
    var body = ui.el('div.form-grid' + (o.cols === 1 ? '.one' : ''));
    var inputs = {};
    (o.fields || []).forEach(function (f) {
      if (f.type === 'section') { body.appendChild(ui.el('div.form-sec', { text: f.label })); return; }
      if (f.type === 'html') { var hx = ui.el('div.wide', { html: f.html }); body.appendChild(hx); if (f.k) inputs[f.k] = hx; return; }
      var inp;
      if (f.type === 'select') {
        inp = ui.el('select');
        (f.options || []).forEach(function (op) { var e = ui.el('option', { value: op.v, text: op.l }); if (String(op.v) === String(f.value == null ? '' : f.value)) e.selected = true; inp.appendChild(e); });
      } else if (f.type === 'textarea') { inp = ui.el('textarea', { rows: f.rows || 3 }); inp.value = f.value == null ? '' : f.value; }
      else if (f.type === 'check') {
        inp = ui.el('input', { type: 'checkbox' }); inp.checked = !!f.value;
        var lab = ui.el('label.check' + (f.wide ? '.wide' : ''), null, [inp, ui.el('span', { text: f.label })]);
        body.appendChild(lab); inputs[f.k] = inp; return;
      } else {
        inp = ui.el('input', { type: f.type || 'text', step: f.step || (f.type === 'number' ? 'any' : null), list: f.list || null, placeholder: f.placeholder || null });
        inp.value = f.value == null ? '' : f.value;
      }
      if (f.attrs) Object.keys(f.attrs).forEach(function (a) { inp.setAttribute(a, f.attrs[a]); });
      var wrap = ui.el('label.field' + (f.wide ? '.wide' : ''), null, [ui.el('span.field-label', { text: f.label + (f.req ? ' *' : '') }), inp]);
      if (f.hint) wrap.appendChild(ui.el('span.field-hint', { text: f.hint }));
      body.appendChild(wrap);
      inputs[f.k] = inp;
    });
    if (o.extra) body.appendChild(o.extra);
    function values() {
      var v = {};
      Object.keys(inputs).forEach(function (k) {
        var e = inputs[k];
        if (!e.tagName || (e.tagName !== 'INPUT' && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA')) return;
        v[k] = e.type === 'checkbox' ? e.checked : e.type === 'number' ? (e.value === '' ? '' : CALC.num(e.value)) : e.value.trim();
      });
      return v;
    }
    var m = ui.modal({ title: o.title, icon: o.icon || 'edit', cls: o.wide ? 'wide' : '', body: body, buttons: (o.buttons || []).concat([
      { label: t('a.cancel'), cls: 'ghost' }, 'spacer',
      { label: o.ok || t('a.save'), cls: 'primary', onClick: function (close) {
        var v = values();
        var bad = (o.fields || []).filter(function (f) { return f.req && (v[f.k] === '' || v[f.k] == null); })[0];
        if (bad) { inputs[bad.k].focus(); toast(t('a.required', { f: bad.label }), 'bad'); return false; }
        var r = o.onSave(v, close);
        if (r && r.then) { r.then(function (ok) { if (ok !== false) close(); }); return false; }
        return r;
      } }]) });
    var first = body.querySelector('input:not([type=checkbox]),select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
    m.inputs = inputs; m.values = values;
    return m;
  }

  /* ---------- görsel ---------- */
  function shrinkImage(file, max, q) {
    max = max || 1600;
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { b ? res({ blob: b, w: c.width, h: c.height }) : rej(new Error('img')); }, 'image/jpeg', q || 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('img')); };
      img.src = u;
    });
  }
  async function saveImage(file, extra) {
    var r = await shrinkImage(file, 1800);
    var th = await shrinkImage(file, 360, 0.8);
    var thumb = await DB.blobToB64(th.blob);
    var d = await DB.putFile(r.blob, Object.assign({ name: file.name || 'gorsel.jpg', kind: 'image', w: r.w, h: r.h, thumb: thumb }, extra || {}));
    return d.id;
  }
  async function saveAttachment(file, extra) {
    var d = await DB.putFile(file, Object.assign({ name: file.name || 'dosya', kind: 'file' }, extra || {}));
    return d.id;
  }
  var thumbCache = {};
  async function thumbOf(id) {
    if (!id) return '';
    if (thumbCache[id]) return thumbCache[id];
    var f = await DB.getFile(id);
    var v = f ? (f.thumb || (f.data ? URL.createObjectURL(f.data) : '')) : '';
    thumbCache[id] = v;
    return v;
  }
  /* <img data-thumb="id"> → doldur */
  function fillThumbs(root) {
    $$('img[data-thumb]', root).forEach(function (img) {
      var id = img.getAttribute('data-thumb'); if (!id) return;
      thumbOf(id).then(function (u) { if (u) { img.src = u; img.classList.add('ok'); } });
    });
  }
  function pickFiles(accept, multiple) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; i.multiple = !!multiple;
      i.onchange = function () { res(Array.prototype.slice.call(i.files || [])); };
      i.click();
    });
  }
  async function saveOut(name, blob) {
    // Kabukta Belgeler\3D Maliyet ve Arsiv klasörüne yazar ve gezginde gösterir; tarayıcıda indirir.
    if (window.MA3D_KABUK) {
      try {
        var data = await DB.blobToB64(blob);
        var r = await fetch('/__shell/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, data: data }) });
        if (r.ok) { toast(t('a.savedTo', { p: await r.text() }), 'good'); return; }
      } catch (e) { }
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  async function openFile(id) {
    var f = await DB.getFile(id); if (!f || !f.data) return;
    if (f.kind === 'image') return lightbox([id], 0);
    saveOut(f.name, f.data);
  }
  async function lightbox(ids, i) {
    var body = ui.el('div.lightbox');
    var img = ui.el('img'); body.appendChild(img);
    var cap = ui.el('div.lb-cap'); body.appendChild(cap);
    async function show() { img.src = await DB.fileUrl(ids[i]); cap.textContent = (i + 1) + ' / ' + ids.length; }
    var m = ui.modal({ title: t('a.image'), icon: 'image', cls: 'wide', body: body, buttons: ids.length > 1 ? [
      { label: '‹', onClick: function () { i = (i - 1 + ids.length) % ids.length; show(); return false; } },
      { label: '›', onClick: function () { i = (i + 1) % ids.length; show(); return false; } }, 'spacer',
      { label: t('a.close'), cls: 'primary' }] : [{ label: t('a.close'), cls: 'primary' }] });
    show();
    return m;
  }

  /* ---------- renk adları (filament renk filtresi) ---------- */
  var FAM = [
    ['red', 0], ['orange', 28], ['yellow', 52], ['green', 120], ['teal', 172], ['blue', 215], ['purple', 275], ['pink', 325]
  ];
  function hsl(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return null;
    var v = parseInt(m[1], 16), r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    var l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: h, s: s, l: l };
  }
  /* renk ailesi: red|orange|yellow|green|teal|blue|purple|pink|brown|black|grey|white|clear */
  function colorFamily(hex) {
    if (!hex) return 'none';
    if (String(hex).toLowerCase() === 'transparent') return 'clear';
    var c = hsl(hex); if (!c) return 'none';
    if (c.l < 0.13) return 'black';
    if (c.l > 0.92) return 'white';
    if (c.s < 0.14) return c.l > 0.8 ? 'white' : 'grey';
    if (c.h >= 12 && c.h <= 45 && c.l < 0.42) return 'brown';
    if (c.h >= 20 && c.h <= 55 && c.l > 0.72 && c.s < 0.55) return 'beige';
    var best = FAM[0], bd = 999;
    FAM.forEach(function (f) { var d = Math.abs(f[1] - c.h); if (d > 180) d = 360 - d; if (d < bd) { bd = d; best = f; } });
    return best[0];
  }
  var FAMILY_ORDER = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'beige', 'black', 'grey', 'white', 'clear', 'none'];
  var FAMILY_DOT = { red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e', teal: '#14b8a6', blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899', brown: '#92400e', beige: '#e7d3b0', black: '#111827', grey: '#9ca3af', white: '#f9fafb', clear: 'transparent', none: 'transparent' };

  /* ---------- sayfalar ve kenar çubuğu ---------- */
  var PAGES = {}, ORDER = [];
  var GROUPS = ['general', 'production', 'inventory', 'finance', 'system'];
  function page(id, def) { def.id = id; PAGES[id] = def; ORDER.push(id); }
  function moduleList() {
    var saved = (S.settings && S.settings.modules) || [];
    var out = [];
    saved.forEach(function (m) { if (PAGES[m.id] && !out.some(function (x) { return x.id === m.id; })) out.push(m); });
    ORDER.forEach(function (id) { if (!out.some(function (x) { return x.id === id; })) out.push({ id: id }); });
    return out.map(function (m) { var p = PAGES[m.id]; return { id: m.id, name: m.name || '', hidden: !!m.hidden && !p.fixed, group: p.group, icon: p.icon, fixed: !!p.fixed }; });
  }
  function pageName(id) { var m = moduleList().filter(function (x) { return x.id === id; })[0]; return (m && m.name) || t('nav.' + id); }
  function drawNav() {
    var nav = $('#nav'); if (!nav) return;
    nav.innerHTML = '';
    var mods = moduleList().filter(function (m) { return !m.hidden; });
    GROUPS.forEach(function (g) {
      var items = mods.filter(function (m) { return m.group === g; }); if (!items.length) return;
      var grp = ui.el('div.nav-group', null, [ui.el('div.nav-group-title', { text: t('navg.' + g) })]);
      items.forEach(function (m) {
        var badge = PAGES[m.id].badge ? PAGES[m.id].badge() : '';
        grp.appendChild(ui.el('button.nav-item' + (S.page === m.id ? '.active' : ''), { type: 'button', 'data-page': m.id, 'data-fc-track': 'nav.' + m.id,
          html: icon(m.icon) + '<span>' + esc(pageName(m.id)) + '</span>' + (badge ? '<em class="nav-badge">' + esc(badge) + '</em>' : ''),
          onclick: function () { go(m.id); document.getElementById('shell').classList.remove('drawer-open'); } }));
      });
      nav.appendChild(grp);
    });
  }
  function go(id, arg) {
    if (!PAGES[id]) id = 'dashboard';
    S.page = id; S.pageArg = arg;
    render();
  }
  var renderSeq = 0;
  async function render() {
    var seq = ++renderSeq;
    var p = PAGES[S.page] || PAGES.dashboard;
    drawNav();
    $('#pageTitle').textContent = pageName(p.id);
    $('#pageSub').textContent = t('sub.' + p.id);
    var host = $('#content');
    var keep = host.getAttribute('data-page') === p.id ? host.scrollTop : 0;
    var box = ui.el('div.page.page-' + p.id);
    try { await p.render(box, S.pageArg); } catch (e) { console.error(e); box.appendChild(ui.el('div.notice.error', { text: String(e && e.message || e) })); }
    if (seq !== renderSeq) return;
    host.innerHTML = ''; host.appendChild(box); host.setAttribute('data-page', p.id);
    host.scrollTop = keep;
    fillThumbs(host);
    S.pageArg = null;
  }
  /* Kendi simgeleri (çekirdekte olmayanlar) */
  var ICONS = {
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14v4M8 18h.01M12 18h.01"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    spool: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6"/>',
    printer: '<path d="M4 4h16v4H4zM6 8v8M18 8v8M3 16h18v4H3zM10 12h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-4"/>',
    translate: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
    history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    arrowIn: '<path d="M17 7 7 17M7 7v10h10"/>',
    arrowOut: '<path d="M7 17 17 7M7 7h10v10"/>',
    sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    weight: '<circle cx="12" cy="5" r="3"/><path d="M6.5 8h11l3 13h-17z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 4h8M9 13v2M15 13v2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
  };
  /* çekirdeğin simge tablosuna da ekle: modal başlıkları ve düğmeleri (FC.ui) aynı simgeleri bulsun */
  try { Object.keys(ICONS).forEach(function (k) { if (ui.icons && !ui.icons[k]) ui.icons[k] = ICONS[k]; }); } catch (e) { }
  function icon(name, cls) {
    if (ICONS[name]) return '<svg class="fc-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
    return ui.icon(name, cls);
  }
  function iconBtn(name, title, cls) { return '<button type="button" class="icon-btn tiny' + (cls ? ' ' + cls : '') + '" title="' + esc(title) + '" aria-label="' + esc(title) + '"' + '>' + icon(name) + '</button>'; }

  /* ---------- CSV ---------- */
  function csv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? '' : c); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';'); }).join('\r\n');
  }

  /* ---------- yazdırma (teklif, döküm, QR etiketleri) ---------- */
  function printHtml(title, html) {
    var w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast(t('a.popup'), 'bad'); return; }
    var rtl = FC.i18n.isRtl();
    w.document.write('<!doctype html><html lang="' + FC.i18n.lang() + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}' +
      'table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:start;vertical-align:top}th{background:#f3f4f6;font-size:12px}' +
      '.r{text-align:end}.muted{color:#666}.big{font-size:22px;font-weight:700}.labels{display:flex;flex-wrap:wrap;gap:8px}.lbl{border:1px dashed #999;padding:8px;width:220px;display:flex;gap:8px;align-items:center;page-break-inside:avoid}' +
      '.lbl b{display:block;font-size:13px}.lbl small{color:#555;display:block}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid #888;vertical-align:middle;margin-inline-end:4px}' +
      'img.ph{max-width:160px;max-height:120px;border-radius:6px}@media print{.noprint{display:none}body{margin:10mm}}</style></head><body>' + html +
      '<p class="noprint" style="margin-top:20px"><button onclick="print()">' + esc(t('a.print')) + '</button></p></body></html>');
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) { } }, 400);
  }
  function qrSvg(text, size) {
    try {
      var q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(text))); q.make();
      return q.createSvgTag({ cellSize: Math.max(2, Math.round((size || 96) / (q.getModuleCount() + 8))), margin: 4, scalable: false });
    } catch (e) { return ''; }
  }

  /* ---------- basit çubuk grafik (SVG) ---------- */
  function bars(data, o) {
    o = o || {};
    var W = o.w || 640, H = o.h || 200, P = 28, max = 0;
    data.forEach(function (d) { (d.v || []).forEach(function (v) { max = Math.max(max, v); }); });
    if (!(max > 0)) max = 1;
    var bw = (W - P * 2) / Math.max(1, data.length), cols = o.colors || ['var(--accent)', 'var(--ok)', 'var(--warn)'];
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';
    for (var g = 0; g <= 4; g++) { var y = P + (H - P * 2) * g / 4; s += '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y + '" y2="' + y + '" class="grid"/>'; }
    data.forEach(function (d, i) {
      var n = (d.v || []).length, w = (bw * 0.7) / Math.max(1, n);
      (d.v || []).forEach(function (v, k) {
        var h = (H - P * 2) * Math.max(0, v) / max, x = P + i * bw + bw * 0.15 + k * w;
        s += '<rect x="' + x.toFixed(1) + '" y="' + (H - P - h).toFixed(1) + '" width="' + Math.max(1, w - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + cols[k % cols.length] + '"><title>' + esc(d.l + ': ' + (o.fmt ? o.fmt(v) : v)) + '</title></rect>';
      });
      s += '<text x="' + (P + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="lbl">' + esc(d.l) + '</text>';
    });
    return s + '</svg>';
  }

  window.APP = { S: S, t: t, $: $, $$: $$, esc: esc, reload: reload, stockOf: stockOf, kgPrice: kgPrice, isLow: isLow, catPath: catPath, num: num, money: money, moneyAlt: moneyAlt, date: date, dateTime: dateTime, today: today,
    byId: byId, nameOf: nameOf, byName: byName, opts: opts, listOf: listOf, toast: toast, confirmBox: confirmBox, prompt: prompt, formModal: formModal,
    shrinkImage: shrinkImage, saveImage: saveImage, saveAttachment: saveAttachment, thumbOf: thumbOf, fillThumbs: fillThumbs, pickFiles: pickFiles,
    saveOut: saveOut, openFile: openFile, lightbox: lightbox, colorFamily: colorFamily, FAMILY_ORDER: FAMILY_ORDER, FAMILY_DOT: FAMILY_DOT,
    page: page, PAGES: PAGES, GROUPS: GROUPS, moduleList: moduleList, pageName: pageName, drawNav: drawNav, go: go, render: render,
    icon: icon, iconBtn: iconBtn, csv: csv, printHtml: printHtml, qrSvg: qrSvg, bars: bars };
})();
