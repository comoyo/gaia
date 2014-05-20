var MockCallHandler = {
  _lastCall: null,
  _lastVideoCall: null,

  call: function call(number) {
    this._lastCall = number;
  },

  videoCall: function call(number) {
    this._lastVideoCall = number;
  }
};
