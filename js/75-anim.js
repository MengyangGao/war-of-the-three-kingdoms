/* ==========================================================================
 * 三分天下 · 动画时间线
 *   - AnimQueue：串行 Promise 动画队列
 *   - 引擎通过 game.anim(name, data) 触发，浏览器端自动排队播放
 *   - headless 环境直接返回 resolved Promise
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') { SGS.Anim = { play: function () { return Promise.resolve(); }, ready: function () { return Promise.resolve(); }, clear: function () {} }; return; }

  var U = SGS.util;
  var Timeline = SGS.Timeline;
  var Anim = SGS.Anim = {
    queue: [],
    running: false,
    waiters: [],
    PACE: 1.0,
    DEFAULT: {
      turnBanner: 900,
      draw: 180,
      drawGap: 90,
      playCard: 420,
      trickTravel: 520,
      equip: 420,
      discard: 380,
      loseCard: 380,
      damage: 700,
      aoe: 780,
      rescue: 520,
      dying: 1100,
      death: 1400,
      judge: 900,
      chain: 500,
      settle: 260
    }
  };

  function dur(key) {
    return (Anim.DEFAULT[key] || 260) * (Anim.PACE == null ? 1 : Anim.PACE);
  }
  function delay(ms) { return Timeline ? Timeline.delay('animation', ms) : U.delay(ms); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function rectOf(el) { return el ? el.getBoundingClientRect() : null; }
  function cardEl(card, mini) { return SGS.UI.cardEl(card, { mini: !!mini, noDetail: true }); }

  function makeFly(cardOrBack, from, to, opts) {
    opts = opts || {};
    var fly = cardOrBack === true ? el('div', 'card mini card-back') : cardEl(cardOrBack, true);
    fly.classList.add('fly-card');
    fly.classList.add('v3');
    var sx = opts.sx || 1, sy = opts.sy || 1;
    var tx = opts.tx || 1, ty = opts.ty || 1;
    fly.style.left = (from.left + from.width / 2 - 26 * sx) + 'px';
    fly.style.top = (from.top + from.height / 2 - 36 * sy) + 'px';
    fly.style.transform = 'scale(' + sx + ',' + sy + ')';
    fly.style.opacity = opts.startOpacity || '1';
    document.body.appendChild(fly);
    var dx = (to.left + to.width / 2 - 26 * tx) - (from.left + from.width / 2 - 26 * sx);
    var dy = (to.top + to.height / 2 - 36 * ty) - (from.top + from.height / 2 - 36 * sy);
    return { el: fly, dx: dx, dy: dy, sx: sx, sy: sy, tx: tx, ty: ty };
  }

  function animateFly(fly, ms, keep) {
    return new Promise(function (resolve) {
      var finish = function () { if (fly.el) fly.el.remove(); resolve(); };
      var begin = function () {
        fly.el.style.transition = 'transform ' + ms + 'ms cubic-bezier(.35,.55,.25,1), opacity ' + ms + 'ms';
        fly.el.style.transform = 'translate(' + fly.dx + 'px,' + fly.dy + 'px) scale(' + fly.tx + ',' + fly.ty + ')';
      };
      if (Timeline) Timeline.frame('animation', begin, finish);
      else requestAnimationFrame(begin);
      var after = Timeline ? function (wait, fn, cancel) { Timeline.after('animation', wait, fn, cancel); } : function (wait, fn) { setTimeout(fn, wait); };
      after(ms, function () {
        if (!keep) {
          fly.el.style.opacity = '0';
          after(160, finish, finish);
        } else resolve();
      }, finish);
    });
  }

  Anim.play = function (name, data) {
    return new Promise(function (resolve) {
      Anim.queue.push({ name: name, data: data, resolve: resolve });
      Anim.pump();
    });
  };

  Anim.clear = function () {
    if (Timeline) Timeline.cancelScope('animation');
    var pending = Anim.queue.splice(0);
    for (var i = 0; i < pending.length; i++) pending[i].resolve();
  };

  Anim.ready = function () {
    return (Anim.running || Anim.queue.length) ? new Promise(function (resolve) { Anim.waiters.push(resolve); }) : Promise.resolve();
  };

  Anim.resolveWaiters = function () {
    if (Anim.running || Anim.queue.length) return;
    var waiters = Anim.waiters.splice(0);
    for (var i = 0; i < waiters.length; i++) waiters[i]();
  };

  Anim.pump = function () {
    if (Anim.running || Anim.queue.length === 0) return;
    Anim.running = true;
    var job = Anim.queue.shift();
    var fn = Anim[job.name];
    Promise.resolve(fn ? fn(job.data) : Promise.resolve()).catch(function (err) {
      if (typeof console !== 'undefined') console.error('[SGS] animation "' + job.name + '" failed:', err);
    }).then(function () {
      Anim.running = false;
      job.resolve();
      Anim.pump();
      Anim.resolveWaiters();
    });
  };

  Anim.settle = function () { return delay(dur('settle')); };

  /* ---------------- 核心动画 ---------------- */

  Anim.turnStart = function (data) {
    var p = data.player;
    var UI = SGS.UI;
    UI.setStageHint((p.general ? p.general.cn : p.name) + ' 的回合');
    UI.banner((p.general ? p.general.cn : p.name) + ' 的回合', '#d9b45b');
    UI.highlightCurrent(p);
    return delay(dur('turnBanner'));
  };

  Anim.phase = function (data) {
    var UI = SGS.UI;
    UI.setStageHint((data.player.general ? data.player.general.cn : data.player.name) + ' · ' + (SGS.PHASE_CN[data.phase] || ''));
    UI.renderAll();
    return delay(dur('settle'));
  };

  Anim.draw = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    var cards = data.cards || [];
    var deckPile = document.querySelector('#center .pile');
    var pr = UI.rectOf(p);
    if (!deckPile || !pr) return delay(dur('draw'));
    var from = rectOf(deckPile);
    var n = Math.min(cards.length, 6);
    var promises = [];
    for (var i = 0; i < n; i++) {
      promises.push((function (idx) {
        return delay(idx * dur('drawGap')).then(function () {
          var fly = makeFly(true, from, pr, { sx: 0.85, sy: 0.85, tx: 0.85, ty: 0.85 });
          return animateFly(fly, dur('draw'), false);
        });
      })(i));
    }
    UI.renderAll();
    return Promise.all(promises).then(function () { return delay(120); });
  };

  Anim.useCard = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    var card = data.card;
    var targets = data.targets || [];
    var srcEl = (p === UI.me) ? document.getElementById('me') : UI.playerEl(p);
    var area = document.getElementById('playArea');
    if (!srcEl || !area || !card) { UI.showPlayed(card); return delay(dur('playCard')); }
    var from = rectOf(srcEl);
    var to = rectOf(area);
    var fly = makeFly(card, from, to, { sx: 0.9, sy: 0.9, tx: 1.15, ty: 1.15 });
    return animateFly(fly, dur('playCard'), true).then(function () {
      UI.showPlayed(card);
      fly.el.style.transition = 'opacity .25s, transform .25s';
      fly.el.style.opacity = '0';
      fly.el.style.transform = 'translate(' + fly.dx + 'px,' + fly.dy + 'px) scale(1.25,1.25)';
      if (Timeline) Timeline.after('animation', 260, function () { fly.el.remove(); }, function () { fly.el.remove(); });
      else setTimeout(function () { fly.el.remove(); }, 260);
      // attack lines / trick lines
      targets.forEach(function (t) { UI.connect(srcEl, UI.playerEl(t), card.name === 'sha' ? 'atk' : 'trk'); });
      return delay(dur('settle'));
    });
  };

  Anim.equip = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    var card = data.card;
    var srcEl = (p === UI.me) ? document.getElementById('me') : UI.playerEl(p);
    var pr = UI.rectOf(p);
    if (srcEl && pr) {
      var from = rectOf(srcEl);
      var fly = makeFly(card, from, pr, { sx: 0.9, sy: 0.9, tx: 0.7, ty: 0.7 });
      animateFly(fly, dur('equip'), false);
    }
    UI.flash(p, 'flash-heal');
    UI.floatText(p, '装备', 'heal');
    UI.renderAll();
    return delay(dur('equip'));
  };

  Anim.discard = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    var cards = data.cards || [];
    var srcEl = (p === UI.me) ? document.getElementById('me') : UI.playerEl(p);
    var discardPile = document.querySelectorAll('#center .pile')[1];
    if (!srcEl || !discardPile) return delay(dur('discard'));
    var from = rectOf(srcEl);
    var to = rectOf(discardPile);
    var n = Math.min(cards.length, 5);
    var promises = [];
    for (var i = 0; i < n; i++) {
      promises.push((function (c, idx) {
        return delay(idx * 80).then(function () {
          var fly = makeFly(c, from, to, { sx: 0.85, sy: 0.85, tx: 0.75, ty: 0.75 });
          return animateFly(fly, dur('discard'), false);
        });
      })(cards[i], i));
    }
    UI.renderAll();
    return Promise.all(promises).then(function () { return delay(100); });
  };

  Anim.loseCard = function (data) {
    var UI = SGS.UI;
    var fromP = data.from;
    var toP = data.to;
    var card = data.card;
    var srcEl = (fromP === UI.me) ? document.getElementById('me') : UI.playerEl(fromP);
    var dstEl = (toP === UI.me) ? document.getElementById('me') : UI.playerEl(toP);
    if (!srcEl || !dstEl || !card) return delay(dur('loseCard'));
    var from = rectOf(srcEl);
    var to = rectOf(dstEl);
    var fly = makeFly(card, from, to, { sx: 0.8, sy: 0.8, tx: 0.85, ty: 0.85 });
    return animateFly(fly, dur('loseCard'), false).then(function () { UI.renderAll(); return delay(80); });
  };

  Anim.aoe = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    var card = data.card;
    var targets = data.targets || [];
    var area = document.getElementById('playArea');
    if (!area) return delay(dur('aoe'));
    var center = rectOf(area);
    // show card in play area
    UI.showPlayed(card);
    // expanding ring
    var ring = el('div', 'fx-aoe-ring');
    ring.style.left = (center.left + center.width / 2 - 10) + 'px';
    ring.style.top = (center.top + center.height / 2 - 10) + 'px';
    document.body.appendChild(ring);
    if (Timeline) Timeline.after('animation', dur('aoe'), function () { ring.remove(); }, function () { ring.remove(); });
    else setTimeout(function () { ring.remove(); }, dur('aoe'));
    // stagger hit each target
    var promises = targets.map(function (t, i) {
      return delay(120 + i * 140).then(function () {
        UI.ringTarget(t);
        UI.shake(t);
        return delay(100);
      });
    });
    return Promise.all(promises).then(function () { return delay(180); });
  };

  Anim.damage = function (data) {
    var UI = SGS.UI;
    var src = data.source;
    var tgt = data.target;
    var amount = data.amount || 1;
    var srcEl = src ? ((src === UI.me) ? document.getElementById('me') : UI.playerEl(src)) : null;
    var tgtEl = (tgt === UI.me) ? document.getElementById('me') : UI.playerEl(tgt);
    if (srcEl && tgtEl) UI.connect(srcEl, tgtEl, 'atk');
    UI.flash(tgt, 'flash-dmg');
    UI.shake(tgt);
    UI.spark(tgt);
    UI.floatText(tgt, '-' + amount, 'dmg');
    UI.renderAll();
    return delay(dur('damage'));
  };

  Anim.heal = function (data) {
    var UI = SGS.UI;
    var p = data.target || data.player;
    UI.flash(p, 'flash-heal');
    UI.floatText(p, '+' + (data.amount || 1), 'heal');
    UI.renderAll();
    return delay(dur('settle') + 120);
  };

  Anim.rescue = function (data) {
    var UI = SGS.UI;
    var saver = data.savior;
    var dying = data.dying;
    var card = data.card;
    var srcEl = (saver === UI.me) ? document.getElementById('me') : UI.playerEl(saver);
    var dstEl = (dying === UI.me) ? document.getElementById('me') : UI.playerEl(dying);
    if (srcEl && dstEl && card) {
      var from = rectOf(srcEl), to = rectOf(dstEl);
      var fly = makeFly(card, from, to, { sx: 0.8, sy: 0.8, tx: 0.7, ty: 0.7 });
      animateFly(fly, dur('rescue'), false);
    }
    UI.flash(dying, 'flash-heal');
    UI.floatText(dying, '桃', 'heal');
    UI.renderAll();
    return delay(dur('rescue'));
  };

  Anim.dying = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    UI.vignette('#c0392b');
    UI.banner((p.general ? p.general.cn : p.name) + ' 濒死！', '#ff5b5b');
    UI.renderAll();
    return delay(dur('dying'));
  };

  Anim.death = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    UI.vignette('#5a1c1c');
    UI.banner((p.general ? p.general.cn : p.name) + ' 阵亡', '#ff6b6b');
    UI.renderAll();
    return delay(dur('death'));
  };

  Anim.judge = function (data) {
    var UI = SGS.UI;
    var card = data.card;
    UI.animateJudge(data.player, card);
    return delay(dur('judge'));
  };

  Anim.chain = function (data) {
    var UI = SGS.UI;
    var p = data.player;
    UI.flash(p, 'flash-heal');
    UI.floatText(p, '⛓', 'dmg');
    UI.renderAll();
    return delay(dur('chain'));
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
