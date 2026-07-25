/* ===========================================================================
 * 三分天下 · DOM 视觉效果
 *
 * 仅负责短暂视觉节点；所有生命周期交给统一 Timeline，重开或跳过演出时
 * 不会遗留悬空节点和孤立计时器。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var UI = SGS.UI;
  if (!UI || typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, txt) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (txt != null) node.textContent = txt;
    return node;
  }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function after(ms, callback, onCancel) {
    return SGS.Timeline ? SGS.Timeline.after('ui-effects', ms, callback, onCancel) : setTimeout(callback, ms);
  }
  function removeLater(node, ms) {
    after(ms, function () { node.remove(); }, function () { node.remove(); });
  }

  UI.clearPlayArea = function () { clear($('playArea')); };

  UI.flash = function (player, className) {
    var node = UI.playerEl(player); if (!node) return;
    node.classList.remove(className); void node.offsetWidth; node.classList.add(className);
    after(520, function () { node.classList.remove(className); }, function () { node.classList.remove(className); });
  };

  UI.floatText = function (player, text, className) {
    var node = UI.playerEl(player); if (!node) return;
    var rect = node.getBoundingClientRect();
    var float = el('div', 'float ' + className, text);
    float.style.left = (rect.left + rect.width / 2 - 10) + 'px';
    float.style.top = (rect.top + 10) + 'px';
    document.body.appendChild(float);
    removeLater(float, 1000);
  };

  UI.ringTarget = function (player) {
    var node = UI.playerEl(player); if (!node) return;
    var ring = el('div', 'target-ring');
    node.appendChild(ring);
    removeLater(ring, 1200);
  };

  UI.connect = function (fromNode, toNode, className) {
    if (!fromNode || !toNode) return;
    var from = fromNode.getBoundingClientRect(), to = toNode.getBoundingClientRect();
    var x1 = from.left + from.width / 2, y1 = from.top + from.height / 2;
    var x2 = to.left + to.width / 2, y2 = to.top + to.height / 2;
    var line = el('div', 'fx-line ' + (className || ''));
    line.style.left = x1 + 'px';
    line.style.top = y1 + 'px';
    line.style.width = Math.hypot(x2 - x1, y2 - y1) + 'px';
    line.style.transform = 'rotate(' + (Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 'deg)';
    document.body.appendChild(line);
    after(260, function () { line.classList.add('fade'); });
    removeLater(line, 700);
  };

  UI.spark = function (player) {
    var node = UI.playerEl(player); if (!node) return;
    var rect = node.getBoundingClientRect();
    var spark = el('div', 'fx-spark');
    spark.style.left = (rect.left + rect.width / 2 - 24) + 'px';
    spark.style.top = (rect.top + rect.height / 2 - 24) + 'px';
    document.body.appendChild(spark);
    removeLater(spark, 500);
  };

  UI.vignette = function (color) {
    var node = el('div', 'fx-vignette');
    node.style.boxShadow = 'inset 0 0 200px 60px ' + (color || '#c0392b');
    document.body.appendChild(node);
    after(40, function () { node.classList.add('fade'); });
    removeLater(node, 900);
  };

  UI.shake = function (player) {
    var node = UI.playerEl(player); if (!node) return;
    node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake');
    after(450, function () { node.classList.remove('shake'); }, function () { node.classList.remove('shake'); });
  };

  UI.rectOf = function (player) {
    var node = player === UI.me ? $('me') : UI.playerEl(player);
    return node ? node.getBoundingClientRect() : null;
  };

  UI.showPlayed = function (card) {
    var area = $('playArea'); if (!area || !card) return;
    var node = UI.cardEl(card, { noDetail: true });
    if (!card.virtual) {
      node.style.cursor = 'pointer';
      node.onclick = function () { UI.cardDetail(card); };
    }
    clear(area);
    area.appendChild(node);
  };

  UI.animateJudge = function (player, card) {
    if (!card) return;
    var fx = $('judgeFx');
    if (!fx) { fx = el('div'); fx.id = 'judgeFx'; document.body.appendChild(fx); }
    clear(fx);
    var node = UI.cardEl(card, { noDetail: true });
    node.classList.add('jc');
    fx.appendChild(node);
    after(1100, function () { clear(fx); }, function () { clear(fx); });
  };

  UI.banner = function (text, color) {
    var node = $('banner'); if (!node) return;
    node.textContent = text;
    node.style.color = color || '#d9b45b';
    node.classList.remove('hidden', 'show'); void node.offsetWidth; node.classList.add('show');
    after(1150, function () { node.classList.add('hidden'); }, function () { node.classList.add('hidden'); });
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
