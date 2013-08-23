'use strict';

/**
 * Class used to parse vCard files.
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

VCFReader.worker = new Worker('/contacts/js/utilities/vcard_worker.js');

// Number of contacts processed in parallel
VCFReader.CHUNK_SIZE = 10;

VCFReader.prototype.finish = function() {
  this.finished = true;
};

VCFReader.prototype.process = function(cb) {
  var self = this;

  // Calculate the total amount of contacts to be imported. This number could
  // change in case there are vcards with syntax errors or that our processor
  // can't parse.
  var total = this.contents.match(/end:vcard/gi).length;
  this.onread && this.onread(total);

  // Start processing the text
  this.splitLines(VCFReader.CHUNK_SIZE);

  VCFReader.worker.onerror = function(e) {
    total -= 1;
  };

  /**
   * This will be called every time the worker manages to process a contact,
   * with the stringified contact object.
   * @param {object} oEvent Event coming from the worker
   */
  VCFReader.worker.onmessage = function(oEvent) {
   var contact = new mozContact();
    contact.init(JSON.parse(oEvent.data));
    VCFReader.save(contact, onParsed);
  };

  function onParsed(err, ct) {
    self.onimported && self.onimported();
    self.processed += 1;

    if (self.finished || self.processed === total) {
      cb(total);
      return;
    }

    if (self.processed < total && self.processed % VCFReader.CHUNK_SIZE === 0) {
      self.splitLines(VCFReader.CHUNK_SIZE);
    }
  }
};

/**
 * Saves a single raw entry into `Contacts`
 *
 * @param {Object} item represents a single vCard entry.
 * @param {Function} cb Callback.
 */
VCFReader.save = function(item, cb) {
  var req = navigator.mozContacts.save(item);
  req.onsuccess = function onsuccess() { cb(null, item); };
  req.onerror = cb;
};

VCFReader.prototype.splitLines = function(bandWidth) {
  var currentStr = '';
  var inLabel = false;
  var card = [];

  var cardsSent = 0;
  var vcf = this.contents;
  var i = this.currentChar;
  for (var l = vcf.length; i < l; i++) {
    if (vcf[i] === '"') {
      inLabel = !inLabel;
      currentStr += vcf[i];
      continue;
    }

    // If we are inside a label or the char is not a newline, add char
    if (inLabel || !(/(\n|\r)/.test(vcf[i]))) {
      currentStr += vcf[i];
      continue;
    }

    var sub = vcf.substring(i + 1, vcf.length - 1);
    // If metadata contains a label attribute and there are no newlines until
    // the ':' separator, add char
    if (currentStr.search(/label;/i) !== -1 &&
      sub.search(/^[^\n\r]+:/) === -1) {
      currentStr += vcf[i];
      continue;
    }

    if (sub.search(/^[^\S\n\r]+/) !== -1) {
      continue;
    }

    if (currentStr.search(/begin:vcard/i) != -1) {
      currentStr = '';
      continue;
    }

    // If the current line indicates the end of a card,
    if (currentStr.search(/end:vcard/i) != -1) {
      VCFReader.worker.postMessage(card);
      cardsSent += 1;

      if (cardsSent === bandWidth) {
        break;
      }

      continue;
    }

    card.push([currentStr]);
    currentStr = '';
  }

  this.currentChar = i;
};
