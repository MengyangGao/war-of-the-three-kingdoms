/* ===========================================================================
 * 三分天下 · 可恢复检查点
 *
 * 只在 readyTurn 安全边界恢复：牌与玩家状态、RNG、公开推断、日志和下一位
 * 行动者全部序列化；正在结算技能或等待选择的快照可用于诊断，但明确不可恢复。
 * ========================================================================== */
(function (root) {
  'use strict';
  var SGS = root.SGS = root.SGS || {};
  var Game = SGS.Game;
  var Player = SGS.Player;
  if (!Game || !Player) throw new Error('checkpoint module requires engine');

  var SCHEMA = 2;

  function clone(value, fallback) {
    if (value == null) return fallback;
    return JSON.parse(JSON.stringify(value));
  }

  function cardIds(cards) {
    return (cards || []).map(function (card) { return card && card.id; });
  }

  function collectCards(game) {
    var table = {};
    function add(card) {
      if (!card || !card.id || table[card.id]) return;
      table[card.id] = {
        id: card.id, name: card.name, cn: card.cn, type: card.type,
        subtype: card.subtype || null, suit: card.suit || null,
        rank: card.rank == null ? null : card.rank,
        element: card.element || 'normal', range: card.range || null,
        virtual: !!card.virtual,
        subcardIds: card.virtual ? cardIds(card.subcards) : []
      };
      (card.subcards || []).forEach(add);
    }
    game.deck.forEach(add);
    game.discard.forEach(add);
    game.resolvingCards.forEach(add);
    game.players.forEach(function (player) {
      player.hand.forEach(add);
      player.judgeZone.forEach(add);
      for (var slot in player.equips) add(player.equips[slot]);
    });
    return table;
  }

  function playerSnapshot(player) {
    return {
      id: player.id,
      seat: player.seat,
      name: player.name,
      seatName: player.seatName || null,
      isHuman: player.isHuman,
      role: player.role,
      roleRevealed: player.roleRevealed,
      general: player.general && player.general.key,
      nation: player.nation,
      gender: player.gender,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
      chained: player.chained,
      faceUp: player.faceUp,
      phase: player.phase || null,
      hand: cardIds(player.hand),
      equips: {
        weapon: player.equips.weapon && player.equips.weapon.id,
        armor: player.equips.armor && player.equips.armor.id,
        offhorse: player.equips.offhorse && player.equips.offhorse.id,
        defhorse: player.equips.defhorse && player.equips.defhorse.id
      },
      judgeZone: cardIds(player.judgeZone),
      flags: clone(player.flags, {}),
      marks: clone(player.marks, {}),
      history: clone(player.history, {}),
      skip: {
        start: !!player.skip_start, judge: !!player.skip_judge,
        draw: !!player.skip_draw, play: !!player.skip_play,
        discard: !!player.skip_discard, end: !!player.skip_end
      }
    };
  }

  Game.prototype.snapshot = function () {
    var execution = clone(this.execution, { state: 'unknown', resumable: false });
    var resumable = !!(execution.resumable &&
      (execution.state === 'notStarted' || execution.state === 'readyTurn' || execution.state === 'finished'));
    return {
      schema: SCHEMA,
      resumable: resumable,
      seed: this.seed,
      rngState: this.rng.state(),
      uidState: SGS.util.uid.state(),
      numPlayers: this.numPlayers,
      maxTurns: this.maxTurns,
      turnCount: this.turnCount,
      eventSequence: this.eventSequence,
      currentId: this.current && this.current.id,
      phase: this.phase,
      started: this.started,
      initialHandsDealt: this.initialHandsDealt,
      finished: this.finished,
      winners: this.winners,
      execution: execution,
      align: clone(this.align, {}),
      cardTable: collectCards(this),
      deck: cardIds(this.deck),
      discard: cardIds(this.discard),
      resolvingCards: cardIds(this.resolvingCards),
      players: this.players.map(playerSnapshot),
      log: clone(this.log.slice(-200), [])
    };
  };

  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schema !== SCHEMA) {
      throw new Error('Unsupported checkpoint schema; expected ' + SCHEMA);
    }
    if (!snapshot.resumable) throw new Error('Checkpoint was captured inside a non-resumable resolution');
    if (!Array.isArray(snapshot.players) || snapshot.players.length !== snapshot.numPlayers) {
      throw new Error('Checkpoint player count is inconsistent');
    }
    if (!snapshot.cardTable || typeof snapshot.cardTable !== 'object') {
      throw new Error('Checkpoint card table is missing');
    }
  }

  function restoreCards(snapshot) {
    var cards = {};
    Object.keys(snapshot.cardTable).forEach(function (id) {
      var data = snapshot.cardTable[id];
      cards[id] = {
        id: data.id, name: data.name, cn: data.cn, type: data.type,
        subtype: data.subtype, suit: data.suit, rank: data.rank,
        element: data.element, range: data.range, virtual: !!data.virtual
      };
    });
    Object.keys(snapshot.cardTable).forEach(function (id) {
      var data = snapshot.cardTable[id];
      if (data.virtual) cards[id].subcards = (data.subcardIds || []).map(function (subId) {
        if (!cards[subId]) throw new Error('Checkpoint references unknown subcard ' + subId);
        return cards[subId];
      });
    });
    return cards;
  }

  function resolveList(ids, cards, zone) {
    return (ids || []).map(function (id) {
      if (!cards[id]) throw new Error('Checkpoint ' + zone + ' references unknown card ' + id);
      return cards[id];
    });
  }

  Game.restore = function (snapshot, opts) {
    validateSnapshot(snapshot);
    opts = opts || {};
    var game = new Game({
      numPlayers: snapshot.numPlayers,
      seed: snapshot.seed,
      maxTurns: snapshot.maxTurns,
      throwErrors: opts.throwErrors,
      logCallback: opts.logCallback,
      uiHook: opts.uiHook,
      checkpointCallback: opts.checkpointCallback
    });
    var cards = restoreCards(snapshot);
    game.players = snapshot.players.map(function (data) {
      var player = new Player(game, {
        id: data.id, seat: data.seat, name: data.name, isHuman: data.isHuman
      });
      player.role = data.role;
      player.roleRevealed = data.roleRevealed;
      if (data.general) {
        var general = SGS.GENERALS[data.general];
        if (!general) throw new Error('Checkpoint references unknown general ' + data.general);
        game.applyGeneral(player, general);
      }
      player.name = data.name;
      player.seatName = data.seatName;
      player.nation = data.nation;
      player.gender = data.gender;
      player.hp = data.hp;
      player.maxHp = data.maxHp;
      player.alive = data.alive;
      player.chained = data.chained;
      player.faceUp = data.faceUp;
      player.phase = data.phase;
      player.hand = resolveList(data.hand, cards, 'hand');
      player.judgeZone = resolveList(data.judgeZone, cards, 'judgeZone');
      player.equips = {
        weapon: data.equips.weapon ? cards[data.equips.weapon] : null,
        armor: data.equips.armor ? cards[data.equips.armor] : null,
        offhorse: data.equips.offhorse ? cards[data.equips.offhorse] : null,
        defhorse: data.equips.defhorse ? cards[data.equips.defhorse] : null
      };
      player.flags = clone(data.flags, {});
      player.marks = clone(data.marks, {});
      player.history = clone(data.history, { shaCount: 0 });
      Object.keys(data.skip || {}).forEach(function (phase) {
        if (data.skip[phase]) player['skip_' + phase] = true;
      });
      player.agent = opts.agentFactory ? opts.agentFactory(player, data) : SGS.AIAgent;
      return player;
    });
    game.deck = resolveList(snapshot.deck, cards, 'deck');
    game.discard = resolveList(snapshot.discard, cards, 'discard');
    game.resolvingCards = resolveList(snapshot.resolvingCards, cards, 'resolvingCards');
    game.current = game.players.filter(function (player) { return player.id === snapshot.currentId; })[0] || null;
    game.phase = snapshot.phase;
    game.turnCount = snapshot.turnCount;
    game.eventSequence = snapshot.eventSequence || 0;
    game.started = snapshot.started;
    game.initialHandsDealt = snapshot.initialHandsDealt;
    game.finished = snapshot.finished;
    game.winners = snapshot.winners;
    game.execution = clone(snapshot.execution, {});
    game.align = clone(snapshot.align, {});
    game.log = clone(snapshot.log, []);
    game.rng.setState(snapshot.rngState);
    SGS.util.uid.setState(Math.max(SGS.util.uid.state(), snapshot.uidState || 0));
    return game;
  };

  SGS.CHECKPOINT_SCHEMA = SCHEMA;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
