/* İÇE AKTAR — dilimleyici (Orca/Zaxe/Bambu/Prusa/Cura) ekran görüntüsü, G-code ya da 3MF dosyasından iş bilgisi çıkarır:
   gram, metre, baskı/hazırlık/toplam süre, yazıcı, nozzle, tabla, filament (profil, tür), işlem (katman), destek, dolgu…
   Ad ve adet dosya adından gelir ("Alerion-R1-VersionB adet 1", "BallastBox 1 adet").
   Görsel okuma: önce kullanıcının kendi AI anahtarıyla (çevrimiçi, görsel okuyabilen model); yoksa ya da internet yoksa
   Windows'un kendi yazı tanıması (/__shell/ocr, çevrimdışı). Sonuç her zaman bir onay penceresinde gösterilir:
   kullanıcı düzeltir, onaylar; ancak ondan sonra kayda geçer. Görsel işin fotoğraflarına eklenir. */
(function () {
  'use strict';
  var A = window.APP, S = A.S, t = A.t, esc = A.esc, ui = FC.ui;

  /* ---------------- yardımcılar ---------------- */
  function nf(s) { if (s == null) return 0; s = String(s).trim().replace(/\s/g, ''); if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.'); var n = parseFloat(s); return isFinite(n) ? n : 0; }
  /* "1h8m", "2h 2m 30s", "6m40s", "1d2h", "1 saat 8 dk", "01:08:00", "4083" (sn) → dakika */
  function dur(s) {
    if (s == null) return 0;
    s = String(s).toLowerCase().replace(/[oO](?=\s*[hmsd])/g, '0').trim();
    var m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (m) return m[3] != null ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60 : (+m[1]) * 60 + (+m[2]);
    var tot = 0, any = false, re = /(\d+(?:[.,]\d+)?)\s*(d|gün|gun|day|days|h|hr|hrs|hour|hours|sa|saat|m|min|mins|minute|minutes|dk|dak|dakika|s|sec|secs|second|seconds|sn|san|saniye)(?![a-zçğıöşü])/g, x;
    while ((x = re.exec(s))) {
      any = true; var v = nf(x[1]), u = x[2];
      if (/^(d|gün|gun|day|days)$/.test(u)) tot += v * 1440;
      else if (/^(h|hr|hrs|hour|hours|sa|saat)$/.test(u)) tot += v * 60;
      else if (/^(m|min|mins|minute|minutes|dk|dak|dakika)$/.test(u)) tot += v;
      else tot += v / 60;
    }
    if (!any && /^\d+$/.test(s)) return +s / 60;   // yalnız saniye (Cura ;TIME:)
    return Math.round(tot * 100) / 100;
  }
  function fmtDur(min) { min = Math.round(CALC.pos(min)); if (!min) return ''; var h = Math.floor(min / 60), m = min % 60; return (h ? h + 'h' : '') + (m || !h ? m + 'm' : ''); }
  var TYPES = ['HYPER PLA', 'PLA-CF', 'PETG-CF', 'PA-CF', 'PA12-CF', 'PLA+', 'PETG', 'ASA+', 'ASA', 'ABS+', 'ABS', 'TPU', 'PLA', 'PA6', 'PA12', 'PA', 'PC', 'PVA', 'HIPS', 'PET', 'NYLON', 'WOOD', 'SILK'];
  function typeOf(s) {
    var u = ' ' + String(s || '').toUpperCase().replace(/[_]/g, ' ').replace(/\s+/g, ' ') + ' ';
    for (var i = 0; i < TYPES.length; i++) {
      var ty = TYPES[i].replace(/[+]/g, '\\+').replace(/-/g, '[- ]?');
      if (new RegExp('[^A-Z0-9]' + ty + '(?![A-Z0-9+])').test(u)) return TYPES[i];
    }
    return '';
  }
  function first(v) { if (Array.isArray(v)) v = v[0]; if (v == null) return ''; v = String(v).replace(/^"|"$/g, '').trim(); var p = v.split(';'); return p[0].trim(); }
  function sumList(v) { return String(v == null ? '' : v).split(/[,;]/).reduce(function (s, x) { return s + nf(x); }, 0); }

  /* ---------------- dosya adı → ad + adet ---------------- */
  function fromName(fn) {
    var s = String(fn || '').replace(/\.(png|jpe?g|webp|bmp|gif|gcode|bgcode|gco|g|3mf|stl|txt)$/i, '').replace(/\.gcode$/i, '');
    if (/^(screenshot|ekran görüntüsü|ekran goruntusu|image|img|photo|whatsapp image|capture|snip|lightshot|unnamed)[\s_-]*/i.test(s) && /\d{4}|\d{2}[-_.]\d{2}/.test(s)) return { name: '', qty: 0 };
    var qty = 0, m;
    var pats = [/\b(?:adet|ad\.?|pcs|pc|qty|x)\s*[:=]?\s*(\d{1,4})\b/i, /\b(\d{1,4})\s*(?:adet|ad\.?|pcs|pc|parça|parca|tane)\b/i, /[\s_-]x(\d{1,4})$/i];
    for (var i = 0; i < pats.length; i++) { m = pats[i].exec(s); if (m) { qty = +m[1]; s = s.replace(m[0], ' '); break; } }
    s = s.replace(/[_\s]*plate[_\s]*\d+$/i, '').replace(/\s*-\s*(kopya|copy)(\s*\(\d+\))?$/i, '').replace(/\(\d+\)$/, '').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
    return { name: s, qty: qty };
  }

  /* ---------------- "anahtar = değer" (G-code başlığı, 3MF ayarları) → sonuç ---------------- */
  function fromKV(kv, r) {
    r = r || blank();
    function g() { for (var i = 0; i < arguments.length; i++) { var v = kv[arguments[i]]; if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return first(v); } return ''; }
    var st = r.settings;
    var prn = g('printer_settings_id', 'printer_model', 'machine_name', 'printer_name', 'printer_notes');
    if (prn) r.printer = r.printer || prn;
    var nz = g('nozzle_diameter', 'machine_nozzle_size', 'nozzle_diameters'); if (nz) st.nozzle = st.nozzle || nf(nz) + ' mm';
    var lh = g('layer_height', 'Layer height'); if (lh) st.layer = st.layer || nf(lh) + ' mm';
    var inf = g('sparse_infill_density', 'fill_density', 'infill_sparse_density'); if (inf) st.infill = st.infill || (/%/.test(inf) ? inf : nf(inf) + (nf(inf) <= 1 && /\./.test(inf) ? '' : '%'));
    if (st.infill && /^0?\.\d+$/.test(st.infill)) st.infill = Math.round(nf(st.infill) * 100) + '%';
    var wl = g('wall_loops', 'perimeters', 'wall_line_count'); if (wl) st.walls = st.walls || wl;
    var es = g('enable_support', 'support_material', 'support_enable');
    if (es !== '') {
      var on = /^(1|true)$/i.test(es);
      var ty = g('support_type', 'support_structure');
      var th = g('support_threshold_angle', 'support_material_threshold', 'support_angle');
      st.supports = st.supports || (on ? (ty || t('imp.on')) + (th && th !== '0' ? ' · ' + th + '°' : '') : t('imp.off'));
    }
    var bed = g('curr_bed_type', 'bed_type', 'default_bed_type'); if (bed) st.plate = st.plate || bed;
    var proc = g('print_settings_id', 'print_profile'); if (proc) st.process = st.process || proc;
    var fs = g('filament_settings_id', 'filament_profile'); if (fs) { st.profile = st.profile || fs; r.filament = r.filament || fs; }
    var ft = g('filament_type', 'material_type'); if (ft) r.filamentType = r.filamentType || ft;
    var nt = g('nozzle_temperature', 'temperature', 'material_print_temperature', 'first_layer_temperature'); if (nt) st.nozzleTemp = st.nozzleTemp || nf(nt) + ' °C';
    var bkey = { 'textured pei plate': 'textured_plate_temp', 'cool plate': 'cool_plate_temp', 'engineering plate': 'eng_plate_temp', 'high temp plate': 'hot_plate_temp', 'smooth pei plate': 'hot_plate_temp' }[String(bed).toLowerCase()];
    var bt = g(bkey || 'hot_plate_temp', 'bed_temperature', 'hot_plate_temp', 'textured_plate_temp', 'material_bed_temperature', 'first_layer_bed_temperature'); if (bt) st.bedTemp = st.bedTemp || nf(bt) + ' °C';
    var sp = g('outer_wall_speed', 'perimeter_speed', 'speed_print'); if (sp) st.speed = st.speed || nf(sp) + ' mm/s';
    var dn = g('filament_density', 'material_density'); if (dn) r.density = r.density || nf(dn);
    var dm = g('filament_diameter', 'material_diameter'); if (dm) r.diameter = r.diameter || nf(dm);
    return r;
  }
  function blank() { return { name: '', qty: 0, grams: 0, modelGrams: 0, meters: 0, printMin: 0, modelMin: 0, prepMin: 0, printer: '', filament: '', filamentType: '', color: '', filaments: [], settings: {}, lines: [], notes: [], raw: '', via: '' }; }

  /* ---------------- G-code ---------------- */
  function parseGcode(txt) {
    var r = blank(), kv = {};
    txt.split(/\r?\n/).forEach(function (ln) {
      if (ln.charAt(0) !== ';') return;
      var m = /^;\s*([A-Za-z_][\w \[\]()\-.]*?)\s*[=:]\s*(.*)$/.exec(ln);
      if (m) { var k = m[1].trim(); if (!(k in kv)) kv[k] = m[2].trim(); }
      var mt = /model printing time:\s*([^;]+);\s*total estimated time:\s*(.+)$/i.exec(ln);
      if (mt) { r.modelMin = dur(mt[1]); r.printMin = dur(mt[2]); }
    });
    function k() { for (var i = 0; i < arguments.length; i++) if (kv[arguments[i]] != null && kv[arguments[i]] !== '') return kv[arguments[i]]; return ''; }
    if (!r.printMin) r.printMin = dur(k('total estimated time', 'estimated printing time (normal mode)', 'estimated printing time', 'PRINT.TIME', 'TIME'));
    var g = k('total filament used [g]', 'filament used [g]', 'total filament weight [g]', 'filament_weight', 'Filament weight');
    r.grams = sumList(g);
    var mm = k('total filament used [mm]', 'filament used [mm]');
    if (mm) r.meters = Math.round(sumList(mm) / 10) / 100;
    var cm = k('Filament used', 'filament used [m]', 'filament_used_m');
    if (!r.meters && cm) r.meters = sumList(String(cm).replace(/m/g, ''));
    var w = (k('filament used [g]') || '').split(/[,;]/).map(nf), wm = (k('filament used [mm]') || '').split(/[,;]/).map(nf);
    var types = String(k('filament_type') || '').split(';'), names = String(k('filament_settings_id') || '').split(';'), cols = String(k('filament_colour', 'extruder_colour') || '').split(';');
    if (w.length > 1) w.forEach(function (gr, i) { if (gr > 0) r.filaments.push({ name: (names[i] || '').replace(/"/g, '').trim(), type: (types[i] || '').trim(), grams: gr, meters: (wm[i] || 0) / 1000, color: (cols[i] || '').trim() }); });
    r.slicer = k('generated by') || (/^;\s*(?:generated by|G-code generated by|Sliced by)\s+([^\n]+)/im.exec(txt) || [])[1] || (/;FLAVOR:/i.test(txt) ? 'Cura' : '');
    if (/;Generated with Cura/i.test(txt)) r.slicer = 'Cura';
    fromKV(kv, r);
    if (r.slicer) r.settings.slicer = String(r.slicer).split(' on ')[0].trim();
    return r;
  }

  /* ---------------- 3MF (zip) ---------------- */
  async function unzip(buf, want) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), i;
    for (i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) break;
    if (i < 0 || dv.getUint32(i, true) !== 0x06054b50) throw new Error('ZIP');
    var cnt = dv.getUint16(i + 10, true), off = dv.getUint32(i + 16, true), out = {}, td = new TextDecoder();
    for (var n = 0; n < cnt && off + 46 <= u8.length; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lo = dv.getUint32(off + 42, true);
      var name = td.decode(u8.subarray(off + 46, off + 46 + nl));
      off += 46 + nl + el + cl;
      if (!want(name)) continue;
      var start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u8.subarray(start, start + csize);
      if (method === 0) out[name] = data;
      else if (method === 8 && typeof DecompressionStream !== 'undefined') out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    return out;
  }
  async function parse3mf(file) {
    var files = await unzip(await file.arrayBuffer(), function (n) { return /^Metadata\/(slice_info\.config|project_settings\.config|plate_\d+\.png|plate_\d+\.gcode|thumbnail\.png|Slic3r_PE\.config)$/i.test(n) || /^Metadata\/thumbnail/i.test(n); });
    var td = new TextDecoder(), r = blank(), kv = {};
    var names = Object.keys(files);
    var gc = names.filter(function (n) { return /\.gcode$/i.test(n); })[0];
    if (gc) r = parseGcode(td.decode(files[gc]));
    var ps = names.filter(function (n) { return /project_settings\.config$/i.test(n); })[0];
    if (ps) { try { kv = JSON.parse(td.decode(files[ps])); } catch (e) { kv = {}; } fromKV(kv, r); }
    var pr = names.filter(function (n) { return /Slic3r_PE\.config$/i.test(n); })[0];
    if (pr) { var k2 = {}; td.decode(files[pr]).split(/\r?\n/).forEach(function (l) { var m = /^;\s*(\w+)\s*=\s*(.*)$/.exec(l); if (m) k2[m[1]] = m[2]; }); fromKV(k2, r); }
    var si = names.filter(function (n) { return /slice_info\.config$/i.test(n); })[0];
    if (si) {
      var x = td.decode(files[si]), pred = 0, wt = 0, fil = [];
      x.replace(/<metadata\s+key="prediction"\s+value="([\d.]+)"/g, function (_, v) { pred += +v; });
      x.replace(/<metadata\s+key="weight"\s+value="([\d.]+)"/g, function (_, v) { wt += +v; });
      x.replace(/<filament\b([^>]*)\/?>/g, function (_, a) {
        function at(k) { var m = new RegExp('\\b' + k + '="([^"]*)"').exec(a); return m ? m[1] : ''; }
        fil.push({ type: at('type'), color: at('color'), grams: nf(at('used_g')), meters: nf(at('used_m')), name: '' });
      });
      if (pred && !r.printMin) r.printMin = pred / 60;
      if (wt && !r.grams) r.grams = wt;
      var merged = {};
      fil.forEach(function (f) { var key = f.type + f.color; if (!merged[key]) { merged[key] = f; } else { merged[key].grams += f.grams; merged[key].meters += f.meters; } });
      var fl = Object.keys(merged).map(function (k) { return merged[k]; }).filter(function (f) { return f.grams > 0; });
      var fsn = Array.isArray(kv.filament_settings_id) ? kv.filament_settings_id : [];
      fl.forEach(function (f, i) { f.name = fsn[i] || ''; });
      if (fl.length) { r.filaments = fl; if (!r.meters) r.meters = fl.reduce(function (s, f) { return s + f.meters; }, 0); if (!r.grams) r.grams = fl.reduce(function (s, f) { return s + f.grams; }, 0); }
      if (!r.filamentType && fl[0]) r.filamentType = fl[0].type;
      if (!r.color && fl[0]) r.color = fl[0].color;
    }
    var png = names.filter(function (n) { return /plate_\d+\.png$/i.test(n); }).sort()[0] || names.filter(function (n) { return /thumbnail.*\.png$/i.test(n); })[0];
    if (png) r.thumb = new File([files[png]], (file.name || 'plate').replace(/\.3mf$/i, '') + '.png', { type: 'image/png' });
    if (!r.settings.slicer) r.settings.slicer = kv.slicer || (si ? 'Orca / Bambu Studio' : ps ? 'Orca' : '');
    return r;
  }

  /* ---------------- ekran görüntüsü metni (OCR / AI) ---------------- */
  /* OCR kelime kutularından satır kur: aynı yükseklikteki kelimeler soldan sağa birleşir (tablo sütunları dahil). */
  function rowsFromWords(words) {
    var ws = (words || []).filter(function (w) { return w && w.t; }).map(function (w) { return { t: w.t, x: +w.x || 0, y: (+w.y || 0) + (+w.h || 0) / 2, h: +w.h || 10 }; }).sort(function (a, b) { return a.y - b.y; });
    var rows = [];
    ws.forEach(function (w) {
      var r = rows.filter(function (r) { return Math.abs(r.y - w.y) < Math.max(r.h, w.h) * 0.55; })[0];
      if (r) { r.ws.push(w); r.y = (r.y * (r.ws.length - 1) + w.y) / r.ws.length; } else rows.push({ y: w.y, h: w.h, ws: [w] });
    });
    return rows.map(function (r) { return r.ws.sort(function (a, b) { return a.x - b.x; }).map(function (w) { return w.t; }).join(' '); });
  }
  function fixOcr(s) {
    return String(s || '').replace(/(\d)\s*[oO](?=\s*[hmsg]\b)/g, '$10').replace(/\b[oO](?=\d)/g, '0').replace(/(\d)[lI](?=\d)/g, '$11').replace(/(\d)\s+([.,])\s*(\d)/g, '$1$2$3')
      .replace(/(\d+)\s*h\s*(\d+)\s*m(?![a-z])/gi, '$1h$2m').replace(/(\d+)\s*m\s*(\d+)\s*s\b/gi, '$1m$2s');
  }
  var TIME = '((?:\\d+\\s*(?:d|h|m|s|sa|dk|sn)\\s*)+|\\d+:\\d{2}(?::\\d{2})?)';
  function parseText(text) {
    var r = blank(); r.raw = text;
    var lines = fixOcr(text).split(/\r?\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var all = lines.join('\n');
    function find(re) { for (var i = 0; i < lines.length; i++) { var m = re.exec(lines[i]); if (m) return { m: m, i: i }; } return null; }
    function after(re, n) { var f = find(re); if (!f) return ''; var rest = lines[f.i].slice(f.m.index + f.m[0].length).replace(/^[\s:：=-]+/, '').trim(); if (!rest && n !== false && lines[f.i + 1]) rest = lines[f.i + 1]; return rest; }
    function mg(re) {
      var f = find(re); if (!f) return null;
      var s = lines[f.i].slice(f.m.index + f.m[0].length) + ' ' + (lines[f.i + 1] || '');
      var mm = /([\d]+(?:[.,]\d+)?)\s*m(?![a-z])/i.exec(s), gg = /([\d]+(?:[.,]\d+)?)\s*g\b/i.exec(s);
      return { m: mm ? nf(mm[1]) : 0, g: gg ? nf(gg[1]) : 0 };
    }
    var tf = mg(/total\s*filament|toplam\s*filament|filament\s*toplam/i), mf = mg(/model\s*filament/i);
    if (tf) { r.grams = tf.g; r.meters = tf.m; }
    if (mf) { r.modelGrams = mf.g; if (!r.grams) r.grams = mf.g; if (!r.meters) r.meters = mf.m; }
    if (!r.grams) { var fu = /filament\s*used[^\n]*?([\d.,]+)\s*g\b/i.exec(all) || /(?:weight|ağırlık|agirlik)[:\s]*([\d.,]+)\s*g\b/i.exec(all); if (fu) r.grams = nf(fu[1]); }
    if (!r.meters) { var fm = /filament\s*used[^\n]*?([\d.,]+)\s*m(?![a-z])/i.exec(all); if (fm) r.meters = nf(fm[1]); }
    function tm(re) { var f = find(new RegExp(re.source + '[^\\d]{0,12}' + TIME, 'i')); return f ? dur(f.m[f.m.length - 1]) : 0; }
    r.prepMin = tm(/(?:prepare|preparation|hazırlık|hazirlik)\s*(?:time|süresi|suresi)?/);
    r.modelMin = tm(/(?:model\s*printing|model\s*print|model\s*baskı|model\s*baski)\s*(?:time|süresi|suresi)?/);
    r.printMin = tm(/(?:total\s*time|total\s*estimated\s*time|toplam\s*süre|toplam\s*sure|estimated\s*printing\s*time|print\s*time|baskı\s*süresi)/);
    if (!r.printMin && r.modelMin) r.printMin = r.modelMin + r.prepMin;
    var p = after(/printer\s*(?:type)?\b|yazıcı(?:\s*türü)?/i); if (p) r.printer = p.replace(/^type[:\s]*/i, '');
    var pl = after(/plate\s*type|tabla\s*(?:türü|tipi)?/i); if (pl) r.settings.plate = pl;
    var proc = after(/^process\b|işlem\b/i); if (proc) r.settings.process = proc;
    var fil = after(/^filament\b(?!\s*(?:used|toplam))/i, false); if (fil && !/^\d/.test(fil)) { r.filament = fil; r.settings.profile = fil; }
    var prof = /\b([a-z0-9]+_[a-z0-9_+]+)\b/i.exec(all.replace(/plate_\d+/ig, '')); if (prof) { r.settings.profile = r.settings.profile || prof[1]; r.filament = r.filament || prof[1]; }
    var nz = /([0-9][.,]\d{1,2})\s*(?:mm)?\s*nozzle/i.exec(all) || /nozzle[^\n\d]{0,20}([0-9][.,]\d{1,2})/i.exec(all); if (nz) r.settings.nozzle = nf(nz[1]) + ' mm';
    var lh = /layer\s*height[^\d]{0,10}([0-9][.,]\d{1,3})/i.exec(all) || /(?:^|\s)([0-9][.,]\d{1,3})\s*mm\b/i.exec(r.settings.process || ''); if (lh) r.settings.layer = nf(lh[1]) + ' mm';
    var inf = /(?:sparse\s*)?infill\s*density[^\d]{0,10}(\d{1,3})\s*%/i.exec(all) || /(?:dolgu|infill)[^\d\n]{0,12}(\d{1,3})\s*%/i.exec(all); if (inf) r.settings.infill = inf[1] + '%';
    var wl = /wall\s*loops[^\d]{0,10}(\d{1,2})/i.exec(all) || /(?:perimeters|duvar)[^\d]{0,10}(\d{1,2})/i.exec(all); if (wl) r.settings.walls = wl[1];
    var sty = /(?:^|\n)\s*type[:\s]+((?:tree|normal|organic|snug|grid)[^\n]*)/i.exec(all), thr = /threshold\s*angle[^\d]{0,10}(\d{1,2})/i.exec(all), en = /enable\s*support[s]?[:\s]*(on|off|yes|no|true|false)?/i.exec(all);
    if (sty || thr) r.settings.supports = (sty ? sty[1].trim() : t('imp.on')) + (thr ? ' · ' + thr[1] + '°' : '');
    else if (en && /off|no|false/i.test(en[1] || '')) r.settings.supports = t('imp.off');
    var ntp = /nozzle\s*(?:temp|temperature|sıcaklığı)[^\d]{0,12}(\d{3})/i.exec(all); if (ntp) r.settings.nozzleTemp = ntp[1] + ' °C';
    var btp = /(?:bed|plate|tabla)\s*(?:temp|temperature|sıcaklığı)[^\d]{0,12}(\d{2,3})/i.exec(all); if (btp) r.settings.bedTemp = btp[1] + ' °C';
    if (/orca/i.test(all)) r.settings.slicer = 'OrcaSlicer'; else if (/bambu/i.test(all)) r.settings.slicer = 'Bambu Studio'; else if (/zaxe/i.test(all) && (tf || r.printMin)) r.settings.slicer = 'Zaxe / Orca';
    var LT = ['Inner wall', 'Outer wall', 'Overhang wall', 'Sparse infill', 'Internal solid infill', 'Top surface', 'Bottom surface', 'Bridge', 'Gap infill', 'Support', 'Support interface', 'Support transition', 'Skirt', 'Brim', 'Prime tower', 'Travel', 'Retract', 'Wipe', 'Seams', 'Custom'];
    lines.forEach(function (l) {
      LT.forEach(function (lt) {
        if (l.toLowerCase().indexOf(lt.toLowerCase()) === 0) {
          var tt = new RegExp(TIME, 'i').exec(l.slice(lt.length)), pc = /([\d.,]+)\s*%/.exec(l), gm = /([\d.,]+)\s*g\b/.exec(l);
          if ((tt || pc) && !r.lines.some(function (x) { return x.type === lt; })) r.lines.push({ type: lt, time: tt ? tt[1].trim() : '', pct: pc ? pc[1] + '%' : '', g: gm ? nf(gm[1]) : 0 });
        }
      });
    });
    r.filamentType = typeOf(r.filament) || typeOf(all);
    return r;
  }
  /* AI JSON yanıtı → sonuç */
  function fromAi(o) {
    var r = blank(); if (!o || typeof o !== 'object') return r;
    r.name = o.name || ''; r.qty = +o.qty || 0;
    r.grams = nf(o.totalGrams || o.grams); r.modelGrams = nf(o.modelGrams); r.meters = nf(o.totalMeters || o.meters);
    r.prepMin = typeof o.prepMin === 'number' ? o.prepMin : dur(o.prepTime || o.prepMin);
    r.modelMin = typeof o.modelMin === 'number' ? o.modelMin : dur(o.modelTime || o.modelMin);
    r.printMin = typeof o.totalMin === 'number' ? o.totalMin : dur(o.totalTime || o.totalMin);
    if (!r.printMin && r.modelMin) r.printMin = r.modelMin + r.prepMin;
    r.printer = o.printer || ''; r.filament = o.filament || o.profile || ''; r.filamentType = typeOf(o.filamentType || '') || o.filamentType || typeOf(r.filament);
    var s = r.settings;
    ['nozzle', 'layer', 'infill', 'walls', 'supports', 'plate', 'process', 'profile', 'speed', 'nozzleTemp', 'bedTemp', 'slicer'].forEach(function (k) { if (o[k] != null && o[k] !== '') s[k] = String(o[k]); });
    if (s.nozzle && /^\d+([.,]\d+)?$/.test(s.nozzle)) s.nozzle += ' mm';
    if (s.layer && /^\d+([.,]\d+)?$/.test(s.layer)) s.layer += ' mm';
    if (Array.isArray(o.filaments)) r.filaments = o.filaments.map(function (f) { return { name: f.name || f.profile || '', type: typeOf(f.type || f.name || '') || f.type || '', grams: nf(f.grams), meters: nf(f.meters), color: f.color || '' }; }).filter(function (f) { return f.grams > 0; });
    if (Array.isArray(o.lineTypes)) r.lines = o.lineTypes.map(function (l) { return { type: l.type || '', time: l.time || '', pct: l.percent || l.pct || '', g: nf(l.grams) }; });
    return r;
  }
  var AI_PROMPT = 'This is a screenshot from a 3D printing slicer (Orca/Bambu/Zaxe/Prusa/Cura) or a print summary. Read it carefully and return ONLY a JSON object with these keys (omit unknown ones): ' +
    '{"totalGrams":number,"modelGrams":number,"totalMeters":number,"prepTime":"e.g. 6m40s","modelTime":"e.g. 1h8m","totalTime":"e.g. 1h15m",' +
    '"printer":"printer type text exactly as shown","nozzle":"0.4","plate":"plate type","filament":"filament profile name as shown","filamentType":"PLA/PETG/ABS/ASA/TPU/PA-CF...",' +
    '"process":"process/quality profile text","layer":"layer height mm","infill":"e.g. 15%","walls":"wall loops","supports":"support type and threshold angle, e.g. tree(auto) · 30°",' +
    '"nozzleTemp":"°C","bedTemp":"°C","slicer":"slicer name","filaments":[{"name":"profile","type":"ABS","grams":0,"meters":0,"color":"#hex"}],' +
    '"lineTypes":[{"type":"Outer wall","time":"10m","percent":"12%","grams":0}]}. Use dot as decimal separator. Do not invent values.';

  /* ---------------- görsel okuma ---------------- */
  async function prepImage(file) {
    // Küçük ekran görüntüleri büyütülür (OCR doğruluğu), çok büyükler küçültülür; PNG kalır (keskin metin).
    return new Promise(function (res) {
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = w < 1400 ? Math.min(2.5, 2000 / w) : Math.min(1, 3600 / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); c.toBlob(function (b) { res(b || file); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  }
  async function ocr(file) {
    var big = await prepImage(file);
    var r = await fetch('/__shell/ocr', { method: 'POST', body: big });
    if (!r.ok) throw new Error((await r.text()) || 'OCR');
    var o = await r.json();
    var rows = rowsFromWords(o.kelimeler);
    return rows.length ? rows.join('\n') : (o.satirlar || []).join('\n');
  }
  async function readImage(file, onStep) {
    var useAi = A.ai && A.ai.canVision && A.ai.canVision() && navigator.onLine !== false;
    var err = null;
    if (useAi) {
      try {
        onStep && onStep(t('imp.stepAi'));
        var out = await A.ai.vision(file, AI_PROMPT);
        var js = /\{[\s\S]*\}/.exec(out.text || '');
        if (js) { var r = fromAi(JSON.parse(js[0])); r.via = out.provider + ' · ' + t('ai.viaOnline'); r.raw = out.text; if (r.grams || r.printMin) return r; }
      } catch (e) { err = e; }
    }
    if (window.MA3D_KABUK) {
      try { onStep && onStep(t('imp.stepOcr')); var txt = await ocr(file); var r2 = parseText(txt); r2.via = t('imp.viaOcr'); if (err) r2.notes.push(t('imp.aiFailed')); return r2; }
      catch (e) { err = e; }
    }
    var r3 = blank(); r3.via = t('imp.viaNone'); r3.notes.push(err ? String(err.message || err) : t('imp.noReader'));
    return r3;
  }

  /* ---------------- dosya → sonuç ---------------- */
  function kindOf(f) {
    var n = String(f.name || '').toLowerCase();
    if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif)$/.test(n)) return 'image';
    if (/\.3mf$/.test(n)) return '3mf';
    if (/\.(gcode|gco|g|txt)$/.test(n)) return 'gcode';
    return '';
  }
  async function analyze(file, onStep) {
    var k = kindOf(file), r;
    if (k === 'image') r = await readImage(file, onStep);
    else if (k === '3mf') { onStep && onStep(t('imp.step3mf')); r = await parse3mf(file); r.via = '3MF'; }
    else if (k === 'gcode') {
      onStep && onStep(t('imp.stepGcode'));
      var head = await file.slice(0, 400000).text(), tail = file.size > 400000 ? await file.slice(Math.max(400000, file.size - 600000)).text() : '';
      r = parseGcode(head + '\n' + tail); r.via = 'G-code';
    } else { r = blank(); r.notes.push(t('imp.unknownType')); }
    r.kind = k; r.file = file;
    var fn = fromName(file.name);
    if (!r.name) r.name = fn.name;
    if (!r.qty) r.qty = fn.qty;
    if (!r.grams && r.meters) r.grams = gramsFromMeters(r.meters, r.diameter, r.density, r.filamentType);
    return r;
  }
  var DENS = { PLA: 1.24, 'PLA+': 1.24, 'HYPER PLA': 1.24, PETG: 1.27, ABS: 1.04, 'ABS+': 1.04, ASA: 1.07, 'ASA+': 1.07, TPU: 1.21, PA: 1.14, 'PA-CF': 1.2, PC: 1.2, PVA: 1.23, HIPS: 1.04 };
  function gramsFromMeters(m, d, rho, type) {
    d = CALC.pos(d) || 1.75; rho = CALC.pos(rho) || DENS[String(type || '').toUpperCase()] || 1.24;
    return Math.round(m * 1000 * Math.PI * (d / 2) * (d / 2) * rho / 1000 * 100) / 100;
  }
  /* birden çok dosya tek işe: ilk dolu değer kalır */
  function mergeAll(list) {
    var r = blank();
    list.forEach(function (x) {
      ['name', 'printer', 'filament', 'filamentType', 'color'].forEach(function (k) { if (!r[k] && x[k]) r[k] = x[k]; });
      ['qty', 'grams', 'modelGrams', 'meters', 'printMin', 'modelMin', 'prepMin'].forEach(function (k) { if (!r[k] && x[k]) r[k] = x[k]; });
      Object.keys(x.settings || {}).forEach(function (k) { if (!r.settings[k] && x.settings[k]) r.settings[k] = x.settings[k]; });
      if (!r.filaments.length && x.filaments.length) r.filaments = x.filaments;
      if (!r.lines.length && x.lines.length) r.lines = x.lines;
      r.notes = r.notes.concat(x.notes || []);
      if (x.raw) r.raw += (r.raw ? '\n\n— ' + (x.file ? x.file.name : '') + ' —\n' : '') + x.raw;
      r.via = r.via ? (r.via.indexOf(x.via) >= 0 ? r.via : r.via + ' · ' + x.via) : x.via;
    });
    r.sources = list;
    return r;
  }

  /* ---------------- eşleştirme ---------------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function matchPrinter(text) {
    var tx = norm(text); if (!tx) return '';
    var best = '', bs = 0;
    S.printers.forEach(function (p) {
      var keys = [p.name, p.model, [p.brand, p.model].filter(Boolean).join(' ')].concat(String(p.aliases || '').split(/[,;\n]/));
      keys.forEach(function (k) { k = norm(k); if (k.length < 2) return; var sc = tx.indexOf(k) >= 0 ? k.length + 10 : k.indexOf(tx) >= 0 ? tx.length : 0; if (sc > bs) { bs = sc; best = p.id; } });
    });
    return best;
  }
  function matchMaterial(f) {
    var type = (typeOf(f.type) || typeOf(f.name) || String(f.type || '').toUpperCase()).trim(), nm = norm(f.name), best = '', bs = 0;
    var fam = f.color ? A.colorFamily(f.color) : '';
    S.materials.forEach(function (m) {
      var sc = 0, mt = String(m.matType || '').toUpperCase().trim() || typeOf(A.catPath(m.categoryId)) || typeOf(m.name);
      if (type && mt === type) sc += 6; else if (type && mt && (mt.replace('+', '') === type.replace('+', ''))) sc += 3;
      if (m.brand && nm.indexOf(norm(m.brand)) >= 0) sc += 3;
      norm(m.name).split(' ').forEach(function (w) { if (w.length > 2 && nm.indexOf(w) >= 0) sc += 1; });
      if (fam && m.color && A.colorFamily(m.color) === fam) sc += 2;
      if (A.stockOf(m.id) > 0) sc += 1;
      if (sc > bs) { bs = sc; best = m.id; }
    });
    return bs >= 6 ? best : '';
  }

  /* ---------------- onay penceresi ---------------- */
  function review(res, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      var fil = res.filaments.length ? res.filaments : [{ name: res.filament, type: res.filamentType, grams: res.grams, meters: res.meters, color: res.color }];
      var imgs = (res.sources || [res]).filter(function (x) { return x.kind === 'image' || x.thumb; });
      var body = ui.el('div.imp-review');
      var side = ui.el('div.imp-side');
      imgs.forEach(function (x) { var u = URL.createObjectURL(x.thumb || x.file); var im = ui.el('img', { src: u, alt: '' }); im.onclick = function () { window.open(u, '_blank'); }; side.appendChild(im); });
      side.appendChild(ui.el('p.muted.small', { html: A.icon('scan') + ' ' + esc(t('imp.via')) + ': <b>' + esc(res.via || '—') + '</b>' }));
      (res.notes || []).forEach(function (n) { side.appendChild(ui.el('div.notice.warn.small', { text: n })); });
      if (res.raw) { var det = ui.el('details.imp-raw'); det.appendChild(ui.el('summary', { text: t('imp.raw') })); det.appendChild(ui.el('pre', { text: res.raw, dir: 'auto' })); side.appendChild(det); }
      body.appendChild(side);
      var f = ui.el('div.imp-form');
      var prnOpts = A.opts(S.printers.slice().sort(A.byName), matchPrinter(res.printer), t('imp.noPrinter'));
      var matSorted = S.materials.slice().sort(function (a, b) { return String(a.matType || '').localeCompare(String(b.matType || '')) || A.byName(a, b); });
      function matLabel(m) { return [m.matType, m.brand, m.name].filter(Boolean).join(' · ') + ' — ' + A.num(A.stockOf(m.id), 2) + ' ' + (A.materials ? A.materials.unitName(m) : ''); }
      var stg = res.settings || {};
      f.innerHTML = '<div class="form-grid">' +
        fl(t('c.name') + ' *', '<input id="iName" value="' + esc(res.name || '') + '">', 'wide') +
        fl(t('c.qty'), '<input id="iQty" type="number" min="1" step="1" value="' + esc(res.qty || 1) + '">') +
        fl(t('imp.totalTime'), '<input id="iTime" value="' + esc(fmtDur(res.printMin)) + '" placeholder="1h15m">', '', t('imp.timeHint')) +
        fl(t('imp.modelTime'), '<input id="iModel" value="' + esc(fmtDur(res.modelMin)) + '" placeholder="1h8m">') +
        fl(t('imp.prepTime'), '<input id="iPrep" value="' + esc(fmtDur(res.prepMin)) + '" placeholder="6m40s">') +
        fl(t('c.printer'), '<select id="iPrn">' + prnOpts + '</select>', '', res.printer ? '“' + res.printer + '”' : '') +
        '<div class="form-sec">' + esc(t('imp.filaments')) + '</div>' +
        '<div class="wide" id="iFil">' + fil.map(function (x, i) {
          var mid = matchMaterial(x);
          return '<div class="imp-fil" data-i="' + i + '"><label class="field"><span class="field-label">' + esc(t('imp.material')) + (x.name || x.type ? ' <small>“' + esc([x.name, x.type].filter(Boolean).join(' · ')) + '”</small>' : '') + '</span><select class="iMat">' + A.opts(matSorted, mid, t('imp.noMaterial'), matLabel) + '</select></label>' +
            '<label class="field"><span class="field-label">' + esc(t('imp.grams')) + '</span><input class="iG" type="number" step="any" value="' + esc(x.grams ? +(+x.grams).toFixed(2) : '') + '"></label>' +
            '<label class="field"><span class="field-label">' + esc(t('imp.meters')) + '</span><input class="iM" type="number" step="any" value="' + esc(x.meters ? +(+x.meters).toFixed(2) : '') + '"></label></div>';
        }).join('') + (res.modelGrams && res.grams && res.modelGrams !== res.grams ? '<p class="field-hint">' + esc(t('imp.modelGrams', { g: A.num(res.modelGrams, 2) })) + '</p>' : '') + '</div>' +
        '<div class="form-sec">' + esc(t('c.slicer')) + '</div>' +
        ['nozzle', 'layer', 'infill', 'walls', 'supports', 'plate', 'process', 'profile', 'speed', 'nozzleTemp', 'bedTemp', 'slicer'].map(function (k) { return fl(t('c.s.' + k), '<input data-s="' + k + '" value="' + esc(stg[k] || '') + '">'); }).join('') +
        (res.lines.length ? '<div class="wide"><details><summary>' + esc(t('imp.lineTypes')) + ' (' + res.lines.length + ')</summary><table class="tbl small"><tbody>' + res.lines.map(function (l) { return '<tr><td>' + esc(l.type) + '</td><td>' + esc(l.time) + '</td><td class="r">' + esc(l.pct) + '</td><td class="r">' + (l.g ? esc(A.num(l.g, 2)) + ' g' : '') + '</td></tr>'; }).join('') + '</tbody></table></details></div>' : '') +
        '<label class="check wide"><input type="checkbox" id="iPhoto"' + (imgs.length ? ' checked' : ' disabled') + '><span>' + esc(t('imp.keepImage')) + '</span></label>' +
        '<label class="check wide"><input type="checkbox" id="iFile"' + ((res.sources || [res]).some(function (x) { return x.kind === 'gcode' || x.kind === '3mf'; }) ? ' checked' : ' disabled') + '><span>' + esc(t('imp.keepFile')) + '</span></label>' +
        '</div>';
      body.appendChild(f);
      function fl(label, inner, cls, hint) { return '<label class="field' + (cls ? ' ' + cls : '') + '"><span class="field-label">' + esc(label) + '</span>' + inner + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</label>'; }
      f.querySelectorAll('.iM').forEach(function (inp) { inp.addEventListener('change', function () { var g = inp.closest('.imp-fil').querySelector('.iG'); if (!CALC.pos(g.value) && CALC.pos(inp.value)) g.value = gramsFromMeters(CALC.pos(inp.value), res.diameter, res.density, res.filamentType); }); });
      ['iModel', 'iPrep'].forEach(function (id) { f.querySelector('#' + id).addEventListener('change', function () { var tt = f.querySelector('#iTime'); if (!dur(tt.value)) tt.value = fmtDur(dur(f.querySelector('#iModel').value) + dur(f.querySelector('#iPrep').value)); }); });

      async function collect() {
        var q = function (s) { return f.querySelector(s); };
        var name = q('#iName').value.trim();
        if (!name) { q('#iName').focus(); A.toast(t('a.required', { f: t('c.name') }), 'bad'); return null; }
        var out = { name: name, qty: Math.max(1, Math.round(CALC.pos(q('#iQty').value)) || 1), printMin: dur(q('#iTime').value) || dur(q('#iModel').value) + dur(q('#iPrep').value), printerId: q('#iPrn').value, settings: {}, photos: [], files: [], materials: [] };
        f.querySelectorAll('[data-s]').forEach(function (i) { if (i.value.trim()) out.settings[i.getAttribute('data-s')] = i.value.trim(); });
        f.querySelectorAll('.imp-fil').forEach(function (row) {
          var g = CALC.pos(row.querySelector('.iG').value), mt = CALC.pos(row.querySelector('.iM').value), id = row.querySelector('.iMat').value;
          if (g || id) { var x = fil[+row.getAttribute('data-i')] || {}; out.materials.push({ materialId: id, grams: g, meters: mt, kgPrice: 0, name: id ? '' : (x.name || ''), matType: id ? '' : (x.type || ''), color: id ? '' : (x.color || '') }); }
        });
        var notes = [];
        var mm = dur(q('#iModel').value), pp = dur(q('#iPrep').value);
        if (mm || pp) notes.push(t('imp.noteTimes', { m: fmtDur(mm) || '—', p: fmtDur(pp) || '—' }));
        if (res.modelGrams && res.modelGrams !== res.grams) notes.push(t('imp.modelGrams', { g: A.num(res.modelGrams, 2) }));
        if (res.printer && !out.printerId) notes.push(t('c.printer') + ': ' + res.printer);
        if (res.lines.length) notes.push(t('imp.lineTypes') + ': ' + res.lines.map(function (l) { return l.type + ' ' + [l.time, l.pct].filter(Boolean).join(' '); }).join(', '));
        out.note = notes.join('\n');
        var src = res.sources || [res];
        if (q('#iPhoto').checked) for (var i = 0; i < src.length; i++) { var s = src[i]; if (s.kind === 'image') out.photos.push(await A.saveImage(s.file, { source: 'slicer' })); else if (s.thumb) out.photos.push(await A.saveImage(s.thumb, { source: 'slicer' })); }
        if (q('#iFile').checked) for (var j = 0; j < src.length; j++) { var sf = src[j]; if (sf.kind === 'gcode' || sf.kind === '3mf') out.files.push(await A.saveAttachment(sf.file, { source: 'slicer' })); }
        return out;
      }
      var btns = [];
      if (o.batch) {
        btns.push({ label: t('imp.stop'), cls: 'ghost', onClick: function () { finish({ action: 'stop' }); } });
        btns.push({ label: t('imp.skip'), onClick: function () { finish({ action: 'skip' }); } });
        btns.push('spacer');
        btns.push({ label: t('imp.openCalc'), onClick: function (close) { collect().then(function (v) { if (v) { finish({ action: 'calc', res: v }); close(); } }); return false; } });
        btns.push({ label: t('imp.saveNext'), icon: 'check', cls: 'primary', onClick: function (close) { collect().then(function (v) { if (v) { finish({ action: 'save', res: v }); close(); } }); return false; } });
      } else {
        btns.push({ label: t('a.cancel'), cls: 'ghost', onClick: function () { finish(null); } });
        btns.push('spacer');
        btns.push({ label: t('imp.apply'), icon: 'check', cls: 'primary', onClick: function (close) { collect().then(function (v) { if (v) { finish({ action: 'apply', res: v }); close(); } }); return false; } });
      }
      ui.modal({ title: (o.title || t('imp.reviewTitle')), icon: 'scan', cls: 'wide.xl', body: body, buttons: btns, onClose: function () { finish(o.batch ? { action: 'stop' } : null); } });
    });
  }

  /* ---------------- dosya seçme penceresi (sürükle-bırak, yapıştır, seç) ---------------- */
  function chooser(o) {
    return new Promise(function (resolve) {
      var done = false, files = [];
      function finish(v) { if (!done) { done = true; document.removeEventListener('paste', onPaste); resolve(v); } }
      var body = ui.el('div');
      var drop = ui.el('div.drop.imp-drop', { html: A.icon('upload') + '<b>' + esc(t('imp.drop')) + '</b><span>' + esc(t('imp.dropHint')) + '</span>' });
      var list = ui.el('div.imp-list');
      body.appendChild(drop); body.appendChild(list);
      body.appendChild(ui.el('p.field-hint', { text: o.batch ? t('imp.batchHint') : t('imp.singleHint') }));
      var src = A.ai && A.ai.canVision && A.ai.canVision() ? t('imp.readerAi', { p: A.ai.providerName() }) : window.MA3D_KABUK ? t('imp.readerOcr') : t('imp.noReader');
      body.appendChild(ui.el('p.muted.small', { html: A.icon('scan') + ' ' + esc(src) }));
      function add(fs) { fs.forEach(function (f) { if (kindOf(f)) files.push(f); else A.toast(t('imp.unknownType') + ': ' + f.name, 'bad'); }); draw(); }
      function draw() { list.innerHTML = files.map(function (f, i) { return '<div class="imp-item"><span>' + A.icon(kindOf(f) === 'image' ? 'image' : 'file') + esc(f.name || t('imp.pasted')) + '</span><small>' + A.num(f.size / 1024, 0) + ' KB</small>' + A.iconBtn('trash', t('a.delete'), 'rm') + '</div>'; }).join(''); A.$$('.rm', list).forEach(function (b, i) { b.onclick = function () { files.splice(i, 1); draw(); }; }); go.disabled = !files.length; }
      drop.onclick = function () { A.pickFiles('image/*,.gcode,.gco,.g,.3mf,.bgcode', true).then(add); };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); add(Array.prototype.slice.call(e.dataTransfer.files || [])); };
      function onPaste(e) {
        var items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
        var got = items.filter(function (it) { return it.kind === 'file'; }).map(function (it) { var f = it.getAsFile(); return f && !f.name ? new File([f], t('imp.pasted') + ' ' + (files.length + 1) + '.png', { type: f.type }) : f; }).filter(Boolean);
        if (got.length) { e.preventDefault(); add(got); }
      }
      document.addEventListener('paste', onPaste);
      var m = ui.modal({ title: o.batch ? t('imp.batchTitle') : t('imp.title'), icon: 'scan', body: body, buttons: [
        { label: t('a.cancel'), cls: 'ghost', onClick: function () { finish(null); } }, 'spacer',
        { label: t('imp.read'), icon: 'scan', cls: 'primary', onClick: function () { finish(files.slice()); } }], onClose: function () { finish(null); } });
      var go = m.el.querySelector('.modal-footer .btn.primary'); if (go) go.disabled = true;
      if (o.files && o.files.length) add(o.files);
    });
  }
  function busy(text) {
    var p = ui.el('p', { text: text });
    var m = ui.modal({ title: t('imp.reading'), icon: 'scan', cls: 'small', body: ui.el('div', null, [ui.el('div.spinner'), p]), buttons: [], dismiss: false });
    return { set: function (s) { p.textContent = s; }, close: function () { m.close(); } };
  }

  /* tek iş: tüm dosyalar tek işe birleşir → cb(res) (Hesapla taslağına) */
  async function open(cb, preset) {
    var files = await chooser({ files: preset });
    if (!files || !files.length) return;
    var b = busy(t('imp.reading')), list = [];
    try { for (var i = 0; i < files.length; i++) { b.set((i + 1) + ' / ' + files.length + ' · ' + files[i].name); list.push(await analyze(files[i], function (s) { b.set((i + 1) + ' / ' + files.length + ' · ' + s); })); } }
    finally { b.close(); }
    var r = await review(mergeAll(list));
    if (r && r.res) cb(r.res);
  }
  /* toplu: her dosya ayrı iş; her biri onaylanınca arşive kaydedilir */
  async function batch(preset) {
    var files = await chooser({ batch: true, files: preset });
    if (!files || !files.length) return;
    var saved = 0;
    for (var i = 0; i < files.length; i++) {
      var b = busy(t('imp.reading')), r;
      try { r = await analyze(files[i], function (s) { b.set((i + 1) + ' / ' + files.length + ' · ' + s); }); } finally { b.close(); }
      var ans = await review(mergeAll([r]), { batch: true, title: t('imp.reviewTitle') + ' · ' + (i + 1) + ' / ' + files.length });
      if (!ans || ans.action === 'stop') break;
      if (ans.action === 'skip') continue;
      var d = A.calc.newDraft(); A.calc.applyImport(d, ans.res); if (!d.name) d.name = ans.res.name;
      if (ans.action === 'calc') { S.draft = d; A.go('calc'); if (saved) A.toast(t('imp.savedN', { n: saved }), 'good'); return; }
      var job = await A.calc.save(d, false, { quiet: true });
      if (job) saved++;
    }
    await A.reload();
    if (saved) A.toast(t('imp.savedN', { n: saved }), 'good');
    A.go('archive');
  }

  A.importer = { open: open, batch: batch, analyze: analyze, chooser: chooser, busy: busy, fmtDur: fmtDur, dur: dur, mergeAll: mergeAll, kindOf: kindOf, fromName: fromName, _parseText: parseText, _parseGcode: parseGcode, _fromName: fromName, _dur: dur, _fromKV: fromKV, _fromAi: fromAi, _rowsFromWords: rowsFromWords, _typeOf: typeOf, _unzip: unzip, _parse3mf: parse3mf, _gramsFromMeters: gramsFromMeters, _matchPrinter: matchPrinter, _matchMaterial: matchMaterial, PROMPT: AI_PROMPT };
})();
