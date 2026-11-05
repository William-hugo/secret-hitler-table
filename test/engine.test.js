// Rule tests + thousands of random full games against the engine.
const assert = require('assert');
const { Game } = require('../game');

const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
function readyAll(g) { g.players.forEach((p) => g.markReady(p.id)); }
function voteAll(g, ja) { g.alive().forEach((p) => g.vote(p.id, ja)); }

// role distribution + knowledge
for (const n of [5, 6, 7, 8, 9, 10]) {
  const g = new Game(mk(n));
  const c = (r) => g.players.filter((p) => p.role === r).length;
  assert.strictEqual(c('hitler'), 1);
  assert.strictEqual(c('fascist'), { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 }[n]);
  const h = g.players.find((p) => p.role === 'hitler');
  assert.strictEqual(g.privateView(h.id).teammates.length, n <= 6 ? c('fascist') : 0);
  const f = g.players.find((p) => p.role === 'fascist');
  assert.strictEqual(g.privateView(f.id).teammates.length, c('fascist')); // other fascists + hitler
  const l = g.players.find((p) => p.role === 'liberal');
  assert.strictEqual(g.privateView(l.id).teammates.length, 0);
  assert.strictEqual(g.deck.length, 17);
}

// failed elections → chaos, term limits reset, presidency rotates
{
  const g = new Game(mk(7)); readyAll(g);
  const order = [];
  for (let k = 0; k < 3; k++) {
    order.push(g.president);
    g.nominate(g.president, g.eligibleChancellors()[0]);
    voteAll(g, false);
    assert.strictEqual(g.phase, 'voteResult');
    g.afterVoteResult();
  }
  assert.strictEqual(g.phase, 'enacted');
  assert.ok(g.lastEnacted.byChaos);
  assert.strictEqual(g.tracker, 0);
  assert.strictEqual(g.power, null, 'chaos ignores powers');
  assert.strictEqual(g.liberal + g.fascist, 1);
  // presidents were consecutive seats
  const idx = order.map((id) => g.idx(id));
  assert.strictEqual((idx[0] + 1) % 7, idx[1]); assert.strictEqual((idx[1] + 1) % 7, idx[2]);
  g.afterEnacted();
  assert.strictEqual(g.idx(g.president), (idx[2] + 1) % 7);
}

// tie fails
{
  const g = new Game(mk(6)); readyAll(g);
  g.nominate(g.president, g.eligibleChancellors()[0]);
  g.alive().forEach((p, i) => g.vote(p.id, i % 2 === 0));
  assert.strictEqual(g.lastVote.passed, false);
}

// term limits: last pres+chanc ineligible (7p); only chanc when 5 alive
{
  const g = new Game(mk(7)); readyAll(g);
  const P = g.president; const C = g.eligibleChancellors()[0];
  g.nominate(P, C); voteAll(g, true); g.afterVoteResult();
  g.presidentDiscard(P, 0); g.chancellorEnact(C, 0);
  if (g.phase === 'enacted') g.afterEnacted();
  if (g.phase === 'power') { /* skip */ } else {
    const el = g.eligibleChancellors();
    assert.ok(!el.includes(C) && !el.includes(P));
  }
}
{
  const g = new Game(mk(5)); readyAll(g);
  const P = g.president; const C = g.eligibleChancellors()[0];
  g.nominate(P, C); voteAll(g, true); g.afterVoteResult();
  g.presidentDiscard(P, 0); g.chancellorEnact(C, 0); g.afterEnacted();
  if (g.phase === 'nominate') {
    const el = g.eligibleChancellors();
    assert.ok(!el.includes(C)); assert.ok(el.includes(P) || g.president === P === false);
  }
}

// hitler elected after 3 fascist → fascists win; non-hitler gets confirmed
{
  const g = new Game(mk(7)); readyAll(g);
  g.fascist = 3;
  const hitler = g.players.find((p) => p.role === 'hitler').id;
  if (g.president === hitler) g.president = g.players.find((p) => p.id !== hitler).id;
  g.nominate(g.president, hitler); voteAll(g, true);
  assert.strictEqual(g.winner, 'fascist');
  const g2 = new Game(mk(7)); readyAll(g2); g2.fascist = 3;
  const lib = g2.eligibleChancellors().find((id) => g2.p(id).role !== 'hitler');
  g2.nominate(g2.president, lib); voteAll(g2, true);
  assert.ok(g2.p(lib).notHitler); assert.strictEqual(g2.winner, null);
}

// veto
{
  const g = new Game(mk(5)); readyAll(g); g.fascist = 5;
  const P = g.president, C = g.eligibleChancellors().find((id) => g.p(id).role !== 'hitler');
  g.nominate(P, C); voteAll(g, true); g.afterVoteResult(); g.presidentDiscard(P, 0);
  g.proposeVeto(C); assert.strictEqual(g.phase, 'veto');
  g.answerVeto(P, false); assert.strictEqual(g.phase, 'chancellor');
  assert.ok(typeof g.proposeVeto(C) === 'string', 'cannot veto twice');
  const g2 = new Game(mk(5)); readyAll(g2); g2.fascist = 5;
  const P2 = g2.president, C2 = g2.eligibleChancellors().find((id) => g2.p(id).role !== 'hitler');
  g2.nominate(P2, C2); voteAll(g2, true); g2.afterVoteResult(); g2.presidentDiscard(P2, 0);
  g2.proposeVeto(C2); g2.answerVeto(P2, true);
  assert.strictEqual(g2.tracker, 1); assert.strictEqual(g2.phase, 'nominate'); assert.notStrictEqual(g2.president, P2);
}

// special election returns to the left of the caller
{
  const g = new Game(mk(8)); readyAll(g);
  g.fascist = 1; // next fascist = slot 2 = special for 7-8
  const caller = g.president; const ci = g.idx(caller);
  g.power = 'special'; g.phase = 'power'; g.rotationBase = ci;
  const target = g.players[(ci + 4) % 8].id;
  g.usePower(caller, target);
  assert.strictEqual(g.president, target);
  g.nominate(target, g.eligibleChancellors()[0]); voteAll(g, false); g.afterVoteResult();
  assert.strictEqual(g.idx(g.president), (ci + 1) % 8);
}

// execution of hitler → liberal win; investigate can't repeat
{
  const g = new Game(mk(9)); readyAll(g);
  const pres = g.president; g.power = 'execute'; g.phase = 'power';
  const h = g.players.find((p) => p.role === 'hitler' && p.id !== pres);
  if (h) { g.usePower(pres, h.id); assert.strictEqual(g.winner, 'liberal'); }
  const g2 = new Game(mk(9)); readyAll(g2);
  g2.power = 'investigate'; g2.phase = 'power';
  const t = g2.powerTargets()[0]; g2.usePower(g2.president, t);
  assert.ok(['liberal', 'fascist'].includes(g2.privateView(g2.president).action.party));
  g2.finishInvestigation(g2.players[g2.rotationBase].id === g2.president ? g2.president : g2.president);
}

// random full games: invariants
let wins = { liberal: 0, fascist: 0 }, steps = 0;
for (let k = 0; k < 4000; k++) {
  const n = 5 + (k % 6);
  const g = new Game(mk(n)); readyAll(g);
  let guard = 0;
  while (g.phase !== 'gameover' && guard++ < 2000) {
    steps++;
    const total = g.deck.length + g.discard.length + g.hand.length + g.liberal + g.fascist;
    assert.strictEqual(total, 17, 'policy count conserved ' + g.phase);
    const r = Math.random();
    switch (g.phase) {
      case 'nominate': { const el = g.eligibleChancellors(); assert.ok(el.length > 0); g.nominate(g.president, el[Math.floor(r * el.length)]); break; }
      case 'vote': g.alive().forEach((p) => g.vote(p.id, Math.random() < 0.6)); break;
      case 'voteResult': g.afterVoteResult(); break;
      case 'president': assert.strictEqual(g.hand.length, 3); g.presidentDiscard(g.president, Math.floor(r * 3)); break;
      case 'chancellor': if (g.vetoUnlocked && !g.vetoRefused && r < 0.3) g.proposeVeto(g.chancellor); else g.chancellorEnact(g.chancellor, Math.floor(r * 2)); break;
      case 'veto': g.answerVeto(g.president, r < 0.5); break;
      case 'enacted': g.afterEnacted(); break;
      case 'executed': g.afterExecuted(); break;
      case 'power': { if (g.power === 'peek') { assert.strictEqual(g.privateView(g.president).action.cards.length, 3); g.usePower(g.president, null); } else { const t = g.powerTargets(); g.usePower(g.president, t[Math.floor(r * t.length)]); } break; }
      case 'powerResult': g.finishInvestigation(g.president); break;
      default: throw new Error('stuck in ' + g.phase);
    }
    assert.ok(g.p(g.president).alive, 'president must be alive');
  }
  assert.strictEqual(g.phase, 'gameover', 'game finished');
  wins[g.winner]++;
}
console.log('All rule tests passed. Random games:', wins, 'steps', steps);
