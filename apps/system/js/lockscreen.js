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
      frame.classList.add('remove');
    } else {
      mainScreen.classList.remove('locked');
      frame.classList.add('uninit');
      mainScreen.focus();
    }
  }

  function postToLockScreen() {
    var args = Array.prototype.slice.call(arguments);
    frame.contentWindow.postMessage(
      args.join('::'), 'app://system.gaiamobile.org');
  }

  LockScreen = {
    /**
     * Boolean return the status of the lock screen.
     * Must not mutate directly - use unlock()/lockIfEnabled()
     * Listen to 'lock' and 'unlock' event to properly handle status changes
     */
    locked: true,

    /**
     * Boolean return whether if the lock screen is enabled or not.
     * Must not mutate directly - use setEnabled(val)
     * Only Settings Listener should change this value to sync with data
     * in Settings API.
     */
    enabled: true,

    msgListener: function(e) {
      if (e.origin == 'app://system.gaiamobile.org') {
        var args = e.data.split('::');
        var action = args[0];
        switch (action) {
          case 'locked':
            this.locked = args[1] === 'true';
            onLockChange(this.locked);
            break;
          case 'enabled':
            this.enabled = args[1] === 'true';
            break;
          case 'lockIfEnabled':
            this.lockIfEnabled(args[1] && args[1] === 'true');
            break;
        }
      }
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
