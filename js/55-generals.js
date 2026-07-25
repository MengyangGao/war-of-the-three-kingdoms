/* ==========================================================================
 * 三分天下 · 武将数据
 *   Each general: key, cn, nation, gender, hp, skills[], lordSkills[], title.
 *   Skills are resolved by name against SGS.SKILLS at setup time; any skill
 *   not yet implemented is simply inert (the general still has hp/nation/etc).
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};

  var G = SGS.GENERALS = {
    /* ===================== 魏 ===================== */
    caocao:    { key: 'caocao',    cn: '曹操',   title: '魏武帝', nation: 'wei', gender: 'male',   hp: 4, skills: ['jianxiong'], lordSkills: ['hujia'], desc: '奸雄：当你受到伤害后，你可以获得对你造成伤害的牌。' },
    simayi:    { key: 'simayi',    cn: '司马懿', title: '狼顾之相', nation: 'wei', gender: 'male', hp: 3, skills: ['fankui', 'guicai'], desc: '反馈：受到伤害后获得伤害来源一张牌。鬼才：判定前可用手牌替换判定牌。' },
    xiahoudun: { key: 'xiahoudun', cn: '夏侯惇', title: '独眼刺客', nation: 'wei', gender: 'male', hp: 4, skills: ['ganglie'], desc: '刚烈：受到伤害后可判定，非红桃则伤害来源弃两张牌或受1点伤害。' },
    zhangliao: { key: 'zhangliao', cn: '张辽',   title: '威震逍遥津', nation: 'wei', gender: 'male', hp: 4, skills: ['tuxi'], desc: '突袭：摸牌阶段可改为获得至多两名角色各一张手牌。' },
    xuchu:     { key: 'xuchu',     cn: '许褚',   title: '虎痴', nation: 'wei', gender: 'male', hp: 4, skills: ['luoyi'], desc: '裸衣：摸牌阶段可少摸一张，本回合杀与决斗伤害+1。' },
    guojia:    { key: 'guojia',    cn: '郭嘉',   title: '鬼才', nation: 'wei', gender: 'male', hp: 3, skills: ['tiandu', 'yiji'], desc: '天妒：判定牌生效后获得之。遗计：受到伤害后摸两张牌并可分配。' },
    zhenji:    { key: 'zhenji',    cn: '甄姬',   title: '洛神', nation: 'wei', gender: 'female', hp: 3, skills: ['luoshen', 'qingguo'], desc: '洛神：回合开始时反复判定黑色获得之。倾国：黑色手牌当闪。' },
    xiahouyuan:{ key: 'xiahouyuan',cn: '夏侯渊', title: '疾行', nation: 'wei', gender: 'male', hp: 4, skills: ['shensu'], desc: '神速：可弃装备/跳过阶段发动额外的杀。' },

    /* ===================== 蜀 ===================== */
    liubei:    { key: 'liubei',    cn: '刘备',   title: '乱世枭雄', nation: 'shu', gender: 'male', hp: 4, skills: ['rende'], lordSkills: ['jijiang'], desc: '仁德：出牌阶段可将手牌交给其他角色，累计两张回复体力。' },
    guanyu:    { key: 'guanyu',    cn: '关羽',   title: '武圣', nation: 'shu', gender: 'male', hp: 4, skills: ['wusheng'], desc: '武圣：红色牌当杀使用或打出。' },
    zhangfei:  { key: 'zhangfei',  cn: '张飞',   title: '万夫不当', nation: 'shu', gender: 'male', hp: 4, skills: ['paoxiao'], desc: '咆哮：出牌阶段使用杀无次数限制。' },
    zhugeliang:{ key: 'zhugeliang',cn: '诸葛亮', title: '卧龙', nation: 'shu', gender: 'male', hp: 3, skills: ['guanxing', 'kongcheng'], desc: '观星：回合开始时预览并调整牌堆顶。空城：无手牌时不能成为杀与决斗的目标。' },
    zhaoyun:   { key: 'zhaoyun',   cn: '赵云',   title: '龙威', nation: 'shu', gender: 'male', hp: 4, skills: ['longdan'], desc: '龙胆：杀当闪、闪当杀使用或打出。' },
    machao:    { key: 'machao',    cn: '马超',   title: '西凉锦马', nation: 'shu', gender: 'male', hp: 4, skills: ['mashu', 'tieqi'], desc: '马术：距离-1。铁骑：杀命中时判定红色则不可被闪避。' },
    huangyueying:{ key:'huangyueying', cn: '黄月英', title: '奇思妙想', nation: 'shu', gender: 'female', hp: 3, skills: ['jizhi', 'qicai'], desc: '集智：使用非延时锦囊时摸一张牌。奇才：使用锦囊无距离限制。' },

    /* ===================== 吴 ===================== */
    sunquan:   { key: 'sunquan',   cn: '孙权',   title: '制衡', nation: 'wu', gender: 'male', hp: 4, skills: ['zhiheng'], lordSkills: ['jiuyuan'], desc: '制衡：出牌阶段可弃任意张牌并摸等量牌（每回合一次）。' },
    ganning:   { key: 'ganning',   cn: '甘宁',   title: '锦帆游侠', nation: 'wu', gender: 'male', hp: 4, skills: ['qixi'], desc: '奇袭：黑色牌当过河拆桥使用。' },
    lvmeng:    { key: 'lvmeng',    cn: '吕蒙',   title: '士别三日', nation: 'wu', gender: 'male', hp: 4, skills: ['keji'], desc: '克己：出牌阶段未使用/打出杀，则跳过弃牌阶段。' },
    huanggai:  { key: 'huanggai',  cn: '黄盖',   title: '苦肉计', nation: 'wu', gender: 'male', hp: 4, skills: ['kurou'], desc: '苦肉：出牌阶段可失去1点体力摸两张牌。' },
    zhouyu:    { key: 'zhouyu',    cn: '周瑜',   title: '大都督', nation: 'wu', gender: 'male', hp: 3, skills: ['yingzi', 'fanjian'], desc: '英姿：摸牌阶段多摸一张。反间：令一名角色选花色后展示手牌，不符则受伤。' },
    daqiao:    { key: 'daqiao',    cn: '大乔',   title: '国色天香', nation: 'wu', gender: 'female', hp: 3, skills: ['guose', 'liuli'], desc: '国色：方块牌当乐不思蜀。流离：成为杀目标时可弃牌转移目标。' },
    luxun:     { key: 'luxun',     cn: '陆逊',   title: '一夫难挡', nation: 'wu', gender: 'male', hp: 3, skills: ['qianxun', 'lianying'], desc: '谦逊：不能成为顺手牵羊与乐不思蜀的目标。连营：失去最后手牌时摸一张。' },
    sunshangxiang:{ key:'sunshangxiang', cn: '孙尚香', title: '弓腰姬', nation: 'wu', gender: 'female', hp: 3, skills: ['jieyin', 'xiaoji'], desc: '结姻：弃两张手牌为自己和一名男性角色回复体力。枭姬：失去装备时摸两张牌。' },

    /* ===================== 群 ===================== */
    huatuo:    { key: 'huatuo',    cn: '华佗',   title: '神医', nation: 'qun', gender: 'male', hp: 3, skills: ['jijiu', 'qingnang'], desc: '急救：回合外可将红色牌当桃。青囊：出牌阶段弃一张手牌为一名角色回复体力。' },
    lvbu:      { key: 'lvbu',      cn: '吕布',   title: '战神', nation: 'qun', gender: 'male', hp: 4, skills: ['wushuang'], desc: '无双：杀需两张闪抵消；决斗需对方出两张杀。' },
    diaochan:  { key: 'diaochan',  cn: '貂蝉',   title: '离间计', nation: 'qun', gender: 'female', hp: 3, skills: ['lihun', 'biyue'], desc: '离间：令两名男性角色决斗。闭月：结束阶段摸一张牌。' },
    huaxiong:  { key: 'huaxiong',  cn: '华雄',   title: '骁勇', nation: 'qun', gender: 'male', hp: 6, skills: ['xiaoyong'], desc: '骁勇：锁定技，受到伤害后按点数摸牌，体力雄厚的西凉猛将。' }
  };

  // list helpers
  SGS.generalList = function () { var a = []; for (var k in G) a.push(G[k]); return a; };
  SGS.generalsByNation = function (nation) { return SGS.generalList().filter(function (g) { return g.nation === nation; }); };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
