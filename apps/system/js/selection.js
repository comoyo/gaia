/**
 * Codez that will run in the system app on FxOS
 */
(function() {
  function debug() {
    dump('System SelectionHandler: ' +
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' ') + '\n');
  }

  var ADJUST_X, ADJUST_Y;

  function onResize() {
    ADJUST_X = window.mozInnerScreenX - window.screenX;
    ADJUST_Y = window.mozInnerScreenY - window.screenY;
    debug('system app adjust', ADJUST_X, ADJUST_Y);
  }
  onResize();
  window.addEventListener('resize', onResize);

  if (ADJUST_Y === 22) { // B2G desktop on OSX gives QUERY_CARET_RECT back
  // without window chrome
    ADJUST_Y = 0;
  }
  var LAST_ID;

  function sendContentEvent(name, data) {
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent('mozContentEvent', true, true,
      { type: 'selection', name: name, data: data, id: LAST_ID });
    window.dispatchEvent(event);
  }

  /**
   * Handle class
   */
  function Handle(handleType) {
    var self = this;

    this._el = null;
    this._gd = null;

    this.init = function() {
      var e = self._el = document.createElement('div');
      e.classList.add('caret');
      e.classList.add(handleType.toLowerCase());
      document.body.appendChild(e);

      var gd = this._gd = new GestureDetector(e, {
        panThreshold: 1,
        mousePanThreshold: 1
      });
      gd.startDetecting();

      // e.addEventListener('touchstart', function(ev) {
      //   debug('caret touchstart happened');
      //   ev.preventDefault();
      //   ev.stopPropagation();
      //   return false;
      // });
      e.addEventListener('pan', function(ev) {
        self.onPan(ev);
      });
      e.addEventListener('swipe', function(ev) {
        // self.onSwipe(ev);
      });

      e.addEventListener('touchmove', function(ev) {
        debug('touchmove', ev.changedTouches[0].clientX);
      });
      e.addEventListener('touchend', function(ev) {
        debug('touchend', ev.changedTouches[0].clientX);
      });

      self.hide();
    };

    this.show = function() {
      // debug('show', handleType);
      delete self._el.dataset.hidden;
    };

    this.hide = function() {
      // debug('hide', handleType);
      self._el.dataset.hidden = true;
    };

    this.setPosition = function(x, y) {
      x -= ADJUST_X;
      y -= ADJUST_Y;

      // debug('setPosition', handleType, x, y);
      self._el.style.left = x + 'px';
      self._el.style.top = y + 'px';
    };

    this.onPan = function(e) {
      debug('onPan', e.detail.position.clientX);
      self._gd.stopDetecting();

      sendContentEvent('TextSelection:Move', {
        handleType: handleType,
        x: e.detail.position.clientX + ADJUST_X,
        y: e.detail.position.clientY + ADJUST_Y
      });

      self._gd.startDetecting();
    };

    this.onSwipe = function(e) {
      debug('onSwipe', e.detail.end.clientX);
      self._gd.stopDetecting();

      sendContentEvent('TextSelection:Move', {
        handleType: handleType,
        x: e.detail.end.clientX + ADJUST_X,
        y: e.detail.end.clientY + ADJUST_Y
      });

      self._gd.startDetecting();
    };

    this.init();
  }

  var handles = {
    'MIDDLE': new Handle('MIDDLE')
  };

  window.addEventListener('mozChromeEvent', function(evt) {
    if (evt.detail.type !== 'selection') {
      return;
    }

    LAST_ID = evt.detail.id;

    var msg = JSON.parse(evt.detail.msg);
    switch (msg.type) {
      case 'TextSelection:ShowHandles':
        if (!msg.handles) {
          return debug('ShowHandles called without handles');
        }
        msg.handles.forEach(function(n) {
          handles[n].show();
        });
        break;
      case 'TextSelection:HideHandles':
        if (!msg.handles) {
          msg.handles = Object.keys(handles); // hide all
        }
        msg.handles.forEach(function(n) {
          handles[n].hide();
        });
        break;
      case 'TextSelection:PositionHandles':
        if (msg.rtl) {
          debug('!!! Need to implement RTL!');
        }
        msg.positions.forEach(function(pos) {
          var handle = handles[pos.handle];
          if (!handle) return debug('Could not find handle', pos.handle);

          handle.setPosition(pos.left, pos.top);
          pos.hidden ? handle.hide() : handle.show();
        });
        break;
    }

    // margin-top is 183 or 184 on my system
    // margin-left is 35 or 36 px

    // debug('Selection event', evt.detail.msg);
  });
})();
