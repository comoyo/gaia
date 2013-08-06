var LockScreen;
(function() {
  'use strict';

  var frame = document.createElement('iframe');
  frame.id = 'lockscreen';
  frame.src = './lockscreen/index.html';
  frame.classList.add('uninit');
  frame.setAttribute('data-z-index-level', 'lockscreen');

  var mainScreen = document.getElementById('screen');
  mainScreen.appendChild(frame);

  function onLockChange(locked) {
    if (locked === true) {
      mainScreen.classList.add('locked');
      screen.mozLockOrientation('portrait-primary');
      frame.style.display = 'block';
    } else {
      mainScreen.classList.remove('locked');
      frame.style.display = 'none';
      mainScreen.focus();
    }
  }

  function postToLockScreen() {
    var args = Array.prototype.slice.call(arguments);
    frame.contentWindow.postMessage(
      args.join('::'), 'app://system.gaiamobile.org');
  }

  LockScreen = {
    /*
     * Boolean return true when initialized.
     */
    ready: false,

    /*
     * Boolean return the status of the lock screen.
     * Must not mutate directly - use unlock()/lockIfEnabled()
     * Listen to 'lock' and 'unlock' event to properly handle status changes
     */
    locked: true,

    /*
     * Boolean return whether if the lock screen is enabled or not.
     * Must not mutate directly - use setEnabled(val)
     * Only Settings Listener should change this value to sync with data
     * in Settings API.
     */
    enabled: true,

    /*
     * Boolean return whether if the lock screen is enabled or not.
     * Must not multate directly - use setPassCodeEnabled(val)
     * Only Settings Listener should change this value to sync with data
     * in Settings API.
     * Will be ignored if 'enabled' is set to false.
     */
    passCodeEnabled: false,

    /*
     * Four digit Passcode
     * XXX: should come for Settings
     */
    passCode: '0000',

    /*
     * The time to request for passcode input since device is off.
     */
    passCodeRequestTimeout: 0,

    /*
     * Store the first time the screen went off since unlocking.
     */
    _screenOffTime: 0,

    /*
     * Check the timeout of passcode lock
     */
    _passCodeTimeoutCheck: false,

    /*
     * Current passcode entered by the user
     */
    passCodeEntered: '',

    /**
     * Are we currently switching panels ?
     */
    _switchingPanel: false,

    /*
     * Timeout after incorrect attempt
     */
    kPassCodeErrorTimeout: 500,

    /*
     * Airplane mode
     */
    airplaneMode: false,

    /*
     * Timeout ID for backing from triggered state to normal state
     */
    triggeredTimeoutId: 0,

    /*
     * Types of 2G Networks
     */
    NETWORKS_2G: ['gsm', 'gprs', 'edge'],
    msgListener: function(e) {
      //if(e.origin == 'http://origin-domain.com') {
      // e.data is the string sent by the origin with postMessage.
      var args = e.data.split('::');
      var func = args[0];
      switch (func) {
        case 'locked':
          this.locked = args[1] === 'true';
          onLockChange(this.locked);
          break;
        case 'lockIfEnabled':
          this.lockIfEnabled(args[1] && args[1] === 'true');
          break;
      }
      //}
    },
    lock: function(instant) {
      postToLockScreen('lock', !!instant);
    },
    unlock: function(instant, detail) {
      postToLockScreen('unlock', !!instant, (detail || ''));
    },
    setCellbroadcastLabel: function(label) {
      postToLockScreen('setCellbroadcastLabel', label);
    },

    lockIfEnabled: function ls_lockIfEnabled(instant) {
      if (FtuLauncher && FtuLauncher.isFtuRunning()) {
        this.unlock(instant);
        return;
      }

      if (this.enabled) {
        this.lock(instant);
      } else {
        this.unlock(instant);
      }
    }
  };

  window.addEventListener('message', function(msg) {
    LockScreen.msgListener(msg);
  }, false);
})();
