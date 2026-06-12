const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const app = express();

// ─── CONFIG PERSISTENCE ───────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'panelstats.config.json');

let runtimeConfig = {
  user:         process.env.DASHBOARD_USER || 'admin',
  pass:         process.env.DASHBOARD_PASS || '1981',
  targetDir:    '/home/fredo',
  timeshiftDir: '/mnt/usb-Generic_MassStorageClass_000000002402-0:0-part1/timeshift',
  port:         3000
};

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const saved = JSON.parse(raw);
    runtimeConfig = Object.assign(runtimeConfig, saved);
  } catch (_) {}
}

async function saveConfig() {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(runtimeConfig, null, 2), 'utf-8');
}

// ─── SESSION ──────────────────────────────────────────────────
const activeSessions = new Set();

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (name) list[name] = decodeURIComponent(parts.join('='));
  });
  return list;
}

function checkAuth(req, res, next) {
  if (req.path === '/api/login') return next();
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.session;
  if (sessionToken && activeSessions.has(sessionToken)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentification requise.' });
  if (req.path === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getLoginHTML());
  }
  res.status(401).send('Authentification requise.');
}

app.use(express.json());
app.use(checkAuth);

// ─── LOGIN / LOGOUT ───────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === runtimeConfig.user && password === runtimeConfig.pass) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800`);
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Identifiants incorrects' });
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.session;
  if (sessionToken) activeSessions.delete(sessionToken);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  res.json({ success: true });
});

// ─── API CONFIGURATION ────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    user:         runtimeConfig.user,
    targetDir:    runtimeConfig.targetDir,
    timeshiftDir: runtimeConfig.timeshiftDir,
    port:         runtimeConfig.port
    // le mot de passe n'est jamais renvoyé
  });
});

app.post('/api/config', async (req, res) => {
  const { user, pass, newPass, targetDir, timeshiftDir, port } = req.body;

  // Vérification ancien mot de passe obligatoire
  if (!pass || pass !== runtimeConfig.pass) {
    return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
  }

  if (user)         runtimeConfig.user         = user.trim();
  if (newPass)      runtimeConfig.pass         = newPass;
  if (targetDir)    runtimeConfig.targetDir    = targetDir.trim();
  if (timeshiftDir) runtimeConfig.timeshiftDir = timeshiftDir.trim();
  if (port)         runtimeConfig.port         = parseInt(port);

  try {
    await saveConfig();
    res.json({ success: true, message: 'Configuration sauvegardée. Redémarrez pour appliquer le port.' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur écriture config : ' + e.message });
  }
});

// ─── UTILITAIRES ──────────────────────────────────────────────
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
  const TARGET_DIR = runtimeConfig.targetDir;
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
  } catch (e) { res.status(500).json({ error: 'Erreur lecture répertoire : ' + e.message }); }
});

// ─── API TIMESHIFT ─────────────────────────────────────────────
app.get('/api/timeshift', async (req, res) => {
  const TIMESHIFT_DIR = runtimeConfig.timeshiftDir;
  try {
    let dirSize = 0;
    try {
      const du = await execPromise('du -sb ' + TIMESHIFT_DIR + ' 2>/dev/null | cut -f1');
      dirSize = parseInt(du) || 0;
    } catch (_) { dirSize = await getDirectorySize(TIMESHIFT_DIR); }

    let fsTotal = 0, fsUsed = 0, fsFree = 0, fsPercent = 0, fsMount = '', fsDevice = '';
    try {
      const df = await execPromise("df -B1 " + TIMESHIFT_DIR + " | awk 'NR==2{print $1, $2, $3, $4, $5, $6}'");
      const p = df.split(' ');
      fsDevice = p[0]||''; fsTotal = parseInt(p[1])||0; fsUsed = parseInt(p[2])||0;
      fsFree = parseInt(p[3])||0; fsPercent = parseInt(p[4])||0; fsMount = p[5]||'';
    } catch (_) {}

    let snapshotCount = 0;
    try {
      const ls = await execPromise('ls ' + TIMESHIFT_DIR + '/snapshots 2>/dev/null | wc -l');
      snapshotCount = parseInt(ls) || 0;
    } catch (_) {}

    res.json({ dirPath: TIMESHIFT_DIR, dirSize, dirSizeFormatted: formatSize(dirSize),
      filesystem: { device: fsDevice, mount: fsMount, total: fsTotal, used: fsUsed, free: fsFree, percent: fsPercent },
      snapshotCount, timestamp: Date.now() });
  } catch (e) { res.status(500).json({ error: 'Erreur lecture /timeshift : ' + e.message }); }
});

// ─── API PM2 ────────────────────────────────────────────────────
app.get('/api/pm2', async (req, res) => {
  try {
    const raw = await execPromise('pm2 jlist');
    const list = JSON.parse(raw);

    // Construire une map PID -> port via ss (ports TCP en écoute)
    const pidPortMap = {};
    try {
      const ss = await execPromise("ss -tlnp 2>/dev/null | awk 'NR>1{print $4, $6}'");
      ss.split('\n').forEach(line => {
        const m = line.match(/:([0-9]+)\s+.*pid=(\d+)/);
        if (m) pidPortMap[m[2]] = m[1];
      });
    } catch (_) {}

    const projects = list.map(p => {
      const e = p.pm2_env || {};
      const env = e.env || {};
      const ep  = e.env_production || {};
      const ed  = e.env_development || {};
      // 1) Variable d'env PORT (toutes les variantes)
      let port = env.PORT || env.port || ep.PORT || ep.port || ed.PORT || ed.port || '';
      // 2) Port réseau réel via PID (ss)
      if (!port && p.pid) port = pidPortMap[String(p.pid)] || '';
      // 3) Lire le script et chercher app.listen(PORT) ou port: XXXX
      if (!port && e.pm_exec_path) {
        try {
          const src = require('fs').readFileSync(e.pm_exec_path, 'utf-8');
          const m = src.match(/(?:listen|port[:\s=]+)\s*[\(]?\s*(\d{2,5})/i);
          if (m) port = m[1];
        } catch (_) {}
      }
      return {
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
        port: port || '—',
      };
    });
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

// ─── API STATS ──────────────────────────────────────────────────
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
        return { device: p[0]||'', total: parseInt(p[1])||0, used: parseInt(p[2])||0,
          free: parseInt(p[3])||0, percent: parseInt(p[4])||0, mount: p[5]||'' };
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
      allDisks,
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

// ─── ÉDITEUR ────────────────────────────────────────────────────
const SELF_PATH = __filename;
app.get('/api/editor', async (req, res) => {
  try { res.json({ content: await fs.readFile(SELF_PATH, 'utf-8') }); }
  catch (e) { res.status(500).json({ error: 'Impossible de lire le fichier' }); }
});
app.post('/api/editor', async (req, res) => {
  try { await fs.writeFile(SELF_PATH, req.body.content, 'utf-8'); res.json({ message: 'Sauvegarde OK' }); }
  catch (e) { res.status(500).json({ error: 'Erreur écriture' }); }
});
app.post('/api/restart', (req, res) => {
  res.json({ message: 'Redémarrage...' });
  setTimeout(() => exec('pm2 restart dashboard-fichiers', err => { if (err) console.error(err); }), 1000);
});

// ─── MISES À JOUR ──────────────────────────────────────────────
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
  child.on('close', code => { res.write('data: ' + JSON.stringify({ t: 'done', code }) + '\n\n'); res.end(); });
  req.on('close', () => child.kill());
}

app.get('/api/updates', (req, res) => {
  exec('LANG=C sudo -n apt list --upgradable 2>/dev/null | grep -v "^Listing"', (err, stdout) => {
    const lines = (stdout || '').trim().split('\n').filter(Boolean);
    const packages = lines.map(line => {
      const m = line.match(/^([^/]+)\/(\S+)\s+(\S+)\s+(\S+)\s+\[upgradable from: ([^\]]+)\]/);
      if (m) return { name: m[1], repo: m[2], newVersion: m[3], arch: m[4], oldVersion: m[5] };
      const m2 = line.match(/^([^/]+)\/(\S+)\s+(\S+)/);
      if (m2) return { name: m2[1], newVersion: m2[3], oldVersion: '?' };
      return { name: line.split('/')[0], newVersion: '—', oldVersion: '—' };
    }).filter(p => p.name);
    res.json({ count: packages.length, packages, error: err ? err.message : null });
  });
});

app.get('/api/updates/fetch',   (req, res) => sseRun(req, res, 'sudo -n /usr/bin/apt-get -o Dpkg::Options::="--force-confdef" update 2>&1'));
app.get('/api/updates/upgrade', (req, res) => sseRun(req, res, 'sudo -n /usr/bin/apt-get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade -y 2>&1'));

// ─── PAGE CONNEXION ────────────────────────────────────────────
function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion — PanelStats</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg: #0a0e1a;
  --card: rgba(255,255,255,0.04);
  --border: rgba(255,255,255,0.08);
  --text: #f0f2ff;
  --muted: #5a6488;
  --blue: #3b82f6;
  --indigo: #6366f1;
  --font: 'DM Sans', sans-serif;
}
body{font-family:var(--font);background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(99,102,241,0.25) 0%,transparent 60%);pointer-events:none}
.card{width:380px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:36px;backdrop-filter:blur(24px)}
.logo{width:48px;height:48px;background:linear-gradient(135deg,var(--blue),var(--indigo));border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;margin:0 auto 20px;box-shadow:0 8px 24px rgba(99,102,241,0.35)}
h1{text-align:center;font-size:20px;font-weight:700;margin-bottom:6px}
.sub{text-align:center;font-size:12px;color:var(--muted);margin-bottom:28px}
label{display:block;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.inp-wrap{position:relative;margin-bottom:16px}
.inp-wrap i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:13px}
input{width:100%;padding:12px 14px 12px 40px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;transition:.2s}
input:focus{border-color:var(--indigo);background:rgba(99,102,241,0.1);box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
.btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--blue),var(--indigo));border:none;border-radius:10px;color:#fff;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;transition:.2s}
.btn:hover{opacity:.9;transform:translateY(-1px)}
.err{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:14px;display:none;align-items:center;gap:8px}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><i class="fas fa-display"></i></div>
  <h1>PanelStats</h1>
  <p class="sub">Tableau de bord système</p>
  <div class="err" id="err"><i class="fas fa-circle-exclamation"></i><span id="err-txt">Identifiants incorrects</span></div>
  <form onsubmit="login(event)">
    <label>Identifiant</label>
    <div class="inp-wrap"><i class="fas fa-user"></i><input type="text" id="u" required placeholder="admin" autocomplete="username"></div>
    <label>Mot de passe</label>
    <div class="inp-wrap"><i class="fas fa-lock"></i><input type="password" id="p" required placeholder="••••••••" autocomplete="current-password"></div>
    <button class="btn" id="btn" type="submit">Se connecter</button>
  </form>
</div>
<script>
async function login(e){
  e.preventDefault();
  var btn=document.getElementById('btn'),err=document.getElementById('err'),errTxt=document.getElementById('err-txt');
  err.style.display='none';btn.disabled=true;btn.textContent='Connexion...';
  try{
    var r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});
    if(r.ok){location.reload();}else{var d=await r.json();errTxt.textContent=d.error||'Erreur';err.style.display='flex';}
  }catch(ex){errTxt.textContent='Serveur injoignable';err.style.display='flex';}
  btn.disabled=false;btn.textContent='Se connecter';
}
</script>
</body>
</html>`;
}

// ─── PAGE PRINCIPALE ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getDashboardHTML());
});

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PanelStats — System Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/dracula.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/theme/eclipse.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.13/mode/javascript/javascript.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:         #0a0e1a;
  --bg2:        #0f1525;
  --surface:    rgba(255,255,255,0.03);
  --surface2:   rgba(255,255,255,0.06);
  --border:     rgba(255,255,255,0.07);
  --border2:    rgba(255,255,255,0.12);
  --text:       #e8ecff;
  --text2:      #8892b0;
  --muted:      #4a5270;
  --blue:       #3b82f6;
  --indigo:     #6366f1;
  --violet:     #8b5cf6;
  --green:      #10b981;
  --emerald:    #34d399;
  --yellow:     #f59e0b;
  --orange:     #f97316;
  --red:        #ef4444;
  --pink:       #ec4899;
  --teal:       #14b8a6;
  --cyan:       #06b6d4;
  --font:       'DM Sans', sans-serif;
  --mono:       'DM Mono', monospace;
  --r:          14px;
  --r-sm:       9px;
  --sidebar-w: 220px;
}

[data-theme="light"]{
  --bg:         #f0f4ff;
  --bg2:        #e4eaf8;
  --surface:    rgba(255,255,255,0.80);
  --surface2:   rgba(255,255,255,0.60);
  --border:     rgba(99,102,241,0.12);
  --border2:    rgba(99,102,241,0.20);
  --text:       #1a1f3a;
  --text2:      #3a4060;
  --muted:      #8892b0;
}

html,body{height:100%;overflow:hidden}
body{
  font-family:var(--font);font-size:13px;color:var(--text);
  background:var(--bg);
  display:flex;flex-direction:row;
  -webkit-font-smoothing:antialiased;
  transition:background .3s, color .3s;
}
body::before{
  content:'';position:fixed;inset:0;
  background:
    radial-gradient(ellipse 70% 50% at 15% 20%,rgba(99,102,241,0.12) 0%,transparent 60%),
    radial-gradient(ellipse 50% 40% at 85% 80%,rgba(16,185,129,0.08) 0%,transparent 50%);
  pointer-events:none;z-index:0;
}

/* ── SIDEBAR ── */
.sidebar{
  width:var(--sidebar-w);flex-shrink:0;
  background:rgba(15,21,37,0.95);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:relative;z-index:10;
  backdrop-filter:blur(20px);
}
[data-theme="light"] .sidebar{background:rgba(255,255,255,0.92)}

.sidebar-logo{
  padding:18px 16px 14px;
  display:flex;align-items:center;gap:10px;
  border-bottom:1px solid var(--border);
}
.logo-mark{
  width:32px;height:32px;border-radius:9px;
  background:linear-gradient(135deg,var(--blue),var(--indigo));
  display:flex;align-items:center;justify-content:center;
  font-size:14px;color:#fff;flex-shrink:0;
  box-shadow:0 4px 12px rgba(99,102,241,0.4);
}
.logo-text{font-size:15px;font-weight:700;color:var(--text);letter-spacing:-.02em}
.logo-ver{font-size:9px;color:var(--muted);font-weight:500;margin-top:1px}

.nav-section{
  padding:14px 12px 4px;
  font-size:9.5px;font-weight:700;color:var(--muted);
  text-transform:uppercase;letter-spacing:.1em;
}
.nav-item{
  display:flex;align-items:center;gap:9px;
  padding:9px 12px;
  margin:1px 6px;
  border-radius:var(--r-sm);
  font-size:13px;font-weight:500;color:var(--text2);
  cursor:pointer;
  transition:all .18s cubic-bezier(.16,1,.3,1);
  position:relative;
  user-select:none;
}
.nav-item:hover{color:var(--text);background:var(--surface2)}
.nav-item.active{color:#fff;background:linear-gradient(135deg,rgba(59,130,246,0.25),rgba(99,102,241,0.20));border:1px solid rgba(99,102,241,0.25)}
[data-theme="light"] .nav-item.active{color:var(--blue)}
.nav-item i{width:16px;text-align:center;font-size:13px;opacity:.8}
.nav-badge{
  margin-left:auto;background:rgba(249,115,22,0.2);color:var(--orange);
  font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;
  border:1px solid rgba(249,115,22,0.3);
}
.nav-dot{width:6px;height:6px;border-radius:50%;background:var(--green);margin-left:auto;animation:blink 2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}

.sidebar-sep{height:1px;background:var(--border);margin:6px 10px}

.sb-footer{
  margin-top:auto;
  padding:14px 16px;
  border-top:1px solid var(--border);
}
.sb-host{font-size:11px;font-weight:600;color:var(--text);margin-bottom:3px;display:flex;align-items:center;gap:6px}
.sb-uptime{font-size:10px;color:var(--muted);display:flex;align-items:center;gap:6px}
.sb-clock{font-size:22px;font-weight:300;color:var(--text);margin-top:6px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}

/* ── TOPBAR ── */
.topbar{
  height:52px;flex-shrink:0;
  background:rgba(10,14,26,0.85);
  border-bottom:1px solid var(--border);
  backdrop-filter:blur(20px);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;
  position:relative;z-index:5;
}
[data-theme="light"] .topbar{background:rgba(255,255,255,0.85)}
.topbar-title{font-size:14px;font-weight:600;color:var(--text);letter-spacing:-.02em}
.topbar-right{display:flex;align-items:center;gap:8px}
.live-pill{
  display:flex;align-items:center;gap:5px;
  background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);
  border-radius:20px;padding:4px 10px;font-size:10px;font-weight:700;
  color:var(--green);letter-spacing:.04em;
}
.live-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:blink 1.5s infinite}
.topbar-btn{
  padding:6px 12px;border-radius:8px;border:1px solid var(--border2);
  background:var(--surface);color:var(--text2);font-family:var(--font);
  font-size:11px;font-weight:600;cursor:pointer;
  display:flex;align-items:center;gap:6px;transition:.18s;
}
.topbar-btn:hover{background:var(--surface2);color:var(--text)}
.topbar-btn.danger{border-color:rgba(239,68,68,0.2);color:rgba(239,68,68,0.7)}
.topbar-btn.danger:hover{background:rgba(239,68,68,0.1);color:var(--red)}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;z-index:1}
.content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.tab-panel{display:none;flex:1;overflow-y:auto;padding:18px;flex-direction:column;gap:14px}
.tab-panel.active{display:flex}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}

/* ── PANELS ── */
.panel{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r);
  overflow:hidden;
  backdrop-filter:blur(12px);
  transition:border-color .2s;
}
.panel:hover{border-color:var(--border2)}
.panel-hd{
  background:var(--surface2);
  border-bottom:1px solid var(--border);
  padding:11px 15px;
  font-size:11.5px;font-weight:600;color:var(--text2);
  display:flex;align-items:center;justify-content:space-between;
}
.panel-hd i{margin-right:7px;opacity:.7}
.panel-bd{padding:14px}

/* ── GRIDS ── */
.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:13px}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.grid-2{display:grid;grid-template-columns:2fr 1fr;gap:13px}
.grid-2b{display:grid;grid-template-columns:1fr 1fr;gap:13px}

/* ── INFO TABLE ── */
.info-table{width:100%;border-collapse:collapse}
.info-table tr{border-bottom:1px solid var(--border)}
.info-table tr:last-child{border-bottom:none}
.info-table td{padding:6px 4px;font-size:11.5px;vertical-align:middle}
.info-table .k{color:var(--muted);width:50%;font-weight:500;display:flex;align-items:center;gap:5px}
.info-table .v{color:var(--text);font-weight:600;text-align:right}
.kdot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}

/* ── GAUGE ── */
.gauge-wrap{display:flex;flex-direction:column;align-items:center;padding:8px 4px}
.gauge-svg{overflow:visible}
.gauge-track{fill:none;stroke:var(--border2);stroke-width:8;stroke-linecap:round}
.gauge-arc{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)}
.gauge-center{text-anchor:middle;dominant-baseline:middle}
.gauge-pct{font-family:var(--font);font-weight:700;fill:var(--text)}
.gauge-sub{font-family:var(--font);fill:var(--muted)}

/* ── PROGRESS BARS ── */
.pbar-row{margin-bottom:10px}
.pbar-row:last-child{margin-bottom:0}
.pbar-top{display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px}
.pbar-lbl{color:var(--muted);font-weight:500}
.pbar-val{color:var(--text);font-weight:600}
.pbar{height:4px;background:rgba(255,255,255,0.06);border-radius:8px;overflow:hidden}
.pbar-fill{height:100%;border-radius:8px;transition:width .9s cubic-bezier(.16,1,.3,1)}

/* ── CHART ── */
.chart-wrap{height:110px;position:relative}
canvas{width:100%!important}

/* ── CORES ── */
.cores-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(65px,1fr));gap:8px}
.core-item{text-align:center;padding:8px 4px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)}
.core-lbl{font-size:9px;color:var(--muted);margin-bottom:5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.core-bar{height:3px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;margin-bottom:5px}
.core-fill{height:100%;border-radius:3px;transition:width .5s}
.core-val{font-size:11px;font-weight:700;color:var(--text)}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse}
thead th{
  background:var(--surface2);color:var(--muted);padding:9px 12px;text-align:left;
  font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;
  border-bottom:1px solid var(--border);white-space:nowrap;
}
tbody tr{border-bottom:1px solid var(--border);transition:background .15s}
tbody tr:last-child{border-bottom:none}
tbody tr:hover{background:var(--surface2)}
tbody td{padding:9px 12px;font-size:12px}

/* ── BADGE ── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700}
.b-green{background:rgba(16,185,129,0.12);color:var(--emerald);border:1px solid rgba(16,185,129,0.2)}
.b-red{background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.2)}
.b-gray{background:rgba(100,116,139,0.1);color:var(--muted);border:1px solid rgba(100,116,139,0.2)}
.bdot{width:5px;height:5px;border-radius:50%;background:currentColor}

/* ── PM2 ── */
.pm2-strip{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pm2-kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;display:flex;align-items:center;gap:12px}
.pm2-ico{width:40px;height:40px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:18px}
.pm2-kpi-num{font-size:24px;font-weight:700;line-height:1}
.pm2-kpi-lbl{font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
.pm2-acts{display:flex;gap:4px}
.btn-xs{
  padding:4px 9px;border-radius:6px;border:1px solid var(--border);
  background:var(--surface);color:var(--text2);font-family:var(--font);
  font-size:10px;font-weight:600;cursor:pointer;transition:.15s;
  display:inline-flex;align-items:center;gap:3px;
}
.btn-xs:hover{border-color:var(--blue);color:var(--blue);background:rgba(59,130,246,0.1)}
.btn-xs.stp:hover{border-color:var(--red);color:var(--red);background:rgba(239,68,68,0.1)}
.btn-xs.rst:hover{border-color:var(--orange);color:var(--orange);background:rgba(249,115,22,0.1)}

/* ── BUTTONS ── */
.btn{
  padding:8px 14px;border-radius:9px;border:1px solid var(--border2);
  background:var(--surface);color:var(--text2);font-family:var(--font);
  font-size:12px;font-weight:600;cursor:pointer;
  display:inline-flex;align-items:center;gap:7px;transition:.18s;
}
.btn:hover{border-color:var(--indigo);color:var(--text);background:var(--surface2)}
.btn-primary{background:rgba(99,102,241,0.15);color:var(--indigo);border-color:rgba(99,102,241,0.35)}
.btn-primary:hover{background:rgba(99,102,241,0.25)}
.btn-success{background:rgba(16,185,129,0.12);color:var(--emerald);border-color:rgba(16,185,129,0.3)}
.btn-success:hover{background:rgba(16,185,129,0.22)}
.btn-danger:hover{border-color:var(--red);color:var(--red);background:rgba(239,68,68,0.1)}

/* ── FILES ── */
.files-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}
.fsec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--blue);padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
.fcnt{background:rgba(59,130,246,0.1);color:var(--blue);border:1px solid rgba(59,130,246,0.2);border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700}
.fscroll{max-height:340px;overflow-y:auto}
.frow{display:flex;align-items:center;justify-content:space-between;padding:5px 2px;font-size:11.5px;border-bottom:1px solid var(--border);transition:.15s}
.frow:last-child{border-bottom:none}
.frow:hover{color:var(--blue);padding-left:6px}
.fnm{display:flex;align-items:center;gap:7px;overflow:hidden}
.fnm i.fa-folder{color:var(--yellow)}
.fnm i.fa-file{color:var(--muted)}
.fnm-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.fsz{font-size:10px;color:var(--muted);white-space:nowrap;font-weight:600}

/* ── UPDATES ── */
.upd-console{font-family:var(--mono);font-size:11px;line-height:1.7;background:rgba(0,0,0,0.6);color:#e2e8f0;border-radius:var(--r-sm);padding:14px;height:260px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.upd-console .l-err{color:#fc8181}
.upd-console .l-done{color:#68d391;font-weight:700}
.upd-kpi-strip{display:flex;gap:10px;flex-wrap:wrap}
.upd-kpi{flex:1;min-width:120px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 18px;text-align:center}
.upd-kpi-num{font-size:30px;font-weight:700;letter-spacing:-.04em;line-height:1}
.upd-kpi-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
.upd-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(249,115,22,0.12);color:var(--orange);border:1px solid rgba(249,115,22,0.25)}

/* ── EDITOR ── */
#tab-editor{overflow:hidden!important}
.editor-wrap{display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;height:100%}
.editor-toolbar{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:11px 15px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.editor-file{font-size:13px;font-weight:600;color:var(--indigo);display:flex;align-items:center;gap:8px}
.editor-acts{display:flex;gap:8px}
.CodeMirror{flex:1;height:auto;border-radius:var(--r);font-family:var(--mono);font-size:12.5px;border:1px solid var(--border)}

/* ── CONFIG TAB ── */
.config-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.config-section{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  overflow:hidden;
}
.config-section-hd{
  background:var(--surface2);border-bottom:1px solid var(--border);
  padding:12px 16px;font-size:12px;font-weight:700;color:var(--text2);
  display:flex;align-items:center;gap:8px;
}
.config-section-hd i{opacity:.7;font-size:13px}
.config-section-bd{padding:18px}
.cfg-field{margin-bottom:16px}
.cfg-field:last-child{margin-bottom:0}
.cfg-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px;display:flex;align-items:center;gap:6px}
.cfg-input{
  width:100%;padding:10px 14px;
  background:rgba(255,255,255,0.04);border:1px solid var(--border2);
  border-radius:9px;color:var(--text);font-family:var(--font);font-size:13px;
  outline:none;transition:.2s;
}
.cfg-input:focus{border-color:var(--indigo);background:rgba(99,102,241,0.06);box-shadow:0 0 0 3px rgba(99,102,241,0.12)}
.cfg-hint{font-size:10.5px;color:var(--muted);margin-top:6px;display:flex;align-items:center;gap:5px}
.cfg-alert{
  padding:10px 14px;border-radius:9px;font-size:12px;font-weight:500;
  display:none;align-items:center;gap:8px;margin-bottom:14px;
}
.cfg-alert.success{background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);color:var(--emerald)}
.cfg-alert.error{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--red)}
.cfg-current{
  background:var(--surface2);border:1px solid var(--border);border-radius:9px;
  padding:12px 14px;margin-bottom:14px;
}
.cfg-current-row{display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;border-bottom:1px solid var(--border)}
.cfg-current-row:last-child{border-bottom:none}
.cfg-current-lbl{color:var(--muted);font-weight:500}
.cfg-current-val{color:var(--text);font-weight:600;font-family:var(--mono);font-size:11px}

/* ── TOAST ── */
#toast{
  position:fixed;bottom:20px;right:20px;
  background:rgba(15,21,37,0.95);
  backdrop-filter:blur(20px);
  border:1px solid var(--border2);border-radius:12px;
  padding:11px 16px;font-size:12px;font-weight:600;
  z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);
  transform:translateY(80px);opacity:0;
  transition:all .3s cubic-bezier(.16,1,.3,1);
  min-width:200px;display:flex;align-items:center;gap:9px;
}
#toast.show{transform:translateY(0);opacity:1}
#toast.success{border-left:3px solid var(--green)}
#toast.error{border-left:3px solid var(--red)}
#toast.info{border-left:3px solid var(--blue)}
.toast-icon{font-size:14px}

/* ── STAT CHIP ── */
.stat-chip{display:inline-flex;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:10px;font-weight:600;color:var(--muted)}

/* ── UTILS ── */
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ml-auto{margin-left:auto}
.flex{display:flex;align-items:center;gap:8px}

@media(max-width:1100px){
  .grid-5{grid-template-columns:repeat(3,1fr)}
  .grid-4{grid-template-columns:repeat(2,1fr)}
  .grid-2{grid-template-columns:1fr}
  .files-grid{grid-template-columns:1fr 1fr}
  .config-grid{grid-template-columns:1fr}
}
@media(max-width:700px){
  .sidebar{display:none}
  .grid-5,.grid-4,.grid-3{grid-template-columns:1fr}
  .files-grid{grid-template-columns:1fr}
  .config-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- SIDEBAR -->
<div class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-mark"><i class="fas fa-display"></i></div>
    <div>
      <div class="logo-text">PanelStats</div>
      <div class="logo-ver">System Monitor</div>
    </div>
  </div>

  <div class="nav-section">Système</div>
  <div class="nav-item active" onclick="switchTab('overview',this)"><i class="fas fa-border-all"></i> Overview<span class="nav-dot"></span></div>
  <div class="nav-item" onclick="switchTab('cpu',this)"><i class="fas fa-microchip"></i> CPU</div>
  <div class="nav-item" onclick="switchTab('memory',this)"><i class="fas fa-memory"></i> Memory</div>
  <div class="nav-item" onclick="switchTab('disk',this)"><i class="fas fa-hard-drive"></i> Disk Usage</div>

  <div class="sidebar-sep"></div>
  <div class="nav-section">Applications</div>
  <div class="nav-item" onclick="switchTab('pm2',this)"><i class="fas fa-rocket"></i> Projets PM2</div>
  <div class="nav-item" onclick="switchTab('files',this)"><i class="fas fa-folder-open"></i> Répertoire</div>
  <div class="nav-item" onclick="switchTab('updates',this)"><i class="fas fa-arrow-up-from-bracket"></i> Mises à jour<span id="nav-upd-badge" class="nav-badge" style="display:none"></span></div>
  <div class="nav-item" onclick="switchTab('editor',this)"><i class="fas fa-code"></i> Éditeur</div>

  <div class="sidebar-sep"></div>
  <div class="nav-section">Système</div>
  <div class="nav-item" onclick="switchTab('config',this)"><i class="fas fa-sliders"></i> Configuration</div>

  <div class="sb-footer">
    <div class="sb-host"><i class="fas fa-server" style="font-size:10px;opacity:.5"></i><span id="sb-host">—</span></div>
    <div class="sb-uptime"><i class="fas fa-clock" style="font-size:10px;opacity:.5"></i><span id="sb-uptime">—</span></div>
    <div class="sb-clock" id="sb-clock">--:--:--</div>
  </div>
</div>

<!-- MAIN -->
<div class="main">
<div class="topbar">
  <div class="topbar-title" id="topbar-title">Overview — PanelStats</div>
  <div class="topbar-right">
    <div class="live-pill"><span class="live-dot"></span>LIVE</div>
    <span class="stat-chip"><i class="fas fa-clock"></i><span id="tb-ts">—</span></span>
    <button class="topbar-btn" onclick="toggleTheme()"><i class="fas fa-moon" id="theme-icon"></i><span id="theme-label">Clair</span></button>
    <button class="topbar-btn danger" onclick="logout()"><i class="fas fa-sign-out-alt"></i>Déconnexion</button>
  </div>
</div>

<div class="content">

<!-- OVERVIEW -->
<div class="tab-panel active" id="tab-overview">
  <div class="grid-5">
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-server"></i>System Info</span></div><div class="panel-bd"><table class="info-table" id="si-sys"></table></div></div>
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-network-wired"></i>Network Info</span></div><div class="panel-bd"><table class="info-table" id="si-net"></table></div></div>
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-microchip"></i>CPU Info</span></div><div class="panel-bd"><table class="info-table" id="si-cpu"></table></div></div>
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-memory"></i>RAM Info</span></div><div class="panel-bd"><table class="info-table" id="si-mem"></table></div></div>
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-hard-drive"></i>Disk Info</span></div><div class="panel-bd"><table class="info-table" id="si-disk"></table></div></div>
  </div>
  <div class="grid-4">
    <div class="panel"><div class="panel-hd"><span>CPU Usage</span></div><div class="panel-bd"><div class="gauge-wrap"><svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90"><path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/><path class="gauge-arc" id="g-cpu" stroke="var(--blue)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/><text class="gauge-center gauge-pct" id="gv-cpu" x="70" y="62" font-size="18">0%</text><text class="gauge-center gauge-sub" id="gs-cpu" x="70" y="76" font-size="9">CPU</text></svg></div></div></div>
    <div class="panel"><div class="panel-hd"><span>RAM Usage</span></div><div class="panel-bd"><div class="gauge-wrap"><svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90"><path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/><path class="gauge-arc" id="g-mem" stroke="var(--green)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/><text class="gauge-center gauge-pct" id="gv-mem" x="70" y="56" font-size="18">0%</text><text class="gauge-center gauge-sub" id="gs-mem1" x="70" y="70" font-size="8">0 Go</text><text class="gauge-center gauge-sub" id="gs-mem2" x="70" y="80" font-size="8">Used RAM</text></svg></div></div></div>
    <div class="panel"><div class="panel-hd"><span>Disk Usage /</span></div><div class="panel-bd"><div class="gauge-wrap"><svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90"><path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/><path class="gauge-arc" id="g-disk" stroke="var(--orange)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/><text class="gauge-center gauge-pct" id="gv-disk" x="70" y="56" font-size="18">0%</text><text class="gauge-center gauge-sub" id="gs-disk1" x="70" y="70" font-size="8">0 Go</text><text class="gauge-center gauge-sub" id="gs-disk2" x="70" y="80" font-size="8">Used Space</text></svg></div></div></div>
    <div class="panel"><div class="panel-hd"><span>Swap Usage</span></div><div class="panel-bd"><div class="gauge-wrap"><svg class="gauge-svg" width="140" height="90" viewBox="0 0 140 90"><path class="gauge-track" d="M15,85 A60,60 0 0,1 125,85"/><path class="gauge-arc" id="g-swap" stroke="var(--yellow)" d="M15,85 A60,60 0 0,1 125,85" stroke-dasharray="188.5" stroke-dashoffset="188.5"/><text class="gauge-center gauge-pct" id="gv-swap" x="70" y="62" font-size="18">0%</text><text class="gauge-center gauge-sub" id="gs-swap" x="70" y="76" font-size="9">Swap</text></svg></div></div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-chart-area"></i>CPU &amp; RAM History (60s)</span><span id="chart-ts" style="font-size:10px;color:var(--muted)">—</span></div><div class="panel-bd"><div class="chart-wrap"><canvas id="chartMain"></canvas></div></div></div>
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-gauge-high"></i>System Load</span></div><div class="panel-bd" id="load-panel"></div></div>
  </div>
  <div class="grid-3">
    <div class="panel"><div class="panel-hd"><span>Disk Usage (GiB)</span></div><div class="panel-bd" id="disk-bars"></div></div>
    <div class="panel"><div class="panel-hd"><span>Network I/O</span></div><div class="panel-bd" id="net-panel"></div></div>
    <div class="panel"><div class="panel-hd"><span>Top Processes (RAM)</span></div><div class="panel-bd" id="proc-panel"></div></div>
  </div>
</div>

<!-- CPU -->
<div class="tab-panel" id="tab-cpu">
  <div class="grid-2b">
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-microchip"></i>CPU Usage History</span></div><div class="panel-bd"><div class="chart-wrap" style="height:150px"><canvas id="chartCpu2"></canvas></div></div></div>
    <div class="panel"><div class="panel-hd"><span>Cœurs individuels</span></div><div class="panel-bd"><div class="cores-grid" id="cores-grid"></div></div></div>
  </div>
  <div class="panel"><div class="panel-hd"><span>Informations CPU</span></div><div class="panel-bd"><table class="info-table" id="cpu-detail"></table></div></div>
</div>

<!-- MEMORY -->
<div class="tab-panel" id="tab-memory">
  <div class="grid-2b">
    <div class="panel"><div class="panel-hd"><span><i class="fas fa-memory"></i>RAM History</span></div><div class="panel-bd"><div class="chart-wrap" style="height:150px"><canvas id="chartMem2"></canvas></div></div></div>
    <div class="panel"><div class="panel-hd"><span>Utilisation mémoire</span></div><div class="panel-bd" id="mem-detail"></div></div>
  </div>
</div>

<!-- DISK -->
<div class="tab-panel" id="tab-disk">
  <div class="grid-2b">
    <div class="panel"><div class="panel-hd"><span>Disk Usage (GiB)</span></div><div class="panel-bd" id="disk-detail-gib"></div></div>
    <div class="panel"><div class="panel-hd"><span>Disk Usage (%)</span></div><div class="panel-bd" id="disk-detail-pct"></div></div>
  </div>
</div>

<!-- PM2 -->
<div class="tab-panel" id="tab-pm2">
  <div class="pm2-strip">
    <div class="pm2-kpi"><div class="pm2-ico" style="color:var(--blue)"><i class="fas fa-cubes"></i></div><div><div class="pm2-kpi-num" id="pm2-total">—</div><div class="pm2-kpi-lbl">Total</div></div></div>
    <div class="pm2-kpi"><div class="pm2-ico" style="color:var(--green)"><i class="fas fa-circle-check"></i></div><div><div class="pm2-kpi-num" id="pm2-online" style="color:var(--green)">—</div><div class="pm2-kpi-lbl">En ligne</div></div></div>
    <div class="pm2-kpi"><div class="pm2-ico" style="color:var(--red)"><i class="fas fa-circle-xmark"></i></div><div><div class="pm2-kpi-num" id="pm2-offline" style="color:var(--red)">—</div><div class="pm2-kpi-lbl">Arrêtés</div></div></div>
    <div class="ml-auto"><button class="btn" onclick="loadPm2()"><i class="fas fa-sync"></i>Actualiser</button></div>
  </div>
  <div class="panel">
    <div class="panel-hd"><span><i class="fas fa-table"></i>Projets</span></div>
    <div style="overflow-x:auto"><table><thead><tr><th>ID</th><th>Nom</th><th>Statut</th><th>Uptime</th><th>CPU</th><th>RAM</th><th>Restart</th><th>PID</th><th>Port</th><th>Actions</th></tr></thead><tbody id="pm2-tbody"><tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)"><i class="fas fa-spinner spin"></i></td></tr></tbody></table></div>
  </div>
  <div class="panel"><div class="panel-hd"><span>Scripts</span></div><div style="overflow-x:auto"><table><thead><tr><th>Nom</th><th>Chemin</th><th style="text-align:right">Port</th></tr></thead><tbody id="pm2-scripts"></tbody></table></div></div>
</div>

<!-- FICHIERS -->
<div class="tab-panel" id="tab-files">
  <div class="panel">
    <div class="panel-hd"><span><i class="fas fa-clock-rotate-left"></i>Quota /timeshift</span><button class="btn" onclick="loadTimeshift()" style="padding:5px 10px;font-size:10px"><i class="fas fa-sync"></i>Actualiser</button></div>
    <div class="panel-bd" id="timeshift-panel"><div style="color:var(--muted);text-align:center;padding:10px"><i class="fas fa-spinner spin"></i></div></div>
  </div>
  <div class="panel" style="flex:1">
    <div class="panel-hd"><span><i class="fas fa-folder-open"></i>Répertoire surveillé</span><button class="btn" onclick="loadFiles()" style="padding:5px 10px;font-size:10px"><i class="fas fa-sync"></i>Actualiser</button></div>
    <div class="panel-bd"><div class="files-grid" id="files-grid"><div style="color:var(--muted);padding:20px;text-align:center"><i class="fas fa-spinner spin"></i></div></div></div>
  </div>
</div>

<!-- MISES À JOUR -->
<div class="tab-panel" id="tab-updates">
  <div class="upd-kpi-strip">
    <div class="upd-kpi"><div class="upd-kpi-num" id="upd-count" style="color:var(--orange)">—</div><div class="upd-kpi-lbl">Paquets à mettre à jour</div></div>
    <div class="upd-kpi" style="flex:3;text-align:left;display:flex;align-items:center;gap:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="btn-upd-refresh" onclick="loadUpdates()"><i class="fas fa-sync"></i>Vérifier</button>
        <button class="btn" id="btn-apt-fetch" onclick="runApt('fetch')"><i class="fas fa-download"></i>apt-get update</button>
        <button class="btn btn-primary" id="btn-apt-upgrade" onclick="runApt('upgrade')"><i class="fas fa-arrow-up"></i>apt-get upgrade</button>
      </div>
      <span id="upd-ts" style="font-size:10px;color:var(--muted);margin-left:auto"></span>
    </div>
  </div>
  <div class="panel"><div class="panel-hd"><span><i class="fas fa-boxes-stacked"></i>Paquets disponibles</span><span id="upd-list-count" style="font-size:10px;color:var(--muted)"></span></div><div style="overflow-x:auto;max-height:260px;overflow-y:auto"><table><thead><tr><th>Paquet</th><th>Version actuelle</th><th>Nouvelle version</th></tr></thead><tbody id="upd-tbody"><tr><td colspan="3" style="text-align:center;padding:22px;color:var(--muted)"><i class="fas fa-spinner spin"></i></td></tr></tbody></table></div></div>
  <div class="panel"><div class="panel-hd"><span><i class="fas fa-terminal"></i>Console</span><div style="display:flex;gap:6px;align-items:center"><span id="upd-console-status" style="font-size:10px;color:var(--muted)">En attente</span><button class="btn" style="padding:4px 9px;font-size:10px" onclick="clearConsole()"><i class="fas fa-trash"></i></button></div></div><div class="panel-bd" style="padding:0"><div class="upd-console" id="upd-console">Aucune commande lancée.</div></div></div>
</div>

<!-- ÉDITEUR -->
<div class="tab-panel" id="tab-editor">
  <div class="editor-wrap">
    <div class="editor-toolbar">
      <div class="editor-file"><i class="fas fa-file-code"></i><strong>server.js</strong><span style="font-size:10px;color:var(--muted);font-weight:400">— édition en direct</span></div>
      <div class="editor-acts">
        <button class="btn" onclick="editorLoad()"><i class="fas fa-download"></i>Recharger</button>
        <button class="btn btn-primary" onclick="editorSave()"><i class="fas fa-save"></i>Enregistrer</button>
        <button class="btn btn-danger" onclick="editorRestart()"><i class="fas fa-rotate-right"></i>Redémarrer PM2</button>
      </div>
    </div>
    <textarea id="code-area" spellcheck="false" placeholder="Chargement..."></textarea>
  </div>
</div>

<!-- ══ CONFIGURATION ══ -->
<div class="tab-panel" id="tab-config">

  <div class="config-grid">

    <!-- Carte : Identifiants -->
    <div class="config-section">
      <div class="config-section-hd"><i class="fas fa-user-shield"></i>Identifiants de connexion</div>
      <div class="config-section-bd">
        <div class="cfg-alert" id="cfg-alert-creds"><i class="fas fa-circle-check"></i><span id="cfg-alert-creds-txt"></span></div>
        <div class="cfg-current" id="cfg-current-creds">
          <div class="cfg-current-row"><span class="cfg-current-lbl">Utilisateur actuel</span><span class="cfg-current-val" id="cfg-cur-user">—</span></div>
          <div class="cfg-current-row"><span class="cfg-current-lbl">Mot de passe</span><span class="cfg-current-val">••••••••</span></div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label"><i class="fas fa-user" style="opacity:.5"></i>Nouvel identifiant</div>
          <input type="text" class="cfg-input" id="cfg-user" placeholder="Laisser vide pour ne pas changer" autocomplete="off">
        </div>
        <div class="cfg-field">
          <div class="cfg-label"><i class="fas fa-lock" style="opacity:.5"></i>Nouveau mot de passe</div>
          <input type="password" class="cfg-input" id="cfg-newpass" placeholder="Laisser vide pour ne pas changer" autocomplete="new-password">
          <div class="cfg-hint"><i class="fas fa-shield-halved"></i>Minimum 6 caractères recommandés</div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label" style="color:var(--red)"><i class="fas fa-key" style="opacity:.7"></i>Mot de passe actuel <span style="color:var(--red)">(obligatoire)</span></div>
          <input type="password" class="cfg-input" id="cfg-curpass" placeholder="Votre mot de passe actuel" autocomplete="current-password" style="border-color:rgba(239,68,68,0.3)">
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="saveCreds()"><i class="fas fa-save"></i>Sauvegarder les identifiants</button>
      </div>
    </div>

    <!-- Carte : Serveur -->
    <div class="config-section">
      <div class="config-section-hd"><i class="fas fa-server"></i>Paramètres serveur</div>
      <div class="config-section-bd">
        <div class="cfg-alert" id="cfg-alert-srv"><i class="fas fa-circle-check"></i><span id="cfg-alert-srv-txt"></span></div>
        <div class="cfg-current">
          <div class="cfg-current-row"><span class="cfg-current-lbl">Répertoire surveillé</span><span class="cfg-current-val" id="cfg-cur-dir">—</span></div>
          <div class="cfg-current-row"><span class="cfg-current-lbl">Dossier Timeshift</span><span class="cfg-current-val" id="cfg-cur-timeshift">—</span></div>
          <div class="cfg-current-row"><span class="cfg-current-lbl">Port HTTP</span><span class="cfg-current-val" id="cfg-cur-port">—</span></div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label"><i class="fas fa-folder-open" style="opacity:.5"></i>Répertoire à surveiller</div>
          <input type="text" class="cfg-input" id="cfg-dir" placeholder="/home/fredo" autocomplete="off">
          <div class="cfg-hint"><i class="fas fa-info-circle"></i>Chemin absolu affiché dans l'onglet Répertoire</div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label"><i class="fas fa-clock-rotate-left" style="opacity:.5"></i>Dossier Timeshift</div>
          <input type="text" class="cfg-input" id="cfg-timeshift" placeholder="/mnt/usb-.../timeshift" autocomplete="off">
          <div class="cfg-hint"><i class="fas fa-info-circle"></i>Chemin absolu du dossier Timeshift à surveiller</div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label"><i class="fas fa-plug" style="opacity:.5"></i>Port HTTP</div>
          <input type="number" class="cfg-input" id="cfg-port" placeholder="3000" min="1" max="65535" autocomplete="off">
          <div class="cfg-hint"><i class="fas fa-triangle-exclamation" style="color:var(--orange)"></i>Redémarrage nécessaire pour appliquer</div>
        </div>
        <div class="cfg-field">
          <div class="cfg-label" style="color:var(--red)"><i class="fas fa-key" style="opacity:.7"></i>Mot de passe actuel <span style="color:var(--red)">(obligatoire)</span></div>
          <input type="password" class="cfg-input" id="cfg-curpass2" placeholder="Votre mot de passe actuel" autocomplete="current-password" style="border-color:rgba(239,68,68,0.3)">
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" style="flex:1" onclick="saveSrv()"><i class="fas fa-save"></i>Sauvegarder</button>
          <button class="btn btn-danger" onclick="restartAfterSave()"><i class="fas fa-rotate-right"></i>Redémarrer PM2</button>
        </div>
      </div>
    </div>

  </div>

  <!-- Carte : Infos fichier config -->
  <div class="panel">
    <div class="panel-hd"><span><i class="fas fa-file-shield"></i>Fichier de configuration</span></div>
    <div class="panel-bd">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <div style="text-align:center;padding:12px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Fichier</div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--cyan)">panelstats.config.json</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Persistance</div>
          <div style="font-size:12px;color:var(--green)"><i class="fas fa-circle-check"></i> Sauvegardé sur disque</div>
        </div>
        <div style="text-align:center;padding:12px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Chiffrement MDP</div>
          <div style="font-size:12px;color:var(--orange)"><i class="fas fa-shield"></i> Stocké en clair (JSON)</div>
        </div>
      </div>
      <div style="margin-top:12px;padding:10px 14px;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:9px;font-size:11.5px;color:var(--text2)">
        <i class="fas fa-circle-info" style="color:var(--blue);margin-right:7px"></i>
        La configuration est persistante et survit aux redémarrages. Le port ne prend effet qu'après redémarrage du processus PM2.
      </div>
    </div>
  </div>
</div>

</div><!-- /content -->
</div><!-- /main -->

<div id="toast"></div>

<script>
// ── THEME ─────────────────────────────────────────────
var currentTheme = localStorage.getItem('ps-theme') || 'dark';
var editor = null;

function applyTheme(t) {
  currentTheme = t;
  var icon = document.getElementById('theme-icon');
  var label = document.getElementById('theme-label');
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme','light');
    if (icon) icon.className = 'fas fa-moon';
    if (label) label.textContent = 'Sombre';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (icon) icon.className = 'fas fa-sun';
    if (label) label.textContent = 'Clair';
  }
  localStorage.setItem('ps-theme', t);
  if (editor) editor.setOption('theme', t === 'light' ? 'eclipse' : 'dracula');
  setTimeout(function() { drawChartDual('chartMain', histCpu, histMem); }, 50);
}
function toggleTheme() { applyTheme(currentTheme === 'light' ? 'dark' : 'light'); }
applyTheme(currentTheme);

// ── TOAST ──────────────────────────────────────────────
function toast(msg, type, icon) {
  type = type || 'info';
  var icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  var t = document.getElementById('toast');
  t.innerHTML = '<i class="fas ' + (icon || icons[type] || icons.info) + ' toast-icon"></i>' + msg;
  t.className = 'show ' + type;
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.className = ''; }, 3500);
}

// ── FORMATTERS ────────────────────────────────────────
function fmtB(b) {
  if (!b) return '0 o';
  var k=1024, s=['o','Ko','Mo','Go','To'], i=Math.floor(Math.log(b)/Math.log(k));
  return (b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}
function fmtBG(b) { return b ? (b/1073741824).toFixed(1)+' GiB' : '0'; }

// ── TABS ───────────────────────────────────────────────
var pm2Loaded=false, filesLoaded=false, updLoaded=false, editorLoaded=false, configLoaded=false;
var tabTitles = {
  overview:'Overview', cpu:'CPU', memory:'Memory', disk:'Disk Usage',
  pm2:'Projets PM2', files:'Répertoire', updates:'Mises à jour',
  editor:'Éditeur server.js', config:'Configuration'
};

function switchTab(key, el) {
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.getElementById('tab-'+key).classList.add('active');
  document.getElementById('topbar-title').textContent = (tabTitles[key]||key) + ' — PanelStats';
  if (key==='pm2'    && !pm2Loaded)    { pm2Loaded=true;    loadPm2(); }
  if (key==='files'  && !filesLoaded)  { filesLoaded=true;  loadFiles(); loadTimeshift(); }
  if (key==='updates'&& !updLoaded)    { updLoaded=true;    loadUpdates(); }
  if (key==='editor' && !editorLoaded) { initCodeMirror(); editorLoad(); }
  if (key==='config' && !configLoaded) { configLoaded=true; loadConfigPanel(); }
  if (key==='cpu')    drawChartSingle('chartCpu2', histCpu, 'var(--blue)');
  if (key==='memory') drawChartSingle('chartMem2', histMem, 'var(--green)');
}

// ── CLOCK ──────────────────────────────────────────────
setInterval(function() {
  var t = new Date().toLocaleTimeString('fr-FR');
  document.getElementById('sb-clock').textContent = t;
  document.getElementById('tb-ts').textContent    = t;
}, 1000);

// ── GAUGE ──────────────────────────────────────────────
var ARC = 188.5;
function setGauge(id, pct) {
  var el = document.getElementById('g-'+id);
  if (el) el.style.strokeDashoffset = ARC * (1 - pct/100);
}

// ── INFO TABLE HELPERS ────────────────────────────────
function infoRow(key, val, color) {
  color = color || 'var(--blue)';
  return '<tr><td class="k"><span class="kdot" style="background:'+color+'"></span>'+key+'</td><td class="v">'+val+'</td></tr>';
}
function pbarRow(lbl, val, pct, color) {
  pct = Math.min(Math.max(parseFloat(pct)||0,0),100);
  return '<div class="pbar-row">'+
    '<div class="pbar-top"><span class="pbar-lbl">'+lbl+'</span><span class="pbar-val">'+val+'</span></div>'+
    '<div class="pbar"><div class="pbar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
    '</div>';
}

// ── API FETCH ─────────────────────────────────────────
function apiFetch(url, opts) {
  opts = opts || {};
  opts.credentials = 'same-origin';
  return fetch(url, opts).then(function(r) {
    if (r.status === 401) { location.reload(); throw new Error('Session expirée'); }
    return r;
  });
}

// ── RENDER STATS ──────────────────────────────────────
var lastStats = null;
function renderStats(s) {
  lastStats = s;
  setGauge('cpu',  s.cpu.percent);    document.getElementById('gv-cpu').textContent  = s.cpu.percent+'%';
  setGauge('mem',  s.memory.percent); document.getElementById('gv-mem').textContent  = s.memory.percent+'%';
  document.getElementById('gs-mem1').textContent = fmtBG(s.memory.used);
  setGauge('disk', s.disk.percent);   document.getElementById('gv-disk').textContent = s.disk.percent+'%';
  document.getElementById('gs-disk1').textContent = fmtBG(s.disk.used);
  setGauge('swap', s.swap.percent);   document.getElementById('gv-swap').textContent = s.swap.percent+'%';
  document.getElementById('sb-uptime').textContent = s.uptime.formatted;
  document.getElementById('sb-host').textContent   = s.system.hostname;

  document.getElementById('si-sys').innerHTML =
    infoRow('OS',           s.system.platform, 'var(--yellow)') +
    infoRow('Kernel',       s.system.kernel||'—', 'var(--yellow)') +
    infoRow('Architecture', s.system.arch,    'var(--yellow)') +
    infoRow('Hostname',     s.system.hostname,'var(--yellow)') +
    infoRow('Uptime',       s.uptime.formatted,'var(--yellow)');
  document.getElementById('si-net').innerHTML =
    infoRow('Download (total)', fmtB(s.network.rx), 'var(--cyan)') +
    infoRow('Upload (total)',   fmtB(s.network.tx), 'var(--cyan)') +
    infoRow('Load avg 1m',     s.load.avg1, 'var(--cyan)') +
    infoRow('Load avg 5m',     s.load.avg5, 'var(--cyan)') +
    infoRow('Load avg 15m',    s.load.avg15,'var(--cyan)');
  var model = (s.cpu.model||'').split('@');
  document.getElementById('si-cpu').innerHTML =
    infoRow('Cœurs',      s.cpu.cores,                   'var(--orange)') +
    infoRow('Modèle',     model[0].trim().substring(0,22),'var(--orange)') +
    infoRow('Fréquence',  model[1]?model[1].trim():'—',  'var(--orange)') +
    infoRow('Température',s.cpu.temp?s.cpu.temp+' °C':'—','var(--orange)') +
    infoRow('Utilisation',s.cpu.percent+'%',              'var(--orange)');
  document.getElementById('si-mem').innerHTML =
    infoRow('Total RAM',   fmtBG(s.memory.total),'var(--green)') +
    infoRow('Utilisé',     fmtBG(s.memory.used), 'var(--green)') +
    infoRow('Libre',       fmtBG(s.memory.free), 'var(--green)') +
    infoRow('Utilisation', s.memory.percent+'%', 'var(--green)') +
    infoRow('Swap',        fmtB(s.swap.used)+' / '+fmtB(s.swap.total),'var(--green)');
  document.getElementById('si-disk').innerHTML =
    infoRow('Total',       fmtBG(s.disk.total),            'var(--blue)') +
    infoRow('Utilisé',     fmtBG(s.disk.used),             'var(--blue)') +
    infoRow('Libre',       fmtBG(s.disk.total-s.disk.used),'var(--blue)') +
    infoRow('Utilisation', s.disk.percent+'%',             'var(--blue)');
  var c = s.cpu.cores||1;
  document.getElementById('load-panel').innerHTML =
    pbarRow('Load 1m',  s.load.avg1,  (s.load.avg1/c)*100, 'var(--blue)') +
    pbarRow('Load 5m',  s.load.avg5,  (s.load.avg5/c)*100, 'var(--green)') +
    pbarRow('Load 15m', s.load.avg15, (s.load.avg15/c)*100,'var(--yellow)') +
    pbarRow('CPU',      s.cpu.percent+'%',    s.cpu.percent,    'var(--blue)') +
    pbarRow('RAM',      s.memory.percent+'%', s.memory.percent, 'var(--green)');
  var dclr = ['var(--orange)','var(--violet)','var(--cyan)','var(--pink)','var(--green)'];
  var dh='', dg='', dp='';
  if (s.allDisks && s.allDisks.length) {
    s.allDisks.forEach(function(d,i){
      var clr=dclr[i%dclr.length], l=d.mount+(d.device?' ('+d.device.replace('/dev/','')+')':"");
      dh += pbarRow(l, fmtBG(d.used), d.percent, clr);
      dg += pbarRow(l, fmtBG(d.used)+' / '+fmtBG(d.total), d.percent, clr);
      dp += pbarRow(l, d.percent+'%', d.percent, clr);
    });
  } else {
    dh = pbarRow('/ (racine)', fmtBG(s.disk.used), s.disk.percent, 'var(--orange)');
    dg = pbarRow('/ (racine)', fmtBG(s.disk.used)+' / '+fmtBG(s.disk.total), s.disk.percent, 'var(--orange)');
    dp = pbarRow('/ (racine)', s.disk.percent+'%', s.disk.percent, 'var(--orange)');
  }
  dh += pbarRow('Swap', fmtB(s.swap.used), s.swap.percent, 'var(--yellow)');
  document.getElementById('disk-bars').innerHTML       = dh;
  document.getElementById('disk-detail-gib').innerHTML = dg;
  document.getElementById('disk-detail-pct').innerHTML = dp;
  document.getElementById('net-panel').innerHTML =
    pbarRow('Rx (reçu)',   fmtB(s.network.rx), Math.min((s.network.rx/1073741824)*5,100),'var(--cyan)') +
    pbarRow('Tx (envoyé)', fmtB(s.network.tx), Math.min((s.network.tx/1073741824)*5,100),'var(--teal)');
  document.getElementById('proc-panel').innerHTML = (s.processes||[]).map(function(p){
    return pbarRow(p.name, p.mem+'%', Math.min(parseFloat(p.mem)*4,100),'var(--violet)');
  }).join('');
  document.getElementById('cpu-detail').innerHTML =
    infoRow('Modèle',       (s.cpu.model||'N/A').substring(0,32),'var(--blue)') +
    infoRow('Cœurs',        s.cpu.cores,     'var(--blue)') +
    infoRow('Utilisation',  s.cpu.percent+'%','var(--blue)') +
    infoRow('Température',  s.cpu.temp?s.cpu.temp+' °C':'—','var(--blue)') +
    infoRow('Load avg 1m',  s.load.avg1, 'var(--blue)') +
    infoRow('Load avg 5m',  s.load.avg5, 'var(--blue)') +
    infoRow('Load avg 15m', s.load.avg15,'var(--blue)');
  document.getElementById('cores-grid').innerHTML = (s.cpu.perCore||[]).map(function(p,i){
    return '<div class="core-item"><div class="core-lbl">Core '+i+'</div>'+
      '<div class="core-bar"><div class="core-fill" style="width:'+p+'%;background:var(--blue)"></div></div>'+
      '<div class="core-val">'+p+'%</div></div>';
  }).join('');
  document.getElementById('mem-detail').innerHTML =
    pbarRow('RAM utilisée', fmtBG(s.memory.used), s.memory.percent,     'var(--green)') +
    pbarRow('RAM libre',    fmtBG(s.memory.free), 100-s.memory.percent, 'var(--emerald)') +
    pbarRow('Swap utilisé', fmtB(s.swap.used),    s.swap.percent,       'var(--yellow)');
}

async function loadStats() {
  try {
    var s = await apiFetch('/api/stats').then(function(r){ return r.json(); });
    renderStats(s);
  } catch(e) {}
}

// ── GRAPHIQUES ────────────────────────────────────────
var histCpu=[], histMem=[];
function initCanvas(id, h) {
  var c = document.getElementById(id); if (!c) return null;
  var ctx = c.getContext('2d');
  c.width  = c.offsetWidth * devicePixelRatio;
  c.height = (h||110) * devicePixelRatio;
  c.style.height = (h||110)+'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);
  return ctx;
}
function drawChartDual(id, dataCpu, dataMem) {
  var c = document.getElementById(id); if (!c) return;
  var ctx=c.getContext('2d'), W=c.offsetWidth, H=parseInt(c.style.height)||110;
  ctx.clearRect(0,0,W,H);
  var MAX=60, pT=14, pB=4, range=H-pT-pB;
  var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  var gc = isDark?'rgba(255,255,255,0.05)':'rgba(99,102,241,0.08)';
  var lc = isDark?'rgba(255,255,255,0.2)' :'rgba(99,102,241,0.35)';
  ctx.strokeStyle=gc; ctx.lineWidth=1;
  [25,50,75].forEach(function(y){
    var yp=pT+range*(1-y/100);
    ctx.beginPath();ctx.moveTo(0,yp);ctx.lineTo(W,yp);ctx.stroke();
    ctx.fillStyle=lc;ctx.font='8px -apple-system,sans-serif';ctx.fillText(y+'%',3,yp-2);
  });
  function line(data, strokeClr, rgb) {
    if (data.length<2) return;
    var step=W/(MAX-1);
    ctx.beginPath();
    data.forEach(function(v,i){var x=(MAX-data.length+i)*step,y=pT+range*(1-v/100);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    var x0=(MAX-data.length)*step,xN=(MAX-1)*step;
    ctx.lineTo(xN,H-pB);ctx.lineTo(x0,H-pB);ctx.closePath();
    var g=ctx.createLinearGradient(0,pT,0,H);
    g.addColorStop(0,'rgba('+rgb+',.22)');g.addColorStop(1,'rgba('+rgb+',0)');
    ctx.fillStyle=g;ctx.fill();
    ctx.beginPath();
    data.forEach(function(v,i){var x=(MAX-data.length+i)*step,y=pT+range*(1-v/100);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.strokeStyle=strokeClr;ctx.lineWidth=1.8;ctx.stroke();
  }
  line(dataMem,'#10b981','16,185,129');
  line(dataCpu,'#3b82f6','59,130,246');
  ctx.font='9px -apple-system,sans-serif';
  ctx.fillStyle='#3b82f6'; ctx.fillText('● CPU',W-88,11);
  ctx.fillStyle='#10b981'; ctx.fillText('● RAM',W-46,11);
}
function drawChartSingle(id, data, clr) {
  var c=document.getElementById(id); if (!c) return;
  var W=c.offsetWidth, H=parseInt(c.style.height)||150;
  if (!c.dataset.init) {
    c.width=W*devicePixelRatio;c.height=H*devicePixelRatio;
    c.style.height=H+'px';c.getContext('2d').scale(devicePixelRatio,devicePixelRatio);
    c.dataset.init=1;
  }
  var ctx=c.getContext('2d'); ctx.clearRect(0,0,W,H);
  drawChartDual(id, data, []);
}
async function loadHistory() {
  try {
    var h = await apiFetch('/api/history').then(function(r){return r.json();});
    histCpu=h.cpu; histMem=h.mem;
    document.getElementById('chart-ts').textContent = new Date().toLocaleTimeString('fr-FR');
    drawChartDual('chartMain', histCpu, histMem);
  } catch(e) {}
}

// ── PM2 ───────────────────────────────────────────────
async function loadPm2() {
  document.getElementById('pm2-tbody').innerHTML='<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)"><i class="fas fa-spinner spin"></i></td></tr>';
  try {
    var d=await apiFetch('/api/pm2').then(function(r){return r.json();});
    document.getElementById('pm2-total').textContent   = d.total;
    document.getElementById('pm2-online').textContent  = d.online;
    document.getElementById('pm2-offline').textContent = d.total-d.online;
    if (d.error&&d.total===0){document.getElementById('pm2-tbody').innerHTML='<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--red)">'+d.error+'</td></tr>';return;}
    document.getElementById('pm2-tbody').innerHTML=(d.projects||[]).map(function(p){
      var bc=p.status==='online'?'b-green':(p.status==='stopped'?'b-gray':'b-red');
      return '<tr><td><strong>#'+p.id+'</strong></td><td><strong>'+p.name+'</strong></td>'+
        '<td><span class="badge '+bc+'"><span class="bdot"></span>'+p.status+'</span></td>'+
        '<td>'+p.uptimeFormatted+'</td><td>'+p.cpu+'%</td><td>'+p.memFormatted+'</td>'+
        '<td style="text-align:center">'+p.restarts+'</td><td>'+p.pid+'</td>'+
        '<td>'+(p.port&&p.port!=='—'?'<a href="http://localhost:'+p.port+'" target="_blank" style="color:var(--cyan);font-family:var(--mono);font-size:11px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px" title="Ouvrir '+p.name+' sur :'+p.port+'"><i class="fas fa-arrow-up-right-from-square" style="font-size:9px;opacity:.7"></i>:'+p.port+'</a>':'<span style="color:var(--muted)">—</span>')+'</td>'+
        '<td><div class="pm2-acts">'+
        '<button class="btn-xs pm2-btn" data-action="start" data-id="'+p.id+'"><i class="fas fa-play"></i></button>'+
        '<button class="btn-xs stp pm2-btn" data-action="stop" data-id="'+p.id+'"><i class="fas fa-stop"></i></button>'+
        '<button class="btn-xs rst pm2-btn" data-action="restart" data-id="'+p.id+'"><i class="fas fa-rotate-right"></i></button>'+
        '</div></td></tr>';
    }).join('')||'<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--muted)">Aucun projet</td></tr>';
    document.getElementById('pm2-scripts').innerHTML=(d.projects||[]).map(function(p){
      var nameCell = p.port&&p.port!=='—'
        ? '<a href="http://localhost:'+p.port+'" target="_blank" style="color:var(--cyan);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:5px" title="http://localhost:'+p.port+'">'+p.name+' <i class="fas fa-external-link-alt" style="font-size:9px;opacity:.6"></i></a>'
        : '<strong>'+p.name+'</strong>';
      var portCell = p.port&&p.port!=='—'
        ? '<a href="http://localhost:'+p.port+'" target="_blank" style="font-family:var(--mono);font-size:10px;color:var(--cyan);background:rgba(6,182,212,0.1);padding:2px 8px;border-radius:5px;border:1px solid rgba(6,182,212,0.25);text-decoration:none;white-space:nowrap" title="http://localhost:'+p.port+'">:'+p.port+'</a>'
        : '<span style="color:var(--muted);font-size:10px">—</span>';
      return '<tr><td>'+nameCell+'</td><td style="font-size:10px;color:var(--muted);font-family:var(--mono)">'+p.script+'</td><td style="text-align:right">'+portCell+'</td></tr>';
    }).join('');
  } catch(e){document.getElementById('pm2-tbody').innerHTML='<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--red)">Erreur : '+e.message+'</td></tr>';}
}
async function pm2Action(action, id) {
  document.querySelectorAll('.pm2-btn[data-id="'+id+'"]').forEach(function(b){b.disabled=true;});
  toast('PM2 '+action+' #'+id+'...','info');
  try {
    var r=await apiFetch('/api/pm2/'+action+'/'+id,{method:'POST'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json(); toast(d.message||'OK','success');
    setTimeout(loadPm2,1200);
  } catch(e){ toast('Erreur : '+e.message,'error'); document.querySelectorAll('.pm2-btn[data-id="'+id+'"]').forEach(function(b){b.disabled=false;}); }
}

// ── FICHIERS ──────────────────────────────────────────
async function loadFiles() {
  try {
    var d=await apiFetch('/api/files').then(function(r){return r.json();});
    var secs=[{key:'dossiers',title:'Dossiers'},{key:'fichiers',title:'Fichiers'},{key:'caches',title:'Cachés'}];
    document.getElementById('files-grid').innerHTML=secs.map(function(s){
      var items=(d[s.key]||[]).sort(function(a,b){return b.sizeRaw-a.sizeRaw;});
      if(!items.length) return '';
      return '<div><div class="fsec-title"><span>'+s.title+'</span><span class="fcnt">'+items.length+'</span></div>'+
        '<div class="fscroll">'+items.map(function(f){
          return '<div class="frow"><div class="fnm"><i class="fas '+f.icon+'"></i><span class="fnm-txt" title="'+f.name+'">'+f.name+'</span></div><span class="fsz">'+f.sizeFormatted+'</span></div>';
        }).join('')+'</div></div>';
    }).join('');
  } catch(e){toast('Erreur fichiers','error');}
}

// ── TIMESHIFT ─────────────────────────────────────────
async function loadTimeshift() {
  var el=document.getElementById('timeshift-panel'); if(!el) return;
  el.innerHTML='<div style="color:var(--muted);text-align:center;padding:10px"><i class="fas fa-spinner spin"></i></div>';
  try {
    var d=await apiFetch('/api/timeshift').then(function(r){return r.json();});
    if(d.error){el.innerHTML='<p style="color:var(--red);padding:10px">'+d.error+'</p>';return;}
    var fs=d.filesystem,pct=fs.percent||0;
    var bc=pct<60?'var(--green)':pct<85?'var(--orange)':'var(--red)';
    el.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">'+
      '<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--blue)">'+d.dirSizeFormatted+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Taille /timeshift</div></div>'+
      '<div style="text-align:center"><div style="font-size:22px;font-weight:700">'+fmtB(fs.total)+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Partition totale</div></div>'+
      '<div style="text-align:center"><div style="font-size:22px;font-weight:700">'+fmtB(fs.free)+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Libre</div></div>'+
      '<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:'+(d.snapshotCount>0?'var(--violet)':'var(--muted)')+'">'+d.snapshotCount+'</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Snapshots</div></div>'+
      '</div>'+
      '<div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:11px;color:var(--muted)"><span>Partition <strong style="color:var(--text)">'+(fs.mount||'/timeshift')+'</strong></span><span style="font-weight:700;color:'+bc+'">'+pct+'%</span></div>'+
      '<div style="height:6px;border-radius:4px;background:var(--border);overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+bc+';border-radius:4px;transition:width .4s"></div></div>'+
      '<div style="margin-top:6px;font-size:10px;color:var(--muted);text-align:right">'+fmtB(fs.used)+' / '+fmtB(fs.total)+'</div>';
  } catch(e){el.innerHTML='<p style="color:var(--red);padding:10px">Erreur : '+e.message+'</p>';}
}

// ── ÉDITEUR ───────────────────────────────────────────
function initCodeMirror() {
  if (editor) return;
  var ta=document.getElementById('code-area'); if(!ta) return;
  editor=CodeMirror.fromTextArea(ta,{
    lineNumbers:true,mode:'javascript',
    theme:currentTheme==='light'?'eclipse':'dracula',
    tabSize:2,indentWithTabs:false,lineWrapping:true
  });
  editor.setOption('extraKeys',{'Ctrl-S':function(){editorSave();},'Cmd-S':function(){editorSave();}});
}
async function editorLoad() {
  try {
    var d=await apiFetch('/api/editor').then(function(r){return r.json();});
    initCodeMirror();
    if(editor) editor.setValue(d.content);
    else document.getElementById('code-area').value=d.content;
    editorLoaded=true;
    toast('Fichier chargé','success');
  } catch(e){toast('Erreur chargement','error');}
}
async function editorSave() {
  var content=editor?editor.getValue():document.getElementById('code-area').value;
  try {
    await apiFetch('/api/editor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})});
    toast('Fichier sauvegardé !','success');
  } catch(e){toast('Erreur sauvegarde','error');}
}
function editorRestart() {
  if(!confirm('PM2 va redémarrer. Continuer ?')) return;
  apiFetch('/api/restart',{method:'POST'})
    .then(function(){toast('Redémarrage envoyé…','info');setTimeout(function(){location.reload();},4000);})
    .catch(function(){toast('Erreur','error');});
}

// ── MISES À JOUR ──────────────────────────────────────
async function loadUpdates() {
  var btn=document.getElementById('btn-upd-refresh');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner spin"></i> Vérification...';}
  document.getElementById('upd-tbody').innerHTML='<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--muted)"><i class="fas fa-spinner spin"></i></td></tr>';
  try {
    var d=await apiFetch('/api/updates').then(function(r){return r.json();});
    var cnt=d.count||0;
    document.getElementById('upd-count').textContent=cnt;
    document.getElementById('upd-ts').textContent='Vérifié à '+new Date().toLocaleTimeString('fr-FR');
    document.getElementById('upd-list-count').textContent=cnt+' paquet'+(cnt>1?'s':'');
    var badge=document.getElementById('nav-upd-badge');
    if(cnt>0){badge.style.display='';badge.textContent=cnt;}else{badge.style.display='none';}
    if(cnt===0){document.getElementById('upd-tbody').innerHTML='<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--green)"><i class="fas fa-circle-check"></i> Système à jour !</td></tr>';}
    else{document.getElementById('upd-tbody').innerHTML=(d.packages||[]).map(function(p){return '<tr><td><strong>'+p.name+'</strong></td><td style="color:var(--muted);font-family:var(--mono);font-size:10.5px">'+p.oldVersion+'</td><td><span class="upd-badge"><i class="fas fa-arrow-up" style="font-size:9px"></i>'+p.newVersion+'</span></td></tr>';}).join('');}
  } catch(e){document.getElementById('upd-tbody').innerHTML='<tr><td colspan="3" style="color:var(--red);padding:14px">Erreur : '+e.message+'</td></tr>';}
  finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-sync"></i> Vérifier';}}
}
function clearConsole(){document.getElementById('upd-console').innerHTML='';document.getElementById('upd-console-status').textContent='En attente';}
function appendConsole(line,cls){var el=document.getElementById('upd-console');var sp=document.createElement('span');sp.className=cls||'';sp.textContent=line+'\\n';el.appendChild(sp);el.scrollTop=el.scrollHeight;}
function setConsoleBtns(r){['btn-apt-fetch','btn-apt-upgrade','btn-upd-refresh'].forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=r;});}
function runApt(action){
  clearConsole();
  var label=action==='fetch'?'apt-get update':'apt-get upgrade';
  var st=document.getElementById('upd-console-status');
  st.textContent='● '+label+'...';setConsoleBtns(true);
  var es=new EventSource('/api/updates/'+action);
  es.onmessage=function(e){
    try{var m=JSON.parse(e.data);
      if(m.t==='out') appendConsole(m.line,'');
      if(m.t==='err') appendConsole(m.line,'l-err');
      if(m.t==='done'){appendConsole(m.code===0?'✔ Terminé':'✖ Erreur (code '+m.code+')','l-done');st.textContent=m.code===0?'✔ Terminé':'✖ Erreur';setConsoleBtns(false);es.close();if(m.code===0)setTimeout(loadUpdates,1500);}
    }catch(_){}
  };
  es.onerror=function(){appendConsole('Connexion perdue.','l-err');setConsoleBtns(false);es.close();};
}

// ── CONFIGURATION ─────────────────────────────────────
async function loadConfigPanel() {
  try {
    var d=await apiFetch('/api/config').then(function(r){return r.json();});
    document.getElementById('cfg-cur-user').textContent      = d.user;
    document.getElementById('cfg-cur-dir').textContent       = d.targetDir;
    document.getElementById('cfg-cur-timeshift').textContent = d.timeshiftDir;
    document.getElementById('cfg-cur-port').textContent      = d.port;
    document.getElementById('cfg-dir').placeholder       = d.targetDir;
    document.getElementById('cfg-timeshift').placeholder = d.timeshiftDir;
    document.getElementById('cfg-port').placeholder      = d.port;
    document.getElementById('cfg-user').placeholder      = d.user;
  } catch(e){toast('Erreur chargement config','error');}
}

function showCfgAlert(id, type, msg) {
  var el=document.getElementById(id);
  var txt=document.getElementById(id+'-txt');
  if(!el||!txt) return;
  txt.textContent=msg;
  el.className='cfg-alert '+type;
  el.style.display='flex';
  setTimeout(function(){el.style.display='none';},4000);
}

async function saveCreds() {
  var user    = document.getElementById('cfg-user').value.trim();
  var newPass = document.getElementById('cfg-newpass').value;
  var curPass = document.getElementById('cfg-curpass').value;
  if (!curPass) { showCfgAlert('cfg-alert-creds','error','Mot de passe actuel requis.'); return; }
  if (newPass && newPass.length < 4) { showCfgAlert('cfg-alert-creds','error','Nouveau mot de passe trop court.'); return; }
  try {
    var r=await apiFetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:user||undefined,newPass:newPass||undefined,pass:curPass})});
    var d=await r.json();
    if(!r.ok) { showCfgAlert('cfg-alert-creds','error',d.error||'Erreur'); return; }
    showCfgAlert('cfg-alert-creds','success',d.message||'Sauvegardé !');
    toast('Identifiants mis à jour','success');
    document.getElementById('cfg-curpass').value='';
    document.getElementById('cfg-newpass').value='';
    document.getElementById('cfg-user').value='';
    configLoaded=false; loadConfigPanel();
  } catch(e){showCfgAlert('cfg-alert-creds','error','Erreur réseau');}
}

async function saveSrv() {
  var dir          = document.getElementById('cfg-dir').value.trim();
  var timeshiftDir = document.getElementById('cfg-timeshift').value.trim();
  var port         = document.getElementById('cfg-port').value;
  var curPass      = document.getElementById('cfg-curpass2').value;
  if (!curPass) { showCfgAlert('cfg-alert-srv','error','Mot de passe actuel requis.'); return; }
  if (port && (parseInt(port)<1||parseInt(port)>65535)) { showCfgAlert('cfg-alert-srv','error','Port invalide (1-65535).'); return; }
  try {
    var r=await apiFetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      targetDir:    dir||undefined,
      timeshiftDir: timeshiftDir||undefined,
      port:         port||undefined,
      pass:         curPass
    })});
    var d=await r.json();
    if(!r.ok){showCfgAlert('cfg-alert-srv','error',d.error||'Erreur');return;}
    showCfgAlert('cfg-alert-srv','success',d.message||'Sauvegardé !');
    toast('Paramètres serveur mis à jour','success');
    document.getElementById('cfg-curpass2').value='';
    document.getElementById('cfg-dir').value='';
    document.getElementById('cfg-timeshift').value='';
    document.getElementById('cfg-port').value='';
    filesLoaded=false;
    configLoaded=false; loadConfigPanel();
  } catch(e){showCfgAlert('cfg-alert-srv','error','Erreur réseau');}
}

function restartAfterSave() {
  if(!confirm('PM2 va redémarrer. Continuer ?')) return;
  apiFetch('/api/restart',{method:'POST'})
    .then(function(){toast('Redémarrage PM2 envoyé…','info');setTimeout(function(){location.reload();},4000);})
    .catch(function(){toast('Erreur','error');});
}

// ── LOGOUT ────────────────────────────────────────────
async function logout() {
  try {
    await fetch('/api/logout',{method:'POST'});
    toast('Déconnexion...','info');
    setTimeout(function(){location.reload();},800);
  } catch(e){toast('Erreur déconnexion','error');}
}

// ── INIT ──────────────────────────────────────────────
window.addEventListener('load',function(){
  initCanvas('chartMain',110);
  loadStats();
  loadHistory();
  setInterval(loadStats,   5000);
  setInterval(loadHistory, 2000);
  document.getElementById('tab-pm2').addEventListener('click',function(e){
    var btn=e.target.closest('.pm2-btn');
    if(!btn||btn.disabled) return;
    pm2Action(btn.dataset.action, btn.dataset.id);
  });
});
window.addEventListener('resize',function(){
  initCanvas('chartMain',110);
  drawChartDual('chartMain',histCpu,histMem);
});
</script>
</body>
</html>`;
}

// ─── DÉMARRAGE ─────────────────────────────────────────────────
loadConfig().then(function() {
  const PORT = runtimeConfig.port || 3000;
  app.listen(PORT, function() {
    console.log('PanelStats actif sur le port ' + PORT);
    console.log('Config: ' + CONFIG_PATH);
  });
});
