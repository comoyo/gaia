'use strict';
/*global requireApp suite Contacts suiteSetup teardown suiteTeardown test assert
    EventEmitter MessageManagerCtor setup */

/**
 * The MessageManager gets data from a variety of sources,
 * most important is of course SMS but we want to be prepared for the future.
 * This test suite makes sure the manager handles all sources equally
 */
requireApp('sms/js/event_emitter.js');
requireApp('sms/js/message_manager.js');

suite('Message Manager', function() {
  function stub(additionalCode, ret) {
    if (additionalCode && typeof additionalCode !== 'function')
      ret = additionalCode;

    var nfn = function() {
      nfn.callCount++;
      nfn.calledWith = [].slice.call(arguments);

      if (typeof additionalCode === 'function')
        additionalCode.apply(this, arguments);

      return ret;
    };
    nfn.callCount = 0;
    return nfn;
  }

  var MessageManager, Contacts, ThreadUI, ThreadListUI, Utils, messaging;

  suiteSetup(function() {
  });

  setup(function() {
    Contacts = {
      additionalFields: []
    };
    ThreadUI = {};
    ThreadListUI = {
      container: document.createElement('div'),
      renderThreads: stub(function(threads, cb) {
        cb && cb();
      })
    };
    Utils = {};
    messaging = {
      sms: new EventEmitter(),
      facebook: new EventEmitter(),
      whatsapp: new EventEmitter()
    };

    MessageManager = new MessageManagerCtor(Contacts, ThreadUI,
                                            ThreadListUI, Utils, messaging);
  });

  teardown(function() {
  });

  suiteTeardown(function() {
  });

  suite('Initialization', function() {

    test('Contacts additionalFields', function(done) {
      messaging.sms.handles = ['tel'];
      messaging.facebook.handles = ['facebook', 'email'];
      messaging.whatsapp.handles = ['tel'];

      MessageManager.init(function() {
        assert.equal(Contacts.additionalFilters.length, 3);
        assert.equal(Contacts.additionalFilters[0], 'tel');
        assert.equal(Contacts.additionalFilters[1], 'facebook');
        assert.equal(Contacts.additionalFilters[2], 'email');

        done();
      });
    });

    test('Attach event listeners', function(done) {
      MessageManager.init(function() {
        assert.equal(Object.keys(messaging.sms._handlers).length, 4);
        assert.equal(messaging.facebook._handlers['sending'].length, 1);
        assert.equal(messaging.whatsapp._handlers['sent'].length, 1);
        assert.equal(messaging.sms._handlers['received'].length, 1);
        assert.equal(messaging.facebook._handlers['failed'].length, 1);

        done();
      });
    });
  });

  suite('Event handling', function() {
    setup(function(done) {
      MessageManager.init(done);
    });

    teardown(function() {
    });

    test('Handlers get type information', function(done) {
      var fakeEv = { foo: 'bar' };

      var c = 0;
      var cb = function() {
        if (++c === 4) done();
      };

      MessageManager.onMessageReceived = function(src, ev) {
        assert.equal(this, MessageManager);
        assert.equal(src, 'whatsapp');
        assert.equal(ev, fakeEv);
        cb();
      };
      MessageManager.onMessageSending = function(src, ev) {
        assert.equal(this, MessageManager);
        assert.equal(src, 'facebook');
        assert.equal(ev, fakeEv);
        cb();
      };
      MessageManager.onMessageSent = function(src, ev) {
        assert.equal(this, MessageManager);
        assert.equal(src, 'sms');
        assert.equal(ev, fakeEv);
        cb();
      };
      MessageManager.onMessageFailed = function(src, ev) {
        assert.equal(this, MessageManager);
        assert.equal(src, 'whatsapp');
        assert.equal(ev, fakeEv);
        cb();
      };

      messaging.whatsapp.emit('received', fakeEv);
      messaging.facebook.emit('sending', fakeEv);
      messaging.sms.emit('sent', fakeEv);
      messaging.whatsapp.emit('failed', fakeEv);
    });

    test('onMessageSending should append channel info', function(done) {
      MessageManager.getThreads = function() {};
      ThreadUI.appendMessage = function(msg) {
        assert.equal(msg.hi, 1);
        assert.equal(msg.channel, 'facebook');
        done();
      };
      ThreadUI.scrollViewToBottom = function() {};

      MessageManager.onMessageSending('facebook', { message: { hi: 1 }});
    });

    test('onMessageSent should append channel info', function(done) {
      ThreadUI.onMessageSent = function(msg) {
        assert.equal(msg.hi, 3);
        assert.equal(msg.channel, 'sms');
        done();
      };

      MessageManager.onMessageSent('sms', { message: { hi: 3 }});
    });

    test('onMessageReceived should append channel info', function(done) {
      MessageManager.markMessagesRead = function(a, b, c, cb) {};
      ThreadUI.appendMessage = function(msg) {
        assert.equal(msg.hi, 4);
        assert.equal(msg.channel, 'whatsapp');
      };
      ThreadUI.scrollViewToBottom = function() {};
      Utils.updateTimeHeaders = function() {
        done();
      };

      MessageManager.currentThread = '0611';
      MessageManager.onMessageReceived('whatsapp', {
        message: {
          hi: 4,
          sender: '0611',
          delivery: 'received',
          threadId: '0611'
        }
      });
    });

    test('onMessageFailed should append channel info', function(done) {
      ThreadUI.onMessageFailed = function(msg) {
        assert.equal(msg.hi, 3);
        assert.equal(msg.channel, 'sms');
        done();
      };

      MessageManager.onMessageFailed('sms', { message: { hi: 3 }});
    });
  });

  suite('Get threads', function() {
    setup(function(done) {
      MessageManager.init(done);
    });

    var createCursor = function(msgs) {
      var fn = function() {
        fn.callCount++;
        var proxy = {};
        var getNext = function() {
          setTimeout(function() {
            proxy.result = msgs.pop();
            proxy.onsuccess();
          });
        };
        getNext();
        proxy.continue = getNext;

        return proxy;
      };
      fn.callCount = 0;
      return fn;
    };

    test('Should call getThreads on all implementations', function(done) {
      var callCount = 0;
      messaging.facebook.getThreads =
        messaging.whatsapp.getThreads =
        messaging.sms.getThreads =
          function() {
            callCount++;
            var proxy = {};
            setTimeout(function() {
              proxy.onsuccess({target: {result: []}});
            });
            return proxy;
          };

      MessageManager.getThreads(function() {
        assert.equal(callCount, 3);
        done();
      });
    });

    test('Should call getMessages on all implementations', function(done) {
      var gm =
        messaging.facebook.getMessages =
        messaging.whatsapp.getMessages =
        messaging.sms.getMessages =
          createCursor([]);

      MessageManager.getMessages({
        endCB: function() {
          assert.equal(gm.callCount, 3);
          done();
        }
      });
    });

    test('GetMessages should aggregate', function(done) {
      messaging.facebook.getMessages = createCursor([{ id: 1 }, { id: 2 }]);
      messaging.whatsapp.getMessages = createCursor([{ id: 3 }]);
      messaging.sms.getMessages = createCursor([{ id: 4 }, { id: 5 }]);

      var res = [];
      MessageManager.getMessages({
        stepCB: function(msg) {
          res.push(msg);
        },
        endCB: function() {
          // check length
          assert.equal(res.length, 5);
          // verify that there is channel info
          assert.equal(res.filter(function(m) {
            return m.id === 4;
          })[0].channel, 'sms');
          done();
        }
      });
    });

    // @todo: GetThreads should aggregate between variety of sources

  });

  suite('Single messages', function() {
    setup(function(done) {
      MessageManager.init(done);
    });

    test('Send should be handled by implementation', function(done) {
      messaging.sms.send = function(number, text) {
        assert.equal(number, 9876);
        assert.equal(text, 'Whatsup!');

        var proxy = {};
        setTimeout(function() {
          proxy.result = 'yeswecan';
          proxy.onsuccess();
        });
        return proxy;
      };

      MessageManager.send('sms', 9876, 'Whatsup!', function(r) {
        assert.equal(r, 'yeswecan');
        done();
      });
    });

    test('Delete should be handled by implementation', function(done) {
      messaging.facebook.delete = function(id) {
        assert.equal(id, 678);

        var proxy = {};
        setTimeout(function() {
          proxy.result = 'jan';
          proxy.onsuccess();
        });
        return proxy;
      };

      MessageManager.deleteMessage('facebook', 678, function(r) {
        assert.equal(r, 'jan');
        done();
      });
    });

    test('Delete multiple should delete multiple', function(done) {
      messaging.facebook.delete = function(id) {
        messaging.facebook.delete.callCount++;
        var proxy = {};
        setTimeout(function() {
          proxy.onsuccess();
        });
        return proxy;
      };
      messaging.facebook.delete.callCount = 0;

      MessageManager.deleteMessages('facebook', [1, 2, 3, 4], function() {
        assert.equal(messaging.facebook.delete.callCount, 4);
        done();
      });
    });

    test('markMessagesRead handled by implementation', function(done) {
      messaging.facebook.markMessageRead = function(id, val) {
        assert.equal(val, true);
        messaging.facebook.markMessageRead.callCount++;
        var proxy = {};
        setTimeout(function() {
          proxy.onsuccess();
        });
        return proxy;
      };
      messaging.facebook.markMessageRead.callCount = 0;

      MessageManager.markMessagesRead('facebook', [9, 8, 5], true, function() {
        assert.equal(messaging.facebook.markMessageRead.callCount, 3);
        done();
      });
    });
  });

  suite('Incoming messages', function() {
    teardown(function() {
      document.querySelector('body').innerHTML = '';
    });

    test('createThreadMockup for incoming receive message', function(done) {
      var mockup = MessageManager.createThreadMockup({
        delivery: 'received',
        sender: '061234',
        receiver: '9876',
        body: 'Hi Im Jan',
        timestamp: new Date(2012, 12, 21)
      });

      assert.equal(mockup.participants[0], '061234');
      assert.equal(mockup.body, 'Hi Im Jan');
      assert.equal(mockup.unreadCount, 1);
      assert.equal(Number(mockup.timestamp), Number(new Date(2012, 12, 21)));
      done();
    });

    test('createThreadMockup for incoming sent message', function(done) {
      var mockup = MessageManager.createThreadMockup({
        delivery: 'sent',
        sender: '061234',
        receiver: '9876',
        body: 'Hi Im Jan',
        timestamp: new Date(2012, 12, 21),
        read: false
      });

      assert.equal(mockup.participants[0], '9876');
      assert.equal(mockup.body, 'Hi Im Jan');
      assert.equal(mockup.unreadCount, 1);
      assert.equal(Number(mockup.timestamp), Number(new Date(2012, 12, 21)));
      done();
    });

    test('createThreadMockup for incoming read sent message', function(done) {
      var mockup = MessageManager.createThreadMockup({
        delivery: 'sent',
        sender: '061234',
        receiver: '9876',
        read: true
      });

      assert.equal(mockup.unreadCount, 0);
      done();
    });

    test('onMessageReceived append in detail screen, receive', function(done) {
      var fakeMessage = {
        delivery: 'received',
        sender: '123456',
        receiver: '987655',
        threadId: '4'
      };

      MessageManager.markMessagesRead = stub(function(a, b, c, cb) {
        cb();
      });
      MessageManager.getThreads = stub();
      ThreadUI.appendMessage = stub();
      ThreadUI.scrollViewToBottom = stub();
      Utils.updateTimeHeaders = stub();
      ThreadListUI.appendThread = stub();

      MessageManager.currentThread = '4';
      MessageManager.onMessageReceived('sms', { message: fakeMessage });

      assert.equal(MessageManager.markMessagesRead.callCount, 1);
      assert.equal(ThreadUI.appendMessage.callCount, 1);
      assert.equal(ThreadUI.appendMessage.calledWith[0], fakeMessage);
      assert.equal(ThreadUI.scrollViewToBottom.callCount, 1);
      assert.equal(MessageManager.getThreads.callCount, 1, 'getThreads');
      assert.equal(Utils.updateTimeHeaders.callCount, 1);
      assert.equal(ThreadListUI.appendThread.callCount, 0);

      done();
    });

    test('onMessageReceived append in detail screen, sent', function(done) {
      var fakeMessage = {
        delivery: 'sent',
        sender: '123456',
        receiver: '987654',
        threadId: '4'
      };

      MessageManager.markMessagesRead = stub(function(a, b, c, cb) {
        cb();
      });
      MessageManager.getThreads = stub();
      ThreadUI.appendMessage = stub();
      ThreadUI.scrollViewToBottom = stub();
      Utils.updateTimeHeaders = stub();
      ThreadListUI.appendThread = stub();

      MessageManager.currentThread = '4';
      MessageManager.onMessageReceived('sms', { message: fakeMessage });

      assert.equal(MessageManager.markMessagesRead.callCount, 1);
      assert.equal(ThreadUI.appendMessage.callCount, 1);
      assert.equal(ThreadUI.appendMessage.calledWith[0], fakeMessage);
      assert.equal(ThreadUI.scrollViewToBottom.callCount, 1);
      assert.equal(MessageManager.getThreads.callCount, 1, 'getThreads');
      assert.equal(Utils.updateTimeHeaders.callCount, 1);
      assert.equal(ThreadListUI.appendThread.callCount, 0);

      done();
    });

    test('onMessageReceived append in empty overview', function(done) {
      var msg = {
        delivery: 'received',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour'
      };

      MessageManager.createThreadMockup = stub();
      ThreadListUI.renderThreads = stub();
      // no messages at the moment
      ThreadListUI.container = document.createElement('div');

      MessageManager.currentNum = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.renderThreads.callCount, 1);

      done();
    });

    test('onMessageReceived append in overview, new', function(done) {
      var msg = {
        delivery: 'received',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour'
      };

      var threadMockup = {
        senderOrReceiver: '123456',
        timestamp: new Date(1988, 8, 31)
      };

      MessageManager.createThreadMockup = stub(threadMockup);
      ThreadListUI.appendThread = stub();
      ThreadListUI.container = document.createElement('div');
      // we don't have this thread anywere
      ThreadListUI.container.innerHTML = '<ul></ul>';

      MessageManager.currentNum = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.appendThread.callCount, 1);
      assert.equal(ThreadListUI.appendThread.calledWith[0], threadMockup);

      done();
    });

    test('onMessageReceived append in overview, existing (1)', function(done) {
      var msg = {
        delivery: 'received',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour',
        threadId: '123456'
      };

      var threadMockup = {
        participants: ['123456'],
        timestamp: new Date(1988, 8, 31),
        threadId: '123456'
      };

      MessageManager.createThreadMockup = stub(threadMockup);
      ThreadListUI.appendThread = stub();
      ThreadListUI.container = document.createElement('div');
      ThreadListUI.container.id = 'test';
      ThreadListUI.container.innerHTML =
        '<header/><ul id="thread_123456"><a/></ul>';

      document.querySelector('body').appendChild(ThreadListUI.container);

      MessageManager.currentThread = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.appendThread.callCount, 1);
      assert.equal(ThreadListUI.appendThread.calledWith[0], threadMockup);
      // old entry should be cleared...
      assert.equal(ThreadListUI.container.innerHTML, '');

      done();
    });

    test('onMessageReceived append in overview, existing (2)', function(done) {
      var msg = {
        delivery: 'received',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour',
        threadId: '123456'
      };

      var threadMockup = {
        participants: ['123456'],
        timestamp: new Date(1988, 8, 31),
        threadId: '123456'
      };

      MessageManager.createThreadMockup = stub(threadMockup);
      Utils.getDayDate = stub('h1');
      ThreadListUI.appendThread = stub();
      ThreadListUI.container = document.createElement('div');
      ThreadListUI.container.id = 'threadsContainer_h1';
      ThreadListUI.container.innerHTML =
        '<header/>';
      ThreadListUI.container.innerHTML +=
        '<ul id="thread_123456"><a/></ul><ul id="thread_456"><a/></ul>';

      document.querySelector('body').appendChild(ThreadListUI.container);

      MessageManager.currentNum = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.appendThread.callCount, 1);
      assert.equal(ThreadListUI.appendThread.calledWith[0], threadMockup);
      assert.equal(Utils.getDayDate.callCount, 1);
      assert.equal(Utils.getDayDate.calledWith[0], threadMockup.timestamp);
      // old entry should be cleared...
      assert.equal(ThreadListUI.container.innerHTML,
        '<header></header><ul id="thread_456"><a></a></ul>');

      done();
    });

    test('onMessageReceived append in overview, sent', function(done) {
      var msg = {
        delivery: 'sent',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour',
        threadId: '987654'
      };

      var threadMockup = {
        participants: ['987654'],
        timestamp: new Date(1988, 8, 31)
      };

      MessageManager.createThreadMockup = stub(threadMockup);
      Utils.getDayDate = stub('h1');
      ThreadListUI.appendThread = stub();
      ThreadListUI.container = document.createElement('div');
      ThreadListUI.container.id = 'threadsContainer_h1';
      ThreadListUI.container.innerHTML =
        '<header/>';
      ThreadListUI.container.innerHTML +=
        '<ul id="thread_987654"><a/></ul><ul id="thread_456"><a/></ul>';

      document.querySelector('body').appendChild(ThreadListUI.container);

      MessageManager.currentNum = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.appendThread.callCount, 1);
      assert.equal(ThreadListUI.appendThread.calledWith[0], threadMockup);
      assert.equal(Utils.getDayDate.callCount, 1);
      assert.equal(Utils.getDayDate.calledWith[0], threadMockup.timestamp);
      // old entry should be cleared...
      assert.equal(ThreadListUI.container.innerHTML,
        '<header></header><ul id="thread_456"><a></a></ul>');

      done();
    });

    test('onMessageReceived append in overview, older', function(done) {
      var msg = {
        delivery: 'received',
        sender: '123456',
        receiver: '987654',
        body: 'bonjour',
        threadId: '123456'
      };

      var threadMockup = {
        participants: ['123456'],
        timestamp: new Date(1988, 8, 31)
      };

      MessageManager.createThreadMockup = stub(threadMockup);
      Utils.getDayDate = stub('h1');
      ThreadListUI.appendThread = stub();
      ThreadListUI.container = document.createElement('div');
      ThreadListUI.container.id = 'threadsContainer_h1';
      ThreadListUI.container.innerHTML =
        '<header/>';
      ThreadListUI.container.innerHTML +=
        '<ul id="thread_123456"><a/></ul>';

      var thread = ThreadListUI.container.querySelector('#thread_123456');
      thread.dataset.time = new Date(2013, 1, 1).getTime(); // newer!

      document.querySelector('body').appendChild(ThreadListUI.container);

      MessageManager.currentNum = null; // overview screen
      MessageManager.onMessageReceived('sms', { message: msg });

      assert.equal(MessageManager.createThreadMockup.callCount, 1);
      assert.equal(MessageManager.createThreadMockup.calledWith[0], msg);
      assert.equal(ThreadListUI.appendThread.callCount, 0);
      assert.equal(Utils.getDayDate.callCount, 0);
      // should have 'unread' class now
      assert.equal(thread.querySelector('a').classList[0],
        'unread');

      done();
    });
  });
});
