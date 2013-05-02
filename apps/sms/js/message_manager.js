/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*global async */

'use strict';

var MessageManagerCtor = function(Contacts, ThreadUI,
                                  ThreadListUI, Utils, messageSources) {
  this.sources = messageSources;

  this.init = function(callback) {
    var self = this;

    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // attach event handlers
    Object.keys(self.sources).forEach(function(k) {
      var type = self.sources[k];
      type.addEventListener('received', function(ev) {
        self.onMessageReceived(k, ev);
      });
      type.addEventListener('sending', function(ev) {
        self.onMessageSending(k, ev);
      });
      type.addEventListener('sent', function(ev) {
        self.onMessageSent(k, ev);
      });
      type.addEventListener('failed', function(ev) {
        self.onMessageFailed(k, ev);
      });
    });

    window.addEventListener('hashchange', this.onHashChange.bind(this));
    document.addEventListener('mozvisibilitychange',
                              this.onVisibilityChange.bind(this));

    // Determine which fields need to be searched by the Contacts app
    var filters = Object.keys(self.sources).map(function(k) {
      return self.sources[k].handles || [];
    }).reduce(function(a, b) {
      return a.concat(b); // reduce into one array
    }).filter(function(value, index, self) {
      return self.indexOf(value) === index; // uniqueify
    });
    Contacts.additionalFilters = filters;

    // Callback if needed
    if (callback && typeof callback === 'function') {
      callback();
    }
  };

  this.onMessageSending = function mm_onMessageSending(channel, e) {
    var message = e.message;
    message.channel = channel;
    var num = message.receiver;
    if (window.location.hash == '#new') {
      // If we are in 'new' we go to the right thread
      // 'num' has been internationalized by Gecko
      window.location.hash = '#num=' + num;
    } else {
      ThreadUI.appendMessage(message);
      ThreadUI.scrollViewToBottom();
    }
    this.getThreads(ThreadListUI.renderThreads);
  };

  this.onMessageFailed = function mm_onMessageFailed(channel, e) {
    e.message.channel = channel;
    ThreadUI.onMessageFailed(e.message);
  };

  this.onMessageSent = function mm_onMessageSent(channel, e) {
    e.message.channel = channel;
    ThreadUI.onMessageSent(e.message);
  };

  // This method fills the gap while we wait for next 'getThreadList' request,
  // letting us rendering the new thread with a better performance.
  this.createThreadMockup = function mm_createThreadMockup(message) {
    var isReceived = message.delivery === 'received';
    // Given a message we create a thread as a mockup. This let us render the
    // thread without requesting Gecko, so we increase the performance and we
    // reduce Gecko requests.
    return {
        id: message.threadId,
        participants: [isReceived ? message.sender : message.receiver],
        body: message.body,
        timestamp: message.timestamp,
        unreadCount: isReceived ? 1 : (message.read ? 0 : 1)
      };
  };

  this.onMessageReceived = function mm_onMessageReceived(channel, e) {
    var self = this;
    var message = e.message;
    if (message.messageClass === 'class-0') {
      return;
    }

    message.channel = channel;
    message.delivery = message.delivery || 'received';

    // is the message already received?
    if (document.getElementById('message-' + message.id)) {
      return;
    }

    var threadId = message.threadId;
    if (threadId && threadId === this.currentThread) {
      //Append message and mark as unread
      this.markMessagesRead(channel, [message.id], true, function() {
        self.getThreads(ThreadListUI.renderThreads);
      });
      ThreadUI.appendMessage(message);
      ThreadUI.scrollViewToBottom();
      Utils.updateTimeHeaders();
    } else {
      var threadMockup = this.createThreadMockup(message);
      if (ThreadListUI.container.getElementsByTagName('ul').length === 0) {
        ThreadListUI.renderThreads([threadMockup]);
      } else {
        var timestamp = threadMockup.timestamp.getTime();
        var previousThread = document.getElementById('thread_' + threadId);
        if (previousThread && previousThread.dataset.time > timestamp) {
          // If the received SMS it's older that the latest one
          // We need only to update the 'unread status'
          previousThread.getElementsByTagName('a')[0].classList
                    .add('unread');
          return;
        }
        // We remove the previous one in order to place the new one properly
        if (previousThread) {
          var threadsInContainer = previousThread.parentNode.children.length;
          if (threadsInContainer === 1) {
            // If it's the last one we should remove the container
            var oldThreadContainer = previousThread.parentNode;
            var oldHeaderContainer = oldThreadContainer.previousSibling;
            ThreadListUI.container.removeChild(oldThreadContainer);
            if (oldHeaderContainer) {
              ThreadListUI.container.removeChild(oldHeaderContainer);
            }
          } else {
            var threadsContainerID = 'threadsContainer_' +
                              Utils.getDayDate(threadMockup.timestamp);
            var threadsContainer = document.getElementById(threadsContainerID);
            if (threadsContainer && previousThread)
              threadsContainer.removeChild(previousThread);
          }
        }
        ThreadListUI.appendThread(threadMockup);
      }
    }
  };

  this.onVisibilityChange = function mm_onVisibilityChange(e) {
    LinkActionHandler.resetActivityInProgress();
    ThreadListUI.updateContactsInfo();
    ThreadUI.updateHeaderData();
    Utils.updateTimeHeaders();

    // If we receive a message with screen off, the height is
    // set to 0 and future checks will fail. So we update if needed
    if (!ThreadListUI.fullHeight || ThreadListUI.fullHeight === 0) {
      ThreadListUI.fullHeight = ThreadListUI.container.offsetHeight;
    }
  };

  this.slide = function mm_slide(callback) {
    var mainWrapper = document.getElementById('main-wrapper');

    mainWrapper.classList.add('peek');
    mainWrapper.dataset.position = (mainWrapper.dataset.position == 'left') ?
                                   'right' : 'left';

    // We have 2 panels, so we get 2 transitionend for each step
    var trEndCount = 0;
    mainWrapper.addEventListener('transitionend', function trWait() {
      trEndCount++;

      switch (trEndCount) {
        case 2:
          mainWrapper.classList.remove('peek');
          break;
        case 4:
          mainWrapper.removeEventListener('transitionend', trWait);
          if (callback) {
            callback();
          }
          break;
      }
    });
  };

  this.onHashChange = function mm_onHashChange(e) {
    var self = this;

    var mainWrapper = document.getElementById('main-wrapper');
    var threadMessages = document.getElementById('thread-messages');
    switch (window.location.hash) {
      case '#new':
        var receiverInput = document.getElementById('messages-recipient');
        //Keep the  visible button the :last-child
        var contactButton = document.getElementById(
            'messages-contact-pick-button'
        );
        contactButton.parentNode.appendChild(contactButton);
        document.getElementById('messages-container').innerHTML = '';
        ThreadUI.cleanFields();
        // If the message has a body, use it to popuplate the input field.
        if (MessageManager.activityBody) {
          input.value = MessageManager.activityBody;
          MessageManager.activityBody = null;
        }
        // Cleaning global params related with the previous thread
        MessageManager.currentNum = null;
        MessageManager.currentThread = null;
        threadMessages.classList.add('new');
        self.slide(function() {
          receiverInput.focus();
        });
        break;
      case '#thread-list':
        //Keep the  visible button the :last-child
        var editButton = document.getElementById('icon-edit');
        editButton.parentNode.appendChild(editButton);
        // Cleaning global params related with the previous thread
        MessageManager.currentNum = null;
        MessageManager.currentThread = null;
        if (mainWrapper.classList.contains('edit')) {
          mainWrapper.classList.remove('edit');
          if (ThreadListUI.editDone) {
            ThreadListUI.editDone = false;
            // TODO Address this re-render in
            // https://bugzilla.mozilla.org/show_bug.cgi?id=825604
            this.getThreads(ThreadListUI.renderThreads,
              function threadListUpdated() {
              WaitingScreen.hide();
            });
          }
        } else if (threadMessages.classList.contains('new')) {
          self.slide(function() {
            threadMessages.classList.remove('new');
          });
        } else {
          self.slide(function() {
            ThreadUI.container.innerHTML = '';
            if (self.activityTarget) {
              window.location.hash =
                '#num=' + self.activityTarget;
              delete self.activityTarget;
              delete self.lockActivity;
            }
          });
        }
        break;
      case '#edit':
        ThreadListUI.cleanForm();
        ThreadUI.cleanForm();
        mainWrapper.classList.toggle('edit');
        break;
      default:
        var num = this.getNumFromHash();
        if (num) {
          var filter = this.createFilter(num);
          self.currentNum = num;
          if (mainWrapper.classList.contains('edit')) {
            mainWrapper.classList.remove('edit');
          } else if (threadMessages.classList.contains('new')) {
            ThreadUI.renderMessages(filter);
            threadMessages.classList.remove('new');
            ThreadUI.updateHeaderData();
          } else {
            // As soon as we click in the thread, we visually mark it
            // as read.
            var threadRead =
              document.querySelector('li[data-phone-number="' + num + '"]');
            if (threadRead) {
              threadRead.getElementsByTagName('a')[0].classList
                    .remove('unread');
            }

            // Update Header
            ThreadUI.updateHeaderData(function headerReady() {
              self.slide(function slided() {
                ThreadUI.renderMessages(filter);
              });
            });
          }
        }
      break;
    }
  };

  this.createFilter = function mm_createFilter(num) {
    var filter = new MozSmsFilter();
    filter.numbers = [num || ''];
    return filter;
  };

  this.getNumFromHash = function mm_getNumFromHash() {
    var num = /\bnum=(.+)(&|$)/.exec(window.location.hash);
    return num ? num[1] : null;
  };

  this.getThreads = function mm_getThreads(callback, extraArg) {
    var self = this;
    // we need to iterate over all sources and call getThreads()
    // then we need to combine the accumulated results...
    asyncMap(Object.keys(self.sources), function(channel, next) {
      var stuff = [];
      var cursor = self.sources[channel].getThreads();
      cursor.onsuccess = function(ev) {
        if (cursor.result) {
          stuff.push(cursor.result);
          cursor.continue();
        }
        else {
          next(null, stuff);
        }
      };
      cursor.onerror = function() {
        next(channel + ' - ' + cursor.error.name);
      };
    }, function(err, res) {
      if (err) {
        console.error('Getting SMS threads error', err);
      }
      if (res.length === 1) {
        callback(res[0], extraArg);
      }
      else if (res.length === 0) {
        callback([], extraArg);
      }
      else {
        // @todo need to return the results for the others or cancel?
        var blah = res.reduce(function(a, b) { return a.concat(b); });
        callback(blah, extraArg);
      }
    });
  };

  this.getMessages = function mm_getMgs(options) {
    var self = this;
    var stepCB = options.stepCB, // CB which manage every message
        filter = options.filter, // mozMessageFilter
        invert = options.invert, // invert selection
        endCB = options.endCB,   // CB when all messages retrieved
        endCBArgs = options.endCBArgs; //Args for endCB

    asyncMap(Object.keys(self.sources), function(channel, next) {
      var request = self.sources[channel].getMessages(filter, !invert);
      request.onsuccess = function onsuccess() {
        var message = request.result;
        if (message) {
          var shouldContinue = true;
          if (stepCB) {
            message.channel = channel;
            shouldContinue = stepCB(message);
          }
          // if stepCB returns false the iteration stops
          if (shouldContinue !== false) { // if this is undefined this is fine
            request.continue();
          }
          else {
            next();
          }
        } else {
          next();
        }
      };
      request.onerror = function onerror() {
        next('Reading message DB for ' + channel + ' ' + request.error.name);
      };
    }, function(err) {
      if (err) {
        console.error(err);
      }
      if (endCB) {
        endCB(endCBArgs);
      }
    });
  };

  this.send = function mm_send(channel, number, text, callback, errorHandler) {
    var req = this.sources[channel].send(number, text);
    req.onsuccess = function onsuccess(e) {
      callback && callback(req.result);
    };

    req.onerror = function onerror(e) {
      errorHandler && errorHandler(number);
    };
  };

  this.deleteMessage = function mm_deleteMessage(channel, id, callback) {
    var req = this.sources[channel]. delete(id);
    req.onsuccess = function onsuccess() {
      callback && callback(req.result);
    };

    req.onerror = function onerror() {
      var msg = 'Deleting in the database. Error: ' + req.error.name;
      console.error(msg);
      callback && callback(null);
    };
  };

  /*
    TODO: If the messages could not be deleted completely,
    conversation list page will also update without notification currently.
    May need more infomation for user that the messages were not
    removed completely.
  */
  this.deleteMessages = function mm_deleteMessages(channel, list, callback) {
    if (list.length > 0) {
      this.deleteMessage(channel, list.shift(), function(result) {
        this.deleteMessages(channel, list, callback);
      }.bind(this));
    } else
      callback();
  };

  this.markMessagesRead = function mm_markMessagesRead(channel, list,
                                                        value, callback) {
    if (!list.length) {
      return callback && callback(null);
    }

    // We chain the calls to the API in a way that we make no call to
    // 'markMessageRead' until a previous call is completed. This way any
    // other potential call to the API, like the one for getting a message
    // list, could be done within the calls to mark the messages as read.
    var req = this.sources[channel].markMessageRead(list.pop(), value);
    req.onsuccess = (function onsuccess() {
      if (!list.length && callback) {
        callback(req.result);
        return;
      }
      this.markMessagesRead(channel, list, value, callback);
    }).bind(this);

    req.onerror = function onerror() {
      if (callback) {
        callback(null);
      }
    };
  };

  function asyncMap(list, iterator, callback) {
    list = list.map(function(item, ix) {
      return {
        ix: ix,
        value: item
      };
    });
    var res = [],
        err,
        itCallbackCounter = 0;
    list.forEach(function(item) {
      iterator(item.value, function(itErr, itRes) {
        res[item.ix] = itRes;
        if (itErr) err = itErr;
        if (++itCallbackCounter === list.length) {
          // done!
          callback(err, res);
        }
      });
    });
  }
};
// you might think, what is this doing here?
// well, we need to reserve this variable here because otherwise we cant
// overwrite the implementation in Mocha (global detection). Sorry.
window.MessageManager = null;
