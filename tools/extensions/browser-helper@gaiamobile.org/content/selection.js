/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this file,
  * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var inXPCom = !(typeof Components === 'undefined' ||
  typeof Components.utils === 'undefined');
 
function debug() {
  // Prefer dump, but also needs to run in browser environment
  if (inXPCom) {
    dump('==SectionHandler debug: ' +
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
  
  XPCOMUtils.defineLazyServiceGetter(Services, "fm",
                                     "@mozilla.org/focus-manager;1",
                                     "nsIFocusManager");
  
  XPCOMUtils.defineLazyGetter(this, "domWindowUtils", function () {
    return content.QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIDOMWindowUtils);
  });
   
  debug('File loaded: running in XPCom');
   
  var SelectionHandler = {
    init: function sh_init() {
      debug('Init called', {
        hasContent: typeof content,
        location: content.document.location+''
      });
      
      var els = Cc["@mozilla.org/eventlistenerservice;1"]
                  .getService(Ci.nsIEventListenerService);
      
      var addEv = function(target, type, handler) {
        debug('Registered hadnler for ' + type)
        // Using the system group for mouse/touch events to avoid
        // missing events if .stopPropagation() has been called.
        els.addSystemEventListener(target, 
                                  type,
                                  function() {
                                    debug('Handling event', type)
                                    handler.apply(this, arguments);
                                  },
                                  /* useCapture = */ false);
      };
      
      var removeEv = function(target, type, handler) {
        els.removeSystemEventListener(target, 
                                  type,
                                  handler,
                                  /* useCapture = */ false);
      };
      
      content.document.addEventListener('DOMContentLoaded', function() {
        debug('DOMContentLoaded happened in XPCom');
        var cp = copyPaste(content.document.defaultView, content.document, addEv, removeEv);
        cp.init();
      });
    }
  };
  
  SelectionHandler.init(copyPaste);
}

function BrowserInit() {
  document.addEventListener('DOMContentLoaded', function() {
    debug('File loaded: running in browser');
    var addEv = function(target, type, handler) {
      target.addEventListener(type, handler);
    };
    
    var removeEv = function(target, type, handler) {
      target.removeEventListener(type, handler);
    };
    
    var cp = copyPaste(window, document, addEv, removeEv);
    cp.init();
  });
}

var copyPaste = function(win, doc, addEvent, removeEvent) {

  var KNOB_SIZE = 17;
  
  var LEFT_CONTROL_ADJUST_Y = 0;
  var LEFT_CONTROL_ADJUST_X = -0;
  var RIGHT_CONTROL_ADJUST_Y = 0;
  var RIGHT_CONTROL_ADJUST_X = 0;
  
  var RANGE_ADJUST_Y = 0;
  var LEFT_RANGE_ADJUST_X = -LEFT_CONTROL_ADJUST_X;
  var RIGHT_RANGE_ADJUST_X = RIGHT_CONTROL_ADJUST_X;
  
  var MENU_ADJUST_TOP = - 55;
  var MENU_ADJUST_LEFT = 15;
  
  var INTERACT_DELAY = 700;
  var INIT_MOVE_LIMIT = 50;
  
  var container = doc.createElement('div');
  
  /**
   * Copy/Paste base class
   */
  function Clipboard() {
    this.clipboard = '';
  
    this.controlsShown = false;
  
    this.init();
  }
  
  Clipboard.prototype = {
    init: function() {
      addEvent(win, this.START, this.onStart.bind(this));
      addEvent(win, this.MOVE, this.onMove.bind(this));
      addEvent(win, this.END, this.onEnd.bind(this));
      
      container.id = 'clipboard-container';
      doc.body.appendChild(container);
    },
  
    onStart: function(e) {
      if (this.controlsShown) {
        this.teardown();
        return;
      }
      
      win.clearTimeout(this.interactTimeout);
  
      this.startE = e;
      this.startXY = this.coords(e);
  
      this.interactTimeout = win.setTimeout(
        this.showControls.bind(this),
        INTERACT_DELAY
      );
    },
  
    onMove: function(e) {
  
      if (!this.startXY) {
        return;
      }
  
      var xy = this.coords(e);
  
      if (!this.controlsShown && (
          Math.abs(this.startXY.x - xy.x) > INIT_MOVE_LIMIT ||
          Math.abs(this.startXY.y - xy.y) > INIT_MOVE_LIMIT)) {
        this.teardown();
      }
  
      // console.log('Got move!' + xy.x + ' - ' + xy.y)
    },
  
    onEnd: function(e) {
      if (this.controlsShown) {
        return;
      }
  
      delete this.startXY;
      this.teardown();
    },
  
    showControls: function() {
      debug('showControls')
      this.controlsShown = true;
  
      var target = this.startE.target;
  
      if (target instanceof win.HTMLInputElement) {
        debug('target is input')
        this.strategy = new HtmlInputStrategy(target);
      } else if (target instanceof win.HTMLTextAreaElement) {
        debug('target is ta')
        this.strategy = new HtmlInputStrategy(target);
      } else {
        debug('target is content')
        this.strategy = new HtmlContentStrategy(target);
      }
  
      this.strategy.initialSelection(this.startXY);
  
      // Get the region of the selection
      var targetArea = this.strategy.getRegion();
      var leftKnobPos = {
        y: targetArea.top + LEFT_CONTROL_ADJUST_Y,
        x: targetArea.left + LEFT_CONTROL_ADJUST_X,
        offsetY: RANGE_ADJUST_Y,
        offsetX: LEFT_RANGE_ADJUST_X,
      };
  
      var rightTargetArea = this.strategy.endPosition();
      var rightKnobPos = {
        y: rightTargetArea.top + RIGHT_CONTROL_ADJUST_Y,
        x: rightTargetArea.left + RIGHT_CONTROL_ADJUST_X,
        offsetY: -RANGE_ADJUST_Y,
        offsetX: -RIGHT_RANGE_ADJUST_X
      };
  
      this.createKnob('left', leftKnobPos);
      this.createKnob('right', rightKnobPos);
  
      this.optionsEl = doc.createElement('ul');
      this.optionsEl.id = 'clipboard-menu';
      var actions = [
        '<li data-action="cut">Cut</li>',
        '<li data-action="copy">Copy</li>'
      ];
  
      if (this.clipboard && this.strategy.canPaste) {
        actions.push('<li data-action="paste">Paste</li>');
      }
      this.optionsEl.innerHTML = actions.join('');
  
      addEvent(this.optionsEl, this.START, this.handleEvent.bind(this));
  
      container.appendChild(this.optionsEl);
      this.positionMenu();
    },
  
    positionMenu: function() {
      debug('positionMenu')
      var top = this.leftKnob.y;
      var left = this.leftKnob.x;
  
      this.optionsEl.style.top = (top + MENU_ADJUST_TOP) + 'px';
      this.optionsEl.style.left = (left + MENU_ADJUST_LEFT) + 'px';
    },
  
    /**
     * Called when a user clicks on the menu
     */
    handleEvent: function(e) {
      debug('handlEvent for copy/paste/whatever', e.target.dataset.action)
      e.stopPropagation();
      e.preventDefault();
  
      var action = e.target.dataset.action;
      if (!action) {
        return;
      }
  
      var sel = win.getSelection();
      this.strategy[action]({
  
        value: this.clipboard,
  
        modify: function(clipboard) {
          this.clipboard = clipboard;
        }.bind(this)
      });
  
      this.teardown();
    },
  
    /**
     * Removes the Copy/Paste UI
     */
    teardown: function() {
      if (this.interactTimeout) {
        win.clearTimeout(this.interactTimeout);
      }
  
      if (this.leftKnob) {
        container.removeChild(this.leftKnob.element);
        delete this.leftKnob;
      }
  
      if (this.rightKnob) {
        container.removeChild(this.rightKnob.element);
        delete this.rightKnob;
      }
  
      this.controlsShown = false;
  
      if (this.optionsEl) {
        container.removeChild(this.optionsEl);
        delete this.optionsEl;
      }
    },
  
    /**
     * Creates a left or right knob
     */
    createKnob: function(name, pos) {
      debug('createKnob', pos)
      var knob = name + 'Knob';
      if (this[knob]) {
        container.removeChild(this[knob].element);
        delete this[knob];
      }
  
      this[knob] = new SelectionControl({
        className: name,
        x: pos.x,
        y: pos.y,
        offsetY: pos.offsetY,
        offsetX: pos.offsetX
      });
  
      addEvent(this[knob].element, this.START, function(origEvt) {
  
        this[knob].element.classList.add('moving');
        this.optionsEl.classList.add('moving');
  
        origEvt.stopImmediatePropagation();
        origEvt.preventDefault();
  
        var mover = this.getKnobMover(name);
        addEvent(win, this.MOVE, mover);
        addEvent(win, this.END, function() {
          removeEvent(win, this.MOVE, mover);
          if (this[knob]) {
            this[knob].element.classList.remove('moving');
          }
          if (this.optionsEl) {
            this.optionsEl.classList.remove('moving');
          }
        }.bind(this));
      }.bind(this));
    },
  
    /**
     * Is called when the user has tapped on a knob
     * and moves their finger around.
     * @param {String} knob name (left or right)
     */
    getKnobMover: function(name) {
      debug('getKnobMover')
      var self = this;
      var el = this[name + 'Knob'];
  
      return function(evt) {
        evt.stopImmediatePropagation();
  
        var xy = self.coords(evt);
  
        el.x = xy.x + (KNOB_SIZE / 2);
        el.y = xy.y - (KNOB_SIZE / 2);
  
        self.strategy.rebuildSelection(self.leftKnob, self.rightKnob);
  
        self.positionMenu();
      }
    }
  };
  function SelectionControl(config) {
  
    var defaults = {
      x: 0,
      y: 0,
      offsetY: 0,
      offsetX: 0
    };
  
    for (var i in defaults) {
      if (config[i] === undefined) {
        config[i] = defaults[i];
      }
    }
    this.config = config;
  
    this.element = doc.createElement('div');
    this.element.className = 'knob ' + config.className;
    this.element.innerHTML = '<span></span>';
    container.appendChild(this.element);
  
    // Initial positions
    this.x = config.x;
    this.y = config.y;
  }
  
  SelectionControl.prototype = {
    set x(pos) {
      this.config.x = pos;
      this.element.style.left = pos + 'px';
    },
  
    set y(pos) {
      this.config.y = pos;
      this.element.style.top = pos + 'px';
    },
  
    get x() {
      return this.config.x;
    },
  
    get y() {
      return this.config.y;
    },
  
    get cursorX() {
      return this.config.x - win.pageXOffset + this.config.offsetX;
    },
  
    get cursorY() {
      return this.config.y - win.pageYOffset + this.config.offsetY;
    }
  };function HtmlInputStrategy(node) {
    this.canPaste = true;
    this.node = node;
  }
  
  HtmlInputStrategy.prototype = {
  
    copy: function(clipboard) {
      var content = this.node.value.substring(
        this.node.selectionStart,
        this.node.selectionEnd
      );
  
      clipboard.modify(content);
    },
  
    cut: function(clipboard) {
      this.copy(clipboard);
      this.node.value = this.node.value
        .substring(0, this.node.selectionStart) +
        this.node.value.substring(this.node.selectionEnd);
    },
  
    paste: function(clipboard) {
      this.node.value = this.node.value
        .substring(0, this.node.selectionStart) +
        clipboard.value +
        this.node.value.substring(this.node.selectionEnd)
    },
  
    /**
     * Creates the initial selection
     * It should be whatever word you were focused on
     */
    initialSelection: function(startXY) {
      debug('initialSelection')
      var value = this.node.value;
  
      var leftBound = this.node.selectionStart;
      var rightBound = this.node.selectionEnd;
      var start = this.node.selectionStart;
  
      for (var i = leftBound-1, letter; letter = value[i]; i--) {
        if (/[\s]+/.test(letter)) {
          break;
        } else {
          leftBound--;
          if (!leftBound) {
            break;
          }
        }
      }
  
      for (var i = rightBound, letter; letter = value[i]; i++) {
        if (/[\s]+/.test(letter)) {
          break;
        } else {
          rightBound++;
          if (!rightBound) {
            break;
          }
        }
      }
  
      this.node.selectionStart = leftBound;
      this.node.selectionEnd = rightBound;
    },
  
    /**
     * Rebuilds selection from knob placement
     */
    rebuildSelection: function(left, right) {
      var start = doc.caretPositionFromPoint(left.cursorX, left.cursorY);
      var end = doc.caretPositionFromPoint(right.cursorX, right.cursorY);
      
      var switched = false;
      if (start.offset > end.offset) {
        switched = true;
        
        var tmp = end;
        end = start;
        start = tmp;
      }
      
      if (left.element.classList.contains('left') && switched ||
            (left.element.classList.contains('right') && !switched)) {
        left.element.classList.toggle('left');
        left.element.classList.toggle('right');
        right.element.classList.toggle('left');
        right.element.classList.toggle('right');
      }
  
      this.node.selectionStart = start.offset;
      this.node.selectionEnd = end.offset;
    },
  
    /**
     * Gets the region of the selectedText inside of an input
     * This is essentially trying to mimic IE's createTextRange
     */
    getRegion: function(method) {
      debug('getRegion')
      method = method || 'getBoundingClientRect';
  
      var input = this.node;
      var offset = getInputOffset(),
          topPos = offset.top,
          leftPos = offset.left,
          width = getInputCSS('width', true),
          height = getInputCSS('height', true);
  
          // Styles to simulate a node in an input field
      var cssDefaultStyles = 'white-space:pre; padding:0; margin:0;';
      var listOfModifiers = ['direction', 'font-family', 'font-size',
          'font-size-adjust', 'font-variant', 'font-weight', 'font-style',
          'letter-spacing', 'line-height', 'text-align', 'text-indent',
          'text-transform', 'word-wrap', 'word-spacing'];
  
      topPos += getInputCSS('padding-top', true);
      topPos += getInputCSS('border-top-width', true);
      leftPos += getInputCSS('padding-left', true);
      leftPos += getInputCSS('border-left-width', true);
      leftPos += 1; //Seems to be necessary
  
      for (var i = 0; i < listOfModifiers.length; i++) {
          var property = listOfModifiers[i];
          cssDefaultStyles += property + ':' + getInputCSS(property) + ';';
      }
      // End of CSS variable checks
  
      var text = this.node.value,
          textLen = text.length,
          fakeClone = doc.createElement('div');
  
      if (this.node.selectionStart > 0)
        appendPart(0, this.node.selectionStart);
  
      var fakeRange = appendPart(
        this.node.selectionStart,
        this.node.selectionEnd
      );
  
      if (textLen > this.node.selectionEnd)
        appendPart(this.node.selectionEnd, textLen);
  
      // Styles to inherit the font styles of the element
      fakeClone.style.cssText = cssDefaultStyles;
  
      // Styles to position the text node at the desired position
      fakeClone.style.position = 'absolute';
      fakeClone.style.top = topPos + 'px';
      fakeClone.style.left = leftPos + 'px';
      fakeClone.style.width = width + 'px';
      fakeClone.style.height = height + 'px';
      fakeClone.style.backgroundColor = '#FF0000';
      container.appendChild(fakeClone);
      var returnValue = fakeRange[method]();
  
      fakeClone.parentNode.removeChild(fakeClone); // Comment this to debug
  
      function appendPart(start, end) {
        var span = doc.createElement('span');
        //Force styles to prevent unexpected results
        span.style.cssText = cssDefaultStyles;
        span.textContent = text.substring(start, end);
        fakeClone.appendChild(span);
        return span;
      }
  
      // Computing offset position
      function getInputOffset() {
        var body = container,
            win = doc.defaultView,
            docElem = doc.documentElement,
            box = doc.createElement('div');
        box.style.paddingLeft = box.style.width = '1px';
        body.appendChild(box);
        var isBoxModel = box.offsetWidth == 2;
        body.removeChild(box);
        box = input.getBoundingClientRect();
        var clientTop = docElem.clientTop || body.clientTop || 0,
  
            clientLeft = docElem.clientLeft || body.clientLeft || 0,
  
            scrollTop = win.pageYOffset || isBoxModel &&
              docElem.scrollTop || body.scrollTop,
  
            scrollLeft = win.pageXOffset || isBoxModel &&
              docElem.scrollLeft || body.scrollLeft;
  
        return {
            top: box.top + scrollTop - clientTop,
            left: box.left + scrollLeft - clientLeft};
      }
  
      function getInputCSS(prop, isnumber) {
        var val = doc.defaultView
          .getComputedStyle(input, null).getPropertyValue(prop);
  
        return isnumber ? parseFloat(val) : val;
      }
  
      return {
        top: returnValue.top + win.pageYOffset,
        bottom: returnValue.bottom + win.pageYOffset,
        left: returnValue.left + win.pageXOffset,
        right: returnValue.right + win.pageXOffset
      };
    },
  
     /**
     * Gets the outer rectangle coordinates of the selction
     * Normalizes data to absolute values with window offsets.
     * Inspired by: stackoverflow.com/questions/6930578
     */
    endPosition: function() {
      debug('endPosition')
      var region = this.getRegion();
      return {
        top: region.bottom,
        left: region.right
      };
    },
  
    extendRight: function() {
      debug('extendRight')
      this.node.selectionEnd++;
    },
  
    extendLeft: function() {
      debug('extendLeft')
      this.node.selectionStart--;
    }
  };/**
   * General range helper functions
   */
  function HtmlContentStrategy(node) {
    this.canPaste = false;
    this.node = node;
  }
  
  HtmlContentStrategy.prototype = {
  
    get sel() {
      return win.getSelection();
    },
  
    copy: function(clipboard) {
      clipboard.modify(this.sel.toString());
      this.sel.removeAllRanges();
    },
  
    cut: function(clipboard) {
      clipboard.modify(this.sel.toString());
      range = this.sel.getRangeAt(0);
      range.deleteContents();
      this.sel.removeAllRanges();
    },
  
    paste: function(clipboard) {
      var range = this.sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(doc.createTextNode(clipboard.value));
    },
  
    /**
     * Creates the initial selection
     * This is currently the entire elemtn
     */
    initialSelection: function(startXY) {
  
      var directions = ['left', 'right'];
  
      this.extendLeft('word', startXY)
      this.extendRight('word', startXY)
    },
  
    /**
     * Rebuilds selection from knob placement
     * @param {Object} left selection control.
     * @param {Object} right selection control.
     */
    rebuildSelection: function(left, right) {
      var start = doc.caretPositionFromPoint(left.cursorX, left.cursorY);
      var end = doc.caretPositionFromPoint(right.cursorX, right.cursorY);
      
      var switched = false;
      var sr = doc.createRange();
      sr.setStart(start.offsetNode, start.offset);
      sr.setEnd(start.offsetNode, start.offset);
      if (sr.comparePoint(end.offsetNode, end.offset) === -1) {
        switched = true;
        
        var tmp = end;
        end = start;
        start = tmp;
      }
      
      if (left.element.classList.contains('left') && switched ||
            (left.element.classList.contains('right') && !switched)) {
        left.element.classList.toggle('left');
        left.element.classList.toggle('right');
        right.element.classList.toggle('left');
        right.element.classList.toggle('right');
      }

      this.sel.removeAllRanges();
      var newRange = doc.createRange();
      newRange.setStart(start.offsetNode, start.offset);
      newRange.setEnd(end.offsetNode, end.offset);
      this.sel.addRange(newRange);
  
      // Extend the range a bit so there isn't a big gap
      // This feels the best in practice, we may be able to adjust the CSS so this isnt' needed.
      // this.extendLeft('character');
      // this.extendLeft('character');
      // this.extendRight('character');
      // this.extendRight('character');
    },
  
    /**
     * Normalized wrapper for getBoundingClientRect()
     */
    getRegion: function() {
      var range = this.sel.getRangeAt(0);
      var region =  range.getBoundingClientRect();
  
      return {
        top: region.top + win.pageYOffset,
        left: region.left + win.pageXOffset,
        bottom: region.bottom + win.pageYOffset,
        right: region.right + win.pageXOffset
      }
    },
  
     /**
     * Gets the outer rectangle coordinates of the selction
     * Normalizes data to absolute values with window offsets.
     */
    endPosition: function() {
      var range = this.sel.getRangeAt(0).cloneRange();
      range.collapse(false);
      var dummy = doc.createElement('span');
      range.insertNode(dummy);
  
      var rect = dummy.getBoundingClientRect();
      var coords = {
        top: rect.top + win.pageYOffset,
        left: rect.left + win.pageXOffset
      };
      dummy.parentNode.removeChild(dummy);
  
      return coords;
    },
  
    /**
     * Extends the right selection bound
     */
    extendRight: function(magnitude) {
      magnitude = magnitude || 'character';
  
      var curSelected = this.sel + '';
      this.sel.modify('extend', 'right', magnitude);
  
      if (this.sel + '' == curSelected && magnitude == 'character') {
        this.extendRight('word');
      }
    },
  
    /**
     * Extends the left selection bound
     */
    extendLeft: function(magnitude, startXY) {
      magnitude = magnitude || 'character';
  
      var sel = this.sel;
      
      debug('extendLeft call, i has sel?', {
        sel: !!sel,
        anchorNode: sel.anchorNode,
        anchorOffset: sel.anchorOffset
      });
      
      if (!sel.anchorNode && startXY) {
        var start = doc.caretPositionFromPoint(startXY.x, startXY.y);
        if (!start) {
          return;
        }
      
        var sr = doc.createRange();
        sr.setStart(start.offsetNode, start.offset);
        sr.setEnd(start.offsetNode, start.offset);
  
        sel.removeAllRanges();
        sel.addRange(sr);
      }
  
      // modify() works on the focus of the selection
      var endNode = sel.focusNode;
      var endOffset = sel.focusOffset;
      sel.collapse(sel.anchorNode, sel.anchorOffset);
  
      var curSelected = this.sel + '';
      sel.modify('move', 'backward', magnitude);
      sel.extend(endNode, endOffset);
  
      if (this.sel + '' == curSelected && magnitude == 'character') {
        this.extendLeft('word');
      }
    }
  
  };function MouseClipboard() {
    this.START = 'mousedown';
    this.MOVE = 'mousemove';
    this.END = 'mouseup';
    Clipboard.apply(this);
  }
  
  MouseClipboard.prototype = {
    __proto__: Clipboard.prototype,
  
    /**
     * Extracts the X/Y positions for a touch event
     */
    coords: function(e) {
      return {
        x: e.pageX,
        y: e.pageY
      };
    }
  };
  
  function TouchClipboard() {
    this.START = 'touchstart';
    this.MOVE = 'touchmove';
    this.END = 'touchend';
    Clipboard.apply(this);
  }
  
  TouchClipboard.prototype = {
    __proto__: Clipboard.prototype,
  
    /**
     * Extracts the X/Y positions for a touch event
     */
    coords: function(e) {
      var touch = e.touches[0];
  
      return {
        x: touch.pageX,
        y: touch.pageY
      };
    }
  };
  
  if ('ontouchstart' in win) {
    return new TouchClipboard();
  } else {
    return new MouseClipboard();
  }
};

if (inXPCom) {
  XPComInit();
}
else {
  BrowserInit();
}
