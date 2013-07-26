'use strict;'
require('/shared/test/unit/mocks/mock_contact_all_fields.js');
require('/shared/js/contact2vcard.js');

suite('mozContact to vCard', function() {
  var mockContact;

  suiteSetup(function() {


  });

  suiteTeardown(function() {
//    window.Contacts = realContacts;
  });

  setup(function() {
    mockContact = new MockContactAllFields();
  });


  teardown(function() {
  });

  suite('mozContact to vCard', function() {

    test('Convert a single contact to a vcard', function() {
      var mockContact = new MockContactAllFields();
      var vcard = ContactToVcard(mockContact);
//      VCFReader.nameParts = [
//        'familyName',
//        'givenName',
//        'additionalName',
//        'honorificPrefix',
//        'honorificSuffix'
//      ];
//      console.log(Object.keys(assert))
      assert.ok(vcard)

    });
  });
});
