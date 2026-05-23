const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = 3000;
const TARGET_DIR = '/home/fredo';
const SELF_PATH = __filename;

app.use(express.json());

// ── AUTHENTIFICATION SESSION UNIQUE AVEC COOKIE SÉCURISÉ ────────────────
const crypto = require('crypto');

const AUTH_USER = process.env.DASHBOARD_USER || 'admin';
const AUTH_PASS = process.env.DASHBOARD_PASS || '1981'; // <--- MODIFIEZ CE MOT DE PASSE ICI

const activeSessions = new Set();

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

function checkAuth(req, res, next) {
  // Routes publiques
  if (req.path === '/api/login') {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.session;

  if (sessionToken && activeSessions.has(sessionToken)) {
    return next();
  }

  // Si requête API non authentifiée -> 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }

  // Si page principale non authentifiée -> Servir l'interface de connexion sleek
  if (req.path === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getLoginHTML());
  }

  res.status(401).send('Authentification requise.');
}

// Appliquer la sécurité sur l'ensemble des requêtes
app.use(checkAuth);

// ── API CONNEXION / DÉCONNEXION ────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && password === AUTH_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800`); // 7 jours
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Identifiants incorrects' });
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.session;
  if (sessionToken) {
    activeSessions.delete(sessionToken);
  }
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  res.json({ success: true });
});

// ── VUE CONNEXION SLEEK ─────────────────────────────────────────
function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion — PanelStats</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root {
  --bg-1:       #dde4f0;
  --bg-2:       #c8d3e8;
  --glass:          rgba(255,255,255,0.55);
  --glass-border:   rgba(255,255,255,0.75);
  --glass-hover:    rgba(255,255,255,0.70);
  --glass-shadow:   0 8px 32px rgba(100,120,180,0.18), 0 1px 2px rgba(100,120,180,0.10);
  --blur:           saturate(180%) blur(20px);
  --text:       #1a1f35;
  --text-2:     #3a4060;
  --muted:      #7a86a8;
  --blue:       #0a84ff;
  --indigo:     #5e5ce6;
  --red:        #ff3b30;
  --font:       'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --r:          16px;
}

[data-theme="dark"] {
  --bg-1:       #0d1117;
  --bg-2:       #161b2a;
  --glass:          rgba(30,36,58,0.70);
  --glass-border:   rgba(255,255,255,0.10);
  --glass-hover:    rgba(255,255,255,0.08);
  --glass-shadow:   0 8px 32px rgba(0,0,0,0.50), 0 1px 2px rgba(0,0,0,0.30);
  --text:       #f0f2ff;
  --text-2:     #a8b4d8;
  --muted:      #5a6488;
  --blue:       #0a84ff;
  --indigo:     #7877c6;
  --red:        #ff453a;
}

body {
  font-family: var(--font);
  font-size: 13px;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-1);
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(10,132,255,0.15) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(191,90,242,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 60% 85%, rgba(52,199,89,0.10) 0%, transparent 50%);
  background-attachment: fixed;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

.login-card {
  width: 360px;
  background: var(--glass);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--r);
  padding: 30px;
  box-shadow: var(--glass-shadow);
  display: flex;
  flex-direction: column;
  gap: 20px;
  z-index: 2;
}

.login-header {
  text-align: center;
}

.login-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--indigo));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(10,132,255,0.35);
  margin: 0 auto 12px;
}

.login-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.login-subtitle {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-wrapper {
  position: relative;
}

.input-wrapper i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 13px;
}

.input-field {
  width: 100%;
  padding: 10px 12px 10px 36px;
  border-radius: 9px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.15);
  color: var(--text);
  font-family: var(--font);
  font-size: 12.5px;
  outline: none;
  transition: all 0.2s;
}

.input-field:focus {
  border-color: var(--blue);
  background: rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.15);
}

.btn-login {
  background: linear-gradient(135deg, var(--blue), var(--indigo));
  color: #fff;
  border: none;
  border-radius: 9px;
  padding: 11px;
  font-family: var(--font);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(10,132,255,0.25);
  margin-top: 5px;
}

.btn-login:hover {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(10,132,255,0.35);
}

.btn-login:active {
  transform: translateY(0);
}

.error-msg {
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.2);
  color: var(--red);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  display: none;
  align-items: center;
  gap: 8px;
  animation: shake 0.3s;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.theme-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  background: var(--glass);
  color: var(--text-2);
  font-family: var(--font);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(8px);
  z-index: 10;
}
</style>
</head>
<body>

<button class="theme-btn" id="theme-toggle" onclick="toggleTheme()">
  <i class="fas fa-moon" id="theme-icon"></i>
  <span id="theme-label">Sombre</span>
</button>

<div class="login-card">
  <div class="login-header">
    <div class="login-logo"><i class="fas fa-display"></i></div>
    <h1 class="login-title">PanelStats</h1>
    <p class="login-subtitle">Connectez-vous pour accéder au tableau de bord</p>
  </div>

  <div class="error-msg" id="error-msg">
    <i class="fas fa-circle-exclamation"></i>
    <span id="error-text">Identifiants incorrects</span>
  </div>

  <form onsubmit="handleLogin(event)" style="display:flex; flex-direction:column; gap:14px;">
    <div class="input-group">
      <label class="input-label" for="username">Utilisateur</label>
      <div class="input-wrapper">
        <i class="fas fa-user"></i>
        <input class="input-field" type="text" id="username" required placeholder="admin" autocomplete="username">
      </div>
    </div>

    <div class="input-group">
      <label class="input-label" for="password">Mot de passe</label>
      <div class="input-wrapper">
        <i class="fas fa-lock"></i>
        <input class="input-field" type="password" id="password" required placeholder="••••••••" autocomplete="current-password">
      </div>
    </div>

    <button type="submit" class="btn-login" id="btn-login">
      <span>Se connecter</span>
      <i class="fas fa-arrow-right"></i>
    </button>
  </form>
</div>

<script>
var currentTheme = localStorage.getItem('dashboard-theme') || 'light';

function applyTheme(theme) {
  currentTheme = theme;
  var icon  = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme','dark');
    if (icon)  icon.className   = 'fas fa-sun';
    if (label) label.textContent = 'Clair';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (icon)  icon.className   = 'fas fa-moon';
    if (label) label.textContent = 'Sombre';
  }
  localStorage.setItem('dashboard-theme', theme);
}

// Liaison immédiate
function toggleTheme() { applyTheme(currentTheme === 'dark' ? 'light' : 'dark'); }
applyTheme(currentTheme);

async function handleLogin(e) {
  e.preventDefault();
  var u = document.getElementById('username').value;
  var p = document.getElementById('password').value;
  var errBox = document.getElementById('error-msg');
  var errTxt = document.getElementById('error-text');
  var btn = document.getElementById('btn-login');

  errBox.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span>Connexion...</span> <i class="fas fa-spinner spin"></i>';

  try {
    var response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    
    if (response.ok) {
      location.reload();
    } else {
      var data = await response.json();
      errTxt.textContent = data.error || 'Erreur de connexion';
      errBox.style.display = 'flex';
      btn.disabled = false;
      btn.innerHTML = '<span>Se connecter</span> <i class="fas fa-arrow-right"></i>';
    }
  } catch (err) {
    errTxt.textContent = 'Serveur injoignable';
    errBox.style.display = 'flex';
    btn.disabled = false;
    btn.innerHTML = '<span>Se connecter</span> <i class="fas fa-arrow-right"></i>';
  }
}
</script>
</body>
</html>`;
}


// ─── UTILITAIRES ───────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 o';
  const k = 1024, sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getDirectorySize(dirPath) {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) size += await getDirectorySize(fullPath);
      else { const stat = await fs.stat(fullPath); size += stat.size; }
    }
  } catch (e) {}
  return size;
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout) => err ? reject(err) : resolve(stdout.trim()));
  });
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600),
  m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  if (d > 0) return d + 'j ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  return m + 'm ' + s + 's';
}

// ─── API FICHIERS ──────────────────────────────────────────────
app.get('/api/files', async (req, res) => {
  try {
    const items = await fs.readdir(TARGET_DIR, { withFileTypes: true });
    const categories = { dossiers: [], fichiers: [], caches: [] };
    for (const item of items) {
      const fullPath = path.join(TARGET_DIR, item.name);
      let size = item.isDirectory() ? await getDirectorySize(fullPath) : (await fs.stat(fullPath)).size;
      const data = { name: item.name, sizeFormatted: formatSize(size), sizeRaw: size,
        icon: item.isDirectory() ? 'fa-folder' : 'fa-file' };
        if (item.name.startsWith('.')) categories.caches.push(data);
        else if (item.isDirectory()) categories.dossiers.push(data);
        else categories.fichiers.push(data);
    }
    res.json(categories);
  } catch (e) { res.status(500).json({ error: 'Erreur lecture repertoire' }); }
});

// ─── API TIMESHIFT ────────────────────────────────────────────
app.get('/api/timeshift', async (req, res) => {
  const TIMESHIFT_DIR = '/timeshift';
  try {
    let dirSize = 0;
    try {
      const du = await execPromise('du -sb ' + TIMESHIFT_DIR + ' 2>/dev/null | cut -f1');
      dirSize = parseInt(du) || 0;
    } catch (_) {
      dirSize = await getDirectorySize(TIMESHIFT_DIR);
    }

    let fsTotal = 0, fsUsed = 0, fsFree = 0, fsPercent = 0, fsMount = '', fsDevice = '';
    try {
      const df = await execPromise("df -B1 " + TIMESHIFT_DIR + " | awk 'NR==2{print $1, $2, $3, $4, $5, $6}'");
      const p = df.split(' ');
      fsDevice  = p[0] || '';
      fsTotal   = parseInt(p[1]) || 0;
      fsUsed    = parseInt(p[2]) || 0;
      fsFree    = parseInt(p[3]) || 0;
      fsPercent = parseInt(p[4]) || 0;
      fsMount   = p[5] || '';
    } catch (_) {}

    let snapshotCount = 0;
    try {
      const ls = await execPromise('ls ' + TIMESHIFT_DIR + '/snapshots 2>/dev/null | wc -l');
      snapshotCount = parseInt(ls) || 0;
    } catch (_) {}

    res.json({
      dirPath: TIMESHIFT_DIR,
      dirSize,
      dirSizeFormatted: formatSize(dirSize),
      filesystem: { device: fsDevice, mount: fsMount, total: fsTotal, used: fsUsed, free: fsFree, percent: fsPercent },
      snapshotCount,
      timestamp: Date.now()
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lecture /timeshift : ' + e.message });
  }
});

// ─── API PM2 ───────────────────────────────────────────────────
app.get('/api/pm2', async (req, res) => {
  try {
    const raw = await execPromise('pm2 jlist');
    const list = JSON.parse(raw);
    const projects = list.map(p => ({
      id: p.pm_id, name: p.name,
      status: p.pm2_env ? p.pm2_env.status : 'unknown',
      uptimeFormatted: (p.pm2_env && p.pm2_env.pm_uptime)
      ? formatUptime(Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000)) : '—',
      cpu: p.monit ? p.monit.cpu : 0,
      mem: p.monit ? p.monit.memory : 0,
      memFormatted: formatSize(p.monit ? p.monit.memory : 0),
      restarts: p.pm2_env ? p.pm2_env.restart_time : 0,
      pid: p.pid || '—',
      script: (p.pm2_env && p.pm2_env.pm_exec_path) ? p.pm2_env.pm_exec_path : '—',
      port: (p.pm2_env && p.pm2_env.env && p.pm2_env.env.PORT) ? p.pm2_env.env.PORT : '—',
    }));
    res.json({ projects, total: projects.length, online: projects.filter(p => p.status === 'online').length });
  } catch (e) {
    res.json({ projects: [], total: 0, online: 0, error: 'PM2 non disponible : ' + e.message });
  }
});

app.post('/api/pm2/:action/:id', (req, res) => {
  const { action, id } = req.params;
  if (!['start','stop','restart','delete'].includes(action)) return res.status(400).json({ error: 'Action invalide' });
  exec('pm2 ' + action + ' ' + id, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'pm2 ' + action + ' ' + id + ' OK', output: stdout });
  });
});

// ─── API STATS ─────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const cpuStart = os.cpus().map(c => c.times);
    await new Promise(r => setTimeout(r, 500));
    const cpuEnd = os.cpus().map(c => c.times);
    const cpuPercent = cpuEnd.map((end, i) => {
      const start = cpuStart[i];
      const idle = end.idle - start.idle;
      const total = Object.keys(end).reduce((acc, k) => acc + end[k] - start[k], 0);
      return total === 0 ? 0 : Math.round(100 * (1 - idle / total));
    });
    const avgCpu = Math.round(cpuPercent.reduce((a, b) => a + b, 0) / cpuPercent.length);
    const totalMem = os.totalmem(), freeMem = os.freemem(), usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    let swapTotal = 0, swapUsed = 0, swapPercent = 0;
    try {
      const s = await execPromise("free -b | awk '/Swap/{print $2, $3}'");
      const p2 = s.split(' '); swapTotal = parseInt(p2[0]); swapUsed = parseInt(p2[1]);
      swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;
    } catch (_) {}

    let diskTotal = 0, diskUsed = 0, diskPercent = 0;
    try {
      const df = await execPromise("df -B1 / | awk 'NR==2{print $2, $3, $5}'");
      const p2 = df.split(' '); diskTotal = parseInt(p2[0]); diskUsed = parseInt(p2[1]); diskPercent = parseInt(p2[2]);
    } catch (_) {}

    let allDisks = [];
    try {
      const dfAll = await execPromise(
        "df -B1 -x tmpfs -x devtmpfs -x squashfs -x overlay -x fuse.portal " +
        "| awk 'NR>1 && $2>100000000 {print $1\"|\"$2\"|\"$3\"|\"$4\"|\"$5\"|\"$6}'"
      );
      allDisks = dfAll.split('\n').filter(Boolean).map(line => {
        const p = line.split('|');
        return {
          device: p[0] || '',
          total:  parseInt(p[1]) || 0,
          used:   parseInt(p[2]) || 0,
          free:   parseInt(p[3]) || 0,
          percent: parseInt(p[4]) || 0,
          mount:  p[5] || ''
        };
      });
    } catch (_) {}

    let cpuTemp = null;
    try { const t = await execPromise('cat /sys/class/thermal/thermal_zone0/temp'); cpuTemp = (parseInt(t) / 1000).toFixed(1); } catch (_) {}

    const loadAvg = os.loadavg(), cpuCount = os.cpus().length;

    let netRx = 0, netTx = 0;
    try {
      const nr = await execPromise("cat /proc/net/dev | awk 'NR>2{rx+=$2; tx+=$10} END{print rx, tx}'");
      const p2 = nr.split(' '); netRx = parseInt(p2[0]); netTx = parseInt(p2[1]);
    } catch (_) {}

    let topProc = [];
    try {
      const pr = await execPromise("ps aux --sort=-%mem | awk 'NR>1 && NR<=8{print $11, $3, $4}'");
      topProc = pr.split('\n').map(l => {
        const p2 = l.split(' ');
        return { name: path.basename(p2[0] || ''), cpu: p2[1] || '0', mem: p2[2] || '0' };
      }).filter(p => p.name);
    } catch (_) {}

    let kernel = '', hostname = os.hostname();
    try { kernel = await execPromise('uname -r'); } catch (_) {}

    res.json({
      cpu: { percent: avgCpu, cores: cpuCount, perCore: cpuPercent, model: os.cpus()[0] ? os.cpus()[0].model : 'N/A', temp: cpuTemp },
      memory: { total: totalMem, used: usedMem, free: freeMem, percent: memPercent },
      swap: { total: swapTotal, used: swapUsed, percent: swapPercent },
      disk: { total: diskTotal, used: diskUsed, percent: diskPercent },
      allDisks: allDisks,
      uptime: { seconds: os.uptime(), formatted: formatUptime(os.uptime()) },
      load: { avg1: loadAvg[0].toFixed(2), avg5: loadAvg[1].toFixed(2), avg15: loadAvg[2].toFixed(2) },
      network: { rx: netRx, tx: netTx },
      system: { hostname, kernel, platform: os.platform(), arch: os.arch() },
      processes: topProc,
      timestamp: Date.now()
    });
  } catch (e) { res.status(500).json({ error: 'Erreur stats' }); }
});

// ─── HISTORIQUE ────────────────────────────────────────────────
const statsHistory = { cpu: [], mem: [], timestamps: [] };
setInterval(async () => {
  try {
    const cpuStart = os.cpus().map(c => c.times);
    await new Promise(r => setTimeout(r, 400));
    const cpuEnd = os.cpus().map(c => c.times);
    const avgCpu = Math.round(cpuEnd.map((end, i) => {
      const start = cpuStart[i], idle = end.idle - start.idle;
      const total = Object.keys(end).reduce((acc, k) => acc + end[k] - start[k], 0);
      return total === 0 ? 0 : 100 * (1 - idle / total);
    }).reduce((a, b) => a + b, 0) / cpuEnd.length);
    const memPct = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
    statsHistory.cpu.push(avgCpu); statsHistory.mem.push(memPct); statsHistory.timestamps.push(Date.now());
    if (statsHistory.cpu.length > 60) { statsHistory.cpu.shift(); statsHistory.mem.shift(); statsHistory.timestamps.shift(); }
  } catch (_) {}
}, 2000);

app.get('/api/history', (req, res) => res.json(statsHistory));

// ─── API EDITEUR ───────────────────────────────────────────────
app.get('/api/editor', async (req, res) => {
  try { res.json({ content: await fs.readFile(SELF_PATH, 'utf-8') }); }
  catch (e) { res.status(500).json({ error: 'Impossible de lire le fichier' }); }
});
app.post('/api/editor', async (req, res) => {
  try { await fs.writeFile(SELF_PATH, req.body.content, 'utf-8'); res.json({ message: 'Sauvegarde OK' }); }
  catch (e) { res.status(500).json({ error: 'Erreur ecriture' }); }
});
app.post('/api/restart', (req, res) => {
  res.json({ message: 'Redemarrage...' });
  setTimeout(() => exec('pm2 restart dashboard-fichiers', err => { if (err) console.error(err); }), 1000);
});

// ─── HTML ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PanelStats — System Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&family=SF+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<!-- ══ SCRIPT & CSS CODEMIRROR POUR L'EDITEUR DE CODE ══ -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/dracula.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/eclipse.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/javascript/javascript.min.js"></script>

<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ══ VARIABLES GLASS LIGHT (iOS) ══ */
:root{
  --bg-1:       #dde4f0;
  --bg-2:       #c8d3e8;

  /* Glass surfaces */
  --glass:          rgba(255,255,255,0.55);
  --glass-border:   rgba(255,255,255,0.75);
  --glass-hover:    rgba(255,255,255,0.70);
  --glass-sidebar:  rgba(255,255,255,0.45);
  --glass-topbar:   rgba(255,255,255,0.60);
  --glass-panel:    rgba(255,255,255,0.50);
  --glass-panel2:   rgba(255,255,255,0.30);
  --glass-input:    rgba(255,255,255,0.60);
  --glass-shadow:   0 8px 32px rgba(100,120,180,0.18), 0 1px 2px rgba(100,120,180,0.10);
  --glass-shadow-sm:0 4px 16px rgba(100,120,180,0.12), 0 1px 2px rgba(100,120,180,0.08);
  --blur:           saturate(180%) blur(20px);
  --blur-sm:        saturate(160%) blur(12px);

  --text:       #1a1f35;
  --text-2:     #3a4060;
  --muted:      #7a86a8;

  /* iOS accent palette */
  --blue:       #0a84ff;
  --cyan:       #32ade6;
  --green:      #34c759;
  --yellow:     #ffd60a;
  --orange:     #ff9f0a;
  --red:        #ff3b30;
  --purple:     #bf5af2;
  --teal:       #5ac8fa;
  --pink:       #ff375f;
  --indigo:     #5e5ce6;
  --heading:    #0a84ff;

  --bar-cpu:    #0a84ff;
  --bar-mem:    #34c759;
  --bar-disk0:  #ff9f0a;
  --bar-disk1:  #bf5af2;
  --bar-disk2:  #5ac8fa;
  --bar-disk3:  #ff375f;
  --bar-disk4:  #34c759;
  --bar-swap:   #ffd60a;
  --bar-net:    #32ade6;

  --gauge-track:rgba(0,0,0,0.08);
  --r:          14px;
  --r-sm:       10px;
  --font:       'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mono:       'SF Mono', 'Fira Code', 'Courier New', monospace;
}

/* ══ THEME SOMBRE (Glass Dark) ══ */
[data-theme="dark"]{
  --bg-1:       #0d1117;
  --bg-2:       #161b2a;

  --glass:          rgba(30,36,58,0.70);
  --glass-border:   rgba(255,255,255,0.10);
  --glass-hover:    rgba(255,255,255,0.08);
  --glass-sidebar:  rgba(20,26,44,0.80);
  --glass-topbar:   rgba(15,20,38,0.75);
  --glass-panel:    rgba(25,32,52,0.65);
  --glass-panel2:   rgba(15,20,38,0.50);
  --glass-input:    rgba(15,20,38,0.70);
  --glass-shadow:   0 8px 32px rgba(0,0,0,0.50), 0 1px 2px rgba(0,0,0,0.30);
  --glass-shadow-sm:0 4px 16px rgba(0,0,0,0.40), 0 1px 2px rgba(0,0,0,0.20);

  --text:       #f0f2ff;
  --text-2:     #a8b4d8;
  --muted:      #5a6488;

  --blue:       #0a84ff;
  --cyan:       #32ade6;
  --green:      #30d158;
  --yellow:     #ffd60a;
  --orange:     #ff9f0a;
  --red:        #ff453a;
  --purple:     #bf5af2;
  --teal:       #5ac8fa;
  --pink:       #ff375f;
  --indigo:     #7877c6;
  --heading:    #0a84ff;

  --bar-cpu:    #0a84ff;
  --bar-mem:    #30d158;
  --bar-disk0:  #ff9f0a;
  --bar-disk1:  #bf5af2;
  --bar-disk2:  #5ac8fa;
  --bar-disk3:  #ff375f;
  --bar-disk4:  #30d158;
  --bar-swap:   #ffd60a;
  --bar-net:    #32ade6;

  --gauge-track:rgba(255,255,255,0.08);
}

html,body{height:100%;overflow:hidden}
body{
  font-family:var(--font);font-size:12px;color:var(--text);
  display:flex;flex-direction:row;
  background:var(--bg-1);
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(10,132,255,0.15) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(191,90,242,0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 60% 85%, rgba(52,199,89,0.10) 0%, transparent 50%);
  background-attachment:fixed;
  -webkit-font-smoothing:antialiased;
}

/* ── SIDEBAR ── */
.sidebar{
  width:210px;flex-shrink:0;
  background:var(--glass-sidebar);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-right:1px solid var(--glass-border);
  display:flex;flex-direction:column;
  user-select:none;
  box-shadow:var(--glass-shadow);
  position:relative;z-index:5;
}
.sidebar-logo{
  padding:16px 18px 12px;
  font-size:15px;font-weight:700;color:var(--text);
  display:flex;align-items:center;gap:10px;
  border-bottom:1px solid var(--glass-border);
  letter-spacing:-0.02em;
}
.sidebar-logo .logo-icon{
  width:30px;height:30px;border-radius:8px;
  background:linear-gradient(135deg,var(--blue),var(--indigo));
  display:flex;align-items:center;justify-content:center;
  font-size:14px;color:#fff;
  box-shadow:0 4px 12px rgba(10,132,255,0.35);
}
.sidebar-section{
  padding:10px 14px 4px;
  font-size:10px;font-weight:600;color:var(--muted);
  text-transform:uppercase;letter-spacing:.08em;
}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 14px;font-size:12.5px;font-weight:500;color:var(--muted);
  cursor:pointer;
  border-radius:10px;
  margin:1px 8px;
  transition:all .2s cubic-bezier(.16,1,.3,1);
  position:relative;
}
.nav-item:hover{
  color:var(--text);
  background:var(--glass-hover);
}
.nav-item.active{
  color:var(--blue);
  background:rgba(10,132,255,0.12);
  font-weight:600;
}
.nav-item.active::before{
  content:'';
  position:absolute;left:-8px;top:50%;transform:translateY(-50%);
  width:3px;height:18px;border-radius:0 2px 2px 0;
  background:var(--blue);
}
.nav-item i{width:18px;text-align:center;font-size:13px}
.nav-dot{
  width:6px;height:6px;border-radius:50%;margin-left:auto;
  background:var(--green);
  box-shadow:0 0 6px var(--green);
  animation:pulse 2s infinite;
}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
.sidebar-sep{height:1px;background:var(--glass-border);margin:6px 10px}
.sidebar-footer{
  padding:12px 16px;
  font-size:10px;color:var(--muted);
  border-top:1px solid var(--glass-border);
  background:var(--glass-panel2);
}
.sidebar-footer .sf-line{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.sidebar-footer #sb-clock{
  font-size:18px;font-weight:300;color:var(--text);
  letter-spacing:-.02em;margin-top:4px;
}

/* ── TOPBAR ── */
.topbar{
  background:var(--glass-topbar);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-bottom:1px solid var(--glass-border);
  padding:0 20px;height:50px;
  display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;
  box-shadow:var(--glass-shadow-sm);
}
.topbar-title{font-size:14px;font-weight:600;color:var(--text);letter-spacing:-.02em}
.topbar-right{display:flex;align-items:center;gap:12px;font-size:11px;color:var(--muted)}
.live-chip{
  display:flex;align-items:center;gap:5px;
  background:rgba(52,199,89,0.12);
  border:1px solid rgba(52,199,89,0.30);
  border-radius:20px;padding:3px 10px;font-size:10px;font-weight:600;
  color:var(--green);
  backdrop-filter:blur(8px);
}
.live-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--green);
  animation:pulse 1.8s infinite;
  display:inline-block;
}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}

/* ── CONTENT ── */
.content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.tab-panel{display:none;flex:1;overflow-y:auto;padding:16px;flex-direction:column;gap:13px}
.tab-panel.active{display:flex}

/* Scrollbar iOS-like */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(120,130,160,0.25);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(120,130,160,0.40)}

/* ── PANEL GLASS ── */
.panel{
  background:var(--glass-panel);
  backdrop-filter:var(--blur-sm);
  -webkit-backdrop-filter:var(--blur-sm);
  border:1px solid var(--glass-border);
  border-radius:var(--r);
  overflow:hidden;
  box-shadow:var(--glass-shadow-sm);
  transition:box-shadow .2s;
}
.panel:hover{box-shadow:var(--glass-shadow)}
.panel-hd{
  background:var(--glass-panel2);
  border-bottom:1px solid var(--glass-border);
  padding:10px 14px;font-size:11.5px;font-weight:600;color:var(--text-2);
  display:flex;align-items:center;justify-content:space-between;
}
.panel-hd i{margin-right:7px;font-size:12px;opacity:.7}
.panel-bd{padding:13px}

/* ── GRIDS ── */
.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.grid-2{display:grid;grid-template-columns:2fr 1fr;gap:12px}
.grid-2b{display:grid;grid-template-columns:1fr 1fr;gap:12px}

/* ── INFO TABLE ── */
.info-table{width:100%;border-collapse:collapse}
.info-table tr{border-bottom:1px solid rgba(120,130,160,.12)}
.info-table tr:last-child{border-bottom:none}
.info-table td{padding:5px 6px;font-size:11px;vertical-align:middle}
.info-table .k{color:var(--muted);width:50%;padding-right:8px;font-weight:500}
.info-table .v{color:var(--text);font-weight:600;text-align:right}
.kbar{display:inline-block;width:3px;height:11px;border-radius:2px;margin-right:6px;vertical-align:middle}

/* ── GAUGE ── */
.gauge-wrap{display:flex;flex-direction:column;align-items:center;padding:10px 4px}
.gauge-svg{overflow:visible;filter:drop-shadow(0 2px 8px rgba(0,0,0,.1))}
.gauge-track{fill:none;stroke:var(--gauge-track);stroke-width:9;stroke-linecap:round}
.gauge-arc{
  fill:none;stroke-width:9;stroke-linecap:round;
  transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1);
  filter:drop-shadow(0 0 6px currentColor);
}
.gauge-center{text-anchor:middle;dominant-baseline:middle}
.gauge-pct{font-family:var(--font);font-weight:700;fill:var(--text)}
.gauge-sub{font-family:var(--font);fill:var(--muted);font-size:8px;font-weight:500}

/* ── PROGRESS BAR ── */
.pbar-row{margin-bottom:9px}
.pbar-top{display:flex;justify-content:space-between;margin-bottom:4px;font-size:10.5px}
.pbar-lbl{color:var(--muted);font-weight:500}
.pbar-val{color:var(--text);font-weight:600}
.pbar{
  height:5px;
  background:rgba(120,130,160,.12);
  border-radius:10px;
  overflow:hidden;
  position:relative;
}
.pbar-fill{
  height:100%;border-radius:10px;
  transition:width .9s cubic-bezier(.16,1,.3,1);
  position:relative;
}
.pbar-fill::after{
  content:'';
  position:absolute;top:0;left:0;right:0;bottom:0;
  background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.35) 50%,transparent 100%);
  border-radius:10px;
}

/* ── CHART ── */
.chart-wrap{height:110px;position:relative}
canvas{width:100%!important}

/* ── CORES ── */
.cores-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px}
.core-item{text-align:center;padding:6px 4px;background:var(--glass-panel2);border-radius:var(--r-sm);border:1px solid var(--glass-border)}
.core-lbl{font-size:9px;color:var(--muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.core-bar{height:4px;background:rgba(120,130,160,.15);border-radius:4px;overflow:hidden;margin-bottom:4px}
.core-fill{height:100%;border-radius:4px;transition:width .5s ease}
.core-val{font-size:10px;font-weight:700;color:var(--text)}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse;font-size:11.5px}
thead th{
  background:var(--glass-panel2);color:var(--muted);padding:8px 11px;text-align:left;
  font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;
  border-bottom:1px solid var(--glass-border);white-space:nowrap;font-weight:700;
}
tbody tr{border-bottom:1px solid rgba(120,130,160,.10);transition:background .15s}
tbody tr:last-child{border-bottom:none}
tbody tr:hover{background:var(--glass-hover)}
tbody td{padding:8px 11px;font-size:11.5px}

/* ── BADGE ── */
.badge{
  display:inline-flex;align-items:center;gap:4px;
  padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;
  letter-spacing:.02em;
}
.b-green{background:rgba(52,199,89,.15);color:var(--green);border:1px solid rgba(52,199,89,.25)}
.b-red{background:rgba(255,59,48,.12);color:var(--red);border:1px solid rgba(255,59,48,.20)}
.b-gray{background:rgba(120,130,160,.12);color:var(--muted);border:1px solid rgba(120,130,160,.20)}
.b-orange{background:rgba(255,159,10,.12);color:var(--orange);border:1px solid rgba(255,159,10,.20)}
.bdot{width:5px;height:5px;border-radius:50%;background:currentColor}

/* ── PM2 KPI ── */
.pm2-strip{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:0}
.pm2-kpi{
  background:var(--glass-panel);
  backdrop-filter:var(--blur-sm);
  -webkit-backdrop-filter:var(--blur-sm);
  border:1px solid var(--glass-border);
  border-radius:var(--r);padding:12px 18px;
  display:flex;align-items:center;gap:12px;
  box-shadow:var(--glass-shadow-sm);
}
.pm2-kpi-ico{
  font-size:20px;
  width:38px;height:38px;display:flex;align-items:center;justify-content:center;
  border-radius:10px;
  background:var(--glass-panel2);
}
.pm2-kpi-num{font-size:22px;font-weight:700;line-height:1;color:var(--text);letter-spacing:-.03em}
.pm2-kpi-lbl{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-weight:600;margin-top:2px}

/* ── PM2 ACTIONS ── */
.pm2-acts{display:flex;gap:4px}
.btn-xs{
  padding:4px 9px;border-radius:7px;
  border:1px solid var(--glass-border);
  background:var(--glass-panel2);color:var(--muted);
  font-family:var(--font);font-size:10px;font-weight:600;
  cursor:pointer;transition:all .18s;display:inline-flex;align-items:center;gap:3px;
  backdrop-filter:blur(8px);
}
.btn-xs:hover{border-color:var(--blue);color:var(--blue);background:rgba(10,132,255,.10)}
.btn-xs.stp:hover{border-color:var(--red);color:var(--red);background:rgba(255,59,48,.10)}
.btn-xs.rst:hover{border-color:var(--orange);color:var(--orange);background:rgba(255,159,10,.10)}

/* ── BUTTON ── */
.btn{
  padding:7px 14px;border-radius:9px;
  border:1px solid var(--glass-border);
  background:var(--glass-panel2);color:var(--text-2);
  font-family:var(--font);font-size:11.5px;font-weight:600;
  cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);
  display:inline-flex;align-items:center;gap:7px;
  backdrop-filter:blur(8px);
}
.btn:hover{border-color:var(--blue);color:var(--blue);background:rgba(10,132,255,.10);box-shadow:0 4px 16px rgba(10,132,255,.15)}
.btn-primary{background:rgba(10,132,255,.15);color:var(--blue);border-color:rgba(10,132,255,.40)}
.btn-primary:hover{background:rgba(10,132,255,.25);box-shadow:0 4px 20px rgba(10,132,255,.25)}
.btn-danger:hover{border-color:var(--red);color:var(--red);background:rgba(255,59,48,.10)}

/* ── THEME TOGGLE ── */
.theme-btn{
  padding:5px 12px;border-radius:20px;
  border:1px solid var(--glass-border);
  background:var(--glass-panel2);color:var(--text-2);
  font-family:var(--font);font-size:11px;font-weight:600;
  cursor:pointer;display:flex;align-items:center;gap:6px;
  transition:all .2s;backdrop-filter:blur(8px);
}
.theme-btn:hover{background:var(--glass-hover);border-color:rgba(10,132,255,.40)}

/* ── UPDATES ── */
.upd-console{
  font-family:var(--mono);font-size:11px;line-height:1.6;
  background:rgba(0,0,0,.55);color:#e2e8f0;
  border-radius:var(--r-sm);padding:12px 14px;
  height:260px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;
}
.upd-console .l-err{color:#fc8181}
.upd-console .l-done{color:#68d391;font-weight:700}
.upd-kpi-strip{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:0}
.upd-kpi{
  flex:1;min-width:120px;
  background:var(--glass-panel);border:1px solid var(--glass-border);
  border-radius:var(--r);padding:12px 16px;text-align:center;
  box-shadow:var(--glass-shadow-sm);
}
.upd-kpi-num{font-size:28px;font-weight:700;letter-spacing:-.04em;line-height:1}
.upd-kpi-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
.upd-badge{
  display:inline-flex;align-items:center;gap:4px;
  padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;
  background:rgba(255,159,10,.15);color:var(--orange);border:1px solid rgba(255,159,10,.30);
}
.upd-btn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

/* ── FILES ── */
.files-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.fsec-title{
  font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--heading);
  padding-bottom:7px;border-bottom:1px solid var(--glass-border);margin-bottom:7px;
  display:flex;align-items:center;justify-content:space-between;
}
.fcnt{
  background:rgba(10,132,255,.12);color:var(--blue);
  border:1px solid rgba(10,132,255,.20);
  border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;
}
.fscroll{max-height:340px;overflow-y:auto}
.frow{
  display:flex;align-items:center;justify-content:space-between;
  padding:5px 0;font-size:11px;border-bottom:1px solid rgba(120,130,160,.10);
  transition:all .15s;
}
.frow:last-child{border-bottom:none}
.frow:hover{color:var(--blue);padding-left:4px}
.fnm{display:flex;align-items:center;gap:7px;overflow:hidden}
.fnm i.fa-folder{color:var(--yellow)}
.fnm i.fa-file{color:var(--muted)}
.fnm-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.fsz{font-size:10px;color:var(--muted);white-space:nowrap;margin-left:4px;font-weight:600}

/* ── EDITOR ── */
#tab-editor {
  overflow: hidden !important; /* On empêche le scroll du panel entier pour garder l'éditeur fixe */
}
.editor-wrap{display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;height:100%}
.editor-toolbar{
  background:var(--glass-panel);
  backdrop-filter:var(--blur-sm);
  border:1px solid var(--glass-border);
  border-radius:var(--r);
  padding:10px 15px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
}
.editor-file{font-size:12px;font-weight:600;color:var(--blue);display:flex;align-items:center;gap:8px}
.editor-acts{display:flex;gap:8px}

/* Personnalisation de l'affichage de CodeMirror */
.CodeMirror {
  flex: 1;
  height: auto;
  border-radius: var(--r);
  font-family: var(--mono);
  font-size: 12.5px;
  border: 1px solid var(--glass-border);
  box-shadow: inset 0 2px 8px rgba(0,0,0,.15);
}

/* ── TOAST ── */
#toast{
  position:fixed;bottom:20px;right:20px;
  background:var(--glass);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  border:1px solid var(--glass-border);border-radius:12px;
  padding:10px 16px;font-size:12px;font-weight:600;
  z-index:9999;box-shadow:var(--glass-shadow);
  transform:translateY(80px) scale(.95);opacity:0;
  transition:all .35s cubic-bezier(.16,1,.3,1);
  color:var(--text);min-width:180px;
}
#toast.show{transform:translateY(0) scale(1);opacity:1}
#toast.success{border-left:3px solid var(--green)}
#toast.error{border-left:3px solid var(--red)}
#toast.info{border-left:3px solid var(--blue)}

/* ── STAT CARD (mini) ── */
.stat-chip{
  display:inline-flex;align-items:center;gap:5px;
  background:var(--glass-panel2);
  border:1px solid var(--glass-border);
  border-radius:8px;padding:3px 9px;font-size:10px;font-weight:600;
  color:var(--muted);
}

/* ── UTILS ── */
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ml-auto{margin-left:auto}
.text-muted{color:var(--muted)}
.flex{display:flex;align-items:center;gap:8px}

/* ── RESPONSIVE ── */
@media(max-width:1100px){
  .grid-5{grid-template-columns:repeat(3,1fr)}
  .grid-4{grid-template-columns:repeat(2,1fr)}
  .grid-2{grid-template-columns:1fr}
  .files-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:700px){
  .sidebar{display:none}
  .grid-5,.grid-4,.grid-3{grid-template-columns:1fr}
  .files-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- ── SIDEBAR ── -->
<div class="sidebar">
<div class="sidebar-logo">
  <div class="logo-icon"><i class="fas fa-display"></i></div>
  PanelStats
</div>

<div class="sidebar-section">Système</div>
<div class="nav-item active" onclick="switchTab('overview',this)">
  <i class="fas fa-border-all"></i> Overview
  <span class="nav-dot"></span>
</div>
<div class="nav-item" onclick="switchTab('cpu',this)">
  <i class="fas fa-microchip"></i> CPU
</div>
<div class="nav-item" onclick="switchTab('memory',this)">
  <i class="fas fa-memory"></i> Memory
</div>
<div class="nav-item" onclick="switchTab('disk',this)">
  <i class="fas fa-hard-drive"></i> Disk Usage
</div>
<div class="sidebar-sep"></div>
<div class="sidebar-section">Applications</div>
<div class="nav-item" onclick="switchTab('pm2',this)">
  <i class="fas fa-rocket"></i> Projets PM2
</div>
<div class="nav-item" onclick="switchTab('files',this)">
  <i class="fas fa-folder-open"></i> Répertoire
</div>
<div class="nav-item" onclick="switchTab('updates',this)">
  <i class="fas fa-arrow-up-from-bracket"></i> Mises à jour
  <span id="nav-upd-badge" style="display:none;margin-left:auto;background:rgba(255,159,10,.2);color:var(--orange);font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px"></span>
</div>
<div class="nav-item" onclick="switchTab('editor',this)">
  <i class="fas fa-code"></i> Éditeur
</div>

<div style="flex:1"></div>
<div class="sidebar-footer">
  <div class="sf-line"><i class="fas fa-server" style="font-size:10px"></i><span id="sb-host">—</span></div>
  <div class="sf-line"><i class="fas fa-clock" style="font-size:10px"></i><span id="sb-uptime">—</span></div>
  <div id="sb-clock">--:--:--</div>
</div>
</div>

<!-- ── MAIN ── -->
<div class="main">
<div class="topbar">
  <div class="topbar-title" id="topbar-title">Overview — PanelStats</div>
  <div class="topbar-right">
    <div class="live-chip"><span class="live-dot"></span> LIVE</div>
    <span class="stat-chip"><i class="fas fa-clock"></i><span id="tb-ts">—</span></span>
    <button class="theme-btn" id="theme-toggle" onclick="toggleTheme()" title="Changer de thème">
      <i class="fas fa-moon" id="theme-icon"></i>
      <span id="theme-label">Sombre</span>
    </button>
    <button class="theme-btn" onclick="logout()" title="Se déconnecter" style="border-color: rgba(255, 59, 48, 0.25); color: var(--red); background: rgba(255, 59, 48, 0.05);">
      <i class="fas fa-sign-out-alt"></i>
      <span>Déconnexion</span>
    </button>
  </div>
</div>

<div class="content">

<!-- ══ OVERVIEW ══ -->
<div class="tab-panel active" id="tab-overview">

<!-- Row 1 : info panels -->
<div class="grid-5" id="info-panels">
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-info-circle"></i> System Info</span></div>
  <div class="panel-bd"><table class="info-table" id="si-sys"></table></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-network-wired"></i> Network Info</span></div>
  <div class="panel-bd"><table class="info-table" id="si-net"></table></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-microchip"></i> CPU Info</span></div>
  <div class="panel-bd"><table class="info-table" id="si-cpu"></table></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-memory"></i> RAM Info</span></div>
  <div class="panel-bd"><table class="info-table" id="si-mem"></table></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-hard-drive"></i> Disk Info</span></div>
  <div class="panel-bd"><table class="info-table" id="si-disk"></table></div>
</div>
</div>

<!-- Row 2 : Gauges -->
<div class="grid-4">
<div class="panel">
  <div class="panel-hd"><span>CPU Usage</span></div>
  <div class="panel-bd">
    <div class="gauge-wrap">
      <svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90">
        <path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/>
        <path class="gauge-arc" id="g-cpu" stroke="var(--bar-cpu)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/>
        <text class="gauge-center gauge-pct" id="gv-cpu" x="70" y="62" font-size="18">0%</text>
        <text class="gauge-center gauge-sub" id="gs-cpu" x="70" y="76" font-size="9">CPU</text>
      </svg>
    </div>
  </div>
</div>
<div class="panel">
  <div class="panel-hd"><span>RAM Usage</span></div>
  <div class="panel-bd">
    <div class="gauge-wrap">
      <svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90">
        <path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/>
        <path class="gauge-arc" id="g-mem" stroke="var(--bar-mem)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/>
        <text class="gauge-center gauge-pct" id="gv-mem" x="70" y="56" font-size="18">0%</text>
        <text class="gauge-center gauge-sub" id="gs-mem1" x="70" y="70" font-size="8">0 Go</text>
        <text class="gauge-center gauge-sub" id="gs-mem2" x="70" y="80" font-size="8">Used RAM</text>
      </svg>
    </div>
  </div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Disk Usage /</span></div>
  <div class="panel-bd">
    <div class="gauge-wrap">
      <svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90">
        <path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/>
        <path class="gauge-arc" id="g-disk" stroke="var(--bar-disk0)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/>
        <text class="gauge-center gauge-pct" id="gv-disk" x="70" y="56" font-size="18">0%</text>
        <text class="gauge-center gauge-sub" id="gs-disk1" x="70" y="70" font-size="8">0 Go</text>
        <text class="gauge-center gauge-sub" id="gs-disk2" x="70" y="80" font-size="8">Used Space</text>
      </svg>
    </div>
  </div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Swap Usage</span></div>
  <div class="panel-bd">
    <div class="gauge-wrap">
      <svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90">
        <path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/>
        <path class="gauge-arc" id="g-swap" stroke="var(--bar-swap)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/>
        <text class="gauge-center gauge-pct" id="gv-swap" x="70" y="62" font-size="18">0%</text>
        <text class="gauge-center gauge-sub" id="gs-swap" x="70" y="76" font-size="9">Swap</text>
      </svg>
    </div>
  </div>
</div>
</div>

<!-- Row 3 : Chart + Load -->
<div class="grid-2">
<div class="panel">
  <div class="panel-hd">
    <span><i class="fas fa-chart-area"></i> CPU &amp; RAM History (60s)</span>
    <span id="chart-ts" style="font-size:9.5px;color:var(--muted)">—</span>
  </div>
  <div class="panel-bd"><div class="chart-wrap"><canvas id="chartMain"></canvas></div></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-gauge-high"></i> System Load</span></div>
  <div class="panel-bd" id="load-panel"></div>
</div>
</div>

<!-- Row 4 : Disk + Net + Proc -->
<div class="grid-3">
<div class="panel">
  <div class="panel-hd"><span>Disk Usage (GiB)</span></div>
  <div class="panel-bd" id="disk-bars"></div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Network I/O</span></div>
  <div class="panel-bd" id="net-panel"></div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Top Processes (RAM)</span></div>
  <div class="panel-bd" id="proc-panel"></div>
</div>
</div>

</div><!-- /overview -->

<!-- ══ CPU ══ -->
<div class="tab-panel" id="tab-cpu">
<div class="grid-2b">
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-microchip"></i> CPU Usage</span></div>
  <div class="panel-bd">
    <div class="chart-wrap" style="height:150px"><canvas id="chartCpu2"></canvas></div>
  </div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Cœurs individuels</span></div>
  <div class="panel-bd"><div class="cores-grid" id="cores-grid"></div></div>
</div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Informations CPU</span></div>
  <div class="panel-bd"><table class="info-table" id="cpu-detail"></table></div>
</div>
</div>

<!-- ══ MEMORY ══ -->
<div class="tab-panel" id="tab-memory">
<div class="grid-2b">
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-memory"></i> RAM History</span></div>
  <div class="panel-bd"><div class="chart-wrap" style="height:150px"><canvas id="chartMem2"></canvas></div></div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Utilisation mémoire</span></div>
  <div class="panel-bd" id="mem-detail"></div>
</div>
</div>
</div>

<!-- ══ DISK ══ -->
<div class="tab-panel" id="tab-disk">
<div class="grid-2b">
<div class="panel">
  <div class="panel-hd"><span>Disk Usage (GiB)</span></div>
  <div class="panel-bd" id="disk-detail-gib"></div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Disk Usage (%)</span></div>
  <div class="panel-bd" id="disk-detail-pct"></div>
</div>
</div>
</div>

<!-- ══ PM2 ══ -->
<div class="tab-panel" id="tab-pm2">
<div class="pm2-strip">
<div class="pm2-kpi">
  <div class="pm2-kpi-ico" style="color:var(--blue)"><i class="fas fa-cubes"></i></div>
  <div><div class="pm2-kpi-num" id="pm2-total">—</div><div class="pm2-kpi-lbl">Total</div></div>
</div>
<div class="pm2-kpi">
  <div class="pm2-kpi-ico" style="color:var(--green)"><i class="fas fa-circle-check"></i></div>
  <div><div class="pm2-kpi-num" id="pm2-online" style="color:var(--green)">—</div><div class="pm2-kpi-lbl">En ligne</div></div>
</div>
<div class="pm2-kpi">
  <div class="pm2-kpi-ico" style="color:var(--red)"><i class="fas fa-circle-xmark"></i></div>
  <div><div class="pm2-kpi-num" id="pm2-offline" style="color:var(--red)">—</div><div class="pm2-kpi-lbl">Arrêtés</div></div>
</div>
<div class="ml-auto"><button class="btn" onclick="loadPm2()"><i class="fas fa-sync"></i> Actualiser</button></div>
</div>
<div class="panel">
  <div class="panel-hd"><span><i class="fas fa-table"></i> Projets</span></div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>ID</th><th>Nom</th><th>Statut</th><th>Uptime</th>
        <th>CPU</th><th>RAM</th><th>Restart</th><th>PID</th><th>Port</th><th>Actions</th>
      </tr></thead>
      <tbody id="pm2-tbody">
        <tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)"><i class="fas fa-spinner spin"></i> Chargement...</td></tr>
      </tbody>
    </table>
  </div>
</div>
<div class="panel">
  <div class="panel-hd"><span>Chemins des scripts</span></div>
  <div style="overflow-x:auto">
    <table><thead><tr><th>Nom</th><th>Script</th></tr></thead>
    <tbody id="pm2-scripts"></tbody></table>
  </div>
</div>
</div>

<!-- ══ FICHIERS ══ -->
<div class="tab-panel" id="tab-files">

<!-- Timeshift quota -->
<div class="panel">
  <div class="panel-hd">
    <span><i class="fas fa-clock-rotate-left"></i> Quota /timeshift</span>
    <button class="btn" onclick="loadTimeshift()" style="padding:4px 10px;font-size:10px"><i class="fas fa-sync"></i> Actualiser</button>
  </div>
  <div class="panel-bd" id="timeshift-panel">
    <div style="color:var(--muted);padding:10px;text-align:center"><i class="fas fa-spinner spin"></i> Chargement...</div>
  </div>
</div>

<div class="panel" style="flex:1">
  <div class="panel-hd">
    <span><i class="fas fa-folder-open"></i> ${TARGET_DIR}</span>
    <button class="btn" onclick="loadFiles()" style="padding:4px 10px;font-size:10px"><i class="fas fa-sync"></i> Actualiser</button>
  </div>
  <div class="panel-bd">
    <div class="files-grid" id="files-grid">
      <div style="color:var(--muted);padding:20px;text-align:center"><i class="fas fa-spinner spin"></i></div>
    </div>
  </div>
</div>
</div>

<!-- ══ MISES À JOUR ══ -->
<div class="tab-panel" id="tab-updates">

<!-- KPIs -->
<div class="upd-kpi-strip">
  <div class="upd-kpi">
    <div class="upd-kpi-num" id="upd-count" style="color:var(--orange)">—</div>
    <div class="upd-kpi-lbl">Paquets à mettre à jour</div>
  </div>
  <div class="upd-kpi" style="flex:3;text-align:left;display:flex;align-items:center;gap:12px">
    <div class="upd-btn-row">
      <button class="btn" id="btn-upd-refresh" onclick="loadUpdates()">
        <i class="fas fa-sync"></i> Vérifier
      </button>
      <button class="btn" id="btn-apt-fetch" onclick="runApt('fetch')">
        <i class="fas fa-download"></i> apt-get update
      </button>
      <button class="btn btn-primary" id="btn-apt-upgrade" onclick="runApt('upgrade')">
        <i class="fas fa-arrow-up"></i> apt-get upgrade
      </button>
    </div>
    <span id="upd-ts" style="font-size:10px;color:var(--muted);margin-left:auto"></span>
  </div>
</div>

<!-- Liste des paquets -->
<div class="panel">
  <div class="panel-hd">
    <span><i class="fas fa-boxes-stacked"></i> Paquets disponibles</span>
    <span id="upd-list-count" style="font-size:10px;color:var(--muted)"></span>
  </div>
  <div style="overflow-x:auto;max-height:260px;overflow-y:auto">
    <table>
      <thead><tr>
        <th>Paquet</th>
        <th>Version actuelle</th>
        <th>Nouvelle version</th>
      </tr></thead>
      <tbody id="upd-tbody">
        <tr><td colspan="3" style="text-align:center;padding:22px;color:var(--muted)">
          <i class="fas fa-spinner spin"></i> Chargement...
        </td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Console live -->
<div class="panel">
  <div class="panel-hd">
    <span><i class="fas fa-terminal"></i> Console en direct</span>
    <div style="display:flex;gap:6px;align-items:center">
      <span id="upd-console-status" style="font-size:10px;color:var(--muted)">En attente</span>
      <button class="btn" style="padding:3px 9px;font-size:10px" onclick="clearConsole()">
        <i class="fas fa-trash"></i> Vider
      </button>
    </div>
  </div>
  <div class="panel-bd" style="padding:0">
    <div class="upd-console" id="upd-console">Aucune commande lancée.</div>
  </div>
</div>

</div>

<!-- ══ ÉDITEUR ══ -->
<div class="tab-panel" id="tab-editor">
<div class="editor-wrap">
  <div class="editor-toolbar">
    <div class="editor-file">
      <i class="fas fa-file-code"></i>
      <strong>server.js</strong>
      <span style="font-size:10px;color:var(--muted);font-weight:400">— édition en direct</span>
    </div>
    <div class="editor-acts">
      <button class="btn" onclick="editorLoad()"><i class="fas fa-download"></i> Recharger</button>
      <button class="btn btn-primary" onclick="editorSave()"><i class="fas fa-save"></i> Enregistrer</button>
      <button class="btn btn-danger" onclick="editorRestart()"><i class="fas fa-rotate-right"></i> Redémarrer PM2</button>
    </div>
  </div>
  <!-- Zone de texte qui sera remplacée par CodeMirror en JS -->
  <textarea id="code-area" spellcheck="false" placeholder="Chargement..."></textarea>
</div>
</div>

</div><!-- /content -->
</div><!-- /main -->

<div id="toast"></div>

<script>
// ── THEME ──────────────────────────────────────────────────────
var currentTheme = localStorage.getItem('dashboard-theme') || 'light';

function applyTheme(theme) {
  currentTheme = theme;
  var icon  = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme','dark');
    if (icon)  icon.className   = 'fas fa-sun';
    if (label) label.textContent = 'Clair';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (icon)  icon.className   = 'fas fa-moon';
    if (label) label.textContent = 'Sombre';
  }
  localStorage.setItem('dashboard-theme', theme);
  
  // Changement dynamique du thème de l'éditeur s'il est initialisé
  if (editor) {
    editor.setOption('theme', theme === 'dark' ? 'dracula' : 'eclipse');
  }
  
  setTimeout(function() { drawChartDual('chartMain', histCpu, histMem); }, 50);
}

function toggleTheme() { applyTheme(currentTheme === 'dark' ? 'light' : 'dark'); }

applyTheme(currentTheme);

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'info';
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.className = ''; }, 3000);
}

// ── FORMATTERS ────────────────────────────────────────────────
function fmtB(b) {
  if (!b) return '0 o';
  var k=1024, s=['o','Ko','Mo','Go','To'], i=Math.floor(Math.log(b)/Math.log(k));
  return (b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}
function fmtBG(b) {
  if (!b) return '0';
  return (b/1073741824).toFixed(1)+' GiB';
}

// ── TABS ──────────────────────────────────────────────────────
var tabs = {overview:1,cpu:0,memory:0,disk:0,pm2:0,files:0,updates:0,editor:0};
var editorLoaded=false, filesLoaded=false, pm2Loaded=false;
var titles = {
  overview:'Overview — PanelStats',
  cpu:'CPU — PanelStats',
  memory:'Memory — PanelStats',
  disk:'Disk Usage — PanelStats',
  pm2:'Projets PM2 — PanelStats',
  files:'Répertoire — PanelStats',
  updates:'Mises à jour — PanelStats',
  editor:'Éditeur server.js — PanelStats'
};

function switchTab(key, el) {
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('tab-'+key).classList.add('active');
  document.getElementById('topbar-title').textContent = titles[key] || 'PanelStats';
  if (key==='pm2'     && !pm2Loaded)    { pm2Loaded=true;    loadPm2(); }
  if (key==='files'   && !filesLoaded)  { filesLoaded=true;  loadFiles(); loadTimeshift(); }
  if (key==='updates' && !updLoaded)    { updLoaded=true;    loadUpdates(); }
  if (key==='editor'  && !editorLoaded) { initCodeMirror(); editorLoad(); }
  if (key==='cpu')    drawChartSingle('chartCpu2',  histCpu, 'var(--bar-cpu)');
  if (key==='memory') drawChartSingle('chartMem2',  histMem, 'var(--bar-mem)');
}

// ── CLOCK ─────────────────────────────────────────────────────
setInterval(function() {
  var t = new Date().toLocaleTimeString('fr-FR');
  document.getElementById('sb-clock').textContent = t;
  document.getElementById('tb-ts').textContent    = t;
}, 1000);

// ── GAUGE ─────────────────────────────────────────────────────
var ARC = 188.5;
function setGauge(id, pct) {
  var el = document.getElementById('g-'+id);
  if (!el) return;
  el.style.strokeDashoffset = ARC * (1 - pct/100);
}

// ── INFO TABLE ────────────────────────────────────────────────
function infoRow(key, val, color) {
  color = color || 'var(--blue)';
  return '<tr><td class="k"><span class="kbar" style="background:'+color+'"></span>'+key+'</td><td class="v">'+val+'</td></tr>';
}

// ── PROGRESS BAR ──────────────────────────────────────────────
function pbarRow(lbl, val, pct, color) {
  pct = Math.min(Math.max(parseFloat(pct)||0, 0), 100);
  return '<div class="pbar-row">'+
    '<div class="pbar-top"><span class="pbar-lbl">'+lbl+'</span><span class="pbar-val">'+val+'</span></div>'+
    '<div class="pbar"><div class="pbar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
    '</div>';
}

// ── API FETCH (cookie session automatique) ────────────────────
function apiFetch(url, opts) {
  opts = opts || {};
  opts.credentials = 'same-origin';
  return fetch(url, opts).then(function(r) {
    if (r.status === 401) { location.reload(); throw new Error('Session expirée'); }
    return r;
  });
}

// ── RENDER STATS ──────────────────────────────────────────────
var lastStats = null;

function renderStats(s) {
  lastStats = s;

  // Gauges
  setGauge('cpu', s.cpu.percent);
  document.getElementById('gv-cpu').textContent = s.cpu.percent+'%';
  setGauge('mem', s.memory.percent);
  document.getElementById('gv-mem').textContent  = s.memory.percent+'%';
  document.getElementById('gs-mem1').textContent = fmtBG(s.memory.used);
  setGauge('disk', s.disk.percent);
  document.getElementById('gv-disk').textContent  = s.disk.percent+'%';
  document.getElementById('gs-disk1').textContent = fmtBG(s.disk.used);
  setGauge('swap', s.swap.percent);
  document.getElementById('gv-swap').textContent = s.swap.percent+'%';

  // Sidebar
  document.getElementById('sb-uptime').textContent = s.uptime.formatted;
  document.getElementById('sb-host').textContent   = s.system.hostname;

  // System info
  document.getElementById('si-sys').innerHTML =
    infoRow('OS',           s.system.platform, 'var(--yellow)') +
    infoRow('Kernel',       s.system.kernel||'—', 'var(--yellow)') +
    infoRow('Architecture', s.system.arch,  'var(--yellow)') +
    infoRow('Hostname',     s.system.hostname, 'var(--yellow)') +
    infoRow('Uptime',       s.uptime.formatted, 'var(--yellow)');

  document.getElementById('si-net').innerHTML =
    infoRow('Download (total)', fmtB(s.network.rx), 'var(--teal)') +
    infoRow('Upload (total)',   fmtB(s.network.tx), 'var(--teal)') +
    infoRow('Load avg 1m',      s.load.avg1, 'var(--teal)') +
    infoRow('Load avg 5m',      s.load.avg5, 'var(--teal)') +
    infoRow('Load avg 15m',     s.load.avg15, 'var(--teal)');

  var model = (s.cpu.model||'').split('@');
  document.getElementById('si-cpu').innerHTML =
    infoRow('Cœurs',       s.cpu.cores, 'var(--orange)') +
    infoRow('Modèle',      model[0].trim().substring(0,22), 'var(--orange)') +
    infoRow('Fréquence',   model[1]?model[1].trim():'—', 'var(--orange)') +
    infoRow('Température', s.cpu.temp?s.cpu.temp+' °C':'—', 'var(--orange)') +
    infoRow('Utilisation', s.cpu.percent+'%', 'var(--orange)');

  document.getElementById('si-mem').innerHTML =
    infoRow('Total RAM',   fmtBG(s.memory.total), 'var(--green)') +
    infoRow('Utilisé',     fmtBG(s.memory.used),  'var(--green)') +
    infoRow('Libre',       fmtBG(s.memory.free),  'var(--green)') +
    infoRow('Utilisation', s.memory.percent+'%',  'var(--green)') +
    infoRow('Swap',        fmtB(s.swap.used)+' / '+fmtB(s.swap.total), 'var(--green)');

  document.getElementById('si-disk').innerHTML =
    infoRow('Total',       fmtBG(s.disk.total), 'var(--blue)') +
    infoRow('Utilisé',     fmtBG(s.disk.used),  'var(--blue)') +
    infoRow('Libre',       fmtBG(s.disk.total-s.disk.used), 'var(--blue)') +
    infoRow('Utilisation', s.disk.percent+'%',  'var(--blue)');

  // Load
  var cpuCores = s.cpu.cores || 1;
  document.getElementById('load-panel').innerHTML =
    pbarRow('Load 1m',  s.load.avg1,  (s.load.avg1/cpuCores)*100,  'var(--bar-cpu)') +
    pbarRow('Load 5m',  s.load.avg5,  (s.load.avg5/cpuCores)*100,  'var(--bar-mem)') +
    pbarRow('Load 15m', s.load.avg15, (s.load.avg15/cpuCores)*100, 'var(--bar-swap)') +
    pbarRow('CPU',      s.cpu.percent+'%',    s.cpu.percent,    'var(--bar-cpu)') +
    pbarRow('RAM',      s.memory.percent+'%', s.memory.percent, 'var(--bar-mem)');

  // Disks
  var diskColors = ['var(--bar-disk0)','var(--bar-disk1)','var(--bar-disk2)','var(--bar-disk3)','var(--bar-disk4)'];
  var diskBarHtml='', diskDetailGib='', diskDetailPct='';
  if (s.allDisks && s.allDisks.length) {
    s.allDisks.forEach(function(d, i) {
      var clr = diskColors[i % diskColors.length];
      var lbl = d.mount + (d.device?' ('+d.device.replace('/dev/','')+')':"");
      diskBarHtml    += pbarRow(lbl, fmtBG(d.used), d.percent, clr);
      diskDetailGib  += pbarRow(lbl, fmtBG(d.used)+'  /  '+fmtBG(d.total), d.percent, clr);
      diskDetailPct  += pbarRow(lbl, d.percent+'%', d.percent, clr);
    });
  } else {
    diskBarHtml   = pbarRow('/ (racine)', fmtBG(s.disk.used), s.disk.percent, 'var(--bar-disk0)');
    diskDetailGib = pbarRow('/ (racine)', fmtBG(s.disk.used)+' / '+fmtBG(s.disk.total), s.disk.percent, 'var(--bar-disk0)');
    diskDetailPct = pbarRow('/ (racine)', s.disk.percent+'%', s.disk.percent, 'var(--bar-disk0)');
  }
  diskBarHtml += pbarRow('Swap', fmtB(s.swap.used), s.swap.percent, 'var(--bar-swap)');
  document.getElementById('disk-bars').innerHTML      = diskBarHtml;
  document.getElementById('disk-detail-gib').innerHTML = diskDetailGib;
  document.getElementById('disk-detail-pct').innerHTML = diskDetailPct;

  // Network
  document.getElementById('net-panel').innerHTML =
    pbarRow('Rx (reçu)',    fmtB(s.network.rx), Math.min((s.network.rx/1073741824)*5,100), 'var(--bar-net)') +
    pbarRow('Tx (envoyé)', fmtB(s.network.tx), Math.min((s.network.tx/1073741824)*5,100), 'var(--teal)');

  // Processes
  document.getElementById('proc-panel').innerHTML = (s.processes||[]).map(function(p) {
    return pbarRow(p.name, p.mem+'%', Math.min(parseFloat(p.mem)*4,100), 'var(--purple)');
  }).join('');

  // CPU detail tab
  document.getElementById('cpu-detail').innerHTML =
    infoRow('Modèle',       (s.cpu.model||'N/A').substring(0,32), 'var(--bar-cpu)') +
    infoRow('Cœurs',        s.cpu.cores,     'var(--bar-cpu)') +
    infoRow('Utilisation',  s.cpu.percent+'%','var(--bar-cpu)') +
    infoRow('Température',  s.cpu.temp?s.cpu.temp+' °C':'—', 'var(--bar-cpu)') +
    infoRow('Load avg 1m',  s.load.avg1,  'var(--bar-cpu)') +
    infoRow('Load avg 5m',  s.load.avg5,  'var(--bar-cpu)') +
    infoRow('Load avg 15m', s.load.avg15, 'var(--bar-cpu)');

  // Cores grid
  document.getElementById('cores-grid').innerHTML = (s.cpu.perCore||[]).map(function(p, i) {
    return '<div class="core-item">'+
      '<div class="core-lbl">Core '+i+'</div>'+
      '<div class="core-bar"><div class="core-fill" style="width:'+p+'%;background:var(--bar-cpu)"></div></div>'+
      '<div class="core-val">'+p+'%</div>'+
      '</div>';
  }).join('');

  // Memory detail
  document.getElementById('mem-detail').innerHTML =
    pbarRow('RAM utilisée', fmtBG(s.memory.used), s.memory.percent,       'var(--bar-mem)') +
    pbarRow('RAM libre',    fmtBG(s.memory.free), 100-s.memory.percent,   'var(--green)') +
    pbarRow('Swap utilisé', fmtB(s.swap.used),    s.swap.percent,         'var(--bar-swap)');
}

async function loadStats() {
  try {
    var s = await apiFetch('/api/stats').then(function(r) { return r.json(); });
    renderStats(s);
  } catch(e) {}
}

// ── GRAPHIQUES ────────────────────────────────────────────────
var histCpu = [], histMem = [];

function initCanvas(id, h) {
  var c = document.getElementById(id);
  if (!c) return null;
  var ctx = c.getContext('2d');
  c.width  = c.offsetWidth * devicePixelRatio;
  c.height = (h||110) * devicePixelRatio;
  c.style.height = (h||110)+'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  return ctx;
}

function drawChartDual(id, dataCpu, dataMem) {
  var c = document.getElementById(id);
  if (!c) return;
  var ctx = c.getContext('2d');
  var W = c.offsetWidth, H = parseInt(c.style.height) || 110;
  ctx.clearRect(0,0,W,H);
  var MAX=60, pT=12, pB=4, range=H-pT-pB;

  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,132,255,0.08)';
  var labelColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(10,132,255,0.40)';

  ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
  [25,50,75].forEach(function(y) {
    var yp = pT + range*(1-y/100);
    ctx.beginPath(); ctx.moveTo(0,yp); ctx.lineTo(W,yp); ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.font = '8px -apple-system,sans-serif';
    ctx.fillText(y+'%', 3, yp-2);
  });

  function line(data, clr) {
    if (data.length < 2) return;
    var step = W / (MAX-1);
    ctx.beginPath();
    data.forEach(function(v, i) {
      var x = (MAX-data.length+i)*step, y = pT + range*(1-v/100);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    var x0 = (MAX-data.length)*step, xN = (MAX-1)*step;
    ctx.lineTo(xN, H-pB); ctx.lineTo(x0, H-pB); ctx.closePath();

    var g = ctx.createLinearGradient(0,pT,0,H);
    var rgb = clr === 'var(--bar-cpu)'
      ? (isDark ? '10,132,255'  : '10,132,255')
      : (isDark ? '48,209,88'   : '52,199,89');
    g.addColorStop(0, 'rgba('+rgb+',.25)');
    g.addColorStop(1, 'rgba('+rgb+',0)');
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    data.forEach(function(v, i) {
      var x = (MAX-data.length+i)*step, y = pT + range*(1-v/100);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    var strokeClr = clr === 'var(--bar-cpu)'
      ? '#0a84ff'
      : (isDark ? '#30d158' : '#34c759');
    ctx.strokeStyle = strokeClr; ctx.lineWidth = 1.8; ctx.stroke();
  }

  line(dataMem, 'var(--bar-mem)');
  line(dataCpu, 'var(--bar-cpu)');

  ctx.font = '8px -apple-system,sans-serif';
  ctx.fillStyle = '#0a84ff';   ctx.fillText('● CPU', W-90, 11);
  ctx.fillStyle = isDark?'#30d158':'#34c759'; ctx.fillText('● RAM', W-48, 11);
}

function drawChartSingle(id, data, clr) {
  var c = document.getElementById(id);
  if (!c) return;
  var ctx = c.getContext('2d');
  var W = c.offsetWidth, H = parseInt(c.style.height) || 150;
  if (!c.dataset.init) {
    c.width  = W * devicePixelRatio;
    c.height = H * devicePixelRatio;
    c.style.height = H+'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
    c.dataset.init = 1;
  }
  ctx.clearRect(0,0,W,H);
  drawChartDual(id, data, []);
}

async function loadHistory() {
  try {
    var h = await apiFetch('/api/history').then(function(r) { return r.json(); });
    histCpu = h.cpu; histMem = h.mem;
    document.getElementById('chart-ts').textContent = new Date().toLocaleTimeString('fr-FR');
    drawChartDual('chartMain', histCpu, histMem);
  } catch(e) {}
}

// ── PM2 ───────────────────────────────────────────────────────
async function loadPm2() {
  document.getElementById('pm2-tbody').innerHTML =
    '<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--muted)"><i class="fas fa-spinner spin"></i> Chargement...</td></tr>';
  try {
    var d = await apiFetch('/api/pm2').then(function(r) { return r.json(); });
    document.getElementById('pm2-total').textContent   = d.total;
    document.getElementById('pm2-online').textContent  = d.online;
    document.getElementById('pm2-offline').textContent = d.total - d.online;

    if (d.error && d.total === 0) {
      document.getElementById('pm2-tbody').innerHTML =
        '<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--red)">'+d.error+'</td></tr>';
      return;
    }

    document.getElementById('pm2-tbody').innerHTML = (d.projects||[]).map(function(p) {
      var bc = p.status==='online' ? 'b-green' : (p.status==='stopped' ? 'b-gray' : 'b-red');
      return '<tr>'+
        '<td><strong>#'+p.id+'</strong></td>'+
        '<td><strong>'+p.name+'</strong></td>'+
        '<td><span class="badge '+bc+'"><span class="bdot"></span>'+p.status+'</span></td>'+
        '<td>'+p.uptimeFormatted+'</td>'+
        '<td>'+p.cpu+'%</td>'+
        '<td>'+p.memFormatted+'</td>'+
        '<td style="text-align:center">'+p.restarts+'</td>'+
        '<td>'+p.pid+'</td>'+
        '<td>'+p.port+'</td>'+
        '<td><div class="pm2-acts">'+
          '<button class="btn-xs pm2-btn" data-action="start"   data-id="'+p.id+'"><i class="fas fa-play"></i> Start</button>'+
          '<button class="btn-xs stp pm2-btn" data-action="stop"    data-id="'+p.id+'"><i class="fas fa-stop"></i> Stop</button>'+
          '<button class="btn-xs rst pm2-btn" data-action="restart" data-id="'+p.id+'"><i class="fas fa-rotate-right"></i> Restart</button>'+
        '</div></td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--muted)">Aucun projet</td></tr>';

    document.getElementById('pm2-scripts').innerHTML = (d.projects||[]).map(function(p) {
      return '<tr><td><strong>'+p.name+'</strong></td>'+
        '<td style="font-size:10px;color:var(--muted);word-break:break-all;font-family:var(--mono)">'+p.script+'</td></tr>';
    }).join('');

  } catch(e) {
    document.getElementById('pm2-tbody').innerHTML =
      '<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--red)">Erreur : '+e.message+'</td></tr>';
  }
}

async function pm2Action(action, id) {
  document.querySelectorAll('.pm2-btn[data-id="'+id+'"]').forEach(function(b) { b.disabled = true; });
  toast('PM2 ' + action + ' #' + id + '...', 'info');
  try {
    var resp = await apiFetch('/api/pm2/' + action + '/' + id, { method: 'POST' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var r = await resp.json();
    toast(r.message || 'OK', 'success');
    setTimeout(loadPm2, 1200);
  } catch(e) {
    toast('Erreur PM2 : ' + e.message, 'error');
    document.querySelectorAll('.pm2-btn[data-id="'+id+'"]').forEach(function(b) { b.disabled = false; });
  }
}

// ── FICHIERS ──────────────────────────────────────────────────
async function loadFiles() {
  try {
    var d = await apiFetch('/api/files').then(function(r) { return r.json(); });
    var secs = [
      {key:'dossiers', title:'Dossiers'},
      {key:'fichiers', title:'Fichiers'},
      {key:'caches',   title:'Fichiers cachés'}
    ];
    document.getElementById('files-grid').innerHTML = secs.map(function(sec) {
      var items = (d[sec.key]||[]).sort(function(a,b) { return b.sizeRaw - a.sizeRaw; });
      if (!items.length) return '';
      return '<div>'+
        '<div class="fsec-title"><span>'+sec.title+'</span><span class="fcnt">'+items.length+'</span></div>'+
        '<div class="fscroll">'+
        items.map(function(f) {
          return '<div class="frow">'+
            '<div class="fnm"><i class="fas '+f.icon+'"></i><span class="fnm-txt" title="'+f.name+'">'+f.name+'</span></div>'+
            '<span class="fsz">'+f.sizeFormatted+'</span>'+
            '</div>';
        }).join('')+
        '</div>'+
        '</div>';
    }).join('');
  } catch(e) { toast('Erreur fichiers', 'error'); }
}

// ── TIMESHIFT ─────────────────────────────────────────────────
async function loadTimeshift() {
  var el = document.getElementById('timeshift-panel');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);padding:10px;text-align:center"><i class="fas fa-spinner spin"></i> Chargement...</div>';
  try {
    var d = await apiFetch('/api/timeshift').then(function(r) { return r.json(); });
    if (d.error) { el.innerHTML = '<p style="color:var(--red);padding:10px">' + d.error + '</p>'; return; }

    var fs = d.filesystem;
    var pct = fs.percent || 0;
    var barClr = pct < 60 ? 'var(--green)' : pct < 85 ? 'var(--orange)' : 'var(--red)';

    el.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<div style="text-align:center">' +
          '<div style="font-size:22px;font-weight:700;color:var(--blue)">' + d.dirSizeFormatted + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Taille /timeshift</div>' +
        '</div>' +
        '<div style="text-align:center">' +
          '<div style="font-size:22px;font-weight:700;color:var(--text)">' + fmtB(fs.total) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Partition totale</div>' +
        '</div>' +
        '<div style="text-align:center">' +
          '<div style="font-size:22px;font-weight:700;color:var(--text)">' + fmtB(fs.free) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Libre</div>' +
        '</div>' +
        '<div style="text-align:center">' +
          '<div style="font-size:22px;font-weight:700;color:' + (d.snapshotCount > 0 ? 'var(--purple)' : 'var(--muted)') + '">' + d.snapshotCount + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Snapshots</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:10px;color:var(--muted)">' +
        '<span>Utilisation partition <strong style="color:var(--text)">' + (fs.mount || '/timeshift') + '</strong> (' + (fs.device || '—') + ')</span>' +
        '<span style="font-weight:600;color:' + barClr + '">' + pct + '%</span>' +
      '</div>' +
      '<div style="height:8px;border-radius:4px;background:var(--gauge-track);overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + barClr + ';border-radius:4px;transition:width .4s"></div>' +
      '</div>' +
      '<div style="margin-top:6px;font-size:9.5px;color:var(--muted);text-align:right">' +
        fmtB(fs.used) + ' utilisés / ' + fmtB(fs.total) +
      '</div>';
  } catch(e) {
    el.innerHTML = '<p style="color:var(--red);padding:10px">Erreur : ' + e.message + '</p>';
  }
}

// ── EDITEUR PROFESSIONALISE (CodeMirror) ──────────────────────
var editor; // Contiendra l'instance de CodeMirror

function initCodeMirror() {
  if (editor) return; // Déjà initialisé
  var codeArea = document.getElementById('code-area');
  if (!codeArea) return;

  editor = CodeMirror.fromTextArea(codeArea, {
    lineNumbers: true,
    mode: "javascript",
    theme: currentTheme === 'dark' ? 'dracula' : 'eclipse',
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true
  });

  // Liaison des raccourcis de sauvegarde Ctrl+S / Cmd+S
  editor.setOption("extraKeys", {
    "Ctrl-S": function(cm) { editorSave(); },
    "Cmd-S": function(cm) { editorSave(); }
  });
}

async function editorLoad() {
  try {
    var d = await apiFetch('/api/editor').then(function(r) { return r.json(); });
    
    initCodeMirror(); // Assurer l'init
    if (editor) {
      editor.setValue(d.content);
    } else {
      document.getElementById('code-area').value = d.content;
    }
    
    editorLoaded = true;
    toast('Fichier chargé', 'success');
  } catch(e) { toast('Erreur chargement', 'error'); }
}

async function editorSave() {
  var content = editor ? editor.getValue() : document.getElementById('code-area').value;
  try {
    await apiFetch('/api/editor', {
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body:JSON.stringify({content:content})
    });
    toast('Fichier sauvegardé !', 'success');
  } catch(e) { toast('Erreur sauvegarde', 'error'); }
}

function editorRestart() {
  if (!confirm('PM2 va redémarrer. Continuer ?')) return;
  apiFetch('/api/restart', {method:'POST'})
    .then(function() { toast('Redémarrage envoyé — rechargez dans 4s','info'); setTimeout(function() { location.reload(); }, 4000); })
    .catch(function() { toast('Erreur','error'); });
}

// ── MISES À JOUR ──────────────────────────────────────────────
var updLoaded = false;

async function loadUpdates() {
  var btn = document.getElementById('btn-upd-refresh');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner spin"></i> Vérification...'; }
  document.getElementById('upd-tbody').innerHTML =
    '<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--muted)"><i class="fas fa-spinner spin"></i> Chargement...</td></tr>';
  try {
    var d = await apiFetch('/api/updates').then(function(r) { return r.json(); });
    var cnt = d.count || 0;

    document.getElementById('upd-count').textContent = cnt;
    document.getElementById('upd-ts').textContent = 'Vérifié à ' + new Date().toLocaleTimeString('fr-FR');
    document.getElementById('upd-list-count').textContent = cnt + ' paquet' + (cnt > 1 ? 's' : '');

    // Badge sidebar
    var badge = document.getElementById('nav-upd-badge');
    if (cnt > 0) { badge.style.display = ''; badge.textContent = cnt; }
    else         { badge.style.display = 'none'; }

    if (cnt === 0) {
      document.getElementById('upd-tbody').innerHTML =
        '<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--green)">' +
        '<i class="fas fa-circle-check"></i> Système à jour !</td></tr>';
    } else {
      document.getElementById('upd-tbody').innerHTML = (d.packages || []).map(function(p) {
        return '<tr>' +
          '<td><strong>' + p.name + '</strong></td>' +
          '<td style="color:var(--muted);font-family:var(--mono);font-size:10.5px">' + p.oldVersion + '</td>' +
          '<td><span class="upd-badge"><i class="fas fa-arrow-up" style="font-size:9px"></i>' + p.newVersion + '</span></td>' +
          '</tr>';
      }).join('');
    }
  } catch(e) {
    document.getElementById('upd-tbody').innerHTML =
      '<tr><td colspan="3" style="color:var(--red);padding:14px">Erreur : ' + e.message + '</td></tr>';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i> Vérifier'; }
  }
}

function clearConsole() {
  document.getElementById('upd-console').innerHTML = '';
  document.getElementById('upd-console-status').textContent = 'En attente';
  document.getElementById('upd-console-status').style.color = 'var(--muted)';
}

function appendConsole(line, cls) {
  var el = document.getElementById('upd-console');
  var span = document.createElement('span');
  span.className = cls || '';
  span.textContent = line + '\\n';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

function setConsoleBtns(running) {
  ['btn-apt-fetch', 'btn-apt-upgrade', 'btn-upd-refresh'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.disabled = running;
  });
}

function runApt(action) {
  clearConsole();
  var label = action === 'fetch' ? 'apt-get update' : 'apt-get upgrade';
  var st = document.getElementById('upd-console-status');
  st.textContent = '● ' + label + ' en cours...';
  st.style.color = 'var(--orange)';
  setConsoleBtns(true);

  var es = new EventSource('/api/updates/' + action);
  es.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.t === 'out')  appendConsole(msg.line, '');
      if (msg.t === 'err')  appendConsole(msg.line, 'l-err');
      if (msg.t === 'done') {
        var ok = msg.code === 0;
        appendConsole((ok ? '✔ Terminé (code 0)' : '✖ Erreur (code ' + msg.code + ')'), 'l-done');
        st.textContent = ok ? '✔ Terminé' : '✖ Erreur code ' + msg.code;
        st.style.color = ok ? 'var(--green)' : 'var(--red)';
        setConsoleBtns(false);
        es.close();
        if (ok && action === 'fetch') loadUpdates(); // rafraîchit la liste après update
        if (ok && action === 'upgrade') setTimeout(loadUpdates, 1500);
      }
    } catch(_) {}
  };
  es.onerror = function() {
    appendConsole('Connexion perdue.', 'l-err');
    st.textContent = 'Erreur connexion';
    st.style.color = 'var(--red)';
    setConsoleBtns(false);
    es.close();
  };
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', function() {
  initCanvas('chartMain', 110);
  loadStats();
  loadHistory();
  setInterval(loadStats,   5000);
  setInterval(loadHistory, 2000);

  document.getElementById('tab-pm2').addEventListener('click', function(e) {
    var btn = e.target.closest('.pm2-btn');
    if (!btn || btn.disabled) return;
    pm2Action(btn.dataset.action, btn.dataset.id);
  });
});

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    toast('Déconnexion...', 'info');
    setTimeout(function() { location.reload(); }, 800);
  } catch (e) {
    toast('Erreur lors de la déconnexion', 'error');
  }
}

window.addEventListener('resize', function() {
  initCanvas('chartMain', 110);
  drawChartDual('chartMain', histCpu, histMem);
});
</script>
</body>
</html>`);
});

// ─── API MISES À JOUR ─────────────────────────────────────────
// GET  /api/updates        → liste des paquets à mettre à jour
// POST /api/updates/fetch  → lance apt-get update (SSE)
// POST /api/updates/upgrade→ lance apt-get upgrade -y (SSE)

function sseRun(req, res, cmd) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const child = require('child_process').spawn('bash', ['-c', cmd], {
    env: Object.assign({}, process.env, { DEBIAN_FRONTEND: 'noninteractive' })
  });

  child.stdout.on('data', d => {
    d.toString().split('\n').forEach(line => {
      if (line) res.write('data: ' + JSON.stringify({ t: 'out', line }) + '\n\n');
    });
  });
  child.stderr.on('data', d => {
    d.toString().split('\n').forEach(line => {
      if (line) res.write('data: ' + JSON.stringify({ t: 'err', line }) + '\n\n');
    });
  });
  child.on('close', code => {
    res.write('data: ' + JSON.stringify({ t: 'done', code }) + '\n\n');
    res.end();
  });
  req.on('close', () => child.kill());
}

app.get('/api/updates', (req, res) => {
  exec('LANG=C sudo -n apt list --upgradable 2>/dev/null | grep -v "^Listing"', (err, stdout) => {
    const lines = (stdout || '').trim().split('\n').filter(Boolean);
    const packages = lines.map(line => {
      // format: name/repo version arch [upgradable from: old]
      const m = line.match(/^([^/]+)\/(\S+)\s+(\S+)\s+(\S+)\s+\[upgradable from: ([^\]]+)\]/);
      if (m) return { name: m[1], repo: m[2], newVersion: m[3], arch: m[4], oldVersion: m[5] };
      // fallback: try to extract name and version without the upgradable part
      const m2 = line.match(/^([^/]+)\/(\S+)\s+(\S+)/);
      if (m2) return { name: m2[1], newVersion: m2[3], oldVersion: '?' };
      return { name: line.split('/')[0], newVersion: '—', oldVersion: '—' };
    }).filter(p => p.name);
    res.json({ count: packages.length, packages, error: err ? err.message : null });
  });
});

app.get('/api/updates/fetch', (req, res) => {
  sseRun(req, res, 'sudo -n /usr/bin/apt-get -o Dpkg::Options::="--force-confdef" update 2>&1');
});

app.get('/api/updates/upgrade', (req, res) => {
  sseRun(req, res, 'sudo -n /usr/bin/apt-get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade -y 2>&1');
});

app.listen(PORT, function() { console.log('PanelStats Dashboard actif sur le port ' + PORT); });
