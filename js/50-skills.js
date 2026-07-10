/* ==========================================================================
 * 三国杀 · 技能 (skills registry)
 *   Each skill: { name, cn, desc, ...hooks }
 *   Hooks the engine looks for:
 *     triggers[event](game, me, ev)          timing triggers
 *     viewAsPlay(game, me) -> [playOptions]   转化技 (play phase)
 *     viewAsRespond(game, me, need, ctx) -> [ {card,label} ]
 *     active(game, me) -> {candidates,minTargets,maxTargets} | null   主动技 option
 *     onActivate(game, me, action)            执行主动技
 *     aiPlay(game, me, option, mk, ai) -> {score, action}
 *     distance(game, me, ev) / range(game, me, ev)
 *     shaLimit / handLimit(game, me, ev)
 *     preventTarget(game, me, ev)
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var U = SGS.util;

  function cheapest(cards) {
    if (!cards.length) return null;
    var v = SGS.ai ? SGS.ai.cardValue : function () { return 1; };
    return cards.slice().sort(function (a, b) { return v(a) - v(b); })[0];
  }
  function handAndEquip(player) {
    var cards = player.hand.slice();
    for (var k in player.equips) if (player.equips[k]) cards.push(player.equips[k]);
    return cards;
  }
  function shaOptionFrom(game, player, virtual, key, cn, pool) {
    if (!SGS.canUseShaNow(game, player)) return null;
    var cands = SGS.shaTargets(game, player);
    if (!cands.length) return null;
    var maxT = 1;
    // 方天画戟: last hand card (including view-as) can hit up to 3
    if (player.equips.weapon && player.equips.weapon.name === 'fangtianhuaji' && player.hand.length === 1) maxT = Math.min(3, cands.length);
    return {
      key: key, kind: 'card', card: virtual, cn: cn, name: 'sha', category: 'basic',
      candidates: cands, minTargets: 1, maxTargets: maxT, needTargets: true, viewAs: key, pool: pool || []
    };
  }

  var S = SGS.SKILLS = {

    /* ==================== 魏 ==================== */
    jianxiong: {
      name: 'jianxiong', cn: '奸雄',
      desc: '当你受到伤害后，你可以获得对你造成伤害的牌。',
      triggers: {
        afterDamage: async function (game, me, ev) {
          if (ev.target !== me || !ev.card) return;
          var reals = ev.card.virtual ? ev.card.subcards.slice() : [ev.card];
          var got = reals.filter(function (c) { return game.discard.indexOf(c) >= 0; });
          if (!got.length) return;
          for (var i = 0; i < got.length; i++) { U.remove(game.discard, got[i]); me.hand.push(got[i]); }
          game.msg(me.name + ' 发动【奸雄】，获得造成伤害的牌。', { kind: 'skill', player: me.id });
        }
      }
    },
    hujia: { name: 'hujia', cn: '护驾', desc: '主公技：你需要使用/打出“闪”时，魏势力角色可替你打出。', lord: true },

    fankui: {
      name: 'fankui', cn: '反馈',
      desc: '当你受到伤害后，你可以获得伤害来源的一张牌。',
      triggers: {
        afterDamage: async function (game, me, ev) {
          var src = ev.source;
          if (ev.target !== me || !src || !src.alive || src === me) return;
          if (src.hand.length + src.equipCount() === 0) return;
          var card = await SGS.askTargetCard(game, me, src, ['hand', 'equip'], '反馈：获得伤害来源一张牌');
          if (card) {
            await game.gainCards(me, [card], { from: src });
            game.msg(me.name + ' 发动【反馈】。', { kind: 'skill', player: me.id });
          }
        }
      }
    },
    guicai: {
      name: 'guicai', cn: '鬼才',
      desc: '当一名角色的判定牌生效前，你可以打出一张手牌代替之。',
      triggers: {
        judgeCard: async function (game, me, ev) {
          if (me.hand.length === 0 || ev._guicaiDone) return;
          // only bother if AI thinks it matters (mandatory ask for human)
          var res = await game.ask(me, { type: 'confirm', context: 'guicai', reason: '鬼才：是否打出一张手牌替换 ' + ev.player.name + ' 的判定牌 ' + SGS.cardLabel(ev.card) + '？', judge: ev.card });
          if (res && res.yes) {
            var pick = await game.ask(me, { type: 'chooseCards', from: me.hand.slice(), min: 1, max: 1, reason: '选择替换判定的手牌' });
            var c = pick && pick.cards && pick.cards[0];
            if (c) {
              var info = game.detachCard(c);
              ev.forceCard = c;
              ev._guicaiDone = true;
              game.msg(me.name + ' 发动【鬼才】改判。', { kind: 'skill', player: me.id });
              if (info && info.owner) await game.emitCardLosses([{ owner: info.owner, card: c, area: info.area, slot: info.slot }]);
            }
          }
        }
      }
    },
    ganglie: {
      name: 'ganglie', cn: '刚烈',
      desc: '当你受到伤害后，你可以判定，若非红桃，伤害来源须弃两张手牌或受到你造成的1点伤害。',
      triggers: {
        afterDamage: async function (game, me, ev) {
          var src = ev.source;
          if (ev.target !== me || !src || !src.alive) return;
          var jc = await game.judge(me, { reason: '刚烈' });
          if (!jc || jc.suit === 'heart') return;
          if (src.hand.length >= 2) {
            var choice = await game.ask(src, { type: 'chooseOption', reason: '刚烈：弃两张手牌，或受到1点伤害', choices: [{ key: 'discard', label: '弃两张手牌' }, { key: 'damage', label: '受到1点伤害' }] });
            if (choice && choice.key === 'discard') {
              var pick = await game.ask(src, { type: 'chooseCards', from: src.hand.slice(), min: 2, max: 2, reason: '刚烈：弃置两张手牌' });
              var d = (pick && pick.cards) ? pick.cards : SGS.ai.pickDiscards(game, src, 2);
              await game.discardCards(src, d, { reason: 'ganglie' });
              return;
            }
          }
          await game.damage({ source: me, target: src, amount: 1, element: 'normal', reason: 'ganglie' });
        }
      }
    },
    tuxi: {
      name: 'tuxi', cn: '突袭',
      desc: '摸牌阶段，你可以放弃摸牌，改为获得至多两名其他角色各一张手牌。',
      triggers: {
        drawPhaseNum: async function (game, me, ev) {
          var cands = game.alivePlayers().filter(function (p) { return p !== me && p.hand.length > 0; });
          if (!cands.length) return;
          var res = await game.ask(me, { type: 'confirm', context: 'tuxi', reason: '突袭：放弃摸牌，改为获得至多两名角色各一张手牌？' });
          if (!res || !res.yes) return;
          var pick = await game.ask(me, { type: 'choosePlayers', candidates: cands, min: 1, max: 2, reason: '突袭：选择目标' });
          var ps = (pick && pick.players) ? pick.players.slice(0, 2) : [cands[0]];
          ev.num = 0; ev.skip = true;
          for (var i = 0; i < ps.length; i++) {
            var t = ps[i];
            if (t.hand.length === 0) continue;
            var c = t.hand[game.rng.int(t.hand.length)];
            await game.gainCards(me, [c], { from: t });
          }
          game.msg(me.name + ' 发动【突袭】。', { kind: 'skill', player: me.id });
        }
      }
    },
    luoyi: {
      name: 'luoyi', cn: '裸衣',
      desc: '摸牌阶段，你可以少摸一张牌，本回合你的“杀”与“决斗”造成的伤害+1。',
      triggers: {
        drawPhaseNum: async function (game, me, ev) {
          if (ev.player !== me || ev.num <= 0) return;
          var res = await game.ask(me, { type: 'confirm', context: 'luoyi', reason: '裸衣：少摸一张牌，本回合杀/决斗伤害+1？' });
          if (res && res.yes) { ev.num -= 1; me.flags.luoyi = true; game.msg(me.name + ' 发动【裸衣】。', { kind: 'skill', player: me.id }); }
        },
        damageCaused: async function (game, me, ev) {
          if (ev.source === me && me.flags.luoyi && (ev.reason === 'sha' || ev.reason === 'juedou')) ev.amount += 1;
        }
      }
    },
    tiandu: {
      name: 'tiandu', cn: '天妒',
      desc: '当你的判定牌生效后，你可以获得之。',
      triggers: {
        judgeResult: async function (game, me, ev) {
          if (ev.player !== me) return;
          ev.keptBy = me;
          await game.gainCards(me, [ev.card], { log: false });
          game.msg(me.name + ' 发动【天妒】获得判定牌 ' + SGS.cardLabel(ev.card), { kind: 'skill', player: me.id });
        }
      }
    },
    yiji: {
      name: 'yiji', cn: '遗计',
      desc: '当你受到1点伤害后，你可以摸两张牌。',
      triggers: {
        afterDamage: async function (game, me, ev) {
          if (ev.target !== me) return;
          var times = ev.amount || 1;
          for (var i = 0; i < times; i++) await game.drawCards(me, 2, { reason: 'yiji' });
          game.msg(me.name + ' 发动【遗计】。', { kind: 'skill', player: me.id });
        }
      }
    },
    luoshen: {
      name: 'luoshen', cn: '洛神',
      desc: '回合开始时，你可以反复判定，直到出现红色，获得所有黑色判定牌。',
      triggers: {
        turnStart: async function (game, me, ev) {
          if (ev.player !== me) return;
          var gained = 0, guard = 0;
          while (guard++ < 200) {
            var use = await game.ask(me, { type: 'confirm', context: 'luoshen', reason: '是否发动【洛神】进行判定？' });
            if (!use || !use.yes) break;
            var jc = await game.judge(me, { reason: '洛神' });
            if (!jc) break;
            if (SGS.isBlack(jc.suit)) {
              U.remove(game.discard, jc);
              if (me.hand.indexOf(jc) < 0) me.hand.push(jc);
              gained++;
            } else break;
          }
          if (guard >= 200 && typeof console !== 'undefined') console.warn('[SGS] luoshen guard hit (200 judgments)');
          if (gained) game.msg(me.name + ' 发动【洛神】获得 ' + gained + ' 张牌。', { kind: 'skill', player: me.id });
        }
      }
    },
    qingguo: {
      name: 'qingguo', cn: '倾国',
      desc: '你可以将一张黑色手牌当“闪”使用或打出。',
      viewAsRespond: function (game, me, need) {
        if (need !== 'shan') return [];
        var blacks = me.hand.filter(function (c) { return SGS.isBlack(c.suit); });
        var c = cheapest(blacks);
        if (!c) return [];
        return [{ card: SGS.virtualCard('shan', { subcards: [c], suit: c.suit, rank: c.rank }), label: '倾国（' + SGS.cardLabel(c) + '当闪）' }];
      }
    },
    shensu: {
      name: 'shensu', cn: '神速',
      desc: '出牌阶段，你可以弃置一张装备牌，视为对一名角色使用一张无距离限制的“杀”。',
      active: function (game, me) {
        if (me.flags.shensu || me.equipCount() === 0) return null;
        var cands = game.alivePlayers().filter(function (p) { return p !== me && SGS.canTarget(game, me, p, 'sha'); });
        if (!cands.length) return null;
        return { candidates: cands, minTargets: 1, maxTargets: 1, cost: { type: 'equip', min: 1, max: 1 } };
      },
      onActivate: async function (game, me, action) {
        var t = action.targets && action.targets[0];
        if (!t) return;
        me.flags.shensu = true;
        var toss = action.costEquip;
        if (!toss) {
          var eq = [];
          for (var k in me.equips) if (me.equips[k]) eq.push(me.equips[k]);
          var order = ['defhorse', 'offhorse', 'armor', 'weapon'];
          eq.sort(function (a, b) { return order.indexOf(a.subtype) - order.indexOf(b.subtype); });
          toss = eq[0];
        }
        if (!toss) return;
        await game.discardCards(me, [toss], { reason: 'shensu' });
        game.msg(me.name + ' 发动【神速】。', { kind: 'skill', player: me.id });
        await SGS.doSha(game, me, [t], SGS.virtualCard('sha', { suit: 'none' }));
      },
      aiPlay: function (game, me, o, mk, ai) {
        var foe = ai.bestFoeAmong(game, me, o.candidates);
        if (!foe) return null;
        var eq = [];
        for (var k in me.equips) if (me.equips[k]) eq.push(me.equips[k]);
        var order = ['defhorse', 'offhorse', 'armor', 'weapon'];
        eq.sort(function (a, b) { return order.indexOf(a.subtype) - order.indexOf(b.subtype); });
        var toss = eq[0];
        if (!toss) return null;
        var score = (toss.subtype === 'defhorse' || toss.subtype === 'offhorse') ? (foe.hp === 1 ? 6 : 2.5) : (foe.hp === 1 ? 4 : 0.5);
        return mk(score, [foe], { costEquip: toss });
      }
    },

    /* ==================== 蜀 ==================== */
    rende: {
      name: 'rende', cn: '仁德',
      desc: '出牌阶段，你可以将手牌交给其他角色；每回合累计给出两张后，回复1点体力。',
      active: function (game, me) {
        if (me.hand.length === 0) return null;
        var cands = game.alivePlayers().filter(function (p) { return p !== me; });
        if (!cands.length) return null;
        return { candidates: cands, minTargets: 1, maxTargets: 1 };
      },
      onActivate: async function (game, me, action) {
        var t = action.targets && action.targets[0];
        if (!t) return;
        var give = action.giveCards || SGS.ai.pickDiscards(game, me, Math.min(2, me.hand.length));
        give = give.filter(function (c) { return me.hand.indexOf(c) >= 0; });
        await game.gainCards(t, give, { from: me, log: false });
        me.flags.rende = (me.flags.rende || 0) + give.length;
        game.msg(me.name + ' 发动【仁德】，将 ' + give.length + ' 张牌交给 ' + t.name, { kind: 'skill', player: me.id });
        if (me.flags.rende >= 2 && !me.flags.rendeHealed) { me.flags.rendeHealed = true; await game.recover(me, 1, { reason: 'rende' }); }
      },
      aiPlay: function (game, me, o, mk, ai) {
        if (!me.isWounded()) return null;
        var spare = me.hand.filter(function (c) { return ai.cardValue(c) <= 4; });
        if (spare.length < 2) return null;
        var allies = ai.allies(game, me);
        if (!allies.length) return null;
        allies.sort(function (a, b) { return a.hand.length - b.hand.length; });
        return mk(3.2, [allies[0]], { giveCards: spare.slice(0, 2) });
      }
    },
    jijiang: { name: 'jijiang', cn: '激将', desc: '主公技：你需要使用/打出“杀”时，蜀势力角色可替你打出。', lord: true },
    wusheng: {
      name: 'wusheng', cn: '武圣',
      desc: '你可以将一张红色牌当“杀”使用或打出。',
      viewAsPlay: function (game, me) {
        var reds = handAndEquip(me).filter(function (c) { return SGS.isRed(c.suit); });
        var c = cheapest(reds);
        if (!c) return [];
        var v = SGS.virtualCard('sha', { subcards: [c], suit: c.suit, rank: c.rank });
        var o = shaOptionFrom(game, me, v, 'wusheng', '武圣杀', reds);
        return o ? [o] : [];
      },
      viewAsRespond: function (game, me, need) {
        if (need !== 'sha') return [];
        var reds = handAndEquip(me).filter(function (c) { return SGS.isRed(c.suit); });
        var c = cheapest(reds);
        if (!c) return [];
        return [{ card: SGS.virtualCard('sha', { subcards: [c], suit: c.suit, rank: c.rank }), label: '武圣（' + SGS.cardLabel(c) + '当杀）' }];
      }
    },
    paoxiao: {
      name: 'paoxiao', cn: '咆哮', desc: '出牌阶段，你使用“杀”无次数限制。',
      shaLimit: function (game, me, ev) { ev.limit = Infinity; }
    },
    guanxing: {
      name: 'guanxing', cn: '观星',
      desc: '回合开始时，观看牌堆顶若干张牌并调整其放置于牌堆顶/底的顺序。',
      triggers: {
        turnStart: async function (game, me, ev) {
          if (ev.player !== me) return;
          if (game.deck.length < 2) game.reshuffle();
          var k = Math.min(game.aliveCount(), 5, game.deck.length);
          if (k <= 0) return;
          var top = game.deck.slice(0, k);
          var res;
          if (me.isHuman) {
            res = await game.ask(me, { type: 'guanxing', cards: top.slice(), reason: '观星：选择要“置底”的牌，其余留在牌堆顶' });
          } else {
            res = SGS.ai.guanxing(game, me, top);
          }
          var byId = {}; top.forEach(function (c) { byId[c.id] = c; });
          var seen = {};
          function takeUnique(ids) {
            var cards = [];
            (ids || []).forEach(function (id) {
              if (byId[id] && !seen[id]) { seen[id] = 1; cards.push(byId[id]); }
            });
            return cards;
          }
          var newTop = takeUnique((res && res.topIds) || top.map(function (c) { return c.id; }));
          var newBottom = takeUnique((res && res.bottomIds) || []);
          top.forEach(function (c) { if (!seen[c.id]) newTop.push(c); });
          game.deck.splice(0, k);
          for (var i = newTop.length - 1; i >= 0; i--) game.deck.unshift(newTop[i]);
          for (var b = 0; b < newBottom.length; b++) game.deck.push(newBottom[b]);
          game.msg(me.name + ' 发动【观星】，整理了牌堆顶' + (newBottom.length ? ('（' + newBottom.length + ' 张置底）') : '') + '。', { kind: 'skill', player: me.id });
        }
      }
    },
    kongcheng: {
      name: 'kongcheng', cn: '空城', desc: '锁定技，若你没有手牌，你不能成为“杀”与“决斗”的目标。',
      preventTarget: function (game, me, ev) {
        if (me.hand.length === 0 && (ev.cardName === 'sha' || ev.cardName === 'juedou')) ev.prevent = true;
      }
    },
    longdan: {
      name: 'longdan', cn: '龙胆', desc: '你可以将“杀”当“闪”、“闪”当“杀”使用或打出。',
      viewAsPlay: function (game, me) {
        var shans = me.hand.filter(function (c) { return c.name === 'shan'; });
        if (!shans.length) return [];
        var c = shans[0];
        var v = SGS.virtualCard('sha', { subcards: [c], suit: c.suit, rank: c.rank });
        var o = shaOptionFrom(game, me, v, 'longdan', '龙胆杀', shans);
        return o ? [o] : [];
      },
      viewAsRespond: function (game, me, need) {
        if (need === 'shan') {
          var shas = me.hand.filter(function (c) { return c.name === 'sha'; });
          if (!shas.length) return [];
          var c = shas[0];
          return [{ card: SGS.virtualCard('shan', { subcards: [c], suit: c.suit, rank: c.rank }), label: '龙胆（杀当闪）' }];
        }
        if (need === 'sha') {
          var shans = me.hand.filter(function (c) { return c.name === 'shan'; });
          if (!shans.length) return [];
          var c2 = shans[0];
          return [{ card: SGS.virtualCard('sha', { subcards: [c2], suit: c2.suit, rank: c2.rank }), label: '龙胆（闪当杀）' }];
        }
        return [];
      }
    },
    mashu: {
      name: 'mashu', cn: '马术', desc: '锁定技，你计算与其他角色的距离-1。',
      distance: function (game, me, ev) { if (ev.from === me) ev.dist -= 1; }
    },
    tieqi: {
      name: 'tieqi', cn: '铁骑', desc: '当你使用“杀”指定目标后，你可以判定，若为红色，此“杀”不可被“闪”响应。',
      triggers: {
        shaHit: async function (game, me, ev) {
          if (ev.source !== me) return;
          var jc = await game.judge(me, { reason: '铁骑' });
          if (jc && SGS.isRed(jc.suit)) { ev.undodgeable = true; game.msg(me.name + ' 铁骑判定红色，此“杀”不可被闪避。', { kind: 'skill', player: me.id }); }
        }
      }
    },
    jizhi: {
      name: 'jizhi', cn: '集智', desc: '当你使用非延时锦囊牌时，你可以摸一张牌。',
      triggers: {
        afterUseTrick: async function (game, me, ev) {
          if (ev.source !== me) return;
          if (ev.card && ev.card.subtype === 'delay') return;
          await game.drawCards(me, 1, { reason: 'jizhi' });
          game.msg(me.name + ' 发动【集智】摸一张牌。', { kind: 'skill', player: me.id });
        }
      }
    },
    qicai: {
      name: 'qicai', cn: '奇才', desc: '锁定技，你使用锦囊牌无距离限制。',
      distance: function (game, me, ev) {
        // 顺手牵羊/兵粮寸断的距离判定在 SGS.trickDistanceOk 中统一处理
      }
    },

    /* ==================== 吴 ==================== */
    zhiheng: {
      name: 'zhiheng', cn: '制衡', desc: '出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。',
      active: function (game, me) {
        if (me.flags.zhiheng) return null;
        if (me.hand.length + me.equipCount() === 0) return null;
        return { candidates: [], minTargets: 0, maxTargets: 0 };
      },
      onActivate: async function (game, me, action) {
        var toss = action.zhihengCards;
        if (!toss || !toss.length) toss = handAndEquip(me).filter(function (c) { return SGS.ai.cardValue(c) <= 3; });
        if (!toss.length) return;
        me.flags.zhiheng = true;
        await game.discardCards(me, toss, { reason: 'zhiheng' });
        await game.drawCards(me, toss.length, { reason: 'zhiheng' });
        game.msg(me.name + ' 发动【制衡】，换了 ' + toss.length + ' 张牌。', { kind: 'skill', player: me.id });
      },
      aiPlay: function (game, me, o, mk, ai) {
        var junk = me.hand.filter(function (c) { return ai.cardValue(c) <= 3; });
        if (!junk.length) return null;
        return mk(3, [], { zhihengCards: junk });
      }
    },
    jiuyuan: { name: 'jiuyuan', cn: '救援', desc: '主公技：其他吴势力角色回合外对你使用“桃”时，回复量+1。', lord: true },
    qixi: {
      name: 'qixi', cn: '奇袭', desc: '你可以将一张黑色牌当“过河拆桥”使用。',
      viewAsPlay: function (game, me) {
        var blacks = handAndEquip(me).filter(function (c) { return SGS.isBlack(c.suit); });
        var c = cheapest(blacks);
        if (!c) return [];
        var cands = game.alivePlayers().filter(function (t) { return t !== me && t.allCards().length > 0; });
        if (!cands.length) return [];
        var v = SGS.virtualCard('guohechaiqiao', { subcards: [c], suit: c.suit, rank: c.rank });
        return [{ key: 'qixi', kind: 'card', card: v, cn: '奇袭', name: 'guohechaiqiao', category: 'trick', candidates: cands, minTargets: 1, maxTargets: 1, needTargets: true, viewAs: 'qixi', pool: blacks }];
      }
    },
    keji: {
      name: 'keji', cn: '克己', desc: '若你在出牌阶段未使用或打出“杀”，则跳过弃牌阶段。',
      triggers: {
        phaseStart: async function (game, me, ev) {
          if (ev.player !== me || ev.phase !== 'discard') return;
          if (!me.flags.shaThisTurn) { ev.skip.flag = true; game.msg(me.name + ' 发动【克己】跳过弃牌阶段。', { kind: 'skill', player: me.id }); }
        }
      }
    },
    kurou: {
      name: 'kurou', cn: '苦肉', desc: '出牌阶段，你可以失去1点体力，然后摸两张牌。',
      active: function (game, me) { return { candidates: [], minTargets: 0, maxTargets: 0 }; },
      onActivate: async function (game, me) {
        game.msg(me.name + ' 发动【苦肉】。', { kind: 'skill', player: me.id });
        await game.loseHp(me, 1, { reason: 'kurou' });
        if (me.alive) await game.drawCards(me, 2, { reason: 'kurou' });
      },
      aiPlay: function (game, me, o, mk) {
        if (me.hp >= 4) return mk(3.5, []);
        if (me.hp === 3) return mk(2.5, []);
        if (me.hp === 2 && me.hand.length <= 1) return mk(1.2, []);
        return null;
      }
    },
    yingzi: {
      name: 'yingzi', cn: '英姿', desc: '摸牌阶段，你可以多摸一张牌。',
      triggers: { drawPhaseNum: async function (game, me, ev) { if (ev.player === me) ev.num += 1; } }
    },
    fanjian: {
      name: 'fanjian', cn: '反间', desc: '出牌阶段限一次，令一名其他角色选择一种花色，其获得你一张手牌并展示，若花色不符则受到你1点伤害。',
      active: function (game, me) {
        if (me.flags.fanjian || me.hand.length === 0) return null;
        var cands = game.alivePlayers().filter(function (p) { return p !== me; });
        return cands.length ? { candidates: cands, minTargets: 1, maxTargets: 1 } : null;
      },
      onActivate: async function (game, me, action) {
        var t = action.targets && action.targets[0];
        if (!t || me.hand.length === 0) return;
        me.flags.fanjian = true;
        var suits = ['spade', 'heart', 'club', 'diamond'];
        var pick = await game.ask(t, { type: 'chooseOption', context: 'suit', reason: '反间：请选择一种花色', choices: suits.map(function (s) { return { key: s, label: SGS.SUITS[s].cn }; }) });
        var chosen = pick && pick.key ? pick.key : suits[game.rng.int(4)];
        var card = me.hand[game.rng.int(me.hand.length)];
        await game.gainCards(t, [card], { from: me, log: false });
        game.msg(me.name + ' 发动【反间】，' + t.name + ' 选择 ' + SGS.SUITS[chosen].cn + '，获得并展示 ' + SGS.cardLabel(card), { kind: 'skill', player: me.id });
        if (card.suit !== chosen) await game.damage({ source: me, target: t, amount: 1, element: 'normal', reason: 'fanjian' });
      },
      aiPlay: function (game, me, o, mk, ai) {
        var foe = ai.bestFoeAmong(game, me, o.candidates);
        if (!foe || me.hand.length === 0) return null;
        return mk(3, [foe]);
      }
    },
    guose: {
      name: 'guose', cn: '国色', desc: '你可以将一张方块牌当“乐不思蜀”使用。',
      viewAsPlay: function (game, me) {
        var dias = handAndEquip(me).filter(function (c) { return c.suit === 'diamond'; });
        var c = cheapest(dias);
        if (!c) return [];
        var cands = game.alivePlayers().filter(function (t) { return t !== me && !SGS.hasJudge(t, 'lebusishu') && SGS.canTarget(game, me, t, 'lebusishu'); });
        if (!cands.length) return [];
        var v = SGS.virtualCard('lebusishu', { subcards: [c], suit: c.suit, rank: c.rank });
        return [{ key: 'guose', kind: 'card', card: v, cn: '国色', name: 'lebusishu', category: 'trick', candidates: cands, minTargets: 1, maxTargets: 1, needTargets: true, viewAs: 'guose', pool: dias }];
      }
    },
    liuli: {
      name: 'liuli', cn: '流离', desc: '当你成为“杀”的目标时，你可以弃置一张牌，将该“杀”转移给你攻击范围内的另一名角色。',
      triggers: {
        shaHit: async function (game, me, ev) {
          if (ev.target !== me || ev.transferTo) return;
          if (me.hand.length + me.equipCount() === 0) return;
          var cands = game.alivePlayers().filter(function (p) { return p !== me && p !== ev.source && game.inAttackRange(me, p) && SGS.canTarget(game, ev.source, p, 'sha'); });
          if (!cands.length) return;
          var res = await game.ask(me, { type: 'confirm', context: 'liuli', reason: '流离：是否弃一张牌转移“杀”？' });
          if (!res || !res.yes) return;
          var pick = await game.ask(me, { type: 'chooseCards', from: handAndEquip(me), min: 1, max: 1, reason: '流离：弃置一张牌' });
          var c = pick && pick.cards && pick.cards[0];
          if (!c) return;
          await game.discardCards(me, [c], { reason: 'liuli' });
          var tp = await game.ask(me, { type: 'choosePlayers', candidates: cands, min: 1, max: 1, reason: '流离：转移给谁' });
          ev.transferTo = (tp && tp.players && tp.players[0]) ? tp.players[0] : cands[0];
        }
      }
    },
    qianxun: {
      name: 'qianxun', cn: '谦逊', desc: '锁定技，你不能成为“顺手牵羊”与“乐不思蜀”的目标。',
      preventTarget: function (game, me, ev) {
        if (ev.cardName === 'shunshouqianyang' || ev.cardName === 'lebusishu') ev.prevent = true;
      }
    },
    lianying: {
      name: 'lianying', cn: '连营', desc: '当你失去最后的手牌后，你可以摸一张牌。',
      triggers: {
        loseCardZone: async function (game, me, ev) {
          if (ev.player === me && ev.area === 'hand' && me.hand.length === 0) { await game.drawCards(me, 1, { reason: 'lianying' }); game.msg(me.name + ' 发动【连营】。', { kind: 'skill', player: me.id }); }
        }
      }
    },
    jieyin: {
      name: 'jieyin', cn: '结姻', desc: '出牌阶段限一次，你可以弃两张手牌，为自己和一名已受伤的男性角色各回复1点体力。',
      active: function (game, me) {
        if (me.flags.jieyin || me.hand.length < 2) return null;
        var cands = game.alivePlayers().filter(function (p) { return p.gender === 'male' && p.isWounded(); });
        return cands.length ? { candidates: cands, minTargets: 1, maxTargets: 1, cost: { type: 'discardHand', min: 2, max: 2 } } : null;
      },
      onActivate: async function (game, me, action) {
        var t = action.targets && action.targets[0];
        if (!t || me.hand.length < 2) return;
        me.flags.jieyin = true;
        var toss = action.costCards || SGS.ai.pickDiscards(game, me, 2);
        await game.discardCards(me, toss, { reason: 'jieyin' });
        await game.recover(me, 1, { reason: 'jieyin' });
        if (t !== me) await game.recover(t, 1, { reason: 'jieyin' });
        game.msg(me.name + ' 发动【结姻】。', { kind: 'skill', player: me.id });
      },
      aiPlay: function (game, me, o, mk, ai) {
        var males = o.candidates.filter(function (p) { return ai.isAlly(game, me, p) || p === me; });
        males.sort(function (a, b) { return a.hp - b.hp; });
        if (!males.length) return null;
        return mk(me.hp <= 2 ? 3.5 : 2, [males[0]], { costCards: ai.pickDiscards(game, me, 2) });
      }
    },
    xiaoji: {
      name: 'xiaoji', cn: '枭姬', desc: '当你失去一张装备区里的牌后，你可以摸两张牌。',
      triggers: {
        loseCardZone: async function (game, me, ev) {
          if (ev.player === me && ev.area === 'equip') { await game.drawCards(me, 2, { reason: 'xiaoji' }); game.msg(me.name + ' 发动【枭姬】。', { kind: 'skill', player: me.id }); }
        }
      }
    },

    /* ==================== 群 ==================== */
    jijiu: {
      name: 'jijiu', cn: '急救', desc: '你可以将一张红色牌当“桃”用于处于濒死状态的角色。',
      viewAsRespond: function (game, me, need) {
        if (need !== 'tao' && need !== 'peachOrWine') return [];
        var reds = handAndEquip(me).filter(function (c) { return SGS.isRed(c.suit); });
        var c = cheapest(reds);
        if (!c) return [];
        return [{ card: SGS.virtualCard('tao', { subcards: [c], suit: c.suit, rank: c.rank }), label: '急救（' + SGS.cardLabel(c) + '当桃）' }];
      }
    },
    qingnang: {
      name: 'qingnang', cn: '青囊', desc: '出牌阶段限一次，你可以弃一张手牌，令一名已受伤的角色回复1点体力。',
      active: function (game, me) {
        if (me.flags.qingnang || me.hand.length === 0) return null;
        var cands = game.alivePlayers().filter(function (p) { return p.isWounded(); });
        return cands.length ? { candidates: cands, minTargets: 1, maxTargets: 1, cost: { type: 'discardHand', min: 1, max: 1 } } : null;
      },
      onActivate: async function (game, me, action) {
        var t = action.targets && action.targets[0];
        if (!t || me.hand.length === 0) return;
        me.flags.qingnang = true;
        var toss = action.costCards || SGS.ai.pickDiscards(game, me, 1);
        await game.discardCards(me, toss, { reason: 'qingnang' });
        await game.recover(t, 1, { reason: 'qingnang' });
        game.msg(me.name + ' 发动【青囊】为 ' + t.name + ' 回复体力。', { kind: 'skill', player: me.id });
      },
      aiPlay: function (game, me, o, mk, ai) {
        var cands = o.candidates.filter(function (p) { return p === me || ai.isAlly(game, me, p); });
        cands.sort(function (a, b) { return a.hp - b.hp; });
        if (!cands.length) return null;
        var t = cands[0];
        return mk(t.hp <= 1 ? 4 : 2.2, [t], { costCards: ai.pickDiscards(game, me, 1) });
      }
    },
    wushuang: {
      name: 'wushuang', cn: '无双', desc: '锁定技，你使用“杀”须两张“闪”才能抵消；你“决斗”时对方每次须打出两张“杀”。',
      triggers: {
        shaHit: async function (game, me, ev) { if (ev.source === me) ev.needShan = 2; }
      }
    },
    lihun: {
      name: 'lihun', cn: '离间', desc: '出牌阶段限一次，你可以弃一张牌，令两名男性角色进行“决斗”。',
      active: function (game, me) {
        if (me.flags.lihun || me.hand.length === 0) return null;
        var males = game.alivePlayers().filter(function (p) { return p.gender === 'male'; });
        return males.length >= 2 ? { candidates: males, minTargets: 2, maxTargets: 2, cost: { type: 'discardHand', min: 1, max: 1 } } : null;
      },
      onActivate: async function (game, me, action) {
        var ts = action.targets || [];
        if (ts.length < 2 || me.hand.length === 0) return;
        me.flags.lihun = true;
        var toss = action.costCards || SGS.ai.pickDiscards(game, me, 1);
        await game.discardCards(me, toss, { reason: 'lihun' });
        game.msg(me.name + ' 发动【离间】，令 ' + ts[0].name + ' 与 ' + ts[1].name + ' 决斗。', { kind: 'skill', player: me.id });
        await SGS.TRICKS.juedou(game, ts[0], SGS.virtualCard('juedou', { suit: 'none' }), [ts[1]]);
      },
      aiPlay: function (game, me, o, mk, ai) {
        var foes = o.candidates.filter(function (p) { return ai.isFoe(game, me, p); });
        var others = o.candidates.filter(function (p) { return !ai.isFoe(game, me, p) && p !== me; });
        if (foes.length >= 2) { foes.sort(function (a, b) { return a.hp - b.hp; }); return mk(3, [foes[0], foes[1]], { costCards: ai.pickDiscards(game, me, 1) }); }
        if (foes.length === 1 && others.length) return mk(2.5, [others[0], foes[0]], { costCards: ai.pickDiscards(game, me, 1) });
        return null;
      }
    },
    biyue: {
      name: 'biyue', cn: '闭月', desc: '结束阶段，你可以摸一张牌。',
      triggers: {
        phaseEnd: async function (game, me, ev) {
          if (ev.player === me && ev.phase === 'end') { await game.drawCards(me, 1, { reason: 'biyue' }); game.msg(me.name + ' 发动【闭月】。', { kind: 'skill', player: me.id }); }
        }
      }
    },
    xiaoyong: {
      name: 'xiaoyong', cn: '骁勇', desc: '锁定技，当你受到伤害后，你摸一张牌（每受到1点伤害摸一张）。',
      triggers: {
        afterDamage: async function (game, me, ev) {
          if (ev.target !== me) return;
          var n = ev.amount || 1;
          for (var i = 0; i < n; i++) await game.drawCards(me, 1, { reason: 'xiaoyong' });
          game.msg(me.name + ' 发动【骁勇】摸 ' + n + ' 张牌。', { kind: 'skill', player: me.id });
        }
      }
    }
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
