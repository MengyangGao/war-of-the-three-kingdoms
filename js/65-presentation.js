/* ===========================================================================
 * 三分天下 · 展示层视图签名
 *
 * 将规则对象投影为稳定、可比较的字符串。UI 用它判断局部组件是否需要
 * 重绘；本模块不访问 DOM，也不修改任何游戏状态。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var P = SGS.Presentation = {};

  function ids(cards) {
    return (cards || []).map(function (card) { return card && card.id; }).join(',');
  }

  function playerState(player) {
    return [
      player.id, player.alive, player.hp, player.maxHp, player.hand.length, player.role,
      player.equips.weapon && player.equips.weapon.id,
      player.equips.armor && player.equips.armor.id,
      player.equips.offhorse && player.equips.offhorse.id,
      player.equips.defhorse && player.equips.defhorse.id,
      ids(player.judgeZone), player.general && player.general.key,
      player.chained, player.faceUp, player.roleRevealed
    ].join(':');
  }

  P.opponentsSignature = function (game, players, selectable, selected) {
    return players.map(playerState).join('|') +
      '|current=' + (game.current && game.current.id) + ':' + game.phase +
      '|selectable=' + (selectable || []).map(function (player) { return player.id; }).join(',') +
      '|selected=' + (selected || []).map(function (player) { return player.id; }).join(',');
  };

  P.selfSignature = function (game, player, selectableCardIds, selectedCardIds) {
    return [
      ids(player.hand), ids((selectedCardIds || []).map(function (id) { return { id: id }; })),
      ids((selectableCardIds || []).map(function (id) { return { id: id }; })),
      player.equips.weapon && player.equips.weapon.id,
      player.equips.armor && player.equips.armor.id,
      player.equips.offhorse && player.equips.offhorse.id,
      player.equips.defhorse && player.equips.defhorse.id,
      ids(player.judgeZone), player.hp, player.maxHp, player.role, player.alive,
      player.chained, player.faceUp, game.current && game.current.id, game.phase
    ].join('|');
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
