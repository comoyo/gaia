/*global Components:false, dump:false, XPCOMUtils:false, Services:false,
            content:false SelectionHandler:false */
/*jshint esnext:true, moz:true */

"use strict";

var inXPCom = !(typeof Components === 'undefined' ||
  typeof Components.utils === 'undefined');
  
let uuidGenerator = Cc["@mozilla.org/uuid-generator;1"]
                      .getService(Components.interfaces.nsIUUIDGenerator);

let UUID = uuidGenerator.generateUUID().toString();
var TAP_ENABLED = true;

function debug() {
  // Prefer dump, but also needs to run in browser environment
  if (inXPCom) {
    dump('==AndroidSelectionHandler: ' +
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' ') + '\n');
  }
  else {
    console.log(
      [].slice.call(arguments).map(function(a) {
        return JSON.stringify(a, null, 4);
      }).join(' '));
  }
}

function XPComInit() {
  var Ci = Components.interfaces;
  var Cc = Components.classes;
  var Cu = Components.utils;
  
  Cu.import("resource://gre/modules/Services.jsm");
  Cu.import('resource://gre/modules/XPCOMUtils.jsm');

  XPCOMUtils.defineLazyGetter(this, "domWindowUtils", function () {
    return content.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIDOMWindowUtils);
  });

  XPCOMUtils.defineLazyModuleGetter(this, "Rect",
                                  "resource://gre/modules/Geometry.jsm");
   
  var els = Cc["@mozilla.org/eventlistenerservice;1"]
              .getService(Ci.nsIEventListenerService);
  
  var addEv = function(target, type, handler) {
    // Using the system group for mouse/touch events to avoid
    // missing events if .stopPropagation() has been called.
    els.addSystemEventListener(target, 
                              type,
                              handler,
                              /* useCapture = */ false);
  };
  
  var removeEv = function(target, type, handler) {
    els.removeSystemEventListener(target, 
                              type,
                              handler,
                              /* useCapture = */ false);
  };
  
  content.document.addEventListener('DOMContentLoaded', function() {
    selectionGlue(content.document.defaultView, content.document, addEv, removeEv);
  });
  
  /**
   * This code should be in b2g/chrome/content/shell.js
   */
  content.addEventListener('mozContentEvent', function(evt) {
    var detail = evt.detail;
  
    switch(detail.type) {
      case 'selection':
        if (detail.id !== UUID) return;
        
        debug('Yay i has selection')

        // do it at next tick so the gesturedetector has stopped
        // @todo, does gd.stopDetecting() works as well?
        content.setTimeout(function() {
          TAP_ENABLED = false;
          SelectionHandler.observe(null, detail.name, JSON.stringify(detail.data));
          TAP_ENABLED = true;
        });
        break;
    }
  });
  
  content.addEventListener('mousedown', function(evt) {
    debug('untrusted mousedown', content.location + '', evt.clientX, evt.clientY);
  }, true, true);
  
  content.addEventListener('mousedown', function(evt) {
    debug('trusted mousedown', content.location + '', evt.clientX, evt.clientY);
  });
  
  content.addEventListener('click', function(evt) {
    debug('click', content.location + '', evt.clientX, evt.clientY);
  }, true, true);
}

function BrowserInit() {
  document.addEventListener('DOMContentLoaded', function() {
    var addEv = function(target, type, handler) {
      target.addEventListener(type, handler);
    };
    
    var removeEv = function(target, type, handler) {
      target.removeEventListener(type, handler);
    };
    
    selectionGlue(window, document, addEv, removeEv);
  });
}

if (inXPCom) {
  XPComInit();
}
else {
  BrowserInit();
}
var BrowserApp = {
  deck: {
    addEventListener: function(n) {
      debug('BrowserApp.deck.addEventListener', n);
    },
    removeEventListener: function(n) {
      debug('BrowserApp.deck.removeEventListener', n);
    }
  },
  selectedBrowser: {
    contentWindow: content.document.defaultView
  }
};

var sendMessageToJava = function(msg) {
  let browser = Services.wm.getMostRecentWindow("navigator:browser");
  browser.shell.sendChromeEvent({
    type: "selection",
    msg: JSON.stringify(msg),
    id: UUID
  });
};

function selectionGlue(win, doc, addEv, removeEv) {
  // function Handle(handleType) {
  //   var self = this;
    
  //   this._el = (function() {
  //     var e = doc.createElement('div');
  //     e.classList.add('handle');
  //     e.style = 'position: absolute; background: green; width: 5px; height: 10px; z-index: 99999;';// + HANDLE_MARGIN + 'px;';
  //     e.style.display = 'none';
  //     doc.body.appendChild(e);
      
  //     return e;
  //   })();
    
  //   this.hidden = true;
    
  //   this.show = function() {
  //     self.hidden = false;
  //     self._el.style.display = 'block';
  //   };
    
  //   this.hide = function() {
  //     self.hidden = true;
  //     //self._el.style.display = 'none';
  //   };
    
  //   this.setPosition = function(x, y) {
  //     debug('setPosition', '"' + x + 'px"', y);
  //     self._el.style.left = x + 'px';
  //     self._el.style.top = y + 'px';
  //   };
    
    /*
        JSONObject args = new JSONObject();
        try {
            args.put("handleType", mHandleType.toString());
            args.put("x", (int) geckoPoint.x);
            args.put("y", (int) geckoPoint.y);
        } catch (Exception e) {
            Log.e(LOGTAG, "Error building JSON arguments for TextSelection:Move");
        }
        GeckoAppShell.sendEventToGecko(GeckoEvent.createBroadcastEvent("TextSelection:Move", args.toString()));
    */

  //   addEv(win, 'touchstart', function ots(e) {
  //     if (!TAP_ENABLED) return;
  //     if (e.touches.length > 1) return;
  //     if (e.touches[0].target !== self._el) return;
  //     if (e.touches[0].target.ownerDocument !== doc) return;
      
  //     var startY = e.touches[0].clientY;
      
  //     // we know that Y is 36 too high on B2G desktop...
  //     startY -= 36;
      
  //     e.stopPropagation();
  //     e.preventDefault();
      
  //     debug('touchstart of', handleType, 'started');
      
  //     var otm, ote;
      
  //     addEv(win, 'touchmove', otm = function(e) {
  //       if (!TAP_ENABLED) return;
  //       if (e.changedTouches[0].target !== self._el) return;
        
  //       e.stopPropagation();
  //       e.preventDefault();
        
  //       debug('touchmove happened', e.changedTouches[0].clientX, e.changedTouches[0].clientY - HANDLE_MARGIN);
        
  //       // // Disable tap because this creates tap events itself
  //       // TAP_ENABLED = false;
        
  //       // // This should be in move but TextSelection:Move synths a fake mouse event
  //       // // that then gets translated in fake touchevent blablabla
  //       // broadcast('TextSelection:Move', {
  //       //   handleType: handleType,
  //       //   x: e.changedTouches[0].clientX,
  //       //   y: e.changedTouches[0].clientY - HANDLE_MARGIN
  //       // });
        
  //       // TAP_ENABLED = true;
        
  //       return false;
  //     });
      
  //     addEv(win, 'touchend', ote = function(e) {
  //       if (!TAP_ENABLED) return;
  //       if (e.changedTouches[0].target !== self._el) return;
        
  //       e.stopPropagation();
  //       e.preventDefault();
        
  //       debug('touchend happened', {
  //         x: e.changedTouches[0].clientX,
  //         y: startY
  //       });
  //       removeEv(win, 'touchmove', otm);
  //       removeEv(win, 'touchend', ote);
        
  //       // Disable tap because this creates tap events itself
  //       TAP_ENABLED = false;
        
  //       // This should be in move but TextSelection:Move synths a fake mouse event
  //       // that then gets translated in fake touchevent blablabla
  //       broadcast('TextSelection:Move', {
  //         handleType: handleType,
  //         x: e.changedTouches[0].clientX,
  //         y: startY
  //       });
        
  //       self.updatePosition();
        
  //       TAP_ENABLED = true;
        
  //       return false;
  //     });
      
  //     return false;
  //   });
    
  //   /**
  //   * Android and FFOS work a bit different, so the position is not right yet
  //   * have to timeout and request again
  //   */
  //   this.updatePosition = function() {
  //     win.setTimeout(function() {
  //       if (self.hidden) return;

  //       TAP_ENABLED = false;
        
  //       broadcast('TextSelection:Position', { handleType: handleType });
        
  //       TAP_ENABLED = true;
  //     }, 50);
  //   };
  // }
  
  // var handles = {
  //   'START': new Handle('START'),
  //   'MIDDLE': new Handle('MIDDLE'),
  //   'END': new Handle('END')
  // };
  
  // === Glue between browser & SelectionHandler (in Android this lives in mobile/android/chrome/browser.js ===
  eventbus.on('tap', function(e) {
    debug('tap happened');
    
    var element = e.target;
    if (!element.disabled &&
        ((element instanceof win.HTMLInputElement && element.mozIsTextField(false)) ||
        (element instanceof win.HTMLTextAreaElement))) {
      debug('Ill be attaching my caret');
      win.setTimeout(function() {
        SelectionHandler.attachCaret(element);
      }, 10); // make sure the browser sets selection first
      
      // ['MIDDLE'].forEach(function(k) {
      //   handles[k].updatePosition();
      // });
    }
  });
  
  // eventbus.on('TextSelection:ShowHandles', function(e) {
  //   debug('Showing', e.handles);
  //   if (!e.handles) e.handles = ['START', 'MIDDLE', 'END'];
    
  //   e.handles.map(function(n) {
  //     return handles[n];
  //   }).forEach(function(handle) {
  //     handle.show();
  //   });
  // });
  
  // eventbus.on('TextSelection:HideHandles', function(e) {
  //   debug('Hiding', e.handles);
  //   if (!e.handles) e.handles = ['START', 'MIDDLE', 'END']; // hide all
    
  //   e.handles.map(function(n) {
  //     return handles[n];
  //   }).forEach(function(handle) {
  //     handle.hide();
  //   });
  // });
  
  /*
      "type": "TextSelection:PositionHandles",    "positions": [
        {
            "handle": "MIDDLE",
            "left": 51,            "top": 134,
            "hidden": false
        }
    ],
    "rtl": false
    */
  // eventbus.on('TextSelection:PositionHandles', function(e) {
  //   if (e.rtl) {
  //     debug('!!! Need to implement RTL!');
  //   }
  //   e.positions.forEach(function(pos) {
  //     var handle = handles[pos.handle];
  //     handle.setPosition(pos.left, pos.top);
  //     pos.hidden ? handle.hide() : handle.show();
  //   });
  // });
  
  // === Other glueeee

  // Longtap handler
  (function longtapHandler() {
    var eventName = 'longtap';
    var timeout = 400;
    var touchTimeout; // when did touch start start?
    var startX, startY, target;
    
    // shit thats important: longtap
    addEv(doc.body, 'touchstart', function(e) {
      if (e.touches.length > 1) return;
      if (e.touches[0].target.ownerDocument !== doc) return;
      
      target = e.touches[0].target;
      
      // is target contenteditable or an input field we continue
      // if (!(target.isContentEditable ||
      //     target.designMode == "on" ||
      //     target instanceof HTMLInputElement ||
      //     target instanceof HTMLTextAreaElement)) {
      //   return;
      // }
      
      touchTimeout = win.setTimeout(function() {
        eventbus.emit(eventName, { target: target, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
      }, timeout);
      startX = e.touches[0].pageX;
      startY = e.touches[0].pageY;
    });
    
    addEv(doc.body, 'touchmove', function(e) {
      if (!touchTimeout) return;
      
      if (Math.abs(e.touches[0].pageX - startX) > 10 ||
          Math.abs(e.touches[0].pageY - startY) > 10 ||
          e.touches[0].target !== target) {
        win.clearTimeout(touchTimeout);
      }
    });
    
    addEv(doc.body, 'touchend', function() {
      win.clearTimeout(touchTimeout);
    });
  })();
  
  // Normal tap handler
  (function tapHandler() {
    var target;
    var startX, startY;
    var now;

    addEv(doc.body, 'touchstart', function(e) {
      if (!TAP_ENABLED) return;
      if (e.touches.length > 1) return;
      if (e.touches[0].target.ownerDocument !== doc) return;
      
      target = e.touches[0].target;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      now = +new Date;
    });
    
    addEv(doc.body, 'touchend', function(e) {
      if (!TAP_ENABLED) return;
      if (e.changedTouches.length > 1) return;
      if (e.changedTouches[0].target !== target) return;
      
      debug('touchend took place', (+new Date) - now, 'ms after touchstart');
      // 100 ms to tap
      if ((+new Date) > (now + 250)) return;
      
      eventbus.emit('tap', { target: target, clientX: startX, clientY: startY });
      
      now = 0;
    });
  })();
  
}

/*!
 * EventEmitter v4.2.5 - git.io/ee
 * Oliver Caldwell
 * MIT license
 * @preserve
 */
var EventEmitter = (function () {
	'use strict';

	/**
	 * Class for managing events.
	 * Can be extended to provide event functionality in other classes.
	 *
	 * @class EventEmitter Manages event registering and emitting.
	 */
	function EventEmitter() {}

	// Shortcuts to improve speed and size
	var proto = EventEmitter.prototype;
	var exports = {};
	var originalGlobalValue = exports.EventEmitter;

	/**
	 * Finds the index of the listener for the event in it's storage array.
	 *
	 * @param {Function[]} listeners Array of listeners to search through.
	 * @param {Function} listener Method to look for.
	 * @return {Number} Index of the specified listener, -1 if not found
	 * @api private
	 */
	function indexOfListener(listeners, listener) {
		var i = listeners.length;
		while (i--) {
			if (listeners[i].listener === listener) {
				return i;
			}
		}

		return -1;
	}

	/**
	 * Alias a method while keeping the context correct, to allow for overwriting of target method.
	 *
	 * @param {String} name The name of the target method.
	 * @return {Function} The aliased method
	 * @api private
	 */
	function alias(name) {
		return function aliasClosure() {
			return this[name].apply(this, arguments);
		};
	}

	/**
	 * Returns the listener array for the specified event.
	 * Will initialise the event object and listener arrays if required.
	 * Will return an object if you use a regex search. The object contains keys for each matched event. So /ba[rz]/ might return an object containing bar and baz. But only if you have either defined them with defineEvent or added some listeners to them.
	 * Each property in the object response is an array of listener functions.
	 *
	 * @param {String|RegExp} evt Name of the event to return the listeners from.
	 * @return {Function[]|Object} All listener functions for the event.
	 */
	proto.getListeners = function getListeners(evt) {
		var events = this._getEvents();
		var response;
		var key;

		// Return a concatenated array of all matching events if
		// the selector is a regular expression.
		if (typeof evt === 'object') {
			response = {};
			for (key in events) {
				if (events.hasOwnProperty(key) && evt.test(key)) {
					response[key] = events[key];
				}
			}
		}
		else {
			response = events[evt] || (events[evt] = []);
		}

		return response;
	};

	/**
	 * Takes a list of listener objects and flattens it into a list of listener functions.
	 *
	 * @param {Object[]} listeners Raw listener objects.
	 * @return {Function[]} Just the listener functions.
	 */
	proto.flattenListeners = function flattenListeners(listeners) {
		var flatListeners = [];
		var i;

		for (i = 0; i < listeners.length; i += 1) {
			flatListeners.push(listeners[i].listener);
		}

		return flatListeners;
	};

	/**
	 * Fetches the requested listeners via getListeners but will always return the results inside an object. This is mainly for internal use but others may find it useful.
	 *
	 * @param {String|RegExp} evt Name of the event to return the listeners from.
	 * @return {Object} All listener functions for an event in an object.
	 */
	proto.getListenersAsObject = function getListenersAsObject(evt) {
		var listeners = this.getListeners(evt);
		var response;

		if (listeners instanceof Array) {
			response = {};
			response[evt] = listeners;
		}

		return response || listeners;
	};

	/**
	 * Adds a listener function to the specified event.
	 * The listener will not be added if it is a duplicate.
	 * If the listener returns true then it will be removed after it is called.
	 * If you pass a regular expression as the event name then the listener will be added to all events that match it.
	 *
	 * @param {String|RegExp} evt Name of the event to attach the listener to.
	 * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.addListener = function addListener(evt, listener) {
		var listeners = this.getListenersAsObject(evt);
		var listenerIsWrapped = typeof listener === 'object';
		var key;

		for (key in listeners) {
			if (listeners.hasOwnProperty(key) && indexOfListener(listeners[key], listener) === -1) {
				listeners[key].push(listenerIsWrapped ? listener : {
					listener: listener,
					once: false
				});
			}
		}

		return this;
	};

	/**
	 * Alias of addListener
	 */
	proto.on = alias('addListener');

	/**
	 * Semi-alias of addListener. It will add a listener that will be
	 * automatically removed after it's first execution.
	 *
	 * @param {String|RegExp} evt Name of the event to attach the listener to.
	 * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.addOnceListener = function addOnceListener(evt, listener) {
		return this.addListener(evt, {
			listener: listener,
			once: true
		});
	};

	/**
	 * Alias of addOnceListener.
	 */
	proto.once = alias('addOnceListener');

	/**
	 * Defines an event name. This is required if you want to use a regex to add a listener to multiple events at once. If you don't do this then how do you expect it to know what event to add to? Should it just add to every possible match for a regex? No. That is scary and bad.
	 * You need to tell it what event names should be matched by a regex.
	 *
	 * @param {String} evt Name of the event to create.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.defineEvent = function defineEvent(evt) {
		this.getListeners(evt);
		return this;
	};

	/**
	 * Uses defineEvent to define multiple events.
	 *
	 * @param {String[]} evts An array of event names to define.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.defineEvents = function defineEvents(evts) {
		for (var i = 0; i < evts.length; i += 1) {
			this.defineEvent(evts[i]);
		}
		return this;
	};

	/**
	 * Removes a listener function from the specified event.
	 * When passed a regular expression as the event name, it will remove the listener from all events that match it.
	 *
	 * @param {String|RegExp} evt Name of the event to remove the listener from.
	 * @param {Function} listener Method to remove from the event.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.removeListener = function removeListener(evt, listener) {
		var listeners = this.getListenersAsObject(evt);
		var index;
		var key;

		for (key in listeners) {
			if (listeners.hasOwnProperty(key)) {
				index = indexOfListener(listeners[key], listener);

				if (index !== -1) {
					listeners[key].splice(index, 1);
				}
			}
		}

		return this;
	};

	/**
	 * Alias of removeListener
	 */
	proto.off = alias('removeListener');

	/**
	 * Adds listeners in bulk using the manipulateListeners method.
	 * If you pass an object as the second argument you can add to multiple events at once. The object should contain key value pairs of events and listeners or listener arrays. You can also pass it an event name and an array of listeners to be added.
	 * You can also pass it a regular expression to add the array of listeners to all events that match it.
	 * Yeah, this function does quite a bit. That's probably a bad thing.
	 *
	 * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add to multiple events at once.
	 * @param {Function[]} [listeners] An optional array of listener functions to add.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.addListeners = function addListeners(evt, listeners) {
		// Pass through to manipulateListeners
		return this.manipulateListeners(false, evt, listeners);
	};

	/**
	 * Removes listeners in bulk using the manipulateListeners method.
	 * If you pass an object as the second argument you can remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
	 * You can also pass it an event name and an array of listeners to be removed.
	 * You can also pass it a regular expression to remove the listeners from all events that match it.
	 *
	 * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to remove from multiple events at once.
	 * @param {Function[]} [listeners] An optional array of listener functions to remove.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.removeListeners = function removeListeners(evt, listeners) {
		// Pass through to manipulateListeners
		return this.manipulateListeners(true, evt, listeners);
	};

	/**
	 * Edits listeners in bulk. The addListeners and removeListeners methods both use this to do their job. You should really use those instead, this is a little lower level.
	 * The first argument will determine if the listeners are removed (true) or added (false).
	 * If you pass an object as the second argument you can add/remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
	 * You can also pass it an event name and an array of listeners to be added/removed.
	 * You can also pass it a regular expression to manipulate the listeners of all events that match it.
	 *
	 * @param {Boolean} remove True if you want to remove listeners, false if you want to add.
	 * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add/remove from multiple events at once.
	 * @param {Function[]} [listeners] An optional array of listener functions to add/remove.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.manipulateListeners = function manipulateListeners(remove, evt, listeners) {
		var i;
		var value;
		var single = remove ? this.removeListener : this.addListener;
		var multiple = remove ? this.removeListeners : this.addListeners;

		// If evt is an object then pass each of it's properties to this method
		if (typeof evt === 'object' && !(evt instanceof RegExp)) {
			for (i in evt) {
				if (evt.hasOwnProperty(i) && (value = evt[i])) {
					// Pass the single listener straight through to the singular method
					if (typeof value === 'function') {
						single.call(this, i, value);
					}
					else {
						// Otherwise pass back to the multiple function
						multiple.call(this, i, value);
					}
				}
			}
		}
		else {
			// So evt must be a string
			// And listeners must be an array of listeners
			// Loop over it and pass each one to the multiple method
			i = listeners.length;
			while (i--) {
				single.call(this, evt, listeners[i]);
			}
		}

		return this;
	};

	/**
	 * Removes all listeners from a specified event.
	 * If you do not specify an event then all listeners will be removed.
	 * That means every event will be emptied.
	 * You can also pass a regex to remove all events that match it.
	 *
	 * @param {String|RegExp} [evt] Optional name of the event to remove all listeners for. Will remove from every event if not passed.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.removeEvent = function removeEvent(evt) {
		var type = typeof evt;
		var events = this._getEvents();
		var key;

		// Remove different things depending on the state of evt
		if (type === 'string') {
			// Remove all listeners for the specified event
			delete events[evt];
		}
		else if (type === 'object') {
			// Remove all events matching the regex.
			for (key in events) {
				if (events.hasOwnProperty(key) && evt.test(key)) {
					delete events[key];
				}
			}
		}
		else {
			// Remove all listeners in all events
			delete this._events;
		}

		return this;
	};

	/**
	 * Alias of removeEvent.
	 *
	 * Added to mirror the node API.
	 */
	proto.removeAllListeners = alias('removeEvent');

	/**
	 * Emits an event of your choice.
	 * When emitted, every listener attached to that event will be executed.
	 * If you pass the optional argument array then those arguments will be passed to every listener upon execution.
	 * Because it uses `apply`, your array of arguments will be passed as if you wrote them out separately.
	 * So they will not arrive within the array on the other side, they will be separate.
	 * You can also pass a regular expression to emit to all events that match it.
	 *
	 * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
	 * @param {Array} [args] Optional array of arguments to be passed to each listener.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.emitEvent = function emitEvent(evt, args) {
		var listeners = this.getListenersAsObject(evt);
		var listener;
		var i;
		var key;
		var response;

		for (key in listeners) {
			if (listeners.hasOwnProperty(key)) {
				i = listeners[key].length;

				while (i--) {
					// If the listener returns true then it shall be removed from the event
					// The function is executed either with a basic call or an apply if there is an args array
					listener = listeners[key][i];

					if (listener.once === true) {
						this.removeListener(evt, listener.listener);
					}

					response = listener.listener.apply(this, args || []);

					if (response === this._getOnceReturnValue()) {
						this.removeListener(evt, listener.listener);
					}
				}
			}
		}

		return this;
	};

	/**
	 * Alias of emitEvent
	 */
	proto.trigger = alias('emitEvent');

	/**
	 * Subtly different from emitEvent in that it will pass its arguments on to the listeners, as opposed to taking a single array of arguments to pass on.
	 * As with emitEvent, you can pass a regex in place of the event name to emit to all events that match it.
	 *
	 * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
	 * @param {...*} Optional additional arguments to be passed to each listener.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.emit = function emit(evt) {
		var args = Array.prototype.slice.call(arguments, 1);
		return this.emitEvent(evt, args);
	};

	/**
	 * Sets the current value to check against when executing listeners. If a
	 * listeners return value matches the one set here then it will be removed
	 * after execution. This value defaults to true.
	 *
	 * @param {*} value The new value to check for when executing listeners.
	 * @return {Object} Current instance of EventEmitter for chaining.
	 */
	proto.setOnceReturnValue = function setOnceReturnValue(value) {
		this._onceReturnValue = value;
		return this;
	};

	/**
	 * Fetches the current value to check against when executing listeners. If
	 * the listeners return value matches this one then it should be removed
	 * automatically. It will return true by default.
	 *
	 * @return {*|Boolean} The current value to check for or the default, true.
	 * @api private
	 */
	proto._getOnceReturnValue = function _getOnceReturnValue() {
		if (this.hasOwnProperty('_onceReturnValue')) {
			return this._onceReturnValue;
		}
		else {
			return true;
		}
	};

	/**
	 * Fetches the events object and creates one if required.
	 *
	 * @return {Object} The events storage object.
	 * @api private
	 */
	proto._getEvents = function _getEvents() {
		return this._events || (this._events = {});
	};

	/**
	 * Reverts the global {@link EventEmitter} to its previous value and returns a reference to this version.
	 *
	 * @return {Function} Non conflicting EventEmitter class.
	 */
	EventEmitter.noConflict = function noConflict() {
		exports.EventEmitter = originalGlobalValue;
		return EventEmitter;
	};

	return EventEmitter;
})();

var eventbus = new EventEmitter();
  