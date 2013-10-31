/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var FxaModuleManager = {
  paramsRetrieved: {},
  init: function() {
    var flow = window.location.hash.replace('#', '');
    FxaModuleUI.init(flow);
  },
  setParam: function(key, valye) {
    paramsRetrieved[key] = value;
  },
  done: function() {
   // Send params to the System
   window.parent.FxUI.done(paramsRetrieved);
  },
  close: function() {
    window.parent.FxUI.close();
  }
};

window.addEventListener('load', function load() {
  window.removeEventListener('load', load);
  FxaModuleManager.init();
});
