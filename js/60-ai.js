/* ==========================================================================
 * 三分天下 · AI 智能体
 *   SGS.AIAgent.decide(game, player, req) -> response (sync value or Promise)
 *   Role-aware heuristics: rebels gang the lord, loyalists defend, traitor
 *   plays the long game. Handles every request type the engine can raise.
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var ai = SGS.ai = SGS.ai || {};

  /* -------- friend / foe model (AI is role-aware for coherent play) -------- */
  function camp(role) {
    if (role === 'lord' || role === 'loyalist') return 'lord';
    if (role === 'rebel') return 'rebel';
    return 'traitor';
  }
  function isLord(game, p) { return p === game.players[0]; }
  function align(game, p) { return game.alignOf ? game.alignOf(p) : 0; }

  // --- AI-vs-AI uses true-role camps (coordinated, decisive team play) ---
  function foeByRole(game, me, other) {
    var mc = camp(me.role);
    if (me.role === 'traitor') {
      if (game.aliveCount() <= 2) return true;
      var rebelsAlive = game.alivePlayers().some(function (p) { return p.role === 'rebel'; });
      if (rebelsAlive) return other.role === 'rebel';
      return true;
    }
    if (mc === 'lord') return other.role !== 'lord' && other.role !== 'loyalist';
    if (mc === 'rebel') return other.role === 'lord' || other.role === 'loyalist';
    return false;
  }
  function allyByRole(game, me, other) {
    if (me.role === 'traitor') return false;
    return !foeByRole(game, me, other);
  }
  // --- The HUMAN is judged only by the public "table read" (game.align) ---
  function foeByAlign(game, me, other) {
    var a = align(game, other), lord = isLord(game, other);
    switch (me.role) {
      case 'lord': case 'loyalist': return !lord && a <= -0.6;
      case 'rebel': return lord || a >= 0.6;
      case 'traitor': return game.aliveCount() <= 2 ? true : (!lord && a <= -0.6);
      default: return false;
    }
  }
  function allyByAlign(game, me, other) {
    if (me.role === 'traitor') return false;
    var a = align(game, other), lord = isLord(game, other);
    switch (me.role) {
      case 'lord': case 'loyalist': return lord || a >= 0.6;
      case 'rebel': return !lord && a <= -0.6;
      default: return false;
    }
  }

  ai.isFoe = function (game, me, other) {
    if (me === other || !other.alive) return false;
    return other.isHuman ? foeByAlign(game, me, other) : foeByRole(game, me, other);
  };
  ai.isAlly = function (game, me, other) {
    if (me === other) return true;
    if (!other.alive) return false;
    return other.isHuman ? allyByAlign(game, me, other) : allyByRole(game, me, other);
  };

  ai.foes = function (game, me) {
    return game.alivePlayers().filter(function (p) { return ai.isFoe(game, me, p); });
  };
  ai.allies = function (game, me) {
    return game.alivePlayers().filter(function (p) { return p !== me && ai.isAlly(game, me, p); });
  };

  // target priority: prefer low hp (finish), then lord (for rebels), then fewer defenses
  ai.rankFoe = function (game, me, foe) {
    var score = 0;
    score += (10 - foe.hp) * 3;                 // weaker = juicier
    if (isLord(game, foe)) score += (me.role === 'rebel' || me.role === 'traitor') ? 8 : 0;
    if (foe.hp === 1) score += 12;              // kill chance
    score -= foe.hand.length;                    // more cards = harder
    if (foe.equips.armor) score -= 2;
    if (foe.equips.defhorse) score -= 1;
    return score;
  };

  ai.bestFoeAmong = function (game, me, candidates) {
    var foes = candidates.filter(function (c) { return ai.isFoe(game, me, c); });
    if (!foes.length) return null;
    foes.sort(function (a, b) { return ai.rankFoe(game, me, b) - ai.rankFoe(game, me, a); });
    return foes[0];
  };

  /* -------- card value (for keeping/discarding) -------- */
  ai.cardValue = function (card) {
    switch (card.name) {
      case 'tao': return 9;
      case 'wuxiekeji': return 6;
      case 'jiu': return 5;
      case 'shan': return 5;
      case 'sha': return 5;
      case 'wuzhongshengyou': return 7;
      case 'zhugeliannu': return 8;
      case 'juedou': return 5;
      case 'guohechaiqiao': return 5;
      case 'shunshouqianyang': return 5;
      case 'taoyuanjieyi': return 6;
      case 'wugufengdeng': return 5;
      case 'nanmanruqin': return 4;
      case 'wanjianqifa': return 4;
      case 'lebusishu': return 4;
      case 'huogong': return 4;
      default:
        if (card.type === 'equip') return card.subtype === 'weapon' ? 6 : 4;
        if (card.type === 'trick') return 4;
        return 3;
    }
  };

  ai.pickDiscards = function (game, player, count) {
    var hand = player.hand.slice();
    hand.sort(function (a, b) { return ai.cardValue(a) - ai.cardValue(b); });
    return hand.slice(0, count);
  };

  // 观星: keep valuable cards on top (best first), send junk (value<=3) to the bottom
  ai.guanxing = function (game, me, top) {
    var keep = [], bottom = [];
    top.forEach(function (c) { if (ai.cardValue(c) <= 3 && keep.length >= 1) bottom.push(c); else keep.push(c); });
    keep.sort(function (a, b) { return ai.cardValue(b) - ai.cardValue(a); });
    return { topIds: keep.map(function (c) { return c.id; }), bottomIds: bottom.map(function (c) { return c.id; }) };
  };

  /* -------- helpers -------- */
  function countResp(game, player, need) {
    return SGS.gatherResponses(game, player, need, {}).length;
  }
  function wouldDie(player, dmg) { return player.hp - (dmg || 1) <= 0; }

  /* expected usefulness of a 杀 against a target, considering armor/element */
  ai.shaEffectiveness = function (game, player, target, card) {
    var element = (card && card.element) || 'normal';
    var ignoreArmor = (player.equips.weapon && player.equips.weapon.name === 'qinggangjian');
    if (!ignoreArmor && target.equips.armor) {
      var armor = target.equips.armor.name;
      if (armor === 'tengjia') {
        if (element === 'normal') return 0; // 藤甲免疫普通杀
        if (element === 'fire') return 1.5; // 火焰伤害+1（近似）
      }
      if (armor === 'renwang' && element === 'normal' && SGS.isBlack((card && card.suit) || 'spade')) return 0;
    }
    var canDodge = countResp(game, target, 'shan');
    var hitProb = canDodge ? 0.5 : 1;
    return hitProb;
  };

  /* ============================================================
   * Main decision dispatcher
   * ============================================================ */
  ai.decide = function (game, player, req) {
    switch (req.type) {
      case 'play':            return ai.decidePlay(game, player, req);
      case 'respond':         return ai.decideRespond(game, player, req);
      case 'rescue':          return ai.decideRescue(game, player, req);
      case 'wuxie':           return ai.decideWuxie(game, player, req);
      case 'discard':         return ai.decideDiscard(game, player, req);
      case 'chooseCards':     return ai.decideChooseCards(game, player, req);
      case 'chooseZoneCard':  return ai.decideZoneCard(game, player, req);
      case 'choosePlayers':   return ai.decideChoosePlayers(game, player, req);
      case 'chooseOption':    return ai.decideChooseOption(game, player, req);
      case 'confirm':         return ai.decideConfirm(game, player, req);
      default:                return null;
    }
  };

  /* -------- play phase -------- */
  ai.decidePlay = function (game, player, req) {
    var options = req.options || [];
    var best = null, bestScore = 0;

    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var res = ai.scorePlayOption(game, player, o);
      if (res && res.score > bestScore) { bestScore = res.score; best = res; }
    }
    if (!best) return { end: true };
    return best.action;
  };

  ai.scorePlayOption = function (game, player, o) {
    var name = o.name;
    var mk = function (score, targets, extra) {
      var action = { kind: o.kind, card: o.card, skill: o.skill, targets: targets || [] };
      if (extra) for (var k in extra) action[k] = extra[k];
      return { score: score, action: action };
    };

    if (o.kind === 'skill') {
      return ai.scoreSkillOption(game, player, o);
    }

    // --- equipment ---
    if (o.category === 'equip') {
      var c = o.card;
      if (c.subtype === 'weapon') {
        var cur = player.equips.weapon;
        if (!cur) return mk(6);
        if ((c.range || 1) > (cur.range || 1)) return mk(5);
        if (c.name === 'zhugeliannu') return mk(7);
        return mk(1.5); // swap minor
      }
      if (c.subtype === 'armor') return mk(player.equips.armor ? 1.5 : 5.5);
      if (c.subtype === 'offhorse') return mk(player.equips.offhorse ? 1 : 5);
      if (c.subtype === 'defhorse') return mk(player.equips.defhorse ? 1 : 5);
      return mk(2);
    }

    // --- basic ---
    if (name === 'tao') {
      // heal in play phase only if wounded and not hoarding for emergencies
      if (player.isWounded()) {
        var deficit = player.lostHp();
        var extraPeaches = SGS.util.count(player.hand, function (x) { return x.name === 'tao'; });
        if (player.hp <= 1) return mk(3);           // top up when very low
        if (deficit >= 2 && extraPeaches >= 2) return mk(2.5);
        return mk(0); // hold peach for dying
      }
      return mk(0);
    }
    if (name === 'jiu') {
      // use wine only if we can then land a sha on a foe this turn
      if (!player.flags.drunk && SGS.canUseShaNow(game, player)) {
        var foesInRange = game.alivePlayers().filter(function (t) { return t !== player && game.inAttackRange(player, t) && ai.isFoe(game, player, t); });
        if (foesInRange.length && SGS.util.count(player.hand, function (x) { return x.name === 'sha'; }) > 0) return mk(4.2);
      }
      return mk(0);
    }
    if (name === 'sha') {
      var target = ai.bestFoeAmong(game, player, o.candidates);
      if (!target) return mk(0);
      var eff = ai.shaEffectiveness(game, player, target, o.card);
      if (eff <= 0) return mk(0);
      var score = 5 * eff;
      if (target.hp === 1 && countResp(game, target, 'shan') === 0) score += 8; // likely kill
      if (target.role === 'lord' && (player.role === 'rebel' || player.role === 'traitor')) score += 2;
      // multi-target 方天画戟
      var targets = [target];
      if (o.maxTargets > 1) {
        var extra = o.candidates.filter(function (t) { return t !== target && ai.isFoe(game, player, t); })
          .sort(function (a, b) { return ai.rankFoe(game, player, b) - ai.rankFoe(game, player, a); });
        for (var z = 0; z < extra.length && targets.length < o.maxTargets; z++) targets.push(extra[z]);
      }
      return mk(score, targets);
    }

    // --- tricks ---
    if (name === 'wuzhongshengyou') return mk(7);
    if (name === 'guohechaiqiao') {
      var gt = ai.bestFoeAmong(game, player, o.candidates);
      if (!gt) return mk(0);
      var s = 4 + (gt.equips.weapon ? 1 : 0) + (gt.equips.armor ? 1 : 0);
      return mk(s, [gt]);
    }
    if (name === 'shunshouqianyang') {
      var st = ai.bestFoeAmong(game, player, o.candidates);
      if (!st) return mk(0);
      return mk(4.5, [st]);
    }
    if (name === 'juedou') {
      var dt = ai.bestFoeAmong(game, player, o.candidates);
      if (!dt) return mk(0);
      var myShas = countResp(game, player, 'sha');
      var theirShas = countResp(game, dt, 'sha');
      var s2 = 3 + (dt.hp === 1 ? 6 : 0);
      if (myShas > theirShas) s2 += 2;
      if (myShas === 0) s2 -= 2;
      return mk(s2, [dt]);
    }
    if (name === 'huogong') {
      var ht = ai.bestFoeAmong(game, player, o.candidates);
      if (!ht) return mk(0);
      // need a same-suit card to follow up
      var shownSuit = ht.hand.length > 0 ? ht.hand[0].suit : null;
      var canFollow = shownSuit && player.hand.some(function (c) { return c.suit === shownSuit; });
      if (!canFollow) return mk(0.5, [ht]);
      return mk(3.5, [ht]);
    }
    if (name === 'lebusishu') {
      var lt = ai.bestFoeAmong(game, player, o.candidates);
      if (!lt) return mk(0);
      var s3 = 4 + (lt.hand.length >= 3 ? 2 : 0);
      if (lt.role === 'lord' && player.role === 'rebel') s3 += 2;
      return mk(s3, [lt]);
    }
    if (name === 'bingliangcunduan') {
      var bt = ai.bestFoeAmong(game, player, o.candidates);
      if (!bt) return mk(0);
      return mk(3.5, [bt]);
    }
    if (name === 'shandian') {
      // placing on self is risky; only when many enemies and we are healthy
      return mk(player.hp >= 3 ? 1.2 : 0);
    }
    if (name === 'tiesuolianhuan') {
      // reforge: turn a usually low-value card into a new draw
      if (o.reforge) return mk(2.5, [], { reforge: true });
      // chain two foes (for future AoE) — modest
      var foes = o.candidates.filter(function (t) { return ai.isFoe(game, player, t); });
      if (foes.length >= 1) return mk(1.5, foes.slice(0, Math.min(2, foes.length)));
      return mk(0);
    }
    if (name === 'jiedaosharen') {
      // pick an armed foe (or armed ally) whose range hits another foe
      for (var a = 0; a < o.candidates.length; a++) {
        var holder = o.candidates[a];
        var victims = game.alivePlayers().filter(function (v) { return v !== holder && game.inAttackRange(holder, v) && ai.isFoe(game, player, v); });
        if (victims.length) {
          victims.sort(function (x, y) { return ai.rankFoe(game, player, y) - ai.rankFoe(game, player, x); });
          return mk(4, [holder], { secondTarget: victims[0] });
        }
      }
      return mk(0);
    }
    if (name === 'nanmanruqin' || name === 'wanjianqifa') {
      var need = name === 'nanmanruqin' ? 'sha' : 'shan';
      var others = game.alivePlayers().filter(function (t) { return t !== player; });
      var net = 0, allyDeath = false;
      for (var m = 0; m < others.length; m++) {
        var t2 = others[m];
        var canBlock = countResp(game, t2, need) > 0;
        if (ai.isFoe(game, player, t2)) { if (!canBlock) net += 1.4; else net += 0.2; }
        else { if (!canBlock) { net -= 1.2; if (t2.hp <= 1) allyDeath = true; } }
      }
      if (allyDeath) return mk(0);
      return mk(net > 0 ? 3 + net : 0);
    }
    if (name === 'taoyuanjieyi') {
      var allies = ai.allies(game, player).concat([player]);
      var woundedAllies = allies.filter(function (p) { return p.isWounded(); }).length;
      var woundedFoes = ai.foes(game, player).filter(function (p) { return p.isWounded(); }).length;
      if (player.hp <= 1) return mk(4);
      if (woundedAllies > woundedFoes) return mk(2 + woundedAllies);
      return mk(0);
    }
    if (name === 'wugufengdeng') {
      // everyone draws; fine if we/allies benefit more or it's neutral card advantage
      return mk(3);
    }
    return { score: 0, action: { end: true } };
  };

  ai.scoreSkillOption = function (game, player, o) {
    var mk = function (score, targets, extra) {
      var action = { kind: 'skill', skill: o.skill, targets: targets || [] };
      if (extra) for (var k in extra) action[k] = extra[k];
      return { score: score, action: action };
    };
    var sk = player.getSkill(o.skill);
    if (sk && sk.aiPlay) { return sk.aiPlay(game, player, o, mk, ai) || { score: 0, action: { end: true } }; }
    return { score: 0, action: { end: true } };
  };

  /* -------- respond to 杀/闪/杀(决斗)/etc -------- */
  ai.decideRespond = function (game, player, req) {
    var options = req.options || [];
    if (!options.length) return null;
    var need = req.need;

    if (need === 'shan') {
      // dodge decisions
      var lethal = player.hp <= 1;
      var shanCount = options.length;
      var dodge = lethal || player.hp <= 2 || shanCount >= 3;
      // if attacker is a strong foe finishing us, always dodge
      if (!dodge && req.source && ai.isFoe(game, player, req.source)) {
        if (player.hp <= 3 && shanCount >= 2) dodge = true;
      }
      if (!dodge) return null;
      return { option: preferShan(options) };
    }
    if (need === 'sha') {
      var trig = req.trigger;
      if (trig === 'juedou') return { option: options[0] };          // fight to win
      if (trig === 'nanman') {
        var spare = options.length >= 2;
        if (player.hp <= 2 || spare) return { option: options[0] };
        return null;
      }
      if (trig === 'qinglong' || trig === 'jiedao') return null;      // don't over-extend
      // default: use if we won't need it more urgently
      if (player.hp <= 2) return { option: options[0] };
      return options.length >= 2 ? { option: options[0] } : null;
    }
    if (need === 'wuxie') {
      return ai.decideWuxie(game, player, req);
    }
    // generic
    return { option: options[0] };
  };

  function preferShan(options) {
    // prefer a real 闪 over bagua judgment (deterministic), bagua last
    for (var i = 0; i < options.length; i++) if (options[i].card && options[i].card.name === 'shan') return options[i];
    for (var j = 0; j < options.length; j++) if (options[j].card) return options[j];
    return options[0];
  }

  /* -------- dying rescue -------- */
  ai.decideRescue = function (game, player, req) {
    var dying = req.dying;
    var options = req.options || SGS.gatherResponses(game, player, req.canWine && dying === player ? 'peachOrWine' : 'tao', {});
    if (!options.length) return null;
    // save self always
    if (dying === player) return { option: options[0], card: options[0].card };
    // traitor: save lord if rebels are still alive, otherwise let him die
    if (player.role === 'traitor') {
      var rebelsAlive = game.alivePlayers().some(function (p) { return p.role === 'rebel'; });
      if (rebelsAlive && dying.role === 'lord') return { option: options[0], card: options[0].card };
      return null;
    }
    // save allies; never save foes
    if (ai.isAlly(game, player, dying)) {
      // don't waste last peach if dying is a minor ally and I'm hurt
      return { option: options[0], card: options[0].card };
    }
    return null;
  };

  /* -------- nullification (parity aware) -------- */
  ai.decideWuxie = function (game, player, req) {
    var options = req.options && req.options.length ? req.options : SGS.gatherResponses(game, player, 'wuxie', {});
    if (!options.length) return null;
    var card = req.card, target = req.aboutTarget;
    var harmful = req.harmful;
    var count = req.count || 0;
    // Only engage the chain for harmful tricks (protect self/ally; counter foe's 无懈).
    if (!harmful) {
      // rarely deny a beneficial trick — only foes vs the lord bother
      if (target && ai.isFoe(game, player, target) && target.role === 'lord' && count === 0) return { option: options[0] };
      return null;
    }
    // decide whether this player WANTS the trick applied
    var wantApplied;
    if (!target) { wantApplied = false; }
    else if (player.role === 'traitor') {
      var rebelsAlive = game.alivePlayers().some(function (p) { return p.role === 'rebel'; });
      if (rebelsAlive && target.role === 'lord') wantApplied = false; // protect lord from rebels
      else wantApplied = ai.isFoe(game, player, target); // otherwise side with foes of target
    }
    else if (player === target || ai.isAlly(game, player, target)) wantApplied = false; // harmful -> allies want it negated
    else wantApplied = true;                                                            // foes of target want it applied
    var desiredNegated = !wantApplied;
    var pendingNegated = (count % 2 === 1);   // current outcome if nobody else acts
    if (pendingNegated !== desiredNegated) return { option: options[0] };
    return null;
  };

  /* -------- discard phase -------- */
  ai.decideDiscard = function (game, player, req) {
    var count = req.count || 0;
    return { cards: ai.pickDiscards(game, player, count) };
  };

  /* -------- choose N cards from a set -------- */
  ai.decideChooseCards = function (game, player, req) {
    var from = (req.from || []).slice();
    var min = req.min || 0, max = req.max || from.length;
    // choose the least valuable cards to satisfy min (typical: discarding/paying a cost)
    from.sort(function (a, b) { return ai.cardValue(a) - ai.cardValue(b); });
    var n = Math.min(Math.max(min, 0), from.length);
    // for cost payments we generally want the minimum required
    return { cards: from.slice(0, Math.max(n, min)) };
  };

  /* -------- choose a card in a target's zones (steal / dismantle) -------- */
  ai.decideZoneCard = function (game, player, req) {
    var opts = req.options || [];
    var target = req.target;
    var stealing = /获得|顺手/.test(req.reason || '');
    // priority: remove/steal weapon > offhorse > armor > defhorse > judge(harmful to ally) > hand
    function rank(o) {
      if (o.area === 'judge') {
        // removing a judge card: good if it helps (e.g. dismantle ally's lebusishu). Neutral otherwise.
        return 2;
      }
      if (o.card && o.card.type === 'equip') {
        var st = o.card.subtype;
        return st === 'weapon' ? 6 : st === 'offhorse' ? 5 : st === 'armor' ? 4.5 : 3.5;
      }
      if (o.area === 'hand') return stealing ? 4 : 3; // hidden card
      return 1;
    }
    var sorted = opts.slice().sort(function (a, b) { return rank(b) - rank(a); });
    return { option: sorted[0] };
  };

  /* -------- choose players -------- */
  ai.decideChoosePlayers = function (game, player, req) {
    var cands = (req.candidates || []).slice();
    var min = req.min || 1, max = req.max || 1;
    var beneficial = req.beneficial;
    var picked;
    if (beneficial) {
      cands.sort(function (a, b) { return (ai.isAlly(game, player, b) - ai.isAlly(game, player, a)) || (a.hp - b.hp); });
    } else {
      cands.sort(function (a, b) { return ai.rankFoe(game, player, b) - ai.rankFoe(game, player, a); });
      cands = cands.filter(function (c) { return ai.isFoe(game, player, c); }).concat(cands.filter(function (c) { return !ai.isFoe(game, player, c); }));
    }
    picked = cands.slice(0, Math.max(min, Math.min(max, 1)));
    return { players: picked };
  };

  /* -------- choose an option key -------- */
  ai.decideChooseOption = function (game, player, req) {
    var choices = req.choices || [];
    if (!choices.length) return { key: null };
    // 五谷丰登 / generic: pick the most valuable labelled card if labels look like cards
    // default: first
    if (req.context === 'wugu' || /五谷|选取/.test(req.reason || '')) {
      // choices labelled with card names; pick highest value by actual card value if available
      var best = 0, bi = 0;
      for (var i = 0; i < choices.length; i++) {
        var c = choices[i].card;
        var v = c ? ai.cardValue(c) : labelValue(choices[i].label);
        if (v > best) { best = v; bi = i; }
      }
      return { key: choices[bi].key };
    }
    return { key: choices[0].key };
  };

  function labelValue(label) {
    if (!label) return 1;
    if (/桃/.test(label)) return 9;
    if (/杀/.test(label)) return 6;
    if (/闪/.test(label)) return 5;
    if (/无中/.test(label)) return 7;
    if (/诸葛连弩/.test(label)) return 8;
    if (/装备|剑|刀|矛|弩|弓|甲|盾|马|兔|影/.test(label)) return 5;
    return 4;
  }

  /* -------- yes/no confirm (weapon skills, etc.) -------- */
  ai.decideConfirm = function (game, player, req) {
    var ctx = req.context;
    if (ctx === 'guanshifu') return { yes: true };   // secure damage
    if (ctx === 'qilin') return { yes: true };        // strip a horse
    if (ctx === 'hanbing') return { yes: false };     // usually prefer damage
    if (ctx === 'huogong') return { yes: true };
    if (ctx === 'luoyi') {
      var foeInRange = game.alivePlayers().some(function (t) { return t !== player && game.inAttackRange(player, t) && ai.isFoe(game, player, t); });
      var hasSha = SGS.util.count(player.hand, function (c) { return c.name === 'sha'; }) > 0;
      return { yes: (foeInRange && hasSha) || SGS.util.count(player.hand, function (c) { return c.name === 'juedou'; }) > 0 };
    }
    if (ctx === 'tuxi') {
      var foesWithCards = game.alivePlayers().filter(function (t) { return t !== player && t.hand.length > 0 && ai.isFoe(game, player, t); });
      return { yes: foesWithCards.length >= 1 };
    }
    if (ctx === 'liuli') return { yes: player.hp <= 2 };
    if (ctx === 'guicai') return { yes: false };      // conservative: keep cards
    return { yes: true };
  };

  /* ============================================================
   * Agent object
   * ============================================================ */
  SGS.AIAgent = {
    decide: function (game, player, req) { return ai.decide(game, player, req); }
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
