var ReBasic = /^([^:]+):(.+)$/;
var ReTuple = /([a-zA-Z]+)=(.+)/;

var _parseTuple = function(p, i) {
  var match = p.match(ReTuple);
  return match ? [
    match[1].toLowerCase(), match[2]
  ] : ['type' + (i === 0 ? '' : i), p];
};

/**
 * Checks if a line is a 'complex' one, meaning that it has multiple values and
 * metadata.
 * @param {string} line Line to be parsed from a VCF.
 * @return {{key: string, data: {meta, value}}}
 * @private
 */
var parseLine_ = function(line) {
  var parsed = ReBasic.exec(line);
  if (!parsed)
    return null;

  var tuples = parsed[1].split(/[;,]/);
  var key = tuples.shift();
  var meta = {};

  var len = tuples.length;
  for (var i = 0; i < len; i++) {
    var tuple = _parseTuple(tuples[i], i);
    meta[tuple[0]] = tuple[1];
  }

  var value = /[^\s;]/.test(parsed[2]) ? parsed[2].split(';') : [];
  return {
    key: key.toLowerCase(),
    data: {
      meta: meta,
      value: value
    }
  };
};

/**
 * Parse vCard entries split by lines and pass the converted object back to the
 * main thread.
 *
 * @param {string[][]} cardArray Array of array of strings representing vcard
 * @param {function} cb Callback to call on finished
 */
var parseEntries = function(cardArray, cb) {
  var parsedCards = [];
  for (var i = 0; i < cardArray.length; i++) {
    var lines = cardArray[i];
    if (!lines) {
      parsedCards.push(null);
      continue;
    }

    var fields = {};
    var len = lines.length;
    for (var j = 0; j < len; j++) {
      var line = lines[j];
      var parsedLine = parseLine_(line);
      if (parsedLine) {
        if (!fields[parsedLine.key])
          fields[parsedLine.key] = [];

        fields[parsedLine.key].push(parsedLine.data);
      }
    }

    if (!fields.fn && !fields.n) {
      parsedCards.push(null);
      continue;
    }
    parsedCards.push(vcardToContact(fields));
  }

  cb(parsedCards);
};

/**
 * Matches Quoted-Printable characters in a string
 * @type {RegExp}
 */
var qpRegexp = /=([a-zA-Z0-9]{2})/g;

/**
 * Decodes a string encoded in Quoted-Printable format.
 * @param {string} str String to be decoded.
 * @return {string}
 */
var _decodeQuoted = function(str) {
  return decodeURIComponent(
    str.replace(qpRegexp, '%$1'));
};

/**
 * Decodes Quoted-Printable encoding into UTF-8
 * http://en.wikipedia.org/wiki/Quoted-printable
 *
 * @param {object} metaObj Checks for 'encoding' key to be quoted printable.
 * @param {string} value String to be decoded.
 * @return {string}
 */
var decodeQP = function(metaObj, value) {
  var isQP = metaObj && metaObj.encoding &&
    (/quoted-printable/i).test(metaObj.encoding);

  if (isQP)
    value = _decodeQuoted(value);

  return value;
};

var nameParts = [
    'familyName',
    'givenName',
    'additionalName',
    'honorificPrefix',
    'honorificSuffix'
];
/**
 * Takes an object with vCard properties and a mozContact object and returns the
 * latter with the computed name fields properly filled, inferred from
 * `vcardObj`.
 *
 * @param {Object} vcardObj
 * @param {Object} contactObj a mozContact to be filled with name fields.
 * @return {Object}
 */
var processName = function(vcardObj, contactObj) {
  var parts = nameParts;

  // Set First Name right away as the 'name' property
  if (vcardObj.fn && vcardObj.fn.length) {
    var fnMeta = vcardObj.fn[0].meta;
    var fnValue = vcardObj.fn[0].value[0];
    contactObj.name = [decodeQP(fnMeta, fnValue)];
  }

  if (vcardObj.n && vcardObj.n.length) {
    var values = vcardObj.n[0].value;
    var meta = vcardObj.n[0].meta;

    for (var i = 0; i < values.length; i++) {
      var namePart = values[i];
      if (namePart && parts[i])
        contactObj[parts[i]] = [decodeQP(meta, namePart)];
    }

    // If we don't have a contact name at this point, make `name` be the
    // unification of all the name parts.
    if (!contactObj.name)
      contactObj.name = [decodeQP(meta, values.join(' ').trim())];
  }
  contactObj.givenName = contactObj.givenName || contactObj.name;
  return contactObj;
};

var addrParts = [null, null, 'streetAddress', 'locality', 'region',
    'postalCode', 'countryName'
];

/**
 * Takes an object with vCard properties and a mozContact object and returns the
 * latter with the computed address fields properly filled, inferred from
 * `vcardObj`.
 *
 * @param {Object} vcardObj
 * @param {Object} contactObj a mozContact to be filled with name fields.
 * @return {Object}
 */
var processAddr = function(vcardObj, contactObj) {
  if (!vcardObj.adr) return contactObj;

  var parts = addrParts;
  contactObj.adr = [];
  for (var i = 0; i < vcardObj.adr.length; i++) {
    var cur = {};
    var adr = vcardObj.adr[i];
    if (adr.meta && adr.meta.type)
      cur.type = [adr.meta.type];

    for (var j = 2; j < adr.value.length; j++) {
      cur[parts[j]] = decodeQP(adr.meta, adr.value[j]);
    }

    contactObj.adr.push(cur);
  };
  return contactObj;
};
/**
 * Takes an object with vCard properties and a mozContact object and returns the
 * latter with the computed phone, email and url fields properly filled,
 * inferred from `vcardObj`.
 *
 * @param {Object} vcardObj
 * @param {Object} contactObj a mozContact to be filled with name fields.
 * @return {Object}
 */
var processComm = function(vcardObj, contactObj) {
  contactObj.tel = [];

  ['tel', 'email', 'url'].forEach(function field2field(field) {
    if (!vcardObj[field]) return;

    var len = vcardObj[field].length;
    for (var i = 0; i < len; i++) {
      var v = vcardObj[field][i];
      var metaValues = [];
      var cur = {};

      if (v.meta) {
        if (v.value) {
          cur.value = decodeQP(v.meta, v.value[0]);
          cur.value = cur.value.replace(/^tel:/i, '');
        }

        for (var j in v.meta) {
          if (v.meta.hasOwnProperty(j)) {
            if (j === 'pref' || j === 'PREF')
              cur.pref = true;
            metaValues.push(v.meta[j]);
          }
        }

        if (v.meta.type)
          cur.type = [v.meta.type];
      }

      if (!contactObj[field])
        contactObj[field] = [];

      contactObj[field].push(cur);
    }
  });
  return contactObj;
};

var processFields = function(vcardObj, contactObj) {
  ['org', 'title'].forEach(function(field) {
    if (!vcardObj[field]) return;

    var v = vcardObj[field][0];
    if (!v) return;

    if (field === 'title') field = 'jobTitle';

    switch (typeof v) {
      case 'object':
        contactObj[field] = [decodeQP(v.meta, v.value[0])];
        break;
      case 'string':
        contactObj[field] = [v];
        break;
    }
  });
  return contactObj;
};
/**
 * Converts a parsed vCard to a mozContact.
 *
 * @param {Object} vcard JSON representation of an vCard.
 * @return {Object, null} An object implementing mozContact interface.
 */
var vcardToContact = function(vcard) {
  if (!vcard)
    return null;

  var obj = {};
  processName(vcard, obj);
  processAddr(vcard, obj);
  processComm(vcard, obj);
  processFields(vcard, obj);

  return obj;
};

var self = this;
this.addEventListener('message', function(e) {
  parseEntries(e.data, function(parsedEntries) {
    self.postMessage(parsedEntries);
  });
});
