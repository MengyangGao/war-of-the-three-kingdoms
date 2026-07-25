/* ===========================================================================
 * 三分天下 · 启动与装配 (main / boot)
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof document === 'undefined') return;

  var state = { numPlayers: 8, chosenGeneral: null };
  var CHECKPOINT_KEY = 'sft_checkpoint_v2';
  var checkpointIssue = '';

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
    var control = $('paceControl');
    if (control) {
      var best = 0, bestDiff = Infinity;
      for (var i = 0; i < control.options.length; i++) {
        var diff = Math.abs(parseFloat(control.options[i].value) - v);
        if (diff < bestDiff) { best = i; bestDiff = diff; }
      }
      control.selectedIndex = best;
    }
  }
  SGS.setPace = setPace;

  function readCheckpoint() {
    try {
      var raw = localStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      var value = JSON.parse(raw);
      if (value.schema !== SGS.CHECKPOINT_SCHEMA) {
        checkpointIssue = '上次存档版本已不兼容，已安全忽略。';
        return null;
      }
      if (!value.resumable || !value.started || value.finished) {
        checkpointIssue = '上次存档不是可恢复的回合边界，已安全忽略。';
        return null;
      }
      return value;
    } catch (e) {
      checkpointIssue = '上次存档已损坏，已安全忽略。';
      return null;
    }
  }

  function saveCheckpoint(value) {
    try {
      value.savedAt = Date.now();
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(value));
    } catch (e) {
      showNotice('浏览器无法保存本局进度；当前牌局仍可继续。');
    }
  }

  function clearCheckpoint() {
    try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
    var card = $('resumeCard');
    if (card) card.classList.add('hidden');
  }
  SGS.clearCheckpoint = clearCheckpoint;

  function relativeSaveTime(savedAt) {
    if (!savedAt) return '较早保存';
    var seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
    if (seconds < 60) return '刚刚保存';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
    return new Date(savedAt).toLocaleDateString('zh-CN');
  }

  function checkpointMeta(snapshot) {
    var human = (snapshot.players || []).filter(function (player) { return player.isHuman; })[0];
    var general = human && human.general && SGS.GENERALS[human.general];
    var name = general ? general.cn : '未知武将';
    return snapshot.numPlayers + ' 人 · ' + name + ' · 第 ' + Math.max(1, snapshot.turnCount || 1) + ' 回合 · ' + relativeSaveTime(snapshot.savedAt);
  }

  function showNotice(message) {
    var notice = $('notice');
    if (!notice) return;
    notice.textContent = message;
    notice.classList.remove('hidden');
    var hide = function () { notice.classList.add('hidden'); };
    if (SGS.Timeline) {
      SGS.Timeline.cancelScope('notice');
      SGS.Timeline.after('notice', 4200, hide, hide);
    } else setTimeout(hide, 4200);
  }
  SGS.showNotice = showNotice;

  function showContinueIfAvailable() {
    var snapshot = readCheckpoint();
    var card = $('resumeCard');
    if (card) card.classList.toggle('hidden', !snapshot);
    if (snapshot && $('continueMeta')) $('continueMeta').textContent = checkpointMeta(snapshot);
    if (!snapshot && checkpointIssue) {
      try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
      showNotice(checkpointIssue);
    }
  }

  function preloadPortraits(game) {
    if (!SGS.ART) return;
    for (var i = 0; i < game.players.length; i++) {
      var key = game.players[i].general && game.players[i].general.key;
      var url = key && SGS.ART.portraitUrl(key);
      if (url) { var image = new Image(); image.src = url; }
    }
  }

  function runBrowserGame(game, human, demo, resume) {
    game.checkpointCallback = demo ? null : saveCheckpoint;
    preloadPortraits(game);
    SGS.UI.start(game, human);
    SGS.UI.setHint(resume ? '正在恢复上次牌局…' : '正在布置牌局…');
    window.__game = game;
    if (demo) window.__demoGame = game;
    var run = resume ? game.resume() : game.start();
    run.then(function () {
      window.__gameDone = true;
      clearCheckpoint();
    }).catch(function (err) {
      window.__gameDone = true;
      game.msg('对局异常中止：' + (err && err.message ? err.message : String(err)), { kind: 'error' });
      showNotice('对局异常中止。进度已保留，可刷新后尝试继续。');
      if (typeof console !== 'undefined') console.error(err);
    });
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

    var human = game.players[humanSeat];
    for (var i = 0; i < game.players.length; i++) {
      var isHuman = (game.players[i] === human) && !demo;
      game.players[i].agent = isHuman ? SGS.HumanAgent : SGS.BrowserAI;
    }
    game.dealInitialHands();
    runBrowserGame(game, human, demo, false);
  }

  function continueGame() {
    var snapshot = readCheckpoint();
    if (!snapshot) { clearCheckpoint(); return; }
    $('startBtn').disabled = true;
    $('continueBtn').disabled = true;
    try {
      var game = SGS.Game.restore(snapshot, {
        agentFactory: function (player, data) { return data.isHuman ? SGS.HumanAgent : SGS.BrowserAI; }
      });
      var human = game.players.filter(function (player) { return player.isHuman; })[0];
      if (!human) throw new Error('存档缺少玩家席位');
      runBrowserGame(game, human, false, true);
    } catch (error) {
      clearCheckpoint();
      $('startBtn').disabled = false;
      showNotice('存档恢复失败，已回到新牌局设置。');
      if (typeof console !== 'undefined') console.error('[SGS] checkpoint restore failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildGeneralGrid();
    buildCountSeg();
    showContinueIfAvailable();
    $('startBtn').onclick = startGame;
    $('continueBtn').onclick = continueGame;
    var discard = $('discardSaveBtn');
    if (discard) discard.onclick = function () {
      if (discard.dataset.confirm !== 'yes') {
        discard.dataset.confirm = 'yes';
        discard.classList.add('confirm');
        discard.textContent = '再次点击删除';
        var reset = function () {
          discard.dataset.confirm = '';
          discard.classList.remove('confirm');
          discard.textContent = '删除存档';
        };
        if (SGS.Timeline) SGS.Timeline.after('discard-confirm', 4000, reset, reset);
        else setTimeout(reset, 4000);
        return;
      }
      if (SGS.Timeline) SGS.Timeline.cancelScope('discard-confirm');
      clearCheckpoint();
      showNotice('上次牌局存档已删除。');
    };
    var paceControl = $('paceControl');
    if (paceControl) paceControl.onchange = function () { setPace(parseFloat(paceControl.value)); };
    var license = $('licenseBtn');
    if (license) license.onclick = function () { SGS.UI.assetCredits(); };
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
