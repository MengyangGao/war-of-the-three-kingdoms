/* ==========================================================================
 * 三国杀 · 交互状态机 (Interaction State Machine)
 *   - 解决 UI.clickCard/UI.clickPlayer 被反复覆盖导致的"无法出杀"问题
 *   - UI.clickCard / UI.clickPlayer 只做分发，永不重新赋值
 *   - 当前实现为"idle / interactive"两层：interactive 状态把事件交给 UI.cur
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return;

  var State = SGS.InteractionState = {
    state: 'idle',
    payload: null,
    handlers: {}
  };

  State.register = function (name, handlers) {
    State.handlers[name] = handlers;
  };

  State.enter = function (name, payload) {
    var prev = State.state;
    var h = State.handlers[prev];
    if (h && h.onExit) h.onExit(State.payload);
    State.state = name;
    State.payload = payload || null;
    var nh = State.handlers[name];
    if (nh && nh.onEnter) nh.onEnter(payload);
  };

  State.cardClick = function (card) {
    var h = State.handlers[State.state];
    if (h && h.cardClick) h.cardClick(card, State.payload);
  };

  State.playerClick = function (p) {
    var h = State.handlers[State.state];
    if (h && h.playerClick) h.playerClick(p, State.payload);
  };

  State.cancel = function () {
    var h = State.handlers[State.state];
    if (h && h.cancel) h.cancel(State.payload);
  };

  State.confirm = function () {
    var h = State.handlers[State.state];
    if (h && h.confirm) h.confirm(State.payload);
  };

  State.is = function (name) { return State.state === name; };

  // register default states
  State.register('idle', {
    onEnter: function () {
      var UI = SGS.UI; if (!UI) return;
      UI.selectableCards = []; UI.selectedCards = [];
      UI.selectablePlayers = []; UI.selectedPlayers = [];
    }
  });

  State.register('interactive', {
    cardClick: function (card) {
      var UI = SGS.UI; if (!UI || !UI.cur) return;
      if (UI.cur.cardClick) { UI.cur.cardClick(card); return; }
      if (UI.cur.cardMode === 'single') UI.selectedCards = [card.id];
      else {
        var idx = UI.selectedCards.indexOf(card.id);
        if (idx >= 0) UI.selectedCards.splice(idx, 1);
        else {
          if (UI.selectedCards.length >= (UI.cur.maxC || 99)) {
            if (UI.cur.maxC === 1) UI.selectedCards = [card.id];
          } else UI.selectedCards.push(card.id);
        }
      }
      if (UI.cur.onSelectChange) UI.cur.onSelectChange();
      UI.renderAll();
    },
    playerClick: function (p) {
      var UI = SGS.UI; if (!UI || !UI.cur) return;
      if (UI.cur.playerMode === 'single') UI.selectedPlayers = [p];
      else {
        var idx = UI.selectedPlayers.indexOf(p);
        if (idx >= 0) UI.selectedPlayers.splice(idx, 1);
        else {
          if (UI.selectedPlayers.length >= (UI.cur.maxP || 1)) UI.selectedPlayers.shift();
          UI.selectedPlayers.push(p);
        }
      }
      if (UI.cur.onSelectChange) UI.cur.onSelectChange();
      UI.renderAll();
    },
    cancel: function () {
      var UI = SGS.UI; if (!UI || !UI.cur) return;
      // default cancel does nothing; sub-handlers usually override UI.cur.cancel
      if (UI.cur.cancel) UI.cur.cancel();
    },
    confirm: function () {
      var UI = SGS.UI; if (!UI || !UI.cur) return;
      if (UI.cur.confirm) UI.cur.confirm();
    }
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
