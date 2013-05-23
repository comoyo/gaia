/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var fbContacts = {};

// Searcher object for FB Data
var _FbDataSearcher = function(variants) {
  var pointer = 0;
  var self = this;
  this.variants = variants;

  window.console.log('Num Variants ', variants.length);

  function checkVariant(variant, successCb, notFoundCb) {
    fb.getContactByNumber(variant, function success(result) {
      var contact = result;

      if (contact) {
        fb.utils.getMozContactByUid(contact.uid, function merge(e) {
          var devContact = e.target.result[0];
          var finalContact = fb.mergeContact(devContact, contact);
          successCb(finalContact, {
            value: variant,
            // Facebook telephone are always of type personal
            type: 'personal',
            // We don't know the carrier from FB phones
            carrier: null
          });
        }, function error_get_mozContact() {
            console.error('Error getting mozContact');
            notFoundCb();
        });
      }
      else {
        notFoundCb();
      }
    }, function error_getContactByNumber() {
        console.error('Error getting FB contacts');
        notFoundCb();
    });
  }

  function successCb(fbContact, matchingTel) {
    self.onsuccess(fbContact, matchingTel);
  }

  function notFoundCb() {
    pointer++;
    if (pointer < self.variants.length) {
      window.console.log('******* Checking variant *****', pointer);
      check(self.variants[pointer]);
    }
    else {
      self.onNotFound();
    }
  }

  function check(variant) {
    checkVariant(variant, successCb, notFoundCb);
  }

  this.start = function() {
    check(self.variants[0]);
  };

};

var Contacts = {

  findByNumber: function findByNumber(number, callback) {
    loader.load(['/contacts/js/fb/fb_data.js',
                 '/contacts/js/fb/fb_contact_utils.js'],
                  this._findByNumber.bind(this, number, callback));
  },

  _findByNumber: function _findByNumber(number, callback) {
    var mozContacts = navigator.mozContacts;
    if (!mozContacts)
      callback(null);

    var request = mozContacts.find( {
        filterBy: ['tel'],
        filterOp: 'match',
        filterValue: number
      });

    request.onsuccess = function findCallback() {
      if (request.result.length === 0) {
        return callback(null);
      }

      var contact = request.result[0];
      var matchingTel = contact.tel[0]; // this needs to come from gecko

      if (fb.isFbLinked(contact)) {
        // Merge with the FB data
        var req = fb.contacts.get(fb.getFriendUid(contact));
        req.onsuccess = function() {
          callback(fb.mergeContact(contact, req.result), matchingTel);
        };
        req.onerror = function() {
          window.console.error('Error while getting FB Data');
          callback(contact, matchingTel);
        };
      }
      else {
        callback(contact, matchingTel);
      }
    };
    request.onerror = function findError() {
      callback(null);
    };
  },

  findListByNumber: function findListByNumber(number, limit, callback) {
    if (!navigator.mozContacts) {
      callback(null);
      return;
    }

    var self = this;
    asyncStorage.getItem('order.lastname', function(value) {
      var sortKey = value ? 'familyName' : 'givenName';

      var options = {
        filterBy: ['tel'],
        filterOp: 'contains',
        filterValue: number,
        sortBy: sortKey,
        sortOrder: 'ascending',
        filterLimit: limit
      };

      var req = navigator.mozContacts.find(options);
      req.onsuccess = function onsuccess() {
        callback(req.result);
      };

      req.onerror = function onerror() {
        var msg = 'Contact finding error. Error: ' + req.errorCode;
        callback(null);
      };
    });
  }
};
