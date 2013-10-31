'use strict';

var FxUI = {
  dialog: null,
  panel: null,
  init: function fxa_ui_init() {
    var dialogOptions = {
      onHide: this.reset
    };
    this.dialog = SystemDialog('fxa-dialog', dialogOptions);
    this.panel = document.getElementById('fxa-dialog');
    this.iframe = document.createElement('iframe');
    this.iframe.id = 'fxa-iframe';
  },
  // Sign in/up flow
  login: function fxa_ui_login() {
    this.loadFlow('login');
  },
  // Logout flow
  logout: function fxa_ui_login() {
    this.loadFlow('logout');
  },
  // Delete flow
  delete: function fxa_ui_delete() {
    this.loadFlow('delete');
  },
  // Method which close the Dialog
  close: function fxa_ui_end() {
    this.dialog.hide();
  },
  // Method for reseting the panel
  reset: function fxa_ui_reset() {
    this.panel.innerHTML = '';
  },
  // Method for loading the iframe with the flow required
  loadFlow: function fxa_ui_loadFlow(flow) {
    this.iframe.setAttribute('src', '../fxa/fxa_module.html#' + flow);
    this.panel.appendChild(this.iframe);
    this.dialog.show();
  },
  // Method for sending the email to the App
  // which request FxAccounts
  done: function(params) {
    // TODO: Sent to fxa_manager email
    // info retrieved
  }
};

FxUI.init();

