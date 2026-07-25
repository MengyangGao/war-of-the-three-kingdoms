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
  function keyboardClickable(node, action) {
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.onclick = action;
    node.onkeydown = function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action(event);
      }
    };
  }

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
    if (UI.restoreLog && game.log.length) UI.restoreLog(game.log);
    else UI.renderAll();
  };

  /* Logging and per-player activity are attached by js/71-activity.js. */

  /* ============================ uiHook (animations) ============================ */
  UI.onHook = async function (type, data) {
    var snd = SGS.Sound;
    var Anim = SGS.Anim;
    UI.setAnimationBusy(true);
    try {
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
    } finally {
      UI.setAnimationBusy(false);
    }
  };

  UI.setAnimationBusy = function (busy) {
    var button = $('skipAnimBtn');
    if (!button) return;
    button.disabled = !busy;
    button.classList.toggle('busy', !!busy);
    button.setAttribute('aria-label', busy ? '跳过当前演出' : '当前没有可跳过的演出');
  };

  UI.playerEl = function (p) { return document.querySelector('[data-seat="' + p.seat + '"]'); };
  /* Visual effects are attached by js/70-effects.js. */

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
          keyboardClickable(e, function (ev) { ev.stopPropagation(); UI.clickCard(card); });
        } else {
          e.title = '点击查看详情';
          e.style.cursor = 'pointer';
          keyboardClickable(e, function (ev) { ev.stopPropagation(); UI.cardDetail(card); });
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
    var targetFeedback = UI.targetFeedback && UI.targetFeedback[p.id];
    panel.setAttribute('aria-label', (p.general ? p.general.cn : p.name) + '，体力 ' + Math.max(0, p.hp) + '/' + p.maxHp + '，手牌 ' + p.hand.length + (distance == null ? '，已阵亡' : '，你到他的距离 ' + distance) + (targetFeedback ? '，' + targetFeedback : ''));
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
          keyboardClickable(tag, function (ev) { ev.stopPropagation(); UI.cardDetail(jc); });
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
      if (targetFeedback) {
        panel.classList.add('target-unavailable');
        panel.appendChild(el('div', 'target-note', targetFeedback));
      }
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
      function cancelLongPress() {
        if (!lpTimer) return;
        if (SGS.Timeline) SGS.Timeline.cancel(lpTimer); else clearTimeout(lpTimer);
        lpTimer = null;
      }
      c.addEventListener('touchstart', function () {
        moved = false;
        var open = function () { if (!moved) { lpTimer = null; UI.cardDetail(card); } };
        lpTimer = SGS.Timeline ? SGS.Timeline.after('input', 480, open) : setTimeout(open, 480);
      }, { passive: true });
      c.addEventListener('touchmove', function () { moved = true; cancelLongPress(); }, { passive: true });
      c.addEventListener('touchend', function (e) { if (lpTimer) cancelLongPress(); else { e.preventDefault(); } }, { passive: false });
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
    if (av) {
      av.innerHTML = '';
      if (p.general) UI.setPortrait(av, p.general, true);
      av.style.cursor = 'pointer';
      keyboardClickable(av, function () { UI.generalDetail(p); });
    }
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
        var tag = el('button', 'skill-tag active', s.cn);
        tag.type = 'button';
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
        (function (jc) {
          var tag = el('span', 'jtag', jc.cn);
          keyboardClickable(tag, function () { UI.cardDetail(jc); });
          jz.appendChild(tag);
        })(p.judgeZone[j]);
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
    if (UI.clearGuidance) UI.clearGuidance();
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
    if (UI.clearGuidance) UI.clearGuidance();
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
    if (UI.beginGuidance) UI.beginGuidance('card');
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
      UI.targetFeedback = null;
      UI.cur.onSelectChange = null;
      UI.cur.cardClick = playCardClick;
      UI.selectableCards = Object.keys(cardOpts);
      buildBar();
      UI.setHint('出牌阶段：选择一张牌或技能使用');
      if (UI.beginGuidance) UI.beginGuidance('card');
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
      if (UI.setTargetFeedback) UI.setTargetFeedback(o);
      if (UI.setGuideStep) UI.setGuideStep('target', o);
      var act = $('actions'); clear(act);
      var confirm = UI.actionBtn('确定', 'primary', function () {
        if (UI.selectedPlayers.length < o.minTargets) return;
        UI.finish({ kind: 'card', card: card, targets: UI.selectedPlayers.slice() });
      }, true);
      UI.actionBtn('取消', '', reset);
      UI.cur.onSelectChange = function () {
        confirm.disabled = UI.selectedPlayers.length < o.minTargets || UI.selectedPlayers.length > o.maxTargets;
        if (UI.setGuideStep) UI.setGuideStep(confirm.disabled ? 'target' : 'confirm', o);
      };
    } else {
      UI.setHint('使用 ' + card.cn + '？');
      if (UI.setGuideStep) UI.setGuideStep('confirm', o);
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
    if (UI.beginGuidance) UI.beginGuidance('card', o);
    function updateStage() {
      var act = $('actions'); clear(act);
      var ready = UI.selectedCards.length === convert;
      if (ready && o.maxTargets > 0) {
        UI.selectablePlayers = o.candidates.slice();
        UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi';
        UI.cur.maxP = o.maxTargets;
        UI.setHint(o.cn + '：选择目标');
        if (UI.setTargetFeedback) UI.setTargetFeedback(o);
        if (UI.setGuideStep) UI.setGuideStep(UI.selectedPlayers.length >= o.minTargets ? 'confirm' : 'target', o);
      } else {
        UI.selectablePlayers = [];
        UI.targetFeedback = null;
        if (UI.setGuideStep) UI.setGuideStep(ready ? 'confirm' : 'card', o);
      }
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
      if (UI.beginGuidance) UI.beginGuidance('card', o);
      var upd = function () { var act = $('actions'); clear(act); var b = UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'skill', skill: 'zhiheng', zhihengCards: UI.selectedCards.map(UI.findCard) }); }, UI.selectedCards.length < 1); UI.actionBtn('取消', '', reset); };
      upd(); UI.renderAll(); return;
    }
    if (skill === 'rende') {
      UI.selectablePlayers = o.candidates.slice(); UI.cur.playerMode = 'single';
      UI.setHint('仁德：选择赠予的角色');
      if (UI.setTargetFeedback) UI.setTargetFeedback(o);
      if (UI.beginGuidance) UI.beginGuidance('target', o);
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
          UI.targetFeedback = null;
          if (ready && o.maxTargets > 0 && UI.setTargetFeedback) UI.setTargetFeedback(o);
          if (UI.setGuideStep) UI.setGuideStep(!ready ? 'card' : (o.maxTargets > 0 && UI.selectedPlayers.length < o.minTargets ? 'target' : 'confirm'), o);
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
        if (UI.beginGuidance) UI.beginGuidance('card', o);
        updateCostStage(); UI.renderAll();
        return;
      }
    }

    // generic active skill: pick targets if needed
    if (o.maxTargets > 0) {
      UI.selectablePlayers = o.candidates.slice();
      UI.cur.playerMode = o.maxTargets === 1 ? 'single' : 'multi'; UI.cur.maxP = o.maxTargets;
      UI.setHint(o.cn + '：选择目标（' + o.minTargets + '~' + o.maxTargets + '）');
      if (UI.setTargetFeedback) UI.setTargetFeedback(o);
      if (UI.beginGuidance) UI.beginGuidance('target', o);
      var render = function () {
        var act = $('actions'); clear(act);
        UI.actionBtn('确定', 'primary', function () { if (UI.selectedPlayers.length < o.minTargets) return; UI.finish({ kind: 'skill', skill: skill, targets: UI.selectedPlayers.slice() }); }, UI.selectedPlayers.length < o.minTargets);
        UI.actionBtn('取消', '', reset);
      };
      UI.cur.onSelectChange = function () {
        if (UI.setGuideStep) UI.setGuideStep(UI.selectedPlayers.length < o.minTargets ? 'target' : 'confirm', o);
        render();
      };
      render(); UI.renderAll();
    } else {
      UI.setHint(o.cn + '：确认发动？');
      if (UI.beginGuidance) UI.beginGuidance('confirm', o);
      var act = $('actions'); clear(act);
      UI.actionBtn('确定', 'primary', function () { UI.finish({ kind: 'skill', skill: skill, targets: [] }); });
      UI.actionBtn('取消', '', reset);
    }
  };

  /* Response, selection and judgment prompts are attached by js/70-prompts.js. */

  /* Dialogs, encyclopedia, details and settings are attached by js/73-dialogs.js. */

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
      return Promise.resolve(d).then(function (res) {
        var wait = SGS.Timeline ? SGS.Timeline.delay('pacing', pace) : U.delay(pace);
        return wait.then(function () { return res; });
      });
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
    var skip = $('skipAnimBtn'); if (skip) skip.onclick = function () {
      if (!skip.disabled && SGS.Anim) SGS.Anim.clear();
    };
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
