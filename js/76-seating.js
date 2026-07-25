/* ===========================================================================
 * 三分天下 · 牌桌座次布局
 *
 * 对手始终保持顺时针座次的单行信息带。桌面端完整展示，窄屏由容器负责
 * 横向滚动；布局模块只组织语义顺序，不计算像素位置。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return;

  var Table = SGS.Table = {};

  Table.arrangeOpponents = function (container, players) {
    container.innerHTML = '';
    if (!players.length) return;

    var row = document.createElement('div');
    row.className = 'opp-row';
    players.slice().sort(function (a, b) { return a.seat - b.seat; }).forEach(function (player) {
      row.appendChild(SGS.UI.playerPanel(player));
    });
    container.appendChild(row);
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
