/* ==========================================================================
 * 三分天下 · 音效与配乐 — 纯 WebAudio 程序化合成，无需素材，离线可用
 *   SGS.Sound.init()         create/resume AudioContext (call on a user gesture)
 *   SGS.Sound.play(name)     one-shot SFX
 *   SGS.Sound.setSfx(on) / setMusic(on) / setVolume(v)
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  if (typeof window === 'undefined') return;

  var S = SGS.Sound = SGS.Sound || {};
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master = null, musicGain = null, musicTimer = null;

  function load(key, def) { try { var v = localStorage.getItem('sft_' + key); if (v == null) v = localStorage.getItem('sgs_' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem('sft_' + key, JSON.stringify(v)); } catch (e) {} }
  function clampVolume(v) {
    v = Number(v);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
  }

  S.sfxOn = load('sfx', true) !== false;
  S.musicOn = load('music', false) === true;
  S.volume = clampVolume(load('vol', 0.7));

  S.init = function () {
    if (!AC) return;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return; }
      master = ctx.createGain(); master.gain.value = S.volume; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (S.musicOn) S.startMusic();
  };

  function env(node, t0, peak, attack, decay) {
    var g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
  function tone(freq, t0, dur, type, peak) {
    if (!ctx) return;
    var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    var g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, t0, peak || 0.25, 0.008, dur);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function sweep(f1, f2, t0, dur, type, peak) {
    if (!ctx) return;
    var o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    var g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, t0, peak || 0.22, 0.006, dur);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, peak, filt, hp) {
    if (!ctx) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = filt || 1800;
    var g = ctx.createGain(); g.gain.value = peak || 0.25;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  var RECIPES = {
    sha: function (t) { noise(t, 0.12, 0.3, 3200, true); sweep(520, 180, t, 0.14, 'sawtooth', 0.18); },
    fire: function (t) { noise(t, 0.3, 0.28, 1400); sweep(300, 90, t, 0.32, 'sawtooth', 0.16); },
    thunder: function (t) { noise(t, 0.05, 0.4, 4000, true); tone(70, t, 0.35, 'square', 0.3); },
    shan: function (t) { sweep(700, 1500, t, 0.16, 'sine', 0.2); },
    tao: function (t) { [523, 659, 784].forEach(function (f, i) { tone(f, t + i * 0.07, 0.22, 'sine', 0.2); }); },
    heal: function (t) { [440, 587, 740].forEach(function (f, i) { tone(f, t + i * 0.06, 0.2, 'triangle', 0.18); }); },
    damage: function (t) { noise(t, 0.16, 0.4, 900); tone(110, t, 0.16, 'square', 0.28); },
    judge: function (t) { tone(880, t, 0.1, 'triangle', 0.22); tone(1320, t + 0.09, 0.18, 'sine', 0.18); },
    equip: function (t) { tone(1600, t, 0.06, 'square', 0.16); tone(2100, t + 0.05, 0.1, 'square', 0.14); },
    draw: function (t) { noise(t, 0.09, 0.16, 5000, true); },
    trick: function (t) { sweep(300, 900, t, 0.2, 'triangle', 0.18); tone(1200, t + 0.12, 0.12, 'sine', 0.12); },
    death: function (t) { [392, 330, 262, 196].forEach(function (f, i) { tone(f, t + i * 0.12, 0.28, 'sawtooth', 0.2); }); },
    win: function (t) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.13, 0.4, 'triangle', 0.26); }); },
    lose: function (t) { [440, 349, 262].forEach(function (f, i) { tone(f, t + i * 0.18, 0.5, 'sawtooth', 0.24); }); },
    click: function (t) { tone(660, t, 0.05, 'square', 0.12); },
    turn: function (t) { tone(392, t, 0.12, 'sine', 0.16); tone(523, t + 0.1, 0.18, 'sine', 0.16); }
  };

  S.play = function (name) {
    if (!S.sfxOn || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var r = RECIPES[name]; if (!r) return;
    try { r(ctx.currentTime + 0.001); } catch (e) {}
  };

  /* ---- ambient music: slow guzheng-ish pentatonic loop ---- */
  var PENTA = [262, 294, 330, 392, 440, 523, 587, 659];
  S.startMusic = function () {
    if (!ctx || musicTimer) return;
    musicGain.gain.setTargetAtTime(0.12, ctx.currentTime, 1.5);
    var step = 0;
    musicTimer = setInterval(function () {
      if (!ctx || ctx.state === 'suspended') return;
      var t = ctx.currentTime + 0.02;
      var f = PENTA[Math.floor(Math.random() * PENTA.length)] / (Math.random() < 0.4 ? 2 : 1);
      var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      var g = ctx.createGain(); o.connect(g); g.connect(musicGain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.start(t); o.stop(t + 2.0);
      if (step % 4 === 0) { // occasional low drone
        var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 98;
        var g2 = ctx.createGain(); o2.connect(g2); g2.connect(musicGain);
        g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.35, t + 0.3); g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o2.start(t); o2.stop(t + 2.4);
      }
      step++;
    }, 900);
  };
  S.stopMusic = function () {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicGain && ctx) musicGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.5);
  };

  S.setSfx = function (on) { S.sfxOn = !!on; save('sfx', S.sfxOn); };
  S.setMusic = function (on) { S.musicOn = !!on; save('music', S.musicOn); if (on) { S.init(); S.startMusic(); } else S.stopMusic(); };
  S.setVolume = function (v) {
    S.volume = clampVolume(v);
    save('vol', S.volume);
    if (master && ctx) master.gain.setTargetAtTime(S.volume, ctx.currentTime, 0.05);
  };

  // map a card to its sfx
  S.forCard = function (card) {
    if (!card) return 'click';
    if (card.name === 'sha') return card.element === 'fire' ? 'fire' : card.element === 'thunder' ? 'thunder' : 'sha';
    if (card.name === 'shan') return 'shan';
    if (card.name === 'tao') return 'tao';
    if (card.name === 'jiu') return 'trick';
    if (card.type === 'equip') return 'equip';
    if (card.type === 'trick') return 'trick';
    return 'click';
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
