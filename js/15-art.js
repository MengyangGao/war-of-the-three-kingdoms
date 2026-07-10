/* ==========================================================================
 * 三分天下 · 程序化美术与开放画像映射 (art)
 *   - SGS.ART.portraitUrl(key)   -> path to a downloaded PD portrait, or null
 *   - SGS.ART.emblemSVG(gen)     -> generated nation emblem (fallback portrait)
 *   - SGS.ART.cardIconSVG(card)  -> inline SVG emblem for a card
 *   All art is generated/inlined so it works fully offline (file://).
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var ART = SGS.ART = SGS.ART || {};

  /* which generals have a real downloaded portrait */
  ART.PORTRAITS = {
    caocao:1, daqiao:1, diaochan:1, ganning:1, guanyu:1, guojia:1, huanggai:1, huatuo:1,
    liubei:1, lvbu:1, lvmeng:1, machao:1, simayi:1, sunquan:1, sunshangxiang:1, xiahoudun:1,
    xiahouyuan:1, xuchu:1, zhangfei:1, zhangliao:1, zhaoyun:1, zhenji:1, zhouyu:1, zhugeliang:1
  };
  ART.portraitUrl = function (key) { return ART.PORTRAITS[key] ? ('assets/generals/' + key + '.jpg') : null; };

  var NATC = { wei: '#3a6ea5', shu: '#b5432f', wu: '#2e8b57', qun: '#7a6b52', god: '#c8a13a' };
  var __emblemUid = 0;

  /* ---------- general emblem (fallback portrait) ---------- */
  ART.emblemSVG = function (gen, uid) {
    uid = uid || ++__emblemUid;
    var c = NATC[gen.nation] || '#555';
    var name = gen.cn || '';
    var chars = name.length >= 2 ? name : name;
    var fs = name.length >= 3 ? 62 : 84;
    var natc = SGS.NATIONS[gen.nation] ? SGS.NATIONS[gen.nation].cn : '';
    var gender = gen.gender === 'female' ? '♀' : '♂';
    // simple stylised silhouette (bust) so it doesn't read as a flat plate
    var body = gen.gender === 'female'
      ? '<path d="M180 250 q-70 8 -84 110 q-4 40 8 120 h152 q12 -80 8 -120 q-14 -102 -84 -110 Z"/><circle cx="180" cy="196" r="52"/>'
      : '<path d="M180 250 q-78 6 -92 116 q-6 44 6 114 h172 q12 -70 6 -114 q-14 -110 -92 -116 Z"/><circle cx="180" cy="192" r="56"/>';
    return '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">' +
      '<defs>' +
      '<linearGradient id="g-' + uid + '" x1="0" y1="0" x2="0.4" y2="1">' +
      '<stop offset="0" stop-color="' + shade(c, 46) + '"/><stop offset="0.55" stop-color="' + shade(c, -6) + '"/><stop offset="1" stop-color="' + shade(c, -48) + '"/></linearGradient>' +
      '<radialGradient id="v-' + uid + '" cx="0.5" cy="0.34" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/><stop offset="0.6" stop-color="#000000" stop-opacity="0.05"/><stop offset="1" stop-color="#000000" stop-opacity="0.5"/></radialGradient>' +
      '<linearGradient id="sheen-' + uid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.20"/><stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
      '<pattern id="grid-' + uid + '" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0 H0 V26" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/></pattern>' +
      '</defs>' +
      '<rect width="360" height="480" fill="url(#g-' + uid + ')"/>' +
      '<rect width="360" height="480" fill="url(#grid-' + uid + ')"/>' +
      // huge translucent nation-character watermark
      '<text x="180" y="330" font-family="' + "KaiTi,STKaiti,serif" + '" font-size="380" fill="#ffffff" fill-opacity="0.07" text-anchor="middle">' + natc + '</text>' +
      // silhouette bust
      '<g fill="#000000" fill-opacity="0.16">' + body + '</g>' +
      '<rect width="360" height="480" fill="url(#v-' + uid + ')"/>' +
      '<rect width="240" height="480" fill="url(#sheen-' + uid + ')"/>' +
      // ornate double frame + corner flourishes
      '<rect x="9" y="9" width="342" height="462" fill="none" stroke="#f2e9d0" stroke-opacity="0.55" stroke-width="2"/>' +
      '<rect x="16" y="16" width="328" height="448" fill="none" stroke="#f2e9d0" stroke-opacity="0.22" stroke-width="1"/>' +
      '<g stroke="#f2e9d0" stroke-opacity="0.7" stroke-width="3" fill="none">' +
      '<path d="M9 34 V9 H34"/><path d="M326 9 H351 V34"/><path d="M9 446 V471 H34"/><path d="M326 471 H351 V446"/></g>' +
      // seal
      '<rect x="252" y="28" width="76" height="76" rx="9" fill="#b0342c" stroke="#fff" stroke-opacity="0.6" stroke-width="2"/>' +
      '<text x="290" y="80" font-family="' + "KaiTi,STKaiti,serif" + '" font-size="48" fill="#fff" text-anchor="middle">' + natc + '</text>' +
      // gender glyph
      '<text x="40" y="66" font-family="serif" font-size="30" fill="#fff8e6" fill-opacity="0.85">' + gender + '</text>' +
      // name plate
      '<rect x="60" y="252" width="240" height="94" rx="8" fill="#00000030"/>' +
      '<text x="180" y="322" font-family="' + "KaiTi,STKaiti,'Songti SC',serif" + '" font-weight="700" font-size="' + fs + '" fill="#fff8e6" text-anchor="middle" style="letter-spacing:6px">' + esc(chars) + '</text>' +
      '<text x="180" y="378" font-family="' + "KaiTi,STKaiti,serif" + '" font-size="22" fill="#ffffff" fill-opacity="0.8" text-anchor="middle">' + esc(gen.title || '') + '</text>' +
      '</svg>';
  };
  ART.emblemDataUri = function (gen) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(ART.emblemSVG(gen)); };

  /* ---------- card icons ---------- */
  // glyph builders return inner SVG (100x100 viewBox), drawn in currentColor
  var G = {
    sword: '<path d="M50 8 L58 20 L54 66 L50 74 L46 66 L42 20 Z"/><rect x="38" y="66" width="24" height="7" rx="2"/><rect x="46" y="73" width="8" height="18" rx="2"/>',
    dao: '<path d="M30 86 Q34 40 74 16 Q66 44 44 70 Z"/><rect x="24" y="80" width="40" height="7" rx="3" transform="rotate(-30 44 83)"/>',
    spear: '<path d="M50 8 L58 26 L52 34 L52 88 L48 88 L48 34 L42 26 Z"/>',
    axe: '<path d="M28 22 Q66 14 70 46 Q60 40 44 42 L44 90 L38 90 L38 40 Q30 34 28 22 Z"/>',
    halberd: '<rect x="47" y="10" width="6" height="80"/><path d="M53 20 Q78 24 74 44 Q62 36 53 40 Z"/><path d="M47 20 Q22 24 26 44 Q38 36 47 40 Z"/>',
    bow: '<path d="M64 12 Q30 50 64 88" fill="none" stroke="currentColor" stroke-width="7"/><line x1="64" y1="12" x2="64" y2="88" stroke="currentColor" stroke-width="3"/><path d="M40 50 L74 50 M68 44 L76 50 L68 56" fill="none" stroke="currentColor" stroke-width="4"/>',
    crossbow: '<path d="M20 40 Q50 26 80 40" fill="none" stroke="currentColor" stroke-width="7"/><rect x="34" y="46" width="40" height="8" rx="2"/><rect x="46" y="46" width="8" height="34" rx="2"/><line x1="50" y1="40" x2="50" y2="30" stroke="currentColor" stroke-width="4"/>',
    shield: '<path d="M50 10 L82 22 V52 Q82 80 50 92 Q18 80 18 52 V22 Z"/>',
    bagua: '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="5"/><path d="M50 16 a17 17 0 0 1 0 34 a17 17 0 0 0 0 34 a34 34 0 0 1 0 -68" /><circle cx="50" cy="33" r="5" fill="#12341f"/><circle cx="50" cy="67" r="5"/>',
    leaf: '<path d="M50 12 Q84 40 50 90 Q16 40 50 12 Z" /><line x1="50" y1="22" x2="50" y2="82" stroke="#12341f" stroke-width="3"/>',
    horse: '<path d="M22 40 Q30 26 46 30 L58 22 Q60 30 54 36 Q72 40 74 62 L80 78 L70 78 L64 64 Q56 72 44 70 L48 84 L38 84 L34 66 Q24 58 22 40 Z"/>',
    peach: '<path d="M50 30 Q40 14 30 26 Q22 34 34 42 Q20 44 22 60 Q26 84 50 88 Q74 84 78 60 Q80 44 66 42 Q78 34 70 26 Q60 14 50 30 Z"/><path d="M50 30 Q54 20 62 18" fill="none" stroke="#12341f" stroke-width="3"/>',
    wine: '<path d="M36 20 H64 L60 34 Q72 46 72 66 Q72 88 50 88 Q28 88 28 66 Q28 46 40 34 Z"/><rect x="34" y="14" width="32" height="8" rx="2"/>',
    wind: '<path d="M18 34 H66 a10 10 0 1 0 -10 -10" fill="none" stroke="currentColor" stroke-width="7"/><path d="M14 54 H74 a12 12 0 1 1 -12 12" fill="none" stroke="currentColor" stroke-width="7"/><path d="M22 74 H54" fill="none" stroke="currentColor" stroke-width="7"/>',
    flame: '<path d="M50 88 Q22 74 34 46 Q40 54 46 52 Q40 30 58 12 Q54 34 68 42 Q66 34 72 32 Q86 56 66 78 Q60 86 50 88 Z"/>',
    bolt: '<path d="M56 8 L28 54 H46 L40 92 L74 40 H54 Z"/>',
    arrowsOut: '<g stroke="currentColor" stroke-width="6" fill="none"><line x1="50" y1="50" x2="50" y2="14"/><line x1="50" y1="50" x2="86" y2="50"/><line x1="50" y1="50" x2="50" y2="86"/><line x1="50" y1="50" x2="14" y2="50"/></g><path d="M50 10 l7 12 h-14 z M90 50 l-12 7 v-14 z M50 90 l-7 -12 h14 z M10 50 l12 -7 v14 z"/>',
    arrowsIn: '<g stroke="currentColor" stroke-width="6" fill="none"><line x1="16" y1="16" x2="42" y2="42"/><line x1="84" y1="16" x2="58" y2="42"/><line x1="16" y1="84" x2="42" y2="58"/><line x1="84" y1="84" x2="58" y2="58"/></g><path d="M46 46 l-16 2 l6 -14 z M54 46 l16 2 l-6 -14 z M46 54 l-16 -2 l6 14 z M54 54 l16 -2 l-6 14 z"/>',
    chain: '<g fill="none" stroke="currentColor" stroke-width="7"><ellipse cx="34" cy="40" rx="14" ry="20"/><ellipse cx="62" cy="60" rx="14" ry="20"/></g>',
    scroll: '<rect x="24" y="24" width="52" height="52" rx="4" fill="none" stroke="currentColor" stroke-width="6"/><line x1="18" y1="24" x2="82" y2="24" stroke="currentColor" stroke-width="7"/><line x1="18" y1="76" x2="82" y2="76" stroke="currentColor" stroke-width="7"/><line x1="36" y1="40" x2="64" y2="40" stroke="currentColor" stroke-width="4"/><line x1="36" y1="52" x2="64" y2="52" stroke="currentColor" stroke-width="4"/>',
    hand: '<path d="M34 46 V26 a5 5 0 0 1 10 0 V44 M44 44 V22 a5 5 0 0 1 10 0 V44 M54 44 V26 a5 5 0 0 1 10 0 V48 M64 48 V34 a5 5 0 0 1 10 0 V64 Q74 86 54 86 Q38 86 34 68 L26 54 a5 5 0 0 1 8 -8 Z" fill="none" stroke="currentColor" stroke-width="5"/>',
    swords: '<path d="M26 16 L40 30 M60 30 L74 16" stroke="currentColor" stroke-width="6" fill="none"/><path d="M30 84 L70 30 M70 84 L30 30" stroke="currentColor" stroke-width="7" fill="none"/>',
    wheat: '<line x1="50" y1="30" x2="50" y2="90" stroke="currentColor" stroke-width="5"/><g fill="currentColor"><path d="M50 30 q-14 -4 -18 12 q14 4 18 -12 Z"/><path d="M50 44 q-14 -4 -18 12 q14 4 18 -12 Z"/><path d="M50 58 q-14 -4 -18 12 q14 4 18 -12 Z"/><path d="M50 30 q14 -4 18 12 q-14 4 -18 -12 Z"/><path d="M50 44 q14 -4 18 12 q-14 4 -18 -12 Z"/><path d="M50 58 q14 -4 18 12 q-14 4 -18 -12 Z"/></g>',
    shieldx: '<path d="M50 12 L80 22 V50 Q80 78 50 90 Q20 78 20 50 V22 Z" fill="none" stroke="currentColor" stroke-width="6"/><path d="M38 40 L62 64 M62 40 L38 64" stroke="currentColor" stroke-width="7"/>',
    sparkle: '<path d="M50 14 L57 43 L86 50 L57 57 L50 86 L43 57 L14 50 L43 43 Z"/>',
    zzz: '<path d="M30 30 H54 L30 56 H56" fill="none" stroke="currentColor" stroke-width="6"/><path d="M52 54 H70 L52 72 H72" fill="none" stroke="currentColor" stroke-width="5"/>',
    brokengrain: '<line x1="42" y1="28" x2="42" y2="88" stroke="currentColor" stroke-width="5"/><g fill="currentColor"><path d="M42 30 q-12 -3 -15 10 q12 3 15 -10 Z"/><path d="M42 44 q-12 -3 -15 10 q12 3 15 -10 Z"/></g><path d="M20 60 L80 44" stroke="#12341f" stroke-width="5"/>'
  };

  // card name -> icon + tint + accent color
  var MAP = {
    sha:       { g: 'sword',    t: '#5a1f1a', c: '#ff6b5a' },
    shan:      { g: 'wind',     t: '#123a44', c: '#5fd4ea' },
    tao:       { g: 'peach',    t: '#4a1f2a', c: '#ff9bb0' },
    jiu:       { g: 'wine',     t: '#4a3510', c: '#f0c25a' },
    zhugeliannu:{ g: 'crossbow',t: '#2a323a', c: '#c4d0dc' },
    cixiongjian:{ g: 'sword',   t: '#2a323a', c: '#c4d0dc' },
    qinggangjian:{ g: 'sword',  t: '#2a323a', c: '#cfe0ee' },
    hanbingjian:{ g: 'sword',   t: '#1f3540', c: '#a8e0f0' },
    qinglongyanyuedao:{ g:'dao',t: '#2a3a2a', c: '#9be0a8' },
    zhangbashemao:{ g:'spear',  t: '#2a323a', c: '#c4d0dc' },
    guanshifu: { g: 'axe',      t: '#2a323a', c: '#d8c2a0' },
    fangtianhuaji:{ g:'halberd',t: '#2a323a', c: '#e0c48a' },
    qilingong: { g: 'bow',      t: '#2a323a', c: '#e0c48a' },
    bagua:     { g: 'bagua',    t: '#3a2f14', c: '#f0d68a' },
    renwang:   { g: 'shield',   t: '#3a2f14', c: '#e0c060' },
    tengjia:   { g: 'leaf',     t: '#213a1f', c: '#8fe08a' },
    dilu:      { g: 'horse',    t: '#1f3550', c: '#8fb8f0' },
    jueying:   { g: 'horse',    t: '#1f3550', c: '#8fb8f0' },
    zhuahuangfeidian:{ g:'horse',t:'#1f3550', c: '#8fb8f0' },
    chitu:     { g: 'horse',    t: '#213f2a', c: '#7fe0a0' },
    dayuan:    { g: 'horse',    t: '#213f2a', c: '#7fe0a0' },
    zixing:    { g: 'horse',    t: '#213f2a', c: '#7fe0a0' },
    wuzhongshengyou:{ g:'sparkle',t:'#33244a', c: '#c9a6f0' },
    guohechaiqiao:{ g:'hand',   t: '#33244a', c: '#c9a6f0' },
    shunshouqianyang:{ g:'hand',t: '#33244a', c: '#c9a6f0' },
    juedou:    { g: 'swords',   t: '#4a2320', c: '#ff9b8a' },
    jiedaosharen:{ g:'swords',  t: '#4a2320', c: '#ffb0a0' },
    huogong:   { g: 'flame',    t: '#4a2a12', c: '#ff9b4a' },
    tiesuolianhuan:{ g:'chain', t: '#2f3138', c: '#c0c8d4' },
    wuxiekeji: { g: 'shieldx',  t: '#33244a', c: '#c9a6f0' },
    wugufengdeng:{ g:'wheat',   t: '#3a3212', c: '#f0d868' },
    taoyuanjieyi:{ g:'peach',   t: '#3a1f2a', c: '#ff9bb0' },
    nanmanruqin:{ g:'arrowsIn', t: '#3a2a1f', c: '#e0b070' },
    wanjianqifa:{ g:'arrowsOut',t: '#3a2a1f', c: '#e0b070' },
    lebusishu: { g: 'zzz',      t: '#33244a', c: '#c9a6f0' },
    bingliangcunduan:{ g:'brokengrain',t:'#33244a', c: '#c9a6f0' },
    shandian:  { g: 'bolt',     t: '#2a2a4a', c: '#a6b0ff' }
  };

  ART.cardMeta = function (card) {
    var m = MAP[card.name] || { g: 'scroll', t: '#33244a', c: '#c9a6f0' };
    // element override for 杀
    if (card.name === 'sha' && card.element === 'fire') m = { g: 'flame', t: '#4a2a12', c: '#ff9b4a' };
    if (card.name === 'sha' && card.element === 'thunder') m = { g: 'bolt', t: '#2a2a4a', c: '#b0a6ff' };
    return m;
  };

  ART.cardIconSVG = function (card) {
    var m = ART.cardMeta(card);
    var glyph = G[m.g] || G.scroll;
    return '<svg class="ci" viewBox="0 0 100 100" width="100%" height="100%" style="color:' + m.c + '">' + glyph + '</svg>';
  };
  ART.cardTint = function (card) { return ART.cardMeta(card).t; };

  /* helpers */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
