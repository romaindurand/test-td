# Tower Defense - Système de Pathfinding

Un jeu de tower defense développé avec Svelte et PixiJS, mettant l'accent sur un système de pathfinding avancé avec visualisation des chemins optimaux.

## 🎯 Description du Projet

Ce projet implémente un système de tower defense avec un moteur de pathfinding sophistiqué qui permet aux ennemis de contourner les obstacles de manière optimale. Le jeu inclut des outils de visualisation pour comprendre les algorithmes de pathfinding en temps réel.

## 🎮 Code Couleur des Éléments

### Lapins (Sprites)

- 🔴 **Lapin Rouge** : Ennemis qui se dirigent vers la cible
- 🟡 **Lapin Jaune** : Tours de défense (placées par le joueur)
- 🟢 **Lapin Vert** : Lapin cible (objectif des ennemis)

### Obstacles et Chemins

- 🟫 **Mur Marron** : Obstacles rotatifs placables par le joueur
- 🔵 **Zones Bleues** : Obstacles étendus avec marge de sécurité (30px)
- 🟠 **Zones Orange** : Obstacles originaux (transparents pour debug)
- 🟡 **Ligne Jaune** : Chemin optimal calculé
- 🔴 **Ligne Rouge** : Chemin bloqué ou ligne directe impossible
- 🟢 **Ligne Verte** : Chemin libre ou optimal trouvé

## 🛠️ Outils Disponibles

### 1. Lapin Rouge (Ennemi)

- **Fonction** : Place des ennemis sur le terrain
- **Comportement** : Se dirigent directement vers le lapin vert cible
- **Dégâts** : Infligent 1 point de dégâts en atteignant la cible

### 2. Lapin Jaune (Tour de Défense)

- **Fonction** : Place des tours de défense
- **Couleur Interface** : Fond jaune avec animation de pulsation
- **Couleur Jeu** : Sprite jaune (0xffff00)
- **Rôle** : Éléments défensifs statiques

### 3. Mur (Obstacle)

- **Fonction** : Crée des obstacles rotatifs
- **Contrôles** : Maintenez `R` pour faire tourner (par incréments de 45°)
- **Dimensions** : 80x20 pixels
- **Couleur** : Marron (0x8b4513) avec bordure plus foncée
- **Impact** : Force les ennemis à contourner

### 4. Curseur Libre

- **Fonction** : Mode d'examen sans placement
- **Usage** : Observer le terrain et les interactions
- **Icône** : 👆 (pointeur)

### 5. Test Ligne

- **Fonction** : Outil de visualisation des chemins optimaux
- **Affichage** : Ligne en temps réel du curseur vers la cible
- **Informations** : Distance, type de chemin, obstacles rencontrés
- **Couleurs** :
  - 🟢 Vert : Chemin optimal trouvé
  - 🔴 Rouge : Chemin bloqué
  - 🟡 Jaune : Coin optimal mis en évidence

## 📊 Système de Pathfinding

### Algorithme de Calcul du Chemin Optimal

#### 1. **Test du Chemin Direct**

```
Si le chemin direct (point A → point B) est libre d'obstacles :
  └─ Retourner le chemin direct (distance minimale)
```

#### 2. **Expansion des Obstacles**

```
Pour chaque obstacle polygonal :
  ├─ Calculer le centroïde
  ├─ Étendre chaque sommet de 30px vers l'extérieur
  └─ Créer la zone d'évitement étendue (bleue)
```

#### 3. **Identification des Coins Bleus**

```
Pour chaque obstacle étendu :
  ├─ Chaque sommet devient un "coin bleu"
  ├─ Calculer la distance de chaque coin vers la cible
  └─ Pré-calculer les chemins coin → cible
```

#### 4. **Recherche du Chemin Optimal**

```
Si le chemin direct est bloqué :
  ├─ Tester l'accessibilité de chaque coin bleu depuis le point de départ
  ├─ Pour chaque coin accessible :
  │   ├─ Distance = (départ → coin) + (coin → cible pré-calculée)
  │   └─ Stocker le coût total
  ├─ Trier les coins par coût total croissant
  └─ Retourner : départ → coin optimal → cible
```

#### 5. **Optimisations Performances**

- **Throttling** : Calculs limités à 60fps (16ms)
- **Cache** : Résultats mis en cache tant que la souris ne bouge pas significativement
- **Pré-calcul** : Distances coin → cible calculées une seule fois
- **Seuil de mouvement** : Recalcul seulement si déplacement > 5px

## 🎮 Contrôles

| Action            | Commande                |
| ----------------- | ----------------------- |
| Placer un élément | Clic gauche             |
| Rotation du mur   | Maintenir `R`           |
| Changer d'outil   | Interface à droite      |
| Contrôle vitesse  | Slider en haut à droite |
| Pause             | Vitesse = 0             |

## 📈 Interface Utilisateur

### Panneau de Sélection d'Outils

- **Position** : Coin supérieur droit
- **Animations** : Pulsation lors de la sélection active
- **Info Rotation** : Angle affiché pour l'outil mur

### Barre de Santé

- **Position** : Coin supérieur gauche
- **Couleur** : Vert → Jaune → Rouge selon les PV
- **Réduction** : -1 PV par ennemi atteignant la cible

### Contrôle de Vitesse

- **Plage** : 0 (pause) à 10 (très rapide)
- **Affichage** : Couleur dynamique selon la vitesse
- **Animation** : Pulsation en pause

### Panneau Test Ligne (mode analyse)

- **Position** : Coin inférieur droit
- **Informations** :
  - ✅ Chemin direct disponible
  - 🎯 Chemin via coin optimal
  - ❌ Aucun chemin trouvé
  - Distance totale et comparaison

## 🏗️ Architecture Technique

### Technologies Utilisées

- **Frontend** : Svelte + TypeScript
- **Rendu** : PixiJS v8
- **Build** : Vite
- **Tests** : Vitest + Playwright
- **Linting** : ESLint

### Structure des Fichiers

```
src/
├── lib/
│   ├── components/          # Composants UI Svelte
│   │   ├── BunnySelector.svelte
│   │   ├── HealthBar.svelte
│   │   └── GameSpeedControl.svelte
│   ├── stores/              # État global Svelte
│   │   └── gameState.ts
│   ├── obstacle-system.ts   # Système de gestion des obstacles
│   ├── pathfinding.ts       # Algorithmes de pathfinding
│   └── simple-pathfinding-manager.ts  # Manager principal
└── routes/
    └── +page.svelte         # Application principale
```

### Système de Stores (État Global)

- `selectedBunnyType` : Outil actuellement sélectionné
- `playerHealth` : Points de vie du joueur
- `gameSpeed` : Vitesse de simulation
- `wallRotation` : Angle de rotation des murs
- `isRotatingWall` : État de rotation active

## 🚀 Installation et Lancement

### Prérequis

- Node.js 18+
- pnpm (recommandé) ou npm

### Installation

```bash
# Cloner le projet
git clone [repository-url]
cd test-td

# Installer les dépendances
pnpm install
```

### Développement

```bash
# Lancer le serveur de développement
pnpm dev

# Ouvrir automatiquement dans le navigateur
pnpm dev --open
```

### Tests

```bash
# Tests unitaires
pnpm test

# Tests E2E
pnpm test:e2e
```

### Production

```bash
# Build de production
pnpm build

# Prévisualiser le build
pnpm preview
```

## 🎯 Fonctionnalités Avancées

### Visualisation Debug

- **Obstacles Originaux** : Affichage orange transparent
- **Zones Étendues** : Affichage bleu avec coins interactifs
- **Distances** : Affichage numérique sur chaque coin
- **Chemins Hover** : Prévisualisation au survol des coins

### Système de Performance

- **Throttling Intelligent** : Évite les recalculs inutiles
- **Cache Spatial** : Réutilisation des chemins calculés
- **Rendering Optimisé** : Mise à jour sélective des graphiques

### Interactions Avancées

- **Preview Temps Réel** : Aperçu des éléments avant placement
- **Rotation Fluide** : Animation des murs en rotation
- **Feedback Visuel** : Couleurs et animations contextuelles

## 🐛 Debug et Développement

### Outils de Debug Intégrés

- Mode Test Ligne pour analyser les chemins
- Affichage des distances pré-calculées
- Visualisation des zones d'obstacle étendues
- Console logs pour le pathfinding

### Points d'Attention

- Les obstacles doivent avoir au moins 3 sommets
- La marge d'expansion est fixée à 30px
- Les calculs utilisent la distance euclidienne
- La détection de collision utilise l'algorithme d'orientation

---

_Développé avec ❤️ en Svelte + PixiJS_
