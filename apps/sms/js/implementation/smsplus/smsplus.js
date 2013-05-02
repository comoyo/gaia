/**
 * This is a file that handles SMS communications for the messaging app
 * If we're running in the desktop we'll use a shim, otherwise the mozSMS API
 */
/*global LazyLoader EventEmitter Q */
(function() {
//  var PUSH_URL = 'http://smspluspush.janjongboom.c9.io';
  var PUSH_URL = 'http://smsplus-push.herokuapp.com';

  function Sms() {
    var self = this;

    /**
     * Which contact fields do we handle?
     */
    this.handles = ['tel'];

    this.api = null;

    this.sentItems = [];

    console.log('I have push?', typeof navigator.mozSetMessageHandler !== 'undefined');
    typeof navigator.mozSetMessageHandler !== 'undefined' &&
    navigator.mozSetMessageHandler('push', function(message) {
      console.log('push message handler', message.pushEndpoint);
      var oReq = new XMLHttpRequest({mozSystem: true});
      oReq.onload = function() {
        console.log('oReq.onload', oReq.responseText);
        var msg = JSON.parse(oReq.responseText);
        var notification =
          navigator.mozNotification.createNotification(msg.sender, msg.body);

        notification.onclick = function() {
          navigator.mozApps.getSelf().onsuccess = function(evt) {
            var app = evt.target.result;
            app && app.launch();
            window.location.hash = '#num=' + encodeURIComponent(msg.sender);
          };
        };

        notification.show();
      };
      oReq.onerror = function() {
        console.error('Getting message info failed', oReq.statusCode, oReq.responseText);
      };

      var url = PUSH_URL + '/message?endpoint=' + encodeURIComponent(message.pushEndpoint);
      oReq.open('get', url, true);
      oReq.setRequestHeader('Content-type','application/x-www-form-urlencoded');
      oReq.send();
    });

    /**
     * Initialize the SMS implementation, load the shim if on desktop
     */
    this.init = function(callback) {
      LazyLoader.load(['js/implementation/smsplus/q.js'], function() {
        LazyLoader.load([
          'js/implementation/smsplus/credentials.js',
          'js/implementation/smsplus/services/plus_db_service.js',
          'js/implementation/smsplus/services/plus_sms_service.js'
        ], function() {
          self.api = window.getSmsPlusService(Q, window.smsPlusIndexedDb);
          var creds = window.smspluscreds;

          self.api.login(creds.username, creds.password)
            .then(function() {
              self.registerPush(creds.username, creds.password, callback);
            }, function(err) {
              callback();
            });

          self.attachHandlers();
        });
      });
    };

    this.$tellComoyoPushServer = function(username, password, url, callback) {
      // let's do a nice XHR thingy now
      var oReq = new XMLHttpRequest({mozSystem: true});
      oReq.onload = function() {
        callback();
      };
      oReq.onerror = function() {
        console.error('POSTing to our push server failed', oReq.error);
        callback();
      };
      oReq.open('post', PUSH_URL + '/register', true);
      oReq.setRequestHeader('Content-type','application/x-www-form-urlencoded');
      oReq.send('username=' + encodeURIComponent(username) +
        '&password=' + encodeURIComponent(password) +
        '&endpoint=' + encodeURIComponent(url));
    };

    this.registerPush = function(username, password, callback) {
      if (typeof navigator.push === 'undefined')
        return callback();

      var req = navigator.push.registrations();
      req.onsuccess = function(e) {
        console.log('Push registrations', e.target.result.map(function(t) {
          return t.pushEndpoint + '#' + t.version;
        }).join(' | '), e.target.result.length);

        if (e.target.result.length === 0) {
          // no push thingy registered yet
          var pr = navigator.push.register();
          pr.onsuccess = function(e) {
            var url = e.target.result;
            self.$tellComoyoPushServer(username, password, url, callback);
          };
          pr.onerror = function() {
            console.error('Push registration error', pr.error);
            callback();
          };
        }
        else {
          var url = e.target.result[0].pushEndpoint;
          self.$tellComoyoPushServer(username, password, url, callback);
          callback();
        }
      };
      req.onerror = function() {
        console.error('requesting push registrations failed', req.error);
        callback();
      };
    };

    this.attachHandlers = function() {
      self.api.onMessage = function(m) {
        m.threadId = m.conversation;
        m.timestamp = new Date(Number(m.timestamp));
        var receivedInfo = {
          type: 'received',
          message: m
        };
        self.emit('received', receivedInfo);
      };

      self.api.onMessagesUpdated = function(messages) {
        messages.forEach(function(m) {
          // sent from this device? then ignore
          if (m.delivery === 'sent' && self.sentItems.some(function(sent) {
            return sent.number === m.receiver
                && sent.body === m.body;
          })) {
            return;
          }

          m.threadId = m.conversation;
          m.timestamp = new Date(Number(m.timestamp));
          var info = {
            // always received, to identify that we don't have this message
            // in our DB yet
            type: 'received',
            message: m
          };
          self.emit(info.type, info);
        });
      };
    };

    this.getMessages = function(filter, reverse) {
      var px = {};

      this.api.getMessages().then(function(data) {
        data = data.map(function(d) {
          d.timestamp = new Date(Number(d.timestamp));
          d.body = d.body || '';
          d.threadId = d.conversation;
          return d;
        });

        data = data.filter(function(d) {
          if (filter.startDate && d.timestamp < filter.startDate)
            return false;
          if (filter.endDate && d.timestamp > filter.endDate)
            return false;
          if (filter.delivery && d.delivery !== filter.delivery)
            return false;
          if (typeof filter.read === 'boolean' && d.read !== filter.read)
            return false;
          if (filter.numbers) {
            if (filter.numbers.indexOf(d.receiver) === -1 &&
                filter.numbers.indexOf(d.sender) === -1) {
              return;
            }
          }
          return true;
        });

        if (!reverse) {
          data.sort(function(a, b) {
            return a.timestamp - b.timestamp;
          });
        } else {
          data.sort(function(a, b) {
            return b.timestamp - a.timestamp;
          });
        }

        var idx = 0;
        px.continue = function() {
          px.result = data[idx++];
          px.onsuccess();
        };

        px.continue();
      }, function(err) {
        px.error = err;
        px.onerror && px.onerror(px.error);
      });
      return px;
    };

    this.getThreads = function() {
      var px = {};

      this.api.getMessages().then(function(data) {
        var allItems = data.map(function(d) {
          return {
            senderOrReceiver: d.delivery === 'received' ?
                                d.sender :
                                d.receiver,
            timestamp: new Date(Number(d.timestamp)),
            body: d.body,
            unreadCount: d.read ? 0 : 1,
            id: d.conversation
          };
        });

        allItems = allItems.reduce(function(res, obj) {
          if (!(obj.senderOrReceiver in res))
            res.__array.push(res[obj.senderOrReceiver] = obj);
          else {
            res[obj.senderOrReceiver].unreadCount += obj.unreadCount;
            if (res[obj.senderOrReceiver].timestamp < obj.timestamp) {
              res[obj.senderOrReceiver].timestamp = obj.timestamp;
              res[obj.senderOrReceiver].body = obj.body;
            }
          }
          return res;
        }, { __array: [] })
          .__array.sort(function(a, b) { return b.timestamp - a.timestamp; });

        var ix = 0;
        px.continue = function() {
          px.result = allItems[ix++];
          if (px.result) {
            px.result.participants = [ px.result.senderOrReceiver ];
          }
          px.onsuccess();
        };

        px.continue();
      }, function(err) {
        px.error = err;
        px.onerror && px.onerror(px.error);
      });
      return px;
    };

    this.markMessageRead = function() {
      var px = {};
      setTimeout(function() {
        px.result = [];
        px.onsuccess({ target: { result: px.result } });
      });
      return px;
    };

    this.$resetPush = function() {
      console.log('$resetPush');

      var req = navigator.push.registrations();
      req.onsuccess = function(e) {
        if (e.target.result.length === 0) {
          console.log('no push registrations found!');
        }
        else {
          console.log('unregistering', e.target.result[0].pushEndpoint);
          navigator.push.unregister(e.target.result[0].pushEndpoint).onsuccess = function() {
            console.log('unregister success');

            var creds = window.smspluscreds;
            self.registerPush(creds.username, creds.password, function() {});
          };
        }
      };
      req.onerror = function() {
        console.error('requesting push registrations failed', req.error);
      };
    };

    this.sendId = 0;
    this.send = function(number, text) {
      var px = {};

      if (text === 'reset-push') {
        this.$resetPush();
        setTimeout(function() { px.onerror && px.onerror(); });
        return px;
      }


      var sendInfo = {
        type: 'sent',
        message: {
          sender: null,
          receiver: number,
          delivery: 'sending',
          body: text,
          timestamp: new Date(),
          id: ++this.sendId
        }
      };

      self.emit('sending', sendInfo);

      self.api.send(number, text).then(function(m) {
        sendInfo.message.delivery = 'sent';
        sendInfo.message.timestamp = new Date(Number(m.timestamp));
        self.emit('sent', sendInfo);

        self.sentItems.push({
          number: number,
          body: text
        });

        px.onsuccess && px.onsuccess();
      }, function(err) {
        sendInfo.message.delivery = 'failed';
        self.emit('failed', sendInfo);

        px.error = err;
        px.onerror && px.onerror(err);
      });

      return px;
    };
  }

  Sms.prototype = EventEmitter.prototype;

  window.messaging = window.messaging || {};
  window.messaging.smsplus = new Sms();
})();
