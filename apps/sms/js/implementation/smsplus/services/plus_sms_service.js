'use strict';

function getSmsPlusService(Q, db) {
  /* reference to the public methods */
  var sms = {};

  /* Object holding sent sms'es awaiting response */
  var smsResponses = {};

  /* Object holding all edgee response functions */
  var handle = {};

  /* Edgee login (with phone) completed promise */
  var loggedIn = Q.defer();

  /* login and registration promises */
  var loginDeferred, registerDeferred;

  /* password reset promises */
  var resetDeferred, resetTokenDeferred;

  /* phone connection promises */
  var phoneDeferred, pinDeferred;

  /* handle big integers as strings */
  var addOne = function(num) {
    num = num.split('').map(parseInt);
    var i = num.length;
    var carry = true;
    while (carry && i--) {
      carry = false;
      num[i]++;
      if (num[i] > 9) {
        num[i] = 0;
        carry = true;
      }
    }
    if (carry) num.unshift(1);

    return num.join('');
  };

  /* Because of the async db we keep this one in memory */
  var hgn = '000000000';
  db.get('meta', 'user').then(function(user) {
    if (user && user.hgn) hgn = user.hgn;
  });

  /* User state that needs to be kept between edgee calls */
  var edgeeState = {};

  var config = {
    endpoint: 'wss://edgee-ws-api.comoyo.com:443',
    edgeePrefix: 'com.telenor.sw.adaptee.th.',
    db: 'websms',
    dbInfo: [{
      name: 'meta',
      properties: {
        keyPath: 'key'
      }
    }, {
      name: 'messages',
      properties: {
        keyPath: 'id'
      }
    }]
  };

  db.openDb(config.db, 2, config.dbInfo);

  handle['ClientRegistrationResponse'] = function(data) {
    db.get('meta', 'user').then(function(user) {
      user = user || {
        key: 'user'
      };

      user.clientId = data.clientId;
      db.put('meta', user).then(function() {
        init();
      });
    });
  };

  handle['AccountLoginResponse'] = function(data) {
    if (!data.loggedIn) {
      loginDeferred.reject();
      return;
    }

    loginDeferred.resolve();

    edgeeState.sessionKey = data.sessionKey;
    edgeeState.userId = data.userId;

    /*
    db.update('meta', 'user', {
      sessionKey: data.sessionKey,
      userId: data.userId
    });*/

    var msg = message('ServiceRequestCommand', {
      'serviceId': 'smsplus'
    });

    socket.send(msg);
  };

  handle['AuthenticateSessionResponse'] = function(data) {
    if (!data.authenticated) return;

    var msg = message('ServiceRequestCommand', {
      'serviceId': 'smsplus'
    });

    socket.send(msg);
  };

  handle['ServiceMsisdnRequest'] = function(data) {
    if (data.retryCode) {
      phoneDeferred.reject(data.retryCode);
      return;
    }

    sms.onPhoneNeeded();
  };

  handle['ServiceMsisdnVerificationRequest'] = function(data) {
    // Getting to this step means phone was okay
    if (phoneDeferred) phoneDeferred.resolve(data.msisdn);

    if (data.retryCode) {
      pinDeferred.reject(data.retryCode);
      return;
    }

    sms.onPinNeeded(data.msisdn);
  };

  handle['ServiceResponse'] = function(data) {
    if (data.failureCode) {
      sms.onLoginError(data.failureCode, data.failureReason);
      return;
    }

    // TODO: Most likely redundant
    if (!data.serviceOk) return;

    edgeeState['msisdn'] = data.msisdn;
    /*
    var userParams = { msisdn: data.msisdn };
    if (edgeeState.sessionKey)
      userParams['sessionKey'] = edgeeState.sessionKey;
    if (edgeeState.userId)
      userParams['userId'] = edgeeState.userId;
*/
    if (pinDeferred) {
      pinDeferred.resolve(data.msisdn);
    }

    loggedIn.resolve();

    // user info only persisted to database on successful phone sync
    db.update('meta', 'user', edgeeState);

    var msg = message('SubscriptionCommand', {
      'subscriptionInformation': {
        'subscribeToContactUpdates': false,
        'subscribeToConversationUpdates': true
      }
    });

    socket.send(msg);
  };

  handle['AnonymousUserRegistrationResponse'] = function(data) {
    edgeeState.sessionKey = data.sessionKey;
    edgeeState.userId = data.userId;

    var msg = message('AccountRegistrationCommand', {
      'accountInformation': {
        'emailAddress': edgeeState.username,
        'password': edgeeState.password,
        'newsletterSubscription': true
      }
    });

    socket.send(msg);
  };

  handle['AccountAuthentication'] = function(data) {
    if (!data.accountRegistered) {
      sms.onLoginError(data.failureTag, data.failureReason);
      return;
    }

    // If a new user is authenticated, we delete old messages
    hgn = '000000000';
    edgeeState['hgn'] = hgn;
    db.remove('messages');

    var msg = message('ServiceRequestCommand', {
      'serviceId': 'smsplus'
    });

    socket.send(msg);
  };

  handle['RequestPasswordResetTokenResponse'] = function(data) {
    if (!data.verificationSmsSent) {
      resetDeferred.reject(data.failureTag);
      return;
    }

    resetDeferred.resolve();
  };

  handle['ChangePasswordByTokenResponse'] = function(data) {
    if (!data.passwordChanged) {
      resetTokenDeferred.reject(data.failureTag);
      return;
    }

    resetTokenDeferred.resolve();
  };

  handle['ConversationHgn'] = function(data) {
    var queryHgn = addOne(hgn);

    if (queryHgn < data.generation) {
      var msg = message('ConversationUpdateRequestCommand', {
        'generationRange': {
          'generationRangeStart': queryHgn,
          'generationRangeEnd': data.generation
        }
      });

      socket.send(msg);
    }
  };

  handle['ConversationUpdateResponse'] = function(data) {
    var queryHgn = addOne(hgn);

    data.conversations.forEach(function(conversation) {
      var msg = message('MessageQueryCommand', {
        'query': {
          'conversationId': conversation.conversationId,
          'messageLowestGeneration': queryHgn,
          'messageHighestGeneration': conversation.messageHighestGeneration
        }
      });

      socket.send(msg);
    });
  };

  handle['MessageQueryResponse'] = function(data) {
    if (hgn < data.messageHighestGeneration) {
      hgn = data.messageHighestGeneration;
      db.update('meta', 'user', {
        hgn: data.messageHighestGeneration
      });
    }

    var messages = [];
    data.messages.forEach(function(message) {
      if (message.deleted) return;
      messages.push({
        id: message.messageId,
        body: message.body.richTextElements[0].richTextString.text,
        delivery: message.incoming ? 'received' : 'sent',
        sender: message.messageSender,
        receiver: message.messageReceiver,
        conversation: data.conversationId,
        read: message.viewed,
        timestamp: message.createTime
      });

      var createTime = parseInt(message.createTime, 10) + 1000 * 60;
      if (createTime > parseInt(data.timestamp, 10) &&
          message.incoming &&
          !message.viewed) {
        sms.onMessage(messages[messages.length - 1]);
      }
    });

    db.put('messages', messages, true);
    sms.onMessagesUpdated(messages);
  };

  handle['SendSmsResponse'] = function(data) {
    if (!smsResponses[data.token]) return;

    var message = smsResponses[data.token].message;
    var deferred = smsResponses[data.token].deferred;

    if (data.response) deferred.resolve(message);
    else deferred.reject(message);

    delete smsResponses[data.token];
  };

  var connect = function(endpoint) {
    var newSocket = new WebSocket(endpoint);

    newSocket.onerror = function() {
      sms.ready.reject();
      loggedIn.reject();
    };
    newSocket.onopen = function() {
      loggedIn = Q.defer();

      keepAlive = setInterval(function() {
        console.log('keep-alive');
        newSocket.send('');
      }, 30 * 1000);

      init();
    };
    newSocket.onmessage = function(message) {
      if (!message.data.length) return;

      var receivedString = message.data.substring(0, message.data.length - 1);
      // TODO: Really need better way of catching large integers
      // Match 9+ digit numbers not stringed
      var intToStr = /:(\d{9,})(?!\d|")/g;
      var stringified = receivedString.replace(intToStr, ':"$1"');

      var data = JSON.parse(stringified);
      var key = Object.keys(data)[0];
      var data = data[key];
      var eventName = key.split('.').pop();

      handle[eventName] && handle[eventName](data);
    };
    newSocket.onclose = function() {
      console.log('reestablishing connection');
      clearInterval(keepAlive);
      // Reset promise
      loggedIn.reject();
      sms.ready.reject();

      sms.ready = Q.defer();
      // Reconnect
      socket = connect(endpoint);
    };

    return newSocket;
  };
  var keepAlive;
  var socket = new connect(config.endpoint);

  var init = function() {
    // Register site as a 'device' using sms+
    db.get('meta', 'user').then(function(user) {
      if (!user || !user.clientId) {
        var registerDevice = message('ClientRegistrationCommand', {
          'clientInformation': {
            'clientType': 'web',
            'clientVersion': window.location.host
          }
        });
        socket.send(registerDevice);

        return;
      }

      sms.ready.resolve();

      if (!user.userId || !user.sessionKey) {

        // Callback asking client to login
        sms.onLogin(loggedIn.promise);

        return;
      }

      var auth = message('AuthenticateSessionCommand', {
        'authenticateSessionInformation': {
          'userId': user.userId,
          'clientId': user.clientId,
          'sessionKey': user.sessionKey
        }
      });

      socket.send(auth);
    }, function(err) {
      console.log('db issues ' + err);
    });
  };

  var message = function(name, content) {
    var message = {};
    message[config.edgeePrefix + name] = content;

    // Turn integer strings back into integer format
    var stringedMessage = JSON.stringify(message);
    // greedily matches numbers of 9+ digits
    var strToInt = /"(\d{9,})"/g;
    // Unlike generation numbers, userIds are actually strings!
    var quoteUserId = /"userId":(\d+)/g;

    return stringedMessage
      .replace(strToInt, '$1')
      .replace(quoteUserId, '"userId":"$1"');
  };

  sms = {
    ready: Q.defer(),

    onLogin: function(loggedIn) { /* callback */
    },

    login: function(username, password) {
      return this.ready.promise.then(function() {
        loginDeferred = Q.defer();

        db.get('meta', 'user').then(function(user) {
          var msg = message('AccountLoginCommand', {
            'accountLoginInformation': {
              'userName': username,
              'password': password,
              'clientId': user && user.clientId
            }
          });

          try {
            socket.send(msg);
          }
          catch (ex) {
            loginDeferred.reject(ex);
          }
        });

        return loginDeferred.promise;
      });
    },

    onLoginError: function(tag, text) { /* callback */
    },

    register: function(username, password) {
      db.get('meta', 'user').then(function(user) {
        var msg = message('AnonymousUserRegistrationCommand', {
          'anonymousUserRegistration': {
            'clientId': user && user.clientId
          }
        });

        edgeeState.username = username;
        edgeeState.password = password;

        socket.send(msg);
      });

    },

    onPhoneNeeded: function() { /* callback */
    },

    onPinNeeded: function(msisdn) { /* callback */
    },

    phone: function(number) {
      phoneDeferred = Q.defer();
      edgeeState.msisdn = number;

      var msg = message('ServiceMsisdnCommand', {
        'serviceId': 'smsplus',
        'msisdn': number
      });

      socket.send(msg);
      return phoneDeferred.promise;
    },

    pin: function(pin) {
      pinDeferred = Q.defer();

      var msg = message('ServiceMsisdnVerificationCommand', {
        'serviceId': 'smsplus',
        'msisdn': edgeeState.msisdn,
        'verificationCode': pin
      });

      socket.send(msg);
      return pinDeferred.promise;
    },

    resetPassword: function(username) {
      resetDeferred = Q.defer();

      var msg = message('RequestPasswordResetTokenCommand', {
        'userName': username
      });

      socket.send(msg);
      return resetDeferred.promise;
    },

    resetPasswordToken: function(username, token, password) {
      resetTokenDeferred = Q.defer();

      var msg = message('ChangePasswordByTokenCommand', {
        'userName': username,
        'verificationCode': token,
        'password': password
      });

      socket.send(msg);
      return resetTokenDeferred.promise;
    },

    send: function(number, content) {
      return loggedIn.promise.then(function() {
        var deferred = Q.defer();

        var smsMessage = {
          'timestamp': String(Date.now()),
          'messageReceiver': number,
          'smsContent': content
        };
        var token = Math.random().toString(36).substring(7);

        var msg = message('SendSmsCommand', {
          'smsMessage': smsMessage,
          'token': token
        });

        smsResponses[token] = {
          'message': smsMessage,
          'deferred': deferred
        };

        socket.send(msg);

        return deferred.promise;
      });
    },

    getMessages: function(hgn) {
      if (hgn) return db.get('messages', hgn, null, true);

      return db.get('messages');
    },

    /**
     * Called whenever db changes
     * Intended to help keep memory in sync with db
     */
    onMessagesUpdated: function(messages) { /* callback */
    },

    /**
     * Called whenever there are new, incoming messages
     * Intended to help show message notifications
     */
    onMessage: function(message) { /* callback */
    },

    get connected() {
      return socket && socket.readyState === 1;
    }
  };

  return sms;
}
