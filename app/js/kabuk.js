/* Kabuk ve ortak çekirdek bağı: sağ üst sıra (Duyurular · Asistan · Eşitle · Wi‑Fi · Güncelle · Tema · Dil | Küçült · Orta ·
   Tam ekran · Kapat), tek tuşla güncelleme (GitHub Releases + latest.json; win-app = arayüz paketi, FCD1 yama; kurulum = win-setup),
   "neler yeni", ilk açılış rehberi (kullanıcının kendi AI anahtarı), Ayarlar düzeni (Admin ile iletişim EN SON),
   Kullanım Limitleri (AI çağrıları; Firebase yok — eşitleme kullanıcının kendi GitHub deposuyla). */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, ui = FC.ui;
  var OWNER = 'departures-mil', REPO = '3d-maliyet-arsiv', APP = '3d-maliyet-arsiv', PREFIX = 'MaliyetArsiv3D';
  var H = window.fcHost || null;
  var NEW = !!(H && H.shell === 'go');
  var tb = null, syncState = 'off', lanState = 'off';
  function V() { return String(window.APP_VERSION || '0.0.0'); }

  try { FC.usage.wrapFetch(); } catch (e) { }

  /* sürüm notları ("neler yeni"; release-notes.json ile aynı) */
  var NEWS = {
    '1.0.3': {
      tr: '- Falcon Ofis\'ten gelen 24 filament Malzemeler\'e otomatik işlenir: renkler Falcon\'daki renk aileleriyle aynı, birim “adet”, marka ayrı alanda',
      en: '- The 24 filaments from Falcon Office are merged into Materials automatically: colours match Falcon\'s colour families, unit “pcs”, brand in its own field',
      ar: '- تُدمج الخيوط الـ24 من فالكون أوفيس في المواد تلقائيًا: الألوان مطابقة لعائلات الألوان في فالكون، والوحدة «قطعة»، والعلامة في حقلها'
    },
    '1.0.2': {
      tr: '- Falcon Ofis malzemeleri otomatik aktarılır: veri klasöründeki “ice-aktar” kutusuna konan dosya açılışta Malzemeler\'e işlenir (çift kayıt yok, hiçbir şey silinmez)\n- İçe aktarmada TL fiyatlar dolara çevrilir',
      en: '- Falcon Office materials are imported automatically: a file placed in the data folder\'s “ice-aktar” box is merged into Materials at start-up (no duplicates, nothing deleted)\n- Imported TRY prices are converted to USD',
      ar: '- تُستورد مواد فالكون أوفيس تلقائيًا: الملف الموضوع في صندوق «ice-aktar» داخل مجلد البيانات يُدمج في المواد عند التشغيل (بلا تكرار ولا حذف)\n- تُحوَّل الأسعار بالليرة التركية إلى الدولار عند الاستيراد'
    },
    '1.0.1': {
      tr: '- Malzemeler: “İçe aktar” düğmesi — Falcon Ofis “Döküm al” CSV dosyası ya da CSV/JSON ile filamentler tek seferde aktarılır (kategori, konum, renk, durum, adet; çift kayıt açılmaz)\n- Malzeme tablosu daha derli toplu; renk noktaları ve simgeler düzeltildi',
      en: '- Materials: “Import” button — bring in filaments at once from a Falcon Office “Stock list” CSV or any CSV/JSON (category, place, colour, condition, qty; no duplicates)\n- Tidier materials table; colour dots and icons fixed',
      ar: '- المواد: زر «استيراد» — استيراد الخيوط دفعة واحدة من ملف CSV «كشف المخزون» في فالكون أوفيس أو أي CSV/JSON (الفئة والمكان واللون والحالة والكمية؛ بلا تكرار)\n- جدول مواد أكثر ترتيبًا؛ إصلاح نقاط الألوان والأيقونات'
    },
    '1.0.0': {
      tr: '- Maliyet ve kâr hesaplayıcı: her kalem eklenir, çıkarılır, yeniden adlandırılır\n- Arşiv: basılan parçaların görselleri, dosyaları, teklif ve tekrar basım\n- Malzemeler (Falcon Ofis düzeni): kategori ağacı, renkler, konumlar, giriş/çıkış, QR etiket, döküm\n- Filament stoku: işlerde kullanılan gram makaradan düşer\n- Yazıcı kayıtları: bakım planı, arıza/bakım geçmişi, saat ve kâr\n- Dilimleyici ekran görüntüsünden, G-code ve 3MF\'den otomatik kayıt (onaylı)\n- Müşteriler, giderler, panel, raporlar; yapay zeka asistanı ve çeviri\n- GitHub ve Wi‑Fi eşitleme; tek tuşla güncelleme; Türkçe · English · العربية',
      en: '- Cost and profit calculator: every item can be added, removed and renamed\n- Archive: photos of printed parts, files, quotes and reprints\n- Materials (Falcon Office layout): category tree, colours, locations, in/out, QR labels, stock list\n- Filament stock: grams used in jobs are deducted from the spool\n- Printer records: maintenance plan, service/fault history, hours and profit\n- Automatic records from slicer screenshots, G-code and 3MF (after your approval)\n- Customers, expenses, dashboard, reports; AI assistant and translation\n- GitHub and Wi‑Fi sync; one-click updates; Türkçe · English · العربية',
      ar: '- حاسبة التكلفة والربح: يمكن إضافة كل بند أو حذفه أو إعادة تسميته\n- الأرشيف: صور القطع المطبوعة والملفات وعروض الأسعار وإعادة الطباعة\n- المواد (تخطيط فالكون أوفيس): شجرة الفئات والألوان والمواقع والإدخال/الإخراج وملصقات QR والجرد\n- مخزون الخيوط: تُخصم الغرامات المستخدمة في الأعمال من البكرة\n- سجلات الطابعات: خطة الصيانة وسجل الأعطال والساعات والربح\n- تسجيل تلقائي من لقطات برنامج التقطيع وملفات G-code و3MF (بعد موافقتك)\n- العملاء والمصاريف ولوحة المعلومات والتقارير؛ مساعد ذكاء اصطناعي وترجمة\n- مزامنة GitHub وWi‑Fi؛ تحديث بنقرة واحدة؛ Türkçe · English · العربية'
    }
  };
  function notes(v) { return NEWS[String(v).replace(/^v/, '')] || null; }

  /* ilk açılış rehberi: yalnız yapay zeka adımı (kullanıcının kendi anahtarı) */
  var OB = {
    firebase: false, ai: true, store: false,
    onAi: function (v) { if (v && v.key) DB.saveSettings({ ai: { provider: v.provider || 'gemini', key: v.key, model: '', onlineFirst: true } }).then(A.reload); }
  };

  /* ---------- güncelleme ---------- */
  var shownFor = null;
  function availableDialog(p) {
    if (!p || shownFor === p.version) return;
    if (document.querySelector('.modal-backdrop')) return setTimeout(function () { availableDialog(p); }, 1500);
    shownFor = p.version;
    var body = ui.el('div');
    body.appendChild(ui.el('p', { text: FC.t('fc.update.avail', { v: p.version }) + ' · ' + t('k.current') + ': v' + V() }));
    var n = FC.i18n.pick(notes(p.version) || p.notes);
    if (n) body.appendChild(ui.el('pre.notes', { text: n, dir: 'auto' }));
    if (p.size) body.appendChild(ui.el('p.muted.small', { text: FC.progress.mb(p.size) + (p.mode === 'patch' ? ' · ' + FC.t('fc.update.patchMode') : '') }));
    ui.modal({ title: FC.t('fc.update.avail', { v: p.version }), icon: 'download', body: body, buttons: [
      { label: t('k.later'), cls: 'ghost' }, 'spacer',
      { label: FC.t('fc.update'), icon: 'download', cls: 'primary', onClick: function () { FC.updater.run().catch(function () { }); } }
    ] });
  }
  function startUpdater() {
    var auto = !(S.settings && S.settings.autoUpdate === false);
    FC.updater.start({ repo: REPO, owner: OWNER, app: APP, version: V(), setupChannel: 'win-setup', autoCheck: auto, firstDelayMs: 3000, intervalHours: 6 });
    FC.updater.subscribe(function (st) { if (st.status === 'available' && st.plan) availableDialog(st.plan); });
  }

  /* ---------- üst çubuk ---------- */
  function topbar() {
    var host = document.getElementById('topRight'); if (!host || tb) return;
    tb = FC.topbar.mount(host, {
      before: [FC.announcements.button()],
      sync: { state: syncState, onClick: function () { A.sync.sync(true); } },
      lan: { state: lanState, onClick: function () { A.wifi.dialog(); } }
    });
  }
  function setSync(s) { syncState = s || 'off'; if (tb) tb.setSync(syncState); }
  function setLan(s) { lanState = s || 'off'; if (tb) tb.setLan(lanState); }

  function settingsOptions(cards) {
    return {
      cards: cards,
      usage: { firebase: false, ai: true, providers: ['gemini', 'openai', 'anthropic', 'groq'] },
      about: { version: V() },
      onboarding: OB
    };
  }

  function init() {
    FC.init({ app: APP, repo: REPO, owner: OWNER, version: V(), update: false, whatsnew: false, onboarding: false, announcements: true });
    startUpdater();
    topbar();
    if (NEW) {
      document.documentElement.classList.add('ma3d-kabuk');
      // Pencereyi kabuğa tanıt ve tam ekranı garantile (Edge/Chrome --start-fullscreen ile açılır).
      setTimeout(function () { H.bh.register().then(function (r) { if (r && r.bulundu) return H.bh.fullscreenOnStart(); }).catch(function () { }); }, 300);
    }
    if (window.MA3D_KABUK) setInterval(function () { fetch('/__shell/ping', { method: 'POST' }).catch(function () { }); }, 4000);
  }
  function started() {
    var wn = FC.whatsnew.start({ version: V(), notes: notes });
    if (!wn) setTimeout(function () { FC.onboarding.maybeStart(OB); }, 900);
  }
  function setupUrl() { return 'https://github.com/' + OWNER + '/' + REPO + '/releases/download/v' + V() + '/' + PREFIX + '-Setup-' + V() + '.exe'; }

  A.kabuk = { init: init, started: started, setSync: setSync, setLan: setLan, settingsOptions: settingsOptions, notes: notes, NEWS: NEWS, setupUrl: setupUrl, OWNER: OWNER, REPO: REPO };
})();
