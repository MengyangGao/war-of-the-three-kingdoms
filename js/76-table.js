/* ==========================================================================
 * 三国杀 · 牌桌布局 (Table Layout)
 *   - 计算对手座位位置并分配到桌面网格
 *   - 提供玩家面板、中央区域、手牌区的布局辅助
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return;

  var Table = SGS.Table = {
    // layout presets for opponent count
    layouts: {
      // rows: [top count, middle count, bottom count], center gap reserved
      2: { rows: [1, 0, 1] },
      3: { rows: [2, 0, 1] },
      4: { rows: [2, 0, 2] },
      5: { rows: [2, 1, 2] },
      6: { rows: [2, 2, 2] },
      7: { rows: [3, 2, 2] },
      8: { rows: [3, 2, 3] }
    }
  };

  Table.arrangeOpponents = function (container, players, current) {
    container.innerHTML = '';
    var n = players.length;
    if (n === 0) return;
    // sort clockwise starting after me (seat 0)
    var sorted = players.slice().sort(function (a, b) { return a.seat - b.seat; });
    // use a simple row-based layout
    var cfg = Table.layouts[n] || Table.layouts[8];
    var rows = cfg.rows;
    var idx = 0;
    for (var r = 0; r < rows.length; r++) {
      var count = rows[r];
      if (count === 0) continue;
      var row = document.createElement('div');
      row.className = 'opp-row opp-row-' + r;
      for (var i = 0; i < count && idx < sorted.length; i++, idx++) {
        row.appendChild(SGS.UI.playerPanel(sorted[idx]));
      }
      container.appendChild(row);
    }
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
