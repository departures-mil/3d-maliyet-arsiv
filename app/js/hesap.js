/* Maliyet motoru — arayüzden bağımsız, saf fonksiyonlar. Tüm tutarlar temel para biriminde (USD) tutulur.
   Maliyet kalemleri kullanıcı tanımlıdır (costItems deposu: eklenir, silinir, adı değişir). Kalem türleri:
     material     filament/malzeme: Σ gram/1000 × kg fiyatı (+ adetli malzemeler: adet × birim fiyat)
     energy       elektrik: yazıcı watt/1000 × baskı saati × kWh fiyatı (kalemin tutarı = kWh fiyatı; boşsa ayardaki)
     wear         makine aşınması: yazıcı fiyatı / ömür saati × baskı saati
     labor        işçilik: saatlik ücret × hazırlık/işçilik dakikası / 60
     fail         başarısız baskı payı: önceki kalemlerin toplamı × %
     fixed        iş başına sabit tutar (ambalaj, tasarım…)
     perPiece     parça başına tutar × adet (vida, mıknatıs, kutu…)
     perHour      baskı saati başına tutar (kira payı…)
     perGram      gram başına tutar
     pctCost      maliyetin yüzdesi (genel gider payı…)
     pctPrice     satış fiyatının yüzdesi (komisyon, KDV…) — fiyat bu paylar düşülünce kâr kalacak biçimde hesaplanır */
(function () {
  'use strict';
  function n(v) {
    var x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(x) ? x : 0;
  }
  function pos(v) { var x = n(v); return x > 0 ? x : 0; }

  var TYPES = ['material', 'energy', 'wear', 'labor', 'fail', 'fixed', 'perPiece', 'perHour', 'perGram', 'pctCost', 'pctPrice'];
  /* İlk açılışta gelen kalemler (hepsi silinebilir/yeniden adlandırılabilir; Ayarlar → Maliyet kalemleri → Varsayılanlar) */
  function defaultItems(t) {
    return [
      { id: 'ci-material', type: 'material', name: t('ci.material'), amount: 0, on: true, order: 1, color: '#f59e0b' },
      { id: 'ci-energy', type: 'energy', name: t('ci.energy'), amount: 0, on: true, order: 2, color: '#eab308' },
      { id: 'ci-wear', type: 'wear', name: t('ci.wear'), amount: 0, on: true, order: 3, color: '#8b5cf6' },
      { id: 'ci-labor', type: 'labor', name: t('ci.labor'), amount: 0, on: true, order: 4, color: '#3b82f6' },
      { id: 'ci-post', type: 'fixed', name: t('ci.post'), amount: 0, on: false, order: 5, color: '#14b8a6' },
      { id: 'ci-pack', type: 'perPiece', name: t('ci.pack'), amount: 0.3, on: false, order: 6, color: '#06b6d4' },
      { id: 'ci-ship', type: 'fixed', name: t('ci.ship'), amount: 0, on: false, order: 7, color: '#0ea5e9' },
      { id: 'ci-design', type: 'fixed', name: t('ci.design'), amount: 0, on: false, order: 8, color: '#ec4899' },
      { id: 'ci-fail', type: 'fail', name: t('ci.fail'), amount: 5, on: true, order: 9, color: '#ef4444' },
      { id: 'ci-overhead', type: 'pctCost', name: t('ci.overhead'), amount: 0, on: false, order: 10, color: '#64748b' },
      { id: 'ci-commission', type: 'pctPrice', name: t('ci.commission'), amount: 0, on: false, order: 11, color: '#a855f7' },
      { id: 'ci-tax', type: 'pctPrice', name: t('ci.tax'), amount: 0, on: false, order: 12, color: '#f97316' }
    ];
  }

  /* p: {materials:[{grams, kgPrice} | {count, unitPrice}], printMin, laborMin, qty,
         printer:{watt, price, lifeHours}, kwhPrice, laborRate, items:[{id,name,type,amount,on}],
         margin (%), targetUnit (isteğe bağlı birim satış fiyatı), roundTo} */
  function compute(p) {
    var qty = Math.max(1, Math.round(pos(p.qty) || 1));
    var hours = pos(p.printMin) / 60;
    var grams = 0, matCost = 0;
    (p.materials || []).forEach(function (m) {
      if (m.count != null && m.unitPrice != null && !m.grams) { matCost += pos(m.count) * pos(m.unitPrice); return; }
      grams += pos(m.grams);
      matCost += pos(m.grams) / 1000 * pos(m.kgPrice);
    });
    var pr = p.printer || {};
    var rows = [], sub = 0, pctPrice = 0;
    var items = (p.items || []).filter(function (x) { return x && x.on; }).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var failRows = [], pctCostRows = [];
    items.forEach(function (it) {
      var v = 0, a = n(it.amount);
      switch (it.type) {
        case 'material': v = matCost; break;
        case 'energy': v = pos(pr.watt) / 1000 * hours * (a > 0 ? a : pos(p.kwhPrice)); break;
        case 'wear': v = pos(pr.lifeHours) > 0 ? pos(pr.price) / pos(pr.lifeHours) * hours : 0; break;
        case 'labor': v = (a > 0 ? a : pos(p.laborRate)) * pos(p.laborMin) / 60; break;
        case 'fixed': v = a; break;
        case 'perPiece': v = a * qty; break;
        case 'perHour': v = a * hours; break;
        case 'perGram': v = a * grams; break;
        case 'fail': failRows.push(it); return;
        case 'pctCost': pctCostRows.push(it); return;
        case 'pctPrice': pctPrice += a; rows.push({ id: it.id, name: it.name, type: it.type, color: it.color, value: 0, pct: a }); return;
        default: v = 0;
      }
      v = isFinite(v) ? v : 0;
      sub += v;
      rows.push({ id: it.id, name: it.name, type: it.type, color: it.color, value: v });
    });
    var base = sub;
    failRows.forEach(function (it) { var v = base * pos(it.amount) / 100; sub += v; rows.push({ id: it.id, name: it.name, type: it.type, color: it.color, value: v, pct: pos(it.amount) }); });
    var base2 = sub;
    pctCostRows.forEach(function (it) { var v = base2 * pos(it.amount) / 100; sub += v; rows.push({ id: it.id, name: it.name, type: it.type, color: it.color, value: v, pct: pos(it.amount) }); });

    var cost = sub;                         // satış payları hariç toplam maliyet (iş)
    var keep = Math.max(0.01, 1 - Math.min(95, pctPrice) / 100);
    var price, margin;
    if (pos(p.targetUnit) > 0) {
      price = pos(p.targetUnit) * qty;
      margin = cost > 0 ? ((price * keep) - cost) / cost * 100 : 0;
    } else {
      margin = n(p.margin);
      price = cost * (1 + margin / 100) / keep;
      var r = pos(p.roundTo);
      if (r > 0 && price > 0) price = Math.ceil(price / qty / r) * r * qty;
    }
    rows.forEach(function (x) { if (x.type === 'pctPrice') x.value = price * x.pct / 100; });
    var fees = price * (1 - keep);
    var profit = price - cost - fees;
    return {
      qty: qty, hours: hours, grams: grams, rows: rows,
      materialCost: matCost, cost: cost, fees: fees, price: price, profit: profit,
      margin: cost > 0 ? profit / cost * 100 : 0, marginInput: margin,
      unitCost: cost / qty, unitPrice: price / qty, unitProfit: profit / qty, unitGrams: grams / qty,
      costPerGram: grams > 0 ? cost / grams : 0, costPerHour: hours > 0 ? cost / hours : 0
    };
  }

  /* ---- para ---- */
  var CUR = { USD: { sym: '$', dec: 2, pre: true }, TRY: { sym: '₺', dec: 2, pre: true }, SYP: { sym: 'SYP', dec: 0, pre: false }, EUR: { sym: '€', dec: 2, pre: true } };
  function convert(usd, cur, st) {
    st = st || {};
    if (cur === 'TRY') return usd * pos(st.rateTry);
    if (cur === 'SYP') return usd * pos(st.rateSyp);
    if (cur === 'EUR') return usd * (pos(st.rateEur) || 0.92);
    return usd;
  }
  function toUsd(v, cur, st) {
    st = st || {};
    if (cur === 'TRY') return pos(st.rateTry) ? v / pos(st.rateTry) : v;
    if (cur === 'SYP') return pos(st.rateSyp) ? v / pos(st.rateSyp) : v;
    if (cur === 'EUR') return v / (pos(st.rateEur) || 0.92);
    return v;
  }
  function fmt(usd, cur, st, o) {
    cur = cur || 'USD';
    var c = CUR[cur] || CUR.USD, v = st ? convert(n(usd), cur, st) : n(usd);
    var loc = (window.FC && FC.i18n && FC.i18n.locale && FC.i18n.locale()) || 'tr-TR';
    var s = v.toLocaleString(loc, { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
    if (o && o.bare) return s;
    return c.pre ? c.sym + s : s + ' ' + c.sym;
  }
  function fmtMin(min, t) {
    min = Math.round(pos(min));
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + ' ' + t('u.h') + ' ' : '') + m + ' ' + t('u.min');
  }
var RATE_SOURCES = [
  "https://open.er-api.com/v6/latest/USD",
  "https://api.exchangerate-api.com/v4/latest/USD",
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
];

var MARKET_PAGES = [
  "https://sp-today.com/en/currencies",
  "https://sp-today.com/"
];

async function viaShell(url) {
  const res = await fetch("/__shell/getir?url=" + encodeURIComponent(url), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

/* Etiketin yakınındaki ilk makul sayıyı ayıklar.
   Yeni lira 100–400 bandında; eski lira yazılmışsa 100'e bölünür. */
function pickRate(text, labels, lo, hi) {
  for (const label of labels) {
    let from = 0;
    for (let k = 0; k < 6; k++) {
      const i = text.indexOf(label, from);
      if (i < 0) break;
      from = i + label.length;
      const win = text.slice(i, i + 260).replace(/,/g, "");
      for (const m of win.matchAll(/\d+(?:\.\d+)?/g)) {
        let v = parseFloat(m[0]);
        if (!isFinite(v) || v <= 0) continue;
        if (v >= lo * 100 && v <= hi * 100) v = v / 100;   // eski lira yazılmış
        if (v >= lo && v <= hi) return v;
      }
    }
  }
  return 0;
}

async function fetchMarketRates() {
  if (!window.MA3D_KABUK) throw new Error("kabuk yok");
  let lastErr = null;
  for (const page of MARKET_PAGES) {
    try {
      const html = await viaShell(page);
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                       .replace(/<style[\s\S]*?<\/style>/gi, " ")
                       .replace(/<[^>]+>/g, " ")
                       .replace(/&nbsp;/g, " ")
                       .replace(/\s+/g, " ");
      const syp = pickRate(text, ["USD", "US Dollar", "دولار"], 40, 2000);
      if (!syp) { lastErr = new Error("USD satırı bulunamadı"); continue; }
      /* Türk lirası da Suriye piyasasındaki değeriyle: 1 USD = syp / (TRY→SYP) */
      const tryInSyp = pickRate(text, ["TRY", "Turkish", "تركي"], 0.5, 60);
      const rateTry = tryInSyp > 0 ? syp / tryInSyp : 0;
      return { rateSyp: syp, rateTry: rateTry || null, src: "sp-today.com", market: true };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("piyasa kuru okunamadı");
}

async function fetchOfficialRates() {
  let lastErr = null;
  for (const url of RATE_SOURCES) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const data = await res.json();
      let r = data.rates || data.conversion_rates || data.usd || {};
      r = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toUpperCase(), v]));
      const tryR = parseFloat(r.TRY);
      let sypR = parseFloat(r.SYP);
      if (!(tryR > 0)) { lastErr = new Error("TRY yok"); continue; }
      if (sypR > 2000) sypR = sypR / 100;          // eski lira veren kaynaklar
      return { rateTry: tryR, rateSyp: sypR > 0 ? sypR : null,
               src: new URL(url).hostname, market: false };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("kaynak yok");
}

/* Önce Suriye piyasası, olmazsa resmî kaynak. */
async function fetchRates(preferMarket) {
  if (preferMarket !== false) {
    try { return await fetchMarketRates(); } catch (e) { /* resmîye düş */ }
  }
  return fetchOfficialRates();
}


  window.CALC = { compute: compute, defaultItems: defaultItems, TYPES: TYPES, CUR: CUR, convert: convert, toUsd: toUsd, fmt: fmt, fmtMin: fmtMin,
    fetchRates: fetchRates, num: n, pos: pos };
})();
