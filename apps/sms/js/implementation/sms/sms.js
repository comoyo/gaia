/**
 * This is a file that handles SMS communications for the messaging app
 * If we're running in the desktop we'll use a shim, otherwise the mozSMS API
 */
/*global LazyLoader EventEmitter */
(function() {

  function Sms() {
    var self = this;

    /**
     * Which contact fields do we handle?
     */
    this.handles = ['tel'];

    /**
     * Initialize the SMS implementation, load the shim if on desktop
     */
    this.init = function(callback) {
      self.mozSms = navigator.mozSms;
      // @todo, I think it's better to move this into the Firefox-OS-Runtime
      // rather than having it in Gaia Core...
      if (!self.mozSms) {
        LazyLoader.load(['js/implementation/sms/sms_mock.js'], function() {
          self.mozSms = window.MockNavigatormozSms;
          self.attachHandlers();
          callback();
        });
      }
      else {
        self.attachHandlers();
        callback();
      }
    };

    /**
     * Forward events
     */
    this.attachHandlers = function() {
      ['received', 'sending', 'sent', 'failed'].forEach(function(name) {
        self.mozSms.addEventListener(name, function(ev) {
          self.dispatchEvent(name, ev);
        });
      });

      this.getThreadList = this.mozSms.getThreadList;
      this.getMessages = this.mozSms.getMessages;
      this.delete = this.mozSms.delete;
      this.send = this.mozSms.send;
      this.getSegmentInfoForText = this.mozSms.getSegmentInfoForText;
      this.markMessageRead = this.mozSms.markMessageRead;
    };
  }

  Sms.prototype = EventEmitter.prototype;

  window.messaging = window.messaging || {};
  window.messaging.sms = new Sms();
})();
