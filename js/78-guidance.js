/* ===========================================================================
 * 三分天下 · 操作引导与目标可选性解释
 *
 * 规则解释保持为无 DOM 的纯函数，供浏览器界面和单元测试共同使用；
 * UI 只负责显示步骤、当前选择和不可选原因。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var Guide = SGS.TargetGuide = {};

  function hasJudge(player, name) {
    return (player.judgeZone || []).some(function (card) { return card.name === name; });
  }

  Guide.reason = function (game, source, target, option) {
    if (!target || !target.alive) return '已阵亡';
    if (!option) return '当前不能选择';
    if ((option.candidates || []).indexOf(target) >= 0) {
      var distance = source !== target ? game.distance(source, target) : 0;
      return distance ? '可选 · 距离 ' + distance : '可选';
    }
    if (target === source) return '不能以自己为目标';

    var name = option.name || (option.card && option.card.name) || '';
    if (name === 'sha') {
      if (!game.inAttackRange(source, target)) {
        return '距离 ' + game.distance(source, target) + ' ＞ 范围 ' + game.attackRange(source);
      }
      if (SGS.canTarget && !SGS.canTarget(game, source, target, 'sha')) return '受武将技能保护';
    }
    if (name === 'guohechaiqiao' && target.allCards && target.allCards().length === 0) return '没有可弃置的牌';
    if (name === 'shunshouqianyang') {
      if (target.hand.length + target.equipCount() === 0) return '没有可获得的牌';
      if (SGS.trickDistanceOk && !SGS.trickDistanceOk(game, source, target)) return '距离超过 1';
      if (SGS.canTarget && !SGS.canTarget(game, source, target, name)) return '受武将技能保护';
    }
    if (name === 'huogong' && target.hand.length === 0) return '没有手牌可展示';
    if (name === 'lebusishu' && hasJudge(target, name)) return '判定区已有乐不思蜀';
    if (name === 'bingliangcunduan') {
      if (hasJudge(target, name)) return '判定区已有兵粮寸断';
      if (SGS.trickDistanceOk && !SGS.trickDistanceOk(game, source, target)) return '距离超过 1';
    }
    if ((name === 'juedou' || name === 'lebusishu' || name === 'bingliangcunduan') &&
        SGS.canTarget && !SGS.canTarget(game, source, target, name)) return '受武将技能保护';
    if (name === 'jiedaosharen') {
      if (!target.equips.weapon) return '没有装备武器';
      return '攻击范围内没有合法目标';
    }
    if (option.kind === 'skill') return '不符合该技能的发动条件';
    return '不是这张牌的合法目标';
  };

  if (typeof document === 'undefined' || !SGS.UI) return;
  var UI = SGS.UI;
  var $ = function (id) { return document.getElementById(id); };
  var ORDER = ['card', 'target', 'confirm'];

  UI.beginGuidance = function (active, option) {
    UI.guide = { active: active || 'card', option: option || null };
    UI.refreshGuidance();
  };

  UI.setGuideStep = function (active, option) {
    if (!UI.guide) UI.guide = {};
    UI.guide.active = active;
    if (option !== undefined) UI.guide.option = option;
    UI.refreshGuidance();
  };

  UI.clearGuidance = function () {
    UI.guide = null;
    UI.targetFeedback = null;
    var guide = $('interactionGuide');
    var summary = $('selectionSummary');
    if (guide) guide.classList.add('hidden');
    if (summary) summary.textContent = '';
  };

  UI.setTargetFeedback = function (option) {
    UI.targetFeedback = {};
    if (!UI.game || !UI.me || !option) return;
    UI.game.players.forEach(function (player) {
      if (player !== UI.me) UI.targetFeedback[player.id] = Guide.reason(UI.game, UI.me, player, option);
    });
  };

  UI.refreshGuidance = function () {
    var guide = $('interactionGuide');
    var summary = $('selectionSummary');
    if (!guide || !summary || !UI.guide) {
      if (guide) guide.classList.add('hidden');
      if (summary) summary.textContent = '';
      return;
    }
    guide.classList.remove('hidden');
    var activeIndex = ORDER.indexOf(UI.guide.active);
    Array.prototype.forEach.call(guide.querySelectorAll('[data-guide-step]'), function (step) {
      var index = ORDER.indexOf(step.getAttribute('data-guide-step'));
      step.classList.toggle('active', index === activeIndex);
      step.classList.toggle('done', index < activeIndex);
    });

    var cards = (UI.selectedCards || []).map(function (id) {
      var card = UI.findCard && UI.findCard(id);
      return card && card.cn;
    }).filter(Boolean);
    var players = (UI.selectedPlayers || []).map(function (player) {
      return (player.general && player.general.cn) || player.name;
    });
    var parts = [];
    if (cards.length) parts.push('已选：' + cards.join('、'));
    if (players.length) parts.push('目标：' + players.join('、'));
    if (!parts.length) {
      parts.push(UI.guide.active === 'card' ? '先选择带“可用”标记的牌或技能' :
        UI.guide.active === 'target' ? '绿色角色可选；其他角色会显示不可选原因' : '检查选择后确认');
    }
    summary.textContent = parts.join('　');
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
