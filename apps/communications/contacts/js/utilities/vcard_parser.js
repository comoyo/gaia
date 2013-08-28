'use strict';


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
  this.stillToProcess = 0;

  var self = this;
  this.worker = new Worker('/contacts/js/utilities/vcard_worker.js');
  //this.worker = new Worker('vcard_worker.js');

  this.worker.onmessage = function(oEvent) {
    self.post(oEvent.data);
  };
};

// Number of contacts processed at a given time.
VCFReader.CONCURRENCY = 25;

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

  // Start processing the text
  this.splitLines();
};

/**
 * Called when every contact is effectively saved.
 *
 * @param {Error} err Error object in case there was one.
 * @param {mozContact} ct Contact that has been just saved
 */
VCFReader.prototype.onParsed = function(ct) {
  this.onimported && this.onimported(ct);
  this.processed += 1;
  if (this.finished || this.processed === this.total) {
    this.ondone(this.total);
    return;
  }

  if (this.stillToProcess > 0) {
    this.stillToProcess -= 1;
  }

  if (this.processed < this.total && this.stillToProcess === 0) {
    var self = this;
    setTimeout(function() {
      self.splitLines.call(self);
    });
  }
};

/**
 * This will be called every time the worker manages to process a contact,
 * with the stringified contact object.
 * @param {object[]} contactObjects Objects with contact structure
 */
VCFReader.prototype.post = function(contactObjects) {
  for (var i = 0; i < contactObjects.length; i++) {
    var contact = new mozContact();
    contact.init(contactObjects[i]);
    //var contact = contactObjects[i]
    VCFReader.save.call(this, contact);
  };
};
/**
 * Saves a single raw entry into the phone contacts
 *
 * @param {Object} item represents a single vCard entry.
 * @param {Function} cb Callback.
 */
VCFReader.save = function(contact) {
  var req = navigator.mozContacts.save(contact);
  req.onsuccess =
  req.onerror = this.onParsed.bind(this);
  //var self = this;
  //setTimeout(function() {
    //self.onParsed(null, contact)
  //});
};

var reBeginCard = /begin:vcard$/i;
var reEndCard = /end:vcard$/i;
var reVersion = /^VERSION:/i;

/**
 * Splits vcard text into arrays of lines (one for each vcard field) and sends
 * an array of arrays of lines over to process.
 */
VCFReader.prototype.splitLines = function() {
  var currentLine = '';
  var inLabel = false;

  var cardArray = [
    []
  ];

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
      if (cardArray.length === VCFReader.CONCURRENCY) {
        this.stillToProcess = cardArray.length;
        this.worker.postMessage(cardArray);
        break;
      }

      cardArray.push([]);
      continue;
    }

    if (currentLine && !reVersion.test(currentLine)) {
      cardArray[cardArray.length - 1].push(currentLine);
    }

    currentLine = '';
  }
};
