/* -*- Mode: js; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var lazyLoadFiles = [
  'shared/js/async_storage.js',
  'shared/js/l10n_date.js',
  'shared/js/custom_dialog.js',
  'shared/js/notification_helper.js',
  'js/event_emitter.js',
  'js/async.js',
  'js/blacklist.js',
  'js/contacts.js',
  'js/message_manager.js',
  'js/thread_list_ui.js',
  'js/thread_ui.js',
  'js/waiting_screen.js',
  'js/utils.js',
  'js/fixed_header.js',
  'js/activity_picker.js',
  'js/link_helper.js',
  'js/action_menu.js',
  'js/link_action_handler.js',
  'shared/style/input_areas.css',
  'shared/style/switches.css',
  'shared/style/confirm.css',
  'shared/style_unstable/progress_activity.css',
  'style/custom_dialog.css',
  'shared/style/action_menu.css',
  'shared/style/responsive.css'
];

window.addEventListener('localized', function showBody() {
  // Set the 'lang' and 'dir' attributes to <html> when the page is translated
  document.documentElement.lang = navigator.mozL10n.language.code;
  document.documentElement.dir = navigator.mozL10n.language.direction;
});

window.addEventListener('load', function() {
  function initUIApp() {
    // Init UI Managers
    ThreadUI.init();
    ThreadListUI.init();
    // We render the threads
    MessageManager.getThreads(ThreadListUI.renderThreads);
    // We add activity/system message handlers
    LazyLoader.load(['js/activity_handler.js']);
  }

  navigator.mozL10n.ready(function waitLocalizedForLoading() {
    LazyLoader.load(lazyLoadFiles, function() {
      // poor mans dependency injection
      window.messaging = window.messaging || {};
      var MessageManager = window.MessageManager = new MessageManagerCtor(
        Contacts, ThreadUI, ThreadListUI, Utils, window.messaging);

      // init the implementations here!
      var impls = {
        'sms': 'js/implementation/sms/sms.js',
        'smsplus': 'js/implementation/smsplus/smsplus.js'
      };
      var completed = 0;

      var keys = Object.keys(impls);

      LazyLoader.load(keys.map(function(k) {
        return impls[k];
      }), function() {
        keys.map(function(k) {
          return window.messaging[k];
        }).filter(function(i) {
          return !!i;
        }).forEach(function(i) {
          i.init(function() {
            if (++completed === keys.length) {
              MessageManager.init(initUIApp);
            }
          });
        });
      });
    });
  });
});
