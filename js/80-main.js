/* ==========================================================================
 * 三国杀 · 启动与装配 (main / boot)
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return;

  var state = { numPlayers: 8, chosenGeneral: null };

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var $ = function (id) { return document.getElementById(id); };

  function buildGeneralGrid() {
    var grid = $('genGrid'); grid.innerHTML = '';
    var list = SGS.generalList();
    // random option
    var rnd = el('div', 'gen-card sel');
    rnd.appendChild(el('div', 'nm', '随机'));
    rnd.appendChild(el('div', 'tt', '随机武将'));
    rnd.onclick = function () { selectGeneral(null, rnd); };
    grid.appendChild(rnd);
    state.selEl = rnd;

    list.forEach(function (g) {
      var c = el('div', 'gen-card');
      c.appendChild(el('div', 'nm', g.cn));
      c.appendChild(el('div', 'tt', g.title || ''));
      var mini = el('div', 'mini');
      var nb = el('span', 'nat-badge', SGS.NATIONS[g.nation].cn); nb.style.background = SGS.NATIONS[g.nation].color;
      mini.appendChild(nb);
      mini.appendChild(el('span', null, (g.gender === 'male' ? '♂' : '♀') + ' ' + g.hp + '血'));
      c.appendChild(mini);
      c.title = g.desc || '';
      c.onclick = function () { selectGeneral(g.key, c); };
      grid.appendChild(c);
    });
  }

  function selectGeneral(key, node) {
    state.chosenGeneral = key;
    if (state.selEl) state.selEl.classList.remove('sel');
    node.classList.add('sel'); state.selEl = node;
  }

  function buildCountSeg() {
    var seg = $('countSeg'); seg.innerHTML = '';
    [3, 4, 5, 6, 7, 8].forEach(function (n) {
      var b = el('button', n === state.numPlayers ? 'on' : '', n + '人');
      b.onclick = function () {
        state.numPlayers = n;
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('on'); });
        b.classList.add('on');
      };
      seg.appendChild(b);
    });
  }

  function pickDistinct(rng, exclude, count) {
    var keys = Object.keys(SGS.GENERALS).filter(function (k) { return k !== exclude; });
    rng.shuffle(keys);
    return keys.slice(0, count);
  }

  function setPace(v) {
    if (!Number.isFinite(v)) v = 0.8;
    v = Math.max(0.02, Math.min(2, v));
    SGS.PACE = v;
    if (SGS.Anim) SGS.Anim.PACE = v;
    try { localStorage.setItem('sgs_pace', JSON.stringify(v)); } catch (e) {}
  }

  function startGame() {
    var startBtn = $('startBtn');
    if (startBtn.disabled) return;
    startBtn.disabled = true;
    var n = state.numPlayers;
    var params = new URLSearchParams(location.search);
    var demo = params.has('demo');
    if (params.has('pace')) setPace(parseFloat(params.get('pace')));
    else if (demo) setPace(0.06);
    else { var sp = null; try { sp = JSON.parse(localStorage.getItem('sgs_pace')); } catch (e) {} setPace(sp == null ? 0.8 : sp); }
    if (SGS.Sound && !demo) SGS.Sound.init();

    var seed = (Date.now() ^ (Math.random() * 1e9)) & 0x7fffffff;
    var humanSeat = Math.floor(Math.random() * n);

    var game = new SGS.Game({ numPlayers: n, seed: seed, maxTurns: 3000 });
    game.setup({ humanSeat: humanSeat });

    // assign generals: human gets chosen (or random), others distinct random
    var humanKey = state.chosenGeneral || pickDistinct(game.rng, null, 1)[0];
    var others = pickDistinct(game.rng, humanKey, n);
    var assign = [];
    var oi = 0;
    for (var s = 0; s < n; s++) {
      if (s === humanSeat) assign.push(humanKey);
      else assign.push(others[oi++]);
    }
    game.assignGenerals(assign);

    // preload portraits for this game
    if (SGS.ART) {
      for (var pi = 0; pi < game.players.length; pi++) {
        var gk = game.players[pi].general && game.players[pi].general.key;
        var purl = gk && SGS.ART.portraitUrl(gk);
        if (purl) { var img = new Image(); img.src = purl; }
      }
    }

    var human = game.players[humanSeat];
    for (var i = 0; i < game.players.length; i++) {
      var isHuman = (game.players[i] === human) && !demo;
      game.players[i].agent = isHuman ? SGS.HumanAgent : SGS.BrowserAI;
    }
    game.dealInitialHands();

    SGS.UI.start(game, human);
    window.__game = game;
    if (demo) window.__demoGame = game;
    // kick off
    game.start().then(function () { window.__gameDone = true; }).catch(function (err) {
      window.__gameDone = true;
      game.msg('对局异常中止：' + (err && err.message ? err.message : String(err)), { kind: 'error' });
      if (typeof console !== 'undefined') console.error(err);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildGeneralGrid();
    buildCountSeg();
    $('startBtn').onclick = startGame;
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
