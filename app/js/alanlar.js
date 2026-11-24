/* Kullanıcı tanımlı ek alanlar (Ayarlar → Özel alanlar): malzeme, iş/arşiv, yazıcı, müşteri formlarına eklenir.
   {id, entity:'material'|'job'|'printer'|'customer', name, type:'text'|'number'|'date'|'select'|'check', options:'a, b, c', order} */
(function () {
  'use strict';
  var A = window.APP, t = A.t;
  function defs(entity) { return A.S.fields.filter(function (f) { return f.entity === entity; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
  function formFields(entity, values) {
    var d = defs(entity); if (!d.length) return [];
    var cf = (values && values.custom) || {};
    var out = [{ type: 'section', label: t('f.custom') }];
    d.forEach(function (f) {
      var v = cf[f.id];
      if (f.type === 'select') out.push({ k: 'cf_' + f.id, label: f.name, type: 'select', value: v, options: [{ v: '', l: '—' }].concat(String(f.options || '').split(',').map(function (s) { s = s.trim(); return { v: s, l: s }; }).filter(function (o) { return o.v; })) });
      else if (f.type === 'check') out.push({ k: 'cf_' + f.id, label: f.name, type: 'check', value: !!v });
      else out.push({ k: 'cf_' + f.id, label: f.name, type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text', value: v });
    });
    return out;
  }
  function read(entity, v) {
    var o = {};
    defs(entity).forEach(function (f) { if (('cf_' + f.id) in v) o[f.id] = v['cf_' + f.id]; });
    return o;
  }
  function show(entity, rec) {
    var cf = (rec && rec.custom) || {};
    return defs(entity).filter(function (f) { return cf[f.id] !== undefined && cf[f.id] !== '' && cf[f.id] !== false; })
      .map(function (f) { return [f.name, f.type === 'check' ? '✓' : f.type === 'date' ? A.date(cf[f.id]) : String(cf[f.id])]; });
  }
  A.fields = { defs: defs, formFields: formFields, read: read, show: show };
})();
