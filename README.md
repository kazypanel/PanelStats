# 📊 PanelStats

> Dashboard de monitoring système auto-hébergé, style **Glassmorphism iOS**, propulsé par **Node.js + Express**.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-compatible-2B037A?style=flat-square&logo=pm2&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## ✨ Fonctionnalités

- **Overview temps réel** — CPU, RAM, Swap, Disk avec jauges animées
- **Historique graphique** — courbes CPU & RAM sur 60 secondes glissantes
- **Multi-disques** — détection automatique de tous les volumes montés
- **Gestion PM2** — start / stop / restart de tous vos projets Node.js
- **Explorateur de répertoire** — taille des dossiers et fichiers avec tri
- **Éditeur intégré** — modifiez et sauvegardez `server.js` depuis le navigateur
- **Thème Glass clair / sombre** — glassmorphism iOS avec `backdrop-filter`
- **100% vanilla** — aucune dépendance frontend (zéro build, zéro bundler)

---

## 📸 Aperçu

![image](https://github.com/kazypanel/PanelStats/blob/main/IMG_1205.jpg)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran2.png)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran3.png)
![image](https://github.com/kazypanel/PanelStats/blob/main/ecran4.png)

```
┌─────────────────────────────────────────────────────────┐
│  🖥 PanelStats          ● LIVE   12:34:56   🌙 Sombre   │
├──────────────┬──────────────────────────────────────────┤
│  Overview    │  System Info  │ Network  │ CPU  │ RAM     │
│  CPU         ├──────────────┼──────────┴──────┴─────────┤
│  Memory      │   Gauges     │  CPU  RAM  Disk  Swap      │
│  Disk        ├──────────────┴──────────────────────────  │
│  ──────────  │   Chart CPU & RAM ────  System Load ───   │
│  Projets PM2 ├─────────────────────────────────────────  │
│  Répertoire  │   Disk Bars  │ Network I/O │ Top Procs    │
│  Éditeur     │                                           │
└──────────────┴───────────────────────────────────────────┘
```

---

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) **v18+**
- [PM2](https://pm2.keymetrics.io/) *(recommandé pour la persistance)*

```bash
node -v   # doit afficher v18.x ou supérieur
npm -v
```

### 1. Cloner le dépôt

```bash
git clone https://github.com/votre-user/panelstats.git
cd panelstats
```

### 2. Installer les dépendances

```bash
npm install express
```

> **Note :** PanelStats n'utilise que `express`. Toutes les données système viennent des modules natifs Node.js (`os`, `child_process`, `fs`).

### 3. Configurer le répertoire cible

Ouvrez `server.js` et modifiez la ligne **9** :

```js
// server.js — ligne 9
const TARGET_DIR = '/home/votre-utilisateur';   // ← changez ici
```

| Exemple d'utilisateur | Valeur à mettre            |
|-----------------------|----------------------------|
| `fredo`               | `/home/fredo`              |
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
