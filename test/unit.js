'use strict';
/* Per-skill / per-card unit tests for the 三国杀 engine.
 * Loads the browser JS into a Node vm sandbox (same files the browser uses)
 * and asserts specific behaviours. Exits nonzero if any assertion fails. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const FILES = require('./_files');
const s = { console, Math, Date, JSON, setTimeout, clearTimeout, Promise, Infinity, parseInt, parseFloat };
s.window = s; s.globalThis = s; vm.createContext(s);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), s, { filename: f });
const SGS = s.SGS;

let PASS = 0, FAIL = 0; const fails = [];
function ok(name, cond) { if (cond) { PASS++; } else { FAIL++; fails.push(name); console.log('  FAIL: ' + name); } }
function eq(name, got, want) { ok(name + ' [' + got + '==' + want + ']', got === want); }

/* ---- scripted agents ---- */
function baseDecide(g, p, req, yes) {
  switch (req.type) {
    case 'respond': return (req.options && req.options.length && yes) ? { option: req.options[0] } : null;
    case 'rescue': return (req.options && req.options.length && yes) ? { option: req.options[0], card: req.options[0].card } : null;
    case 'confirm': return { yes: !!yes };
    case 'wuxie': return null;
    case 'play': return { end: true };
    case 'chooseCards': return { cards: (req.from || []).slice(0, req.min || 0) };
    case 'chooseOption': return { key: req.choices && req.choices[0] && req.choices[0].key };
    case 'choosePlayers': return { players: (req.candidates || []).slice(0, req.min || 1) };
    case 'chooseZoneCard': return { option: (req.options || [])[0] };
    case 'guanxing': return { topIds: (req.cards || []).map(c => c.id), bottomIds: [] };
    default: return null;
  }
}
const YES = { decide: (g, p, r) => baseDecide(g, p, r, true) };
const NO = { decide: (g, p, r) => baseDecide(g, p, r, false) };

function mkGame(gens) {
  const g = new SGS.Game({ numPlayers: gens.length, seed: 3, throwErrors: true });
  g.setup({ humanSeat: -1 });
  g.assignGenerals(gens);
  g.players.forEach(p => { p.agent = NO; p.hand = []; });
  g.current = g.players[0];
  return g;
}
function C(name, suit, rank, element) {
  const t = SGS.CARD_DB[name] || {};
  return { id: SGS.util.uid('t'), name, cn: t.cn || name, type: t.type || 'basic', subtype: t.subtype || null, suit: suit || 'spade', rank: rank || 1, element: element || 'normal', range: t.range || null };
}
function realCount(g) {
  const ids = new Set();
  const add = c => { if (c.virtual) c.subcards.forEach(add); else ids.add(c.id); };
  g.deck.forEach(add); g.discard.forEach(add);
  g.players.forEach(p => { p.hand.forEach(add); for (const k in p.equips) if (p.equips[k]) add(p.equips[k]); p.judgeZone.forEach(add); });
  return ids.size;
}

async function main() {
  /* 1. 杀 vs 闪 */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let src = g.players[0], tgt = g.players[1]; tgt.hp = 4;
    tgt.agent = YES; tgt.hand = [C('shan', 'heart', 2)];
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7));
    eq('杀被闪抵消(不掉血)', tgt.hp, 4);

    g = mkGame(['zhangliao', 'ganning']); src = g.players[0]; tgt = g.players[1]; tgt.hp = 4; tgt.agent = NO; tgt.hand = [];
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7));
    eq('无闪则受伤', tgt.hp, 3);
  }

  /* 2. 藤甲: 普杀无效; 火杀+1 */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let src = g.players[0], tgt = g.players[1]; tgt.hp = 4; tgt.agent = NO;
    tgt.equips.armor = C('tengjia'); tgt.hand = [];
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7)); // normal
    eq('藤甲免普杀', tgt.hp, 4);
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 4, 'fire')); // fire → 1+1
    eq('藤甲火杀+1', tgt.hp, 2);
    // direct fire damage also +1
    g = mkGame(['zhangliao', 'ganning']); tgt = g.players[1]; tgt.hp = 4; tgt.equips.armor = C('tengjia');
    await g.damage({ source: g.players[0], target: tgt, amount: 1, element: 'fire' });
    eq('藤甲直接火焰+1', tgt.hp, 2);
  }

  /* 3. 仁王盾: 黑杀无效, 红杀有效 */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let src = g.players[0], tgt = g.players[1]; tgt.hp = 4; tgt.agent = NO; tgt.equips.armor = C('renwang'); tgt.hand = [];
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7));
    eq('仁王盾免黑杀', tgt.hp, 4);
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 7));
    eq('仁王盾不免红杀', tgt.hp, 3);
  }

  /* 4. 青釭剑无视防具 */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let src = g.players[0], tgt = g.players[1]; tgt.hp = 4; tgt.agent = NO;
    src.equips.weapon = C('qinggangjian'); tgt.equips.armor = C('renwang'); tgt.hand = [];
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7)); // black + qinggang ignores renwang
    eq('青釭剑无视仁王盾', tgt.hp, 3);
  }

  /* 5. 距离 / 范围 / 杀次数 */
  {
    let g = mkGame(['machao', 'ganning', 'zhangliao', 'huanggai', 'zhouyu']);
    let a = g.players[0], b = g.players[2]; // seat0 -> seat2 = distance 2
    // machao has 马术(-1); use non-mashu general for base distance
    let g2 = mkGame(['zhangliao', 'ganning', 'huanggai', 'zhouyu', 'daqiao']);
    let x = g2.players[0], y = g2.players[2];
    eq('基础距离', g2.distance(x, y), 2);
    y.equips.defhorse = C('dilu'); eq('防御马+1', g2.distance(x, y), 3);
    x.equips.offhorse = C('chitu'); eq('进攻马-1', g2.distance(x, y), 2);
    // mashu
    eq('马术-1距离', g.distance(a, b), 1);
    // range / sha limit
    let p = g2.players[0];
    eq('默认攻击范围1', g2.attackRange(p), 1);
    p.equips.weapon = C('qinglongyanyuedao'); eq('青龙范围3', g2.attackRange(p), 3);
    ok('青龙可及距离2目标', g2.inAttackRange(g2.players[0], g2.players[2]));
    let pl = mkGame(['zhangfei', 'ganning']).players[0]; eq('咆哮无限杀', SGS.shaLimit(mkGame(['zhangfei', 'ganning']), mkGame(['zhangfei', 'ganning']).players[0]), Infinity);
    let cross = mkGame(['ganning', 'zhangliao']); cross.players[0].equips.weapon = C('zhugeliannu');
    eq('连弩无限杀', SGS.shaLimit(cross, cross.players[0]), Infinity);
    eq('默认杀上限1', SGS.shaLimit(g2, g2.players[1]), 1);
  }

  /* 6. 回复不超过体力上限 */
  {
    let g = mkGame(['ganning', 'zhangliao']); let p = g.players[0]; p.hp = p.maxHp - 1;
    await g.recover(p, 5); eq('回复上限封顶', p.hp, p.maxHp);
  }

  /* 7. 闪电判定 */
  {
    let g = mkGame(['ganning', 'zhangliao', 'huanggai']); let p = g.players[0]; p.hp = 4;
    let bolt = C('shandian', 'spade', 1);
    g.deck.unshift(C('sha', 'spade', 5)); // judged card = spade 5 -> hit
    await SGS.resolveDelayTrick(g, p, bolt);
    eq('闪电命中3点雷伤', p.hp, 1);
    let g2 = mkGame(['ganning', 'zhangliao', 'huanggai']); let p2 = g2.players[0]; p2.hp = 4;
    let bolt2 = C('shandian', 'spade', 1);
    g2.deck.unshift(C('sha', 'heart', 10)); // not spade 2-9 -> miss & move
    await SGS.resolveDelayTrick(g2, p2, bolt2);
    eq('闪电未命中不掉血', p2.hp, 4);
    ok('闪电未命中移交下家', g2.players[1].judgeZone.some(c => c.name === 'shandian'));
  }

  /* 8. 乐不思蜀 / 兵粮寸断 */
  {
    let g = mkGame(['ganning', 'zhangliao', 'huanggai']); let p = g.players[0];
    g.deck.unshift(C('sha', 'spade', 7)); // non-heart -> skip play
    await SGS.resolveDelayTrick(g, p, C('lebusishu', 'heart', 6));
    ok('乐不思蜀(非红桃)跳过出牌', p.skip_play === true);
    let g2 = mkGame(['ganning', 'zhangliao', 'huanggai']); let p2 = g2.players[0];
    g2.deck.unshift(C('sha', 'spade', 7)); // non-club -> skip draw
    await SGS.resolveDelayTrick(g2, p2, C('bingliangcunduan', 'club', 4));
    ok('兵粮寸断(非梅花)跳过摸牌', p2.skip_draw === true);
  }

  /* 9a. 奸雄 */
  {
    let g = mkGame(['caocao', 'zhangliao']); let cc = g.players[0]; cc.hp = 4;
    let sha = C('sha', 'spade', 7); g.discard.push(sha);
    await g.damage({ source: g.players[1], target: cc, amount: 1, element: 'normal', card: sha });
    ok('奸雄获得造成伤害的牌', cc.hand.indexOf(sha) >= 0 && g.discard.indexOf(sha) < 0);
  }
  /* 9b. 反馈 */
  {
    let g = mkGame(['simayi', 'zhangliao']); let sm = g.players[0]; sm.hp = 4; sm.agent = YES;
    let src = g.players[1]; src.hand = [C('sha', 'club', 3)];
    let before = src.hand.length;
    await g.damage({ source: src, target: sm, amount: 1, element: 'normal' });
    ok('反馈获得来源一张牌', sm.hand.length === 1 && src.hand.length === before - 1);
  }
  /* 9c. 刚烈 */
  {
    let g = mkGame(['xiahoudun', 'zhangliao']); let xh = g.players[0]; xh.hp = 4;
    let src = g.players[1]; src.hand = [C('sha', 'club', 3), C('sha', 'club', 4)]; src.agent = YES; // picks 'discard'
    g.deck.unshift(C('sha', 'spade', 7)); // judge non-heart -> ganglie fires
    await g.damage({ source: src, target: xh, amount: 1, element: 'normal' });
    eq('刚烈迫使来源弃两张', src.hand.length, 0);
  }
  /* 9d. 武圣 / 龙胆 view-as */
  {
    let g = mkGame(['guanyu', 'zhaoyun']);
    let gy = g.players[0]; gy.hand = [C('tao', 'heart', 3)];
    let opts = SGS.gatherResponses(g, gy, 'sha', {});
    ok('武圣红牌当杀(响应)', opts.some(o => o.card && o.card.name === 'sha'));
    let zy = g.players[1]; zy.hand = [C('sha', 'spade', 7)];
    ok('龙胆杀当闪', SGS.gatherResponses(g, zy, 'shan', {}).some(o => o.card && o.card.name === 'shan'));
    zy.hand = [C('shan', 'heart', 2)];
    ok('龙胆闪当杀', SGS.gatherResponses(g, zy, 'sha', {}).some(o => o.card && o.card.name === 'sha'));
  }
  /* 9e. 空城 / 谦逊 target prevention */
  {
    let g = mkGame(['zhugeliang', 'zhangliao', 'luxun']);
    let zg = g.players[0]; zg.hand = [];
    ok('空城无手牌不可被杀', !SGS.canTarget(g, g.players[1], zg, 'sha'));
    ok('空城无手牌不可被决斗', !SGS.canTarget(g, g.players[1], zg, 'juedou'));
    zg.hand = [C('sha', 'spade', 7)];
    ok('空城有手牌可被杀', SGS.canTarget(g, g.players[1], zg, 'sha'));
    let lx = g.players[2];
    ok('谦逊不可被顺手牵羊', !SGS.canTarget(g, g.players[1], lx, 'shunshouqianyang'));
    ok('谦逊不可被乐不思蜀', !SGS.canTarget(g, g.players[1], lx, 'lebusishu'));
    ok('谦逊可被杀', SGS.canTarget(g, g.players[1], lx, 'sha'));
  }
  /* 9f. 无双: 需两张闪 */
  {
    let g = mkGame(['lvbu', 'ganning']); let src = g.players[0], tgt = g.players[1]; tgt.hp = 4; tgt.agent = YES;
    tgt.hand = [C('shan', 'heart', 2)]; // only 1 闪 -> can't satisfy 2
    await SGS.doSha(g, src, [tgt], C('sha', 'spade', 7));
    eq('无双单闪无法抵消', tgt.hp, 3);
    let g2 = mkGame(['lvbu', 'ganning']); let s2 = g2.players[0], t2 = g2.players[1]; t2.hp = 4; t2.agent = YES;
    t2.hand = [C('shan', 'heart', 2), C('shan', 'diamond', 2)];
    await SGS.doSha(g2, s2, [t2], C('sha', 'spade', 7));
    eq('无双双闪可抵消', t2.hp, 4);
  }
  /* 9g. 苦肉 */
  {
    let g = mkGame(['huanggai', 'zhangliao']); let hg = g.players[0]; hg.hp = 4; hg.hand = [];
    await SGS.SKILLS.kurou.onActivate(g, hg);
    ok('苦肉失1血摸2张', hg.hp === 3 && hg.hand.length === 2);
  }
  /* 9h. 英姿 摸牌+1 */
  {
    let g = mkGame(['zhouyu', 'zhangliao']); let zy = g.players[0];
    let ev = { player: zy, num: 2 };
    await SGS.SKILLS.yingzi.triggers.drawPhaseNum(g, zy, ev);
    eq('英姿摸牌+1', ev.num, 3);
  }
  /* 9i. 骁勇: 受伤按点摸牌 */
  {
    let g = mkGame(['huaxiong', 'zhangliao']); let hx = g.players[0]; hx.hp = 6; hx.hand = [];
    await g.damage({ source: g.players[1], target: hx, amount: 2, element: 'normal' });
    eq('骁勇受2伤摸2张', hx.hand.length, 2);
  }

  /* 10. 牌数守恒（短序列） */
  {
    let g = mkGame(['zhangliao', 'ganning', 'huanggai']);
    const total = realCount(g) + g.deck.length * 0; // deck already counted
    const base = realCount(g);
    await g.drawCards(g.players[0], 3);
    await g.discardCards(g.players[0], g.players[0].hand.slice(0, 1));
    await g.damage({ source: g.players[1], target: g.players[2], amount: 1, element: 'normal' });
    eq('牌数守恒', realCount(g), base);
  }

  /* 11. damage/loseHp stop once the game is finished (chain propagation guard) */
  {
    let g = mkGame(['caocao', 'zhangliao', 'ganning', 'huanggai', 'xiahoudun']);
    g.finished = true; g.winners = 'rebel';
    let before = g.players[1].hp;
    await g.damage({ source: g.players[0], target: g.players[1], amount: 5, element: 'thunder' });
    ok('游戏结束后damage不再生效', g.players[1].hp === before);
    before = g.players[2].hp;
    await g.loseHp(g.players[2], 3, { reason: 'test' });
    ok('游戏结束后loseHp不生效', g.players[2].hp === before);
  }

  /* 12. 延时锦囊从手牌使用进入判定区 */
  {
    let g = mkGame(['ganning', 'zhangliao', 'huanggai']);
    let src = g.players[0], tgt = g.players[1];
    src.hand = [C('lebusishu', 'heart', 6)];
    let ok1 = await SGS.executePlayAction(g, src, { kind: 'card', card: src.hand[0], targets: [tgt] });
    ok('乐不思蜀从手牌使用成功', ok1 && tgt.judgeZone.some(c => c.name === 'lebusishu'));

    g = mkGame(['ganning', 'zhangliao', 'huanggai']);
    src = g.players[0]; tgt = g.players[1];
    src.hand = [C('bingliangcunduan', 'club', 4)];
    let ok2 = await SGS.executePlayAction(g, src, { kind: 'card', card: src.hand[0], targets: [tgt] });
    ok('兵粮寸断从手牌使用成功', ok2 && tgt.judgeZone.some(c => c.name === 'bingliangcunduan'));

    g = mkGame(['ganning', 'zhangliao', 'huanggai']);
    src = g.players[0];
    src.hand = [C('shandian', 'spade', 1)];
    let ok3 = await SGS.executePlayAction(g, src, { kind: 'card', card: src.hand[0], targets: [] });
    ok('闪电从手牌使用成功', ok3 && src.judgeZone.some(c => c.name === 'shandian'));
  }

  /* 13. 装备替换触发枭姬 */
  {
    let g = mkGame(['sunshangxiang', 'zhangliao']);
    let p = g.players[0]; p.skills = [SGS.SKILLS.xiaoji]; p.hand = [];
    let w1 = C('zhugeliannu', 'weapon'); let w2 = C('cixiongjian', 'weapon');
    p.hand = [w1, w2];
    await SGS.executePlayAction(g, p, { kind: 'card', card: w1, targets: [] });
    await SGS.executePlayAction(g, p, { kind: 'card', card: w2, targets: [] });
    eq('装备替换触发枭姬摸2张', p.hand.length, 2);
  }

  /* 14. 使用最后一张手牌触发连营 */
  {
    let g = mkGame(['luxun', 'zhangliao']);
    let p = g.players[0]; p.skills = [SGS.SKILLS.lianying]; p.hand = [C('sha', 'spade', 7)];
    let before = p.hand.length;
    await SGS.executePlayAction(g, p, { kind: 'card', card: p.hand[0], targets: [g.players[1]] });
    ok('使用最后一张手牌触发连营', p.hand.length === before); // lost 1 drew 1
  }

  /* 15. 流离按攻击范围 */
  {
    let g = mkGame(['daqiao', 'zhangliao', 'ganning', 'huanggai']);
    let me = g.players[0], src = g.players[1], far = g.players[2];
    me.hand = [C('shan', 'heart', 2)];
    me.equips.weapon = C('qinglongyanyuedao', 'weapon'); // range 3
    me.agent = YES; // accept liuli
    // Directly call the trigger to inspect candidate list
    let ev = { source: src, target: me, transferTo: null };
    await SGS.SKILLS.liuli.triggers.shaHit(g, me, ev);
    ok('流离可转移给武器攻击范围内的角色', ev.transferTo === far);
  }

  /* 16. 神速每回合限一次 */
  {
    let g = mkGame(['xiahouyuan', 'zhangliao']);
    let p = g.players[0]; p.hand = []; p.equips.weapon = C('zhugeliannu', 'weapon');
    let opt1 = SGS.SKILLS.shensu.active(g, p);
    ok('神速首次可发动', !!opt1);
    p.flags.shensu = true;
    let opt2 = SGS.SKILLS.shensu.active(g, p);
    ok('神速本回合已发动后不可再发动', !opt2);
  }

  /* 16b. 救援：吴势力角色自己回合外救孙权额外+1 */
  {
    let g = mkGame(['sunquan', 'ganning', 'huanggai']);
    let sun = g.players[0], wu = g.players[1];
    sun.skills = [SGS.SKILLS.jiuyuan]; sun.hp = 0; sun.hand = [];
    wu.hand = [C('tao', 'heart', 5)]; wu.nation = 'wu';
    g.current = sun; // NOT wu's own turn -> 回合外, should trigger
    wu.agent = YES;
    await g.enterDying(sun, { source: g.players[2], target: sun });
    eq('救援在施救者回合外额外回复1点', sun.hp, 2);

    g = mkGame(['sunquan', 'ganning', 'huanggai']);
    sun = g.players[0]; wu = g.players[1];
    sun.skills = [SGS.SKILLS.jiuyuan]; sun.hp = 0; sun.hand = [];
    wu.hand = [C('tao', 'heart', 5)]; wu.nation = 'wu';
    g.current = wu; // wu's own turn, should NOT trigger
    wu.agent = YES;
    await g.enterDying(sun, { source: g.players[2], target: sun });
    eq('救援在施救者自己回合内不触发', sun.hp, 1);
  }

  /* 17. 铁索连环重铸 */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let p = g.players[0]; p.hand = [C('tiesuolianhuan', 'spade', 3)];
    let before = p.hand.length;
    let ok1 = await SGS.executePlayAction(g, p, { kind: 'card', card: p.hand[0], targets: [], reforge: true });
    ok('铁索连环重铸成功', ok1 && p.hand.length === before); // discard 1 draw 1
  }

  /* 18. 天妒+鬼才不复制判定牌 */
  {
    let g = mkGame(['guojia', 'simayi']);
    let guo = g.players[0], sima = g.players[1];
    guo.skills = [SGS.SKILLS.tiandu]; sima.skills = [SGS.SKILLS.guicai];
    guo.hand = []; sima.hand = [C('sha', 'club', 3)];
    sima.agent = YES; // will confirm guicai and pick first card
    let beforeCount = realCount(g);
    await g.judge(guo, { reason: 'test' });
    ok('天妒+鬼才后牌数守恒', realCount(g) === beforeCount);
    ok('天妒+鬼才后原判定牌不在郭嘉手牌', guo.hand.every(c => c.suit !== 'heart' || c.rank !== 1));
  }

  /* 19. 方天画戟+武圣可指定3目标 */
  {
    let g = mkGame(['guanyu', 'zhangliao', 'ganning', 'huanggai', 'xiahoudun']);
    let guan = g.players[0]; guan.equips.weapon = C('fangtianhuaji', 'weapon');
    guan.hand = [C('sha', 'heart', 7)]; // red, can 武圣 as self but also a real sha
    let opts = SGS.playOptions(g, guan);
    let shaOpt = opts.find(function (o) { return o.name === 'sha'; });
    ok('方天画戟最后一张手可杀3目标', shaOpt && shaOpt.maxTargets === 3);
  }

  /* 20. 奇才无视顺手/兵粮距离 */
  {
    let g = mkGame(['huangyueying', 'zhangliao', 'ganning', 'huanggai', 'xiahoudun']);
    let hyy = g.players[0], far = g.players[2];
    hyy.hand = [C('shunshouqianyang', 'spade', 3), C('bingliangcunduan', 'club', 4)];
    far.hand = [C('sha', 'spade', 7)]; // distance 2 from hyy
    let opts = SGS.playOptions(g, hyy);
    let shun = opts.find(function (o) { return o.name === 'shunshouqianyang'; });
    let bing = opts.find(function (o) { return o.name === 'bingliangcunduan'; });
    ok('奇才顺手牵羊可及远距离目标', shun && shun.candidates.some(c => c === far));
    ok('奇才兵粮寸断可及远距离目标', bing && bing.candidates.some(c => c === far));
  }

  /* 21. constructor and play-action validation */
  {
    let threw = false;
    try { new SGS.Game({ numPlayers: 1 }); } catch (e) { threw = e instanceof RangeError || e.name === 'RangeError'; }
    ok('拒绝非法玩家人数', threw);

    const g = mkGame(['ganning', 'zhangliao']);
    const fake = C('sha', 'spade', 7);
    const result = await SGS.executePlayAction(g, g.players[0], { kind: 'card', card: fake, targets: [g.players[1]] });
    ok('拒绝使用不在自己区域的牌', result === false && g.players[1].hp === g.players[1].maxHp);
  }

  /* 22. card-zone loss events are exact (连营/枭姬) */
  {
    let g = mkGame(['sunshangxiang', 'zhangliao']);
    let p = g.players[0];
    const equipInHand = C('qinggangjian', 'spade', 6);
    p.hand = [equipInHand];
    await g.discardCards(p, [equipInHand], { reason: 'test' });
    eq('从手牌弃装备牌不触发枭姬', p.hand.length, 0);

    g = mkGame(['luxun', 'zhangliao']);
    p = g.players[0]; p.hand = [];
    const equipped = C('qinggangjian', 'spade', 6); p.equips.weapon = equipped;
    await g.discardCards(p, [equipped], { reason: 'test' });
    eq('无手牌时失去装备不误触连营', p.hand.length, 0);

    g = mkGame(['zhangliao', 'luxun']);
    const thief = g.players[0], luxun = g.players[1], last = C('sha', 'spade', 7);
    luxun.hand = [last]; thief.hand = [];
    await g.gainCards(thief, [last], { from: luxun });
    ok('获得他人最后手牌触发连营且牌不重复', thief.hand.length === 1 && luxun.hand.length === 1 && thief.hand[0] !== luxun.hand[0]);

    g = mkGame(['zhangliao', 'sunshangxiang']);
    const taker = g.players[0], ssx = g.players[1], horse = C('dilu', 'club', 5);
    ssx.hand = []; ssx.equips.defhorse = horse; taker.hand = [];
    await g.gainCards(taker, [horse], { from: ssx });
    ok('获得他人装备触发一次枭姬', taker.hand.length === 1 && ssx.hand.length === 2 && !ssx.equips.defhorse);
  }

  /* 23. effective judgment card and lightning transfer */
  {
    let g = mkGame(['guojia', 'simayi', 'zhangliao']);
    const guo = g.players[0], sima = g.players[1];
    const original = C('sha', 'heart', 8), replacement = C('shan', 'club', 2);
    g.deck.unshift(original); sima.hand = [replacement]; sima.agent = YES;
    const result = await g.judge(guo, { reason: 'test' });
    ok('天妒获得改判后的最终判定牌', result === replacement && guo.hand.indexOf(replacement) >= 0 && guo.hand.indexOf(original) < 0);

    g = mkGame(['ganning', 'zhangliao', 'huanggai']);
    const bolt = C('shandian', 'spade', 1), occupied = C('shandian', 'heart', 12);
    g.players[1].judgeZone = [occupied];
    g.deck.unshift(C('sha', 'heart', 10));
    await SGS.resolveDelayTrick(g, g.players[0], bolt);
    ok('闪电跳过已有闪电的下家', g.players[1].judgeZone.length === 1 && g.players[2].judgeZone.indexOf(bolt) >= 0);
  }

  /* 24. weapon edge cases */
  {
    let g = mkGame(['ganning', 'zhangliao']);
    let src = g.players[0], tgt = g.players[1];
    src.equips.weapon = C('hanbingjian', 'spade', 2); src.agent = YES;
    tgt.hand = []; tgt.judgeZone = [C('lebusishu', 'club', 6)]; tgt.hp = 4;
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 7));
    eq('寒冰剑不能以零张可弃牌替代伤害', tgt.hp, 3);

    g = mkGame(['ganning', 'zhangliao']); src = g.players[0]; tgt = g.players[1];
    src.hand = []; src.equips.weapon = C('guanshifu', 'diamond', 5); src.equips.armor = C('bagua', 'spade', 2); src.agent = YES;
    tgt.hand = [C('shan', 'heart', 2)]; tgt.agent = YES; tgt.hp = 4;
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 7));
    ok('贯石斧可弃置装备区两张牌强制造伤', tgt.hp === 3 && !src.equips.weapon && !src.equips.armor);

    g = mkGame(['ganning', 'zhenji']); src = g.players[0]; tgt = g.players[1];
    src.gender = 'male'; tgt.gender = 'female'; src.equips.weapon = C('cixiongjian', 'spade', 2); src.hand = [];
    tgt.hand = [C('sha', 'club', 3)]; tgt.agent = { decide: (game, player, req) => req.type === 'chooseOption' ? { key: 'draw' } : null };
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 7));
    ok('雌雄双股剑由目标选择弃牌或令来源摸牌', tgt.hand.length === 1 && src.hand.length === 1);

    g = mkGame(['ganning', 'zhangliao']); src = g.players[0]; tgt = g.players[1];
    src.equips.weapon = C('qilingong', 'heart', 5); src.agent = YES; tgt.equips.defhorse = C('dilu', 'club', 5);
    tgt.skills = [{ name: 'cancel-test', triggers: { beforeDamage: async (game, me, ev) => { if (ev.target === me) ev.cancelled = true; } } }];
    await SGS.doSha(g, src, [tgt], C('sha', 'heart', 7));
    ok('伤害被取消时麒麟弓不弃坐骑', !!tgt.equips.defhorse);
  }

  /* 25. option completeness and resolving-card isolation */
  {
    let g = mkGame(['zhangliao', 'ganning']);
    let p = g.players[0];
    const chain = C('tiesuolianhuan', 'club', 10); p.hand = [chain];
    const opts = SGS.playOptions(g, p).filter(o => o.card === chain);
    ok('铁索连环同时提供连环和重铸', opts.some(o => o.reforge) && opts.some(o => !o.reforge && o.candidates.indexOf(p) >= 0));

    g = mkGame(['sunshangxiang', 'zhangliao']); p = g.players[0]; p.hp = p.maxHp;
    p.hand = [C('sha', 'spade', 7), C('shan', 'heart', 2)];
    g.players[1].hp = g.players[1].maxHp - 1;
    ok('结姻在自己满体力时仍可治疗受伤男性', !!SGS.SKILLS.jieyin.active(g, p));

    g = mkGame(['ganning', 'zhangliao']); p = g.players[0];
    const drawTrick = C('wuzhongshengyou', 'heart', 7), other = C('sha', 'spade', 9);
    p.hand = [drawTrick]; g.deck = []; g.discard = [other];
    await SGS.executePlayAction(g, p, { kind: 'card', card: drawTrick, targets: [] });
    ok('正在结算的锦囊不会被立即洗回并摸到', p.hand.indexOf(drawTrick) < 0 && p.hand.indexOf(other) >= 0 && g.discard.indexOf(drawTrick) >= 0);
  }

  console.log('\n================ UNIT TESTS ================');
  console.log('PASS ' + PASS + '  /  FAIL ' + FAIL);
  if (fails.length) console.log('failed: ' + fails.join(' | '));
  console.log('RESULT:', FAIL === 0 ? 'PASS' : 'FAIL');
  process.exit(FAIL === 0 ? 0 : 1);
}
main().catch(e => { console.error('THREW:', e.stack || e); process.exit(1); });
