'use strict';

var ContactToVcard;
(function() {
  function ISODateString(d) {
    function pad(n) {return n < 10 ? '0' + n : n}

    return d.getUTCFullYear() + '-' +
      pad(d.getUTCMonth() + 1) + '-' +
      pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + ':' +
      pad(d.getUTCMinutes()) + ':' +
      pad(d.getUTCSeconds()) + 'Z';
  }

  function fromContactField(sourceField, vcardField) {
    if (!sourceField || !sourceField.length)
      return [];

    var str = vcardField;
    return sourceField.map(function(field) {
      var types = [];
      if (field.type && field.type.length) {
        types = types.concat(field.type);
      }

      if (field.pref === true) {
        types.push('pref');
      }

      if (types.length) {
        str += ';type=' + types.join(',');
      }

      return str + ':' + (field.value || '');
    });
  }

  function fromStringArray(sourceField, vcardField) {
    if (!sourceField)
      return '';

    return vcardField + ':' + sourceField.join(',');
  }

  ContactToVcard = function(ct) {
    if (navigator.mozContact && !(ct instanceof navigator.mozContact)) {
      console.error('An instance of mozContact was expected');
      return;
    }

    var n = 'n:' + [
      ct.familyName,
      ct.givenName,
      ct.additionalName,
      ct.honorificPrefix,
      ct.honorificSuffix
    ].map(function(f) { return f ? f.join(',') : ''; }).join(';');

    var allFields = [
      n,
      fromStringArray(ct.name, 'fn'),
      fromStringArray(ct.nickname, 'nickname'),
      fromStringArray(ct.category, 'category'),
      fromStringArray(ct.org, 'org'),
      fromStringArray(ct.jobTitle, 'title'),
      fromStringArray(ct.note, 'note'),
      fromStringArray(ct.key, 'key')
    ];

    if (ct.bday) {
      allFields.push('bday:' + ISODateString(ct.bday));
    }

    allFields.push.apply(allFields, fromContactField(ct.email, 'email'));
    allFields.push.apply(allFields, fromContactField(ct.url, 'url'));
    allFields.push.apply(allFields, fromContactField(ct.tel, 'tel'));

    var adrs = fromContactField(ct.adr, 'adr');
    allFields.push.apply(allFields, adrs.map(function(adrStr, i) {
      var orig = ct.adr[i];
      return adrStr + (['', '', orig.streetAddress || '',
        orig.locality || '', orig.region || '', orig.postalCode || '',
        orig.countryName || ''].join(';'));
    }));

    return allFields.filter(function(f) { return !!f; }).join('\n');
  };
})();
