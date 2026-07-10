/* ==========================================================================
 * 三分天下 · 界面与交互 (browser UI)
 *   - SGS.UI          rendering + interaction state machine
 *   - SGS.HumanAgent  promise-based agent resolved by clicks
 *   - SGS.BrowserAI   AI wrapper adding pacing so turns are watchable
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return; // headless: skip UI
  var U = SGS.util;

  var UI = SGS.UI = {
    game: null, me: null,
    selectablePlayers: [], selectedPlayers: [],
    selectableCards: [], selectedCards: [],
    cur: null,               // current pending interaction { resolve, ... }
    pending: null            // pendingPlay descriptor during play stage
  };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ============================ init ============================ */
  UI.start = function (game, me) {
    UI.game = game; UI.me = me;
    UI.activity = {};
    UI.activityVersion = 0;
    UI._lastMeSig = null; UI._lastOppSig = null;
    $('start').classList.add('hidden');
    $('table').classList.remove('hidden');
    $('topbar').classList.remove('hidden');
    game.logCallback = UI.onLog;
    game.uiHook = UI.onHook;
    UI.renderAll();
  };

  /* ============================ logging ============================ */
  var TICKER_KINDS = { turn: 1, damage: 1, heal: 1, skill: 1, trick: 1, basic: 1, equip: 1, draw: 1, death: 1, judge: 1, gain: 1, discard: 1, gameover: 1, reward: 1, penalty: 1 };
  var ACTIVITY_MARK = { damage: '伤', heal: '救', skill: '技', trick: '策', basic: '攻', equip: '装', death: '亡', judge: '判', reward: '赏', penalty: '罚' };
  var LOG_MAX_DOM = 500;
  UI.onLog = function (entry) {
    UI.recordActivity(entry);
    var log = $('log');
    if (log) {
      var d = el('div', 'entry l-' + (entry.kind || 'info'), entry.text);
      d.classList.add('new');
      log.appendChild(d);
      setTimeout(function () { d.classList.remove('new'); }, 600);
      while (log.childNodes.length > LOG_MAX_DOM) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }
    // surface the latest important action on the table
    if (entry.kind && TICKER_KINDS[entry.kind]) UI.setTicker(entry.text, entry.kind);
  };

  UI.recordActivity = function (entry) {
    var mark = ACTIVITY_MARK[entry.kind];
    if (!mark || !UI.game || !entry.text) return;
    var participants = UI.game.players.filter(function (player) {
      var generalName = player.general && player.general.cn;
      return entry.player === player.id || entry.text.indexOf(player.name) >= 0 || (generalName && entry.text.indexOf(generalName) >= 0);
    });
    if (!participants.length) return;
    participants.forEach(function (player) {
      var peer = participants.filter(function (candidate) { return candidate !== player; })[0];
      var peerName = peer ? ((peer.general && peer.general.cn) || peer.name) : '';
      var item = { kind: entry.kind, mark: mark, peer: peerName, text: entry.text };
      var list = UI.activity[player.id] || (UI.activity[player.id] = []);
      list.unshift(item);
      if (list.length > 5) list.length = 5;
    });
    UI.activityVersion++;
    UI._lastOppSig = null;
    UI._lastMeSig = null;
    UI.renderAll();
  };

  UI.activityEl = function (player, className) {
    var list = (UI.activity && UI.activity[player.id]) || [];
    var wrap = el('div', className || 'event-feed');
    wrap.setAttribute('aria-label', list.length ? '最近互动：' + list.map(function (item) { return item.text; }).join('；') : '暂无互动事件');
    if (!list.length) { wrap.classList.add('empty'); wrap.textContent = '暂无互动'; return wrap; }
    list.forEach(function (item) {
      var label = item.mark + (item.peer ? '·' + item.peer.slice(-2) : '');
      var chip = el('span', 'event-chip k-' + item.kind, label);
      chip.title = item.text;
      wrap.appendChild(chip);
    });
    return wrap;
  };
  UI.setTicker = function (text, kind) {
    var t = $('ticker'); if (!t) return;
    var label = { damage: '伤害', heal: '救援', skill: '技能', trick: '计策', basic: '出牌', equip: '装备', death: '阵亡', judge: '判定', turn: '回合' }[kind];
    t.textContent = (label ? label + '｜' : '') + text;
    t.className = 'k-' + (kind || 'info');
    t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
  };

  /* ============================ uiHook (animations) ============================ */
  UI.onHook = async function (type, data) {
    var snd = SGS.Sound;
    var Anim = SGS.Anim;
    switch (type) {
      case 'damage': if (snd) snd.play('damage'); await Anim.play('damage', data); break;
      case 'heal': if (snd) snd.play('heal'); await Anim.play('heal', data); break;
      case 'useCard': if (snd) snd.play(snd.forCard(data.card)); await Anim.play('useCard', data); break;
      case 'judge': if (snd) snd.play('judge'); await Anim.play('judge', data); break;
      case 'equip': if (snd) snd.play('equip'); await Anim.play('equip', data); break;
      case 'draw': if (snd) snd.play('draw'); await Anim.play('draw', data); break;
      case 'discard': await Anim.play('discard', data); break;
      case 'chain': if (snd) snd.play('thunder'); await Anim.play('chain', data); break;
      case 'rescue': if (snd) snd.play('tao'); await Anim.play('rescue', data); break;
      case 'dying': if (snd) snd.play('lose'); await Anim.play('dying', data); break;
      case 'death': if (snd) snd.play('death'); await Anim.play('death', data); break;
      case 'turnStart': if (snd) snd.play('turn'); UI.clearPlayArea(); await Anim.play('turnStart', data); break;
      case 'phase': await Anim.play('phase', data); break;
      case 'gameover': if (snd) snd.play(UI.didWin(data.winners) ? 'win' : 'lose'); UI.gameOver(data.winners); break;
      default: UI.renderAll(); break;
    }
  };

  UI.clearPlayArea = function () { var a = $('playArea'); if (a) clear(a); };

  UI.playerEl = function (p) { return document.querySelector('[data-seat="' + p.seat + '"]'); };
  UI.flash = function (p, cls) {
    var e = UI.playerEl(p); if (!e) return;
    e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
    setTimeout(function () { e.classList.remove(cls); }, 520);
  };
  UI.floatText = function (p, txt, cls) {
    var e = UI.playerEl(p); if (!e) return;
    var r = e.getBoundingClientRect();
    var f = el('div', 'float ' + cls, txt);
    f.style.left = (r.left + r.width / 2 - 10) + 'px';
    f.style.top = (r.top + 10) + 'px';
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  };

  // fly a card from source panel to the play area, then ring the targets
  UI.animateUseCard = function (p, card, targets) {
    var srcEl = (p === UI.me) ? $('me') : UI.playerEl(p);
    var area = $('playArea');
    UI.renderAll();
    // attack lines from source to each target
    (targets || []).forEach(function (t) { UI.connect(srcEl, UI.playerEl(t), card && card.name === 'sha' ? 'atk' : 'trk'); });
    if (!srcEl || !area || !card) { UI.showPlayed(card); return; }
    var from = srcEl.getBoundingClientRect();
    var to = area.getBoundingClientRect();
    var fly = UI.cardEl(card, { mini: true, noDetail: true });
    fly.classList.add('fly-card');
    fly.style.left = (from.left + from.width / 2 - 26) + 'px';
    fly.style.top = (from.top + 10) + 'px';
    document.body.appendChild(fly);
    void fly.offsetWidth;
    var dx = (to.left + to.width / 2 - 26) - (from.left + from.width / 2 - 26);
    var dy = (to.top + to.height / 2 - 36) - (from.top + 10);
    fly.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.25)';
    setTimeout(function () {
      fly.remove();
      UI.showPlayed(card);
      (targets || []).forEach(function (t) { UI.ringTarget(t); });
    }, 480);
  };
  UI.ringTarget = function (t) {
    var e = UI.playerEl(t); if (!e) return;
    var ring = el('div', 'target-ring'); e.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 1200);
  };
  // draw a temporary line between two elements (attack / trick pointer)
  UI.connect = function (aEl, bEl, cls) {
    if (!aEl || !bEl) return;
    var a = aEl.getBoundingClientRect(), b = bEl.getBoundingClientRect();
    var x1 = a.left + a.width / 2, y1 = a.top + a.height / 2, x2 = b.left + b.width / 2, y2 = b.top + b.height / 2;
    var len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    var line = el('div', 'fx-line ' + (cls || ''));
    line.style.left = x1 + 'px'; line.style.top = y1 + 'px';
    line.style.width = len + 'px'; line.style.transform = 'rotate(' + ang + 'deg)';
    document.body.appendChild(line);
    setTimeout(function () { line.classList.add('fade'); }, 260);
    setTimeout(function () { line.remove(); }, 700);
  };
  UI.spark = function (p) {
    var e = UI.playerEl(p); if (!e) return;
    var r = e.getBoundingClientRect();
    var s = el('div', 'fx-spark');
    s.style.left = (r.left + r.width / 2 - 24) + 'px'; s.style.top = (r.top + r.height / 2 - 24) + 'px';
    document.body.appendChild(s);
    setTimeout(function () { s.remove(); }, 500);
  };
  UI.vignette = function (color) {
    var v = el('div', 'fx-vignette');
    v.style.boxShadow = 'inset 0 0 200px 60px ' + (color || '#c0392b');
    document.body.appendChild(v);
    setTimeout(function () { v.classList.add('fade'); }, 40);
    setTimeout(function () { v.remove(); }, 900);
  };
  UI.shake = function (p) {
    var e = UI.playerEl(p); if (!e) return;
    e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
    setTimeout(function () { e.classList.remove('shake'); }, 450);
  };
  UI.rectOf = function (p) {
    var e = (p === UI.me) ? $('me') : UI.playerEl(p);
    return e ? e.getBoundingClientRect() : null;
  };
  UI.flyBetween = function (fromRect, toRect, cardOrBack, delay) {
    if (!fromRect || !toRect) return;
    var fly = cardOrBack === true ? el('div', 'card mini card-back') : UI.cardEl(cardOrBack, { mini: true, noDetail: true });
    fly.classList.add('fly-card');
    fly.style.left = (fromRect.left + fromRect.width / 2 - 26) + 'px';
    fly.style.top = (fromRect.top + fromRect.height / 2 - 36) + 'px';
    fly.style.opacity = '0';
    document.body.appendChild(fly);
    var dx = (toRect.left + toRect.width / 2 - 26) - (fromRect.left + fromRect.width / 2 - 26);
    var dy = (toRect.top + toRect.height / 2 - 36) - (fromRect.top + fromRect.height / 2 - 36);
    setTimeout(function () {
      void fly.offsetWidth; fly.style.opacity = '1';
      fly.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1)';
      setTimeout(function () { fly.style.opacity = '0'; setTimeout(function () { fly.remove(); }, 260); }, 420);
    }, delay || 0);
  };
  UI.animateEquip = function (p, card) {
    UI.renderAll();
    var pr = UI.rectOf(p);
    var area = $('playArea');
    if (pr && area) UI.flyBetween(area.getBoundingClientRect(), pr, card, 0);
    UI.flash(p, 'flash-heal');
    UI.floatText(p, '装备', 'heal');
  };
  UI.animateDraw = function (p, cards) {
    UI.renderAll();
    var deckPile = document.querySelector('#center .pile');
    var pr = UI.rectOf(p);
    if (!deckPile || !pr) return;
    var from = deckPile.getBoundingClientRect();
    var n = Math.min((cards || []).length, 5);
    for (var i = 0; i < n; i++) UI.flyBetween(from, pr, true, i * 90);
  };
  UI.showPlayed = function (card) {
    var area = $('playArea'); if (!area || !card) return;
    var c = UI.cardEl(card, { noDetail: true });
    if (!card.virtual) { c.style.cursor = 'pointer'; c.onclick = function () { UI.cardDetail(card); }; }
    clear(area); area.appendChild(c);
  };
  UI.animateJudge = function (p, card) {
    if (!card) return;
    var fx = $('judgeFx');
    if (!fx) { fx = el('div'); fx.id = 'judgeFx'; document.body.appendChild(fx); }
    clear(fx);
    var jc = UI.cardEl(card, { noDetail: true });
    jc.classList.add('jc');
    fx.appendChild(jc);
    setTimeout(function () { clear(fx); }, 1100);
  };
  UI.banner = function (text, color) {
    var b = $('banner'); if (!b) return;
    b.textContent = text; b.style.color = color || '#d9b45b';
    b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
    setTimeout(function () { b.classList.add('hidden'); }, 1150);
  };

  /* ============================ rendering ============================ */
  UI.roleLabel = function (p) {
    if (p.role === 'lord') return { t: '主公', c: 'lord' };
    if (p === UI.me || p.roleRevealed) return { t: SGS.ROLES[p.role].cn, c: p.role };
    return { t: '？', c: '' };
  };

  UI.hpEl = function (p) {
    var wrap = el('div', 'hp');
    for (var i = 0; i < p.maxHp; i++) {
      var m = el('div', 'mag');
      if (i < p.hp) {
        m.classList.add('on');
        if (p.hp <= 1) m.classList.add('lo'); else if (p.hp === 2) m.classList.add('hi');
      }
      wrap.appendChild(m);
    }
    return wrap;
  };

  UI.equipLine = function (p) {
    var wrap = el('div', 'equips');
    var slots = [['weapon', '武'], ['armor', '防'], ['offhorse', '-1'], ['defhorse', '+1']];
    for (var i = 0; i < slots.length; i++) {
      var c = p.equips[slots[i][0]];
      if (!c) continue;
      (function (card, tag) {
        var e = el('div', 'eq');
        var extra = '';
        if (card.subtype === 'weapon') extra = ' 〈范围' + (card.range || 1) + '〉';
        var k = el('span', 'k', tag + ' ');
        e.appendChild(k);
        e.appendChild(document.createTextNode(SGS.cardLabel(card) + extra));
        var selectable = p === UI.me && UI.selectableCards.indexOf(card.id) >= 0;
        if (selectable) {
          e.classList.add('selectable');
          if (UI.selectedCards.indexOf(card.id) >= 0) e.classList.add('selected');
          e.title = '点击选择';
          e.onclick = function (ev) { ev.stopPropagation(); UI.clickCard(card); };
        } else {
          e.title = '点击查看详情';
          e.style.cursor = 'pointer';
          e.onclick = function (ev) { ev.stopPropagation(); UI.cardDetail(card); };
        }
        wrap.appendChild(e);
      })(c, slots[i][1]);
    }
    return wrap;
  };

  // small badge shown on a card face for its key parameter
  UI.cardAttrText = function (card) {
    if (card.subtype === 'offhorse') return '-1';
    if (card.subtype === 'defhorse') return '+1';
    if (card.subtype === 'weapon') return '范围' + (card.range || 1);
    if (card.subtype === 'armor') return '防具';
    return null;
  };

  UI.portraitFallback = function (gen) {
    return SGS.ART ? SGS.ART.emblemDataUri(gen) : '';
  };
  UI.setPortrait = function (node, gen, asImg) {
    var url = SGS.ART && SGS.ART.portraitUrl(gen.key);
    var fallback = UI.portraitFallback(gen);
    if (asImg) {
      node.innerHTML = '';
      var im = document.createElement('img');
      im.alt = gen.cn || '';
      if (url) {
        im.src = url;
        im.onerror = function () { im.src = fallback; };
      } else {
        im.src = fallback;
      }
      node.appendChild(im);
    } else {
      if (fallback) node.style.backgroundImage = 'url("' + fallback + '")';
      if (url) {
        var tester = new Image();
        tester.onload = function () { node.style.backgroundImage = 'url("' + url + '")'; };
        tester.onerror = function () {};
        tester.src = url;
      }
    }
  };

  UI.portraitInto = function (node, gen) {
    UI.setPortrait(node, gen, false);
  };

  UI.playerPanel = function (p) {
    var panel = el('div', 'player');
    panel.dataset.seat = p.seat;
    panel.tabIndex = 0;
    panel.setAttribute('role', 'button');
    var distance = p.alive && UI.me && p !== UI.me ? UI.game.distance(UI.me, p) : null;
    var reverseDistance = p.alive && UI.me && p !== UI.me ? UI.game.distance(p, UI.me) : null;
    var myRange = UI.me ? UI.game.attackRange(UI.me) : 1;
    panel.setAttribute('aria-label', (p.general ? p.general.cn : p.name) + '，体力 ' + Math.max(0, p.hp) + '/' + p.maxHp + '，手牌 ' + p.hand.length + (distance == null ? '，已阵亡' : '，你到他的距离 ' + distance));
    if (!p.alive) panel.classList.add('dead');
    if (p === UI.game.current) panel.classList.add('turn');
    if (p.hp <= 0 && p.alive) panel.classList.add('dying');

    // portrait background + fade
    var pbg = el('div', 'pbg');
    if (p.general) UI.portraitInto(pbg, p.general);
    panel.appendChild(pbg);
    panel.appendChild(el('div', 'pfade'));

    var dist = el('div', 'distance-chip' + (distance != null && distance <= myRange ? ' in-range' : ''), distance == null ? '已阵亡' : distance <= myRange ? ('可攻击 · 距' + distance) : ('距离 ' + distance));
    dist.title = distance == null ? '该角色已经阵亡，不再计入座次距离' : '你 → ' + (p.general ? p.general.cn : p.name) + '：距离 ' + distance + '（你的攻击范围 ' + myRange + '）；对方 → 你：距离 ' + reverseDistance;
    panel.appendChild(dist);
    panel.appendChild(UI.activityEl(p));

    var content = el('div', 'p-content');
    var top = el('div', 'p-top');
    var nm = el('div', 'p-name', p.general ? p.general.cn : p.name);
    var role = UI.roleLabel(p);
    var rl = el('div', 'p-role ' + role.c, role.t);
    top.appendChild(nm); top.appendChild(rl);
    content.appendChild(top);

    var sub = el('div', 'p-sub');
    if (p.general) {
      var nb = el('span', 'nat-badge', SGS.NATIONS[p.nation].cn);
      nb.style.background = SGS.NATIONS[p.nation].color;
      sub.appendChild(nb);
      sub.appendChild(el('span', null, (p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : '') + ' ' + (p.general.title || '')));
    }
    content.appendChild(sub);
    content.appendChild(UI.hpEl(p));

    var info = el('div', 'p-info');
    info.appendChild(el('span', 'p-hand-ct', '手牌 ' + p.hand.length));
    info.appendChild(el('span', null, '座' + (p.seat + 1)));
    content.appendChild(info);
    content.appendChild(UI.equipLine(p));

    if (p.judgeZone.length) {
      var jz = el('div', 'judge');
      for (var j = 0; j < p.judgeZone.length; j++) {
        (function (jc) {
          var tag = el('span', 'jtag', jc.cn);
          tag.title = '点击查看详情';
          tag.onclick = function (ev) { ev.stopPropagation(); UI.cardDetail(jc); };
          jz.appendChild(tag);
        })(p.judgeZone[j]);
      }
      content.appendChild(jz);
    }
    panel.appendChild(content);

    var badges = el('div', 'badges');
    if (p.chained) badges.appendChild(el('span', null, '⛓'));
    if (!p.faceUp) badges.appendChild(el('span', null, '🔄'));
    panel.appendChild(badges);

    var status = el('div', 'status-line');
    if (p === UI.game.current) status.textContent = SGS.PHASE_CN[UI.game.phase] || '';
    panel.appendChild(status);

    if (!p.alive) { var st = el('div', 'dead-stamp', '阵亡'); panel.appendChild(st); }

    // inspect affordance (always available)
    var insp = el('div', 'inspect', 'ⓘ');
    insp.onclick = function (e) { e.stopPropagation(); UI.generalDetail(p); };
    panel.appendChild(insp);

    // selectable target vs inspect on click
    if (UI.selectablePlayers.indexOf(p) >= 0) {
      panel.classList.add('selectable');
      panel.onclick = function () { UI.clickPlayer(p); };
    } else {
      panel.onclick = function () { UI.generalDetail(p); };
    }
    panel.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); panel.click(); } };
    if (UI.selectedPlayers.indexOf(p) >= 0) panel.classList.add('selected');

    return panel;
  };

  UI.cardEl = function (card, opts) {
    opts = opts || {};
    var c = el('div', 'card' + (opts.mini ? ' mini' : ''));
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    c.setAttribute('aria-label', opts.back ? '一张背面朝上的牌' : SGS.cardLabel(card));
    if (opts.back) { c.classList.add('card-back'); return c; }
    var suit = SGS.SUITS[card.suit];
    // art layer (tint + icon)
    if (SGS.ART) {
      var art = el('div', 'cart');
      art.style.background = 'linear-gradient(160deg,' + SGS.ART.cardTint(card) + '33,' + SGS.ART.cardTint(card) + '18)';
      art.innerHTML = SGS.ART.cardIconSVG(card);
      c.appendChild(art);
    }
    if (suit) {
      var s = el('div', 'suit ' + suit.color, suit.symbol);
      var r = el('div', 'rank ' + suit.color, SGS.rankName(card.rank));
      c.appendChild(s); c.appendChild(r);
      var br = el('div', 'corner-br ' + suit.color, suit.symbol + SGS.rankName(card.rank));
      c.appendChild(br);
    }
    c.appendChild(el('div', 'cn', card.cn));
    var typ = card.type === 'equip' ? (card.subtype === 'weapon' ? '武器' : card.subtype === 'armor' ? '防具' : '坐骑') : card.type === 'trick' ? (card.subtype === 'delay' ? '延时锦囊' : '锦囊') : '基本';
    c.appendChild(el('div', 'typ', typ));
    // key parameter badge (horse ±1 / weapon range / armor)
    var attr = UI.cardAttrText(card);
    if (attr) {
      var ab = el('div', 'card-attr' + (card.subtype === 'offhorse' ? ' off' : card.subtype === 'defhorse' ? ' def' : ''), attr);
      c.appendChild(ab);
    }
    if (card.type === 'trick' && card.subtype === 'delay') c.classList.add('delay-card');
    // right-click / long-press to inspect (works for any rendered card)
    if (!opts.noDetail && !card.virtual) {
      c.oncontextmenu = function (e) { e.preventDefault(); UI.cardDetail(card); };
      var lpTimer = null, moved = false;
      c.addEventListener('touchstart', function () { moved = false; lpTimer = setTimeout(function () { if (!moved) { lpTimer = null; UI.cardDetail(card); } }, 480); }, { passive: true });
      c.addEventListener('touchmove', function () { moved = true; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
      c.addEventListener('touchend', function (e) { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } else { e.preventDefault(); } }, { passive: false });
    }
    c.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); c.click(); } };
    return c;
  };

  UI.renderOpponents = function () {
    var others = UI.game.players.filter(function (p) { return p !== UI.me; });
    var sig = SGS.Presentation.opponentsSignature(UI.game, others, UI.selectablePlayers, UI.selectedPlayers) + '|activity=' + UI.activityVersion;
    if (sig === UI._lastOppSig) return;
    UI._lastOppSig = sig;
    var wrap = $('opponents');
    if (SGS.Table) SGS.Table.arrangeOpponents(wrap, others, UI.game.current);
    else { clear(wrap); for (var i = 0; i < others.length; i++) wrap.appendChild(UI.playerPanel(others[i])); }
  };

  UI.renderMe = function () {
    var p = UI.me;
    var sig = SGS.Presentation.selfSignature(UI.game, p, UI.selectableCards, UI.selectedCards) + '|activity=' + UI.activityVersion;
    if (sig === UI._lastMeSig) return;
    UI._lastMeSig = sig;
    var av = $('meAvatar');
    if (av) { av.innerHTML = ''; if (p.general) { UI.setPortrait(av, p.general, true); } av.style.cursor = 'pointer'; av.onclick = function () { UI.generalDetail(p); }; }
    $('meGeneral').textContent = (p.general ? p.general.cn : p.name) + '（' + UI.roleLabel(p).t + '）';
    var meHp = $('meHp'); clear(meHp); meHp.appendChild(UI.hpEl(p));
    var meRange = $('meRange');
    if (meRange) { var range = UI.game.attackRange(p); meRange.textContent = '攻击范围 ' + range; meRange.title = '装备与技能修正后的当前攻击范围'; }
    var nat = $('meNation');
    nat.textContent = p.general ? SGS.NATIONS[p.nation].cn : '';
    nat.style.background = p.general ? SGS.NATIONS[p.nation].color : 'transparent';
    // skills (clickable for detail)
    var sk = $('meSkills'); clear(sk);
    var seen = {};
    for (var i = 0; i < p.skills.length; i++) {
      (function (s) {
        if (seen[s.name]) return; seen[s.name] = 1;
        var tag = el('span', 'skill-tag active', s.cn);
        tag.title = s.desc || '';
        tag.onclick = function () { UI.skillDetail(s); };
        sk.appendChild(tag);
      })(p.skills[i]);
    }
    // equip line for me (clickable)
    var meEq = $('meEquip'); clear(meEq);
    var eqline = UI.equipLine(p);
    meEq.appendChild(eqline);
    if (p.judgeZone.length) {
      var jz = el('div', 'judge');
      for (var j = 0; j < p.judgeZone.length; j++) {
        (function (jc) { var tag = el('span', 'jtag', jc.cn); tag.onclick = function () { UI.cardDetail(jc); }; jz.appendChild(tag); })(p.judgeZone[j]);
      }
      meEq.appendChild(jz);
    }
    var meEvents = $('meEvents');
    if (meEvents) { clear(meEvents); meEvents.appendChild(UI.activityEl(p, 'event-feed me-event-feed')); }

    // hand
    var hand = $('hand'); clear(hand);
    for (var h = 0; h < p.hand.length; h++) {
      (function (card) {
        var ce = UI.cardEl(card);
        var selectable = UI.selectableCards.indexOf(card.id) >= 0;
        if (selectable) { ce.classList.add('selectable'); ce.onclick = function () { UI.clickCard(card); }; }
        else { if (UI.cur) ce.classList.add('disabled'); ce.onclick = function () { UI.cardDetail(card); }; } // inspect when not actionable
        if (UI.selectedCards.indexOf(card.id) >= 0) ce.classList.add('selected');
        hand.appendChild(ce);
      })(p.hand[h]);
    }
  };

  UI.renderAll = function () {
    if (!UI.game) return;
    UI.renderOpponents();
    UI.renderMe();
    $('deckCount').textContent = UI.game.deck.length;
    $('discardCount').textContent = UI.game.discard.length;
    $('phaseBadge').textContent = UI.game.current ? (UI.game.current.name + ' · ' + (SGS.PHASE_CN[UI.game.phase] || '')) : '';
    var phaseItems = document.querySelectorAll('#phaseRail [data-phase]');
    for (var i = 0; i < phaseItems.length; i++) {
      var active = phaseItems[i].getAttribute('data-phase') === UI.game.phase;
      phaseItems[i].classList.toggle('active', active);
      if (active) phaseItems[i].setAttribute('aria-current', 'step'); else phaseItems[i].removeAttribute('aria-current');
    }
  };

  /* ============================ interaction plumbing ============================ */
  UI.setHint = function (txt) {
    var hint = $('hint');
    hint.textContent = txt || '牌局正在结算…';
    var bar = hint.closest ? hint.closest('.command-bar') : null;
    if (bar) bar.classList.toggle('awaiting-input', !!txt);
  };
  UI.clearControls = function () {
    UI.selectablePlayers = []; UI.selectedPlayers = [];
    UI.selectableCards = []; UI.selectedCards = [];
    var act = $('actions'); clear(act);
  };
  UI.actionBtn = function (label, cls, onclick, disabled) {
    var b = el('button', 'act-btn' + (cls ? ' ' + cls : ''), label);
    if (disabled) b.disabled = true;
    b.onclick = onclick;
    b.type = 'button';
    $('actions').appendChild(b);
    return b;
  };

  UI.finish = function (result) {
    var resolve = UI.cur && UI.cur.resolve;
    UI.cur = null; UI.pending = null;
    UI.clearControls();
    UI.setHint('');
    if (SGS.InteractionState) SGS.InteractionState.enter('idle');
    UI.renderAll();
    if (resolve) resolve(result);
  };

  UI.setStageHint = function (txt) {
    var s = $('stageHint'); if (!s) return;
    s.textContent = txt || '';
    s.classList.toggle('show', !!txt);
  };
  UI.highlightCurrent = function (p) {
    // renderAll will apply .turn class based on game.current
    UI.renderAll();
  };

  UI.clickPlayer = function (p) {
    if (SGS.InteractionState) SGS.InteractionState.playerClick(p);
  };
  UI.clickCard = function (card) {
    if (SGS.InteractionState) SGS.InteractionState.cardClick(card);
  };
  UI.findCard = function (id) {
    for (var i = 0; i < UI.me.hand.length; i++) if (UI.me.hand[i].id === id) return UI.me.hand[i];
    for (var k in UI.me.equips) { if (UI.me.equips[k] && UI.me.equips[k].id === id) return UI.me.equips[k]; }
    return null;
  };

  /* ============================ Human agent ============================ */
  SGS.HumanAgent = {
    decide: function (game, player, req) {
      return new Promise(function (resolve) {
        UI.cur = { resolve: resolve, req: req };
        UI.dispatch(req, resolve);
      });
    }
  };

  UI.dispatch = function (req, resolve) {
    UI.clearControls();
    if (SGS.InteractionState) SGS.InteractionState.enter('interactive', { req: req, resolve: resolve });
    switch (req.type) {
      case 'play': return UI.uiPlay(req);
      case 'respond': return UI.uiRespond(req);
      case 'wuxie': return UI.uiWuxie(req);
      case 'rescue': return UI.uiRescue(req);
      case 'discard': return UI.uiDiscard(req);
      case 'chooseCards': return UI.uiChooseCards(req);
      case 'chooseZoneCard': return UI.uiChooseZoneCard(req);
      case 'choosePlayers': return UI.uiChoosePlayers(req);
      case 'chooseOption': return UI.uiChooseOption(req);
      case 'confirm': return UI.uiConfirm(req);
      case 'guanxing': return UI.uiGuanxing(req);
      default: return UI.finish(null);
    }
  };

  /* ---------- play phase ---------- */
  UI.uiPlay = function (req) {
    UI.setHint('出牌阶段：选择一张牌或技能使用');
    var options = req.options || [];
    // map real hand-card options
    var cardOpts = {};    // cardId -> option
    var viewAsOpts = [];  // view-as (kind card w/ viewAs)
    var alternateCardOpts = []; // alternate uses of a real card (e.g. 重铸)
    var skillOpts = [];   // active skills
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (o.kind === 'skill') { skillOpts.push(o); continue; }
      if (o.viewAs) { viewAsOpts.push(o); continue; }
      if (o.reforge) { alternateCardOpts.push(o); continue; }
      if (o.card) cardOpts[o.card.id] = o;
    }
    UI.selectableCards = Object.keys(cardOpts);
    UI.cur.cardMode = 'single';

    function resetSelection() {
      UI.pending = null;
      UI.selectedCards = []; UI.selectedPlayers = [];
      UI.selectablePlayers = [];
      UI.cur.onSelectChange = null;
      UI.cur.cardClick = playCardClick;
      UI.selectableCards = Object.keys(cardOpts);
      buildBar();
      UI.setHint('出牌阶段：选择一张牌或技能使用');
      UI.renderAll();
    }

    UI.cur.onCardPicked = function (card) {
      var o = cardOpts[card.id];
      if (!o) return;
      UI.beginPlayOption(o, [card], resetSelection);
    };
    // selecting a playable hand card starts the option
    function playCardClick(card) {
      if (cardOpts[card.id]) UI.cur.onCardPicked(card);
    }
    UI.cur.cardClick = playCardClick;

    function buildBar() {
      var act = $('actions'); clear(act);
      // view-as & skill buttons
      viewAsOpts.forEach(function (o) {
        UI.actionBtn(o.cn, '', function () { UI.beginViewAs(o, resetSelection); });
      });
      alternateCardOpts.forEach(function (o) {
        UI.actionBtn('重铸·' + o.card.cn, '', function () { UI.beginPlayOption(o, [o.card], resetSelection); });
      });
      skillOpts.forEach(function (o) {
        UI.actionBtn(o.cn, '', function () { UI.beginSkill(o, resetSelection); });
      });
      UI.actionBtn('结束回合', '', function () { UI.finish({ end: true }); });
    }
    buildBar();
    UI.renderAll();
  };

  UI.beginPlayOption = function (o, subcards, reset) {
    // o is a real card option; subcards is [the card]
    var card = o.card;
    UI.selectedCards = subcards.map(function (c) { return c.id; });
    UI.selectableCards = subcards.map(function (c) { return c.id; }); // keep visible-selected
    if (o.maxTargets > 0) {
      UI.selectablePlayers = o.candidates.slice();
      UI.selectedPlayers = [];
      UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi';
      UI.cur.maxP = o.maxTargets;
      UI.setHint(card.cn + '：选择目标（' + o.minTargets + '~' + o.maxTargets + '）');
      var act = $('actions'); clear(act);
      var confirm = UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedPlayers.length < o.minTargets) return;
        UI.finish({ kind: 'card', card: card, targets: UI.selectedPlayers.slice() });
      }, true);
      UI.actionBtn('取消', '', reset);
      UI.cur.onSelectChange = function () { confirm.disabled = UI.selectedPlayers.length < o.minTargets || UI.selectedPlayers.length > o.maxTargets; };
    } else {
      UI.setHint('使用 ' + card.cn + '？');
      var act2 = $('actions'); clear(act2);
      UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'card', card: card, targets: [], reforge: !!o.reforge }); });
      UI.actionBtn('取消', '', reset);
    }
    UI.renderAll();
  };

  UI.beginViewAs = function (o, reset) {
    // choose subcards from o.pool then targets
    var convert = o.convert || 1;
    var pool = (o.pool || []).map(function (c) { return c.id; });
    UI.selectableCards = pool;
    UI.selectedCards = [];
    UI.selectablePlayers = [];
    UI.cur.cardMode = convert === 1 ? 'single' : 'multi';
    UI.cur.maxC = convert;
    UI.cur.cardClick = function (card) {
      if (pool.indexOf(card.id) < 0) return;
      if (convert === 1) UI.selectedCards = [card.id];
      else { var i = UI.selectedCards.indexOf(card.id); if (i >= 0) UI.selectedCards.splice(i, 1); else if (UI.selectedCards.length < convert) UI.selectedCards.push(card.id); }
      updateStage(); UI.renderAll();
    };
    UI.setHint(o.cn + '：选择 ' + convert + ' 张牌');
    function updateStage() {
      var act = $('actions'); clear(act);
      var ready = UI.selectedCards.length === convert;
      if (ready && o.maxTargets > 0) {
        UI.selectablePlayers = o.candidates.slice();
        UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi';
        UI.cur.maxP = o.maxTargets;
        UI.setHint(o.cn + '：选择目标');
      } else { UI.selectablePlayers = []; }
      var confirm = UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedCards.length !== convert) return;
        if (o.maxTargets > 0 && (UI.selectedPlayers.length < o.minTargets)) return;
        var subs = UI.selectedCards.map(UI.findCard);
        var v = SGS.virtualCard(o.name, { subcards: subs, suit: subs[0].suit, rank: subs[0].rank });
        UI.finish({ kind: 'card', card: v, targets: UI.selectedPlayers.slice() });
      }, !(ready && (o.maxTargets === 0 || UI.selectedPlayers.length >= o.minTargets)));
      UI.actionBtn('取消', '', reset);
      UI.cur.onSelectChange = function () { updateStage(); };
    }
    updateStage();
    UI.renderAll();
  };

  UI.beginSkill = function (o, reset) {
    var skill = o.skill;
    // special sub-inputs
    if (skill === 'zhiheng') {
      var zhihengPool = UI.me.hand.slice();
      for (var zk in UI.me.equips) if (UI.me.equips[zk]) zhihengPool.push(UI.me.equips[zk]);
      UI.selectableCards = zhihengPool.map(function (c) { return c.id; });
      UI.selectedCards = []; UI.cur.cardMode = 'multi'; UI.cur.maxC = 99;
      UI.cur.cardClick = function (card) { var i = UI.selectedCards.indexOf(card.id); if (i >= 0) UI.selectedCards.splice(i, 1); else UI.selectedCards.push(card.id); upd(); UI.renderAll(); };
      UI.setHint('制衡：选择要弃置替换的牌');
      var upd = function () { var act = $('actions'); clear(act); var b = UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'skill', skill: 'zhiheng', zhihengCards: UI.selectedCards.map(UI.findCard) }); }, UI.selectedCards.length < 1); UI.actionBtn('取消', '', reset); };
      upd(); UI.renderAll(); return;
    }
    if (skill === 'rende') {
      UI.selectablePlayers = o.candidates.slice(); UI.cur.playerMode = 'single';
      UI.setHint('仁德：选择赠予的角色');
      UI.cur.onSelectChange = function () { step2(); };
      var step2 = function () {
        if (!UI.selectedPlayers.length) return;
        UI.selectableCards = UI.me.hand.map(function (c) { return c.id; }); UI.cur.cardMode = 'multi';
        UI.cur.cardClick = function (card) { var i = UI.selectedCards.indexOf(card.id); if (i >= 0) UI.selectedCards.splice(i, 1); else UI.selectedCards.push(card.id); render2(); UI.renderAll(); };
        render2();
      };
      var render2 = function () {
        var act = $('actions'); clear(act);
        UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'skill', skill: 'rende', targets: UI.selectedPlayers.slice(), giveCards: UI.selectedCards.map(UI.findCard) }); }, !(UI.selectedPlayers.length && UI.selectedCards.length));
        UI.actionBtn('取消', '', reset);
      };
      render2(); UI.renderAll(); return;
    }

    // generic cost-first flow: discardHand / equip
    var cost = o.meta && o.meta.cost;
    if (cost) {
      var costType = cost.type;
      var minC = cost.min || 1, maxC = cost.max || 1;
      var costPool = [];
      if (costType === 'discardHand') {
        costPool = UI.me.hand.map(function (c) { return c.id; });
        UI.setHint(o.cn + '：选择要弃置的 ' + minC + (maxC > minC ? '~' + maxC : '') + ' 张手牌');
      } else if (costType === 'equip') {
        costPool = [];
        for (var k in UI.me.equips) { if (UI.me.equips[k]) costPool.push(UI.me.equips[k].id); }
        UI.setHint(o.cn + '：选择要弃置的装备');
      } else {
        cost = null; // unknown cost type, fall through to generic
      }
      if (cost) {
        UI.selectableCards = costPool;
        UI.selectedCards = [];
        UI.cur.cardMode = maxC === 1 ? 'single' : 'multi';
        UI.cur.maxC = maxC;
        UI.cur.cardClick = function (card) {
          if (costPool.indexOf(card.id) < 0) return;
          var i = UI.selectedCards.indexOf(card.id);
          if (i >= 0) UI.selectedCards.splice(i, 1);
          else if (UI.selectedCards.length < maxC) UI.selectedCards.push(card.id);
          updateCostStage(); UI.renderAll();
        };
        function updateCostStage() {
          var ready = UI.selectedCards.length >= minC && UI.selectedCards.length <= maxC;
          UI.selectablePlayers = ready ? o.candidates.slice() : [];
          UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi';
          UI.cur.maxP = o.maxTargets;
          var act = $('actions'); clear(act);
          var canFinish = ready && (o.maxTargets === 0 || UI.selectedPlayers.length >= o.minTargets);
          UI.actionBtn('确定', 'primary', function () {
            if (UI.selectedCards.length < minC || UI.selectedCards.length > maxC) return;
            if (o.maxTargets > 0 && UI.selectedPlayers.length < o.minTargets) return;
            var payload = { kind: 'skill', skill: skill, targets: UI.selectedPlayers.slice() };
            if (costType === 'discardHand') payload.costCards = UI.selectedCards.map(UI.findCard);
            else if (costType === 'equip') payload.costEquip = UI.findCard(UI.selectedCards[0]);
            UI.finish(payload);
          }, !canFinish);
          UI.actionBtn('取消', '', reset);
        }
        UI.cur.onSelectChange = updateCostStage;
        updateCostStage(); UI.renderAll();
        return;
      }
    }

    // generic active skill: pick targets if needed
    if (o.maxTargets > 0) {
      UI.selectablePlayers = o.candidates.slice();
      UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi'; UI.cur.maxP = o.maxTargets;
      UI.setHint(o.cn + '：选择目标（' + o.minTargets + '~' + o.maxTargets + '）');
      var render = function () {
        var act = $('actions'); clear(act);
        UI.actionBtn('确定', 'primary', function () { if (UI.selectedPlayers.length < o.minTargets) return; UI.finish({ kind: 'skill', skill: skill, targets: UI.selectedPlayers.slice() }); }, UI.selectedPlayers.length < o.minTargets);
        UI.actionBtn('取消', '', reset);
      };
      UI.cur.onSelectChange = render; render(); UI.renderAll();
    } else {
      UI.setHint(o.cn + '：确认发动？');
      var act = $('actions'); clear(act);
      UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'skill', skill: skill, targets: [] }); });
      UI.actionBtn('取消', '', reset);
    }
  };

  /* ---------- respond (闪/杀/桃/无懈) ---------- */
  UI.optionAsButtonsAndCards = function (req, onPick, cancelLabel) {
    var options = req.options || [];
    // highlight real hand cards that correspond to options
    var byCard = {};
    var specials = [];
    options.forEach(function (o) { if (o.card && !o.card.virtual && UI.findCard(o.card.id)) byCard[o.card.id] = o; else specials.push(o); });
    UI.selectableCards = Object.keys(byCard);
    UI.cur.cardClick = function (card) { if (byCard[card.id]) onPick(byCard[card.id]); };
    var act = $('actions'); clear(act);
    specials.forEach(function (o) { UI.actionBtn(o.label || (o.card ? o.card.cn : '选项'), '', function () { onPick(o); }); });
    UI.actionBtn(cancelLabel || '放弃', '', function () { UI.finish(null); });
    UI.renderAll();
  };

  UI.uiRespond = function (req) {
    UI.setHint(req.reason || '请响应');
    UI.optionAsButtonsAndCards(req, function (o) { UI.finish({ option: o }); }, '放弃');
  };

  UI.uiWuxie = function (req) {
    UI.setHint(req.reason || '是否使用无懈可击？');
    UI.optionAsButtonsAndCards(req, function (o) { UI.finish({ option: o }); }, '放弃');
  };

  UI.uiRescue = function (req) {
    var dying = req.dying;
    var need = (req.canWine && dying === UI.me) ? 'peachOrWine' : 'tao';
    var options = req.options || SGS.gatherResponses(UI.game, UI.me, need, {});
    UI.setHint(req.reason || (dying.name + ' 濒死，是否出桃？'));
    // build options like respond: real 桃/酒 highlight + view-as buttons
    var byCard = {}; var specials = [];
    options.forEach(function (o) { if (o.card && !o.card.virtual && UI.findCard(o.card.id)) byCard[o.card.id] = o; else specials.push(o); });
    UI.selectableCards = Object.keys(byCard);
    UI.cur.cardClick = function (card) { if (byCard[card.id]) UI.finish({ option: byCard[card.id], card: byCard[card.id].card }); };
    var act = $('actions'); clear(act);
    specials.forEach(function (o) { UI.actionBtn(o.label || o.card.cn, '', function () { UI.finish({ option: o, card: o.card }); }); });
    UI.actionBtn('放弃', '', function () { UI.finish(null); });
    UI.renderAll();
  };

  /* ---------- discard ---------- */
  UI.uiDiscard = function (req) {
    var count = req.count;
    UI.setHint('弃牌阶段：请弃置 ' + count + ' 张手牌');
    UI.selectableCards = UI.me.hand.map(function (c) { return c.id; });
    UI.cur.cardMode = 'multi'; UI.cur.maxC = count;
    UI.cur.cardClick = function (card) {
      var i = UI.selectedCards.indexOf(card.id);
      if (i >= 0) UI.selectedCards.splice(i, 1);
      else { if (UI.selectedCards.length >= count) UI.selectedCards.shift(); UI.selectedCards.push(card.id); }
      upd(); UI.renderAll();
    };
    var upd = function () { var act = $('actions'); clear(act); UI.actionBtn('确定', 'primary', function () { if (UI.selectedCards.length !== count) return; UI.finish({ cards: UI.selectedCards.map(UI.findCard) }); }, UI.selectedCards.length !== count); };
    upd(); UI.renderAll();
  };

  /* ---------- chooseCards ---------- */
  UI.uiChooseCards = function (req) {
    var from = req.from || []; var min = req.min || 0, max = req.max || from.length;
    if (from.length === 0) { UI.finish({ cards: [] }); return; } // nothing to pick — escape
    UI.setHint((req.reason || '选择牌') + '（' + min + '~' + max + '）');
    var ids = from.map(function (c) { return c.id; });
    UI.selectableCards = ids; UI.cur.cardMode = 'multi'; UI.cur.maxC = max;
    UI.cur.cardClick = function (card) {
      if (ids.indexOf(card.id) < 0) return;
      var i = UI.selectedCards.indexOf(card.id);
      if (i >= 0) UI.selectedCards.splice(i, 1);
      else { if (UI.selectedCards.length >= max) UI.selectedCards.shift(); UI.selectedCards.push(card.id); }
      upd(); UI.renderAll();
    };
    var findFrom = function (id) { for (var i = 0; i < from.length; i++) if (from[i].id === id) return from[i]; return null; };
    var upd = function () { var act = $('actions'); clear(act); UI.actionBtn('确定', 'primary', function () { if (UI.selectedCards.length < min || UI.selectedCards.length > max) return; UI.finish({ cards: UI.selectedCards.map(findFrom) }); }, UI.selectedCards.length < min); };
    upd(); UI.renderAll();
  };

  /* ---------- chooseZoneCard ---------- */
  UI.uiChooseZoneCard = function (req) {
    UI.setHint(req.reason || ('选择 ' + req.target.name + ' 的一张牌'));
    var act = $('actions'); clear(act);
    (req.options || []).forEach(function (o) { UI.actionBtn(o.label, '', function () { UI.finish({ option: o }); }); });
    UI.renderAll();
  };

  /* ---------- choosePlayers ---------- */
  UI.uiChoosePlayers = function (req) {
    var min = req.min || 1, max = req.max || 1;
    UI.setHint((req.reason || '选择角色') + '（' + min + '~' + max + '）');
    UI.selectablePlayers = (req.candidates || []).slice();
    UI.cur.playerMode = max === 1 ? 'single' : 'multi'; UI.cur.maxP = max;
    var render = function () { var act = $('actions'); clear(act); UI.actionBtn('确定', 'primary', function () { if (UI.selectedPlayers.length < min) return; UI.finish({ players: UI.selectedPlayers.slice() }); }, UI.selectedPlayers.length < min); };
    UI.cur.onSelectChange = render; render(); UI.renderAll();
  };

  /* ---------- chooseOption ---------- */
  UI.uiChooseOption = function (req) {
    UI.setHint(req.reason || '请选择');
    var act = $('actions'); clear(act);
    (req.choices || []).forEach(function (c) { UI.actionBtn(c.label, '', function () { UI.finish({ key: c.key }); }); });
    UI.renderAll();
  };

  /* ---------- confirm ---------- */
  UI.uiConfirm = function (req) {
    UI.setHint(req.reason || '确认？');
    var act = $('actions'); clear(act);
    UI.actionBtn('是', 'primary', function () { UI.finish({ yes: true }); });
    UI.actionBtn('否', '', function () { UI.finish({ yes: false }); });
    UI.renderAll();
  };

  /* ---------- 观星 (reorder top of deck) ---------- */
  UI.uiGuanxing = function (req) {
    UI.setHint('');
    var cards = req.cards || [];
    var bottom = {};   // id -> true if marked 置底
    UI.openModal(function (box) {
      UI.modalMandatory = true;
      box.querySelector('.close-x').style.display = 'none'; // must decide
      box.appendChild(el('h2', null, '观星'));
      box.appendChild(el('div', 'gx-hint', '牌堆顶 ' + cards.length + ' 张（左＝先摸）。点击卡牌切换「留顶／置底」，然后确定。'));
      var row = el('div', 'gx-row');
      cards.forEach(function (c) {
        var wrap = el('div', 'gx-card');
        var ce = UI.cardEl(c, { noDetail: true });
        wrap.appendChild(ce);
        var lbl = el('div', 'gx-label top', '留顶');
        wrap.appendChild(lbl);
        wrap.onclick = function () {
          bottom[c.id] = !bottom[c.id];
          wrap.classList.toggle('to-bottom', bottom[c.id]);
          lbl.textContent = bottom[c.id] ? '置底' : '留顶';
          lbl.className = 'gx-label ' + (bottom[c.id] ? 'bot' : 'top');
        };
        row.appendChild(wrap);
      });
      box.appendChild(row);
      var bar = el('div', 'set-row');
      var ok = el('button', 'btn-primary', '确定');
      ok.onclick = function () {
        var topIds = [], bottomIds = [];
        cards.forEach(function (c) { (bottom[c.id] ? bottomIds : topIds).push(c.id); });
        UI.closeModalForce();
        UI.finish({ topIds: topIds, bottomIds: bottomIds });
      };
      bar.appendChild(ok);
      box.appendChild(bar);
    });
  };

  /* ============================ Modals & detail views ============================ */
  UI.openModal = function (buildFn) {
    UI.modalMandatory = false;
    var m = $('modal'); m.classList.remove('hidden');
    var box = m.querySelector('.modal-box'); clear(box);
    var x = el('button', 'close-x', '✕'); x.onclick = UI.closeModal; box.appendChild(x);
    buildFn(box);
    m.onclick = function (e) { if (e.target === m) UI.closeModal(); };
  };
  UI.closeModal = function () { if (UI.modalMandatory) return; $('modal').classList.add('hidden'); };
  UI.closeModalForce = function () { UI.modalMandatory = false; $('modal').classList.add('hidden'); };

  UI.skillRows = function (gen, container) {
    var isLord = false;
    var names = (gen.skills || []).slice();
    (gen.lordSkills || []).forEach(function (n) { names.push(n); });
    names.forEach(function (n) {
      var sk = SGS.SKILLS[n]; if (!sk) return;
      var row = el('div', 'skill');
      row.appendChild(el('div', 'sname', sk.cn + (sk.lord ? '（主公技）' : '')));
      row.appendChild(el('div', 'sdesc', sk.desc || ''));
      container.appendChild(row);
    });
  };

  UI.generalDetail = function (pOrGen) {
    var gen = pOrGen.general ? pOrGen.general : pOrGen;
    var player = pOrGen.general ? pOrGen : null;
    if (!gen) return;
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, gen.cn + ' · ' + (gen.title || '')));
      var wrap = el('div', 'gd');
      var por = el('div', 'portrait');
      UI.portraitInto(por, gen);
      wrap.appendChild(por);
      var meta = el('div', 'meta');
      var natName = SGS.NATIONS[gen.nation] ? SGS.NATIONS[gen.nation].cn : '';
      var r1 = el('div', 'row'); r1.innerHTML = '国别：<b>' + natName + '</b>　性别：<b>' + (gen.gender === 'male' ? '男' : '女') + '</b>　勾玉（体力上限）：<b>' + gen.hp + '</b>';
      meta.appendChild(r1);
      if (player) {
        var r2 = el('div', 'row');
        r2.innerHTML = '身份：<b>' + UI.roleLabel(player).t + '</b>　当前体力：<b>' + Math.max(0, player.hp) + '/' + player.maxHp + '</b>　手牌：<b>' + player.hand.length + '</b>';
        meta.appendChild(r2);
        var hp = el('div', 'hpline'); hp.appendChild(UI.hpEl(player)); meta.appendChild(hp);
        // equipment
        var eqs = [];
        for (var k in player.equips) if (player.equips[k]) eqs.push(SGS.cardLabel(player.equips[k]));
        if (eqs.length) { var re = el('div', 'row'); re.innerHTML = '装备：<b>' + eqs.join('，') + '</b>'; meta.appendChild(re); }
      }
      meta.appendChild(el('div', 'row', '技能：'));
      UI.skillRows(gen, meta);
      wrap.appendChild(meta);
      box.appendChild(wrap);
    });
  };

  UI.skillDetail = function (sk) {
    if (typeof sk === 'string') sk = SGS.SKILLS[sk];
    if (!sk) return;
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, sk.cn + (sk.lord ? '（主公技）' : '') + ' · 技能'));
      var d = el('div', 'gd');
      var info = el('div', 'meta');
      info.appendChild(el('div', 'sdesc', sk.desc || ''));
      d.appendChild(info);
      box.appendChild(d);
    });
  };

  UI.cardDetail = function (card) {
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '卡牌详情'));
      var wrap = el('div', 'cd');
      var big = el('div', 'bigcard'); big.appendChild(UI.cardEl(card, { noDetail: true }));
      wrap.appendChild(big);
      var info = el('div', 'info');
      info.appendChild(el('div', 't', card.cn + (SGS.SUITS[card.suit] ? ('　' + SGS.SUITS[card.suit].symbol + SGS.rankName(card.rank)) : '')));
      var typ = card.type === 'equip' ? ('装备牌 · ' + ({ weapon: '武器', armor: '防具', offhorse: '进攻坐骑（-1）', defhorse: '防御坐骑（+1）' }[card.subtype] || '')) :
        card.type === 'trick' ? ('锦囊牌 · ' + (card.subtype === 'delay' ? '延时类' : '即时类')) : '基本牌';
      info.appendChild(el('div', 'k', typ + (card.range ? ('　攻击范围 ' + card.range) : '')));
      var tpl = SGS.CARD_DB[card.name];
      info.appendChild(el('div', 'd', (tpl && tpl.desc) || card.desc || ''));
      wrap.appendChild(info);
      box.appendChild(wrap);
    });
  };

  /* ============================ Encyclopedia (图鉴) ============================ */
  UI.encyclopedia = function (tab) {
    tab = tab || 'generals';
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '图鉴'));
      var tabs = el('div', 'tabs');
      var bG = el('button', tab === 'generals' ? 'on' : '', '武将（' + SGS.generalList().length + '）');
      var bC = el('button', tab === 'cards' ? 'on' : '', '卡牌');
      bG.onclick = function () { UI.closeModal(); UI.encyclopedia('generals'); };
      bC.onclick = function () { UI.closeModal(); UI.encyclopedia('cards'); };
      tabs.appendChild(bG); tabs.appendChild(bC); box.appendChild(tabs);
      var body = el('div');
      if (tab === 'generals') UI.buildGenEncy(body); else UI.buildCardEncy(body);
      box.appendChild(body);
    });
  };
  UI.buildGenEncy = function (body) {
    var grid = el('div', 'ency-grid');
    var byNation = { wei: [], shu: [], wu: [], qun: [] };
    SGS.generalList().forEach(function (g) { (byNation[g.nation] || (byNation[g.nation] = [])).push(g); });
    ['wei', 'shu', 'wu', 'qun'].forEach(function (nat) {
      var list = byNation[nat] || []; if (!list.length) return;
      body.appendChild(el('div', 'ency-cat', SGS.NATIONS[nat].cn + ' 势力（' + list.length + '）'));
      var g2 = el('div', 'ency-grid');
      list.forEach(function (g) {
        var cell = el('div', 'ency-gen');
        var th = el('div', 'th');
        UI.setPortrait(th, g, false);
        cell.appendChild(th);
        cell.appendChild(el('div', 'nm', g.cn));
        cell.appendChild(el('div', 'nt', g.title || ''));
        cell.onclick = function () { UI.closeModal(); UI.generalDetail(g); };
        g2.appendChild(cell);
      });
      body.appendChild(g2);
    });
  };
  UI.buildCardEncy = function (body) {
    var cats = [
      { t: '基本牌', names: ['sha', 'shan', 'tao', 'jiu'] },
      { t: '装备 · 武器', names: ['zhugeliannu', 'cixiongjian', 'qinggangjian', 'hanbingjian', 'qinglongyanyuedao', 'zhangbashemao', 'guanshifu', 'fangtianhuaji', 'qilingong'] },
      { t: '装备 · 防具', names: ['bagua', 'renwang', 'tengjia'] },
      { t: '装备 · 坐骑', names: ['chitu', 'dayuan', 'zixing', 'dilu', 'jueying', 'zhuahuangfeidian'] },
      { t: '锦囊 · 即时', names: ['wuzhongshengyou', 'guohechaiqiao', 'shunshouqianyang', 'juedou', 'jiedaosharen', 'huogong', 'tiesuolianhuan', 'wuxiekeji', 'wugufengdeng', 'taoyuanjieyi', 'nanmanruqin', 'wanjianqifa'] },
      { t: '锦囊 · 延时', names: ['lebusishu', 'bingliangcunduan', 'shandian'] }
    ];
    cats.forEach(function (cat) {
      body.appendChild(el('div', 'ency-cat', cat.t));
      var row = el('div', 'ency-cards');
      cat.names.forEach(function (nm) {
        var tpl = SGS.CARD_DB[nm]; if (!tpl) return;
        var card = { name: nm, cn: tpl.cn, type: tpl.type, subtype: tpl.subtype, suit: 'spade', rank: 1, element: 'normal', range: tpl.range, desc: tpl.desc };
        var ce = UI.cardEl(card, { mini: true, noDetail: true });
        ce.style.cursor = 'pointer';
        ce.onclick = function () { UI.closeModal(); UI.cardDetail(card); };
        row.appendChild(ce);
      });
      body.appendChild(row);
    });
  };

  UI.assetCredits = function () {
    UI.openModal(function (box) {
      box.appendChild(el('div', 'panel-kicker', '开放资产账本'));
      box.appendChild(el('h2', null, '来源与许可'));
      box.appendChild(el('p', 'license-copy', '24 张历史画像均来自 Wikimedia Commons 并经过许可审计：23 张为公有领域，孙尚香画像为 CC BY-SA 4.0，作者 Wang Hui 王翙（1736–1795）。卡牌图标、界面纹理与音效由本项目代码生成。'));
      var embedded = document.getElementById('embeddedAttribution');
      if (embedded) {
        var pre = el('pre', 'embedded-ledger');
        try { pre.textContent = JSON.parse(embedded.textContent); } catch (e) { pre.textContent = embedded.textContent; }
        box.appendChild(pre);
        return;
      }
      var links = el('div', 'license-links');
      var ledger = document.createElement('a'); ledger.href = 'assets/ATTRIBUTION.md'; ledger.textContent = '查看完整资产账本'; ledger.target = '_blank'; ledger.rel = 'noopener';
      var policy = document.createElement('a'); policy.href = 'docs/ASSET_POLICY.md'; policy.textContent = '查看开放资产政策'; policy.target = '_blank'; policy.rel = 'noopener';
      links.appendChild(ledger); links.appendChild(policy); box.appendChild(links);
    });
  };

  /* ============================ Settings ============================ */
  UI.settings = function () {
    UI.openModal(function (box) {
      box.appendChild(el('h2', null, '设置'));
      var row = el('div', 'set-row');
      row.appendChild(el('label', null, '游戏节奏'));
      var rng = document.createElement('input'); rng.type = 'range'; rng.min = '0.2'; rng.max = '1.8'; rng.step = '0.1';
      rng.value = String(SGS.PACE == null ? 0.8 : SGS.PACE);
      var val = el('span', null, '');
      function upd() { var v = parseFloat(rng.value); if (SGS.setPace) SGS.setPace(v); else { SGS.PACE = v; if (SGS.Anim) SGS.Anim.PACE = v; save('pace', v); } val.textContent = v <= 0.5 ? '快' : v >= 1.3 ? '慢' : '适中'; }
      rng.oninput = upd; upd();
      row.appendChild(rng); row.appendChild(val);
      box.appendChild(row);

      if (SGS.Sound) {
        var s = SGS.Sound;
        // sfx toggle
        var r2 = el('div', 'set-row'); r2.appendChild(el('label', null, '音效'));
        var b2 = el('button', 'btn-ghost', s.sfxOn ? '开' : '关');
        b2.onclick = function () { s.setSfx(!s.sfxOn); b2.textContent = s.sfxOn ? '开' : '关'; if (s.sfxOn) { s.init(); s.play('click'); } };
        r2.appendChild(b2); box.appendChild(r2);
        // music toggle
        var r3 = el('div', 'set-row'); r3.appendChild(el('label', null, '背景音乐'));
        var b3 = el('button', 'btn-ghost', s.musicOn ? '开' : '关');
        b3.onclick = function () { s.setMusic(!s.musicOn); b3.textContent = s.musicOn ? '开' : '关'; };
        r3.appendChild(b3); box.appendChild(r3);
        // volume
        var r4 = el('div', 'set-row'); r4.appendChild(el('label', null, '音量'));
        var vr = document.createElement('input'); vr.type = 'range'; vr.min = '0'; vr.max = '1'; vr.step = '0.05'; vr.value = String(s.volume);
        vr.oninput = function () { s.init(); s.setVolume(parseFloat(vr.value)); };
        r4.appendChild(vr); box.appendChild(r4);
      }

      box.appendChild(el('div', 'set-row', '距离：角色左上角显示“你 → 对方”的真实距离；绿色“可攻击”表示不超过当前攻击范围。悬停可查看双向距离，坐骑和技能可能使两个方向不同。'));
      box.appendChild(el('div', 'set-row', '互动：角色画像上方最多保留五条最近事件摘要，悬停摘要可查看完整的攻击、救援、技能或计策记录。'));
      box.appendChild(el('div', 'set-row', '操作：右键（触屏长按）任意卡牌查看详情；点击角色查看武将资料与技能。'));
      var credits = el('button', 'btn-ghost', '图像来源与许可');
      credits.onclick = function () { UI.closeModal(); UI.assetCredits(); };
      box.appendChild(credits);
      var restart = el('button', 'btn-ghost', '重新开始（回到选将）');
      restart.onclick = function () { location.href = location.pathname; };
      box.appendChild(restart);
    });
  };
  function save(key, v) { try { localStorage.setItem('sft_' + key, JSON.stringify(v)); } catch (e) {} }

  /* ============================ game over ============================ */
  UI.gameOver = function (winners) {
    var box = $('overlay'); box.classList.remove('hidden');
    var inner = box.querySelector('.box'); clear(inner);
    var label = { lord: '主公 / 忠臣 胜利', rebel: '反贼 胜利', traitor: '内奸 胜利', draw: '平局' }[winners] || '对局结束';
    var youWin = UI.didWin(winners);
    inner.appendChild(el('h2', null, label));
    inner.appendChild(el('div', null, youWin ? '🎉 你所在的阵营获胜！' : '你所在的阵营失败了。'));
    var roles = el('div', 'roles');
    UI.game.players.forEach(function (p) {
      var r = el('div', 'rr', (p.seatName || p.name) + '·' + (p.general ? p.general.cn : '') + '·' + SGS.ROLES[p.role].cn + (p.alive ? '' : '（阵亡）'));
      r.style.color = p.role === 'lord' ? '#d9b45b' : p.role === 'rebel' ? '#ff9b9b' : p.role === 'loyalist' ? '#9bd0ff' : '#d9a0ff';
      roles.appendChild(r);
    });
    inner.appendChild(roles);
    var again = el('button', 'btn-primary', '再来一局');
    again.onclick = function () { location.reload(); };
    inner.appendChild(again);
  };
  UI.didWin = function (winners) {
    var me = UI.me;
    if (winners === 'lord') return me.role === 'lord' || me.role === 'loyalist';
    if (winners === 'rebel') return me.role === 'rebel';
    if (winners === 'traitor') return me.role === 'traitor';
    return false;
  };

  /* ============================ Browser AI (paced) ============================ */
  SGS.BrowserAI = {
    decide: function (game, player, req) {
      var d = SGS.ai.decide(game, player, req);
      var pace = 0;
      if (req.type === 'play') pace = 520;
      else if (req.type === 'respond' || req.type === 'wuxie' || req.type === 'rescue') pace = 420;
      else if (req.type === 'chooseZoneCard' || req.type === 'choosePlayers' || req.type === 'chooseOption') pace = 260;
      pace = pace * (SGS.PACE == null ? 1 : SGS.PACE);
      if (pace <= 0) return d;
      return Promise.resolve(d).then(function (res) { return U.delay(pace).then(function () { return res; }); });
    }
  };

  /* buttons */
  document.addEventListener('DOMContentLoaded', function () {
    var t = $('logToggle');
    if (t) t.onclick = function () {
      var wrap = $('logWrap');
      wrap.classList.toggle('collapsed');
      t.textContent = wrap.classList.contains('collapsed') ? '📜 战报' : '📜 收起';
    };
    var e2 = $('encyBtn2'); if (e2) e2.onclick = function () { UI.encyclopedia('generals'); };
    var e1 = $('encyBtn'); if (e1) e1.onclick = function () { UI.encyclopedia('generals'); };
    var s = $('settingsBtn'); if (s) s.onclick = function () { UI.settings(); };
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') UI.closeModal(); });

    // log filter
    var lf = $('logFilter');
    if (lf) {
      var filters = ['全部', '战斗', '技能', '系统'];
      var filterMap = {
        '全部': function () { return true; },
        '战斗': function (k) { return ['damage','heal','death','draw','discard','equip'].indexOf(k) >= 0; },
        '技能': function (k) { return ['skill','trick','judge','basic'].indexOf(k) >= 0; },
        '系统': function (k) { return ['turn','system','gameover','reward','penalty'].indexOf(k) >= 0; }
      };
      var fi = 0;
      lf.onclick = function () {
        fi = (fi + 1) % filters.length;
        var label = filters[fi];
        lf.textContent = label;
        var fn = filterMap[label];
        var log = $('log'); if (!log) return;
        for (var i = 0; i < log.children.length; i++) {
          var c = log.children[i];
          var kind = (c.className.match(/l-([a-z]+)/) || [])[1] || '';
          c.style.display = fn(kind) ? '' : 'none';
        }
      };
    }
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
