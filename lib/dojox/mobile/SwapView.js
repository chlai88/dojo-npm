define([
	"dojo/_base/array",
	"dojo/_base/connect",
	"dojo/_base/declare",
	"dojo/dom",
	"dojo/dom-class",
	"dijit/registry",	// registry.byNode
	"./View",
	"./_ScrollableMixin"
], function(array, connect, declare, dom, domClass, registry, View, ScrollableMixin){

/*=====
	var View = dojox.mobile.View;
	var ScrollableMixin = dojox.mobile._ScrollableMixin;
=====*/

	// module:
	//		dojox/mobile/SwapView
	// summary:
	//		A container that can be flipped horizontally.

	return declare("dojox.mobile.SwapView", [View, ScrollableMixin], {
		// summary:
		//		A container that can be flipped horizontally.
		// description:
		//		SwapView is a container widget that represents entire mobile
		//		device screen, and can be swiped horizontally. (In dojo-1.6, it
		//		was called 'FlippableView'.) SwapView is a subclass of
		//		dojox.mobile.View. SwapView allows the user to swipe the screen
		//		left or right to move between the views. When SwapView is
		//		swiped, it finds an adjacent SwapView to open it.

		/* internal properties */	
		scrollDir: "f",
		weight: 1.2,

		buildRendering: function(){
			this.inherited(arguments);
			domClass.add(this.domNode, "mblSwapView");
			this.setSelectable(this.domNode, false);
			this.containerNode = this.domNode;
			this.subscribe("/dojox/mobile/nextPage", "handleNextPage");
			this.subscribe("/dojox/mobile/prevPage", "handlePrevPage");
			this.noResize = true; // not to call resize() from scrollable#init
		},

		startup: function(){
			if(this._started){ return; }
			this.inherited(arguments);
		},

		resize: function(){
			// summary:
			//		Calls resize() of each child widget.
			this.inherited(arguments); // scrollable#resize() will be called
			array.forEach(this.getChildren(), function(child){
				if(child.resize){ child.resize(); }
			});
		},

		onTouchStart: function(e){
			// summary:
			//		Internal function to handle touchStart events.
			var fromTop = this.domNode.offsetTop;
			var nextView = this.nextView(this.domNode);
			if(nextView){
				nextView.stopAnimation();
				domClass.add(nextView.domNode, "mblIn");
				// Temporarily add padding to align with the fromNode while transition
				nextView.containerNode.style.paddingTop = fromTop + "px";
			}
			var prevView = this.previousView(this.domNode);
			if(prevView){
				prevView.stopAnimation();
				domClass.add(prevView.domNode, "mblIn");
				// Temporarily add padding to align with the fromNode while transition
				prevView.containerNode.style.paddingTop = fromTop + "px";
			}
			this.inherited(arguments);
		},

		handleNextPage: function(/*Widget*/w){
			// summary:
			//		Called when the "/dojox/mobile/nextPage" topic is published.
			var refNode = w.refId && dom.byId(w.refId) || w.domNode;
			if(this.domNode.parentNode !== refNode.parentNode){ return; }
			if(this.getShowingView() !== this){ return; }
			this.goTo(1);
		},

		handlePrevPage: function(/*Widget*/w){
			// summary:
			//		Called when the "/dojox/mobile/prevPage" topic is published.
			var refNode = w.refId && dom.byId(w.refId) || w.domNode;
			if(this.domNode.parentNode !== refNode.parentNode){ return; }
			if(this.getShowingView() !== this){ return; }
			this.goTo(-1);
		},

		goTo: function(/*Number*/dir, /*String?*/moveTo){
			// summary:
			//		Moves to the next or previous view.
			var view = moveTo ? registry.byId(moveTo) :
				((dir == 1) ? this.nextView(this.domNode) : this.previousView(this.domNode));
			if(view && view !== this){
				this.performTransition(view.id, dir, "slide", null, function(){
					connect.publish("/dojox/mobile/viewChanged", [view]);
				});
			}
		},

		isSwapView: function(node){
			// summary:
			//		Returns true if the given node is a SwapView widget.
			return (node && node.nodeType === 1 && domClass.contains(node, "mblSwapView"));
		},

		nextView: function(node){
			// summary:
			//		Returns the next view.
			for(var n = node.nextSibling; n; n = n.nextSibling){
				if(this.isSwapView(n)){ return registry.byNode(n); }
			}
			return null;
		},

		previousView: function(node){
			// summary:
			//		Returns the previous view.
			for(var n = node.previousSibling; n; n = n.previousSibling){
				if(this.isSwapView(n)){ return registry.byNode(n); }
			}
			return null;
		},

		scrollTo: function(/*Object*/to){
			// summary:
			//		Overrides dojox.mobile.scrollable.scrollTo().
			if(!this._beingFlipped){
				var newView, x;
				if(to.x < 0){
					newView = this.nextView(this.domNode);
					x = to.x + this.domNode.offsetWidth;
				}else{
					newView = this.previousView(this.domNode);
					x = to.x - this.domNode.offsetWidth;
				}
				if(newView){
					if(newView.domNode.style.display === "none"){
						newView.domNode.style.display = "";
						newView.resize();
					}
					newView._beingFlipped = true;
					newView.scrollTo({x:x});
					newView._beingFlipped = false;
				}
			}
			this.inherited(arguments);
		},

		slideTo: function(/*Object*/to, /*Number*/duration, /*String*/easing, fake_pos){
			// summary:
			//		Overrides dojox.mobile.scrollable.slideTo().
			if(!this._beingFlipped){
				var w = this.domNode.offsetWidth;
				var pos = fake_pos || this.getPos();
				var newView, newX;
				if(pos.x < 0){ // moving to left
					newView = this.nextView(this.domNode);
					if(pos.x < -w/4){ // slide to next
						if(newView){
							to.x = -w;
							newX = 0;
						}
					}else{ // go back
						if(newView){
							newX = w;
						}
					}
				}else{ // moving to right
					newView = this.previousView(this.domNode);
					if(pos.x > w/4){ // slide to previous
						if(newView){
							to.x = w;
							newX = 0;
						}
					}else{ // go back
						if(newView){
							newX = -w;
						}
					}
				}

				if(newView){
					newView._beingFlipped = true;
					newView.slideTo({x:newX}, duration, easing);
					newView._beingFlipped = false;

					if(newX === 0){ // moving to another view
						dojox.mobile.currentView = newView;
					}
					newView.domNode._isShowing = (newView && newX === 0);
				}
				this.domNode._isShowing = !(newView && newX === 0);
			}
			this.inherited(arguments);
		},

		onFlickAnimationEnd: function(e){
			// summary:
			//		Overrides dojox.mobile.scrollable.onFlickAnimationEnd().
			if(e && e.animationName && e.animationName !== "scrollableViewScroll2"){ return; }
			this.inherited(arguments);

			if(this.domNode._isShowing){
				// Hide all the views other than the currently showing one.
				// Otherwise, when the orientation is changed, other views
				// may appear unexpectedly.
				array.forEach(this.domNode.parentNode.childNodes, function(c){
					if(this.isSwapView(c)){
						domClass.remove(c, "mblIn");
						if(!c._isShowing){
							c.style.display = "none";
							c.style.webkitTransform = "";
						}
					}
				}, this);
				connect.publish("/dojox/mobile/viewChanged", [this]);
				// Reset the temporary padding
				this.containerNode.style.paddingTop = "";
			}else{
				this.containerNode.style.left = "0px"; // compat mode needs this
			}
		}
	});
});
