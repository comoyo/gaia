// An example function implementing custom logic for navigation
Navigation.url['fxa-login-password'] = function(goto) {
  Navigation.overlay.show('Waiting!');
  setTimeout(function() {
    Navigation.progress(10);
    Navigation.overlay.hide();
    goto('fxa-login-accept');
  }, 1000);
};
