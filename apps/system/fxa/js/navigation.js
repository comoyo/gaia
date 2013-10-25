/** Navigation works by looking for a data-href attribute on the element for
  * direct navigation or failing that a controller function corresponding
  * to the current url hash for navigation involving logic.
  * Direct navigation example:
  *   <button class="nav" data-href="#hash>Next</button>
  * Navigation example involving logic in Navigation.url[current-hash]:
  *   <button class="nav"><button>
  * @this Navigation object
  */
var Navigation = {
  init: function() {
    this._initTransitions();
  },

  _initTransitions: function() {
    var self = this;

    function animTransition() {
      var current = document.querySelector('.current');
      var next = location.hash ? document.querySelector(location.hash) : null;
      var back = current.classList.contains('back');

      if (!current || !next)
        return;

      if (!next.classList.contains('loaded')) {
          LazyLoader.load(next, function loaded() {
            self._initScreen(next);
          });
      }

      function inTransition(elem) {
        if (current.classList.contains('currentToRight'))
          return true;
        if (current.classList.contains('currentToLeft'))
          return true;
        if (current.classList.contains('rightToCurrent'))
          return true;
        if (current.classList.contains('leftToCurrent'))
          return true;
        return false;
      }

      if (inTransition(current) || inTransition(next))
        return;

      current.addEventListener('animationend', function fromAnimEnd() {
        current.removeEventListener('animationend', fromAnimEnd, false);
        current.classList.remove(back ? 'currentToRight' : 'currentToLeft');
        current.classList.remove('current');
        current.classList.remove('back');
      }, false);
      next.addEventListener('animationend', function toAnimEnd() {
        next.removeEventListener('animationend', toAnimEnd, false);
        next.classList.remove(back ? 'leftToCurrent' : 'rightToCurrent');
        next.classList.add('current');
      }, false);

      current.classList.add(back ? 'currentToRight' : 'currentToLeft');
      next.classList.add(back ? 'leftToCurrent' : 'rightToCurrent');
    }

    window.addEventListener('hashchange', animTransition, false);
    // First page load
    window.addEventListener('load', function() {
      var elem = document.querySelector(location.hash || '#fxa-login-accept');
      LazyLoader.load(elem, function() {
        Navigation._initScreen(elem);
        elem.classList.add('current');
      });
    }, false);
  },

  _initScreen: function(screen) {
    if (!screen || !screen.classList || !screen.classList.contains('screen'))
      return;
    var self = this;
    screen.classList.add('loaded');

    // Add navigation listeners
    Array.prototype.slice.call(screen.querySelectorAll('.nav'))
      .forEach(function(button) {
      button.addEventListener('click', function() {
        var button = this;
        if ('href' in button.dataset) {
          // If the buttons contains back, we'll add it to the screen
          // so it'll be animated in reverse
          if (button.classList.contains('back'))
            document.querySelector('.current').classList.add('back');
          location.hash = button.dataset.href;
          return;
        }
        var hash = location.hash ? location.hash.substring(1) : '';
        if (hash in self.url &&
            typeof self.url[hash] === 'function') {
          self.url[hash](function goToScreen(nextScreen) {
            if (button.classList.contains('back'))
              document.querySelector('.current').classList.add('back');
            location.hash = nextScreen;
          });
          return;
        }
      }, false);
    });

    // Load scripts
    var scripts = Array.prototype.slice.call(screen.querySelectorAll('script'))
      .map(function(script) { return script.getAttribute('src'); });
    LazyLoader.load(scripts);

  },
  progress: function(value) {
    document.querySelector('#fxa-progress').value = value;
  },
  overlay: {
    show: function overlayShow(string) {
      var overlay = document.querySelector('#fxa-overlay');
      var message = document.querySelector('#fxa-overlay-msg');
      if (!overlay || !message)
        return;

      message.textContent = string;
      overlay.classList.add('show');
    },
    hide: function() {
      var overlay = document.querySelector('#fxa-overlay');
      if (!overlay)
        return;

      overlay.classList.remove('show');
    }
  },
  url: {
    'fxa-login-password': function(callback) {
      // An example function being called when fxa-login-password triggers
      // see fxa/js/fxa-login-password.js for how to append these
      utils.overlay.show('Hey you!');
    }
  }
};

Navigation.init();
