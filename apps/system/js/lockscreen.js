var LockScreen;
(function() {
  'use strict';

  var mainScreen = document.getElementById('screen');
  var frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.id = 'lockscreen';
  frame.src = './lockscreen/index.html';
  frame.setAttribute('data-z-index-level', 'lockscreen');
  frame.onload = function() {
    // Avoid 'white flash' while loading iframe
    frame.style.display = 'block';
  };

  mainScreen.appendChild(frame);

  function onLockChange(locked) {
    if (locked === true) {
      mainScreen.classList.add('locked');
      screen.mozLockOrientation('portrait-primary');
    } else {
      mainScreen.classList.remove('locked');
      mainScreen.focus();
    }
  }

  LockScreen = {
    /*
     * Boolean return the status of the lock screen.
     * Must not mutate directly - use unlock()/lockIfEnabled()
     * Listen to 'lock' and 'unlock' event to properly handle status changes
     */
    _locked: true,
    get locked() {
      return this._locked;
    },
    set locked(v) {
      this._locked = !! v;
      onLockChange(this._locked);
      return this._locked;
    },

    /*
     * Boolean return whether if the lock screen is enabled or not.
     * Must not mutate directly - use setEnabled(val)
     * Only Settings Listener should change this value to sync with data
     * in Settings API.
     */
    enabled: true,

    lock: function(instant) {
      frame.contentWindow.LockScreen.lock(!!instant);
    },
    unlock: function(instant, detail) {
      frame.contentWindow.LockScreen.unlock(!!instant, (detail || ''));
    },
    setCellbroadcastLabel: function(label) {
      frame.contentWindow.LockScreen.setCellbroadcastLabel(label);
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
})();

