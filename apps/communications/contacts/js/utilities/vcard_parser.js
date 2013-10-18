/* global mozContact contacts LazyLoader */
'use strict';

var VCFReader = (function _VCFReader() {
  var ReBasic = /^([^:]+):(.+)$/;
  var ReTuple = /([a-zA-Z]+)=(.+)/;

  var _parseTuple = function(p, i) {
    var match = p.match(ReTuple);
    return match ? [match[1].toLowerCase(), match[2]] : ['type', p];
  };

  /**
   * Checks if a line is a 'complex' one, meaning that it has multiple values
   * and metadata.
   * @param {string} line Line to be parsed from a VCF.
   * @return {{key: string, data: {meta, value}}}
   * @private
   */
  var parseLine_ = function(line) {
    var parsed = ReBasic.exec(line);
    if (!parsed) {
      return null;
    }

    var tuples = parsed[1].split(/[;,]/);
    var key = tuples.shift();
    var meta = {
      type: []
    };

    var len = tuples.length;
    for (var i = 0; i < len; i++) {
      var tuple = _parseTuple(tuples[i], i);
      if (tuple[0] === 'type') {
        meta.type.push(tuple[1]);
      } else {
        meta[tuple[0]] = tuple[1];
      }
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
   * Parse vCard entries split by lines and pass the converted object back to
   * the main thread.
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
          if (!fields[parsedLine.key]) {
            fields[parsedLine.key] = [];
          }

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

    if (isQP) {
      value = _decodeQuoted(value);
    }

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
   * Takes an object with vCard properties and a mozContact object and returns
   * the latter with the computed name fields properly filled, inferred from
   * `vcardObj`.
   *
   * @param {Object} vcardObj
   * @param {Object} contactObj a mozContact to be filled with name fields.
   * @return {Object}
   */
  var processName = function(vcardObj, contactObj) {
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
        if (namePart && nameParts[i]) {
          contactObj[nameParts[i]] = [decodeQP(meta, namePart)];
        }
      }

      // If we don't have a contact name at this point, make `name` be the
      // unification of all the name parts.
      if (!contactObj.name) {
        contactObj.name = [decodeQP(meta, values.join(' ').trim())];
      }
    }
    contactObj.givenName = contactObj.givenName || contactObj.name;
    return contactObj;
  };

  var addrParts = [null, null, 'streetAddress', 'locality', 'region',
    'postalCode', 'countryName'
  ];

  /**
   * Takes an object with vCard properties and a mozContact object and returns
   * the latter with the computed address fields properly filled, inferred from
   * `vcardObj`.
   *
   * @param {Object} vcardObj
   * @param {Object} contactObj a mozContact to be filled with name fields.
   * @return {Object}
   */
  var processAddr = function(vcardObj, contactObj) {
    if (!vcardObj.adr) {
      return contactObj;
    }

    contactObj.adr = [];
    for (var i = 0; i < vcardObj.adr.length; i++) {
      var cur = {};
      var adr = vcardObj.adr[i];
      if (adr.meta && adr.meta.type) {
        cur.type = adr.meta.type;
      }

      for (var j = 2; j < adr.value.length; j++) {
        cur[addrParts[j]] = decodeQP(adr.meta, adr.value[j]);
      }

      contactObj.adr.push(cur);
    }
    return contactObj;
  };
  /**
   * Takes an object with vCard properties and a mozContact object and returns
   * the latter with the computed phone, email and url fields properly filled,
   * inferred from `vcardObj`.
   *
   * @param {Object} vcardObj
   * @param {Object} contactObj a mozContact to be filled with name fields.
   * @return {Object}
   */
  var processComm = function(vcardObj, contactObj) {
    contactObj.tel = [];

    ['tel', 'email', 'url'].forEach(function field2field(field) {
      if (!vcardObj[field]) {
        return;
      }

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
              if (j === 'pref' || j === 'PREF') {
                cur.pref = true;
              }
              metaValues.push(v.meta[j]);
            }
          }

          if (v.meta.type) {
            cur.type = v.meta.type;
            if (v.meta.type.indexOf('pref') !== -1 ||
              v.meta.type.indexOf('PREF') !== -1) {
              cur.pref = true;
            }
          }
        }

        if (!contactObj[field]) {
          contactObj[field] = [];
        }

        contactObj[field].push(cur);
      }
    });
    return contactObj;
  };

  var processFields = function(vcardObj, contactObj) {
    ['org', 'title'].forEach(function(field) {
      if (!vcardObj[field]) {
        return;
      }

      var v = vcardObj[field][0];
      if (!v) {
        return;
      }

      if (field === 'title') {
        field = 'jobTitle';
      }

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
    if (!vcard) {
      return null;
    }

    var obj = {};
    processName(vcard, obj);
    processAddr(vcard, obj);
    processComm(vcard, obj);
    processFields(vcard, obj);

    return obj;
  };

  /**
   * Class used to parse vCard files (http://tools.ietf.org/html/rfc6350).
   *
   * @param {String} contents vCard formatted text.
   * @constructor
   */
  var VCFReader = function(contents) {
    this.contents = contents;
    this.processed = 0;
    this.finished = false;
    this.currentChar = 0;
  };

  // Number of contacts processed at a given time.
  VCFReader.CONCURRENCY = 5;

  /**
   * Used to stop contact processing.
   */
  VCFReader.prototype.finish = function() {
    this.finished = true;
  };

  /**
   * Starting point of vcard processing.
   * @param {function} cb Function to call after the process is finished.
   */
  VCFReader.prototype.process = function(cb) {
    /**
     * Calculate the total amount of contacts to be imported. This number could
     * change in case there are vcards with syntax errors or that our processor
     * can't parse.
     */
    this.total = this.contents.match(/end:vcard/gi).length;
    this.onread && this.onread(this.total);
    this.ondone = cb;

    LazyLoader.load(['/shared/js/simple_phone_matcher.js',
      '/contacts/js/contacts_matcher.js',
      '/contacts/js/contacts_merger.js',
      '/contacts/js/merger_adapter.js'
    ], function() {
      // Start processing the text
      this.splitLines();
    }.bind(this));
  };

  /**
   * Called when every contact is effectively saved.
   *
   * @param {Error} err Error object in case there was one.
   * @param {mozContact} ct Contact that has been just saved
   */
  VCFReader.prototype.onParsed = function(err, ct) {
    this.processed += 1;
    this.onimported && this.onimported(ct && ct.name);
    if (this.finished || this.processed === this.total) {
      this.ondone(this.total);
      return;
    }

    if (this.processed < this.total &&
      this.processed % VCFReader.CONCURRENCY === 0) {
      this.splitLines();
    }
  };

  /**
   * This will be called every time we manage to process a contact
   * @param {object[]} contactObjects Objects with contact structure
   */
  VCFReader.prototype.post = function(contactObjects) {
    var _onParsed = this.onParsed.bind(this);
    var cursor = 0;

    function afterSave(e, ct) {
      _onParsed(e, ct);

      cursor += 1;
      if (contactObjects[cursor]) {
        saveContact(contactObjects[cursor]);
      }
    }

    function saveContact(ct) {
      if (!ct) {
        afterSave(null, null);
        return;
      }

      var contact = new mozContact();
      contact.init(ct);
      var matchCbs = {
        onmatch: function(matches) {
          var callbacks = {
            success: function() {
              afterSave(null, contact);
            },
            error: function(e) {
              afterSave(e, contact);
            }
          };
          contacts.adaptAndMerge(contact, matches, callbacks);
        },

        onmismatch: function() {
          VCFReader.save(contact, function(err, item) {
            afterSave(err, contact);
          });
        }
      };

      contacts.Matcher.match(contact, 'passive', matchCbs);
    }

    saveContact(contactObjects[cursor]);
  };

  /**
   * Saves a single raw entry into the phone contacts
   *
   * @param {Object} item represents a single vCard entry.
   * @param {Function} cb Callback.
   */
  VCFReader.save = function(item, cb) {
    var req = navigator.mozContacts.save(item);
    req.onsuccess = function onsuccess() {
      setTimeout(function() {
        cb(null, item);
      }, 200);
    };
    req.onerror = cb;
  };

  var reBeginCard = /begin:vcard$/i;
  var reEndCard = /end:vcard$/i;
  var reVersion = /^VERSION:/i;

  /**
   * Splits vcard text into arrays of lines (one for each vcard field) and
   * sends an array of arrays of lines over to process.
   */
  VCFReader.prototype.splitLines = function() {
    var currentLine = '';
    var inLabel = false;
    var multiline = false;

    var cardArray = [
      []
    ];

    /**
     * Number of cards processed. Quite faster than looking at `cardArray`
     * length.
     * @type {number}
     */
    var cardsProcessed = 0;

    // We start at the last cursor position
    var i = this.currentChar;

    var self = this;

    function callPost(data) {
      self.post.call(self, data);
    }

    for (var l = this.contents.length; i < l; i++) {
      this.currentChar = i;
      var ch = this.contents[i];
      if (ch === '"') {
        inLabel = !inLabel;
        currentLine += ch;
        continue;
      }

      // Ignore beginning whitespace that indicates multiline field.
      if (multiline === true) {
        if (ch === ' ' || ch === '\t') {
          continue;
        } else {
          //currentLine += '\n'
          multiline = false;
        }
      }

      var next = this.contents[i + 1];
      if (inLabel || (ch !== '\n' && ch !== '\r')) {
        // If we have a quoted-printable sign for multiline (/=\n/), ignore it.
        if (ch === '=' && next && next.search(/(\r|\n)/) !== -1) {
          continue;
        }

        currentLine += ch;

        // Continue only if this is not the last char in the string
        if (i !== l - 1) {
          continue;
        }
      }

      // At this point, we know that ch is a newline, and in the vcard format,
      // if we have a space after a newline, it indicates multiline field.
      if (next && (next === ' ' || next === '\t')) {
        multiline = true;
        continue;
      }

      if (reBeginCard.test(currentLine)) {
        currentLine = '';
        continue;
      }

      // If the current line indicates the end of a card,
      if (reEndCard.test(currentLine)) {
        cardsProcessed += 1;
        cardArray.push([]);

        if (cardsProcessed === VCFReader.CONCURRENCY ||
          cardsProcessed === this.total) {
          parseEntries(cardArray, callPost);
          break;
        }

        continue;
      }

      if (currentLine && !reVersion.test(currentLine)) {
        cardArray[cardArray.length - 1].push(currentLine);
      }
      currentLine = '';
    }
  };

  VCFReader._decodeQuoted = _decodeQuoted;
  VCFReader.processAddr = processAddr;
  VCFReader.processName = processName;
  VCFReader.vcardToContact = vcardToContact;

  return VCFReader;
})();
