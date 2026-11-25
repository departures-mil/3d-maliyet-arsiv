/* WI‑FI EŞİTLEME — internet yokken aynı yönlendiricideki (router) bilgisayarlar arasında eşitleme. Normal (GitHub) eşitlemenin
   altındaki ikinci seçenek. Kabuk (shell-exe/lan.go) cihazları UDP ile bulur, eşleştirme koduyla korur ve aktarır.
   Akış (bir eşle):  1) kendi anlık görüntünü ve dosyalarını yayınla  2) eşin anlık görüntüsünü çek → FC.lanMerge ile birleştir
                     3) eksik görselleri/ekleri eşten indir  4) eşe "eşitlendi" mesajı + verini gönder (o da birleştirir).
   Birleştirme GitHub eşitlemesiyle aynıdır (esitle.js mergeData): silme yok, üst üste yazma yok, çakışma yedeklenir. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;
  var L = '/__shell/lan/';
  var info = null, busy = false, poll = null, autoT = null, cards = [];

  function shell() { return !!window.MA3D_KABUK; }
  async function api(op, o) {
    o = o || {};
    var r = await fetch(L + op, { method: o.method || (o.body != null ? 'POST' : 'GET'), cache: 'no-store', headers: o.json ? { 'Content-Type': 'application/json' } : {}, body: o.json ? JSON.stringify(o.json) : o.body });
    if (!r.ok) { var e = new Error((await r.text()).trim() || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return o.raw ? r : r.json();
  }
  async function status() { if (!shell()) return null; try { info = await api('durum'); } catch (e) { info = null; } draw(); setTop(); return info; }
  function setTop() { if (A.kabuk && A.kabuk.setLan) A.kabuk.setLan(busy ? 'busy' : info && info.acik ? 'on' : 'off'); }

  async function publish() {
    var snap = await A.sync.snapshot();
    await api('yayinla', { body: JSON.stringify({ app: '3d-maliyet-arsiv', kimden: info && info.id, ad: info && info.ad, zaman: DB.now(), data: snap }) });
    var have = {}; ((await api('dosya-liste')) || []).forEach(function (id) { have[id] = 1; });
    var files = (await DB.all('files', true)).filter(function (f) { return f.data && !f.deleted && !have[f.id] && /^[A-Za-z0-9_-]+$/.test(f.id); });
    for (var i = 0; i < files.length; i++) { try { await api('dosya-yayinla?id=' + encodeURIComponent(files[i].id), { body: files[i].data }); } catch (e) { } }
    return snap;
  }
  async function pullFiles(peerId) {
    var miss = (await DB.all('files', true)).filter(function (f) { return !f.data && !f.deleted; }), n = 0;
    for (var i = 0; i < miss.length; i++) {
      try {
        var r = await api('dosya-cek?es=' + encodeURIComponent(peerId) + '&id=' + encodeURIComponent(miss[i].id), { raw: true });
        var f = miss[i]; f.data = new Blob([await r.arrayBuffer()], { type: f.mime || 'application/octet-stream' }); delete f.pending;
        await DB.put('files', f, true); n++;
      } catch (e) { }
    }
    return n;
  }
  /* bir eşle tam eşitleme */
  async function syncWith(peer, quiet) {
    if (busy) return null;
    busy = true; setTop(); draw();
    var res = null, err = '';
    try {
      var snap = await publish();
      var pulled = await api('cek?es=' + encodeURIComponent(peer.id));
      if (pulled && pulled.data) res = await A.sync.mergeData(pulled.data, 'Wi‑Fi: ' + (peer.ad || peer.ip));
      else res = { added: 0, updated: 0, conflicts: 0 };
      res.files = await pullFiles(peer.id);
      try { await api('gonder?es=' + encodeURIComponent(peer.id), { body: JSON.stringify({ tur: 'esitle', kimden: info.id, ad: info.ad, data: snap }) }); } catch (e) { }
      await DB.saveSettings({ wifiLast: DB.now() });
    } catch (e) { err = String(e.message || e); }
    busy = false;
    await A.reload(); setTop(); draw();
    if (res) { if (res.added || res.updated || res.files) A.render(); if (!quiet) A.toast(t('wf.done', { p: peer.ad || peer.ip, a: res.added, u: res.updated, c: res.conflicts }), 'good'); }
    else if (!quiet) A.toast(t('wf.failed', { e: errText(err) }), 'bad');
    return res;
  }
  async function syncAll(quiet) { var st = await status(); if (!st || !st.acik) return; for (var i = 0; i < st.esler.length; i++) await syncWith(st.esler[i], quiet); }
  function errText(e) { return { ULASILAMADI: t('wf.unreach'), KOD: t('wf.badCode'), ES_YOK: t('wf.noPeer'), ANLIK_YOK: t('wf.noSnap'), IP: t('wf.badIp') }[String(e).replace(/^.*?(ULASILAMADI|KOD|ES_YOK|ANLIK_YOK|IP).*$/, '$1')] || e; }

  /* gelen kutusu: eşin gönderdiği veri birleştirilir, sonra dosyaları eşten çekilir */
  async function inbox() {
    if (busy || !info || !info.acik) return;
    var list; try { list = await api('gelen'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      try {
        var msg = await api('gelen-oku?dosya=' + encodeURIComponent(it.dosya));
        if (msg && !msg.data && (msg.materials || msg.malzemeler)) { if (A.matImport) await A.matImport.inbox(); continue; }
        if (msg && msg.data) {
          busy = true; setTop();
          var r = await A.sync.mergeData(msg.data, 'Wi‑Fi: ' + (msg.ad || it.ad || it.kimden || ''));
          var peer = (info.esler || []).filter(function (p) { return p.id === (msg.kimden || it.kimden); })[0];
          if (peer) { try { await publish(); } catch (e) { } r.files = await pullFiles(peer.id); }
          busy = false;
          await A.reload(); A.render();
          if (r.added || r.updated || r.files) A.toast(t('wf.got', { p: msg.ad || it.ad || '', a: r.added, u: r.updated }), 'good');
        }
        await api('gelen-sil?dosya=' + encodeURIComponent(it.dosya), { body: '' });
      } catch (e) { busy = false; }
    }
    setTop();
  }
  function startPolling() {
    if (!shell()) return;
    if (!poll) poll = setInterval(function () { if (info && info.acik) inbox(); }, 5000);
    if (!autoT) autoT = setInterval(function () { if (S.settings.wifiAuto && info && info.acik && navigator.onLine === false) syncAll(true); }, 120000);
    setInterval(function () { if (cards.some(function (c) { return c.isConnected; })) status(); }, 6000);
  }
  async function start() { if (!shell()) { setTop(); return; } await status(); startPolling(); }

  /* ---------------- kart (Ayarlar ve üst çubuktaki Wi‑Fi düğmesi) ---------------- */
  function card() {
    var c = ui.el('section.card', { 'data-card': 'wifi' });
    cards = cards.filter(function (x) { return x.isConnected; }); cards.push(c);
    c._draw = function () { drawCard(c); };
    drawCard(c);
    if (shell()) status();
    return c;
  }
  function draw() { cards.forEach(function (c) { if (c.isConnected && !c.contains(document.activeElement)) drawCard(c); }); }
  function drawCard(c) {
    var st = info;
    var h = '<h3 class="card-title">' + A.icon('wifi') + '<span>' + esc(t('wf.title')) + '</span>' + (st && st.acik ? '<em class="badge ok">' + esc(t('wf.on')) + '</em>' : '<em class="badge">' + esc(t('wf.off')) + '</em>') + '</h3>' +
      '<p class="card-desc">' + esc(t('wf.desc')) + '</p>';
    if (!shell()) { c.innerHTML = h + '<div class="notice info">' + esc(t('wf.onlyDesktop')) + '</div>'; return; }
    if (!st) { c.innerHTML = h + '<p class="muted">' + esc(t('a.working')) + '</p>'; return; }
    h += '<div class="form-grid">' +
      '<label class="field"><span class="field-label">' + esc(t('wf.name')) + '</span><input id="wfName" value="' + esc(st.ad || '') + '"></label>' +
      '<label class="field"><span class="field-label">' + esc(t('wf.code')) + '</span><input id="wfCode" type="password" placeholder="' + esc(st.kodVar ? '••••••' : t('wf.codePh')) + '" autocomplete="off"><span class="field-hint">' + esc(t('wf.codeHint')) + '</span></label>' +
      '<label class="check wide"><input type="checkbox" id="wfOn"' + (st.acik ? ' checked' : '') + '><span>' + esc(t('wf.enable')) + '</span></label>' +
      '<label class="check wide"><input type="checkbox" id="wfAuto"' + (S.settings.wifiAuto ? ' checked' : '') + '><span>' + esc(t('wf.auto')) + '</span></label>' +
      '</div><div class="fc-row" style="margin:8px 0"><button type="button" class="btn small primary" id="wfSave">' + A.icon('check') + esc(t('a.save')) + '</button></div>';
    if (st.acik) {
      h += '<div class="form-sec">' + esc(t('wf.peers')) + '</div>';
      h += st.esler.length ? '<ul class="fc-list">' + st.esler.map(function (p) { return '<li><span>' + A.icon('printer') + ' <b>' + esc(p.ad || p.id) + '</b> <small class="muted">' + esc(p.ip) + (p.elle ? ' · ' + t('wf.manual') : '') + '</small></span><button type="button" class="btn small" data-peer="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>' + A.icon('sync') + esc(busy ? t('fc.lan.busy') : t('wf.syncNow')) + '</button></li>'; }).join('') + '</ul>'
        : '<p class="muted">' + esc(t('wf.searching')) + '</p>';
      h += '<div class="inp-row" style="margin-top:8px"><input id="wfIp" placeholder="192.168.1.20"><button type="button" class="btn small" id="wfAdd">' + A.icon('plus') + esc(t('wf.addIp')) + '</button></div>';
      h += '<p class="status">' + esc(t('wf.myIp', { ip: (st.ip || []).join(', ') || '—' })) + (S.settings.wifiLast ? ' · ' + esc(t('sy.last', { d: A.dateTime(S.settings.wifiLast) })) : '') + '</p>';
    }
    if (st.hata) h += '<div class="notice warn small">' + esc(st.hata) + '</div>';
    c.innerHTML = h;
    c.querySelector('#wfSave').onclick = async function () {
      var body = { ad: c.querySelector('#wfName').value.trim(), acik: c.querySelector('#wfOn').checked }, code = c.querySelector('#wfCode').value.trim();
      if (code) body.kod = code;
      if (body.acik && !code && !st.kodVar) { c.querySelector('#wfCode').focus(); A.toast(t('wf.needCode'), 'bad'); return; }
      try { await api('ayar', { json: body }); await DB.saveSettings({ wifiAuto: c.querySelector('#wfAuto').checked }); await A.reload(); A.toast(t('a.saved'), 'good'); } catch (e) { A.toast(String(e.message || e), 'bad'); }
      await status(); drawCard(c);
    };
    A.$$('[data-peer]', c).forEach(function (b) { b.onclick = function () { var p = st.esler.filter(function (x) { return x.id === b.getAttribute('data-peer'); })[0]; if (p) syncWith(p); }; });
    var add = c.querySelector('#wfAdd'); if (add) add.onclick = async function () { try { await api('ekle', { json: { IP: c.querySelector('#wfIp').value.trim() } }); await status(); drawCard(c); } catch (e) { A.toast(errText(e.message), 'bad'); } };
  }
  function dialog() {
    ui.modal({ title: t('wf.title'), icon: 'wifi', body: card(), buttons: [{ label: t('a.close'), cls: 'primary' }] });
  }

  A.wifi = { start: start, card: card, dialog: dialog, syncWith: syncWith, syncAll: syncAll, status: status };
})();
