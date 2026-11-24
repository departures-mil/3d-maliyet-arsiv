/* EŞİTLEME — kullanıcının KENDİ (özel) GitHub deposu üzerinden cihazlar arası eşitleme.
   Depo düzeni:  veri/<depo>.json   (kayıtlar; silinenler işaretli kalır)
                 veri/files.json    (görsel/ek bilgileri, küçük önizlemeyle)
                 dosyalar/<id>      (görsel ve eklerin kendisi)
   Birleştirme FC.lanMerge ile: hiçbir kayıt silinmez, üst üste yazılmaz. İki cihazda farklı düzenlenen kaydın eskisi
   "çakışma yedekleri"ne, uzakta silinen ama burada düzenlenmiş kayıt gizli arşive düşer (Ayarlar'dan geri alınır).
   Tek commit: Git Data API (blob → tree → commit → ref). Wi‑Fi eşitlemesi (wifi.js) aynı birleştiriciyi kullanır. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;
  var API = 'https://api.github.com';
  var DATA_STORES = DB.SYNCED.filter(function (s) { return s !== 'files'; });

  /* ---------------- ortak birleştirici ---------------- */
  function byIdMap(list) { var m = {}; list.forEach(function (x) { if (x && x.id) m[x.id] = x; }); return m; }
  /* remote: {store: [kayıt]} → yerele birleştir. Döner {added, updated, conflicts, archived} */
  async function mergeData(remote, source) {
    var res = { added: 0, updated: 0, conflicts: 0, archived: 0 };
    for (var i = 0; i < DATA_STORES.length; i++) {
      var st = DATA_STORES[i], inc = remote[st];
      if (!Array.isArray(inc) || !inc.length) continue;
      var local = await DB.all(st, true), lm = byIdMap(local);
      var r = FC.lanMerge.merge(local, inc);
      var write = [];
      r.records.forEach(function (rec) {
        var cur = lm[rec.id];
        if (!cur) { write.push(rec); res.added++; }
        else if (FC.lanMerge.canon(cur) !== FC.lanMerge.canon(rec)) { write.push(rec); res.updated++; }
      });
      /* uzakta silinmiş, burada hiç olmayan kayıt: silme işareti saklanır (başka kaynaktan geri gelmesin) */
      inc.forEach(function (y) { if (y && y.deleted && !lm[y.id]) write.push(y); });
      for (var c = 0; c < r.conflicts.length; c++) { var cf = r.conflicts[c]; await DB.conflict(st, cf.lost, cf.kept, source + (cf.keptFrom === 'local' ? ' (uzak sürüm)' : ' (yerel sürüm)')); res.conflicts++; }
      for (var a = 0; a < r.archived.length; a++) { var ar = r.archived[a]; await DB.conflict(st, ar.record, null, source, 'silinen'); res.archived++; }
      if (write.length) await DB.putMany(st, write, true);
    }
    /* dosya bilgileri: yalnız ekleme ve silme işareti; içerik (data) burada korunur */
    if (Array.isArray(remote.files)) {
      var lf = byIdMap(await DB.all('files', true)), fw = [];
      remote.files.forEach(function (f) {
        if (!f || !f.id) return;
        var cur = lf[f.id];
        if (!cur) { var n = Object.assign({}, f); delete n.data; n.pending = true; fw.push(n); res.added++; }
        else if (f.deleted && !cur.deleted && String(f.deletedAt || f.updatedAt) >= String(cur.updatedAt)) { cur.deleted = true; cur.deletedAt = f.deletedAt || f.updatedAt; fw.push(cur); }
      });
      if (fw.length) await DB.putMany('files', fw, true);
    }
    return res;
  }
  /* yerel anlık görüntü: {store: [kayıt]} (dosya içerikleri hariç) */
  async function snapshot() {
    var out = {};
    for (var i = 0; i < DATA_STORES.length; i++) out[DATA_STORES[i]] = await DB.all(DATA_STORES[i], true);
    out.files = (await DB.all('files', true)).map(function (f) { var c = Object.assign({}, f); delete c.data; delete c.pending; return c; });
    return out;
  }
  function stable(list) { return '[\n' + list.slice().sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; }).map(function (x) { return JSON.stringify(x); }).join(',\n') + '\n]\n'; }
  function hash(s) { var h = 5381, h2 = 52711; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h = (h * 33) ^ c; h2 = (h2 * 33) ^ c; } return (h >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36); }

  /* ---------------- base64 ---------------- */
  function u8ToB64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function b64ToU8(b) { var s = atob(String(b || '').replace(/\s/g, '')), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function strToB64(s) { return u8ToB64(new TextEncoder().encode(s)); }
  function b64ToStr(b) { return new TextDecoder().decode(b64ToU8(b)); }

  /* ---------------- GitHub ---------------- */
  function gcfg() { var g = S.settings.gh || {}; return { owner: String(g.owner || '').trim(), repo: String(g.repo || '').trim(), token: String(g.token || '').trim(), branch: String(g.branch || '').trim() || 'main' }; }
  function configured() { var g = gcfg(); return !!(g.owner && g.repo && g.token); }
  async function gh(path, o) {
    o = o || {}; var g = gcfg();
    var r = await fetch(path.indexOf('http') === 0 ? path : API + path, { method: o.method || 'GET', cache: 'no-store', headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + g.token, 'X-GitHub-Api-Version': '2022-11-28' }, o.body ? { 'Content-Type': 'application/json' } : {}), body: o.body ? JSON.stringify(o.body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok) { var e2 = new Error((j && j.message) || ('HTTP ' + r.status)); e2.status = r.status; throw e2; }
    return j;
  }
  function repoPath() { var g = gcfg(); return '/repos/' + encodeURIComponent(g.owner) + '/' + encodeURIComponent(g.repo); }
  async function ensureRepo(create) {
    var g = gcfg();
    try { return await gh(repoPath()); }
    catch (e) {
      if (e.status !== 404 || !create) throw e;
      var me = await gh('/user');
      if (String(me.login).toLowerCase() === g.owner.toLowerCase()) return gh('/user/repos', { method: 'POST', body: { name: g.repo, private: true, auto_init: true, description: '3D Maliyet ve Arşiv — eşitleme verisi' } });
      return gh('/orgs/' + encodeURIComponent(g.owner) + '/repos', { method: 'POST', body: { name: g.repo, private: true, auto_init: true } });
    }
  }
  async function head() {
    var g = gcfg();
    try { var ref = await gh(repoPath() + '/git/ref/heads/' + encodeURIComponent(g.branch)); return ref.object.sha; }
    catch (e) {
      if (e.status !== 404 && e.status !== 409) throw e;
      // boş depo ya da dal yok: ilk dosya Contents API ile (dalı da kurar)
      await gh(repoPath() + '/contents/README.md', { method: 'PUT', body: { message: 'Eşitleme deposu', content: strToB64('# 3D Maliyet ve Arşiv — eşitleme verisi\n\nBu depo uygulama tarafından yönetilir. Dosyaları elle değiştirmeyin.\n'), branch: g.branch } });
      var ref2 = await gh(repoPath() + '/git/ref/heads/' + encodeURIComponent(g.branch)); return ref2.object.sha;
    }
  }

  var running = null, lastErr = '', state = 'off', progressCb = null;
  function setState(s) { state = s; if (A.kabuk && A.kabuk.setSync) A.kabuk.setSync(s); }
  function step(msg) { if (progressCb) try { progressCb(msg); } catch (e) { } }

  async function syncOnce() {
    var g = gcfg(), sh = Object.assign({}, S.settings.syncShas || {}), hs = Object.assign({}, S.settings.syncHashes || {});
    step(t('sy.connect'));
    var parent = await head();
    var commit = await gh(repoPath() + '/git/commits/' + parent);
    var tree = await gh(repoPath() + '/git/trees/' + commit.tree.sha + '?recursive=1');
    var remoteBlobs = {}; (tree.tree || []).forEach(function (e) { if (e.type === 'blob') remoteBlobs[e.path] = e.sha; });
    /* 1) uzaktaki değişen veri dosyalarını indir ve birleştir */
    var remote = {}, downloaded = {}, names = DATA_STORES.concat(['files']);
    for (var i = 0; i < names.length; i++) {
      var p = 'veri/' + names[i] + '.json', sha = remoteBlobs[p];
      if (!sha || sha === sh[p]) continue;
      step(t('sy.down', { f: names[i] }));
      var b = await gh(repoPath() + '/git/blobs/' + sha);
      var txt = b64ToStr(b.content);
      downloaded[p] = txt;
      try { remote[names[i]] = JSON.parse(txt); } catch (e) { remote[names[i]] = []; }
    }
    step(t('sy.merge'));
    var res = await mergeData(remote, 'GitHub');
    /* 2) eksik dosya içeriklerini indir */
    var files = await DB.all('files', true), getList = files.filter(function (f) { return !f.data && !f.deleted && remoteBlobs['dosyalar/' + f.id]; });
    for (var k = 0; k < getList.length; k++) {
      step(t('sy.files', { i: k + 1, n: getList.length }));
      try {
        var fb = await gh(repoPath() + '/git/blobs/' + remoteBlobs['dosyalar/' + getList[k].id]);
        var f = getList[k]; f.data = new Blob([b64ToU8(fb.content)], { type: f.mime || 'application/octet-stream' }); delete f.pending;
        await DB.put('files', f, true);
      } catch (e) { console.warn('dosya', e); }
    }
    /* 3) yerelin tamamını yaz (değişenler) */
    var snap = await snapshot(), entries = [];
    for (var n = 0; n < names.length; n++) {
      var path = 'veri/' + names[n] + '.json', body = stable(snap[names[n]] || []), h = hash(body);
      var remoteSame = downloaded[path] != null ? downloaded[path] === body : (remoteBlobs[path] && remoteBlobs[path] === sh[path] && hs[path] === h);
      if (remoteSame) continue;
      step(t('sy.up', { f: names[n] }));
      var blob = await gh(repoPath() + '/git/blobs', { method: 'POST', body: { content: strToB64(body), encoding: 'base64' } });
      entries.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha }); hs[path] = h;
    }
    var up = (await DB.all('files', true)).filter(function (f) { return f.data && !f.deleted && !remoteBlobs['dosyalar/' + f.id]; });
    for (var u = 0; u < up.length; u++) {
      step(t('sy.upFiles', { i: u + 1, n: up.length }));
      var data = new Uint8Array(await up[u].data.arrayBuffer());
      if (data.length > 95 * 1024 * 1024) continue;   // GitHub blob sınırı
      var bl = await gh(repoPath() + '/git/blobs', { method: 'POST', body: { content: u8ToB64(data), encoding: 'base64' } });
      entries.push({ path: 'dosyalar/' + up[u].id, mode: '100644', type: 'blob', sha: bl.sha });
    }
    var newTreeSha = commit.tree.sha, pushed = false;
    if (entries.length) {
      step(t('sy.commit'));
      var nt = await gh(repoPath() + '/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: entries } });
      var nc = await gh(repoPath() + '/git/commits', { method: 'POST', body: { message: 'Eşitleme: ' + deviceName() + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' '), tree: nt.sha, parents: [parent] } });
      await gh(repoPath() + '/git/refs/heads/' + encodeURIComponent(g.branch), { method: 'PATCH', body: { sha: nc.sha, force: false } });
      newTreeSha = nt.sha; pushed = true;
    }
    /* 4) son durumun dosya imzaları */
    var after = pushed ? await gh(repoPath() + '/git/trees/' + newTreeSha + '?recursive=1') : tree;
    var newSh = {}; (after.tree || []).forEach(function (e) { if (/^veri\//.test(e.path)) newSh[e.path] = e.sha; });
    await DB.saveSettings({ syncShas: newSh, syncHashes: hs, lastSync: DB.now() });
    res.pushed = entries.length; res.files = getList.length;
    return res;
  }
  function deviceName() { try { return (window.MA3D_KABUK && window.MA3D_KABUK.computer) || FC.storage.get('ma3d.device', '') || navigator.platform || 'cihaz'; } catch (e) { return 'cihaz'; } }

  /* manual: kullanıcı bastı (sonuç bildirilir) */
  async function sync(manual, onStep) {
    if (!configured()) { setState('off'); if (manual) { A.toast(t('sy.notSet'), 'info'); A.go('settings', { focus: 'sync' }); } return null; }
    if (navigator.onLine === false) { setState('offline'); if (manual) A.toast(t('fc.sync.offline'), 'info'); return null; }
    if (running) return running;
    progressCb = onStep || null;
    setState('syncing');
    running = (async function () {
      var r = null;
      for (var attempt = 0; attempt < 3; attempt++) {
        try { r = await syncOnce(); lastErr = ''; break; }
        catch (e) {
          lastErr = String(e && e.message || e);
          if (e && (e.status === 401 || e.status === 403 || e.status === 404) && attempt === 0) break;
          if (attempt < 2) await new Promise(function (ok) { setTimeout(ok, 1500 * (attempt + 1)); });
        }
      }
      running = null; progressCb = null;
      await A.reload();
      if (r) {
        setState('idle');
        if (manual || r.added || r.updated) A.render();
        if (manual) A.toast(t('sy.done', { a: r.added, u: r.updated, c: r.conflicts }), 'good');
        else if (r.conflicts) A.toast(t('sy.conflicts', { n: r.conflicts }), 'info');
      } else {
        setState('error');
        if (manual) A.toast(t('sy.failed', { e: lastErr }), 'bad');
      }
      return r;
    })();
    return running;
  }

  /* otomatik: açılışta, her 15 dakikada ve değişiklikten 90 sn sonra */
  var debounce = null, timer = null;
  function start() {
    setState(configured() ? 'idle' : 'off');
    if (!configured()) return;
    setTimeout(function () { sync(false); }, 4000);
    if (!timer) timer = setInterval(function () { sync(false); }, 15 * 60000);
    DB.onChange(function (store) { if (store === 'meta' || store === 'cakismalar' || !configured()) return; clearTimeout(debounce); debounce = setTimeout(function () { sync(false); }, 90000); });
    window.addEventListener('online', function () { sync(false); });
    window.addEventListener('offline', function () { setState('offline'); });
  }

  /* ---------------- Ayarlar kartı ---------------- */
  function card() {
    var c = ui.el('section.card', { 'data-card': 'sync' });
    function draw() {
      var g = gcfg(), st = S.settings;
      c.innerHTML = '<h3 class="card-title">' + A.icon('sync') + '<span>' + esc(t('sy.title')) + '</span>' + (configured() ? '<em class="badge ' + (state === 'error' ? 'bad' : 'ok') + '">' + esc(t('fc.sync.' + (state === 'off' ? 'idle' : state))) + '</em>' : '') + '</h3>' +
        '<p class="card-desc">' + esc(t('sy.desc')) + '</p>' +
        '<div class="form-grid">' +
        '<label class="field"><span class="field-label">' + esc(t('sy.owner')) + '</span><input id="ghOwner" value="' + esc(g.owner) + '" placeholder="kullanici-adi" autocomplete="off"></label>' +
        '<label class="field"><span class="field-label">' + esc(t('sy.repo')) + '</span><input id="ghRepo" value="' + esc(g.repo || '3d-maliyet-veri') + '" autocomplete="off"></label>' +
        '<label class="field wide"><span class="field-label">' + esc(t('sy.token')) + '</span><input id="ghToken" type="password" value="' + esc(g.token) + '" placeholder="github_pat_…" autocomplete="off"><span class="field-hint">' + esc(t('sy.tokenHint')) + ' <a href="#" id="ghTokLink">' + esc(t('sy.tokenLink')) + '</a></span></label>' +
        '<label class="field"><span class="field-label">' + esc(t('sy.branch')) + '</span><input id="ghBranch" value="' + esc(g.branch) + '"></label>' +
        '</div>' +
        '<div class="fc-row" style="margin-top:10px"><button type="button" class="btn primary small" id="ghSave">' + A.icon('check') + esc(t('sy.saveTest')) + '</button>' +
        '<button type="button" class="btn small" id="ghNow"' + (configured() ? '' : ' disabled') + '>' + A.icon('sync') + esc(t('sy.now')) + '</button>' +
        (configured() ? '<button type="button" class="btn small ghost danger" id="ghOff">' + esc(t('sy.off')) + '</button>' : '') + '</div>' +
        '<p class="status" id="ghStatus">' + esc(st.lastSync ? t('sy.last', { d: A.dateTime(st.lastSync) }) : t('sy.never')) + (lastErr ? ' · ' + esc(lastErr) : '') + '</p>';
      c.querySelector('#ghTokLink').onclick = function (e) { e.preventDefault(); ui.openUrl('https://github.com/settings/personal-access-tokens/new'); };
      c.querySelector('#ghSave').onclick = async function () {
        var b = this; b.disabled = true;
        var v = { owner: c.querySelector('#ghOwner').value.trim().replace(/^https?:\/\/github\.com\//, '').split('/')[0], repo: c.querySelector('#ghRepo').value.trim(), token: c.querySelector('#ghToken').value.trim(), branch: c.querySelector('#ghBranch').value.trim() || 'main' };
        await DB.saveSettings({ gh: v, syncShas: {}, syncHashes: {} }); await A.reload();
        var stEl = c.querySelector('#ghStatus'); stEl.textContent = t('sy.testing');
        try {
          await ensureRepo(true);
          stEl.textContent = t('sy.ok');
          start(); var r = await sync(true, function (m) { stEl.textContent = m; });
          if (r) draw();
        } catch (e) { stEl.textContent = t('sy.failed', { e: e.status === 401 ? t('sy.badToken') : String(e.message || e) }); }
        b.disabled = false;
      };
      var nowB = c.querySelector('#ghNow'); if (nowB) nowB.onclick = async function () { nowB.disabled = true; var stEl = c.querySelector('#ghStatus'); await sync(true, function (m) { stEl.textContent = m; }); draw(); };
      var off = c.querySelector('#ghOff'); if (off) off.onclick = function () { A.confirmBox(t('sy.offQ'), async function () { await DB.saveSettings({ gh: null }); await A.reload(); setState('off'); draw(); }); };
    }
    draw();
    return c;
  }

  A.sync = { sync: sync, start: start, card: card, configured: configured, mergeData: mergeData, snapshot: snapshot, state: function () { return state; }, _stable: stable, _b64: { u8ToB64: u8ToB64, b64ToU8: b64ToU8, strToB64: strToB64, b64ToStr: b64ToStr } };
})();
