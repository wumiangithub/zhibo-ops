const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const dotenv = require('dotenv');
const { DeployJobManager } = require('./job');

const envPath = path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

const PORT = Number(process.env.PORT || 3789);
const PUBLISH_USER = process.env.PUBLISH_USER || 'ops';
const PUBLISH_PASS = process.env.PUBLISH_PASS || 'ops123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-publish-dev-secret';
const SCRIPTS_DIR = path.resolve(
  __dirname,
  '..',
  process.env.SCRIPTS_DIR || '../../scripts/test'
);

const job = new DeployJobManager(SCRIPTS_DIR);
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    name: 'lp.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ ok: false, error: '\u672a\u767b\u5f55' });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    scriptsDir: SCRIPTS_DIR,
    scriptsExist: fs.existsSync(SCRIPTS_DIR),
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ ok: true, user: req.session.user });
  }
  return res.json({ ok: false, user: null });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === PUBLISH_USER && password === PUBLISH_PASS) {
    req.session.user = { username };
    return res.json({ ok: true, user: { username } });
  }
  return res.status(401).json({ ok: false, error: '\u8d26\u53f7\u6216\u5bc6\u7801\u9519\u8bef' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('lp.sid');
    res.json({ ok: true });
  });
});

app.get('/api/status', requireAuth, (_req, res) => {
  res.json({ ok: true, ...job.getState() });
});

app.post('/api/deploy', requireAuth, (req, res) => {
  try {
    const targets = (req.body && req.body.targets) || [];
    const state = job.start(targets);
    res.json({ ok: true, ...state });
  } catch (e) {
    const status = e.code === 'BUSY' ? 409 : 400;
    res.status(status).json({ ok: false, error: e.message, code: e.code || 'ERROR' });
  }
});

app.get('/api/logs/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const send = (event, data) => {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  // replay recent logs
  for (const entry of job.logs) {
    send('log', entry);
  }
  send('status', job.getState());

  const onLog = (entry) => send('log', entry);
  const onStatus = (state) => send('status', state);
  job.on('log', onLog);
  job.on('status', onStatus);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    job.off('log', onLog);
    job.off('status', onStatus);
  });
});

// Serve built frontend if present
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log('[local-publish] API http://localhost:' + PORT);
  console.log('[local-publish] SCRIPTS_DIR=' + SCRIPTS_DIR);
  console.log('[local-publish] exists=' + fs.existsSync(SCRIPTS_DIR));
});
