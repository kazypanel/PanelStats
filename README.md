# PanelStats — System Monitor

> Tableau de bord de supervision système en temps réel, auto-hébergé, construit avec Node.js + Express.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-compatible-2B037A?logo=pm2&logoColor=white)
![License](https://img.shields.io/badge/Licence-MIT-blue)

---

## 📸 Aperçu

![image](https://github.com/kazypanel/PanelStats/blob/main/IMG_1205.jpg)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran2.png)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran3.png)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran4.png)

PanelStats est un panel de monitoring léger tournant sur **un seul fichier** `server.js`. Il expose une interface web glassmorphism avec thème clair/sombre, accessible depuis n'importe quel navigateur sur votre réseau local.

---

## Fonctionnalités

### Système
- **Overview** — CPU, RAM, Swap, Disk en jauges animées + graphique historique 60s
- **CPU** — utilisation par cœur, température, load average
- **Memory** — RAM utilisée/libre, swap, historique
- **Disk Usage** — toutes les partitions montées en barres de progression

### Applications
- **Projets PM2** — liste de tous les process PM2 avec statut, uptime, CPU, RAM, PID, port — actions Start / Stop / Restart en un clic
- **Répertoire** — exploration du répertoire cible avec tailles, quota `/timeshift` (snapshots Timeshift)
- **Mises à jour** — liste des paquets `apt` à mettre à jour, `apt-get update` et `apt-get upgrade` avec console en direct (Server-Sent Events)
- **Éditeur** — édition de `server.js` directement depuis le navigateur avec CodeMirror (coloration syntaxique, Ctrl+S pour sauvegarder)

### Sécurité
- Authentification par cookie de session (token aléatoire 32 octets)
- Session valable 7 jours, révocable via le bouton Déconnexion
- Identifiants configurables via variables d'environnement

---

## Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur
- [PM2](https://pm2.keymetrics.io/) (recommandé pour la gestion du process)
- Debian/Ubuntu (pour les fonctionnalités `apt`)
- `sudo` sans mot de passe pour `apt-get` (optionnel, pour les mises à jour)

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/votre-utilisateur/panelstats.git
cd panelstats

# Installer les dépendances
npm install express

# Lancer avec PM2
pm2 start server.js --name dashboard
pm2 save
```

Accéder au panel : [http://localhost:3000](http://localhost:3000)

---

## Configuration

Modifier les constantes en haut de `server.js` :

```js
const PORT       = 3000;           // Port d'écoute
const TARGET_DIR = '/home/fredo';  // Répertoire à explorer
```

Les identifiants de connexion se définissent via variables d'environnement :

```bash
DASHBOARD_USER=admin \
DASHBOARD_PASS=monmotdepasse \
pm2 start server.js --name dashboard
```

Par défaut : `admin` / `1981`.

### Sudo pour apt (optionnel)

Pour utiliser les fonctions Mises à jour depuis le panel, autoriser `apt-get` sans mot de passe :

```bash
sudo visudo -f /etc/sudoers.d/panelstats
```

```
fredo ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt
```

---

## Structure

```
panelstats/
└── server.js       # Serveur Express + interface HTML/CSS/JS (fichier unique)
```

L'intégralité du projet tient en un seul fichier — pas de build, pas de bundler, pas de dépendances front-end.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Serveur | Node.js + Express |
| Process manager | PM2 |
| UI | HTML/CSS/JS vanilla — glassmorphism |
| Éditeur | CodeMirror 5 |
| Icônes | Font Awesome 6 |
| Polices | SF Pro Display (Google Fonts) |
| Temps réel | `setInterval` + Server-Sent Events (SSE) |

---

## Captures d'écran

| Overview | Mises à jour |
|---|---|
| ![Overview](screenshots/overview.png) | ![Updates](screenshots/updates.png) |

---

## Licence

MIT — libre d'utilisation, de modification et de redistribution.| `fredo`               | `/home/fredo`              |
| `alice`               | `/home/alice`              |
| `pi` (Raspberry Pi)   | `/home/pi`                 |
| `debian` (VPS)        | `/home/debian`             |
| Répertoire custom     | `/mnt/data` ou tout chemin |

> PanelStats lit ce dossier pour afficher la taille de chaque fichier et sous-dossier. Il n'écrit rien dedans.

### 4. Lancer le serveur

#### Démarrage simple

```bash
node server.js
# → PanelStats Dashboard actif sur le port 3000
```

#### Avec PM2 (recommandé — persistance au redémarrage)

```bash
pm2 start server.js --name panelstats
pm2 save
pm2 startup    # optionnel : lancer au boot
```

### 5. Accéder au dashboard

Ouvrez votre navigateur sur :

```
http://localhost:3000
```

Ou depuis un autre poste du réseau local :

```
http://IP-DU-SERVEUR:3000
```

---

## ⚙️ Configuration

Toutes les constantes de configuration se trouvent en haut de `server.js` :

```js
const PORT       = 3000;              // Port d'écoute HTTP
const TARGET_DIR = '/home/fredo';     // Répertoire à scanner (voir ci-dessous)
const SELF_PATH  = __filename;        // Chemin du fichier éditable (ne pas changer)
```

### Changer le port

```js
const PORT = 8080;   // ou n'importe quel port libre
```

Si vous utilisez PM2, vous pouvez aussi passer le port en variable d'environnement :

```bash
PORT=8080 pm2 start server.js --name panelstats
```

### Changer le répertoire cible (`TARGET_DIR`)

C'est la seule constante à adapter à votre environnement. Elle définit le dossier que l'onglet **Répertoire** va scanner et afficher.

```js
// Exemples valides
const TARGET_DIR = '/home/alice';
const TARGET_DIR = '/root';
const TARGET_DIR = '/var/www';
const TARGET_DIR = '/mnt/nas';
const TARGET_DIR = process.env.HOME;   // automatique selon l'utilisateur courant
```

> 💡 **Astuce :** Utilisez `process.env.HOME` pour que PanelStats s'adapte automatiquement à l'utilisateur qui lance le processus, sans rien modifier.

---

## 🗂 Structure du projet

```
panelstats/
├── server.js       # Serveur Express + HTML/CSS/JS intégré (fichier unique)
├── package.json    # (optionnel, généré par npm init)
└── README.md
```

PanelStats est volontairement **mono-fichier** : tout le backend, le frontend, les styles et le JavaScript client sont dans `server.js`. Cela simplifie le déploiement et les sauvegardes.

---

## 📡 API REST

| Méthode | Route                    | Description                                 |
|---------|--------------------------|---------------------------------------------|
| `GET`   | `/`                      | Interface HTML complète                     |
| `GET`   | `/api/stats`             | Snapshot CPU, RAM, Disk, Swap, Réseau…      |
| `GET`   | `/api/history`           | Historique 60 points CPU & RAM              |
| `GET`   | `/api/pm2`               | Liste des processus PM2                     |
| `POST`  | `/api/pm2/:action/:id`   | Action PM2 (`start`,`stop`,`restart`,`delete`) |
| `GET`   | `/api/files`             | Contenu et tailles de `TARGET_DIR`          |
| `GET`   | `/api/editor`            | Contenu brut de `server.js`                 |
| `POST`  | `/api/editor`            | Sauvegarde du contenu de `server.js`        |
| `POST`  | `/api/restart`           | Redémarre le processus PM2 `dashboard-fichiers` |

---

## 🎨 Thème Glassmorphism

PanelStats utilise un thème **Glass style iOS** avec deux modes :

| Mode   | Fond                          | Surfaces                        |
|--------|-------------------------------|---------------------------------|
| Clair  | Dégradés bleu/violet/vert     | `rgba(255,255,255,0.55)` + blur |
| Sombre | Fond navy `#0d1117`           | `rgba(30,36,58,0.70)` + blur    |

Le thème choisi est mémorisé dans `localStorage` entre les sessions.

---

## 🖥 Onglets disponibles

| Onglet       | Contenu                                                                 |
|--------------|-------------------------------------------------------------------------|
| **Overview** | Jauges CPU/RAM/Disk/Swap, graphique 60s, charge système, réseau, top processus |
| **CPU**      | Historique graphique CPU, grille par cœur, détails modèle & température |
| **Memory**   | Historique RAM, barres RAM utilisée / libre / Swap                      |
| **Disk**     | Tous les volumes montés en GiB et en %                                  |
| **PM2**      | Tableau des projets avec actions start/stop/restart                     |
| **Répertoire** | Arborescence `TARGET_DIR` triée par taille (dossiers, fichiers, cachés) |
| **Éditeur**  | Édition de `server.js` en direct avec sauvegarde et redémarrage PM2    |

---

## 🔒 Sécurité

> ⚠️ PanelStats est prévu pour un usage **réseau local ou privé**. L'éditeur intégré permet de modifier et d'exécuter du code serveur. Ne l'exposez pas sur Internet sans protection supplémentaire.

Recommandations si vous devez l'exposer :

- Placez un **reverse proxy Nginx** avec authentification HTTP basique
- Ou utilisez un **tunnel SSH** : `ssh -L 3000:localhost:3000 user@serveur`
- Ou intégrez un middleware d'authentification session dans `server.js`

---

## 📦 Dépendances

| Package   | Version | Rôle                       |
|-----------|---------|----------------------------|
| `express` | 4.x     | Serveur HTTP et routage    |

Dépendances système utilisées via Node.js natif : `os`, `fs/promises`, `path`, `child_process`.

---

## 🤝 Contribution

Les PR sont les bienvenues ! Pour proposer une amélioration :

1. Forkez le dépôt
2. Créez une branche : `git checkout -b feature/ma-feature`
3. Commitez : `git commit -m 'feat: ajout de ...'`
4. Poussez : `git push origin feature/ma-feature`
5. Ouvrez une Pull Request

---

## 📄 Licence

MIT — libre d'utilisation, de modification et de distribution.

---

<p align="center">
  Fait avec ☕ et Node.js · Auto-hébergé · Aucun cloud
</p>
