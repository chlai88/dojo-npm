define([
	"dojo/_base/array",
	"dojo/_base/lang",
	"dojo/_base/declare",
	"./resolve",
	"./sync"
], function(array, lang, declare, resolve, sync){
	function getLogContent(/*dojo.Stateful*/ target, /*String*/ targetProp){
		return [target._setIdAttr || !target.declaredClass ? target : target.declaredClass, targetProp].join(":");
	}

	function logResolveFailure(target, targetProp){
		console.warn(targetProp + " could not be resolved" + (typeof target == "string" ? (" with " + target) : "") + ".");
	}

	function getParent(/*dijit._WidgetBase*/ w){
		// summary:
		//		Returns parent widget having data binding target for relative data binding.
		// w: dijit._WidgetBase
		//		The widget.

		// Usage of dijit/registry module is optional. Return null if it's not already loaded.
		var registry;
		try{
			registry = require("dijit/registry");
		}catch(e){
			return;
		}
		var pn = w.domNode && w.domNode.parentNode, pw, pb;
		while(pn){
			pw = registry.getEnclosingWidget(pn);
			if(pw){
				var relTargetProp = pw._relTargetProp || "target", pt = lang.isFunction(pw.get) ? pw.get(relTargetProp) : pw[relTargetProp];
				if(pt || relTargetProp in pw.constructor.prototype){
					return pw; // dijit._WidgetBase
				}
			}
			pn = pw && pw.domNode.parentNode;
		}
	}

	function bind(/*dojo.Stateful|String*/ target, /*String*/ targetProp, /*dijit._WidgetBase*/ source, /*String*/ sourceProp, /*dojox.mvc.sync.options*/ options){
		// summary:
		//		Resolves the data binding literal, and starts data binding.
		// target: dojo.Stateful|String
		//		Target data binding literal or dojo.Stateful to be synchronized.
		// targetProp: String
		//		The property name in target to be synchronized.
		// source: dijit._WidgetBase
		//		Source dojo.Stateful to be synchronized.
		// sourceProp: String
		//		The property name in source to be synchronized.
		// options: dojox.mvc.sync.options
		//		Data binding options.

		var _handles = {}, parent = getParent(source), relTargetProp = parent && parent._relTargetProp || "target";

		function resolveAndBind(){
			_handles["Two"] && _handles["Two"].unwatch();
			delete _handles["Two"];

			var relTarget = parent && (lang.isFunction(parent.get) ? parent.get(relTargetProp) : parent[relTargetProp]),
			 resolvedTarget = resolve(target, relTarget),
			 resolvedSource = resolve(source, relTarget);

			if(!resolvedTarget || /^rel:/.test(target) && !parent){ logResolveFailure(target, targetProp); }
			if(!resolvedSource || /^rel:/.test(source) && !parent){ logResolveFailure(source, sourceProp); }
			if(!resolvedTarget || !resolvedSource || (/^rel:/.test(target) || /^rel:/.test(source)) && !parent){ return; }
			if((!resolvedTarget.set || !resolvedTarget.watch) && targetProp == "*"){
				logResolveFailure(target, targetProp);
				return;
			}

			if(targetProp == null){
				// If target property is not specified, it means this handle is just for resolving data binding target.
				// (For dojox.mvc.Group and dojox.mvc.Repeat)
				// Do not perform data binding synchronization in such case.
				lang.isFunction(resolvedSource.set) ? resolvedSource.set(sourceProp, resolvedTarget) : (resolvedSource[sourceProp] = resolvedTarget);
				if(dojox.debugDataBinding){
					console.log("dojox.mvc._atBindingMixin set " + resolvedTarget + " to: " + getLogContent(resolvedSource, sourceProp));
				}
			}else{
				// Start data binding
				_handles["Two"] = sync(resolvedTarget, targetProp, resolvedSource, sourceProp, options); // dojox.mvc.sync.handle
			}
		}

		resolveAndBind();
		if(parent && /^rel:/.test(target) || /^rel:/.test(source) && lang.isFunction(parent.set) && lang.isFunction(parent.watch)){
			_handles["rel"] = parent.watch(relTargetProp, function(name, old, current){
				if(old !== current){
					if(dojox.debugDataBinding){ console.log("Change in relative data binding target: " + parent); }
					resolveAndBind();
				}
			});
		}
		return {
			unwatch: function(){
				for(var s in _handles){
					_handles[s] && _handles[s].unwatch();
					delete _handles[s];
				}
			}
		};
	}

	return declare("dojox.mvc._atBindingMixin", null, {
		_dbpostscript: function(/*Object?*/ params, /*DomNode|String*/ srcNodeRef){
			// summary:
			//		See if any parameters for this widget are dojox.mvc.at handles.
			//		If so, move them under this._refs to prevent widget implementations from referring them.

			var refs = this._refs = {};
			for(var prop in params){
				if((params[prop] || {}).atsignature == "dojox.mvc.at"){
					var h = params[prop];
					delete params[prop];
					refs[prop] = h;
				}
			}
		},

		_startAtWatchHandles: function(){
			// summary:
			//		Establish data bindings based on dojox.mvc.at() watch handles.

			var refs = this._refs;
			if(refs){
				var atWatchHandles = this._atWatchHandles = this._atWatchHandles || {};

				// Clear the cache of properties that data binding is established with
				this._excludes = null;

				// First, establish non-wildcard data bindings
				for(var prop in refs){
					if(!refs[prop] || prop == "*"){ continue; }
					atWatchHandles[prop] = bind(refs[prop].target, refs[prop].targetProp, this, prop, {direction: refs[prop].direction, converter: refs[prop].converter});
				}

				// Then establish wildcard data bindings
				if((refs["*"] || {}).atsignature == "dojox.mvc.at"){
					atWatchHandles["*"] = bind(refs[prop].target, refs["*"].targetProp, this, "*", {direction: refs["*"].direction, converter: refs["*"].converter});
				}
			}
		},

		_stopAtWatchHandles: function(){
			// summary:
			//		Stops data binding synchronization handles as widget is destroyed.

			for(var s in this._atWatchHandles){
				this._atWatchHandles[s].unwatch();
				delete this._atWatchHandles[s];
			}
		},

		_setAtWatchHandle: function(/*String*/ name, /*Anything*/ value){
			// summary:
			//		Called if the value is a dojox.mvc.at handle.
			//		If this widget has started, start data binding with the new dojox.mvc.at handle.
			//		Otherwise, queue it up to this._refs so that _dbstartup() can pick it up.

			if(name == "ref"){
				throw new Error(this + ": 1.7 ref syntax used in conjuction with 1.8 dojox.mvc.at() syntax, which is not supported.");
			}

			// Claen up older data binding
			var atWatchHandles = this._atWatchHandles = this._atWatchHandles || {};
			if(atWatchHandles[name]){
				atWatchHandles[name].unwatch();
				delete atWatchHandles[name];
			}

			// Claar the value
			this[name] = null;

			// Clear the cache of properties that data binding is established with
			this._excludes = null;

			if(this._started){
				// If this widget has been started already, establish data binding immediately.
				atWatchHandles[name] = bind(value.target, value.targetProp, this, name, {direction: value.direction, converter: value.converter});
			}else{
				// Otherwise, queue it up to this._refs so that _dbstartup() can pick it up.
				this._refs[name] = value;
			}
		},

		_getExcludesAttr: function(){
			// summary:
			//		Returns list of all properties that data binding is established with.

			if(this._excludes){ return this._excludes; }
			var list = [];
			for(var s in this._atWatchHandles){
				if(s != "*"){ list.push(s); }
			}
			return list; // String[]
		},

		_getPropertiesAttr: function(){
			// summary:
			//		Returns list of all properties in this widget, except "id".

			if(this.constructor._attribs){
				return this.constructor._attribs;
			}
			var list = ["onClick"].concat(this.constructor._setterAttrs);
			array.forEach(["id", "excludes", "properties", "ref", "binding"], function(s){
				var index = array.indexOf(list, s);
				if(index >= 0){ list.splice(index, 1); }
			});
			return this.constructor._attribs = list; // String[]
		}
	});
});
