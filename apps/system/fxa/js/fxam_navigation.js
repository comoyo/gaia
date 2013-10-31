'use strict';

var FxaModuleNavigation = {
  view: null,
  stepCount: 0,
  currentStep: null,
  maxSteps: null,
  init: function(flow) {
    // Load view
    LazyLoader._js('view/view_' + flow + '.js', function loaded() {
      this.view = View;
      this.maxSteps = Object.keys(View).length;
      this.currentStep = this.view[0];

      FxaModuleUI.setMaxSteps(Object.keys(View).length);
      FxaModuleUI.loadStep(this.currentStep.id, 0);
    }.bind(this));
  },
  back: function() {
    this.currentStep = this.view[--this.stepCount];
    FxaModuleUI.loadStep(this.currentStep.id, this.stepCount);
  },
  next: function() {
    this.currentStep = this.view[++this.stepCount];
    if (this.stepCount > this.maxSteps - 1) {
      FxaModuleManager.close();
    } else {
      FxaModuleUI.loadStep(this.currentStep.id, this.stepCount);
    }
  }
};


