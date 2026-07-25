/* ===========================================================================
 * 三分天下 · 结构化战报与角色互动视图
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var UI = SGS.UI;
  if (!UI || typeof document === 'undefined') return;

  var TICKER_KINDS = { turn: 1, damage: 1, heal: 1, skill: 1, trick: 1, basic: 1, equip: 1, draw: 1, death: 1, judge: 1, gain: 1, discard: 1, gameover: 1, reward: 1, penalty: 1 };
  var ACTIVITY_MARK = { damage: '伤', heal: '救', skill: '技', trick: '策', basic: '攻', equip: '装', death: '亡', judge: '判', reward: '赏', penalty: '罚' };
  var LOG_MAX_DOM = 500;

  function el(tag, cls, txt) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (txt != null) node.textContent = txt;
    return node;
  }

  UI.onLog = function (entry) {
    UI.recordActivity(entry);
    var log = document.getElementById('log');
    if (log) {
      var row = el('div', 'entry l-' + (entry.kind || 'info'), entry.text);
      row.classList.add('new');
      log.appendChild(row);
      var clearNew = function () { row.classList.remove('new'); };
      if (SGS.Timeline) SGS.Timeline.after('ui', 600, clearNew, clearNew);
      else setTimeout(clearNew, 600);
      while (log.childNodes.length > LOG_MAX_DOM) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }
    if (entry.kind && TICKER_KINDS[entry.kind]) UI.setTicker(entry.text, entry.kind);
  };

  UI.recordActivity = function (entry, deferRender) {
    var mark = ACTIVITY_MARK[entry.kind];
    if (!mark || !UI.game || !entry.text) return;
    var participantIds = entry.participantIds || [];
    var participants = UI.game.players.filter(function (player) {
      return participantIds.indexOf(player.id) >= 0;
    });
    if (!participants.length) return;
    participants.forEach(function (player) {
      var peer = participants.filter(function (candidate) { return candidate !== player; })[0];
      var peerName = peer ? ((peer.general && peer.general.cn) || peer.name) : '';
      var isActor = entry.actorId === player.id;
      var isTarget = (entry.targetIds || []).indexOf(player.id) >= 0;
      var direction = peerName ? (isActor ? '→' : isTarget ? '←' : '·') : '';
      var item = {
        kind: entry.kind,
        mark: mark,
        peer: peerName,
        label: mark + direction + (peerName ? peerName.slice(-2) : ''),
        text: entry.text,
        action: entry.action || null
      };
      var list = UI.activity[player.id] || (UI.activity[player.id] = []);
      list.unshift(item);
      if (list.length > 5) list.length = 5;
    });
    UI.activityVersion++;
    UI._lastOppSig = null;
    UI._lastMeSig = null;
    if (!deferRender) UI.renderAll();
  };

  UI.restoreLog = function (entries) {
    var log = document.getElementById('log');
    if (log) while (log.firstChild) log.removeChild(log.firstChild);
    UI.activity = {};
    UI.activityVersion = 0;
    var recentTicker = null;
    (entries || []).slice(-LOG_MAX_DOM).forEach(function (entry) {
      UI.recordActivity(entry, true);
      if (log) log.appendChild(el('div', 'entry l-' + (entry.kind || 'info'), entry.text));
      if (entry.kind && TICKER_KINDS[entry.kind]) recentTicker = entry;
    });
    if (log) log.scrollTop = log.scrollHeight;
    UI._lastOppSig = null;
    UI._lastMeSig = null;
    UI.renderAll();
    if (recentTicker) UI.setTicker(recentTicker.text, recentTicker.kind);
  };

  UI.activityEl = function (player, className) {
    var list = (UI.activity && UI.activity[player.id]) || [];
    var wrap = el('div', className || 'event-feed');
    wrap.setAttribute('aria-label', list.length ? '最近互动：' + list.map(function (item) { return item.text; }).join('；') : '暂无互动事件');
    if (!list.length) { wrap.classList.add('empty'); wrap.textContent = '暂无互动'; return wrap; }
    list.forEach(function (item) {
      var chip = el('span', 'event-chip k-' + item.kind, item.label || (item.mark + (item.peer ? '·' + item.peer.slice(-2) : '')));
      chip.title = item.text;
      wrap.appendChild(chip);
    });
    return wrap;
  };

  UI.setTicker = function (text, kind) {
    var ticker = document.getElementById('ticker'); if (!ticker) return;
    var label = { damage: '伤害', heal: '救援', skill: '技能', trick: '计策', basic: '出牌', equip: '装备', death: '阵亡', judge: '判定', turn: '回合' }[kind];
    ticker.textContent = (label ? label + '｜' : '') + text;
    ticker.className = 'k-' + (kind || 'info');
    ticker.classList.remove('pulse'); void ticker.offsetWidth; ticker.classList.add('pulse');
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
