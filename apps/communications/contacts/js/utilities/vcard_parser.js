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

//VCFReader.worker = new Worker('/contacts/js/utilities/vcard_worker.js');
VCFReader.worker = new Worker('vcard_worker.js');

// Number of contacts processed by a worker at a given time.
VCFReader.CONCURRENCY = 15;

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
  this.splitLines();

  VCFReader.worker.onerror = function(e) {
    total -= 1;
  };

  /**
   * This will be called every time the worker manages to process a contact,
   * with the stringified contact object.
   * @param {object} oEvent Event coming from the worker
   */
  VCFReader.worker.onmessage = function(oEvent) {
    oEvent.data.forEach(function(contact) {
//    var contact = new mozContact();
//    contact.init(oEvent.data);
      VCFReader.save(contact, onParsed);
    });
  };

  function onParsed(err, ct) {
    self.onimported && self.onimported();
    self.processed += 1;
    if (self.finished || self.processed === total) {
      cb(total);
      return;
    }

    if (self.processed < total &&
      self.processed % VCFReader.CONCURRENCY === 0) {
      self.splitLines();
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
//  var req = navigator.mozContacts.save(item);
//  req.onsuccess = function onsuccess() { cb(null, item); };
//  req.onerror = cb;
  setTimeout(function onsuccess() { cb(null, item); }, 0)
};

var reBeginCard = /begin:vcard$/i;
var reEndCard = /end:vcard$/i;
var reVersion = /^VERSION:/i;
VCFReader.prototype.splitLines = function() {
  var currentLine = '';
  var inLabel = false;

  /**
   * Array of cards to be sent to the Worker.
   * @type {String[][]}
   */
  var cardArray = [
    []
  ];

  /**
   * Number of cards processed. Quite faster than looking at `cardArray` length.
   * @type {number}
   */
  var cardsProcessed = 0;
  var i = this.currentChar;

  for (var l = this.contents.length; i < l; i++) {
    var ch = this.contents[i];
    if (ch === '"') {
      inLabel = !inLabel;
      currentLine += ch;
      continue;
    }

    // If we are inside a label or the char is not a newline, add char
    if (inLabel || (ch !== '\n' && ch !== '\r')) {
      currentLine += ch;
      continue;
    }

//    var sub = this.contents.substring(i + 1, this.contents.length - 1);
    // If metadata contains a label attribute and there are no newlines until
    // the ':' separator, add char
//    if (currentStr.search(/label;/i) !== -1 &&
//      sub.search(/^[^\n\r]+:/) === -1) {
//      currentStr += ch;
//      continue;
//    }

    var next = this.contents[i + 1];
    if (next && (next === ' ' || next === '\t')) {
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

      if (cardsProcessed === VCFReader.CONCURRENCY) {
        VCFReader.worker.postMessage(cardArray);
        break;
      }

      continue;
    }

    if (currentLine && !reVersion.test(currentLine)) {
      cardArray[cardArray.length - 1].push([currentLine]);
    }

    currentLine = '';
  }

  this.currentChar = i;
};
