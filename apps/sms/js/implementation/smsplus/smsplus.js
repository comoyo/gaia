/**
 * This is a file that handles SMS communications for the messaging app
 * If we're running in the desktop we'll use a shim, otherwise the mozSMS API
 */
/*global LazyLoader EventEmitter Q */
(function() {

  function Sms() {
    var self = this;

    /**
     * Which contact fields do we handle?
     */
    this.handles = ['tel'];

    this.api = null;

    /**
     * Initialize the SMS implementation, load the shim if on desktop
     */
    this.init = function(callback) {
      LazyLoader.load(['js/implementation/smsplus/q.js'], function() {
        LazyLoader.load([
          'js/implementation/smsplus/services/plus_db_service.js',
          'js/implementation/smsplus/services/plus_sms_service.js'
        ], function() {
          self.api = window.getSmsPlusService(Q, window.smsPlusIndexedDb);

          self.api.login('', '')
            .then(function() {
              callback();
            }, function(err) {
              callback();
            });

          self.attachHandlers();
        });
      });
    };

    this.attachHandlers = function() {
      self.api.onMessage = function(message) {
        message.timestamp = new Date(Number(message.timestamp));
        var receivedInfo = {
          type: 'received',
          message: message
        };
        self.emit('received', receivedInfo);
      };

      self.api.onMessagesUpdated = function(messages) {
        messages.forEach(function(message) {
          message.timestamp = new Date(Number(message.timestamp));
          var info = {
            // always received, to identify that we don't have this message
            // in our DB yet
            type: 'received',
            message: message
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
          return d;
        });

        data = data.filter(function(d) {
          if (filter.startDate && d.timestamp < filter.startDate)
            return false;
          if (filter.endDate && d.timestamp > filter.endDate)
            return false;
          if (filter.delivery && d.delivery !== filter.delivery)
            return false;
          if (filter.read !== undefined && d.read !== filter.read)
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
            return b.timestamp - a.timestamp;
          });
        } else {
          data.sort(function(a, b) {
            return a.timestamp - b.timestamp;
          });
        }

        var idx = 0, cursor;
        function returnMessage() {
          cursor = px.result = {};
          cursor.message = data[idx];
          idx += 1;
          cursor.continue = continueCursor;
          px.onsuccess();
        }

        function continueCursor() {
          setTimeout(returnMessage);
        }

        returnMessage();
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
            unreadCount: d.read ? 0 : 1
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

    this.sendId = 0;
    this.send = function(number, text) {
      var px = {};

      var sendInfo = {
        type: 'sent',
        message: {
          sender: null,
          receiver: number,
          delivery: 'sending',
          body: text,
          id: ++self.sendId,
          timestamp: new Date()
        }
      };

//      self.emit('sending', sendInfo);

      self.api.send(number, text).then(function() {
//        sendInfo.message.delivery = 'sent';
        px.onsuccess();
//        self.emit('sent', sendInfo);
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
