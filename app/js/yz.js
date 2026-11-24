/* YAPAY ZEKA — kullanıcının KENDİ anahtarıyla (Gemini / OpenAI / Claude / Groq) çevrimiçi; anahtar ya da internet yoksa çevrimdışı.
   - vision(blob, prompt): dilimleyici ekran görüntüsünü okur (iceaktar.js)
   - translate(text, lang): 3D baskı terimlerine uygun çeviri; çevrimdışı: terim sözlüğü (TR/EN/AR)
   - tips(): kayıtlardan kurallı öneriler (çevrimdışı)
   - Asistan sayfası: kayıtlar hakkında soru-cevap (çevrimiçi) / hazır hesaplar (çevrimdışı) + çeviri aracı + sözlük
   Çağrılar Ayarlar → Kullanım Limitleri'nde sayılır (FC.usage.wrapFetch). Hiçbir çağrı uygulama sahibinin hesabını kullanmaz. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  var PROV = {
    gemini: { name: 'Google Gemini', model: '', vision: true },
    openai: { name: 'OpenAI', model: 'gpt-4o-mini', vision: true },
    anthropic: { name: 'Anthropic Claude', model: 'claude-haiku-5-5', vision: true },
    groq: { name: 'Groq', model: 'llama-3.3-70b-versatile', visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct', vision: true }
  };
  function cfg() { var c = (S.settings && S.settings.ai) || {}; return { provider: PROV[c.provider] ? c.provider : 'gemini', key: String(c.key || '').trim(), model: String(c.model || '').trim(), onlineFirst: c.onlineFirst !== false }; }
  function hasKey() { return !!cfg().key; }
  function online() { return navigator.onLine !== false; }
  function canOnline() { var c = cfg(); return !!c.key && c.onlineFirst && online(); }
  function canVision() { return canOnline() && PROV[cfg().provider].vision; }
  function providerName() { return PROV[cfg().provider].name; }

  function b64(blob) { return DB.blobToB64(blob).then(function (d) { var i = d.indexOf(','); return { data: d.slice(i + 1), mime: blob.type || 'image/png', url: d }; }); }
  async function geminiModel(key) {
    var c = cfg(); if (c.model) return c.model;
    var cached = FC.storage.get('ma3d.geminiModel', null);
    if (cached && cached.d === new Date().toISOString().slice(0, 10)) return cached.m;
    var m = 'gemini-2.5-flash';
    try {
      var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key));
      if (r.ok) {
        var j = await r.json();
        var ok = (j.models || []).filter(function (x) { return /flash/.test(x.name) && !/lite|tts|image|live|audio|embed|thinking|exp|preview/.test(x.name) && (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
          .map(function (x) { return x.name.replace(/^models\//, ''); })
          .sort(function (a, b) { var va = parseFloat((/(\d+(?:\.\d+)?)/.exec(a) || [0, 0])[1]), vb = parseFloat((/(\d+(?:\.\d+)?)/.exec(b) || [0, 0])[1]); return vb - va || a.length - b.length; });
        if (ok[0]) m = ok[0];
      }
    } catch (e) { }
    FC.storage.set('ma3d.geminiModel', { d: new Date().toISOString().slice(0, 10), m: m });
    return m;
  }
  /* tek çağrı: {prompt, system, image(blob), json} → metin */
  async function call(o) {
    var c = cfg(); if (!c.key) throw new Error(t('ai.noKey'));
    if (!online()) throw new Error(t('ai.offline'));
    var img = o.image ? await b64(o.image) : null, r, j, txt = '';
    if (c.provider === 'gemini') {
      var model = await geminiModel(c.key), parts = [{ text: o.prompt }];
      if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
      var body = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.2 } };
      if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
      if (o.json) body.generationConfig.responseMimeType = 'application/json';
      r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(c.key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      txt = ((j.candidates || [])[0] || {}).content ? j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('') : '';
    } else if (c.provider === 'anthropic') {
      var content = [];
      if (img) content.push({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } });
      content.push({ type: 'text', text: o.prompt });
      var ab = { model: c.model || PROV.anthropic.model, max_tokens: 2048, messages: [{ role: 'user', content: content }] };
      if (o.system) ab.system = o.system;
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify(ab) });
      j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      txt = (j.content || []).map(function (p) { return p.text || ''; }).join('');
    } else {
      var url = c.provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      var um = img ? [{ type: 'text', text: o.prompt }, { type: 'image_url', image_url: { url: img.url } }] : o.prompt;
      var msgs = (o.system ? [{ role: 'system', content: o.system }] : []).concat([{ role: 'user', content: um }]);
      var model2 = c.model || (img && PROV[c.provider].visionModel) || PROV[c.provider].model;
      var ob = { model: model2, messages: msgs, temperature: 0.2 };
      if (o.json) ob.response_format = { type: 'json_object' };
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify(ob) });
      j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      txt = ((j.choices || [])[0] || {}).message ? j.choices[0].message.content || '' : '';
    }
    return { text: String(txt || '').trim(), provider: PROV[c.provider].name };
  }
  function vision(blob, prompt) { return call({ prompt: prompt, image: blob, json: true }); }

  /* ---------------- çevrimdışı sözlük (3D baskı) ---------------- */
  var G = [
    ['3B baskı', '3D printing', 'الطباعة ثلاثية الأبعاد'], ['3D baskı', '3D printing', 'الطباعة ثلاثية الأبعاد'], ['yazıcı', 'printer', 'طابعة'], ['3D yazıcı', '3D printer', 'طابعة ثلاثية الأبعاد'],
    ['filament', 'filament', 'خيط الطباعة'], ['makara', 'spool', 'بكرة'], ['nozul', 'nozzle', 'فوهة'], ['nozzle', 'nozzle', 'فوهة'], ['tabla', 'build plate', 'سطح الطباعة'], ['baskı tablası', 'build plate', 'سطح الطباعة'],
    ['ısıtmalı tabla', 'heated bed', 'سرير مُسخَّن'], ['katman yüksekliği', 'layer height', 'ارتفاع الطبقة'], ['katman', 'layer', 'طبقة'], ['dolgu', 'infill', 'الحشو'], ['dolgu oranı', 'infill density', 'كثافة الحشو'],
    ['duvar', 'wall', 'جدار'], ['dış duvar', 'outer wall', 'الجدار الخارجي'], ['iç duvar', 'inner wall', 'الجدار الداخلي'], ['destek', 'support', 'دعامة'], ['ağaç destek', 'tree support', 'دعامة شجرية'], ['destekler', 'supports', 'الدعامات'],
    ['köprü', 'bridge', 'جسر'], ['sarkma', 'overhang', 'بروز'], ['kenar', 'brim', 'حافة لاصقة'], ['etek', 'skirt', 'تنورة'], ['sal', 'raft', 'قاعدة'], ['geri çekme', 'retraction', 'السحب العكسي'], ['ipeksi', 'silk', 'حريري'],
    ['dilimleyici', 'slicer', 'برنامج التقطيع'], ['dilimleme', 'slicing', 'التقطيع'], ['baskı süresi', 'print time', 'مدة الطباعة'], ['hazırlık süresi', 'preparation time', 'وقت التحضير'], ['toplam süre', 'total time', 'المدة الإجمالية'],
    ['baskı hızı', 'print speed', 'سرعة الطباعة'], ['sıcaklık', 'temperature', 'درجة الحرارة'], ['nozul sıcaklığı', 'nozzle temperature', 'حرارة الفوهة'], ['tabla sıcaklığı', 'bed temperature', 'حرارة السرير'],
    ['soğutma', 'cooling', 'التبريد'], ['fan', 'fan', 'مروحة'], ['ekstruder', 'extruder', 'الباثق'], ['hotend', 'hotend', 'رأس التسخين'], ['kalibrasyon', 'calibration', 'المعايرة'], ['seviyeleme', 'leveling', 'التسوية'],
    ['tabla seviyeleme', 'bed leveling', 'تسوية السرير'], ['ilk katman', 'first layer', 'الطبقة الأولى'], ['yapışma', 'adhesion', 'الالتصاق'], ['çarpılma', 'warping', 'الالتواء'], ['tıkanma', 'clog', 'انسداد'],
    ['parça', 'part', 'قطعة'], ['parçalar', 'parts', 'قطع'], ['model', 'model', 'نموذج'], ['prototip', 'prototype', 'نموذج أولي'], ['baskı', 'print', 'طباعة'], ['basıldı', 'printed', 'طُبع'], ['basılan', 'printed', 'المطبوع'],
    ['maliyet', 'cost', 'التكلفة'], ['toplam maliyet', 'total cost', 'التكلفة الإجمالية'], ['birim maliyet', 'unit cost', 'تكلفة الوحدة'], ['fiyat', 'price', 'السعر'], ['satış fiyatı', 'sale price', 'سعر البيع'], ['kâr', 'profit', 'الربح'], ['kar', 'profit', 'الربح'],
    ['kâr marjı', 'profit margin', 'هامش الربح'], ['elektrik', 'electricity', 'الكهرباء'], ['enerji', 'energy', 'الطاقة'], ['işçilik', 'labor', 'أجرة العمل'], ['amortisman', 'depreciation', 'الإهلاك'], ['aşınma', 'wear', 'الاهتلاك'],
    ['fire', 'waste', 'الهدر'], ['hata payı', 'failure margin', 'هامش الفشل'], ['kargo', 'shipping', 'الشحن'], ['ambalaj', 'packaging', 'التغليف'], ['paketleme', 'packaging', 'التغليف'], ['tasarım', 'design', 'التصميم'], ['son işlem', 'post-processing', 'المعالجة اللاحقة'],
    ['zımpara', 'sanding', 'الصنفرة'], ['boya', 'paint', 'الطلاء'], ['vergi', 'tax', 'الضريبة'], ['komisyon', 'commission', 'العمولة'], ['teklif', 'quote', 'عرض سعر'], ['fatura', 'invoice', 'فاتورة'], ['müşteri', 'customer', 'العميل'],
    ['sipariş', 'order', 'طلب'], ['adet', 'pcs', 'قطعة'], ['gram', 'grams', 'غرام'], ['metre', 'meters', 'متر'], ['saat', 'hours', 'ساعات'], ['dakika', 'minutes', 'دقائق'], ['kilogram', 'kilogram', 'كيلوغرام'],
    ['stok', 'stock', 'المخزون'], ['malzeme', 'material', 'المادة'], ['malzemeler', 'materials', 'المواد'], ['renk', 'color', 'اللون'], ['siyah', 'black', 'أسود'], ['beyaz', 'white', 'أبيض'], ['kırmızı', 'red', 'أحمر'], ['mavi', 'blue', 'أزرق'],
    ['yeşil', 'green', 'أخضر'], ['sarı', 'yellow', 'أصفر'], ['gri', 'grey', 'رمادي'], ['turuncu', 'orange', 'برتقالي'], ['şeffaf', 'transparent', 'شفاف'], ['mor', 'purple', 'بنفسجي'], ['kahverengi', 'brown', 'بني'],
    ['bakım', 'maintenance', 'الصيانة'], ['yağlama', 'lubrication', 'التشحيم'], ['kayış', 'belt', 'سير'], ['temizlik', 'cleaning', 'التنظيف'], ['değişim', 'replacement', 'الاستبدال'], ['arıza', 'fault', 'عطل'], ['onarım', 'repair', 'إصلاح'],
    ['dayanıklı', 'durable', 'متين'], ['esnek', 'flexible', 'مرن'], ['sert', 'rigid', 'صلب'], ['karbon fiber', 'carbon fiber', 'ألياف الكربون'], ['ısıya dayanıklı', 'heat resistant', 'مقاوم للحرارة'], ['dış mekan', 'outdoor', 'خارجي'],
    ['kapak', 'cover', 'غطاء'], ['kutu', 'box', 'صندوق'], ['braket', 'bracket', 'حامل'], ['tutucu', 'holder', 'حامل'], ['dişli', 'gear', 'ترس'], ['vida', 'screw', 'برغي'], ['somun', 'nut', 'صامولة'], ['menteşe', 'hinge', 'مفصلة'],
    ['tamamlandı', 'completed', 'مكتمل'], ['teslim edildi', 'delivered', 'تم التسليم'], ['başarısız', 'failed', 'فشل'], ['planlandı', 'planned', 'مخطط'], ['basılıyor', 'printing', 'قيد الطباعة'], ['ödendi', 'paid', 'مدفوع'], ['ödenmedi', 'unpaid', 'غير مدفوع'],
    ['ve', 'and', 'و'], ['ile', 'with', 'مع'], ['için', 'for', 'لـ'], ['yüksek', 'high', 'عالي'], ['düşük', 'low', 'منخفض'], ['hızlı', 'fast', 'سريع'], ['yavaş', 'slow', 'بطيء'], ['kalite', 'quality', 'الجودة'], ['yüksek kalite', 'high quality', 'جودة عالية'],
    ['not', 'note', 'ملاحظة'], ['açıklama', 'description', 'الوصف'], ['tarih', 'date', 'التاريخ'], ['yeni', 'new', 'جديد'], ['kullanılmış', 'used', 'مستعمل'], ['sıfır', 'new', 'جديد'], ['ağırlık', 'weight', 'الوزن'], ['boyut', 'size', 'الحجم'], ['ölçü', 'dimension', 'القياس']
  ];
  var IDX = { tr: 0, en: 1, ar: 2 };
  function detect(s) {
    s = String(s || '');
    if (/[؀-ۿ]/.test(s)) return 'ar';
    if (/[çğışöüÇĞİŞÖÜ]/.test(s) || /\b(ve|bir|için|ile|adet|baskı|parça|maliyet)\b/i.test(s)) return 'tr';
    return 'en';
  }
  function lower(s, l) { try { return s.toLocaleLowerCase(l === 'tr' ? 'tr-TR' : l === 'ar' ? 'ar' : 'en-US'); } catch (e) { return s.toLowerCase(); } }
  function offlineTranslate(text, to) {
    var from = detect(text); if (from === to) return text;
    var fi = IDX[from], ti = IDX[to];
    var terms = G.map(function (r) { return { s: lower(r[fi], from), d: r[ti] }; }).filter(function (x) { return x.s; }).sort(function (a, b) { return b.s.length - a.s.length; });
    return String(text).split(/(\n)/).map(function (line) {
      if (line === '\n') return line;
      var out = '', i = 0, low = lower(line, from);
      var isWord = function (c) { return c && /[\wçğıöşüÇĞİŞÖÜ؀-ۿ]/.test(c); };
      while (i < line.length) {
        var hit = null;
        if (!isWord(line[i - 1]) || i === 0) {
          for (var k = 0; k < terms.length; k++) { var s = terms[k].s; if (low.substr(i, s.length) === s && !isWord(line[i + s.length])) { hit = terms[k]; break; } }
          if (!hit && from === 'tr') { // Türkçe ekler: "parçalar", "filamenti", "maliyeti" → kök
            for (var k2 = 0; k2 < terms.length; k2++) { var s2 = terms[k2].s; if (s2.length >= 4 && low.substr(i, s2.length) === s2) { var j = i + s2.length; while (isWord(line[j])) j++; if (j - i - s2.length <= 4) { hit = { s: low.slice(i, j), d: terms[k2].d }; break; } } }
          }
        }
        if (hit) { out += hit.d; i += hit.s.length; } else { out += line[i]; i++; }
      }
      return out;
    }).join('');
  }
  async function translate(text, lang) {
    text = String(text || ''); if (!text.trim()) return { text: '', online: false };
    var names = { tr: 'Turkish', en: 'English', ar: 'Arabic' };
    if (canOnline()) {
      try {
        var r = await call({ system: 'You are a professional technical translator specialised in 3D printing, FDM/SLA manufacturing, slicer software (Orca, Bambu Studio, Cura, PrusaSlicer), filament materials, costing and small-business sales. Keep product names, part codes, numbers, units and file names unchanged. Use the standard industry terms of the target language. Output only the translation.', prompt: 'Translate into ' + names[lang] + ':\n\n' + text });
        if (r.text) return { text: r.text, online: true, provider: r.provider };
      } catch (e) { }
    }
    return { text: offlineTranslate(text, lang), online: false, provider: t('ai.glossary') };
  }

  /* ---------------- çevrimdışı öneriler ---------------- */
  function tips() {
    var out = [], st = S.settings || {};
    if (!S.printers.length) out.push({ kind: 'warn', text: t('tip.noPrinter') });
    var low = S.materials.filter(function (m) { return !m.archived && A.isLow(m); });
    if (low.length) out.push({ kind: 'warn', text: t('tip.low', { n: low.length, l: low.slice(0, 3).map(function (m) { return [m.matType, m.name].filter(Boolean).join(' '); }).join(', ') }) });
    var noPrice = S.materials.filter(function (m) { return !CALC.pos(m.unitPrice) && !CALC.pos(m.kgPrice); });
    if (noPrice.length) out.push({ kind: 'info', text: t('tip.noPrice', { n: noPrice.length }) });
    var due = A.printers && A.printers.dueTasks ? S.printers.reduce(function (s, p) { return s + A.printers.dueTasks(p).filter(function (d) { return d.due; }).length; }, 0) : 0;
    if (due) out.push({ kind: 'warn', text: t('tip.maint', { n: due }) });
    var unpaid = S.jobs.filter(function (j) { return CALC.num(j.calc && j.calc.price) - CALC.num(j.paid) > 0.005 && A.archive && A.archive.payState(j) !== 'paid'; });
    if (unpaid.length) out.push({ kind: 'info', text: t('tip.unpaid', { n: unpaid.length, v: A.money(unpaid.reduce(function (s, j) { return s + CALC.num(j.calc.price) - CALC.num(j.paid); }, 0)) }) });
    var lowM = S.jobs.filter(function (j) { return j.calc && CALC.num(j.calc.price) > 0 && CALC.num(j.calc.profit) / CALC.num(j.calc.price) < 0.15; });
    if (lowM.length) out.push({ kind: 'warn', text: t('tip.lowMargin', { n: lowM.length }) });
    var failed = A.listOf('jobStatus').filter(function (x) { return x.key === 'failed'; })[0];
    if (failed && S.jobs.length >= 10) { var fr = S.jobs.filter(function (j) { return j.statusId === failed.id; }).length / S.jobs.length; if (fr > CALC.num(st.failPct) / 100 + 0.02) out.push({ kind: 'warn', text: t('tip.failRate', { p: Math.round(fr * 100), s: CALC.num(st.failPct) }) }); }
    var noPhoto = S.jobs.filter(function (j) { return !(j.photos || []).length; }).length;
    if (noPhoto >= 3) out.push({ kind: 'info', text: t('tip.photos', { n: noPhoto }) });
    if (!st.lastSync && S.jobs.length >= 5) out.push({ kind: 'info', text: t('tip.sync') });
    if (!hasKey()) out.push({ kind: 'info', text: t('tip.aiKey') });
    if (!out.length && S.jobs.length) out.push({ kind: 'good', text: t('tip.allGood') });
    return out;
  }

  /* ---------------- veri özeti (asistana bağlam; yalnız kullanıcının kendi sağlayıcısına gider) ---------------- */
  function summary() {
    var since = new Date(); since.setMonth(since.getMonth() - 12);
    var jobs = S.jobs.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var tot = function (l, k) { return l.reduce(function (s, j) { return s + CALC.num(j.calc && j.calc[k]); }, 0); };
    var lines = [];
    lines.push('Currency: ' + S.settings.currency + ' (amounts below are USD). Electricity ' + S.settings.kwhPrice + ' USD/kWh, labor ' + S.settings.laborRate + ' USD/h, default margin ' + S.settings.margin + '%.');
    lines.push('Jobs: ' + jobs.length + ', revenue ' + tot(jobs, 'price').toFixed(2) + ', cost ' + tot(jobs, 'cost').toFixed(2) + ', profit ' + tot(jobs, 'profit').toFixed(2) + ', grams ' + Math.round(tot(jobs, 'grams')) + ', hours ' + tot(jobs, 'hours').toFixed(1) + '.');
    lines.push('Expenses total: ' + S.expenses.reduce(function (s, e) { return s + CALC.num(e.amount); }, 0).toFixed(2) + '.');
    lines.push('Printers: ' + S.printers.map(function (p) { var s = A.printerStats ? A.printerStats(p) : {}; return p.name + ' (' + (s.hours ? Math.round(s.hours) + 'h' : '') + ')'; }).join('; '));
    lines.push('Materials in stock: ' + S.materials.filter(function (m) { return !m.archived; }).slice(0, 60).map(function (m) { return [m.matType, m.brand, m.name].filter(Boolean).join(' ') + ' qty ' + A.stockOf(m.id) + ' ' + (m.unit || '') + ', ' + A.kgPrice(m).toFixed(2) + ' USD/kg'; }).join('; '));
    lines.push('Customers: ' + S.customers.length + '.');
    lines.push('Recent jobs (date | code | name | qty | status | grams | hours | cost | price | profit | paid | customer | printer):');
    jobs.slice(0, 80).forEach(function (j) { var c = j.calc || {}; lines.push([j.date, j.code, j.name, j.qty, A.nameOf(S.lists, j.statusId, ''), Math.round(c.grams || 0), (+c.hours || 0).toFixed(1), (+c.cost || 0).toFixed(2), (+c.price || 0).toFixed(2), (+c.profit || 0).toFixed(2), (+j.paid || 0).toFixed(2), j.customerName || '', j.printerName || ''].join(' | ')); });
    return lines.join('\n');
  }
  /* çevrimdışı cevaplar: sık sorulan hesaplar */
  function offlineAnswer(q) {
    var s = lower(q, FC.i18n.lang()), now = new Date(), ym = now.toISOString().slice(0, 7);
    var inMonth = S.jobs.filter(function (j) { return String(j.date || '').slice(0, 7) === ym; });
    var sum = function (l, k) { return l.reduce(function (a, j) { return a + CALC.num(j.calc && j.calc[k]); }, 0); };
    var out = [];
    if (/kâr|kar\b|profit|ربح/.test(s)) out.push(t('as.profit', { m: A.money(sum(inMonth, 'profit')), a: A.money(sum(S.jobs, 'profit')) }));
    if (/ciro|gelir|satış|revenue|sales|مبيعات|إيراد/.test(s)) out.push(t('as.revenue', { m: A.money(sum(inMonth, 'price')), a: A.money(sum(S.jobs, 'price')) }));
    if (/stok|filament|makara|stock|spool|مخزون|خيط/.test(s)) { var low = S.materials.filter(A.isLow); out.push(t('as.stock', { n: S.materials.length, l: low.length ? low.map(function (m) { return m.name; }).slice(0, 8).join(', ') : '—' })); }
    if (/gram|kg|ağırlık|weight|وزن/.test(s)) out.push(t('as.grams', { m: A.num(sum(inMonth, 'grams') / 1000, 2), a: A.num(sum(S.jobs, 'grams') / 1000, 2) }));
    if (/saat|süre|hour|time|ساعة|وقت/.test(s)) out.push(t('as.hours', { m: A.num(sum(inMonth, 'hours'), 1), a: A.num(sum(S.jobs, 'hours'), 1) }));
    if (/borç|ödenme|alacak|unpaid|owe|due|دين|مستحق/.test(s)) { var un = S.jobs.filter(function (j) { return CALC.num(j.calc && j.calc.price) - CALC.num(j.paid) > 0.005; }); out.push(t('as.unpaid', { n: un.length, v: A.money(un.reduce(function (a, j) { return a + CALC.num(j.calc.price) - CALC.num(j.paid); }, 0)) })); }
    if (/en çok|en iyi|best|top|أكثر|أفضل/.test(s)) {
      var by = {}; S.jobs.forEach(function (j) { var k = j.customerName || '—'; by[k] = (by[k] || 0) + CALC.num(j.calc && j.calc.price); });
      var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).slice(0, 5);
      out.push(t('as.top', { l: top.map(function (k) { return k + ' (' + A.money(by[k]) + ')'; }).join(', ') || '—' }));
    }
    if (/yazıcı|printer|طابعة/.test(s)) out.push(S.printers.map(function (p) { var st = A.printerStats ? A.printerStats(p) : { hours: 0, jobs: 0 }; return p.name + ': ' + A.num(st.hours, 1) + ' ' + t('u.h') + ', ' + (st.jobs || 0) + ' ' + t('as.jobs'); }).join('\n') || t('tip.noPrinter'));
    if (!out.length) out.push(t('as.help'));
    return out.join('\n\n');
  }

  /* ---------------- Asistan sayfası ---------------- */
  var CHAT = [];
  function renderAssistant(host) {
    var c = cfg();
    var grid = ui.el('div.dash-grid');
    var chat = ui.el('section.card.span2.chat-card');
    chat.innerHTML = '<h3 class="card-title">' + A.icon('bot') + '<span>' + esc(t('as.title')) + '</span><em class="badge ' + (canOnline() ? 'ok' : '') + '">' + esc(canOnline() ? t('as.online', { p: providerName() }) : t('as.offlineMode')) + '</em></h3>' +
      '<div class="chat-log" id="asLog"></div>' +
      '<div class="chat-in"><textarea id="asQ" rows="2" placeholder="' + esc(t('as.ph')) + '"></textarea><button type="button" class="btn primary" id="asSend">' + A.icon('send') + esc(t('as.send')) + '</button></div>' +
      '<div class="chips" id="asChips">' + ['as.q1', 'as.q2', 'as.q3', 'as.q4'].map(function (k) { return '<button type="button" class="chip" data-q="' + esc(t(k)) + '">' + esc(t(k)) + '</button>'; }).join('') + '</div>' +
      (c.key ? '' : '<p class="field-hint">' + esc(t('as.noKeyHint')) + ' <a href="#" id="asSet">' + esc(t('nav.settings')) + '</a></p>');
    grid.appendChild(chat);
    var log = chat.querySelector('#asLog');
    function draw() {
      log.innerHTML = CHAT.length ? CHAT.map(function (m) { return '<div class="msg ' + m.role + '"><div class="pre" dir="auto">' + esc(m.text) + '</div>' + (m.via ? '<small>' + esc(m.via) + '</small>' : '') + '</div>'; }).join('') : '<p class="muted">' + esc(t('as.intro')) + '</p>';
      log.scrollTop = log.scrollHeight;
    }
    async function ask(q) {
      q = String(q || '').trim(); if (!q) return;
      CHAT.push({ role: 'me', text: q }); CHAT.push({ role: 'bot', text: t('a.working') }); draw();
      var ans;
      if (canOnline()) {
        try {
          var hist = CHAT.slice(-12, -2).map(function (m) { return (m.role === 'me' ? 'User: ' : 'Assistant: ') + m.text; }).join('\n');
          var r = await call({ system: 'You are the assistant inside "3D Maliyet ve Arşiv", a desktop app for a small 3D printing business: cost & profit calculation, print archive, filament stock, printers and maintenance. Answer in the user\'s language (' + FC.i18n.lang() + '), briefly and concretely, using the data below when relevant. Give practical 3D printing advice (slicer settings, materials, pricing) when asked. Data:\n' + summary(), prompt: (hist ? hist + '\n' : '') + 'User: ' + q });
          ans = { text: r.text || '—', via: t('ai.viaOnline', { p: r.provider }) };
        } catch (e) { ans = { text: offlineAnswer(q), via: t('ai.viaOffline', { p: t('as.rules') }) + ' · ' + String(e.message || e).slice(0, 120) }; }
      } else ans = { text: offlineAnswer(q), via: t('ai.viaOffline', { p: t('as.rules') }) };
      CHAT.pop(); CHAT.push({ role: 'bot', text: ans.text, via: ans.via }); draw();
    }
    var qi = chat.querySelector('#asQ');
    chat.querySelector('#asSend').onclick = function () { var v = qi.value; qi.value = ''; ask(v); };
    qi.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chat.querySelector('#asSend').click(); } });
    A.$$('[data-q]', chat).forEach(function (b) { b.onclick = function () { ask(b.getAttribute('data-q')); }; });
    var setL = chat.querySelector('#asSet'); if (setL) setL.onclick = function (e) { e.preventDefault(); A.go('settings', { focus: 'ai' }); };
    draw();

    /* çeviri aracı */
    var tr = ui.el('section.card');
    tr.innerHTML = '<h3 class="card-title">' + A.icon('translate') + '<span>' + esc(t('as.translate')) + '</span></h3>' +
      '<textarea id="trIn" rows="5" dir="auto" placeholder="' + esc(t('as.trPh')) + '"></textarea>' +
      '<div class="fc-row" style="margin:8px 0">' + ['tr', 'en', 'ar'].map(function (l) { return '<button type="button" class="btn small" data-to="' + l + '">' + A.icon('translate') + esc(FC.i18n.names[l]) + '</button>'; }).join('') + '<span class="fc-spacer"></span><button type="button" class="btn small ghost" id="trCopy">' + A.icon('copy') + esc(t('a.copy')) + '</button></div>' +
      '<div id="trOut" class="pre out-box" dir="auto"></div><small id="trVia" class="muted"></small>';
    grid.appendChild(tr);
    A.$$('[data-to]', tr).forEach(function (b) {
      b.onclick = async function () {
        var src = tr.querySelector('#trIn').value; if (!src.trim()) return;
        tr.querySelector('#trOut').textContent = t('a.working');
        var r = await translate(src, b.getAttribute('data-to'));
        tr.querySelector('#trOut').textContent = r.text;
        tr.querySelector('#trOut').setAttribute('dir', b.getAttribute('data-to') === 'ar' ? 'rtl' : 'ltr');
        tr.querySelector('#trVia').textContent = t(r.online ? 'ai.viaOnline' : 'ai.viaOffline', { p: r.provider || '' });
      };
    });
    tr.querySelector('#trCopy').onclick = function () { try { navigator.clipboard.writeText(tr.querySelector('#trOut').textContent); A.toast(t('a.copied'), 'good'); } catch (e) { } };

    /* sözlük */
    var gl = ui.el('section.card');
    gl.innerHTML = '<h3 class="card-title">' + A.icon('layers') + '<span>' + esc(t('as.glossary')) + '</span></h3><label class="search">' + A.icon('search') + '<input type="search" id="glQ" placeholder="' + esc(t('a.search')) + '"></label><div class="tablewrap gl-wrap"><table class="tbl small"><thead><tr><th>TR</th><th>EN</th><th>AR</th></tr></thead><tbody id="glB"></tbody></table></div>';
    grid.appendChild(gl);
    function drawGl() { var q = lower(gl.querySelector('#glQ').value, 'tr'); gl.querySelector('#glB').innerHTML = G.filter(function (r) { return !q || r.some(function (x) { return lower(x, 'tr').indexOf(q) >= 0; }); }).slice(0, 200).map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td dir="rtl">' + esc(r[2]) + '</td></tr>'; }).join(''); }
    gl.querySelector('#glQ').oninput = drawGl; drawGl();
    host.appendChild(grid);
  }

  A.page('assistant', { icon: 'bot', group: 'general', render: renderAssistant });
  A.ai = { cfg: cfg, hasKey: hasKey, canOnline: canOnline, canVision: canVision, providerName: providerName, call: call, vision: vision, translate: translate, offlineTranslate: offlineTranslate, detect: detect, tips: tips, summary: summary, offlineAnswer: offlineAnswer, PROVIDERS: PROV, GLOSSARY: G };
})();
