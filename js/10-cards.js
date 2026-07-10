/* ==========================================================================
 * 三国杀 · 卡牌定义 (cards)
 *   - CARD_DB : template for every card kind (metadata + flags)
 *   - buildDeck() : returns a shuffled-ready array of concrete card instances
 * Effect logic lives in the engine / card-effects module, keyed by card.name.
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};

  /* ---------- Card templates ----------
   * type:    basic | equip | trick
   * subtype: (basic) - ; (equip) weapon|armor|offhorse|defhorse ; (trick) instant|delay
   */
  var DB = SGS.CARD_DB = {
    /* ----- basic ----- */
    sha:  { name: 'sha',  cn: '杀',   type: 'basic', desc: '出牌阶段对攻击范围内一名角色使用，令其受到1点伤害（可被“闪”抵消）。' },
    shan: { name: 'shan', cn: '闪',   type: 'basic', desc: '抵消一次“杀”的效果。' },
    tao:  { name: 'tao',  cn: '桃',   type: 'basic', desc: '出牌阶段回复1点体力，或救助濒死的角色。' },
    jiu:  { name: 'jiu',  cn: '酒',   type: 'basic', desc: '使本回合下一次“杀”伤害+1；濒死时可当“桃”回复1点体力。' },

    /* ----- equipment: weapons ----- */
    zhugeliannu:       { name: 'zhugeliannu',       cn: '诸葛连弩', type: 'equip', subtype: 'weapon', range: 1, desc: '装备后，出牌阶段你可以使用任意数量的“杀”。' },
    cixiongjian:       { name: 'cixiongjian',       cn: '雌雄双股剑', type: 'equip', subtype: 'weapon', range: 2, desc: '对异性角色使用“杀”时，可令其弃一张手牌或你摸一张牌。' },
    qinggangjian:      { name: 'qinggangjian',      cn: '青釭剑',   type: 'equip', subtype: 'weapon', range: 2, desc: '你使用“杀”无视目标防具。' },
    hanbingjian:       { name: 'hanbingjian',       cn: '寒冰剑',   type: 'equip', subtype: 'weapon', range: 2, desc: '“杀”造成伤害前，可改为依次弃置对方两张牌。' },
    qinglongyanyuedao: { name: 'qinglongyanyuedao', cn: '青龙偃月刀', type: 'equip', subtype: 'weapon', range: 3, desc: '“杀”被“闪”抵消后，可继续对其使用一张“杀”。' },
    zhangbashemao:     { name: 'zhangbashemao',     cn: '丈八蛇矛', type: 'equip', subtype: 'weapon', range: 3, desc: '可将两张手牌当“杀”使用/打出。' },
    guanshifu:         { name: 'guanshifu',         cn: '贯石斧',   type: 'equip', subtype: 'weapon', range: 3, desc: '“杀”被“闪”抵消后，可弃两张牌令其仍造成伤害。' },
    fangtianhuaji:     { name: 'fangtianhuaji',     cn: '方天画戟', type: 'equip', subtype: 'weapon', range: 4, desc: '你的最后一张手牌“杀”可指定至多三名目标。' },
    qilingong:         { name: 'qilingong',         cn: '麒麟弓',   type: 'equip', subtype: 'weapon', range: 5, desc: '“杀”造成伤害时，可弃置对方一匹坐骑。' },

    /* ----- equipment: armor ----- */
    bagua:   { name: 'bagua',   cn: '八卦阵', type: 'equip', subtype: 'armor', desc: '需要使用/打出“闪”时，可判定，红色则视为“闪”。' },
    renwang: { name: 'renwang', cn: '仁王盾', type: 'equip', subtype: 'armor', desc: '黑色“杀”对你无效。' },
    tengjia: { name: 'tengjia', cn: '藤甲',   type: 'equip', subtype: 'armor', desc: '“南蛮入侵”“万箭齐发”及普通“杀”对你无效；但受火焰伤害+1。' },

    /* ----- equipment: horses ----- */
    dilu:              { name: 'dilu',              cn: '的卢',     type: 'equip', subtype: 'defhorse', desc: '其他角色与你的距离+1。' },
    jueying:           { name: 'jueying',           cn: '绝影',     type: 'equip', subtype: 'defhorse', desc: '其他角色与你的距离+1。' },
    zhuahuangfeidian:  { name: 'zhuahuangfeidian',  cn: '爪黄飞电', type: 'equip', subtype: 'defhorse', desc: '其他角色与你的距离+1。' },
    chitu:             { name: 'chitu',             cn: '赤兔',     type: 'equip', subtype: 'offhorse', desc: '你与其他角色的距离-1。' },
    dayuan:            { name: 'dayuan',            cn: '大宛',     type: 'equip', subtype: 'offhorse', desc: '你与其他角色的距离-1。' },
    zixing:            { name: 'zixing',            cn: '紫骍',     type: 'equip', subtype: 'offhorse', desc: '你与其他角色的距离-1。' },

    /* ----- trick: instant ----- */
    wuzhongshengyou:  { name: 'wuzhongshengyou',  cn: '无中生有', type: 'trick', subtype: 'instant', target: 'self',  desc: '摸两张牌。' },
    guohechaiqiao:    { name: 'guohechaiqiao',    cn: '过河拆桥', type: 'trick', subtype: 'instant', target: 'single', desc: '弃置目标角色的一张牌。' },
    shunshouqianyang: { name: 'shunshouqianyang', cn: '顺手牵羊', type: 'trick', subtype: 'instant', target: 'single', range: 1, desc: '获得距离1以内一名角色的一张牌。' },
    juedou:           { name: 'juedou',           cn: '决斗',     type: 'trick', subtype: 'instant', target: 'single', desc: '与目标轮流打出“杀”，先不出者受到1点伤害。' },
    jiedaosharen:     { name: 'jiedaosharen',     cn: '借刀杀人', type: 'trick', subtype: 'instant', target: 'special', desc: '令一名装备武器的角色对其攻击范围内你指定的另一角色使用“杀”，否则将武器交给你。' },
    huogong:          { name: 'huogong',          cn: '火攻',     type: 'trick', subtype: 'instant', target: 'single', desc: '目标展示一张手牌，你弃置一张同花色手牌可对其造成1点火焰伤害。' },
    tiesuolianhuan:   { name: 'tiesuolianhuan',   cn: '铁索连环', type: 'trick', subtype: 'instant', target: 'chain', desc: '横置或重置至多两名角色（连环状态）。可重铸。' },
    wuzhongxie:       { name: 'wuxiekeji',        cn: '无懈可击', type: 'trick', subtype: 'instant', target: 'trick',  desc: '抵消一张锦囊牌对一名角色的效果。' },
    wuxiekeji:        { name: 'wuxiekeji',        cn: '无懈可击', type: 'trick', subtype: 'instant', target: 'trick',  desc: '抵消一张锦囊牌对一名角色的效果。' },
    wugufengdeng:     { name: 'wugufengdeng',     cn: '五谷丰登', type: 'trick', subtype: 'instant', target: 'all',   desc: '翻开等同存活人数的牌，每名角色依次选取一张。' },
    taoyuanjieyi:     { name: 'taoyuanjieyi',     cn: '桃园结义', type: 'trick', subtype: 'instant', target: 'all',   desc: '所有角色回复1点体力。' },
    nanmanruqin:      { name: 'nanmanruqin',      cn: '南蛮入侵', type: 'trick', subtype: 'instant', target: 'others', desc: '所有其他角色需打出一张“杀”，否则受到1点伤害。' },
    wanjianqifa:      { name: 'wanjianqifa',      cn: '万箭齐发', type: 'trick', subtype: 'instant', target: 'others', desc: '所有其他角色需打出一张“闪”，否则受到1点伤害。' },

    /* ----- trick: delay (judgment) ----- */
    lebusishu:        { name: 'lebusishu',        cn: '乐不思蜀', type: 'trick', subtype: 'delay', target: 'single', judge: 'notHeart', desc: '判定：若非红桃，跳过其出牌阶段。' },
    bingliangcunduan: { name: 'bingliangcunduan', cn: '兵粮寸断', type: 'trick', subtype: 'delay', target: 'single', range: 1, judge: 'notClub', desc: '判定：若非梅花，跳过其摸牌阶段。' },
    shandian:         { name: 'shandian',         cn: '闪电',     type: 'trick', subtype: 'delay', target: 'self',  judge: 'spade2to9', desc: '判定：若为黑桃2~9，受到3点雷电伤害，否则移交下家。' }
  };

  // canonical name normalisation (wuxiekeji is the single true name)
  delete DB.wuzhongxie;

  /* ---------- element helpers ---------- */
  SGS.isRed   = function (suit) { return suit === 'heart' || suit === 'diamond'; };
  SGS.isBlack = function (suit) { return suit === 'spade' || suit === 'club'; };

  /* ---------- Deck definition ----------
   * Each entry: [name, suit, rank] . Faithful-ish to the standard edition.
   */
  var DECK = [
    /* ===== 杀 (Strike) ===== */
    ['sha','spade',7],['sha','spade',8],['sha','spade',8],['sha','spade',9],['sha','spade',9],
    ['sha','spade',10],['sha','spade',10],['sha','spade',11],
    ['sha','club',2],['sha','club',3],['sha','club',4],['sha','club',5],['sha','club',6],
    ['sha','club',7],['sha','club',8],['sha','club',8],['sha','club',9],['sha','club',9],
    ['sha','club',10],['sha','club',10],['sha','club',11],['sha','club',11],
    ['sha','heart',10],['sha','heart',10],['sha','heart',11],
    ['sha','diamond',6],['sha','diamond',7],['sha','diamond',8],['sha','diamond',9],
    ['sha','diamond',10],['sha','diamond',13],
    /* ===== 火杀 (fire) & 雷杀 (thunder) — a small elemental spread ===== */
    ['sha_fire','heart',4],['sha_fire','heart',7],['sha_fire','diamond',4],['sha_fire','diamond',5],
    ['sha_thunder','spade',5],['sha_thunder','spade',6],['sha_thunder','club',12],['sha_thunder','club',13],

    /* ===== 闪 (Dodge) ===== */
    ['shan','heart',2],['shan','heart',2],['shan','heart',13],
    ['shan','diamond',2],['shan','diamond',2],['shan','diamond',3],['shan','diamond',4],
    ['shan','diamond',5],['shan','diamond',6],['shan','diamond',7],['shan','diamond',8],
    ['shan','diamond',9],['shan','diamond',10],['shan','diamond',11],['shan','diamond',11],

    /* ===== 桃 (Peach) ===== */
    ['tao','heart',3],['tao','heart',4],['tao','heart',6],['tao','heart',7],['tao','heart',8],
    ['tao','heart',9],['tao','heart',12],['tao','diamond',12],

    /* ===== 酒 (Wine) ===== */
    ['jiu','spade',3],['jiu','spade',9],['jiu','club',9],

    /* ===== 装备 · 武器 ===== */
    ['zhugeliannu','club',1],['zhugeliannu','diamond',1],
    ['cixiongjian','spade',2],
    ['qinggangjian','spade',6],
    ['hanbingjian','spade',2],
    ['qinglongyanyuedao','spade',5],
    ['zhangbashemao','spade',12],
    ['guanshifu','diamond',5],
    ['fangtianhuaji','diamond',12],
    ['qilingong','heart',5],

    /* ===== 装备 · 防具 ===== */
    ['bagua','spade',2],['bagua','club',2],
    ['renwang','club',2],
    ['tengjia','spade',2],

    /* ===== 装备 · 坐骑 ===== */
    ['dilu','club',5],['jueying','spade',5],['zhuahuangfeidian','heart',13],
    ['chitu','heart',5],['dayuan','spade',13],['zixing','heart',5],

    /* ===== 锦囊 · 即时 ===== */
    ['wuzhongshengyou','heart',7],['wuzhongshengyou','heart',8],['wuzhongshengyou','heart',9],['wuzhongshengyou','heart',11],
    ['guohechaiqiao','heart',12],['guohechaiqiao','spade',3],['guohechaiqiao','spade',4],
    ['guohechaiqiao','spade',12],['guohechaiqiao','club',3],['guohechaiqiao','club',4],
    ['shunshouqianyang','spade',3],['shunshouqianyang','spade',4],['shunshouqianyang','spade',11],
    ['shunshouqianyang','diamond',3],['shunshouqianyang','diamond',4],
    ['juedou','spade',1],['juedou','club',1],['juedou','diamond',1],
    ['jiedaosharen','club',12],['jiedaosharen','club',13],
    ['huogong','heart',2],['huogong','heart',3],['huogong','diamond',12],
    ['tiesuolianhuan','spade',11],['tiesuolianhuan','spade',12],['tiesuolianhuan','club',10],['tiesuolianhuan','club',11],
    ['wuxiekeji','spade',11],['wuxiekeji','club',12],['wuxiekeji','club',13],['wuxiekeji','diamond',12],
    ['wugufengdeng','heart',3],['wugufengdeng','heart',4],
    ['taoyuanjieyi','heart',1],
    ['nanmanruqin','spade',7],['nanmanruqin','spade',13],['nanmanruqin','club',7],
    ['wanjianqifa','heart',1],

    /* ===== 锦囊 · 延时 ===== */
    ['lebusishu','heart',6],['lebusishu','spade',6],['lebusishu','club',6],
    ['bingliangcunduan','spade',10],['bingliangcunduan','club',4],
    ['shandian','spade',1],['shandian','heart',12]
  ];

  /* fire / thunder sha map to the sha template but with an element flag */
  function templateFor(name) {
    if (name === 'sha_fire')    return { base: DB.sha, element: 'fire',    cn: '火杀' };
    if (name === 'sha_thunder') return { base: DB.sha, element: 'thunder', cn: '雷杀' };
    return { base: DB[name], element: 'normal', cn: null };
  }

  var _serial = 0;
  SGS.buildDeck = function () {
    var deck = [];
    for (var i = 0; i < DECK.length; i++) {
      var entry = DECK[i];
      var t = templateFor(entry[0]);
      if (!t.base) { throw new Error('Unknown card in deck: ' + entry[0]); }
      var tpl = t.base;
      var card = {
        id: 'c' + (++_serial),
        name: tpl.name,
        cn: t.cn || tpl.cn,
        type: tpl.type,
        subtype: tpl.subtype || null,
        suit: entry[1],
        rank: entry[2],
        element: t.element,
        // carry static equip/trick metadata
        range: tpl.range || null,
        target: tpl.target || null,
        judge: tpl.judge || null,
        desc: tpl.desc || ''
      };
      deck.push(card);
    }
    return deck;
  };

  /* Build a virtual card (e.g. a skill turning a card into a "杀"). */
  SGS.virtualCard = function (name, opts) {
    opts = opts || {};
    var tpl = DB[name] || {};
    return {
      id: opts.id || SGS.util.uid('v'),
      name: name,
      cn: opts.cn || tpl.cn || name,
      type: opts.type || tpl.type || 'basic',
      subtype: opts.subtype || tpl.subtype || null,
      suit: opts.suit || 'none',
      rank: opts.rank || 0,
      element: opts.element || 'normal',
      range: tpl.range || null,
      target: opts.target || tpl.target || null,
      judge: tpl.judge || null,
      virtual: true,
      // the real cards that compose this virtual card (for moving to discard)
      subcards: opts.subcards || [],
      desc: tpl.desc || ''
    };
  };

  SGS.cardLabel = function (card) {
    if (!card) return '';
    var suit = SGS.SUITS[card.suit];
    var s = suit ? (suit.symbol + SGS.rankName(card.rank)) : '';
    return card.cn + (s ? ('·' + s) : '');
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
