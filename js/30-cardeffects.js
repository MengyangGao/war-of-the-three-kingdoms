/* ==========================================================================
 * 三分天下 · 卡牌效果与出牌合法性
 *   - SGS.playOptions(game, player)         -> legal actions this play phase
 *   - SGS.executePlayAction(game, player, action)
 *   - SGS.doSha / trick resolvers / delayed-trick resolution
 *   - response gathering (闪/杀/桃...) incl. equipment (八卦) & view-as skills
 *   - nullification (无懈可击) chain
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var U = SGS.util;

  /* ============================================================
   * Response gathering — what can `player` produce to satisfy a `need`.
   * need: 'shan' | 'sha' | 'tao' | 'jiu' | 'wuxie'
   * Returns array of options: { card, label, special }
   * ============================================================ */
  SGS.gatherResponses = function (game, player, need, ctx) {
    ctx = ctx || {};
    var opts = [];
    // real hand cards that match
    for (var i = 0; i < player.hand.length; i++) {
      var c = player.hand[i];
      if (matchesNeed(c, need)) opts.push({ card: c, label: SGS.cardLabel(c) });
    }
    // view-as from skills
    for (var s = 0; s < player.skills.length; s++) {
      var sk = player.skills[s];
      if (sk.viewAsRespond) {
        var extra = sk.viewAsRespond(game, player, need, ctx) || [];
        for (var e = 0; e < extra.length; e++) opts.push(extra[e]);
      }
    }
    // equipment: 八卦阵 provides 闪 via judgment
    if (need === 'shan' && player.equips.armor && player.equips.armor.name === 'bagua' && !ctx.noBagua) {
      opts.push({ special: 'bagua', label: '八卦阵判定' });
    }
    // 丈八蛇矛: two hand cards as 杀 (also usable as a 杀 response)
    if (need === 'sha' && player.equips.weapon && player.equips.weapon.name === 'zhangbashemao' && player.hand.length >= 2) {
      opts.push({ special: 'zhangba', label: '丈八蛇矛（两张牌当杀）' });
    }
    // 护驾 (曹操 主公技): 魏 allies may play 闪 for the lord
    if (need === 'shan' && player.hasSkill('hujia') && !ctx.noHujia) {
      var weiAllies = game.alivePlayers().filter(function (p) { return p !== player && p.nation === 'wei'; });
      if (weiAllies.length) opts.push({ special: 'hujia', label: '护驾（魏势力替你打出闪）' });
    }
    // 激将 (刘备 主公技): 蜀 allies may play 杀 for the lord
    if (need === 'sha' && player.hasSkill('jijiang') && !ctx.noJijiang) {
      var shuAllies = game.alivePlayers().filter(function (p) { return p !== player && p.nation === 'shu'; });
      if (shuAllies.length) opts.push({ special: 'jijiang', label: '激将（蜀势力替你打出杀）' });
    }
    return opts;
  };

  function matchesNeed(card, need) {
    if (card.type === 'equip' || (card.type === 'trick')) {
      // equipment / trick cards cannot be used as basic responses (except view-as handled elsewhere)
      if (need === 'wuxie') return card.name === 'wuxiekeji';
      return false;
    }
    if (need === 'shan') return card.name === 'shan';
    if (need === 'sha') return card.name === 'sha';
    if (need === 'tao') return card.name === 'tao';
    if (need === 'jiu') return card.name === 'jiu';
    if (need === 'peachOrWine') return card.name === 'tao' || card.name === 'jiu';
    if (need === 'wuxie') return card.name === 'wuxiekeji';
    return false;
  }

  /* ask a player to provide a response card of `need`; handles 八卦/丈八 specials */
  SGS.askResponse = async function (game, player, req) {
    var tried = {};
    while (player.alive) {
      var options = SGS.gatherResponses(game, player, req.need, { noBagua: tried.bagua, noHujia: tried.hujia, noJijiang: tried.jijiang }).filter(function (o) {
        if (o.special === 'zhangba' && tried.zhangba) return false;
        return true;
      });
      if (options.length === 0) return null;
      var res = await game.ask(player, {
        type: 'respond', need: req.need, reason: req.reason,
        options: options, source: req.source, trigger: req.trigger, forCard: req.forCard
      });
      if (!res || !res.option) return null;
      var opt = res.option;

      if (opt.special === 'bagua') {
        tried.bagua = true;
        var jc = await game.judge(player, { reason: '八卦阵' });
        if (jc && SGS.isRed(jc.suit)) {
          game.msg(player.name + ' 八卦阵判定 ' + SGS.cardLabel(jc) + '，红色，视为“闪”。', { kind: 'skill' });
          return { special: 'bagua', virtual: true };
        }
        game.msg(player.name + ' 八卦阵判定 ' + (jc ? SGS.cardLabel(jc) : '') + '，失败。', { kind: 'skill' });
        continue;
      }
      if (opt.special === 'zhangba') {
        tried.zhangba = true;
        var picks = await game.ask(player, {
          type: 'chooseCards', from: player.hand.slice(), min: 2, max: 2,
          reason: '选择两张手牌当作“杀”'
        });
        var cs = picks && picks.cards;
        if (!cs || cs.length < 2) { continue; }
        var v = SGS.virtualCard('sha', { subcards: cs.slice(0, 2), cn: '杀', suit: 'none' });
        await game.toDiscard(cs.slice(0, 2), { who: player, log: false });
        game.msg(player.name + ' 用丈八蛇矛将两张牌当“杀”。', { kind: 'skill' });
        return { card: v, consumed: true };
      }
      if (opt.special === 'hujia' || opt.special === 'jijiang') {
        tried[opt.special] = true;
        var nation = opt.special === 'hujia' ? 'wei' : 'shu';
        var need2 = opt.special === 'hujia' ? 'shan' : 'sha';
        var allies = game.orderFrom(player, false).filter(function (p) { return p.nation === nation; });
        var helped = false;
        for (var ai2 = 0; ai2 < allies.length; ai2++) {
          var ally = allies[ai2];
          var ar = await SGS.askResponse(game, ally, {
            need: need2, source: req.source,
            reason: (opt.special === 'hujia' ? '护驾' : '激将') + '：是否替 ' + player.name + ' 打出' + (need2 === 'shan' ? '“闪”' : '“杀”') + '？'
          });
          if (ar) {
            await SGS.consumeResponse(game, ally, ar);
            game.msg(ally.name + ' 响应' + (opt.special === 'hujia' ? '护驾' : '激将') + '，替 ' + player.name + ' 打出' + (need2 === 'shan' ? '“闪”' : '“杀”'), { kind: 'skill' });
            helped = true; break;
          }
        }
        if (helped) return { special: opt.special };
        continue;
      }
      // a real/view-as card
      var card = opt.card;
      if (req.need === 'sha') player.flags.shaThisTurn = true; // for 克己
      if (opt.consumeSelf === false) { return { card: card }; }
      return { card: card };
    }
    return null;
  };

  /* consume a response option's card into discard (for real/view-as cards) */
  SGS.consumeResponse = async function (game, player, resp) {
    if (!resp) return;
    if (resp.consumed) return;               // already handled (e.g. zhangba)
    if (resp.special) return;                // bagua etc: nothing to discard
    if (resp.card) {
      // virtual view-as cards: subcards go to discard; skill effect already logged
      await game.toDiscard([resp.card], { who: player, log: false });
    }
  };

  /* ============================================================
   * Nullification (无懈可击) chain — parity aware.
   * Returns true if the underlying effect is ultimately negated.
   * ============================================================ */
  var HARMFUL_TRICKS = {
    shunshouqianyang: 1, guohechaiqiao: 1, juedou: 1, nanmanruqin: 1, wanjianqifa: 1,
    huogong: 1, lebusishu: 1, bingliangcunduan: 1, shandian: 1, tiesuolianhuan: 1, jiedaosharen: 1
  };
  SGS.isHarmfulTrick = function (name) { return !!HARMFUL_TRICKS[name]; };

  SGS.askForWuxie = async function (game, ctx) {
    var order = game.orderFrom(game.current || game.players[0], true);
    var label = ctx.count === 0 ? ((ctx.card.cn || ctx.card.name) + (ctx.target ? ('→' + ctx.target.name) : ''))
      : ('无懈可击(' + ctx.count + ')');
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if (!p.alive) continue;
      var options = SGS.gatherResponses(game, p, 'wuxie', {});
      if (options.length === 0) continue;
      var res = await game.ask(p, {
        type: 'wuxie', reason: '是否对【' + label + '】使用无懈可击？',
        about: label, aboutTarget: ctx.target, card: ctx.card,
        harmful: ctx.harmful, count: ctx.count, options: options
      });
      if (res && res.option && res.option.card) {
        await game.toDiscard([res.option.card], { who: p, log: false });
        game.msg(p.name + ' 使用无懈可击（' + label + '）', { kind: 'trick', player: p.id });
        if (game.uiHook) await game.uiHook('wuxie', { player: p, about: label });
        return p;
      }
    }
    return null;
  };

  // returns true if `card`'s effect on `target` is negated
  SGS.resolveNullification = async function (game, card, target) {
    var harmful = SGS.isHarmfulTrick(card.name);
    var count = 0, guard = 0;
    while (guard++ < 40) {
      var who = await SGS.askForWuxie(game, { card: card, target: target, harmful: harmful, count: count });
      if (!who) break;
      count++;
    }
    if (guard >= 40 && typeof console !== 'undefined') console.warn('[SGS] nullification chain guard hit (40) on ' + (card && card.cn));
    return (count % 2) === 1;
  };

  /* ============================================================
   * Choosing a card from a target's zones (顺手牵羊/过河拆桥/...)
   * areas: subset of ['hand','equip','judge']
   * ============================================================ */
  SGS.askTargetCard = async function (game, chooser, target, areas, reason) {
    areas = areas || ['hand', 'equip', 'judge'];
    var visible = [];
    if (areas.indexOf('equip') >= 0) {
      for (var k in target.equips) if (target.equips[k]) visible.push({ card: target.equips[k], area: 'equip', label: SGS.cardLabel(target.equips[k]) });
    }
    if (areas.indexOf('judge') >= 0) {
      for (var j = 0; j < target.judgeZone.length; j++) visible.push({ card: target.judgeZone[j], area: 'judge', label: SGS.cardLabel(target.judgeZone[j]) });
    }
    var hasHand = areas.indexOf('hand') >= 0 && target.hand.length > 0;
    var opts = visible.slice();
    if (hasHand) opts.push({ area: 'hand', label: '手牌（' + target.hand.length + '张·随机）' });
    if (opts.length === 0) return null;

    var res = await game.ask(chooser, {
      type: 'chooseZoneCard', target: target, options: opts, reason: reason || '选择一张牌'
    });
    var chosen = res && res.option ? res.option : opts[0];
    if (chosen.area === 'hand') {
      var idx = game.rng.int(target.hand.length);
      return target.hand[idx];
    }
    return chosen.card;
  };

  /* ============================================================
   * Play-phase options
   * ============================================================ */
  SGS.shaLimit = function (game, player) {
    // base 1 per turn, unless 诸葛连弩 or a skill removes the limit
    if (player.equips.weapon && player.equips.weapon.name === 'zhugeliannu') return Infinity;
    var ev = { player: player, limit: 1 };
    for (var s = 0; s < player.skills.length; s++) { if (player.skills[s].shaLimit) player.skills[s].shaLimit(game, player, ev); }
    return ev.limit;
  };

  SGS.canUseShaNow = function (game, player) {
    return player.history.shaCount < SGS.shaLimit(game, player);
  };

  SGS.playOptions = function (game, player) {
    var options = [];
    var seen = {};

    function addCardOption(card, o) {
      o = o || {};
      var opt = {
        key: card.id + (o.tag || ''),
        kind: 'card', card: card, cn: SGS.cardLabel(card), name: card.name,
        category: card.type,
        candidates: o.candidates || [], minTargets: o.minTargets || 0, maxTargets: o.maxTargets || 0,
        needTargets: (o.maxTargets || 0) > 0, tag: o.tag || null, note: o.note || null,
        reforge: !!o.reforge
      };
      options.push(opt);
    }

    // ---- hand cards ----
    for (var i = 0; i < player.hand.length; i++) {
      var c = player.hand[i];
      buildCardOption(game, player, c, addCardOption);
    }

    // ---- 丈八蛇矛：两张手牌当杀 ----
    if (player.equips.weapon && player.equips.weapon.name === 'zhangbashemao' && player.hand.length >= 2 && SGS.canUseShaNow(game, player)) {
      var zbCands = SGS.shaTargets(game, player);
      if (zbCands.length) {
        options.push({
          key: 'zhangbashemao', kind: 'card',
          card: SGS.virtualCard('sha', { subcards: [], suit: 'none' }),
          cn: '丈八蛇矛', name: 'sha', category: 'basic',
          candidates: zbCands, minTargets: 1, maxTargets: 1, needTargets: true,
          viewAs: 'zhangbashemao', pool: player.hand.slice(), convert: 2
        });
      }
    }

    // ---- view-as play skills ----
    for (var s = 0; s < player.skills.length; s++) {
      var sk = player.skills[s];
      if (sk.viewAsPlay) {
        var extra = sk.viewAsPlay(game, player) || [];
        for (var e = 0; e < extra.length; e++) options.push(extra[e]);
      }
      if (sk.active) {
        var act = sk.active(game, player);
        if (act) options.push({ key: 'skill_' + sk.name, kind: 'skill', skill: sk.name, cn: sk.cn, category: 'skill',
          candidates: act.candidates || [], minTargets: act.minTargets || 0, maxTargets: act.maxTargets || 0,
          needTargets: (act.maxTargets || 0) > 0, meta: act });
      }
    }
    return options;
  };

  /* target-prevention hook (空城/谦逊/…): can `source` target `target` with cardName? */
  SGS.canTarget = function (game, source, target, cardName) {
    var ev = { source: source, target: target, cardName: cardName, prevent: false };
    for (var i = 0; i < target.skills.length; i++) {
      var sk = target.skills[i];
      if (sk.preventTarget) sk.preventTarget(game, target, ev);
    }
    return !ev.prevent;
  };

  /* distance check for trick cards that normally require distance 1 (顺手牵羊/兵粮寸断) */
  SGS.trickDistanceOk = function (game, source, target) {
    if (source.hasSkill('qicai')) return true;
    return game.distance(source, target) <= 1;
  };

  /* players that `player` may currently hit with a 杀 (range + prevention) */
  SGS.shaTargets = function (game, player) {
    return game.alivePlayers().filter(function (t) {
      return t !== player && game.inAttackRange(player, t) && SGS.canTarget(game, player, t, 'sha');
    });
  };

  function buildCardOption(game, player, c, add) {
    if (c.name === 'sha') {
      if (!SGS.canUseShaNow(game, player)) return;
      var cands = SGS.shaTargets(game, player);
      if (cands.length === 0) return;
      var maxT = 1;
      // 方天画戟: last hand card 杀 can hit up to 3
      if (player.equips.weapon && player.equips.weapon.name === 'fangtianhuaji' && player.hand.length === 1) maxT = Math.min(3, cands.length);
      add(c, { candidates: cands, minTargets: 1, maxTargets: maxT });
      return;
    }
    if (c.name === 'tao') {
      if (player.isWounded()) add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '回复1点体力' });
      return;
    }
    if (c.name === 'jiu') {
      if (!player.flags.drunk) add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '强化下一次杀' });
      return;
    }
    if (c.name === 'shan' || c.name === 'wuxiekeji') return; // not proactively usable
    if (c.type === 'equip') { add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '装备' }); return; }
    if (c.type === 'trick') { buildTrickOption(game, player, c, add); return; }
  }

  function buildTrickOption(game, player, c, add) {
    var alive = game.alivePlayers();
    switch (c.name) {
      case 'wuzhongshengyou':
        add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '摸两张' }); break;
      case 'taoyuanjieyi':
      case 'wugufengdeng':
        add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '全体' }); break;
      case 'nanmanruqin':
      case 'wanjianqifa':
        add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '所有其他角色' }); break;
      case 'guohechaiqiao': {
        var cg = alive.filter(function (t) { return t !== player && t.allCards().length > 0; });
        if (cg.length) add(c, { candidates: cg, minTargets: 1, maxTargets: 1 });
        break; }
      case 'shunshouqianyang': {
        var cs = alive.filter(function (t) { return t !== player && (t.hand.length + t.equipCount() > 0) && SGS.trickDistanceOk(game, player, t) && SGS.canTarget(game, player, t, 'shunshouqianyang'); });
        if (cs.length) add(c, { candidates: cs, minTargets: 1, maxTargets: 1 });
        break; }
      case 'juedou': {
        var cd = alive.filter(function (t) { return t !== player && SGS.canTarget(game, player, t, 'juedou'); });
        if (cd.length) add(c, { candidates: cd, minTargets: 1, maxTargets: 1 });
        break; }
      case 'huogong': {
        var cf = alive.filter(function (t) { return t.hand.length > 0; });
        if (cf.length) add(c, { candidates: cf, minTargets: 1, maxTargets: 1 });
        break; }
      case 'lebusishu': {
        var cl = alive.filter(function (t) { return t !== player && !hasJudge(t, 'lebusishu') && SGS.canTarget(game, player, t, 'lebusishu'); });
        if (cl.length) add(c, { candidates: cl, minTargets: 1, maxTargets: 1 });
        break; }
      case 'bingliangcunduan': {
        var cb = alive.filter(function (t) { return t !== player && !hasJudge(t, 'bingliangcunduan') && SGS.trickDistanceOk(game, player, t) && SGS.canTarget(game, player, t, 'bingliangcunduan'); });
        if (cb.length) add(c, { candidates: cb, minTargets: 1, maxTargets: 1 });
        break; }
      case 'shandian':
        if (!hasJudge(player, 'shandian')) add(c, { candidates: [], minTargets: 0, maxTargets: 0, note: '置于自己判定区' });
        break;
      case 'tiesuolianhuan': {
        var ct = alive.slice();
        add(c, { candidates: ct, minTargets: 1, maxTargets: 2, tag: 'chain', note: '连环' });
        add(c, { candidates: [], minTargets: 0, maxTargets: 0, reforge: true, note: '重铸' });
        break; }
      case 'jiedaosharen': {
        // A weapon holder is legal only if someone is currently in their range.
        var armed = alive.filter(function (t) {
          if (t === player || !t.equips.weapon) return false;
          return alive.some(function (v) { return v !== t && game.inAttackRange(t, v) && SGS.canTarget(game, t, v, 'sha'); });
        });
        if (armed.length) add(c, { candidates: armed, minTargets: 1, maxTargets: 1, note: '令其杀人' });
        break; }
      default: break;
    }
  }

  function hasJudge(p, name) {
    for (var i = 0; i < p.judgeZone.length; i++) if (p.judgeZone[i].name === name) return true;
    return false;
  }
  SGS.hasJudge = hasJudge;

  /* ============================================================
   * Execute a chosen play action
   * action: { card, targets, skill, meta, reforge }
   * ============================================================ */
  function uniqueItems(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) if (out.indexOf(items[i]) < 0) out.push(items[i]);
    return out;
  }

  function targetsMatchOption(action, option) {
    var targets = action.targets || [];
    if (uniqueItems(targets).length !== targets.length) return false;
    if (targets.length < option.minTargets || targets.length > option.maxTargets) return false;
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i] || !targets[i].alive || option.candidates.indexOf(targets[i]) < 0) return false;
    }
    return true;
  }

  SGS.validatePlayAction = function (game, player, action) {
    if (!action || !player || !player.alive) return { valid: false, reason: 'missing action or living player' };
    var options = SGS.playOptions(game, player);
    if (action.kind === 'skill' || action.skill) {
      var skillOption = options.filter(function (o) { return o.kind === 'skill' && o.skill === action.skill; })[0];
      if (!skillOption || !targetsMatchOption(action, skillOption)) return { valid: false, reason: 'skill is unavailable or has illegal targets' };
      var cost = skillOption.meta && skillOption.meta.cost;
      if (cost && cost.type === 'discardHand') {
        var paid = uniqueItems(action.costCards || []);
        if (paid.length < cost.min || paid.length > cost.max || paid.some(function (c) { return player.hand.indexOf(c) < 0; })) {
          return { valid: false, reason: 'invalid hand-card skill cost' };
        }
      } else if (cost && cost.type === 'equip') {
        var equip = action.costEquip;
        var ownsEquip = false;
        for (var slot in player.equips) if (player.equips[slot] === equip) ownsEquip = true;
        if (!equip || !ownsEquip) return { valid: false, reason: 'invalid equipment skill cost' };
      }
      if (action.skill === 'zhiheng') {
        var zh = uniqueItems(action.zhihengCards || []);
        if (!zh.length || zh.some(function (c) { return !player.hasCard(c) || player.judgeZone.indexOf(c) >= 0; })) return { valid: false, reason: 'invalid zhiheng cards' };
      }
      if (action.skill === 'rende') {
        var give = uniqueItems(action.giveCards || []);
        if (!give.length || give.some(function (c) { return player.hand.indexOf(c) < 0; })) return { valid: false, reason: 'invalid rende cards' };
      }
      return { valid: true };
    }

    var card = action.card;
    if (!card) return { valid: false, reason: 'missing card' };
    var matches = options.filter(function (o) {
      if (o.kind !== 'card' || !!o.reforge !== !!action.reforge) return false;
      if (o.card === card || (o.card && card && o.card.id === card.id)) return true;
      if (!o.viewAs || o.name !== card.name || !card.virtual) return false;
      var subs = uniqueItems(card.subcards || []);
      var required = o.convert || 1;
      return subs.length === required && subs.every(function (c) { return o.pool.indexOf(c) >= 0; });
    });
    for (var i = 0; i < matches.length; i++) if (targetsMatchOption(action, matches[i])) return { valid: true };
    return { valid: false, reason: 'card is unavailable or has illegal targets' };
  };

  SGS.executePlayAction = async function (game, player, action) {
    var validation = SGS.validatePlayAction(game, player, action);
    if (!validation.valid) {
      game.msg(player.name + ' 的出牌动作无效：' + validation.reason, { kind: 'error', player: player.id });
      return false;
    }
    if (action.kind === 'skill' || action.skill) {
      var sk = player.getSkill(action.skill);
      if (sk && sk.onActivate) { await sk.onActivate(game, player, action); return true; }
      return false;
    }
    var card = action.card;
    if (!card) return false;
    var targets = action.targets || [];

    // equipment: just equip
    if (card.type === 'equip') {
      await game.equipCard(player, card);
      return true;
    }
    if (card.name === 'tao') {
      await game.toDiscard([card], { who: player, log: false });
      game.msg(player.name + ' 使用【桃】回复1点体力。', { kind: 'basic', player: player.id });
      await game.recover(player, 1, { reason: 'tao' });
      return true;
    }
    if (card.name === 'jiu') {
      await game.toDiscard([card], { who: player, log: false });
      player.flags.drunk = true;
      game.msg(player.name + ' 使用【酒】，下一次“杀”伤害+1。', { kind: 'basic', player: player.id });
      return true;
    }
    if (card.name === 'sha') {
      if (targets.length === 0) return false;
      player.history.shaCount++;
      game.beginCardResolution(card);
      try {
        // remove sha card now (used)
        await game.toDiscard([card], { who: player, log: false });
        game.msg(player.name + ' 对 ' + targets.map(function (t) { return t.name; }).join('、') +
          ' 使用' + (card.element === 'fire' ? '【火杀】' : card.element === 'thunder' ? '【雷杀】' : '【杀】'),
          { kind: 'basic', player: player.id });
        if (game.uiHook) await game.uiHook('useCard', { player: player, card: card, targets: targets });
        await game.uiPause();
        await SGS.doSha(game, player, targets, card);
      } finally {
        game.endCardResolution(card);
      }
      return true;
    }
    if (card.type === 'trick') {
      return await SGS.useTrick(game, player, card, targets, action);
    }
    return false;
  };

  /* ============================================================
   * 杀 resolution
   * ============================================================ */
  SGS.doSha = async function (game, source, targets, card) {
    var useEv = { source: source, targets: targets.slice(), card: card };
    source.flags.shaThisTurn = true; // for 克己
    await game.emit('useSha', useEv);
    var drunk = source.flags.drunk;
    if (drunk) source.flags.drunk = false;

    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (!target.alive || !source.alive) continue;
      var ctx = { source: source, target: target, card: card, drunk: drunk, needShan: 1, ignoreArmor: false, transferTo: null, undodgeable: false };
      if (source.equips.weapon && source.equips.weapon.name === 'qinggangjian') ctx.ignoreArmor = true;
      await game.emit('shaHit', ctx); // skills may set flags (extra 闪 / 流离转移 / 铁骑锁定)
      if (ctx.transferTo && ctx.transferTo.alive) {
        game.msg(target.name + ' 发动流离，将“杀”转移给 ' + ctx.transferTo.name, { kind: 'skill' });
        target = ctx.transferTo;
      }

      // targeting triggers (e.g. armor negation)
      // 仁王盾: black 杀 negated (unless ignoreArmor)
      if (!ctx.ignoreArmor && target.equips.armor && target.equips.armor.name === 'renwang' && SGS.isBlack(card.suit)) {
        game.msg(target.name + ' 的仁王盾令黑色“杀”无效。', { kind: 'equip' });
        continue;
      }
      // 藤甲: normal 杀 negated
      if (!ctx.ignoreArmor && target.equips.armor && target.equips.armor.name === 'tengjia' && card.element === 'normal') {
        game.msg(target.name + ' 的藤甲令普通“杀”无效。', { kind: 'equip' });
        continue;
      }

      // ask target for 闪
      var dodged = false;
      var needed = ctx.needShan;
      var provided = 0;
      if (ctx.undodgeable) {
        game.msg(target.name + ' 无法使用“闪”（铁骑）。', { kind: 'skill' });
      } else {
        while (provided < needed) {
          var resp = await SGS.askResponse(game, target, {
            need: 'shan', source: source, forCard: card,
            reason: source.name + ' 的“杀”，是否使用“闪”？'
          });
          if (!resp) break;
          await SGS.consumeResponse(game, target, resp);
          provided++;
          if (game.uiHook) await game.uiHook('useCard', { player: target, card: { cn: '闪' }, targets: [] });
          game.msg(target.name + ' 使用“闪”抵消。', { kind: 'basic', player: target.id });
        }
        dodged = provided >= needed;
      }

      if (dodged) {
        await game.emit('shaDodged', { source: source, target: target, card: card });
        // 青龙偃月刀: may use another 杀
        if (source.alive && source.equips.weapon && source.equips.weapon.name === 'qinglongyanyuedao') {
          var again = await extraShaAfterDodge(game, source, target, card);
          if (again) { /* handled recursively */ }
        }
        // 贯石斧: discard 2 to force damage
        if (source.alive && source.equips.weapon && source.equips.weapon.name === 'guanshifu') {
          var forced = await guanshifuForce(game, source, target, card, ctx);
          if (forced) { /* damage applied inside */ }
        }
        continue;
      }

      // hit: deal damage (unless a weapon replaces damage)
      // 寒冰剑: may replace damage with discarding 2 target cards
      var discardable = target.hand.length + target.equipCount();
      if (source.equips.weapon && source.equips.weapon.name === 'hanbingjian' && discardable > 0) {
        var useIce = await game.ask(source, { type: 'confirm', reason: '是否发动寒冰剑（改为弃置对方两张牌，不造成伤害）？', context: 'hanbing' });
        if (useIce && useIce.yes) {
          for (var z = 0; z < 2; z++) {
            if (target.allCards().length === 0) break;
            var cc = await SGS.askTargetCard(game, source, target, ['hand', 'equip'], '寒冰剑：弃置目标一张牌');
            if (cc) await game.discardCards(target, [cc], { reason: 'hanbing' });
          }
          game.msg(source.name + ' 发动寒冰剑，弃置了 ' + target.name + ' 的牌。', { kind: 'equip' });
          continue;
        }
      }

      var amount = 1 + (drunk ? 1 : 0);
      var dmg = { source: source, target: target, amount: amount, element: card.element || 'normal', card: card, reason: 'sha' };
      // 雌雄双股剑
      if (source.equips.weapon && source.equips.weapon.name === 'cixiongjian' && source.gender && target.gender && source.gender !== target.gender) {
        await cixiongEffect(game, source, target);
      }
      await game.damage(dmg);
      // 麒麟弓: on damage, discard a horse
      if (dmg.dealt && source.alive && source.equips.weapon && source.equips.weapon.name === 'qilingong') {
        await qilinEffect(game, source, target);
      }
    }
    await game.emit('afterSha', useEv);
  };

  async function extraShaAfterDodge(game, source, target, card) {
    // reuse a 杀 from hand or view-as
    var resp = await SGS.askResponse(game, source, { need: 'sha', source: target, reason: '青龙偃月刀：是否再使用一张“杀”？', trigger: 'qinglong' });
    if (!resp) return false;
    await SGS.consumeResponse(game, source, resp);
    game.msg(source.name + ' 借青龙偃月刀再次“杀” ' + target.name, { kind: 'equip' });
    await SGS.doSha(game, source, [target], resp.card || card);
    return true;
  }

  async function guanshifuForce(game, source, target, card, ctx) {
    if (source.hand.length + source.equipCount() < 2) return false;
    var ask = await game.ask(source, { type: 'confirm', reason: '是否发动贯石斧（弃两张牌令“杀”依然造成伤害）？', context: 'guanshifu' });
    if (!ask || !ask.yes) return false;
    var pool = source.hand.slice();
    for (var k in source.equips) if (source.equips[k]) pool.push(source.equips[k]);
    var pick = await game.ask(source, { type: 'chooseCards', from: pool, min: 2, max: 2, reason: '贯石斧：弃置两张牌' });
    if (!pick || !pick.cards || pick.cards.length < 2) return false;
    await game.discardCards(source, pick.cards.slice(0, 2), { reason: 'guanshifu' });
    game.msg(source.name + ' 发动贯石斧，强制造成伤害。', { kind: 'equip' });
    await game.damage({ source: source, target: target, amount: 1 + (ctx.drunk ? 1 : 0), element: card.element || 'normal', card: card, reason: 'sha' });
    return true;
  }

  async function cixiongEffect(game, source, target) {
    var choice = target.hand.length ? await game.ask(target, {
      type: 'chooseOption', reason: '雌雄双股剑：弃置一张手牌，或令 ' + source.name + ' 摸一张牌',
      choices: [{ key: 'discard', label: '弃置一张手牌' }, { key: 'draw', label: '令其摸一张牌' }]
    }) : null;
    var key = choice && (choice.key === 'discard' || choice.key === 'draw') ? choice.key : (target.hand.length ? 'discard' : 'draw');
    if (key === 'discard' && target.hand.length) {
      var cc = await SGS.askTargetCard(game, source, target, ['hand'], '雌雄双股剑');
      if (cc) await game.discardCards(target, [cc], { reason: 'cixiong' });
      game.msg('雌雄双股剑：' + target.name + ' 弃置一张手牌。', { kind: 'equip' });
    } else {
      await game.drawCards(source, 1, { reason: 'cixiong' });
      game.msg('雌雄双股剑：' + source.name + ' 摸一张牌。', { kind: 'equip' });
    }
  }

  async function qilinEffect(game, source, target) {
    if (!target.equips.offhorse && !target.equips.defhorse) return;
    var ask = await game.ask(source, { type: 'confirm', reason: '麒麟弓：是否弃置目标一匹坐骑？', context: 'qilin' });
    if (!ask || !ask.yes) return;
    var horses = [];
    if (target.equips.offhorse) horses.push({ card: target.equips.offhorse, label: SGS.cardLabel(target.equips.offhorse) });
    if (target.equips.defhorse) horses.push({ card: target.equips.defhorse, label: SGS.cardLabel(target.equips.defhorse) });
    var pick = await game.ask(source, { type: 'chooseOption', reason: '选择弃置的坐骑', choices: horses.map(function (h, i) { return { key: String(i), label: h.label }; }) });
    var idx = pick && pick.key != null ? parseInt(pick.key, 10) : 0;
    var chosen = horses[idx] || horses[0];
    await game.discardCards(target, [chosen.card], { reason: 'qilin' });
    game.msg('麒麟弓：' + source.name + ' 弃置了 ' + target.name + ' 的坐骑。', { kind: 'equip' });
  }

  /* ============================================================
   * Trick cards
   * ============================================================ */
  SGS.useTrick = async function (game, source, card, targets, action) {
    // delayed tricks are placed directly (no need for a SGS.TRICKS handler)
    if (card.subtype === 'delay') {
      var dt = targets[0] || source;
      if (card.name === 'shandian') dt = source;
      await game.placeJudgeCard(dt, card);
      return true;
    }
    var fn = SGS.TRICKS[card.name];
    if (!fn) { game.msg('未实现的锦囊：' + card.name, { kind: 'error' }); return false; }
    game.beginCardResolution(card);
    try {
      // reforge path for 铁索连环
      if (card.name === 'tiesuolianhuan' && action && action.reforge) {
        await game.toDiscard([card], { who: source, log: false });
        game.msg(source.name + ' 重铸【铁索连环】。', { kind: 'trick', player: source.id });
        await game.drawCards(source, 1, { reason: 'reforge' });
        return true;
      }
      game.msg(source.name + ' 使用【' + card.cn + '】' + (targets.length ? ('，目标：' + targets.map(function (t) { return t.name; }).join('、')) : ''), { kind: 'trick', player: source.id });
      if (game.uiHook) await game.uiHook('useCard', { player: source, card: card, targets: targets });
      await game.uiPause();
      await game.toDiscard([card], { who: source, log: false });
      await fn(game, source, card, targets, action);
      await game.emit('afterUseTrick', { source: source, card: card, targets: targets });
      return true;
    } finally {
      game.endCardResolution(card);
    }
  };

  SGS.TRICKS = {
    wuzhongshengyou: async function (game, source) {
      await game.drawCards(source, 2, { reason: 'wuzhong' });
    },
    guohechaiqiao: async function (game, source, card, targets) {
      var t = targets[0];
      if (await SGS.resolveNullification(game, card, t)) return;
      if (t.allCards().length === 0) return;
      var cc = await SGS.askTargetCard(game, source, t, ['hand', 'equip', 'judge'], '过河拆桥：弃置一张牌');
      if (cc) {
        await game.discardCards(t, [cc], { reason: 'guohechaiqiao' });
        game.msg(source.name + ' 拆掉了 ' + t.name + ' 的一张牌。', { kind: 'trick' });
      }
      if (game.uiHook) await game.uiHook('refresh', {});
    },
    shunshouqianyang: async function (game, source, card, targets) {
      var t = targets[0];
      if (await SGS.resolveNullification(game, card, t)) return;
      if (t.allCards().length === 0) return;
      var cc = await SGS.askTargetCard(game, source, t, ['hand', 'equip', 'judge'], '顺手牵羊：获得一张牌');
      if (cc) {
        await game.gainCards(source, [cc], { from: t });
      }
      if (game.uiHook) await game.uiHook('refresh', {});
    },
    juedou: async function (game, source, card, targets) {
      var t = targets[0];
      if (await SGS.resolveNullification(game, card, t)) return;
      var loser = null;
      // 决斗 flow: target plays 杀 first, then alternate. 无双: opponent must play 2 杀 each exchange.
      var current = t, other = source;
      var guard = 0;
      while (guard++ < 100) {
        // 无双：要求出杀的角色（other）若有无双，则对方需出2张杀
        var need = other.hasSkill('wushuang') ? 2 : 1;
        var gaveUp = false;
        for (var q = 0; q < need; q++) {
          var resp = await SGS.askResponse(game, current, {
            need: 'sha', source: other, trigger: 'juedou',
            reason: '决斗：请打出“杀”' + (need > 1 ? ('（' + (q + 1) + '/' + need + '）') : '')
          });
          if (!resp) { gaveUp = true; break; }
          await SGS.consumeResponse(game, current, resp);
          game.msg(current.name + ' 打出“杀”应战。', { kind: 'trick' });
        }
        if (gaveUp) { loser = current; break; }
        var tmp = current; current = other; other = tmp;
      }
      if (guard >= 100 && typeof console !== 'undefined') console.warn('[SGS] juedou guard hit (100 exchanges)');
      if (loser) {
        var winner = loser === source ? t : source;
        await game.damage({ source: winner, target: loser, amount: 1, element: 'normal', card: card, reason: 'juedou' });
      }
    },
    nanmanruqin: async function (game, source, card) {
      var order = game.orderFrom(source, false);
      for (var i = 0; i < order.length; i++) {
        var t = order[i];
        if (!t.alive) continue;
        if (await SGS.resolveNullification(game, card, t)) continue;
        // 藤甲 immunity
        if (t.equips.armor && t.equips.armor.name === 'tengjia') { game.msg(t.name + ' 藤甲免疫南蛮入侵。', { kind: 'equip' }); continue; }
        var resp = await SGS.askResponse(game, t, { need: 'sha', source: source, reason: '南蛮入侵：请打出“杀”', trigger: 'nanman' });
        if (resp) { await SGS.consumeResponse(game, t, resp); game.msg(t.name + ' 打出“杀”。', { kind: 'trick' }); }
        else { await game.damage({ source: source, target: t, amount: 1, element: 'normal', card: card, reason: 'nanman' }); }
        if (game.finished) break;
      }
    },
    wanjianqifa: async function (game, source, card) {
      var order = game.orderFrom(source, false);
      for (var i = 0; i < order.length; i++) {
        var t = order[i];
        if (!t.alive) continue;
        if (await SGS.resolveNullification(game, card, t)) continue;
        if (t.equips.armor && t.equips.armor.name === 'tengjia') { game.msg(t.name + ' 藤甲免疫万箭齐发。', { kind: 'equip' }); continue; }
        var resp = await SGS.askResponse(game, t, { need: 'shan', source: source, reason: '万箭齐发：请打出“闪”', trigger: 'wanjian' });
        if (resp) { await SGS.consumeResponse(game, t, resp); game.msg(t.name + ' 打出“闪”。', { kind: 'trick' }); }
        else { await game.damage({ source: source, target: t, amount: 1, element: 'normal', card: card, reason: 'wanjian' }); }
        if (game.finished) break;
      }
    },
    taoyuanjieyi: async function (game, source, card) {
      var order = game.orderFrom(source, true);
      for (var i = 0; i < order.length; i++) {
        var t = order[i];
        if (!t.alive) continue;
        if (await SGS.resolveNullification(game, card, t)) continue;
        if (t.isWounded()) await game.recover(t, 1, { reason: 'taoyuan' });
      }
    },
    wugufengdeng: async function (game, source, card) {
      var order = game.orderFrom(source, true);
      var n = order.length;
      var reveal = game.drawFromPile(n);
      game.msg('五谷丰登翻开：' + reveal.map(SGS.cardLabel).join('、'), { kind: 'trick' });
      for (var i = 0; i < order.length; i++) {
        var t = order[i];
        if (!t.alive) continue;
        if (await SGS.resolveNullification(game, card, t)) continue;
        if (reveal.length === 0) break;
        var pick = await game.ask(t, {
          type: 'chooseOption', reason: '五谷丰登：选取一张牌', context: 'wugu',
          choices: reveal.map(function (c, idx) { return { key: String(idx), label: SGS.cardLabel(c), card: c }; })
        });
        var idx = pick && pick.key != null ? parseInt(pick.key, 10) : 0;
        if (idx < 0 || idx >= reveal.length) idx = 0;
        var got = reveal.splice(idx, 1)[0];
        t.hand.push(got);
        game.msg(t.name + ' 取走 ' + SGS.cardLabel(got), { kind: 'trick' });
      }
      for (var r = 0; r < reveal.length; r++) game.discard.push(reveal[r]);
    },
    huogong: async function (game, source, card, targets) {
      var t = targets[0];
      if (await SGS.resolveNullification(game, card, t)) return;
      if (t.hand.length === 0) return;
      // target shows a random hand card
      var shown = t.hand[game.rng.int(t.hand.length)];
      game.msg(t.name + ' 展示 ' + SGS.cardLabel(shown), { kind: 'trick' });
      // source must discard a hand card of same suit
      var same = source.hand.filter(function (c) { return c.suit === shown.suit; });
      if (same.length === 0) { game.msg(source.name + ' 没有同花色手牌，火攻失败。', { kind: 'trick' }); return; }
      var ask = await game.ask(source, { type: 'confirm', reason: '火攻：弃置一张 ' + SGS.SUITS[shown.suit].cn + ' 手牌造成火焰伤害？', context: 'huogong' });
      if (!ask || !ask.yes) return;
      var pick = await game.ask(source, { type: 'chooseCards', from: same.slice(), min: 1, max: 1, reason: '选择弃置的手牌' });
      var cc = pick && pick.cards && pick.cards[0] ? pick.cards[0] : same[0];
      await game.discardCards(source, [cc], { reason: 'huogong' });
      await game.damage({ source: source, target: t, amount: 1, element: 'fire', card: card, reason: 'huogong' });
    },
    tiesuolianhuan: async function (game, source, card, targets) {
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (await SGS.resolveNullification(game, card, t)) continue;
        t.chained = !t.chained;
        game.msg(t.name + (t.chained ? ' 被连环（横置）。' : ' 解除连环。'), { kind: 'trick' });
        if (game.uiHook) await game.uiHook('chain', { player: t });
      }
    },
    jiedaosharen: async function (game, source, card, targets, action) {
      var armed = targets[0];
      if (!armed || !armed.equips.weapon) return;
      // choose a victim within armed's range
      var victims = game.alivePlayers().filter(function (v) { return v !== armed && game.inAttackRange(armed, v) && SGS.canTarget(game, armed, v, 'sha'); });
      if (victims.length === 0) { game.msg('借刀杀人没有合法的被杀目标。', { kind: 'trick' }); return; }
      var victim = action.secondTarget;
      if (!victim || victims.indexOf(victim) < 0) {
        var pick = await game.ask(source, {
          type: 'choosePlayers', candidates: victims, min: 1, max: 1, reason: '借刀杀人：选择被“杀”的角色'
        });
        victim = pick && pick.players && pick.players[0] ? pick.players[0] : victims[0];
      }
      if (await SGS.resolveNullification(game, card, armed)) return;
      var resp = await SGS.askResponse(game, armed, { need: 'sha', source: victim, reason: '借刀杀人：对 ' + victim.name + ' 使用“杀”，否则交出武器' });
      if (resp) {
        await SGS.consumeResponse(game, armed, resp);
        game.msg(armed.name + ' 被迫对 ' + victim.name + ' 使用“杀”。', { kind: 'trick' });
        await SGS.doSha(game, armed, [victim], resp.card || SGS.virtualCard('sha', { suit: 'none' }));
      } else {
        var w = armed.equips.weapon;
        if (w) { await game.gainCards(source, [w], { from: armed }); game.msg(armed.name + ' 交出武器 ' + SGS.cardLabel(w) + ' 给 ' + source.name, { kind: 'trick' }); }
      }
    }
  };

  /* ============================================================
   * Delayed trick resolution (judge phase)
   * ============================================================ */
  SGS.resolveDelayTrick = async function (game, player, card) {
    // nullification chance
    if (await SGS.resolveNullification(game, card, player)) {
      game.msg(player.name + ' 的【' + card.cn + '】被无懈可击抵消。', { kind: 'trick' });
      return;
    }
    if (card.name === 'lebusishu') {
      var jc = await game.judge(player, { reason: '乐不思蜀', delayCard: card });
      if (!jc) return;
      if (jc.suit !== 'heart') { player.skip_play = true; game.msg(player.name + ' 乐不思蜀判定非红桃，跳过出牌阶段。', { kind: 'judge' }); }
      else game.msg(player.name + ' 乐不思蜀判定为红桃，无效。', { kind: 'judge' });
    } else if (card.name === 'bingliangcunduan') {
      var jc2 = await game.judge(player, { reason: '兵粮寸断', delayCard: card });
      if (!jc2) return;
      if (jc2.suit !== 'club') { player.skip_draw = true; game.msg(player.name + ' 兵粮寸断判定非梅花，跳过摸牌阶段。', { kind: 'judge' }); }
      else game.msg(player.name + ' 兵粮寸断判定为梅花，无效。', { kind: 'judge' });
    } else if (card.name === 'shandian') {
      var jc3 = await game.judge(player, { reason: '闪电', delayCard: card });
      if (!jc3) return;
      if (jc3.suit === 'spade' && jc3.rank >= 2 && jc3.rank <= 9) {
        game.msg(player.name + ' 闪电判定命中！受到3点雷电伤害。', { kind: 'judge' });
        await game.damage({ source: null, target: player, amount: 3, element: 'thunder', card: card, reason: 'shandian' });
        // card goes to discard (handled by caller)
      } else {
        // move to next player's judge zone
        var nxt = game.orderFrom(player, false).filter(function (p) { return !hasJudge(p, 'shandian'); })[0];
        game.msg(player.name + ' 闪电未命中，移交给 ' + (nxt ? nxt.name : '下家') + '。', { kind: 'judge' });
        if (nxt) {
          // prevent caller from discarding
          nxt.judgeZone.push(card);
          card._moved = true;
          if (game.uiHook) await game.uiHook('judgezone', { player: nxt });
        }
      }
    }
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
