/* ===========================================================================
 * 三分天下 · 选择与响应面板
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var UI = SGS.UI;
  if (!UI || typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, txt) { var node = document.createElement(tag); if (cls) node.className = cls; if (txt != null) node.textContent = txt; return node; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  UI.optionAsButtonsAndCards = function (req, onPick, cancelLabel) {
    var options = req.options || [], byCard = {}, specials = [];
    options.forEach(function (option) {
      if (option.card && !option.card.virtual && UI.findCard(option.card.id)) byCard[option.card.id] = option;
      else specials.push(option);
    });
    UI.selectableCards = Object.keys(byCard);
    UI.cur.cardClick = function (card) { if (byCard[card.id]) onPick(byCard[card.id]); };
    var actions = $('actions'); clear(actions);
    specials.forEach(function (option) {
      UI.actionBtn(option.label || (option.card ? option.card.cn : '选项'), '', function () { onPick(option); });
    });
    UI.actionBtn(cancelLabel || '放弃', '', function () { UI.finish(null); });
    UI.renderAll();
  };

  UI.uiRespond = function (req) {
    UI.setHint(req.reason || '请响应');
    UI.optionAsButtonsAndCards(req, function (option) { UI.finish({ option: option }); }, '放弃');
  };
  UI.uiWuxie = function (req) {
    UI.setHint(req.reason || '是否使用无懈可击？');
    UI.optionAsButtonsAndCards(req, function (option) { UI.finish({ option: option }); }, '放弃');
  };
  UI.uiRescue = function (req) {
    var dying = req.dying;
    var need = req.canWine && dying === UI.me ? 'peachOrWine' : 'tao';
    var options = req.options || SGS.gatherResponses(UI.game, UI.me, need, {});
    req.options = options;
    UI.setHint(req.reason || (dying.name + ' 濒死，是否出桃？'));
    UI.optionAsButtonsAndCards(req, function (option) {
      UI.finish({ option: option, card: option.card });
    }, '放弃');
  };

  UI.uiDiscard = function (req) {
    var count = req.count;
    UI.setHint('弃牌阶段：请弃置 ' + count + ' 张手牌');
    UI.selectableCards = UI.me.hand.map(function (card) { return card.id; });
    UI.cur.cardMode = 'multi'; UI.cur.maxC = count;
    function update() {
      var actions = $('actions'); clear(actions);
      UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedCards.length === count) UI.finish({ cards: UI.selectedCards.map(UI.findCard) });
      }, UI.selectedCards.length !== count);
    }
    UI.cur.cardClick = function (card) {
      var index = UI.selectedCards.indexOf(card.id);
      if (index >= 0) UI.selectedCards.splice(index, 1);
      else { if (UI.selectedCards.length >= count) UI.selectedCards.shift(); UI.selectedCards.push(card.id); }
      update(); UI.renderAll();
    };
    update(); UI.renderAll();
  };

  UI.uiChooseCards = function (req) {
    var from = req.from || [], min = req.min || 0, max = req.max || from.length;
    if (!from.length) { UI.finish({ cards: [] }); return; }
    UI.setHint((req.reason || '选择牌') + '（' + min + '~' + max + '）');
    var ids = from.map(function (card) { return card.id; });
    function find(id) { for (var i = 0; i < from.length; i++) if (from[i].id === id) return from[i]; return null; }
    function update() {
      var actions = $('actions'); clear(actions);
      UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedCards.length >= min && UI.selectedCards.length <= max) UI.finish({ cards: UI.selectedCards.map(find) });
      }, UI.selectedCards.length < min);
    }
    UI.selectableCards = ids; UI.cur.cardMode = 'multi'; UI.cur.maxC = max;
    UI.cur.cardClick = function (card) {
      if (ids.indexOf(card.id) < 0) return;
      var index = UI.selectedCards.indexOf(card.id);
      if (index >= 0) UI.selectedCards.splice(index, 1);
      else { if (UI.selectedCards.length >= max) UI.selectedCards.shift(); UI.selectedCards.push(card.id); }
      update(); UI.renderAll();
    };
    update(); UI.renderAll();
  };

  UI.uiChooseZoneCard = function (req) {
    UI.setHint(req.reason || ('选择 ' + req.target.name + ' 的一张牌'));
    var actions = $('actions'); clear(actions);
    (req.options || []).forEach(function (option) {
      UI.actionBtn(option.label, '', function () { UI.finish({ option: option }); });
    });
    UI.renderAll();
  };

  UI.uiChoosePlayers = function (req) {
    var min = req.min || 1, max = req.max || 1;
    UI.setHint((req.reason || '选择角色') + '（' + min + '~' + max + '）');
    UI.selectablePlayers = (req.candidates || []).slice();
    UI.cur.playerMode = max === 1 ? 'single' : 'multi'; UI.cur.maxP = max;
    var render = function () {
      var actions = $('actions'); clear(actions);
      UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedPlayers.length >= min) UI.finish({ players: UI.selectedPlayers.slice() });
      }, UI.selectedPlayers.length < min);
    };
    UI.cur.onSelectChange = render; render(); UI.renderAll();
  };

  UI.uiChooseOption = function (req) {
    UI.setHint(req.reason || '请选择');
    var actions = $('actions'); clear(actions);
    (req.choices || []).forEach(function (choice) {
      UI.actionBtn(choice.label, '', function () { UI.finish({ key: choice.key }); });
    });
    UI.renderAll();
  };

  UI.uiConfirm = function (req) {
    UI.setHint(req.reason || '确认？');
    var actions = $('actions'); clear(actions);
    UI.actionBtn('是', 'primary', function () { UI.finish({ yes: true }); });
    UI.actionBtn('否', '', function () { UI.finish({ yes: false }); });
    UI.renderAll();
  };

  UI.uiGuanxing = function (req) {
    UI.setHint('');
    var cards = req.cards || [], bottom = {};
    UI.openModal(function (box) {
      UI.modalMandatory = true;
      box.querySelector('.close-x').style.display = 'none';
      box.appendChild(el('h2', null, '观星'));
      box.appendChild(el('div', 'gx-hint', '牌堆顶 ' + cards.length + ' 张（左＝先摸）。点击卡牌切换「留顶／置底」，然后确定。'));
      var row = el('div', 'gx-row');
      cards.forEach(function (card) {
        var wrap = el('div', 'gx-card'), label = el('div', 'gx-label top', '留顶');
        wrap.appendChild(UI.cardEl(card, { noDetail: true })); wrap.appendChild(label);
        wrap.onclick = function () {
          bottom[card.id] = !bottom[card.id];
          wrap.classList.toggle('to-bottom', bottom[card.id]);
          label.textContent = bottom[card.id] ? '置底' : '留顶';
          label.className = 'gx-label ' + (bottom[card.id] ? 'bot' : 'top');
        };
        row.appendChild(wrap);
      });
      box.appendChild(row);
      var bar = el('div', 'set-row'), confirm = el('button', 'btn-primary', '确定');
      confirm.onclick = function () {
        var topIds = [], bottomIds = [];
        cards.forEach(function (card) { (bottom[card.id] ? bottomIds : topIds).push(card.id); });
        UI.closeModalForce();
        UI.finish({ topIds: topIds, bottomIds: bottomIds });
      };
      bar.appendChild(confirm); box.appendChild(bar);
    });
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
