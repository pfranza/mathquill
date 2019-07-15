/********************************************
 * Cursor and Selection "singleton" classes
 *******************************************/

/* The main thing that manipulates the Math DOM. Makes sure to manipulate the
HTML DOM to match. */

/* Sort of singletons, since there should only be one per editable math
textbox, but any one HTML document can contain many such textboxes, so any one
JS environment could actually contain many instances. */

//A fake cursor in the fake textbox that the math is rendered in.
var Cursor = P(Point, function(_) {
  _.init = function(initParent, options) {
    this.parent = initParent;
    this.options = options;

    var jQ = this.jQ = this._jQ = $('<span class="mq-cursor">&#8203;</span>');
    //closured for setInterval
    this.blink = function(){ jQ.toggleClass('mq-blink'); };

    this.upDownCache = {};

    var ctrlr = this.ctrlr = this.parent.controller;

    var cursorhtml = '<span style="position: absolute; z-index: 1; left: -22px; top: 0px; width: 44px; height: 44px;"><svg width="22" height="26.509999999999998" viewBox="-11 0 22 26.509999999999998" style="margin-left: 11px;"><path d="M 0 0 L -7.776999999999999 7.776999999999999 A 11 11, 0, 1, 0, 7.776999999999999 7.776999999999999 Z" fill="blue"></path></svg></span>';
    this.touchcursors = $('<span style="position: relative;"></span>');
    this.touchcursors.append(this.touchcursor = $(cursorhtml));
    this.touchcursor[0].style.display = "none";
    this.touchcursors.append(this.touchanticursor = $(cursorhtml));
    this.touchanticursor[0].style.display = "none";

    var menu = this.menu = $('<div class="mathquill-edit-menu"><ul class="menu-options"><li class="menu-option">Copy</li><li class="menu-option">Cut</li><li class="menu-option">Paste</li></ul></div>');

    this.touchcursors.append(menu);

    var self = this;

    menu.bind("touchstart", function(e) {
      e.stopPropagation();
      self.toggleMenu("hide");
      self.ctrlr.textarea.focus();
      switch (e.target.innerHTML) {
        case "Copy":
          if(!document.execCommand("copy")) {
            alert("copy failed :(");
          }
          break;
        case "Cut":
          if(!document.execCommand("cut")) {
            alert("cut failed :(");
          }
          break;
        case "Paste":
          if(!document.execCommand("paste")) {
            var fail = function(err) {
              alert("paste failed :(");
            };
            if(!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
              return fail();
            }
            navigator.clipboard.readText()
            .then(function(text) {
              ctrlr.paste(text);
            })
            .catch(fail);
          }
        default:
          break;
      }
    });

    menu.bind("touchmove touchend touchcancel", function(e) {
      e.stopPropagation();
      e.preventDefault();
    });

    var self = this;

    this.touchcursor.cursor = this;
    this.touchanticursor.cursor = this;
    this.touchcursor.other = this.touchanticursor;
    this.touchanticursor.other = this.touchcursor;

    this.touchcursor.bind("touchstart", function() {
      self.onCursorHandleTouchStart.apply(self.touchcursor, arguments);
    });
    this.touchcursor.bind("touchmove", function() {
      self.onCursorHandleTouchMove.apply(self.touchcursor, arguments);
    });
    this.touchcursor.bind("touchcancel touchend", function() {
      self.onCursorHandleTouchEnd.apply(self.touchcursor, arguments);
    });

    this.touchanticursor.bind("touchstart", function() {
      self.onCursorHandleTouchStart.apply(self.touchanticursor, arguments);
    });
    this.touchanticursor.bind("touchmove", function() {
      self.onCursorHandleTouchMove.apply(self.touchanticursor, arguments);
    });
    this.touchanticursor.bind("touchcancel touchend", function() {
      self.onCursorHandleTouchEnd.apply(self.touchanticursor, arguments);
    });
  };

  _.show = function() {
    this.jQ = this._jQ.removeClass('mq-blink');
    if ('intervalId' in this) //already was shown, just restart interval
      clearInterval(this.intervalId);
    else { //was hidden and detached, insert this.jQ back into HTML DOM
      if (this[R]) {
        if (this.selection && this.selection.ends[L][L] === this[L])
          this.jQ.insertBefore(this.selection.jQ);
        else
          this.jQ.insertBefore(this[R].jQ.first());
      }
      else
        this.jQ.appendTo(this.parent.jQ);
      this.parent.focus();
    }
    if(!this.touchcursor.dragging && !this.touchanticursor.dragging) {
      this.touchcursor[0].style.display = "none";
    }
    this.toggleMenu("hide");
    this.intervalId = setInterval(this.blink, 500);
    return this;
  };
  _.hide = function() {
    if(!this.touchcursor.dragging && !this.touchanticursor.dragging) {
      this.touchcursor[0].style.display = "none";
    }
    this.toggleMenu("hide");
    if ('intervalId' in this)
      clearInterval(this.intervalId);
    delete this.intervalId;
    this.jQ.detach();
    this.jQ = $();
    return this;
  };

  _.withDirInsertAt = function(dir, parent, withDir, oppDir) {
    var oldParent = this.parent;
    this.parent = parent;
    this[dir] = withDir;
    this[-dir] = oppDir;
    // by contract, .blur() is called after all has been said and done
    // and the cursor has actually been moved
    // FIXME pass cursor to .blur() so text can fix cursor pointers when removing itself
    if (oldParent !== parent && oldParent.blur) oldParent.blur(this);
  };
  _.insDirOf = function(dir, el) {
    prayDirection(dir);
    this.jQ.insDirOf(dir, el.jQ);
    this.withDirInsertAt(dir, el.parent, el[dir], el);
    this.parent.jQ.addClass('mq-hasCursor');
    return this;
  };
  _.insLeftOf = function(el) { return this.insDirOf(L, el); };
  _.insRightOf = function(el) { return this.insDirOf(R, el); };

  _.insAtDirEnd = function(dir, el) {
    prayDirection(dir);
    this.jQ.insAtDirEnd(dir, el.jQ);
    this.withDirInsertAt(dir, el, 0, el.ends[dir]);
    el.focus();
    return this;
  };
  _.insAtLeftEnd = function(el) { return this.insAtDirEnd(L, el); };
  _.insAtRightEnd = function(el) { return this.insAtDirEnd(R, el); };

  /**
   * jump up or down from one block Node to another:
   * - cache the current Point in the node we're jumping from
   * - check if there's a Point in it cached for the node we're jumping to
   *   + if so put the cursor there,
   *   + if not seek a position in the node that is horizontally closest to
   *     the cursor's current position
   */
  _.jumpUpDown = function(from, to) {
    var self = this;
    self.upDownCache[from.id] = Point.copy(self);
    var cached = self.upDownCache[to.id];
    if (cached) {
      cached[R] ? self.insLeftOf(cached[R]) : self.insAtRightEnd(cached.parent);
    }
    else {
      var pageX = self.offset().left;
      to.seek(pageX, 0, self);
    }
  };
  _.offset = function() {
    //in Opera 11.62, .getBoundingClientRect() and hence jQuery::offset()
    //returns all 0's on inline elements with negative margin-right (like
    //the cursor) at the end of their parent, so temporarily remove the
    //negative margin-right when calling jQuery::offset()
    //Opera bug DSK-360043
    //http://bugs.jquery.com/ticket/11523
    //https://github.com/jquery/jquery/pull/717
    var self = this, offset = self.jQ.removeClass('mq-cursor').offset();
    self.jQ.addClass('mq-cursor');
    return offset;
  }
  _.unwrapGramp = function() {
    var gramp = this.parent.parent;
    var greatgramp = gramp.parent;
    var rightward = gramp[R];
    var cursor = this;

    var leftward = gramp[L];
    gramp.disown().eachChild(function(uncle) {
      if (uncle.isEmpty()) return;

      uncle.children()
        .adopt(greatgramp, leftward, rightward)
        .each(function(cousin) {
          cousin.jQ.insertBefore(gramp.jQ.first());
        })
      ;

      leftward = uncle.ends[R];
    });

    if (!this[R]) { //then find something to be rightward to insLeftOf
      if (this[L])
        this[R] = this[L][R];
      else {
        while (!this[R]) {
          this.parent = this.parent[R];
          if (this.parent)
            this[R] = this.parent.ends[L];
          else {
            this[R] = gramp[R];
            this.parent = greatgramp;
            break;
          }
        }
      }
    }
    if (this[R])
      this.insLeftOf(this[R]);
    else
      this.insAtRightEnd(greatgramp);

    gramp.jQ.remove();

    if (gramp[L].siblingDeleted) gramp[L].siblingDeleted(cursor.options, R);
    if (gramp[R].siblingDeleted) gramp[R].siblingDeleted(cursor.options, L);
  };
  _.startSelection = function() {
    var anticursor = this.anticursor = Point.copy(this);
    var ancestors = anticursor.ancestors = {}; // a map from each ancestor of
      // the anticursor, to its child that is also an ancestor; in other words,
      // the anticursor's ancestor chain in reverse order
    for (var ancestor = anticursor; ancestor.parent; ancestor = ancestor.parent) {
      ancestors[ancestor.parent.id] = ancestor;
    }
  };
  _.endSelection = function() {
    delete this.anticursor;
  };
  _.select = function() {
    var anticursor = this.anticursor;
    if (this[L] === anticursor[L] && this.parent === anticursor.parent) return false;

    // Find the lowest common ancestor (`lca`), and the ancestor of the cursor
    // whose parent is the LCA (which'll be an end of the selection fragment).
    for (var ancestor = this; ancestor.parent; ancestor = ancestor.parent) {
      if (ancestor.parent.id in anticursor.ancestors) {
        var lca = ancestor.parent;
        break;
      }
    }
    pray('cursor and anticursor in the same tree', lca);
    // The cursor and the anticursor should be in the same tree, because the
    // mousemove handler attached to the document, unlike the one attached to
    // the root HTML DOM element, doesn't try to get the math tree node of the
    // mousemove target, and Cursor::seek() based solely on coordinates stays
    // within the tree of `this` cursor's root.

    // The other end of the selection fragment, the ancestor of the anticursor
    // whose parent is the LCA.
    var antiAncestor = anticursor.ancestors[lca.id];

    // Now we have two either Nodes or Points, guaranteed to have a common
    // parent and guaranteed that if both are Points, they are not the same,
    // and we have to figure out which is the left end and which the right end
    // of the selection.
    var leftEnd, rightEnd, dir = R;

    // This is an extremely subtle algorithm.
    // As a special case, `ancestor` could be a Point and `antiAncestor` a Node
    // immediately to `ancestor`'s left.
    // In all other cases,
    // - both Nodes
    // - `ancestor` a Point and `antiAncestor` a Node
    // - `ancestor` a Node and `antiAncestor` a Point
    // `antiAncestor[R] === rightward[R]` for some `rightward` that is
    // `ancestor` or to its right, if and only if `antiAncestor` is to
    // the right of `ancestor`.
    if (ancestor[L] !== antiAncestor) {
      for (var rightward = ancestor; rightward; rightward = rightward[R]) {
        if (rightward[R] === antiAncestor[R]) {
          dir = L;
          leftEnd = ancestor;
          rightEnd = antiAncestor;
          break;
        }
      }
    }
    if (dir === R) {
      leftEnd = antiAncestor;
      rightEnd = ancestor;
    }

    // only want to select Nodes up to Points, can't select Points themselves
    if (leftEnd instanceof Point) leftEnd = leftEnd[R];
    if (rightEnd instanceof Point) rightEnd = rightEnd[L];

    this.hide().selection = lca.selectChildren(leftEnd, rightEnd);
    this.insDirOf(dir, this.selection.ends[dir]);
    this.selectionChanged();
    this.ctrlr.container.prepend(this.touchcursors);
    var self = this;
    if(self.touchcursor[0].style.display == "" || self.touchanticursor[0].style.display == "") {
      self.touchcursor[0].style.display = "";
      self.touchanticursor[0].style.display = "";
      setTimeout(function() {
        if(self.selection && self.touchcursors[0]) {
          var bounds = self.touchcursors[0].getBoundingClientRect();
          var rbounds = self.selection.ends[R].jQ[0].getBoundingClientRect();
          var lbounds = self.selection.ends[L].jQ[0].getBoundingClientRect();
          var setright = function(touchcursor) {
            var sbounds = rbounds;
            touchcursor.last = { x: sbounds.right - bounds.left, y: sbounds.bottom - bounds.top};
            touchcursor[0].style.transform = 'translate(' + touchcursor.last.x +'px, ' + touchcursor.last.y + 'px)';
          }
          var setleft = function(touchcursor) {
            var sbounds = lbounds;
            touchcursor.last = { x: sbounds.left - bounds.left, y: sbounds.bottom - bounds.top};
            touchcursor[0].style.transform = 'translate(' + touchcursor.last.x +'px, ' + touchcursor.last.y + 'px)';
          }
          if(self.touchcursor.dragging) {
            if(self.touchcursor.last.x - window.scrollX < (rbounds.right + lbounds.left) / 2) {
              setright(self.touchanticursor);
            } else {
              setleft(self.touchanticursor);
            }
          } else if(self.touchanticursor.dragging) {
            if(self.touchanticursor.last.x -window.scrollX < (rbounds.right + lbounds.left) / 2) {
              setright(self.touchcursor);
            } else {
              setleft(self.touchcursor);
            }
          }
          self.toggleMenu("hide");
        }
      }, 0);
      this.selection.clear = function() {
        Selection.prototype.clear.apply(this, arguments);
        if(!self.touchcursor.dragging && !self.touchanticursor.dragging) {
          self.touchcursor[0].style.display = "none";
          self.touchanticursor[0].style.display = "none";
          self.toggleMenu("hide");
        }
      };
    }
    return true;
  };

  _.clearSelection = function() {
    if (this.selection) {
      this.selection.clear();
      delete this.selection;
      this.selectionChanged();
    }
    return this;
  };
  _.deleteSelection = function() {
    if (!this.selection) return;
    this.touchcursor[0].style.display = "none";
    this.touchanticursor[0].style.display = "none";
    this[L] = this.selection.ends[L][L];
    this[R] = this.selection.ends[R][R];
    this.selection.remove();
    this.selectionChanged();
    delete this.selection;
  };
  _.replaceSelection = function() {
    var seln = this.selection;
    if (seln) {
      var self = this;
      self.touchanticursor[0].style.display = "none";
      self.touchcursor[0].style.display = "none";
      this[L] = seln.ends[L][L];
      this[R] = seln.ends[R][R];
      delete this.selection;
    }
    return seln;
  };
  _.depth = function() {
    var node = this;
    var depth = 0;
    while (node = node.parent) {
      depth += (node instanceof MathBlock) ? 1 : 0;
    }
    return depth;
  };
  _.isTooDeep = function(offset) {
    if (this.options.maxDepth !== undefined) {
      return this.depth() + (offset || 0) > this.options.maxDepth;
    }
  };

  _.onCursorHandleTouchStart = function(e) {
    e.stopPropagation();
    e.preventDefault();
    this.dragging = true;
    this.showmenu = true;
    this.last = this.start = { x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY };
    var x = this.last.x;
    var self = this.cursor;
    if(self.selection) {
      this.blockunselectinto = false;
      this.blockselectoutof = false;
      var sbounds = self.selection.jQ[0].getBoundingClientRect();
      var mirrored = false;
      if(self.selection.ends[L][L] === self[L] && sbounds.left + sbounds.width / 2 < x - window.scrollX) {
        self[L] = self.selection.ends[R];
        self[R] = self.selection.ends[R][R];
        self.parent = self[L].parent;
        if(!self._anticursor || self._anticursor.ref !== self.anticursor) {
          self._anticursor = self.anticursor;
          self._anticursor.ref = self.anticursor = Point();
        }
        self.anticursor[L] = self.selection.ends[L][L];
        self.anticursor[R] = self.selection.ends[L];
        self.anticursor.parent = self[R].parent;
        mirrored = true;
      } else if(self.selection.ends[R][R] === self[R] && sbounds.left + sbounds.width / 2 > x - scrollX) {
        self[L] = self.selection.ends[L][L];
        self[R] = self.selection.ends[L];
        self.parent = self[R].parent;
        if(!self._anticursor || self._anticursor.ref !== self.anticursor) {
          self._anticursor = self.anticursor;
          self._anticursor.ref = self.anticursor = Point();
        }
        self.anticursor[L] = self.selection.ends[R];
        self.anticursor[R] = self.selection.ends[R][R];
        self.anticursor.parent = self[L].parent;
        mirrored = true;
      }
      if(mirrored) {
        var dir = self.selection.ends[L][L] === self[L] ? L : R;
        if(self.anticursor[dir].id in self._anticursor.ancestors) {
          self._anticursor.ref = self.anticursor = self._anticursor;
        } else {
          var anticursor = self.anticursor;
          var ancestors = anticursor.ancestors = {}; // a map from each ancestor of
          // the anticursor, to its child that is also an ancestor; in other words,
          // the anticursor's ancestor chain in reverse order
          for (var ancestor = anticursor; ancestor.parent; ancestor = ancestor.parent) {
            ancestors[ancestor.parent.id] = ancestor;
          }
        }
      }
    }
  };

  _.onCursorHandleTouchMove = function(e) {
      e.stopPropagation();

      this.last = { x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY };
      var x = this.last.x;
      var y = this.last.y - 22;
      var self = this.cursor;
      if(!self.selection) {
        self.ctrlr.seek(undefined, x, y);
      } else if(self.selection.jQ.length == 1) {
        var sbounds = self.selection.jQ[0].getBoundingClientRect();
        // if((self.selection.ends[L][L] === self[L] && sbounds.left + sbounds.width / 2 < x) || (self.selection.ends[R][R] === self[R] && sbounds.left + sbounds.width / 2 > x)) {
        //   var l = self[L];
        //   var r = self[R];
        //   var p = self.parent;
        //   // var a = self.ancestors;
        //   self[L] = self.anticursor[L];
        //   self[R] = self.anticursor[R];
        //   self.parent = self.anticursor.parent;
        //   // self.ancestors = self.anticursor.ancestors;
        //   self.anticursor[L] = l;
        //   self.anticursor[R] = r;
        //   self.anticursor.parent = p;
        //   // self.anticursor.ancestors = a;
        //   // if(!self.anticursor.ancestor) {
        //   //   var ancestors = self.anticursor.ancestors = {}; // a map from each ancestor of
        //   //   // the anticursor, to its child that is also an ancestor; in other words,
        //   //   // the anticursor's ancestor chain in reverse order
        //   //   for (var ancestor = self.anticursor; ancestor.parent; ancestor = ancestor.parent) {
        //   //     ancestors[ancestor.parent.id] = ancestor;
        //   //   }
        //   // }
        // }

        //if (!self.anticursor) self.startSelection();
        var dir = self.selection.ends[L][L] === self[L] ? L : R;//self.selection.ends[L].jQ.offset().left < self.selection.ends[R].jQ.offset().left
        //self.ctrlr.seek(undefined, x, y).cursor.select();
        //self.ctrlr.seek(self.parent.jQ, x, y).cursor.select();
        var seeked = false;
        self.selection.clear();
        if(this.blockunselectinto && ((dir == L && x - window.scrollX < sbounds.left) || (dir == R && x - window.scrollX > sbounds.right))) {
          this.blockunselectinto = false;
        } else if(!seeked && !this.blockunselectinto && ((dir == L && x - window.scrollX > sbounds.left) || (dir == R && x - window.scrollX < sbounds.right)) && self[-dir].id in self.anticursor.ancestors) {
          self[-dir].unselectInto(-dir, self);
          self.select();
          seeked = true;
          this.blockselectoutof = true;
        }
        // if(!seeked && self[dir] != 0) {
        //   var dirbounds = self[dir].jQ[0].getBoundingClientRect();
        //   if(x - window.scrollX < (dirbounds.left + dirbounds.right) / 2) {
        //     self.ctrlr.selectDir(dir);
        //     seeked = true;
        //   }
        // }
        // if(!seeked && self[-dir] != 0) {
        //   var dirbounds = self[-dir].jQ[0].getBoundingClientRect();
        //   if(x - window.scrollX > (dirbounds.left + dirbounds.right) / 2) {
        //     self.ctrlr.selectDir(-dir);
        //     seeked = true;
        //   }
        // }
        if(!seeked && self[L] != 0) {
          var dirbounds = self[L].jQ[0].getBoundingClientRect();
          if(x - window.scrollX < (dirbounds.left + dirbounds.right) / 2) {
            self.ctrlr.selectDir(L);
            seeked = true;
          }
        }
        if(!seeked && self[R] != 0) {
          var dirbounds = self[R].jQ[0].getBoundingClientRect();
          if(x - window.scrollX > (dirbounds.left + dirbounds.right) / 2) {
            self.ctrlr.selectDir(R);
            seeked = true;
          }
        }
        if(!seeked && this.blockselectoutof && ((dir == L && x - window.scrollX >= sbounds.left) || (dir == R && x - window.scrollX <= sbounds.right))) {
          this.blockselectoutof = false;
        }
        else if(!seeked && !this.blockselectoutof && self[dir] == 0) {
          var end = self[-dir];
          var parent = self.parent;
          self.parent.selectOutOf(dir, self);
          var dirbounds = self[-dir].jQ[0].getBoundingClientRect();
          if(((dir == L) && (x - window.scrollX > (dirbounds.left + sbounds.left) / 2)) || ((dir == R) && (x - window.scrollX < (sbounds.right + dirbounds.right) / 2))) {
            self[-dir] = end;
            self[dir] = 0;
            self.parent = parent;
          } else {
            this.blockunselectinto = true;
            self.select();
            seeked = true;
          }
          //self.ctrlr.seek(undefined, x, y).cursor.select();
        }
        if(!seeked) {
          self.select();
        }
        if(!self.selection) {
          // Hide non dragging cursor
          self.touchanticursor.other[0].style.display = "none";
        }
        // while (self[dir]) {

        // }
        // var sbounds2 = self.selection.jQ[0].getBoundingClientRect();
        // if(sbounds.left != sbounds2.left) {
        //   console.log("??");
        // }
      } else {
        // Hide non dragging cursor
        self.touchanticursor.other[0].style.display = "none";
      }
      this.showmenu &= Math.abs(this.start.x - x) <= 20 && Math.abs(this.start.y - y) <= 20;
      var bounds = self.touchcursors[0].getBoundingClientRect();
      this[0].style.transform = 'translate(' + (x - bounds.left - window.scrollX) +'px, ' + (y - bounds.top - window.scrollY) + 'px)';
  };

  _.onCursorHandleTouchEnd = function(e) {
      e.stopPropagation();
      this.dragging = false;
      this.blockunselectinto = false;
      var self = this;
      var x = this.last.x;
      var y = this.last.y;
      if (this.showmenu) {
        var bounds = self.cursor.touchcursors[0].getBoundingClientRect();
        this.cursor.menu[0].style.left = (x - window.scrollX - bounds.left) + "px";
        this.cursor.menu[0].style.top = (y - window.scrollY - 44 - bounds.top) + "px";
        this.cursor.toggleMenu("show");
      }
      if(this.cursor.selection) {
        var self = this.cursor;
        setTimeout(function() {
          if(self.selection && self.touchcursors[0]) {
            var bounds = self.touchcursors[0].getBoundingClientRect();
            if(!self.touchcursor.dragging) {
              var sbounds = self.selection.ends[R].jQ[0].getBoundingClientRect();
              self.touchcursor[0].style.transform = 'translate(' + (sbounds.right - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
            }
            if(!self.touchanticursor.dragging) {
              var sbounds = self.selection.ends[L].jQ[0].getBoundingClientRect();
              self.touchanticursor[0].style.transform = 'translate(' + (sbounds.left - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
            }
          }
        }, 0);
      } else {
        setTimeout(function() {
          if(self.cursor.jQ[0]) {
            var bounds = self.cursor.touchcursors[0].getBoundingClientRect();
            var sbounds = self.cursor.jQ[0].getBoundingClientRect();
            self[0].style.transform = 'translate(' + (sbounds.left - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
          }
        }, 0);
      }
  };

  _.toggleMenu = function(command) {
    if(command === "show") {
      var all = this.menu[0].querySelectorAll('li[class="menu-option"]');
      if(this.ctrlr.editable) {
        if(this.selection) {
          all.item(0).style.display = "";
          all.item(1).style.display = "";
          all.item(2).style.display = "";
        } else {
          all.item(0).style.display = "none";
          all.item(1).style.display = "none";
          all.item(2).style.display = "";
        }
      } else {
        all.item(0).style.display = "";
        all.item(1).style.display = "none";
        all.item(2).style.display = "none";
      }
      this.menu[0].style.display = "block";
    } else {
      this.menu[0].style.display = "none";
    }
  };

  _.showTouchCursors = function() {
    this.ctrlr.container.prepend(this.touchcursors);
    var self = this;
    self.toggleMenu("hide");
    if(this.selection) {
      self.touchcursor[0].style.display = "";
      self.touchanticursor[0].style.display = "";
      setTimeout(function() {
        if(self.selection && self.touchcursors[0]) {
          var bounds = self.touchcursors[0].getBoundingClientRect();
          if(!self.touchcursor.dragging) {
            var sbounds = self.selection.ends[R].jQ[0].getBoundingClientRect();
            self.touchcursor[0].style.transform = 'translate(' + (sbounds.right - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
          }
          if(!self.touchanticursor.dragging) {
            var sbounds = self.selection.ends[L].jQ[0].getBoundingClientRect();
            self.touchanticursor[0].style.transform = 'translate(' + (sbounds.left - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
          }
        }
      }, 0);
      this.selection.clear = function() {
        Selection.prototype.clear.apply(this, arguments);
        if(!self.touchcursor.dragging && !self.touchanticursor.dragging) {
          self.touchanticursor[0].style.display = "none";
          self.touchcursor[0].style.display = "none";
          self.toggleMenu("hide");
        }
      };
    } else if(self.ctrlr.editable){
      self.touchcursor[0].style.display = "";
      setTimeout(function() {
        if(self.jQ[0]) {
          var bounds = self.touchcursors[0].getBoundingClientRect();
          var sbounds = self.jQ[0].getBoundingClientRect();
          self.touchcursor[0].style.transform = 'translate(' + (sbounds.left - bounds.left) +'px, ' + (sbounds.bottom - bounds.top) + 'px)';
        }
      }, 0);
    }
  }
});

var Selection = P(Fragment, function(_, super_) {
  _.init = function() {
    super_.init.apply(this, arguments);
    this.jQ = this.jQ.wrapAll('<span class="mq-selection"></span>').parent();
      //can't do wrapAll(this.jQ = $(...)) because wrapAll will clone it
  };
  _.adopt = function() {
    this.jQ.replaceWith(this.jQ = this.jQ.children());
    return super_.adopt.apply(this, arguments);
  };
  _.clear = function() {
    // using the browser's native .childNodes property so that we
    // don't discard text nodes.
    this.jQ.replaceWith(this.jQ[0].childNodes);
    return this;
  };
  _.join = function(methodName) {
    return this.fold('', function(fold, child) {
      return fold + child[methodName]();
    });
  };
});
