/********************************************************
 * Deals with mouse events for clicking, drag-to-select
 *******************************************************/

Controller.open(function(_) {
  Options.p.ignoreNextMousedown = noop;
  _.delegateMouseEvents = function() {
    var ultimateRootjQ = this.root.jQ;
    //drag-to-select event handling
    this.container.bind('mousedown.mathquill', function(e) {
      var rootjQ = $(e.target).closest('.mq-root-block');
      var root = Node.byId[rootjQ.attr(mqBlockId) || ultimateRootjQ.attr(mqBlockId)];
      var ctrlr = root.controller, cursor = ctrlr.cursor, blink = cursor.blink;
      var textareaSpan = ctrlr.textareaSpan, textarea = ctrlr.textarea;

      e.preventDefault(); // doesn't work in IE≤8, but it's a one-line fix:
      e.target.unselectable = true; // http://jsbin.com/yagekiji/1

      if (cursor.options.ignoreNextMousedown(e)) return;
      else cursor.options.ignoreNextMousedown = noop;

      var target;
      function mousemove(e) { target = $(e.target); }
      function docmousemove(e) {
        if (!cursor.anticursor) cursor.startSelection();
        ctrlr.seek(target, e.pageX, e.pageY).cursor.select();
        target = undefined;
      }
      // outside rootjQ, the MathQuill node corresponding to the target (if any)
      // won't be inside this root, so don't mislead Controller::seek with it

      function mouseup(e) {
        cursor.blink = blink;
        if (!cursor.selection) {
          if (ctrlr.editable) {
            cursor.show();
          }
          else {
            textareaSpan.detach();
          }
        }

        // delete the mouse handlers now that we're not dragging anymore
        rootjQ.unbind('mousemove', mousemove);
        $(e.target.ownerDocument).unbind('mousemove', docmousemove).unbind('mouseup', mouseup);
      }

      if (ctrlr.blurred) {
        if (!ctrlr.editable) rootjQ.prepend(textareaSpan);
        textarea.focus();
      }

      cursor.blink = noop;
      ctrlr.seek($(e.target), e.pageX, e.pageY).cursor.startSelection();

      rootjQ.mousemove(mousemove);
      $(e.target.ownerDocument).mousemove(docmousemove).mouseup(mouseup);
      // listen on document not just body to not only hear about mousemove and
      // mouseup on page outside field, but even outside page, except iframes: https://github.com/mathquill/mathquill/commit/8c50028afcffcace655d8ae2049f6e02482346c5#commitcomment-6175800
    });

    var holdtimeout = null;
    var doubletaptimeout = null;
    var start;
    var last;

    var touchselect = function(ctrlr, cursor) {
      var x = last.x;
      var y = last.y;
      var bounds = cursor.jQ[0].getBoundingClientRect();
      ctrlr.selectDir((bounds.left - x) > (x - bounds.right) ? L : R);
      cursor.showTouchCursors();
    }

    this.container.bind('touchstart.mathquill', function(e) {
      var rootjQ = $(e.target).closest('.mq-root-block');
      var root = Node.byId[rootjQ.attr(mqBlockId) || ultimateRootjQ.attr(mqBlockId)];
      var ctrlr = root.controller, cursor = ctrlr.cursor, blink = cursor.blink;
      var textareaSpan = ctrlr.textareaSpan, textarea = ctrlr.textarea;
      e.preventDefault();
      if (ctrlr.blurred) {
        if (!ctrlr.editable) rootjQ.prepend(textareaSpan);
        textarea.focus();
      }
      last = start = { x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY };
      ctrlr.seek($(e.target), start.x, start.y).cursor.startSelection();
      cursor.showTouchCursors();
      holdtimeout = setTimeout(function() {
        holdtimeout = null;
        touchselect(ctrlr, cursor);
      }, 500);
    });

    this.container.bind('touchmove.mathquill', function(e) {
      e.stopPropagation();
      last = { x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY };
      var x = last.x;
      var y = last.y;
      if ((Math.abs(start.x - x) > 20 || Math.abs(start.y - y) > 20) && holdtimeout !== null) {
        clearTimeout(holdtimeout);
        holdtimeout = null;
      }
    });

    this.container.bind('touchend.mathquill touchcancel.mathquill', function(e) {
      var rootjQ = $(e.target).closest('.mq-root-block');
      var root = Node.byId[rootjQ.attr(mqBlockId) || ultimateRootjQ.attr(mqBlockId)];
      var ctrlr = root.controller, cursor = ctrlr.cursor, blink = cursor.blink;
      var textareaSpan = ctrlr.textareaSpan, textarea = ctrlr.textarea;
      if(holdtimeout !== null) {
        clearTimeout(holdtimeout);
        holdtimeout = null;
        if(doubletaptimeout === null)  {
          doubletaptimeout = setTimeout(function() {
            doubletaptimeout = null;
          }, 500);
        } else {
          clearTimeout(doubletaptimeout);
          doubletaptimeout = null;
          touchselect(ctrlr, cursor);
        }
      }
      e.preventDefault();
      if (ctrlr.blurred) {
        if (!ctrlr.editable) rootjQ.prepend(textareaSpan);
        textarea.focus();
      }
    });
  }
});

Controller.open(function(_) {
  _.seek = function(target, pageX, pageY) {
    var cursor = this.notify('select').cursor;

    if (target) {
      var nodeId = target.attr(mqBlockId) || target.attr(mqCmdId);
      if (!nodeId) {
        var targetParent = target.parent();
        nodeId = targetParent.attr(mqBlockId) || targetParent.attr(mqCmdId);
      }
    }
    var node = nodeId ? Node.byId[nodeId] : this.root;
    pray('nodeId is the id of some Node that exists', node);

    // don't clear selection until after getting node from target, in case
    // target was selection span, otherwise target will have no parent and will
    // seek from root, which is less accurate (e.g. fraction)
    cursor.clearSelection().show();

    node.seek(pageX, pageY, cursor);
    this.scrollHoriz(); // before .selectFrom when mouse-selecting, so
                        // always hits no-selection case in scrollHoriz and scrolls slower
    return this;
  };
});
