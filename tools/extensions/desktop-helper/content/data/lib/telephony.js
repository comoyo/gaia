(function() {
  function debug() {
    dump('[mozTelephony] ' + window.location.host + ' ' + [].map.call(arguments, function(a) {
      return JSON.stringify(a);
    }).join(' ') + '\n');
  }

  function getId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
  }

  var tMaster = function() {
    var _calls = {};

    window.addEventListener('mozChromeEvent', function(e) {
      debug('mozChromeEvent', e.type);
      if (e.detail.type === 'fake-incoming-call') {
        createNewCall(getId(), e.detail.number, e.detail.video, 'incoming');
      }
    });

    window.onFromContentApp = function(detail) {
      detail = JSON.parse(detail);

      debug('window.onFromContentApp', detail);

      switch (detail.type) {
        case 'ping':
          broadcastCalls();
          break;

        case 'create-new-call':
          createNewCall(detail.id, detail.number, detail.video, detail.state);
          break;

        case 'change-call-state':
          changeCallState(detail.callId, detail.newState);
          break;
      }
    };

    function createNewCall(id, number, video, state) {
      var call = {
        id: id,
        number: number,
        state: state || 'dialing',
        video: video || false
      };
      _calls[call.id] = call;

      navigator.broadcastToClientApps({
        type: 'new-call',
        call: call
      });

      navigator.triggerMozMessage('telephony-new-call');
    }

    function changeCallState(callId, newState) {
      _calls[callId].state = newState;

      navigator.broadcastToClientApps({
        type: 'callstate-changed',
        call: _calls[callId]
      });

      if (newState === 'disconnected') {
        delete _calls[callId];
      }
    }

    function broadcastCalls() {
      navigator.broadcastToClientApps({
        type: 'all-calls',
        calls: Object.keys(_calls).map(function(k) { return _calls[k]; })
      });
    }
  };

  function tContent() {
    var inited = false;

    function TelephonyCall(id, number, isVideo, state) {
      var self = this;

      this.id = id;
      this._events = {};
      this._trigger = function(ev, data) {
        data = data || {};
        data.type = ev;
        (this._events[ev] || []).forEach(function(cb) {
          if (typeof cb !== 'function') {
            return cb.handleEvent(data);
          }
          cb(data);
        });
      };
      this.addEventListener = function(ev, cb) {
        this._events[ev] = this._events[ev] || [];
        this._events[ev].push(cb);
      };
      this.removeEventListener = function(ev, cb) {
        if (!this._events[ev]) return false;
        this._events[ev].splice(this._events[ev].indexOf(cb), 1);
      };

      this.number = number;
      /* 'alerting', 'busy', 'connected', 'connecting', 'dialing', 'disconnected', 'disconnecting', 'held', 'holding', 'incoming', 'resuming' */
      this.state = state || 'dialing';

      this.video = isVideo;

      this.serviceId = 0;

      this._changeState = function(state) {
        this.state = state;
        this._trigger('statechange', { call: self });
      };

      this.execChangeState = function(state) {
        navigator.sendToSystemApp({
          type: 'change-call-state',
          callId: this.id,
          newState: state
        });
      };

      this.answer = function() {
        debug('answer');

        this.execChangeState('connecting');

        setTimeout(function() {
          this.execChangeState('connected');
        }.bind(this), 1500);
      };

      this.hangUp = function() {
        debug('hangUp');

        this.execChangeState('disconnecting');

        setTimeout(function() {
          this.execChangeState('disconnected');
        }.bind(this), 1000);
      };

      this.hold = function() {
        debug('hold');
      };

      this.resume = function() {
        debug('resume');
      };

      this.dial = function() {
        this.execChangeState('dialing');

        if (this.number === '526' && this.video) {
          setTimeout(function() {
            this.error = { name: 'NetworkVideoCallFailedError' };
            this.onerror && this.onerror({ call: this });

            this.execChangeState('disconnected');
          }.bind(this), 1000);
          return;
        }

        if (this.number === '737' && this.video) {
          setTimeout(function() {
            this.error = { name: 'UserNoSupportVideoError' };
            this.onerror && this.onerror({ call: this });

            this.execChangeState('disconnected');
          }.bind(this), 1000);
          return;
        }

        setTimeout(function() {
          this.execChangeState('connected');
        }.bind(this), 5000);
      };

      this.onalerting = function() {
        debug('onalerting');
      };
      this.onbusy = function() {
        debug('onbusy');
      };
      this.onconnected = function() {
        debug('onconnected');
      };
      this.onconnecting = function() {
        debug('onconnecting');
      };
      this.ondialing = function() {
        debug('ondialing');
      };
      this.ondisconnected = function() {
        debug('ondisconnected');
      };
      this.ondisconnecting = function() {
        debug('ondisconnecting');
      };
      this.onincoming = function() {
        debug('onincoming');
      };
      this.onstatechange = function() {
        debug('onstatechange');
      };
      this.getVideoStream = function() {
        return 'https://s3-eu-west-1.amazonaws.com/firefoxos-public.comoyo.com/3g-video-calling/demo-3g.webm';
      };
      this.startUpstreamVideo = function(camera) {
        debug('startUpstreamVideo', camera);
      };
      this.stopUpstreamVideo = function() {
        debug('stopUpstreamVideo');
      };
    }

    window.onFromSystemApp = function(detail) {
      detail = JSON.parse(detail);

      debug('window.onFromSystemApp', detail);

      switch (detail.type) {
        case 'new-call':
          if (_calls.filter(function(c) {
            return c.id === detail.call.id;
          }).length === 0) {
            debug('Call is not here yet, creating');
            createNewCall(detail.call.id,
              detail.call.number,
              detail.call.video,
              detail.call.state);
          }
          else {
            debug('Call came from here, ignoring');
          }
          break;

        case 'callstate-changed':
          changeCallState(detail.call, detail.call.state);
          break;

        case 'all-calls':
          if (inited) return debug('Already inited, ignoring all-calls message');

          detail.calls.forEach(function(c) {
            createNewCall(c.id, c.number, c.video, c.state);
          });

          inited = true;
          break;
      }
    };

    function createNewCall(id, number, isVideo, state) {
      var call = new TelephonyCall(id, number, isVideo || false, state);

      call.addEventListener('disconnected', function() {
        trigger('callschanged');
      });

      call.addEventListener('statechange', function() {
        debug('Call.stateChange ' + call.state + '');
      });

      _calls.push(call);

      setTimeout(function() {
        trigger('callschanged');
      }, 1000);

      return call;
    }

    function changeCallState(detail, newState) {
      var call = _calls.filter(function(c) {
        return c.id === detail.id;
      })[0];

      call._changeState(newState);

      if (newState === 'disconnected') {
        _calls.splice(_calls.indexOf(call), 1);
        setTimeout(function() {
          trigger('callschanged');
        }, 1000);
      }
    }

    var _calls = [];
    var _events = {};

    function trigger(ev, data) {
      data = data || {};
      data.type = ev;
      (_events[ev] || []).forEach(function(cb) {
        if (typeof cb !== 'function') {
          return cb.handleEvent(data);
        }
        cb(data);
      });
    }

    var api = {
      get active() {
        return _calls[_calls.length - 1];
      },
      get calls() {
        return _calls;
      },
      get conferenceGroup() {
        return {
          state: '',
          calls: []
        };
      },
      muted: false,
      speakerEnabled: false,
      set oncallschanged(cb) {
        navigator.mozTelephony.addEventListener('callschanged', cb);
      },
      set onincoming(cb) {
        navigator.mozTelephony.addEventListener('incoming', cb);
      },
      dial: function(number, simIndex) {
        debug('dial', number);

        var call = createNewCall(getId(), number, false, null);

        navigator.sendToSystemApp({
          type: 'create-new-call',
          id: call.id,
          number: call.number,
          video: call.video,
          state: call.state
        });

        call.dial();

        return call;
      },
      dialVideo: function(number, simIndex) {
        debug('dial', number);

        var call = createNewCall(getId(), number, true, null);

        navigator.sendToSystemApp({
          type: 'create-new-call',
          id: call.id,
          number: call.number,
          video: call.video,
          state: call.state
        });

        call.dial();

        return call;
      },
      startTone: function() {
        debug('startTone', arguments);
      },
      stopTone: function() {
        debug('endTone', arguments);
      },
      addEventListener: function(ev, cb) {
        _events[ev] = _events[ev] || [];
        _events[ev].push(cb);
      },
      removeEventListener: function(ev, cb) {
        if (!_events[ev]) return false;
        _events[ev].splice(_events[ev].indexOf(cb), 1);
      },
      trigger: trigger
    };

    navigator.sendToSystemApp({
      type: 'ping'
    });

    return api;
  }


  if ((''+window.location).indexOf('system.gaiamobile.org') > -1) {
    tMaster();

    FFOS_RUNTIME.makeNavigatorShim('mozTelephony',
                                    tContent(), true);
  }
  else {


    FFOS_RUNTIME.makeNavigatorShim('mozTelephony',
                                    tContent(), true);
  }
})();
