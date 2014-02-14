var inputContext = null;
var keyboardElement;

function init() {
  keyboardElement = document.getElementById('keyboard');

  window.navigator.mozInputMethod.oninputcontextchange = function() {
    inputContext = navigator.mozInputMethod.inputcontext;
    resizeWindow();
  };

  window.addEventListener('resize', resizeWindow);

  keyboardElement.addEventListener('mousedown', function onMouseDown(evt) {
  // Prevent loosing focus to the currently focused app
  // Otherwise, right after mousedown event, the app will receive a focus event.
    evt.preventDefault();
  });

  var sendKeyElement = document.getElementById('sendKey');
  sendKeyElement.addEventListener('click', function sendKeyHandler() {
    var testString = 'abcdefghijklmnopqrstuvwxyz';

    var si = setInterval(function() {
      sendKey(testString.charCodeAt(0));
      testString = testString.substr(1);
      if (!testString) {
        clearInterval(si);
      }
    }, 50);
  });

  var switchElement = document.getElementById('switchLayout');
  switchElement.addEventListener('click', function switchHandler() {
    var mgmt = navigator.mozInputMethod.mgmt;
    mgmt.next();
  });

  // long press to trigger IME menu
  var menuTimeout = 0;
  switchElement.addEventListener('touchstart', function longHandler() {
    menuTimeout = window.setTimeout(function menuTimeout() {
      var mgmt = navigator.mozInputMethod.mgmt;
      mgmt.showAll();
    }, 700);
  });

  switchElement.addEventListener('touchend', function longHandler() {
    clearTimeout(menuTimeout);
  });
}

function resizeWindow() {
  window.resizeTo(window.innerWidth, keyboardElement.clientHeight);
}

function sendKey(keyCode) {
  dump(+new Date() + ' dispatch sendKey ' + keyCode + '\n');
  switch (keyCode) {
  case KeyEvent.DOM_VK_BACK_SPACE:
  case KeyEvent.DOM_VK_RETURN:
    if (inputContext) {
      inputContext.sendKey(keyCode, 0, 0);
    }
    break;

  default:
    if (inputContext) {
      inputContext.sendKey(0, keyCode, 0);
    }
    break;
  }
}

window.addEventListener('load', init);
