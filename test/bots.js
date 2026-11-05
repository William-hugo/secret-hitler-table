// Plays full games over real sockets: node test/bots.js [players] [games] [stopAtPhase]
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const N = Number(process.argv[2] || 7);
const GAMES = Number(process.argv[3] || 3);
const STOP = process.argv[4]; // optional: leave the game paused at this phase for screenshots
const names = ['Phu', 'Lydia', 'Hannah', 'Derrick', 'Sam', 'Grace', 'Eli', 'Noah', 'Ava', 'Ben'];

const tv = io(URL);
tv.emit('tv:create', process.env.ROOM || null, async ({ code }) => {
  console.log('room', code);
  const bots = [];
  for (let i = 0; i < N; i++) {
    const s = io(URL);
    await new Promise((r) => s.emit('join', { code, name: names[i] }, r));
    bots.push(s);
  }
  let played = 0, stopped = false; const toasts = {}; process.on('exit', () => console.log('toasts', toasts));
  bots.forEach((s, i) => {
    s.on('toast', (m) => { toasts[m] = (toasts[m] || 0) + 1; });
    let lastKey = null;
    s.on('state', ({ game, mine, me }) => {
      if (!game || stopped) return;
      if (STOP && game.phase === STOP) { if (!stopped) { stopped = true; console.log('paused at', STOP); } return; }
      const a = mine && mine.action; if (!a) return;
      const key = a.type + game.phase + (game.announce && game.announce.at) + (a.mine === null ? 'n' : 'v') + (a.done ? 'd' : '');
      if (key === lastKey) return; lastKey = key;
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      setTimeout(() => {
        if (a.type === 'ready' && !a.done) s.emit('ready');
        if (a.type === 'nominate') s.emit('nominate', pick(a.options).id);
        if (a.type === 'vote' && a.mine === null) s.emit('vote', Math.random() < 0.65);
        if (a.type === 'discard') s.emit('discard', Math.floor(Math.random() * 3));
        if (a.type === 'enact') { if (a.canVeto && Math.random() < 0.3) s.emit('veto'); else s.emit('enact', Math.floor(Math.random() * 2)); }
        if (a.type === 'vetoAnswer') s.emit('vetoAnswer', Math.random() < 0.5);
        if (a.type === 'peek') s.emit('power', null);
        if (a.type === 'power') s.emit('power', pick(a.options).id);
        if (a.type === 'investigation') s.emit('investigationDone');
      }, 5);
    });
  });
  tv.on('state', ({ game }) => {
    if (game && game.phase === 'gameover' && !game._seen) {
      game._seen = true;
      if (tv._last === game.announce.at) return; tv._last = game.announce.at;
      played++; console.log(`game ${played}: ${game.winner} — ${game.winReason} (L${game.liberal} F${game.fascist})`);
      if (played >= GAMES) { console.log('done'); process.exit(0); }
      setTimeout(() => bots[0].emit('host:start'), 20);
    }
  });
  if (!process.env.NOSTART) bots[0].emit('host:start');
});
setTimeout(() => { console.log('TIMEOUT'); process.exit(STOP ? 0 : 1); }, Number(process.env.MAXMS || 60000));
