// Secret Hitler — TV + phones server
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
// Artwork: put your own images in public/art/custom/ (liberal, fascist, hitler,
// liberal-policy, fascist-policy — .png/.jpg/.webp/.svg) and they replace the defaults.
const fs = require('fs');
const ART_FALLBACK = { 'liberal-policy': 'liberal', 'fascist-policy': 'fascist' };
app.get('/role-art/:name', (req, res) => {
  const name = String(req.params.name).replace(/[^a-z-]/g, '');
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
    const f = path.join(__dirname, 'public', 'art', 'custom', `${name}.${ext}`);
    if (fs.existsSync(f)) return res.sendFile(f);
  }
  const def = path.join(__dirname, 'public', 'art', `${ART_FALLBACK[name] || name}.svg`);
  if (fs.existsSync(def)) return res.sendFile(def);
  res.status(404).end();
});
// Sounds: put audio files in public/sounds/custom/ named after events (see README).
app.get('/sounds/list', (req, res) => {
  const dir = path.join(__dirname, 'public', 'sounds', 'custom');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f)); } catch (e) {}
  res.json(files);
});
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254')) return a.address;
    }
  }
  return 'localhost';
}
const LAN_BASE = `http://${lanAddress()}:${PORT}`;
let PUBLIC_BASE = process.env.PUBLIC_URL || null; // set by --online (Cloudflare tunnel) or PUBLIC_URL

// The join link shown on the TV: whatever address the TV itself used,
// except localhost (phones can't reach that), which becomes the LAN address.
function baseFor(socket) {
  if (PUBLIC_BASE) return PUBLIC_BASE;
  const h = socket.handshake.headers;
  const host = String(h['x-forwarded-host'] || h.host || '');
  if (!host || /^(localhost|127\.|\[::1\])/.test(host)) return LAN_BASE;
  const proto = String(h['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${host}`;
}

// timings (ms) for automatic screens on the TV
const T = {
  voteResult: Number(process.env.T_VOTE || 9000),
  enacted: Number(process.env.T_ENACT || 7500),
  executed: Number(process.env.T_EXEC || 7000),
  night: Number(process.env.T_NIGHT || 240000), // safety: night phase ends on its own if the TV never reports back
};

const rooms = new Map(); // code -> room

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(''); } while (rooms.has(c));
  return c;
}

function createRoom(base) {
  if (rooms.size >= 500) for (const [c, r] of rooms) if (r.players.every((p) => p.sockets.size === 0)) { rooms.delete(c); break; }
  const code = makeCode();
  const room = { code, base, players: [], hostId: null, options: { classic: false }, game: null, timer: null, created: Date.now() };
  rooms.set(code, room);
  return room;
}

function lobbyView(room) {
  return {
    code: room.code,
    joinUrl: `${room.base}/play?room=${room.code}`,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, connected: p.bot || p.sockets.size > 0 })),
    inGame: !!room.game,
    options: room.options,
  };
}

function broadcast(room) {
  const lobby = lobbyView(room);
  const pub = room.game ? room.game.publicView() : null;
  io.to(`tv:${room.code}`).emit('state', { lobby, game: pub });
  for (const p of room.players) {
    const mine = room.game ? room.game.privateView(p.id) : null;
    for (const sid of p.sockets) io.to(sid).emit('state', { lobby, game: pub, me: { id: p.id, name: p.name, isHost: p.id === room.hostId }, mine });
  }
  schedule(room);
  driveBots(room);
}

// ---- host actions (shared by the host's phone and the TV) ----
function pickNewHost(room) {
  const humans = room.players.filter((p) => !p.bot);
  const next = humans.find((p) => p.sockets.size > 0) || humans[0];
  room.hostId = next ? next.id : null;
}
const HOST_OPS = {
  start(room) {
    if (room.game && room.game.phase !== 'gameover') return 'A game is already running.';
    if (room.players.length < 5) return 'You need at least 5 players.';
    room.game = new Game(room.players.map((p) => ({ id: p.id, name: p.name })), { classic: room.options.classic });
  },
  move(room, id, dir) {
    if (room.game) return;
    const i = room.players.findIndex((p) => p.id === id);
    const j = i + Number(dir);
    if (i < 0 || j < 0 || j >= room.players.length) return;
    [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
  },
  addBot(room) {
    if (room.game) return;
    if (room.players.length >= 10) return 'The room is full (10 players).';
    const used = new Set(room.players.map((p) => p.name));
    const name = BOT_NAMES.map((n) => n + ' (bot)').find((n) => !used.has(n));
    room.players.push({ id: crypto.randomUUID().slice(0, 8), token: null, name, bot: true, sockets: new Set() });
  },
  removeBots(room) { if (!room.game) room.players = room.players.filter((p) => !p.bot); },
  option(room, key, val) { if (!room.game && key === 'classic') room.options.classic = !!val; },
  skipNight(room) { return room.game && room.game.endNight(); },
  kick(room, id) {
    if (room.game) return 'You can only remove players in the lobby.';
    room.players = room.players.filter((p) => p.id !== id);
    if (room.hostId === id) pickNewHost(room);
  },
  makeHost(room, id) {
    const p = room.players.find((x) => x.id === id);
    if (!p || p.bot) return 'Bots can\'t be the host.';
    room.hostId = id;
  },
  lobby(room) {
    if (room.game && room.game.phase !== 'gameover') return 'Finish the game first.';
    room.game = null;
  },
  abort(room) { clearTimeout(room.timer); room.game = null; },
};

// ---- practice bots: random players so you can try the game with fewer people ----
const BOT_NAMES = ['Ada', 'Max', 'Rosa', 'Otto', 'Clara', 'Felix', 'Greta', 'Hans', 'Ida'];
function driveBots(room) {
  const g = room.game;
  if (!g) return;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (const p of room.players) {
    if (!p.bot) continue;
    const v = g.privateView(p.id);
    const a = v && v.action;
    if (!a) continue;
    const key = a.type + ':' + g.phase + ':' + (g.announce && g.announce.at);
    if (p.botKey === key) continue;
    if (a.type === 'vote' && a.mine !== null) continue;
    if (a.type === 'ready' && a.done) continue;
    if (['dead', 'gameover'].includes(a.type)) continue;
    p.botKey = key;
    const delay = a.type === 'ready' ? 600 : ['power', 'peek', 'investigation'].includes(a.type) ? 6000 + Math.random() * 3000 : 1200 + Math.random() * 1800;
    setTimeout(() => {
      if (room.game !== g) return;
      let r;
      if (a.type === 'ready') r = g.markReady(p.id);
      if (a.type === 'nominate') r = g.nominate(p.id, pick(a.options).id);
      if (a.type === 'vote') r = g.vote(p.id, Math.random() < 0.65);
      if (a.type === 'discard') r = g.presidentDiscard(p.id, Math.floor(Math.random() * 3));
      if (a.type === 'enact') r = a.canVeto && Math.random() < 0.25 ? g.proposeVeto(p.id) : g.chancellorEnact(p.id, Math.floor(Math.random() * 2));
      if (a.type === 'vetoAnswer') r = g.answerVeto(p.id, Math.random() < 0.5);
      if (a.type === 'peek') r = g.usePower(p.id, null);
      if (a.type === 'power') r = g.usePower(p.id, pick(a.options).id);
      if (a.type === 'investigation') r = g.finishInvestigation(p.id);
      broadcast(room);
    }, delay);
  }
}

// automatic transitions after reveal screens
function schedule(room) {
  const g = room.game;
  if (!g) return;
  const key = `${g.phase}:${g.announce && g.announce.at}`;
  if (room.timerKey === key) return;
  clearTimeout(room.timer);
  room.timerKey = key;
  const step = { voteResult: ['afterVoteResult', T.voteResult], enacted: ['afterEnacted', T.enacted], executed: ['afterExecuted', T.executed], night: ['endNight', T.night] }[g.phase];
  if (step) {
    room.timer = setTimeout(() => {
      if (room.game !== g) return;
      g[step[0]]();
      broadcast(room);
    }, step[1]);
  }
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;
  const err = (m) => socket.emit('toast', m);

  socket.on('tv:create', async (wanted, cb) => {
    const base = baseFor(socket);
    room = (wanted && rooms.get(String(wanted).toUpperCase())) || createRoom(base);
    room.base = base;
    socket.join(`tv:${room.code}`);
    const joinUrl = `${base}/play?room=${room.code}`;
    const qr = await QRCode.toDataURL(joinUrl, { margin: 1, width: 360 });
    cb && cb({ code: room.code, qr, joinUrl, base });
    broadcast(room);
  });

  socket.on('join', ({ code, name, token }, cb) => {
    const r = rooms.get(String(code || '').toUpperCase().trim());
    if (!r) return cb({ error: 'No game with that room code.' });
    let p = token && r.players.find((x) => x.token === token);
    if (!p) {
      name = String(name || '').trim().slice(0, 14);
      if (!name) return cb({ error: 'Enter your name.' });
      if (r.game) return cb({ error: 'That game already started.' });
      if (r.players.length >= 10) return cb({ error: 'The room is full (10 players).' });
      if (r.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) return cb({ error: 'Someone already has that name.' });
      p = { id: crypto.randomUUID().slice(0, 8), token: crypto.randomUUID(), name, sockets: new Set() };
      r.players.push(p);
      if (!r.hostId) r.hostId = p.id;
    }
    room = r; player = p;
    p.sockets.add(socket.id);
    socket.join(`room:${r.code}`);
    cb({ ok: true, token: p.token, code: r.code });
    broadcast(r);
  });

  const guard = (fn) => (...args) => {
    if (!room || !player) return err('You are not in a game.');
    const res = fn(...args);
    if (typeof res === 'string') err(res);
    broadcast(room);
  };
  const isHost = () => room && player && room.hostId === player.id;

  socket.on('tv:nightDone', () => {
    if (room && room.game && room.game.phase === 'night' && socket.rooms.has(`tv:${room.code}`)) { room.game.endNight(); broadcast(room); }
  });
  // Host actions can come from the host's phone or from the TV screen itself.
  for (const name of Object.keys(HOST_OPS)) {
    socket.on('host:' + name, guard((...args) => (isHost() ? HOST_OPS[name](room, ...args) : 'Only the host can do that.')));
  }
  socket.on('tv:host', (name, ...args) => {
    if (!room || !socket.rooms.has(`tv:${room.code}`) || !HOST_OPS[name]) return;
    const res = HOST_OPS[name](room, ...args);
    if (typeof res === 'string') socket.emit('toast', res);
    broadcast(room);
  });
  socket.on('leave', guard(() => {
    if (room.game) return 'You can\'t leave during a game.';
    room.players = room.players.filter((p) => p.id !== player.id);
    if (room.hostId === player.id) pickNewHost(room);
    player = null;
  }));

  const g = () => room && room.game;
  socket.on('ready', guard(() => g() && g().markReady(player.id)));
  socket.on('nominate', guard((t) => g() && g().nominate(player.id, t)));
  socket.on('vote', guard((ja) => g() && g().vote(player.id, ja)));
  socket.on('discard', guard((i) => g() && g().presidentDiscard(player.id, i)));
  socket.on('enact', guard((i) => g() && g().chancellorEnact(player.id, i)));
  socket.on('veto', guard(() => g() && g().proposeVeto(player.id)));
  socket.on('vetoAnswer', guard((a) => g() && g().answerVeto(player.id, a)));
  socket.on('power', guard((t) => g() && g().usePower(player.id, t)));
  socket.on('investigationDone', guard(() => g() && g().finishInvestigation(player.id)));

  socket.on('disconnect', () => {
    if (player) {
      player.sockets.delete(socket.id);
      // If the host's phone stays offline for 20 seconds, hand hosting to someone who is here.
      const p = player, r = room;
      setTimeout(() => { if (r.hostId === p.id && p.sockets.size === 0) { pickNewHost(r); broadcast(r); } }, 20000);
    }
    if (room) broadcast(room);
  });
});

// clean up rooms idle for 12 hours
setInterval(() => {
  for (const [code, r] of rooms) if (Date.now() - r.created > 12 * 3600e3 && r.players.every((p) => p.sockets.size === 0)) rooms.delete(code);
}, 3600e3);

function startTunnel() {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const local = path.join(__dirname, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  const bin = fs.existsSync(local) ? local : 'cloudflared';
  console.log('  Opening an online link through Cloudflare (takes ~10 seconds)...');
  const cf = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
  const onData = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !PUBLIC_BASE) {
      PUBLIC_BASE = m[0];
      console.log('\n  ===============  ONLINE  ===============');
      console.log(`  On the TV, open:   ${PUBLIC_BASE}/tv`);
      console.log('  Players can join from any network (Wi-Fi or mobile data).');
      console.log('  This link changes every time you start. Keep this window open.');
      console.log('  =======================================\n');
    }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);
  cf.on('error', () => console.log('  Could not start cloudflared. Use start-online.bat, which downloads it for you.'));
  cf.on('exit', (c) => { if (!PUBLIC_BASE) console.log('  The online link failed to start (code ' + c + '). Check your internet and try again.'); });
  process.on('exit', () => cf.kill());
  process.on('SIGINT', () => { cf.kill(); process.exit(0); });
}

server.listen(PORT, () => {
  console.log('\n  Secret Hitler table is running!\n');
  if (process.argv.includes('--online')) return startTunnel();
  if (PUBLIC_BASE || process.env.RENDER) { console.log('  Hosted online. Open /tv on the TV.\n'); return; }
  console.log(`  1. On the TV, open:     ${LAN_BASE}/tv`);
  console.log(`  2. Players scan the QR code on the TV (or go to ${LAN_BASE}/play)\n`);
  console.log('  Phones must be on the same Wi-Fi as this computer.');
  console.log('  For players on other networks, use start-online.bat instead.');
  console.log('  Press Ctrl+C to stop.\n');
});

module.exports = { server };
