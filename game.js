// Secret Hitler game engine — follows the official tabletop rules.
// Pure logic: no networking. The server calls actions and reads views.

const ROLE_TABLE = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
};

// Fascist track powers by slot (index 0 = 1st fascist policy), per official boards.
function boardFor(n) {
  if (n <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (n <= 8) return [null, 'investigate', 'special', 'execute', 'execute', null];
  return ['investigate', 'investigate', 'special', 'execute', 'execute', null];
}

const POWER_INFO = {
  investigate: { name: 'Investigate loyalty', desc: 'The President secretly sees one player\'s party membership.' },
  special: { name: 'Call special election', desc: 'The President picks the next Presidential Candidate.' },
  peek: { name: 'Policy peek', desc: 'The President secretly looks at the top three policies.' },
  execute: { name: 'Execution', desc: 'The President executes a player. If it\'s Hitler, Liberals win.' },
};

function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(players, opts = {}) {
    // players: [{id, name}] in seating order (clockwise)
    this.rng = opts.rng || Math.random;
    const n = players.length;
    if (!ROLE_TABLE[n]) throw new Error('Secret Hitler needs 5 to 10 players.');
    this.players = players.map((p) => ({ id: p.id, name: p.name, alive: true, role: null, party: null, investigated: false, notHitler: false }));
    const t = ROLE_TABLE[n];
    const roles = ['hitler', ...Array(t.fascists).fill('fascist'), ...Array(t.liberals).fill('liberal')];
    shuffle(roles, this.rng);
    this.players.forEach((p, i) => { p.role = roles[i]; p.party = roles[i] === 'liberal' ? 'liberal' : 'fascist'; });
    this.classic = !!opts.classic; // classic night phase: teams are learned with eyes closed, not on phones
    // which role-card illustration each player gets (liberal 1-6, fascist 1-3)
    const libArt = shuffle([1, 2, 3, 4, 5, 6], this.rng), fasArt = shuffle([1, 2, 3], this.rng);
    this.players.forEach((p) => { p.art = p.role === 'liberal' ? libArt.pop() : p.role === 'fascist' ? fasArt.pop() : 0; });

    this.board = boardFor(n);
    this.deck = shuffle([...Array(6).fill('L'), ...Array(11).fill('F')], this.rng);
    this.discard = [];
    this.liberal = 0;
    this.fascist = 0;
    this.tracker = 0;
    this.lastPresident = null; // ids of last ELECTED government (term limits)
    this.lastChancellor = null;
    this.rotationBase = Math.floor(this.rng() * n); // first president random
    this.president = null;
    this.nominee = null;
    this.chancellor = null;
    this.specialNext = null;
    this.votes = {};
    this.hand = []; // policies currently in a session
    this.vetoRefused = false;
    this.power = null;
    this.peekCards = null;
    this.investigation = null; // {targetId, party}
    this.winner = null;
    this.winReason = null;
    this.phase = 'roles'; // roles → nominate → vote → voteResult → president → chancellor → veto → enacted → power → powerResult → gameover
    this.ready = new Set();
    this.lastVote = null; // {votes, passed}
    this.lastEnacted = null; // {policy, byChaos}
    this.log = [];
    this.shuffles = 0;
    this.lastGov = null; // {president, chancellor} of the last government that enacted a policy
    this.announce = null; // {title, text, tone}
    this.president = this.players[this.rotationBase].id;
  }

  get n() { return this.players.length; }
  p(id) { return this.players.find((x) => x.id === id); }
  idx(id) { return this.players.findIndex((x) => x.id === id); }
  alive() { return this.players.filter((x) => x.alive); }
  name(id) { const x = this.p(id); return x ? x.name : '?'; }
  addLog(t) { this.log.push(t); if (this.log.length > 40) this.log.shift(); }

  // ---------- role reveal ----------
  markReady(id) {
    if (this.phase !== 'roles') return;
    this.ready.add(id);
    if (this.ready.size >= this.n) {
      this.phase = 'night';
      this.say('Night phase', 'Listen to the narrator. Close your eyes when you are told to.');
    }
  }

  endNight() {
    if (this.phase !== 'night') return 'The night phase is already over.';
    this.phase = 'nominate';
    this.addLog('The game begins.');
    this.say('Election', `${this.name(this.president)} is the Presidential Candidate. Pick a Chancellor.`);
  }

  // ---------- election ----------
  eligibleChancellors() {
    const aliveCount = this.alive().length;
    return this.alive()
      .filter((x) => x.id !== this.president)
      .filter((x) => x.id !== this.lastChancellor)
      .filter((x) => aliveCount <= 5 || x.id !== this.lastPresident)
      .map((x) => x.id);
  }

  nominate(by, target) {
    if (this.phase !== 'nominate' || by !== this.president) return 'Not your turn.';
    if (!this.eligibleChancellors().includes(target)) return 'That player is not eligible.';
    this.nominee = target;
    this.votes = {};
    this.phase = 'vote';
    this.say('Vote', `${this.name(this.president)} for President, ${this.name(target)} for Chancellor. Everyone vote on your phone.`);
  }

  vote(by, ja) {
    if (this.phase !== 'vote') return 'Voting is closed.';
    const pl = this.p(by);
    if (!pl || !pl.alive) return 'Dead players cannot vote.';
    this.votes[by] = !!ja;
    if (Object.keys(this.votes).length >= this.alive().length) this.resolveVote();
  }

  resolveVote() {
    const ja = Object.values(this.votes).filter(Boolean).length;
    const passed = ja > this.alive().length / 2;
    this.lastVote = { votes: { ...this.votes }, passed, ja, nein: this.alive().length - ja };
    this.phase = 'voteResult';
    if (passed) {
      this.chancellor = this.nominee;
      this.lastPresident = this.president;
      this.lastChancellor = this.chancellor;
      this.tracker = 0;
      this.addLog(`Elected: ${this.name(this.president)} (P) and ${this.name(this.chancellor)} (C), ${ja}–${this.lastVote.nein}.`);
      if (this.fascist >= 3) {
        if (this.p(this.chancellor).role === 'hitler') {
          return this.end('fascist', `Hitler was elected Chancellor.`);
        }
        this.p(this.chancellor).notHitler = true;
      }
      this.say('Government elected', `Ja ${ja} – Nein ${this.lastVote.nein}`, 'good');
    } else {
      this.addLog(`Rejected: ${this.name(this.president)} / ${this.name(this.nominee)}, ${ja}–${this.lastVote.nein}.`);
      this.say('Government rejected', `Ja ${ja} – Nein ${this.lastVote.nein}. The election tracker moves.`, 'bad');
    }
  }

  // called by server after showing the vote result
  afterVoteResult() {
    if (this.phase !== 'voteResult') return;
    if (this.lastVote.passed) {
      this.hand = this.draw(3);
      this.vetoRefused = false;
      this.phase = 'president';
      this.say('Legislative session', `President ${this.name(this.president)} is choosing a policy to discard. No talking.`);
    } else {
      this.failGovernment();
    }
  }

  failGovernment() {
    this.nominee = null;
    this.chancellor = null;
    this.tracker += 1;
    if (this.tracker >= 3) {
      // Chaos: top policy enacted, power ignored, term limits forgotten.
      this.reshuffleIfNeeded();
      const top = this.deck.shift();
      this.tracker = 0;
      this.lastPresident = null;
      this.lastChancellor = null;
      this.addLog(`Three failed governments — the country is in chaos. Top policy enacted.`);
      this.enact(top, true);
      return;
    }
    this.nextPresident();
  }

  nextPresident() {
    this.nominee = null;
    this.chancellor = null;
    this.hand = [];
    if (this.specialNext) {
      this.president = this.specialNext;
      this.specialNext = null;
    } else {
      let i = this.idx(this.rotationBase === null ? this.president : this.players[this.rotationBase].id);
      do { i = (i + 1) % this.n; } while (!this.players[i].alive);
      this.rotationBase = i;
      this.president = this.players[i].id;
    }
    this.phase = 'nominate';
    this.say('Election', `${this.name(this.president)} is the Presidential Candidate. Pick a Chancellor.`);
  }

  // ---------- legislative ----------
  draw(k) {
    this.reshuffleIfNeeded();
    return this.deck.splice(0, k);
  }

  reshuffleIfNeeded() {
    if (this.deck.length < 3) {
      this.deck = shuffle([...this.deck, ...this.discard], this.rng);
      this.discard = [];
      this.shuffles += 1;
      this.addLog('The deck was reshuffled with the discard pile.');
    }
  }

  presidentDiscard(by, i) {
    if (this.phase !== 'president' || by !== this.president) return 'Not your turn.';
    if (!(i >= 0 && i < 3)) return 'Pick a policy.';
    this.discard.push(this.hand.splice(i, 1)[0]);
    this.phase = 'chancellor';
    this.say('Legislative session', `Chancellor ${this.name(this.chancellor)} is choosing a policy to enact. No talking.`);
  }

  get vetoUnlocked() { return this.fascist >= 5; }

  chancellorEnact(by, i) {
    if (this.phase !== 'chancellor' || by !== this.chancellor) return 'Not your turn.';
    if (!(i >= 0 && i < 2)) return 'Pick a policy.';
    const chosen = this.hand.splice(i, 1)[0];
    this.lastGov = { president: this.president, chancellor: this.chancellor };
    this.discard.push(...this.hand);
    this.hand = [];
    this.enact(chosen, false);
  }

  proposeVeto(by) {
    if (this.phase !== 'chancellor' || by !== this.chancellor) return 'Not your turn.';
    if (!this.vetoUnlocked) return 'Veto is not unlocked yet.';
    if (this.vetoRefused) return 'The President already refused a veto.';
    this.phase = 'veto';
    this.say('Veto proposed', `Chancellor ${this.name(this.chancellor)} wants to veto this agenda. President, do you agree?`);
  }

  answerVeto(by, agree) {
    if (this.phase !== 'veto' || by !== this.president) return 'Not your turn.';
    if (agree) {
      this.discard.push(...this.hand);
      this.hand = [];
      this.addLog(`Veto: ${this.name(this.president)} and ${this.name(this.chancellor)} discarded both policies.`);
      this.say('Agenda vetoed', 'Both policies were discarded. The election tracker moves.', 'bad');
      this.failGovernment();
    } else {
      this.vetoRefused = true;
      this.phase = 'chancellor';
      this.say('Veto refused', `The President refused. Chancellor ${this.name(this.chancellor)} must enact a policy.`);
    }
  }

  enact(policy, byChaos) {
    this.tracker = 0;
    this.lastEnacted = { policy, byChaos };
    this.power = null;
    if (policy === 'L') {
      this.liberal += 1;
      this.addLog(`A Liberal policy was enacted${byChaos ? ' by chaos' : ''}.`);
    } else {
      this.fascist += 1;
      this.addLog(`A Fascist policy was enacted${byChaos ? ' by chaos' : ''}.`);
      if (!byChaos) this.power = this.board[this.fascist - 1];
    }
    if (this.liberal >= 5) return this.end('liberal', 'Five Liberal policies were enacted.');
    if (this.fascist >= 6) return this.end('fascist', 'Six Fascist policies were enacted.');
    this.reshuffleIfNeeded();
    this.phase = 'enacted';
    const label = policy === 'L' ? 'Liberal' : 'Fascist';
    this.say(`${label} policy enacted`, byChaos ? 'Chaos! The top policy of the deck was enacted. Its power is ignored, and term limits are reset.' : (this.power ? `President ${this.name(this.president)} gets a power: ${POWER_INFO[this.power].name}.` : ''), policy === 'L' ? 'liberal' : 'fascist');
  }

  afterEnacted() {
    if (this.phase !== 'enacted') return;
    if (this.power) {
      this.phase = 'power';
      if (this.power === 'peek') this.peekCards = this.deck.slice(0, 3);
      this.say(POWER_INFO[this.power].name, POWER_INFO[this.power].desc);
    } else {
      this.nextPresident();
    }
  }

  // ---------- executive powers ----------
  powerTargets() {
    const me = this.president;
    if (this.power === 'investigate') return this.alive().filter((x) => x.id !== me && !x.investigated).map((x) => x.id);
    if (this.power === 'special' || this.power === 'execute') return this.alive().filter((x) => x.id !== me).map((x) => x.id);
    return [];
  }

  usePower(by, target) {
    if (this.phase !== 'power' || by !== this.president) return 'Not your turn.';
    const pw = this.power;
    if (pw === 'peek') {
      this.addLog(`${this.name(by)} peeked at the top three policies.`);
      this.peekCards = null;
      this.power = null;
      return this.nextPresident();
    }
    if (!this.powerTargets().includes(target)) return 'Pick a valid player.';
    const t = this.p(target);
    if (pw === 'investigate') {
      t.investigated = true;
      this.investigation = { targetId: target, party: t.party };
      this.phase = 'powerResult';
      this.addLog(`${this.name(by)} investigated ${t.name}.`);
      this.say('Investigation', `${this.name(by)} is looking at ${t.name}'s party membership.`);
      return;
    }
    if (pw === 'special') {
      this.specialNext = target;
      this.addLog(`${this.name(by)} called a special election: ${t.name} is next.`);
      this.power = null;
      return this.nextPresident();
    }
    if (pw === 'execute') {
      t.alive = false;
      this.addLog(`${this.name(by)} executed ${t.name}.`);
      this.power = null;
      if (t.role === 'hitler') return this.end('liberal', `${t.name} was Hitler and has been executed.`);
      this.say('Execution', `${t.name} has been executed. Their role stays secret. They can't talk, vote, or run.`, 'bad');
      this.phase = 'executed';
    }
  }

  afterExecuted() { if (this.phase === 'executed') this.nextPresident(); }

  finishInvestigation(by) {
    if (this.phase !== 'powerResult' || by !== this.president) return 'Not your turn.';
    this.investigation = null;
    this.power = null;
    this.nextPresident();
  }

  end(winner, reason) {
    this.winner = winner;
    this.winReason = reason;
    this.phase = 'gameover';
    this.addLog(`Game over: ${winner === 'liberal' ? 'Liberals' : 'Fascists'} win. ${reason}`);
    this.say(winner === 'liberal' ? 'Liberals win' : 'Fascists win', reason, winner);
  }

  say(title, text, tone = '') { this.announce = { title, text, tone, at: Date.now() }; }

  // ---------- views ----------
  publicView() {
    const over = this.phase === 'gameover';
    return {
      phase: this.phase,
      players: this.players.map((x) => ({
        id: x.id, name: x.name, alive: x.alive, notHitler: x.notHitler,
        isPresident: x.id === this.president,
        isChancellor: x.id === this.chancellor,
        isNominee: x.id === this.nominee,
        termLimited: x.id === this.lastChancellor || (this.alive().length > 5 && x.id === this.lastPresident),
        voted: this.phase === 'vote' ? x.id in this.votes : undefined,
        ready: this.phase === 'roles' ? this.ready.has(x.id) : undefined,
        role: over ? x.role : undefined,
        art: over ? x.art : undefined,
      })),
      board: this.board,
      liberal: this.liberal,
      fascist: this.fascist,
      tracker: this.tracker,
      deck: this.deck.length,
      discard: this.discard.length,
      vetoUnlocked: this.vetoUnlocked,
      lastVote: this.phase === 'voteResult' ? this.lastVote : null,
      lastEnacted: this.phase === 'enacted' ? this.lastEnacted : null,
      power: this.power,
      powerInfo: this.power ? POWER_INFO[this.power] : null,
      winner: this.winner,
      winReason: this.winReason,
      announce: this.announce,
      log: this.log.slice(-8),
      shuffles: this.shuffles,
      recentVotes: this.phase === 'vote' || !this.lastVote ? null : this.lastVote.votes,
      lastGov: this.lastGov,
      playerCount: this.n,
      classic: this.classic,
      president: this.president,
      chancellor: this.chancellor,
      nominee: this.nominee,
    };
  }

  privateView(id) {
    const me = this.p(id);
    if (!me) return null;
    const n = this.n;
    let teammates = [];
    if (!this.classic && (me.role === 'fascist' || (me.role === 'hitler' && n <= 6))) {
      teammates = this.players.filter((x) => x.id !== id && x.party === 'fascist').map((x) => ({ name: x.name, role: x.role }));
    }
    const v = { id, role: me.role, party: me.party, art: me.art, alive: me.alive, teammates, hitlerKnowsTeam: n <= 6, classic: this.classic, action: null };
    if (!me.alive && this.phase !== 'gameover') { v.action = { type: 'dead' }; return v; }
    const P = this.phase;
    if (P === 'roles') v.action = { type: 'ready', done: this.ready.has(id) };
    else if (P === 'night') v.action = { type: 'night' };
    else if (P === 'nominate' && id === this.president) v.action = { type: 'nominate', options: this.eligibleChancellors().map((x) => ({ id: x, name: this.name(x) })) };
    else if (P === 'vote') v.action = { type: 'vote', president: this.name(this.president), nominee: this.name(this.nominee), mine: id in this.votes ? this.votes[id] : null };
    else if (P === 'president' && id === this.president) v.action = { type: 'discard', cards: [...this.hand] };
    else if (P === 'chancellor' && id === this.chancellor) v.action = { type: 'enact', cards: [...this.hand], canVeto: this.vetoUnlocked && !this.vetoRefused };
    else if (P === 'veto' && id === this.president) v.action = { type: 'vetoAnswer', cards: [...this.hand], chancellor: this.name(this.chancellor) };
    else if (P === 'power' && id === this.president) {
      if (this.power === 'peek') v.action = { type: 'peek', cards: [...this.peekCards] };
      else v.action = { type: 'power', power: this.power, info: POWER_INFO[this.power], options: this.powerTargets().map((x) => ({ id: x, name: this.name(x) })) };
    } else if (P === 'powerResult' && id === this.president && this.investigation) {
      v.action = { type: 'investigation', name: this.name(this.investigation.targetId), party: this.investigation.party };
    } else if (P === 'gameover') v.action = { type: 'gameover', winner: this.winner, reason: this.winReason };
    return v;
  }
}

module.exports = { Game, boardFor, ROLE_TABLE, POWER_INFO };
