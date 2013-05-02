/* -*- Mode: js; js-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

(function() {
  var settings = window.navigator.mozSettings;
  var usernameField = document.getElementById('smsPlusUserInput');
  var passwordField = document.getElementById('smsPlusUserPassword');
  var smsPlusButton = document.getElementById('smsPlusUpdateCredentialsButton');

  // Try to set username and password fields if we already have their values
  var usernameReq = settings.createLock().get('smsplus.username');
  usernameReq.onsuccess = function() {
    usernameField.value = usernameReq.result;

    var passwordReq = settings.createLock().get('smsplus.password');
    passwordReq.onsuccess = function() {
      passwordField.value = passwordReq.result;
    };
    passwordReq.onerror = function() {};
  };
  usernameReq.onerror = function() {};

  smsPlusButton.addEventListener('click', function() {
    var setSettings = settings.createLock().set({
      'smsplus.username': usernameField.value,
      'smsplus.password': passwordField.value
    });
    setSettings.onsuccess = function() {
      console.log('SMS+ credentials successfully set');
    };
    setSettings.onerror = function() {
      console.log('There was an error setting SMS+ credentials');
    };
  });
})();

