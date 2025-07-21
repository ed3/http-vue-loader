(function (global, factory){
typeof exports==='object' && typeof module !== 'undefined' ? module.exports=factory() : typeof define==='function' && define.amd ? define(factory) : (global=typeof globalThis !== 'undefined' ? globalThis : global || self, global.httpVueLoader=factory());
})(this,function(){
	'use strict';
	let scopeIndex=0;
	function resolveURL(baseURL, url){
		if(url.startsWith('./') || url.startsWith('../')){
			const baseParts=baseURL.split('/');
			baseParts.pop();
			const urlParts=url.split('/');
			urlParts.forEach(part=>{
				if(part==='..'){
					baseParts.pop();
				}else if(part !== '.'){
					baseParts.push(part);
				}
			});
			return baseParts.join('/');
		}
		return url;
	}
	function parseComponentURL(url){
		const comp=url.match(/(.*?)([^\/]+?)\/?(\.vue)?(\?.*|#.*|$)/);
		return{name: comp[2], url: comp[1] + comp[2] + (comp[3]===undefined ? '/index.vue' : comp[3]) + comp[4]};
	}
	function httpRequest(url){
		return new Promise(function(resolve,reject){
			const xhr=new XMLHttpRequest();
			xhr.open('GET',url);
			xhr.responseType='text';
			xhr.onreadystatechange=function(){
				if(xhr.readyState===4){
					if(xhr.status >= 200 && xhr.status < 300){
						resolve(xhr.responseText);
					}else{
						reject(xhr.status);
					}
				}
			};
			xhr.send(null);
		});
	}
	function StyleContext(component,elt){
		this.component=component;
		this.elt=elt;
		this.compiled=false;
	}
	StyleContext.prototype={
		withBase:function(callback){
			let tmpBaseElt;
			if(this.component.baseURI){
				tmpBaseElt=document.createElement('base');
				tmpBaseElt.href=this.component.baseURI;
				const headElt=this.component.getHead();
				headElt.insertBefore(tmpBaseElt,headElt.firstChild);
			}
			callback.call(this);
			if(tmpBaseElt) this.component.getHead().removeChild(tmpBaseElt);
		},
		scopeStyles:function(styleElt,scopeName){
			function process(){
				const sheet=styleElt.sheet;
				if(!sheet){
					console.warn('httpVueLoader: Stylesheet not available for scoping.',styleElt);
					return;
				}
				const rules=sheet.cssRules;
				for(let i=0;i < rules.length;++i){
					const rule=rules[i];
					if(rule.type !== CSSRule.STYLE_RULE){
						continue;
					}
					const scopedSelectors=[];
					rule.selectorText.split(/\s*,\s*/).forEach(function (sel){
						scopedSelectors.push(`${scopeName} ${sel}`);
						const segments=sel.match(/([^ :]+)(.+)?/);
						if(segments && segments[1]){
							scopedSelectors.push(segments[1] + scopeName + (segments[2] || ''));
						}
					});
					const scopedRule=scopedSelectors.join(',') + rule.cssText.substring(rule.selectorText.length);
					sheet.deleteRule(i);
					sheet.insertRule(scopedRule, i);
				}
			}
			try{
				process();
			}catch(ex){
				if(ex instanceof DOMException && ex.code===DOMException.INVALID_ACCESS_ERR){
					styleElt.sheet.disabled=true;
					styleElt.addEventListener('load',function onStyleLoaded(){
						styleElt.removeEventListener('load',onStyleLoaded);
						setTimeout(function(){
							process();
							styleElt.sheet.disabled=false;
						});
					});
					return;
				}
				console.error('httpVueLoader: Error scoping styles:',ex);
				throw ex;
			}
		},
		compile:function(){
			if(this.compiled) return Promise.resolve();
			const scoped=this.elt.hasAttribute('scoped');
			if(scoped){
				this.elt.removeAttribute('scoped');
			}
			this.withBase(function(){
				this.component.getHead().appendChild(this.elt);
			});
			if(scoped){
				this.scopeStyles(this.elt, '[' + this.component.getScopeId() + ']');
			}
			this.compiled=true;
			return Promise.resolve();
		},
		getContent:function(){
			return this.elt.textContent;
		},
		setContent:function(content){
			this.withBase(function(){
				this.elt.textContent=content;
			});
		}
	};
	function ScriptContext(component,elt){
		this.component=component;
		this.elt=elt;
		this.module={exports:{}};
	}
	ScriptContext.prototype={
		getContent:function(){
			return this.elt.textContent;
		},
		setContent:function(content){
			this.elt.textContent=content;
		},
		compile:function(){
			const childModuleRequire=function(childURL){
				return httpVueLoader.require(resolveURL(this.component.baseURI,childURL));
			}.bind(this);
			const childLoader=function(childURL, childName){
				return httpVueLoader(resolveURL(this.component.baseURI,childURL),childName);
			}.bind(this);
			let scriptContent=this.getContent();
			let finalExports={};
			try{
				const exportDefaultRegex=/export\s+default\s+((?:function|class)\s*(?:[a-zA-Z_$][0-9a-zA-Z_$]*)?|[{[]|[\w.$]+)/;
				const match=scriptContent.match(exportDefaultRegex);
				if(match){
					scriptContent=scriptContent.replace(exportDefaultRegex,'module.exports=$1');
				}else{
				}
				new Function('exports','require','httpVueLoader','module',scriptContent)
					.call(this.module.exports,this.module.exports,childModuleRequire,childLoader,this.module);
				finalExports=this.module.exports;
			}catch(ex){
				console.error('httpVueLoader: Error compiling script:',ex);
				throw ex;
			}
			return Promise.resolve(finalExports)
				.then(httpVueLoader.scriptExportsHandler.bind(this))
				.then(function (exports){
					this.module.exports=exports;
					return exports;
				}.bind(this));
		}
	};
	function TemplateContext(component,elt){
		this.component=component;
		this.elt=elt;
	}
	TemplateContext.prototype={
		getContent:function(){
			return this.elt.innerHTML;
		},
		setContent:function(content){
			this.elt.innerHTML=content;
		},
		getRootElt:function(){
			const tplElt=this.elt.content || this.elt;
			if('firstElementChild' in tplElt){
				return tplElt.firstElementChild;
			}
			for(let it=tplElt.firstChild; it !== null; it=it.nextSibling){
				if(it.nodeType===Node.ELEMENT_NODE) return it;
			}
			return null;
		},
		compile:function(){
			return Promise.resolve();
		}
	};
	function Component(name){
		this.name=name;
		this.template=null;
		this.script=null;
		this.styles=[];
		this._scopeId='';
		this.baseURI='';
	}
	Component.prototype={
		getHead:function(){
			return document.head || document.getElementsByTagName('head')[0];
		},
		getScopeId:function(){
			if(this._scopeId===''){
				this._scopeId='data-v-' + (scopeIndex++).toString(36);
				const rootElt=this.template && this.template.getRootElt();
				if(rootElt){
					rootElt.setAttribute(this._scopeId,'');
				}else{
					console.warn('httpVueLoader: No root element found for template. Scoped CSS might not apply correctly.');
				}
			}
			return this._scopeId;
		},
		load:function(componentURL){
			return httpRequest(componentURL).then(function (responseText){
				this.baseURI=componentURL.substring(0,componentURL.lastIndexOf('/') + 1);
				const doc=document.implementation.createHTMLDocument('');
				doc.body.innerHTML=(this.baseURI ? '<base href="' + this.baseURI + '">' : '') + responseText;
				for(let it=doc.body.firstChild; it; it=it.nextSibling){
					switch (it.nodeName){
						case 'TEMPLATE':
							this.template=new TemplateContext(this,it);
							break;
						case 'SCRIPT':
							this.script=new ScriptContext(this,it);
							break;
						case 'STYLE':
							this.styles.push(new StyleContext(this,it));
							break;
					}
				}
				return this;
			}.bind(this));
		},
		_normalizeSection:function(eltCx){
			if(!eltCx) return Promise.resolve(null);
			let p;
			if(eltCx.elt.hasAttribute('src')){
				p=httpRequest(resolveURL(this.baseURI,eltCx.elt.getAttribute('src'))).then(function(content){
					eltCx.elt.removeAttribute('src');
					return content;
				});
			} else{
				p=Promise.resolve(null);
			}
			return p.then(function (content){
				if(eltCx.elt.hasAttribute('lang')){
					const lang=eltCx.elt.getAttribute('lang');
					eltCx.elt.removeAttribute('lang');
					if(httpVueLoader.langProcessor[lang.toLowerCase()]){
						return httpVueLoader.langProcessor[lang.toLowerCase()].call(this,content===null ? eltCx.getContent() : content);
					} else{
						console.warn(`httpVueLoader: Language processor for "${lang}" not found.`);
					}
				}
				return content;
			}.bind(this)).then(function (content){
				if(content !== null){
					eltCx.setContent(content);
				}
			});
		},
		normalize:function(){
			return Promise.all([this._normalizeSection(this.template),this._normalizeSection(this.script),...this.styles.map(this._normalizeSection)])
				.then(function (){return this;}.bind(this));
		},
		compile:function(){
			return Promise.all([this.template && this.template.compile(),this.script && this.script.compile(),...this.styles.map(function(style){ return style.compile(); })]).then(function (){return this;}.bind(this));
		}
	};
	function httpVueLoader(url,name){
		const comp=parseComponentURL(url);
		return httpVueLoader.load(comp.url,name);
	}
	httpVueLoader.load=function (url,name){
		return new Promise((resolve,reject)=>{
			new Component(name).load(url).then(function (component){
				return component.normalize();
			}).then(function (component){
				return component.compile();
			}).then(function (component){
				let componentOptions=component.script !== null ? component.script.module.exports :{};
				if(component.template !== null){
					componentOptions.template=component.template.getContent();
				}
				if(componentOptions.name===undefined){
					if(component.name !== undefined) componentOptions.name=component.name;
				}
				if(component.styles.some(s => s.elt.hasAttribute('scoped'))){
					componentOptions.__scopeId=component.getScopeId();
				}
				componentOptions._baseURI=component.baseURI;
				resolve(componentOptions);
			}).catch(reject);
		});
	};
	httpVueLoader.register=function (app,url){
		const comp=parseComponentURL(url);
		app.component(comp.name,Vue.defineAsyncComponent(() => httpVueLoader.load(comp.url,comp.name)));
	};
	httpVueLoader.install=function (app,options){
		if(!window.Vue){
			console.error("httpVueLoader: Vue 3 not found in global scope. Please ensure Vue is loaded before httpVueLoader.");
			return;
		}
		app.mixin({
			beforeCreate:function(){
				const components=this.$options.components;
				if(components){
					for(const componentName in components){
						if(typeof components[componentName]==='string' && components[componentName].startsWith('url:')){
						const url=components[componentName].substring(4);
						const componentURL=('_baseURI' in this.$options) ? resolveURL(this.$options._baseURI,url) : url;
						components[componentName]=window.Vue.defineAsyncComponent(() => httpVueLoader.load(componentURL,componentName));
						}
					}
				}
			}
		});
	};
	httpVueLoader.langProcessor={
		html:function(content){return content;},
		js:function(content){return content;},
		css:function(content){return content;}
	};
	httpVueLoader.scriptExportsHandler=function(exports){return exports;};
	httpVueLoader.httpRequest=httpRequest;
	return httpVueLoader;
});