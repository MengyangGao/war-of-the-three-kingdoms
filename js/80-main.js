/* ===========================================================================
 * 三分天下 · 启动与装配 (main / boot)
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
    var rnd = el('button', 'gen-card sel'); rnd.type = 'button'; rnd.setAttribute('aria-pressed', 'true');
    rnd.appendChild(el('span', 'gen-thumb random-mark', '将'));
    var rndText = el('span', 'gen-text');
    rndText.appendChild(el('span', 'nm', '随机武将'));
    rndText.appendChild(el('span', 'tt', '让风云决定此局主角'));
    rnd.appendChild(rndText);
    rnd.onclick = function () { selectGeneral(null, rnd); };
    grid.appendChild(rnd);
    state.selEl = rnd;

    list.forEach(function (g) {
      var c = el('button', 'gen-card'); c.type = 'button'; c.setAttribute('aria-pressed', 'false');
      var thumb = el('span', 'gen-thumb');
      if (SGS.UI) SGS.UI.setPortrait(thumb, g, false);
      c.appendChild(thumb);
      var text = el('span', 'gen-text');
      text.appendChild(el('span', 'nm', g.cn));
      text.appendChild(el('span', 'tt', g.title || ''));
      var mini = el('div', 'mini');
      var nb = el('span', 'nat-badge', SGS.NATIONS[g.nation].cn); nb.style.background = SGS.NATIONS[g.nation].color;
      mini.appendChild(nb); mini.appendChild(el('span', null, g.hp + ' 体力'));
      text.appendChild(mini); c.appendChild(text);
      c.title = g.desc || '';
      c.onclick = function () { selectGeneral(g.key, c); };
      grid.appendChild(c);
    });
  }

  function selectGeneral(key, node) {
    state.chosenGeneral = key;
    if (state.selEl) { state.selEl.classList.remove('sel'); state.selEl.setAttribute('aria-pressed', 'false'); }
    node.classList.add('sel'); state.selEl = node;
    node.setAttribute('aria-pressed', 'true');
    var selected = key && SGS.GENERALS[key];
    var label = selected ? selected.cn + ' · ' + (selected.title || SGS.NATIONS[selected.nation].cn) : '随机武将';
    if ($('generalSelection')) $('generalSelection').textContent = '当前：' + label;
  }

  function updateStartLabel() {
    var label = $('startBtn') && $('startBtn').querySelector('span');
    if (label) label.textContent = '开始 ' + state.numPlayers + ' 人牌局';
  }

  function buildCountSeg() {
    var seg = $('countSeg'); seg.innerHTML = '';
    [3, 4, 5, 6, 7, 8].forEach(function (n) {
      var b = el('button', n === state.numPlayers ? 'on' : '', n + '人');
      b.type = 'button'; b.setAttribute('aria-pressed', n === state.numPlayers ? 'true' : 'false');
      b.onclick = function () {
        state.numPlayers = n;
        Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); updateStartLabel();
      };
      seg.appendChild(b);
    });
    updateStartLabel();
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
    try { localStorage.setItem('sft_pace', JSON.stringify(v)); } catch (e) {}
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
    else {
      var sp = null;
      try {
        var savedPace = localStorage.getItem('sft_pace');
        if (savedPace == null) savedPace = localStorage.getItem('sgs_pace'); // one-way legacy migration
        sp = savedPace == null ? null : JSON.parse(savedPace);
      } catch (e) {}
      setPace(sp == null ? 0.8 : sp);
    }
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
    var license = $('licenseBtn');
    if (license) license.onclick = function () {
      SGS.UI.openModal(function (box) {
        box.appendChild(el('div', 'panel-kicker', '开放资产账本'));
        box.appendChild(el('h2', null, '来源与许可'));
        box.appendChild(el('p', 'license-copy', '24 张历史画像均来自 Wikimedia Commons 并经过许可审计：23 张为公有领域，孙尚香画像为 CC BY-SA 4.0。卡牌图标、界面纹理与音效由本项目代码生成。'));
        var links = el('div', 'license-links');
        var ledger = document.createElement('a'); ledger.href = 'assets/ATTRIBUTION.md'; ledger.textContent = '查看完整资产账本'; ledger.target = '_blank';
        var policy = document.createElement('a'); policy.href = 'docs/ASSET_POLICY.md'; policy.textContent = '查看开放资产政策'; policy.target = '_blank';
        links.appendChild(ledger); links.appendChild(policy); box.appendChild(links);
      });
    };
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
