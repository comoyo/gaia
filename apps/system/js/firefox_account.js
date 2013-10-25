'use strict';

var FirefoxAccount = {
  init: function() {
    var container = document.querySelector('#firefox-account-container');
    var fx_acct_frame = document.createElement('iframe');

    fx_acct_frame.id = 'firefox-account-frame';
    fx_acct_frame.setAttribute('src', '../firefox_account.html');
    //TrustedUIManager.open('Firefox Acct', iframe);
    window.i = fx_acct_frame;
    container.appendChild(fx_acct_frame);
  }
};

FirefoxAccount.init();
