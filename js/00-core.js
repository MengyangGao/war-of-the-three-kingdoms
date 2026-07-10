/* ==========================================================================
 * 三国杀 · 离线版  —  core namespace, constants, utilities
 * Works in the browser (classic <script>) and under Node (via test harness).
 * Everything hangs off the global `SGS` namespace object.
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};

  /* ---------- Constants ---------- */
  SGS.SUITS = {
    spade:   { key: 'spade',   cn: '黑桃', color: 'black', symbol: '♠' },
    heart:   { key: 'heart',   cn: '红桃', color: 'red',   symbol: '♥' },
    club:    { key: 'club',    cn: '梅花', color: 'black', symbol: '♣' },
    diamond: { key: 'diamond', cn: '方块', color: 'red',   symbol: '♦' }
  };

  // rank 1..13 (1=A, 11=J, 12=Q, 13=K)
  SGS.rankName = function (r) {
    return ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
  };

  SGS.NATIONS = {
    wei:   { key: 'wei',   cn: '魏', color: '#3a6ea5' },
    shu:   { key: 'shu',   cn: '蜀', color: '#b5432f' },
    wu:    { key: 'wu',    cn: '吴', color: '#2e8b57' },
    qun:   { key: 'qun',   cn: '群', color: '#6b6b6b' },
    god:   { key: 'god',   cn: '神', color: '#c8a13a' }
  };

  SGS.ROLES = {
    lord:     { key: 'lord',     cn: '主公' },
    loyalist: { key: 'loyalist', cn: '忠臣' },
    rebel:    { key: 'rebel',    cn: '反贼' },
    traitor:  { key: 'traitor',  cn: '内奸' }
  };

  SGS.PHASES = ['start', 'judge', 'draw', 'play', 'discard', 'end'];
  SGS.PHASE_CN = {
    start: '准备阶段', judge: '判定阶段', draw: '摸牌阶段',
    play: '出牌阶段', discard: '弃牌阶段', end: '结束阶段'
  };

  /* ---------- Seedable RNG (mulberry32) ---------- */
  SGS.RNG = function (seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    var fn = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.int = function (n) { return Math.floor(fn() * n); };       // 0..n-1
    fn.pick = function (arr) { return arr[fn.int(arr.length)]; };
    fn.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = fn.int(i + 1);
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    return fn;
  };

  /* ---------- Small utilities ---------- */
  var U = SGS.util = {};
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.remove = function (arr, item) {
    var i = arr.indexOf(item);
    if (i >= 0) { arr.splice(i, 1); return true; }
    return false;
  };
  U.sum = function (arr, f) {
    var t = 0; for (var i = 0; i < arr.length; i++) t += f ? f(arr[i]) : arr[i];
    return t;
  };
  U.count = function (arr, f) {
    var t = 0; for (var i = 0; i < arr.length; i++) if (f(arr[i])) t++;
    return t;
  };
  U.range = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; };
  U.last = function (arr) { return arr[arr.length - 1]; };
  U.delay = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
  // stable id generator
  var _id = 0;
  U.uid = function (p) { return (p || 'x') + (++_id); };

  /* environment flag */
  SGS.isBrowser = (typeof window !== 'undefined' && typeof document !== 'undefined');

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
