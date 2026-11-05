const e={cw:e=>{var r;return()=>{if(e){var t=e;e=0,r={exports:{}},t.call(r.exports,r,r.exports)}return r.exports}},d:(r,t)=>{for(var o in t)e.o(t,o)&&!e.o(r,o)&&Object.defineProperty(r,o,{enumerable:!0,get:t[o]})},o:(e,r)=>Object.prototype.hasOwnProperty.call(e,r)};var r=e.cw(function(e,r){
/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var t=Symbol.for("react.transitional.element"),o=Symbol.for("react.fragment");function n(e,r,o){var n=null;if(void 0!==o&&(n=""+o),void 0!==r.key&&(n=""+r.key),"key"in r)for(var s in o={},r)"key"!==s&&(o[s]=r[s]);else o=r;return r=o.ref,{$$typeof:t,type:e,key:n,ref:void 0!==r?r:null,props:o}}r.Fragment=o,r.jsx=n,r.jsxs=n});e.cw(function(e,t){e.exports=r()})();export const Fragment=r().Fragment;export const jsx=r().jsx;export const jsxs=r().jsxs;