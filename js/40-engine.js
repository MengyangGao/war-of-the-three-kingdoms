/* ==========================================================================
 * 三分天下 · 规则引擎 (engine)
 *   Game / Player, async turn loop, event & trigger dispatch,
 *   damage / heal / dying / death, distance & range, judgment, card moving.
 *
 *   The engine is fully async: every point where a player must choose calls
 *   `game.ask(player, request)` which delegates to that player's `agent`
 *   (AI in headless mode, UI for the human). AI resolves instantly; the UI
 *   resolves a Promise when the human clicks.
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var U = SGS.util;

  /* ============================ Player ============================ */
  function Player(game, opts) {
    this.game = game;
    this.id = opts.id;
    this.seat = opts.seat;
    this.name = opts.name || ('玩家' + opts.seat);
    this.isHuman = !!opts.isHuman;
    this.agent = null;                 // set later

    this.general = null;               // general def
    this.nation = null;
    this.gender = null;
    this.role = null;                  // lord|loyalist|rebel|traitor
    this.roleRevealed = false;

    this.maxHp = 4;
    this.hp = 4;
    this.alive = true;

    this.hand = [];                    // card objects
    this.equips = { weapon: null, armor: null, offhorse: null, defhorse: null };
    this.judgeZone = [];               // delayed trick cards awaiting judgment

    this.chained = false;              // 铁索连环 (横置)
    this.faceUp = true;                // 翻面 (turned over)
    this.flags = {};                   // per-turn / per-phase flags
    this.marks = {};                   // skill counters
    this.skills = [];                  // resolved skill objects
    this.history = { shaCount: 0 };    // per-turn action counts
  }

  Player.prototype.hasSkill = function (name) {
    for (var i = 0; i < this.skills.length; i++) if (this.skills[i].name === name) return true;
    return false;
  };
  Player.prototype.getSkill = function (name) {
    for (var i = 0; i < this.skills.length; i++) if (this.skills[i].name === name) return this.skills[i];
    return null;
  };
  Player.prototype.isWounded = function () { return this.hp < this.maxHp; };
  Player.prototype.lostHp = function () { return this.maxHp - this.hp; };
  Player.prototype.handCount = function () { return this.hand.length; };
  Player.prototype.equipCount = function () {
    var n = 0; for (var k in this.equips) if (this.equips[k]) n++; return n;
  };
  Player.prototype.allCards = function () {
    var a = this.hand.slice();
    for (var k in this.equips) if (this.equips[k]) a.push(this.equips[k]);
    for (var i = 0; i < this.judgeZone.length; i++) a.push(this.judgeZone[i]);
    return a;
  };
  Player.prototype.hasCard = function (card) {
    if (this.hand.indexOf(card) >= 0) return true;
    for (var k in this.equips) if (this.equips[k] === card) return true;
    if (this.judgeZone.indexOf(card) >= 0) return true;
    return false;
  };
  Player.prototype.getEquipByName = function (name) {
    for (var k in this.equips) { var e = this.equips[k]; if (e && e.name === name) return e; }
    return null;
  };
  Player.prototype.weaponRange = function () {
    return this.equips.weapon ? (this.equips.weapon.range || 1) : 1;
  };

  /* ============================ Game ============================ */
  function Game(opts) {
    opts = opts || {};
    this.opts = opts;
    this.seed = opts.seed != null ? opts.seed : (Date.now() & 0x7fffffff);
    this.rng = SGS.RNG(this.seed);
    this.numPlayers = opts.numPlayers == null ? 5 : opts.numPlayers;
    if (!Number.isInteger(this.numPlayers) || this.numPlayers < 2 || this.numPlayers > 8) {
      throw new RangeError('numPlayers must be an integer between 2 and 8');
    }

    this.players = [];
    this.deck = [];
    this.discard = [];
    // Cards currently resolving must not be shuffled back into the draw pile.
    this.resolvingCards = [];
    this.current = null;               // player whose turn it is
    this.phase = null;
    this.turnCount = 0;
    this.finished = false;
    this.started = false;
    this.initialHandsDealt = false;
    this.winners = null;
    this.log = [];
    this.logCallback = opts.logCallback || null;
    this.uiHook = opts.uiHook || null; // browser rendering hook
    this.maxTurns = opts.maxTurns == null ? 800 : opts.maxTurns; // safety valve for headless
    if (!Number.isInteger(this.maxTurns) || this.maxTurns <= 0) {
      throw new RangeError('maxTurns must be a positive integer');
    }
    this.align = {};   // public "table read": id -> alignment score (+pro-lord / -anti-lord)
    this.execution = { state: 'idle', request: null };
  }

  /* ---- public alignment read (used by AI inference; not a rule) ---- */
  Game.prototype.alignOf = function (p) { return this.align[p.id] || 0; };
  Game.prototype.bumpAlign = function (p, delta) {
    if (!p || p === this.players[0]) return;   // lord is fixed/known
    this.align[p.id] = (this.align[p.id] || 0) + delta;
    if (this.align[p.id] > 12) this.align[p.id] = 12;
    if (this.align[p.id] < -12) this.align[p.id] = -12;
  };

  /* ---------------- Serializable state boundary ----------------
   * This is intentionally a snapshot, not a restore implementation. It turns
   * the formerly implicit async call-stack state into a versioned contract for
   * future save/replay work and bug reports.
   */
  Game.prototype.snapshot = function () {
    function cardId(card) { return card && card.id; }
    function cards(list) { return (list || []).map(cardId); }
    function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
    return {
      schema: 1,
      seed: this.seed,
      rngState: this.rng.state ? this.rng.state() : null,
      uidState: SGS.util.uid.state ? SGS.util.uid.state() : null,
      numPlayers: this.numPlayers,
      turnCount: this.turnCount,
      currentId: this.current && this.current.id,
      phase: this.phase,
      started: this.started,
      finished: this.finished,
      winners: this.winners,
      deck: cards(this.deck),
      discard: cards(this.discard),
      resolvingCards: cards(this.resolvingCards),
      execution: clone(this.execution),
      align: clone(this.align),
      players: this.players.map(function (player) {
        return {
          id: player.id,
          seat: player.seat,
          role: player.role,
          roleRevealed: player.roleRevealed,
          general: player.general && player.general.key,
          hp: player.hp,
          maxHp: player.maxHp,
          alive: player.alive,
          chained: player.chained,
          faceUp: player.faceUp,
          hand: cards(player.hand),
          equips: {
            weapon: cardId(player.equips.weapon), armor: cardId(player.equips.armor),
            offhorse: cardId(player.equips.offhorse), defhorse: cardId(player.equips.defhorse)
          },
          judgeZone: cards(player.judgeZone),
          flags: clone(player.flags),
          history: clone(player.history)
        };
      })
    };
  };
  // an observable attack from `src` on `tgt` updates the table's read of `src`
  Game.prototype.readAttack = function (src, tgt) {
    if (!src || !tgt || src === tgt) return;
    if (tgt === this.players[0]) this.bumpAlign(src, -2.2);           // attacked the lord -> anti-lord
    else {
      var ts = this.alignOf(tgt);
      if (ts > 0.6) this.bumpAlign(src, -1.0);                        // attacked a loyal-looking -> anti
      else if (ts < -0.6) this.bumpAlign(src, 1.0);                   // attacked a rebel-looking -> pro
    }
  };
  Game.prototype.readHelp = function (src, tgt) {
    if (!src || !tgt || src === tgt) return;
    if (tgt === this.players[0]) this.bumpAlign(src, 2.5);            // saved/helped the lord -> pro
    else {
      var ts = this.alignOf(tgt);
      if (ts > 0.6) this.bumpAlign(src, 1.0);
      else if (ts < -0.6) this.bumpAlign(src, -1.0);
    }
  };

  Game.prototype.emitLog = function (entry) {
    this.log.push(entry);
    if (this.logCallback) {
      try { this.logCallback(entry); }
      catch (e) {
        if (this.opts.throwErrors) throw e;
        if (typeof console !== 'undefined') console.error('[SGS] log callback failed:', e);
      }
    }
  };
  // structured log helper
  Game.prototype.msg = function (text, opts) {
    var entry = { text: text, schema: 1 };
    if (opts) for (var k in opts) entry[k] = opts[k];
    var participants = [];
    function add(id) { if (id && participants.indexOf(id) < 0) participants.push(id); }
    add(entry.actorId);
    (entry.targetIds || []).forEach(add);
    add(entry.player);
    entry.participantIds = participants;
    this.emitLog(entry);
  };

  Game.prototype.alivePlayers = function () {
    return this.players.filter(function (p) { return p.alive; });
  };
  Game.prototype.aliveCount = function () { return this.alivePlayers().length; };

  // pacing hook: instant in headless, waits for animation queue + short pause in browser
  Game.prototype.uiPause = async function (ms) {
    if (!this.uiHook) return Promise.resolve();
    if (SGS.Anim) await SGS.Anim.ready();
    return SGS.util.delay((ms == null ? 260 : ms) * (SGS.PACE == null ? 1 : SGS.PACE));
  };

  // players in clockwise seat order starting *after* / *from* a given player
  Game.prototype.orderFrom = function (start, includeStart) {
    var alive = this.players.filter(function (p) { return p.alive; });
    alive.sort(function (a, b) { return a.seat - b.seat; });
    if (!alive.length) return [];
    if (!start) start = alive[0];
    var idx = alive.indexOf(start);
    if (idx < 0) {
      // start may be dead: find next by seat
      idx = 0;
      for (var i = 0; i < alive.length; i++) { if (alive[i].seat >= start.seat) { idx = i; break; } }
      includeStart = true;
    }
    var res = [];
    for (var j = 0; j < alive.length; j++) {
      res.push(alive[(idx + j) % alive.length]);
    }
    if (!includeStart) res.shift();
    return res;
  };

  Game.prototype.nextPlayer = function (p) {
    var order = this.orderFrom(p, false);
    return order[0];
  };

  /* ---------------- Setup ---------------- */
  var ROLE_TABLE = {
    2: ['lord', 'rebel'],
    3: ['lord', 'rebel', 'traitor'],
    4: ['lord', 'rebel', 'rebel', 'traitor'],
    5: ['lord', 'loyalist', 'rebel', 'rebel', 'traitor'],
    6: ['lord', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
    7: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'traitor'],
    8: ['lord', 'loyalist', 'loyalist', 'rebel', 'rebel', 'rebel', 'rebel', 'traitor']
  };

  Game.prototype.setup = function (config) {
    config = config || {};
    if (this.players.length) throw new Error('Game.setup() may only be called once');
    var n = this.numPlayers;
    // create players
    for (var i = 0; i < n; i++) {
      var p = new Player(this, {
        id: 'p' + i, seat: i,
        name: config.names && config.names[i] ? config.names[i] : null,
        isHuman: config.humanSeat === i
      });
      this.players.push(p);
    }
    // roles
    var roles = (ROLE_TABLE[n] || ROLE_TABLE[5]).slice();
    // lord fixed at seat 0; shuffle the rest
    var lord = roles.shift();
    this.rng.shuffle(roles);
    this.players[0].role = lord;
    this.players[0].roleRevealed = true; // lord is always revealed
    for (var r = 1; r < n; r++) this.players[r].role = roles[r - 1];
    // Seed the AIs' "suspicion" reads: AI players get a NOISY prior from their role
    // (imperfect, can misread), but the HUMAN starts unknown (0) — AIs must infer the
    // human purely from observed actions. Lord is a known anchor.
    this.align = {}; this.align[this.players[0].id] = 100;
    for (var s = 1; s < n; s++) {
      var pp = this.players[s];
      if (pp.isHuman) { this.align[pp.id] = 0; continue; }
      var base = pp.role === 'rebel' ? -1.7 : pp.role === 'loyalist' ? 1.4 : -0.2;
      this.align[pp.id] = base + (this.rng() * 1.8 - 0.9);
    }

    // deck
    this.deck = SGS.buildDeck();
    this.rng.shuffle(this.deck);

    this.emitLog({ text: '游戏开始，共 ' + n + ' 名玩家。', kind: 'system' });
  };

  Game.prototype.assignGenerals = function (assign) {
    // assign: array of general keys per seat (already chosen upstream)
    if (!Array.isArray(assign) || assign.length !== this.players.length) {
      throw new Error('assignGenerals() requires exactly one general per player');
    }
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var g = SGS.GENERALS[assign[i]];
      if (!g) throw new Error('Unknown general: ' + assign[i]);
      this.applyGeneral(p, g);
    }
  };

  Game.prototype.applyGeneral = function (p, g) {
    p.general = g;
    p.nation = g.nation;
    p.gender = g.gender;
    p.seatName = p.name;               // keep the "玩家N" seat label
    p.name = g.cn;                     // logs/ticker read this → show general names
    p.maxHp = g.hp + (p.role === 'lord' ? 1 : 0);
    p.hp = p.maxHp;
    p.skills = [];
    for (var i = 0; i < (g.skills || []).length; i++) {
      var sk = SGS.SKILLS[g.skills[i]];
      if (sk) p.skills.push(sk);
    }
    // lord skills (主公技) only active if lord
    if (p.role === 'lord' && g.lordSkills) {
      for (var j = 0; j < g.lordSkills.length; j++) {
        var lsk = SGS.SKILLS[g.lordSkills[j]];
        if (lsk) p.skills.push(lsk);
      }
    }
  };

  Game.prototype.dealInitialHands = function () {
    if (this.initialHandsDealt) throw new Error('Initial hands have already been dealt');
    if (this.players.some(function (p) { return !p.general; })) throw new Error('Assign generals before dealing initial hands');
    this.initialHandsDealt = true;
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var cards = this.deck.splice(0, 4);
      for (var c = 0; c < cards.length; c++) p.hand.push(cards[c]);
    }
  };

  /* ---------------- Agent bridge ---------------- */
  function canonicalOption(options, choice) {
    if (!choice) return null;
    if (options.indexOf(choice) >= 0) return choice;
    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      if (choice.special && choice.special === option.special) return option;
      if (choice.card && option.card && choice.card === option.card) return option;
    }
    return null;
  }

  Game.prototype.normalizeDecision = function (req, result) {
    if (!result) return null;
    var options, option, from, picked, min, max, i;
    if (req.type === 'respond' || req.type === 'wuxie' || req.type === 'rescue') {
      options = req.options || [];
      option = canonicalOption(options, result.option);
      if (!option) return null;
      return req.type === 'rescue' ? { option: option, card: option.card || null } : { option: option };
    }
    if (req.type === 'chooseZoneCard') {
      option = canonicalOption(req.options || [], result.option);
      return option ? { option: option } : null;
    }
    if (req.type === 'chooseOption') {
      options = req.choices || [];
      for (i = 0; i < options.length; i++) if (options[i].key === result.key) return { key: result.key };
      return null;
    }
    if (req.type === 'chooseCards' || req.type === 'discard') {
      from = req.from || [];
      picked = [];
      var submitted = result.cards || [];
      for (i = 0; i < submitted.length; i++) {
        if (from.indexOf(submitted[i]) >= 0 && picked.indexOf(submitted[i]) < 0) picked.push(submitted[i]);
      }
      min = req.min == null ? (req.count || 0) : req.min;
      max = req.max == null ? (req.count == null ? from.length : req.count) : req.max;
      return picked.length >= min && picked.length <= max ? { cards: picked } : null;
    }
    if (req.type === 'choosePlayers') {
      from = req.candidates || [];
      picked = [];
      var players = result.players || [];
      for (i = 0; i < players.length; i++) {
        if (from.indexOf(players[i]) >= 0 && players[i].alive && picked.indexOf(players[i]) < 0) picked.push(players[i]);
      }
      min = req.min == null ? 1 : req.min;
      max = req.max == null ? 1 : req.max;
      return picked.length >= min && picked.length <= max ? { players: picked } : null;
    }
    if (req.type === 'confirm') return { yes: result.yes === true };
    return result;
  };

  Game.prototype.ask = function (player, req) {
    req = req || {};
    req.self = player;
    var agent = player.agent;
    if (!agent) return Promise.resolve(null);
    var previousExecution = this.execution;
    var requestToken = SGS.util.uid('request');
    this.execution = {
      state: 'waitingForDecision',
      token: requestToken,
      playerId: player.id,
      request: {
        type: req.type,
        reason: req.reason || null,
        cardIds: (req.from || []).map(function (card) { return card.id; }),
        candidateIds: (req.candidates || []).map(function (candidate) { return candidate.id; }),
        optionCount: (req.options || req.choices || []).length
      }
    };
    var game = this;
    function complete(value) {
      if (game.execution && game.execution.token === requestToken) game.execution = previousExecution;
      return value;
    }
    try {
      var r = agent.decide(this, player, req);
      return Promise.resolve(r).then(function (result) {
        return complete(game.normalizeDecision(req, result));
      }).catch(function (e) {
        complete(null);
        game.emitLog({ text: 'agent error: ' + e.message, kind: 'error' });
        if (game.opts.throwErrors) throw e;
        return null;
      });
    } catch (e) {
      complete(null);
      this.emitLog({ text: 'agent error: ' + e.message, kind: 'error' });
      if (this.opts.throwErrors) return Promise.reject(e);
      return Promise.resolve(null);
    }
  };

  /* ---------------- Event / trigger dispatch ---------------- */
  // Fires a timing event. Skills register handlers under triggers[name].
  // Handlers: async (game, owner, ev) => void ; may mutate ev.
  Game.prototype.emit = async function (name, ev) {
    ev = ev || {};
    ev.name = name;
    ev.game = this;
    var start = this.current || this.players[0];
    var order = this.orderFrom(start, true);
    // include dead players for death-related timings
    if (name === 'die' || name === 'afterDeath') {
      order = this.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    }
    for (var i = 0; i < order.length; i++) {
      var p = order[i];
      if (!p.alive && name !== 'die' && name !== 'afterDeath') continue;
      var skills = p.skills;
      for (var s = 0; s < skills.length; s++) {
        var sk = skills[s];
        if (sk.triggers && sk.triggers[name]) {
          try {
            await sk.triggers[name](this, p, ev);
          } catch (e) {
            this.emitLog({ text: 'skill ' + sk.name + ' error: ' + e.message, kind: 'error' });
            if (this.opts.throwErrors) throw e;
          }
        }
      }
      if (ev.stop) break;
    }
    return ev;
  };

  /* ---------------- Card movement ---------------- */
  function expandRealCards(cards) {
    var out = [], seen = {};
    for (var i = 0; i < (cards || []).length; i++) {
      var c = cards[i];
      if (!c) continue;
      var list = c.virtual ? (c.subcards || []) : [c];
      for (var j = 0; j < list.length; j++) {
        var real = list[j];
        if (!real) continue;
        if (out.indexOf(real) >= 0) continue;
        if (real.id && seen[real.id]) continue;
        if (real.id) seen[real.id] = true;
        out.push(real);
      }
    }
    return out;
  }

  Game.prototype.beginCardResolution = function (card) {
    var real = expandRealCards([card]);
    for (var i = 0; i < real.length; i++) {
      if (this.resolvingCards.indexOf(real[i]) < 0) this.resolvingCards.push(real[i]);
    }
  };

  Game.prototype.endCardResolution = function (card) {
    var real = expandRealCards([card]);
    for (var i = 0; i < real.length; i++) U.remove(this.resolvingCards, real[i]);
  };

  Game.prototype.reshuffle = function () {
    if (this.discard.length === 0) return false;
    var resolving = this.resolvingCards;
    var available = this.discard.filter(function (c) { return resolving.indexOf(c) < 0; });
    if (available.length === 0) return false;
    this.discard = this.discard.filter(function (c) { return resolving.indexOf(c) >= 0; });
    this.deck = this.deck.concat(this.rng.shuffle(available));
    this.msg('牌堆已用尽，弃牌堆洗混作为新牌堆。', { kind: 'system' });
    return true;
  };

  Game.prototype.drawFromPile = function (n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      if (this.deck.length === 0) { if (!this.reshuffle()) break; }
      if (this.deck.length === 0) break;
      out.push(this.deck.shift());
    }
    return out;
  };

  Game.prototype.drawCards = async function (player, n, opts) {
    opts = opts || {};
    var cards = this.drawFromPile(n);
    for (var i = 0; i < cards.length; i++) player.hand.push(cards[i]);
    this.msg(player.name + ' 摸了 ' + cards.length + ' 张牌。', { kind: 'draw', player: player.id });
    if (this.uiHook) await this.uiHook('draw', { player: player, cards: cards });
    await this.uiPause(220);
    await this.emit('afterDraw', { player: player, cards: cards, reason: opts.reason });
    return cards;
  };

  // Remove a specific card from wherever it currently is (hand/equip/judge of any player, or piles)
  Game.prototype.detachCard = function (card) {
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (U.remove(p.hand, card)) return { owner: p, area: 'hand' };
      for (var k in p.equips) { if (p.equips[k] === card) { p.equips[k] = null; return { owner: p, area: 'equip', slot: k }; } }
      if (U.remove(p.judgeZone, card)) return { owner: p, area: 'judge' };
    }
    if (U.remove(this.deck, card)) return { area: 'deck' };
    if (U.remove(this.discard, card)) return { area: 'discard' };
    return null;
  };

  Game.prototype.emitCardLosses = async function (losses) {
    for (var i = 0; i < losses.length; i++) {
      var loss = losses[i];
      await this.emit('loseCardZone', {
        player: loss.owner, card: loss.card, area: loss.area, slot: loss.slot || null
      });
    }
  };

  // send real cards to the discard pile
  Game.prototype.toDiscard = async function (cards, opts) {
    opts = opts || {};
    var real = expandRealCards(cards);
    var lost = [];
    // A virtual delayed trick may itself live in a judge/hand zone while its
    // real subcards live only inside that container. Remove the container
    // first, otherwise both representations would remain countable.
    for (var v = 0; v < (cards || []).length; v++) {
      var virtual = cards[v];
      if (!virtual || !virtual.virtual) continue;
      var virtualInfo = this.detachCard(virtual);
      if (virtualInfo && virtualInfo.owner) {
        lost.push({ owner: virtualInfo.owner, card: virtual, area: virtualInfo.area, slot: virtualInfo.slot });
      }
    }
    for (var r = 0; r < real.length; r++) {
      var info = this.detachCard(real[r]);
      // Idempotency matters here: a duplicated response must not duplicate a card.
      if (!info && this.discard.indexOf(real[r]) >= 0) continue;
      this.discard.push(real[r]);
      if (info && info.owner && info.area) {
        lost.push({ owner: info.owner, card: real[r], area: info.area });
      }
    }
    if (real.length && opts.log !== false) {
      this.msg((opts.who ? opts.who.name + ' ' : '') + '弃置/使用了 ' +
        real.map(SGS.cardLabel).join('、'), { kind: 'discard' });
    }
    // emit loseCardZone so skills like 连营/枭姬 trigger when cards are used/played
    await this.emitCardLosses(lost);
    return real;
  };

  Game.prototype.discardCards = async function (player, cards, opts) {
    opts = opts || {};
    var real = await this.toDiscard(cards, { log: false });
    if (real.length) {
      this.msg(player.name + ' 弃置 ' + real.map(SGS.cardLabel).join('、'), { kind: 'discard', player: player.id });
      if (this.uiHook) await this.uiHook('discard', { player: player, cards: real });
      await this.emit('afterDiscard', { player: player, cards: real, reason: opts.reason });
    }
    return real;
  };

  // player gains cards (from another player or piles) into hand
  Game.prototype.gainCards = async function (player, cards, opts) {
    opts = opts || {};
    var gained = [], lost = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || player.hasCard(card)) continue;
      var info = this.detachCard(card);
      player.hand.push(card);
      gained.push(card);
      if (info && info.owner) lost.push({ owner: info.owner, card: card, area: info.area, slot: info.slot });
    }
    if (gained.length && opts.log !== false) {
      this.msg(player.name + ' 获得了 ' + gained.length + ' 张牌' +
        (opts.from ? ('（来自 ' + opts.from.name + '）') : ''), { kind: 'gain', player: player.id });
    }
    await this.emitCardLosses(lost);
    return gained;
  };

  // place a card into a player's equip slot (handles replacing existing)
  Game.prototype.equipCard = async function (player, card) {
    var slot = card.subtype; // weapon|armor|offhorse|defhorse
    if (!Object.prototype.hasOwnProperty.call(player.equips, slot)) throw new Error('Invalid equipment slot: ' + slot);
    var incoming = this.detachCard(card);
    var old = player.equips[slot];
    player.equips[slot] = card;
    this.msg(player.name + ' 装备了 ' + SGS.cardLabel(card), {
      kind: 'equip', player: player.id, actorId: player.id, targetIds: [player.id],
      action: 'equip', cardName: card.name
    });
    if (old) {
      this.discard.push(old);
    }
    var losses = [];
    if (incoming && incoming.owner) losses.push({ owner: incoming.owner, card: card, area: incoming.area, slot: incoming.slot });
    if (old) losses.push({ owner: player, card: old, area: 'equip', slot: slot });
    await this.emitCardLosses(losses);
    if (this.uiHook) await this.uiHook('equip', { player: player, card: card, old: old });
    await this.uiPause();
    await this.emit('afterEquip', { player: player, card: card });
  };

  // place a delayed trick into target's judge zone
  Game.prototype.placeJudgeCard = async function (target, card) {
    var real = expandRealCards([card]);
    var losses = [];
    var containerInfo = card.virtual ? this.detachCard(card) : null;
    if (containerInfo && containerInfo.owner) {
      losses.push({ owner: containerInfo.owner, card: card, area: containerInfo.area, slot: containerInfo.slot });
    }
    for (var i = 0; i < real.length; i++) {
      var info = this.detachCard(real[i]);
      if (info && info.owner) losses.push({ owner: info.owner, card: real[i], area: info.area, slot: info.slot });
    }
    target.judgeZone.push(card);
    this.msg(target.name + ' 被置入延时锦囊 ' + SGS.cardLabel(card), { kind: 'judge', player: target.id });
    if (this.uiHook) await this.uiHook('judgezone', { player: target });
    await this.emitCardLosses(losses);
  };

  /* ---------------- Distance & range ---------------- */
  Game.prototype.seatDistance = function (from, to) {
    var alive = this.alivePlayers().sort(function (a, b) { return a.seat - b.seat; });
    var i = alive.indexOf(from), j = alive.indexOf(to);
    if (i < 0 || j < 0) return 99;
    var n = alive.length;
    var d1 = (j - i + n) % n;
    var d2 = (i - j + n) % n;
    return Math.min(d1, d2);
  };

  Game.prototype.distance = function (from, to) {
    if (from === to) return 0;
    var d = this.seatDistance(from, to);
    // horses
    if (to.equips.defhorse) d += 1;
    if (from.equips.offhorse) d -= 1;
    // skill modifiers
    var ev = { from: from, to: to, dist: d };
    // additive skill hooks are applied synchronously
    this.applyDistanceSkills(ev);
    d = ev.dist;
    if (d < 1) d = 1;
    return d;
  };

  Game.prototype.applyDistanceSkills = function (ev) {
    // 'mashu' : from -1 to everyone ; '飞影/kongcheng' style : to +1
    var all = this.players;
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (!p.alive) continue;
      for (var s = 0; s < p.skills.length; s++) {
        var sk = p.skills[s];
        if (sk.distance) sk.distance(this, p, ev);
      }
    }
  };

  Game.prototype.attackRange = function (player) {
    var r = player.weaponRange();
    var ev = { player: player, range: r };
    for (var s = 0; s < player.skills.length; s++) {
      var sk = player.skills[s];
      if (sk.range) sk.range(this, player, ev);
    }
    return ev.range;
  };

  Game.prototype.inAttackRange = function (from, to) {
    return this.distance(from, to) <= this.attackRange(from);
  };

  /* ---------------- Judgment ---------------- */
  Game.prototype.judge = async function (player, opts) {
    opts = opts || {};
    var cards = this.drawFromPile(1);
    if (!cards.length) return null;
    var jcard = cards[0];
    var ev = { player: player, card: jcard, reason: opts.reason || '判定', delayCard: opts.delayCard || null, forceCard: null };
    this.msg(player.name + ' 判定：' + SGS.cardLabel(jcard), { kind: 'judge', player: player.id });
    // allow 改判 skills (鬼才/鬼道/...)
    await this.emit('judgeCard', ev);
    if (ev.forceCard && ev.forceCard !== ev.card) {
      // discard the original judge card, use the forced card as the result
      // if 天妒 already grabbed it, remove from that player's hand and place into discard
      if (ev.keptBy) { U.remove(ev.keptBy.hand, ev.card); this.discard.push(ev.card); ev.keptBy = null; }
      else { this.discard.push(ev.card); }
      ev.card = ev.forceCard;
      this.msg(player.name + ' 的判定被改为：' + SGS.cardLabel(ev.card), { kind: 'judge', player: player.id });
    }
    // Skills that obtain or inspect the effective judgment card run only after
    // all replacement effects have settled.
    await this.emit('judgeResult', ev);
    if (this.uiHook) await this.uiHook('judge', { player: player, card: ev.card, reason: ev.reason });
    await this.uiPause(320);
    // the judged card goes to discard unless a skill grabbed it
    if (!ev.keptBy) this.discard.push(ev.card);
    return ev.card;
  };

  /* ---------------- Damage / Heal ---------------- */
  Game.prototype.damage = async function (d) {
    // d: { source, target, amount, element, card, reason }
    if (this.finished) return;
    if (!d.target || !d.target.alive) return;
    d.amount = d.amount == null ? 1 : d.amount;
    d.element = d.element || 'normal';
    d.cancelled = false;
    d.dealt = false;

    await this.emit('beforeDamage', d);
    if (d.cancelled || d.amount <= 0) return;
    await this.emit('damageCaused', d);   // source-side (e.g. 强袭)
    if (d.cancelled || d.amount <= 0) return;
    await this.emit('damageInflict', d);  // target-side pre (e.g. 藤甲火焰)
    if (d.cancelled || d.amount <= 0) return;
    // 藤甲 (锁定技): fire damage +1
    if (d.element === 'fire' && d.target.equips.armor && d.target.equips.armor.name === 'tengjia') {
      d.amount += 1;
      this.msg(d.target.name + ' 的藤甲被点燃，火焰伤害+1。', { kind: 'equip', player: d.target.id });
    }
    if (d.cancelled || d.amount <= 0) return;

    d.target.hp -= d.amount;
    d.dealt = true;
    this.msg(d.target.name + ' 受到 ' + d.amount + ' 点' +
      (d.element === 'fire' ? '火焰' : d.element === 'thunder' ? '雷电' : '') + '伤害' +
      (d.source ? ('（来自 ' + d.source.name + '）') : '') + '，剩余体力 ' + d.target.hp,
      {
        kind: 'damage', player: d.target.id, actorId: d.source && d.source.id,
        targetIds: [d.target.id], action: 'damage', amount: d.amount, element: d.element
      });
    if (this.uiHook) await this.uiHook('damage', { target: d.target, source: d.source, amount: d.amount, element: d.element });
    if (d.source) this.readAttack(d.source, d.target);   // update the table's alignment read
    await this.uiPause();

    await this.emit('afterDamage', d);       // e.g. 反馈/奸雄/刚烈
    // chain reaction (铁索连环) for elemental damage
    if ((d.element === 'fire' || d.element === 'thunder') && d.target.chained && !d._chainProp) {
      d.target.chained = false;
      this.msg(d.target.name + ' 的连环被解除。', { kind: 'system' });
      if (this.uiHook) await this.uiHook('chain', { player: d.target });
    }
    if (d.target.hp <= 0) await this.enterDying(d.target, d);
    if (this.finished) return;

    // propagate chain damage to other chained players
    if ((d.element === 'fire' || d.element === 'thunder') && !d._chainProp && d._chainTargets == null) {
      var chained = this.alivePlayers().filter(function (p) { return p.chained && p !== d.target; });
      for (var i = 0; i < chained.length; i++) {
        if (!chained[i].alive) continue;
        chained[i].chained = false;
        if (this.uiHook) await this.uiHook('chain', { player: chained[i] });
        await this.damage({ source: d.source, target: chained[i], amount: d.amount, element: d.element, card: d.card, _chainProp: true, reason: '连环' });
      }
    }
  };

  Game.prototype.loseHp = async function (player, amount, opts) {
    opts = opts || {};
    if (this.finished) return;
    if (!player.alive) return;
    amount = amount == null ? 1 : amount;
    player.hp -= amount;
    this.msg(player.name + ' 流失 ' + amount + ' 点体力，剩余 ' + player.hp, { kind: 'damage', player: player.id });
    if (this.uiHook) await this.uiHook('damage', { target: player, amount: amount, source: null });
    await this.emit('afterLoseHp', { player: player, amount: amount, reason: opts.reason });
    if (player.hp <= 0) await this.enterDying(player, { source: opts.source || null, target: player, loseHp: true });
  };

  Game.prototype.recover = async function (player, amount, opts) {
    opts = opts || {};
    if (!player.alive) return;
    amount = amount == null ? 1 : amount;
    if (player.hp >= player.maxHp) return;
    var before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    var recovered = player.hp - before;
    this.msg(player.name + ' 回复 ' + recovered + ' 点体力，当前 ' + player.hp, {
      kind: 'heal', player: player.id, actorId: opts.source && opts.source.id,
      targetIds: [player.id], action: 'recover', amount: recovered, reason: opts.reason
    });
    if (this.uiHook) await this.uiHook('heal', { player: player, amount: recovered });
    await this.emit('afterRecover', { player: player, amount: recovered, reason: opts.reason });
  };

  /* ---------------- Dying / death ---------------- */
  Game.prototype.enterDying = async function (player, dmg) {
    await this.emit('dying', { player: player, damage: dmg });
    if (this.uiHook) await this.uiHook('dying', { player: player });
    // rescue loop: ask (starting from dying) only players who actually have 桃/酒/rescue
    while (player.hp <= 0 && player.alive && !this.finished) {
      var order = this.orderFrom(player, true);
      for (var i = 0; i < order.length; i++) {
        var savior = order[i];
        if (player.hp > 0) break;
        var canWine = (savior === player); // 酒 only usable by self while dying
        var need = canWine ? 'peachOrWine' : 'tao';
        var options = SGS.gatherResponses(this, savior, need, { rescue: true });
        if (!options.length) continue;    // no 桃/酒/急救 -> don't even ask
        var res = await this.ask(savior, {
          type: 'rescue', dying: player, canWine: canWine, options: options,
          reason: player.name + ' 濒死，是否使用桃' + (canWine ? '/酒' : '') + '？'
        });
        if (res && res.card) {
          var card = res.card;
          await this.toDiscard([card], { who: savior, log: false });
          this.msg(savior.name + ' 使用 ' + (card.virtual ? card.cn : SGS.cardLabel(card)) +
            ' 救助 ' + player.name, {
              kind: 'heal', actorId: savior.id, targetIds: [player.id], action: 'rescue', cardName: card.name
            });
          if (this.uiHook) await this.uiHook('rescue', { savior: savior, dying: player, card: card });
          this.readHelp(savior, player);
          await this.recover(player, 1, { reason: 'rescue' });
          // 救援 (孙权 主公技): 吴势力他人回合外用桃救孙权，回复量+1
          if (player.hasSkill('jiuyuan') && savior !== player && savior.nation === 'wu' && this.current !== savior && player.hp > 0) {
            this.msg(player.name + ' 发动【救援】，' + savior.name + ' 的桃额外回复1点。', { kind: 'skill', player: player.id });
            await this.recover(player, 1, { reason: 'jiuyuan' });
          }
        }
      }
      if (player.hp > 0) break;
      // nobody left who could (or would) save -> death
      await this.die(player, dmg);
      break;
    }
  };

  Game.prototype.die = async function (player, dmg) {
    if (!player.alive) return;
    player.alive = false;
    player.roleRevealed = true;
    this.msg(player.name + '（' + SGS.ROLES[player.role].cn + '）阵亡。', { kind: 'death', player: player.id });
    if (this.uiHook) await this.uiHook('death', { player: player });

    // drop all cards (expand any view-as delayed tricks to their real sub-cards)
    var raw = player.hand.slice();
    for (var k in player.equips) if (player.equips[k]) raw.push(player.equips[k]);
    raw = raw.concat(player.judgeZone.slice());
    player.hand = [];
    player.equips = { weapon: null, armor: null, offhorse: null, defhorse: null };
    player.judgeZone = [];
    var all = [];
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].virtual) { for (var q = 0; q < raw[i].subcards.length; q++) all.push(raw[i].subcards[q]); }
      else all.push(raw[i]);
    }
    for (var d = 0; d < all.length; d++) this.discard.push(all[d]);

    await this.emit('die', { player: player, damage: dmg });

    // rewards / penalties
    var killer = dmg && dmg.source;
    if (player.role === 'rebel' && killer && killer.alive) {
      await this.drawCards(killer, 3, { reason: 'kill-rebel' });
      this.msg(killer.name + ' 击杀反贼，摸三张牌。', { kind: 'reward' });
    } else if (player.role === 'loyalist' && killer && killer.role === 'lord') {
      // lord killed a loyalist -> lord discards all cards
      var lord = killer;
      var lc = lord.hand.slice();
      for (var kk in lord.equips) if (lord.equips[kk]) lc.push(lord.equips[kk]);
      await this.discardCards(lord, lc, { reason: 'kill-loyalist' });
      this.msg(lord.name + ' 误杀忠臣，弃置所有手牌与装备。', { kind: 'penalty' });
    }

    await this.checkWin();
  };

  Game.prototype.checkWin = async function () {
    if (this.finished) return this.winners;
    var alive = this.alivePlayers();
    var lord = this.players[0];
    var rebelsAlive = alive.some(function (p) { return p.role === 'rebel'; });
    var traitorAlive = alive.some(function (p) { return p.role === 'traitor'; });

    if (!lord.alive) {
      // lord dead
      if (alive.length === 1 && traitorAlive) {
        this.finished = true; this.winners = 'traitor';
      } else {
        this.finished = true; this.winners = 'rebel';
      }
    } else {
      if (!rebelsAlive && !traitorAlive) {
        this.finished = true; this.winners = 'lord';
      }
    }
    if (this.finished) {
      var label = { lord: '主公 / 忠臣', rebel: '反贼', traitor: '内奸' }[this.winners];
      this.msg('游戏结束，胜利方：' + label, { kind: 'gameover' });
      if (this.uiHook) await this.uiHook('gameover', { winners: this.winners });
    }
    return this.winners;
  };

  /* ---------------- Turn loop ---------------- */
  Game.prototype.start = async function () {
    if (this.started) throw new Error('Game.start() may only be called once');
    if (!this.players.length || this.players.some(function (p) { return !p.general || !p.agent; })) {
      throw new Error('Game must be set up with generals and agents before start()');
    }
    this.started = true;
    this.emitLog({ text: '========= 开局 =========', kind: 'system' });
    await this.emit('gameStart', {});
    this.current = this.players[0];
    var guard = 0;
    while (!this.finished && guard < this.maxTurns) {
      guard++;
      await this.runTurn(this.current);
      if (this.finished) break;
      this.current = this.nextPlayer(this.current);
      if (!this.current) break;
    }
    if (!this.finished) {
      // safety valve
      this.finished = true; this.winners = this.winners || 'draw';
      this.msg('回合数达到上限（' + this.maxTurns + '），对局中止。', { kind: 'system' });
      if (typeof console !== 'undefined') console.warn('[SGS] turn guard hit: maxTurns=' + this.maxTurns + ' reached without a winner (seed ' + this.seed + ')');
    }
    return this.winners;
  };

  Game.prototype.runTurn = async function (player) {
    if (!player.alive) return;
    this.turnCount++;
    player.flags = {};
    player.history = { shaCount: 0 };
    this.msg('—— ' + player.name + ' 的回合 ——', { kind: 'turn', player: player.id });
    if (this.uiHook) await this.uiHook('turnStart', { player: player });

    // turned over (翻面): skip turn and flip back
    if (!player.faceUp) {
      player.faceUp = true;
      this.msg(player.name + ' 处于翻面状态，本回合跳过，并翻回正面。', { kind: 'system' });
      if (this.uiHook) await this.uiHook('faceup', { player: player });
      return;
    }

    await this.emit('turnStart', { player: player });

    var phases = ['start', 'judge', 'draw', 'play', 'discard', 'end'];
    for (var i = 0; i < phases.length && !this.finished && player.alive; i++) {
      player.phase = phases[i];
      this.phase = phases[i];
      await this.runPhase(player, phases[i]);
    }

    await this.emit('turnEnd', { player: player });
    if (this.uiHook) await this.uiHook('turnEnd', { player: player });
  };

  Game.prototype.runPhase = async function (player, phase) {
    var previousExecution = this.execution;
    this.execution = { state: 'resolvingPhase', playerId: player.id, phase: phase, request: null };
    try {
      var skip = { flag: false };
      await this.emit('phaseStart', { player: player, phase: phase, skip: skip });
      if (skip.flag) return;
      if (player['skip_' + phase]) { player['skip_' + phase] = false; return; }
      if (this.uiHook) await this.uiHook('phase', { player: player, phase: phase });

      if (phase === 'judge') await this.phaseJudge(player);
      else if (phase === 'draw') await this.phaseDraw(player);
      else if (phase === 'play') await this.phasePlay(player);
      else if (phase === 'discard') await this.phaseDiscard(player);

      await this.emit('phaseEnd', { player: player, phase: phase });
    } finally {
      this.execution = previousExecution;
    }
  };

  Game.prototype.phaseJudge = async function (player) {
    // resolve delayed tricks in judge zone (in order last-in-first-out per rules: from top)
    while (player.judgeZone.length && player.alive && !this.finished) {
      var card = player.judgeZone[player.judgeZone.length - 1];
      // remove from zone; card goes to discard after resolving
      U.remove(player.judgeZone, card);
      if (this.uiHook) await this.uiHook('judgezone', { player: player });
      card._moved = false;
      await SGS.resolveDelayTrick(this, player, card);
      if (!card._moved) {
        if (card.virtual) { for (var vv = 0; vv < card.subcards.length; vv++) this.discard.push(card.subcards[vv]); }
        else this.discard.push(card);
      }
    }
  };

  Game.prototype.phaseDraw = async function (player) {
    var ev = { player: player, num: 2, skip: false };
    await this.emit('drawPhaseNum', ev);
    if (ev.skip) { this.msg(player.name + ' 跳过摸牌阶段。', { kind: 'system' }); return; }
    if (ev.num > 0) await this.drawCards(player, ev.num, { reason: 'drawPhase' });
  };

  Game.prototype.phaseDiscard = async function (player) {
    var limit = this.discardLimit(player);
    var over = player.hand.length - limit;
    if (over <= 0) return;
    var res = await this.ask(player, {
      type: 'discard', count: over, min: over, max: over,
      from: player.hand.slice(), reason: '弃牌阶段：需弃置 ' + over + ' 张手牌'
    });
    var cards = (res && res.cards) ? res.cards : null;
    if (!cards || cards.length < over) {
      // fallback: discard lowest-value cards
      cards = SGS.ai ? SGS.ai.pickDiscards(this, player, over) : player.hand.slice(0, over);
    }
    await this.discardCards(player, cards.slice(0, over), { reason: 'discardPhase' });
  };

  Game.prototype.discardLimit = function (player) {
    var ev = { player: player, limit: Math.max(0, player.hp) };
    for (var s = 0; s < player.skills.length; s++) {
      var sk = player.skills[s];
      if (sk.handLimit) sk.handLimit(this, player, ev);
    }
    return ev.limit;
  };

  /* ---------------- Play phase ---------------- */
  Game.prototype.phasePlay = async function (player) {
    var guard = 0;
    while (player.alive && !this.finished && guard < 200) {
      guard++;
      var options = SGS.playOptions(this, player);
      if (this.uiHook) await this.uiHook('playPhase', { player: player, options: options });
      var action = await this.ask(player, { type: 'play', options: options });
      if (!action || action.end || action.type === 'end') break;
      var ok = await SGS.executePlayAction(this, player, action);
      if (!ok) {
        // invalid action from agent; end to avoid loop
        if (action._retry) continue; else break;
      }
    }
    if (guard >= 200 && typeof console !== 'undefined') console.warn('[SGS] play-phase guard hit (200 actions) for ' + player.name + ' — possible loop (seed ' + this.seed + ')');
  };

  /* expose */
  SGS.Player = Player;
  SGS.Game = Game;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
