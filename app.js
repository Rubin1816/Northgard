/* =====================================================
   NORDGARD — game.js
   Komplette Spiellogik: Ressourcen, KI, Kampf, Karte
   ===================================================== */

'use strict';

// ─── SPIELZUSTAND ────────────────────────────────────────────────────────────

const TILE_SIZE  = 64;
const MAP_COLS   = 15;
const MAP_ROWS   = 10;
const GAME_DURATION = 15 * 60; // 15 min in Sekunden

const SEASONS = [
  { name: 'Frühling', icon: '🌿', foodMod: 1.2, woodMod: 1.0 },
  { name: 'Sommer',   icon: '☀️', foodMod: 1.5, woodMod: 1.2 },
  { name: 'Herbst',   icon: '🍂', foodMod: 0.9, woodMod: 1.3 },
  { name: 'Winter',   icon: '❄️', foodMod: 0.4, woodMod: 0.7 },
];

const CLANS = {
  wolf: {
    name: 'Wolfsclan',
    icon: '🐺',
    color: '#3a7bd5',
    combatMult: 1.2,
    resourceMult: 1.0,
    defMult: 1.0,
  },
  bear: {
    name: 'Bärenclan',
    icon: '🐻',
    color: '#c8a96e',
    combatMult: 1.0,
    resourceMult: 1.2,
    defMult: 1.3,
  },
};

const BUILDINGS = {
  house:       { name: 'Hütte',     icon: '🏠', cost: { wood:5, iron:2 }, effect: { maxPop:5 },         color: '#8B6914' },
  farm:        { name: 'Farm',      icon: '🌾', cost: { wood:8 },         effect: { foodRate:3 },        color: '#5a8a2a' },
  lumberjack:  { name: 'Holzfäller',icon: '🪓', cost: { food:5 },         effect: { woodRate:2 },        color: '#6b4a20' },
  mine:        { name: 'Mine',      icon: '⛏️', cost: { wood:10, gold:5 },effect: { ironRate:1 },        color: '#888888' },
  market:      { name: 'Markt',     icon: '🏪', cost: { wood:12, iron:3 },effect: { goldRate:2 },        color: '#c8a030' },
  barracks:    { name: 'Kaserne',   icon: '⚔️', cost: { wood:15, iron:8 },effect: { canRecruit:true },   color: '#8b1a1a' },
};

const WARRIOR_COST = { food:8, iron:5, gold:3 };

// ─── TILE TYPEN ──────────────────────────────────────────────────────────────

const TILE_TYPES = {
  GRASS:   { color: '#2a4a1a', darkColor: '#1e3612', name: 'Wiese',         resources: {} },
  FOREST:  { color: '#1a3a10', darkColor: '#122a0a', name: 'Wald',          resources: { wood:1 } },
  MOUNTAIN:{ color: '#4a4040', darkColor: '#383030', name: 'Gebirge',       resources: { iron:1 } },
  WATER:   { color: '#1a2a4a', darkColor: '#101e38', name: 'Wasser',        resources: {} },
  FIELD:   { color: '#3a5a1a', darkColor: '#2a4212', name: 'Feld',          resources: { food:1 } },
  VILLAGE: { color: '#6b4a20', darkColor: '#4a3214', name: 'Dorf',          resources: {} },
  ENEMY:   { color: '#4a1010', darkColor: '#380a0a', name: 'Feinddorf',     resources: {} },
};

// ─── GAME STATE ──────────────────────────────────────────────────────────────

let G = null; // globaler Spielzustand
let canvas, ctx;
let animFrame = null;
let lastTick = null;
let hoverTile = null;

function initState(clanKey) {
  const enemyKey = clanKey === 'wolf' ? 'bear' : 'wolf';
  G = {
    clan:         clanKey,
    enemyClan:    enemyKey,
    timeLeft:     GAME_DURATION,
    paused:       false,
    over:         false,

    // Spielerressourcen
    res: { food:50, wood:30, iron:10, gold:20 },
    pop:    5,
    maxPop: 10,
    warriors: 0,

    // Raten (pro Sekunde)
    rates: { food:1, wood:0.5, iron:0, gold:0 },

    // Gebäude: Schlüssel → true wenn gebaut
    built: {},

    // Karte
    tiles: [],
    mapW: MAP_COLS,
    mapH: MAP_ROWS,

    // KI (Feind)
    ai: {
      food:40, wood:25, iron:8, gold:15,
      pop:4, maxPop:10, warriors:0,
      rates: { food:0.8, wood:0.4, iron:0, gold:0 },
      built: {},
      attackCooldown: 60,
      nextBuildTimer: 20,
      difficulty: 0,
    },

    // Kampf
    lastAttack: 0,
    attackCooldown: 10,

    // Jahreszeit
    seasonIndex: 3, // Winter start
    seasonTimer: 0,
    seasonDuration: GAME_DURATION / (SEASONS.length * 2), // 2 Zyklen

    // Kamera
    camX: 0, camY: 0,

    // Statistik
    stats: { buildingsBuilt:0, warriorsTrained:0, attacksMade:0, resourcesGathered:0 },
  };

  generateMap();
}

// ─── KARTE GENERIEREN ────────────────────────────────────────────────────────

function generateMap() {
  const { mapW, mapH } = G;
  G.tiles = [];
  for (let row = 0; row < mapH; row++) {
    G.tiles[row] = [];
    for (let col = 0; col < mapW; col++) {
      G.tiles[row][col] = { type: 'GRASS', building: null, owner: null };
    }
  }

  // Wasser-Rand
  for (let col = 0; col < mapW; col++) {
    G.tiles[0][col].type = 'WATER';
    G.tiles[mapH-1][col].type = 'WATER';
  }
  for (let row = 0; row < mapH; row++) {
    G.tiles[row][0].type = 'WATER';
    G.tiles[row][mapW-1].type = 'WATER';
  }

  // Spieler-Dorf (links)
  G.tiles[Math.floor(mapH/2)][2].type = 'VILLAGE';
  G.tiles[Math.floor(mapH/2)][2].owner = 'player';

  // Feind-Dorf (rechts)
  G.tiles[Math.floor(mapH/2)][mapW-3].type = 'ENEMY';
  G.tiles[Math.floor(mapH/2)][mapW-3].owner = 'enemy';

  // Wälder (zufällig)
  const forestCells = [
    [1,4],[2,4],[3,3],[1,6],[2,6],[4,4],[1,3],
    [mapH-2,3],[mapH-3,4],
    [1,mapW-5],[2,mapW-5],[3,mapW-4],
  ];
  for (const [r,c] of forestCells) {
    if (r>0 && r<mapH-1 && c>0 && c<mapW-1 && G.tiles[r][c].type==='GRASS')
      G.tiles[r][c].type = 'FOREST';
  }

  // Berge (mitte)
  const mountainCells = [
    [3,7],[4,7],[5,7],[6,7],[3,6],[6,8],
    [2,8],[mapH-3,8],[mapH-2,7],
  ];
  for (const [r,c] of mountainCells) {
    if (r>0 && r<mapH-1 && c>0 && c<mapW-1 && G.tiles[r][c].type==='GRASS')
      G.tiles[r][c].type = 'MOUNTAIN';
  }

  // Felder (nahe Dorf)
  const fieldCells = [[3,2],[3,3],[4,2],[5,2],[6,3],[mapH-3,2],[mapH-4,3]];
  for (const [r,c] of fieldCells) {
    if (r>0 && r<mapH-1 && c>0 && c<mapW-1 && G.tiles[r][c].type==='GRASS')
      G.tiles[r][c].type = 'FIELD';
  }

  // Feindfelder
  const enemyFields = [[3,mapW-4],[4,mapW-3],[5,mapW-4],[6,mapW-4],[mapH-3,mapW-4]];
  for (const [r,c] of enemyFields) {
    if (r>0 && r<mapH-1 && c>0 && c<mapW-1 && G.tiles[r][c].type==='GRASS')
      G.tiles[r][c].type = 'FIELD';
  }
}

// ─── KARTE ZEICHNEN ──────────────────────────────────────────────────────────

const TILE_EMOJIS = {
  GRASS:   ['🌿','','',''],
  FOREST:  ['🌲','🌳','🌲'],
  MOUNTAIN:['⛰️','🪨',''],
  WATER:   ['💧','🌊',''],
  FIELD:   ['🌾','🌱',''],
  VILLAGE: ['🏰'],
  ENEMY:   ['🏯'],
};

function drawMap() {
  if (!ctx) return;
  const { mapW, mapH } = G;
  const season = SEASONS[G.seasonIndex];

  for (let row = 0; row < mapH; row++) {
    for (let col = 0; col < mapW; col++) {
      const tile = G.tiles[row][col];
      const tt = TILE_TYPES[tile.type];
      const x = col * TILE_SIZE - G.camX;
      const y = row * TILE_SIZE - G.camY;

      // Kachel-Hintergrund
      ctx.fillStyle = tt.color;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      // Subtiles Muster
      ctx.fillStyle = tt.darkColor;
      ctx.fillRect(x, y, 1, TILE_SIZE);
      ctx.fillRect(x, y, TILE_SIZE, 1);

      // Hover-Highlight
      if (hoverTile && hoverTile.row===row && hoverTile.col===col) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x+1, y+1, TILE_SIZE-2, TILE_SIZE-2);
      }

      // Emoji / Icon
      const emojis = TILE_EMOJIS[tile.type] || [];
      if (emojis.length > 0) {
        const em = emojis[((row*7+col*13) % emojis.length)];
        if (em) {
          ctx.font = tile.type==='VILLAGE'||tile.type==='ENEMY' ? '32px serif' : '20px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(em, x + TILE_SIZE/2, y + TILE_SIZE/2);
        }
      }

      // Gebäude auf Kachel
      if (tile.building) {
        const bd = BUILDINGS[tile.building];
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bd.icon, x + TILE_SIZE - 14, y + 14);
      }

      // Besitzer-Farbe (kleiner Indikator)
      if (tile.owner === 'player') {
        ctx.fillStyle = CLANS[G.clan].color + '55';
        ctx.fillRect(x+1, y+1, 5, 5);
      } else if (tile.owner === 'enemy') {
        ctx.fillStyle = '#ff444455';
        ctx.fillRect(x+TILE_SIZE-6, y+1, 5, 5);
      }
    }
  }

  // Spieler- und Feind-Stärke-Anzeige über Dorf
  const playerRow = Math.floor(MAP_ROWS/2);
  const playerCol = 2;
  const ex = playerCol * TILE_SIZE - G.camX;
  const ey = playerRow * TILE_SIZE - G.camY;
  drawBanner(ex, ey-28, `⚔️${totalPower()} 👥${G.pop}`, CLANS[G.clan].color);

  const enemyRow = Math.floor(MAP_ROWS/2);
  const enemyCol = MAP_COLS - 3;
  const fx = enemyCol * TILE_SIZE - G.camX;
  const fy = enemyRow * TILE_SIZE - G.camY;
  drawBanner(fx, fy-28, `⚔️${enemyPower()} 👥${G.ai.pop}`, '#cc4444');
}

function drawBanner(x, y, text, color) {
  ctx.save();
  ctx.fillStyle = color + 'cc';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  const metrics = ctx.measureText(text);
  const w = Math.max(metrics.width + 12, 60);
  ctx.beginPath();
  ctx.roundRect(x + TILE_SIZE/2 - w/2, y, w, 20, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '11px Cinzel, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + TILE_SIZE/2, y+10);
  ctx.restore();
}

// ─── SPIELLOGIK ──────────────────────────────────────────────────────────────

function totalPower() {
  return Math.floor(G.warriors * 10 * CLANS[G.clan].combatMult);
}

function enemyPower() {
  return Math.floor(G.ai.warriors * 10 * CLANS[G.enemyClan].combatMult);
}

function tick(dt) {
  if (!G || G.over) return;

  // Zeitablauf
  G.timeLeft -= dt;
  if (G.timeLeft <= 0) {
    G.timeLeft = 0;
    endGame('time');
    return;
  }

  // Jahreszeit
  G.seasonTimer += dt;
  if (G.seasonTimer >= G.seasonDuration) {
    G.seasonTimer = 0;
    G.seasonIndex = (G.seasonIndex + 1) % SEASONS.length;
    addEvent(`${SEASONS[G.seasonIndex].icon} ${SEASONS[G.seasonIndex].name} beginnt`, 'warn');
  }

  const season = SEASONS[G.seasonIndex];

  // Ressourcen sammeln
  const fm = CLANS[G.clan].resourceMult * season.foodMod;
  const wm = CLANS[G.clan].resourceMult * season.woodMod;
  const rawFood = G.rates.food * fm * dt;
  const rawWood = G.rates.wood * wm * dt;
  G.res.food = Math.max(0, Math.min(999, G.res.food + rawFood));
  G.res.wood = Math.max(0, G.res.wood + G.rates.wood * wm * dt * 0.5);
  G.res.iron = Math.max(0, G.res.iron + G.rates.iron * dt);
  G.res.gold = Math.max(0, G.res.gold + G.rates.gold * dt);
  G.stats.resourcesGathered += (rawFood + rawWood) * dt;

  // Krieger brauchen Nahrung
  const upkeep = G.warriors * 0.1 * dt;
  G.res.food = Math.max(0, G.res.food - upkeep);
  if (G.res.food <= 0 && G.warriors > 0 && Math.random() < 0.01) {
    G.warriors = Math.max(0, G.warriors - 1);
    G.pop = Math.min(G.maxPop, G.pop + 1);
    addEvent('Krieger desertiert! (Kein Essen)', 'bad');
  }

  // KI
  tickAI(dt, season);

  // Angriffscooldown
  G.lastAttack = Math.max(0, G.lastAttack - dt);

  updateUI();
  drawMap();
}

// ─── KI ──────────────────────────────────────────────────────────────────────

function tickAI(dt, season) {
  const ai = G.ai;
  const clan = CLANS[G.enemyClan];

  // Ressourcen
  const fm2 = clan.resourceMult * season.foodMod;
  const wm2 = clan.resourceMult * season.woodMod;
  ai.food = Math.max(0, Math.min(999, ai.food + ai.rates.food * fm2 * dt));
  ai.wood = Math.max(0, ai.wood + ai.rates.wood * wm2 * dt);
  ai.iron = Math.max(0, ai.iron + ai.rates.iron * dt);
  ai.gold = Math.max(0, ai.gold + ai.rates.gold * dt);

  // KI Gebäude bauen
  ai.nextBuildTimer -= dt;
  if (ai.nextBuildTimer <= 0) {
    ai.nextBuildTimer = 15 + Math.random() * 20;
    aiBuildSomething();
  }

  // KI Krieger ausbilden
  if (!ai.built.barracks) {
    if (ai.wood >= 15 && ai.iron >= 8) {
      ai.built.barracks = true;
      ai.wood -= 15; ai.iron -= 8;
      addEvent('Feind baut Kaserne!', 'bad');
    }
  } else if (ai.food >= 8 && ai.iron >= 5 && ai.gold >= 3 && ai.pop > ai.warriors + 1) {
    if (Math.random() < 0.015) {
      ai.warriors++;
      ai.food -= 8; ai.iron -= 5; ai.gold -= 3;
    }
  }

  // KI Angriff
  ai.attackCooldown -= dt;
  if (ai.attackCooldown <= 0 && ai.warriors >= 2) {
    ai.attackCooldown = 40 + Math.random() * 40;
    resolveAIAttack();
  }
}

function aiBuildSomething() {
  const ai = G.ai;
  const order = ['farm','lumberjack','mine','market','house'];
  for (const key of order) {
    if (ai.built[key]) continue;
    const b = BUILDINGS[key];
    const canAfford = Object.entries(b.cost).every(([r,v]) => (ai[r] ?? 0) >= v);
    if (canAfford) {
      for (const [r,v] of Object.entries(b.cost)) ai[r] -= v;
      ai.built[key] = true;
      applyAIBuilding(key);
      break;
    }
  }
}

function applyAIBuilding(key) {
  const ai = G.ai;
  const eff = BUILDINGS[key].effect;
  if (eff.maxPop)  ai.maxPop  += eff.maxPop,  ai.pop = Math.min(ai.pop+2, ai.maxPop);
  if (eff.foodRate) ai.rates.food += eff.foodRate;
  if (eff.woodRate) ai.rates.wood += eff.woodRate;
  if (eff.ironRate) ai.rates.iron += eff.ironRate;
  if (eff.goldRate) ai.rates.gold += eff.goldRate;
}

function resolveAIAttack() {
  const atkPow = enemyPower();
  const defPow = totalPower() * CLANS[G.clan].defMult;

  if (atkPow > defPow * 0.6) {
    // Feind gewinnt Scharmützel
    const losses = Math.max(1, Math.floor(G.warriors * 0.3));
    G.warriors = Math.max(0, G.warriors - losses);
    addEvent(`Feind greift an! Verloren: ${losses} Krieger`, 'bad');

    if (G.warriors <= 0 && G.pop < 3) {
      endGame('defeat');
    }
  } else {
    addEvent('Feindenangriff abgewehrt! ⚔️', 'good');
    G.ai.warriors = Math.max(0, G.ai.warriors - 1);
  }
}

// ─── GEBÄUDE BAUEN ───────────────────────────────────────────────────────────

function buildBuilding(key) {
  if (G.built[key]) return;
  const b = BUILDINGS[key];
  if (!canAfford(b.cost)) {
    addEvent('Nicht genug Ressourcen!', 'bad');
    return;
  }
  spendResources(b.cost);
  G.built[key] = true;
  applyBuilding(key);
  G.stats.buildingsBuilt++;
  addEvent(`${b.icon} ${b.name} gebaut!`, 'good');
  updateBuildingUI();
}

function canAfford(cost) {
  return Object.entries(cost).every(([r,v]) => G.res[r] >= v);
}

function spendResources(cost) {
  for (const [r,v] of Object.entries(cost)) G.res[r] = Math.max(0, G.res[r] - v);
}

function applyBuilding(key) {
  const eff = BUILDINGS[key].effect;
  if (eff.maxPop)  { G.maxPop += eff.maxPop; G.pop = Math.min(G.pop+2, G.maxPop); }
  if (eff.foodRate) G.rates.food += eff.foodRate;
  if (eff.woodRate) G.rates.wood += eff.woodRate;
  if (eff.ironRate) G.rates.iron += eff.ironRate;
  if (eff.goldRate) G.rates.gold += eff.goldRate;
}

// ─── KRIEGER ─────────────────────────────────────────────────────────────────

function recruitWarrior() {
  if (!G.built.barracks) { addEvent('Zuerst Kaserne bauen!', 'bad'); return; }
  if (G.pop <= G.warriors) { addEvent('Keine freien Einwohner!', 'bad'); return; }
  if (!canAfford(WARRIOR_COST)) { addEvent('Nicht genug Ressourcen!', 'bad'); return; }
  spendResources(WARRIOR_COST);
  G.warriors++;
  G.stats.warriorsTrained++;
  addEvent('⚔️ Krieger ausgebildet!', 'good');
}

function attackEnemy() {
  if (G.warriors <= 0) { addEvent('Keine Krieger!', 'bad'); return; }
  if (G.lastAttack > 0) { addEvent(`Angriff lädt (${Math.ceil(G.lastAttack)}s)`, 'warn'); return; }

  G.lastAttack = G.attackCooldown;
  G.stats.attacksMade++;

  const atkPow = totalPower();
  const defPow = enemyPower() * CLANS[G.enemyClan].defMult;
  const result  = atkPow - defPow;

  if (result > 0) {
    const killed = Math.max(1, Math.floor(G.ai.warriors * 0.4));
    G.ai.warriors = Math.max(0, G.ai.warriors - killed);
    addEvent(`Angriff erfolgreich! ${killed} Feinde getötet`, 'good');
    if (G.ai.warriors <= 0 && G.ai.pop < 3) {
      endGame('victory');
    }
  } else if (result < -20) {
    const losses = Math.ceil(G.warriors * 0.25);
    G.warriors = Math.max(0, G.warriors - losses);
    addEvent(`Angriff zurückgeschlagen! -${losses} Krieger`, 'bad');
  } else {
    addEvent('Unentschieden – beide Seiten halten stand', 'warn');
  }
}

// ─── UI UPDATES ──────────────────────────────────────────────────────────────

function updateUI() {
  // Ressourcen
  document.getElementById('res-food').textContent = Math.floor(G.res.food);
  document.getElementById('res-wood').textContent = Math.floor(G.res.wood);
  document.getElementById('res-iron').textContent = Math.floor(G.res.iron);
  document.getElementById('res-gold').textContent = Math.floor(G.res.gold);
  document.getElementById('res-pop').textContent  = G.pop;
  document.getElementById('res-maxpop').textContent = G.maxPop;

  // Armee
  document.getElementById('workers').textContent  = G.pop - G.warriors;
  document.getElementById('warriors').textContent = G.warriors;
  document.getElementById('army-power').textContent = totalPower();

  // Timer
  const t = Math.max(0, Math.ceil(G.timeLeft));
  const min = String(Math.floor(t/60)).padStart(2,'0');
  const sec = String(t%60).padStart(2,'0');
  const timerEl = document.getElementById('game-timer');
  timerEl.textContent = `${min}:${sec}`;
  timerEl.classList.toggle('danger', t < 60);

  // Jahreszeit
  const season = SEASONS[G.seasonIndex];
  document.getElementById('season-icon').textContent = season.icon;
  document.getElementById('season-name').textContent = season.name;

  // Buttons
  const hasBrx = !!G.built.barracks;
  const canRec = hasBrx && canAfford(WARRIOR_COST) && G.pop > G.warriors;
  document.getElementById('btn-recruit').disabled = !canRec;
  document.getElementById('btn-attack').disabled  = G.warriors <= 0 || G.lastAttack > 0;
}

function updateBuildingUI() {
  for (const [key, b] of Object.entries(BUILDINGS)) {
    const el = document.getElementById(`b-${key}`);
    if (!el) continue;
    const btn = el.querySelector('.btn-build');
    if (G.built[key]) {
      el.classList.add('built');
      btn.textContent = '✓ Gebaut';
      btn.classList.add('built-label');
      btn.disabled = true;
    } else {
      const affordable = canAfford(b.cost);
      btn.disabled = !affordable;
    }
  }
}

// ─── EREIGNISLOG ─────────────────────────────────────────────────────────────

function addEvent(msg, type='') {
  const log = document.getElementById('event-log');
  const e = document.createElement('div');
  e.className = `event-entry ${type}`;
  e.textContent = msg;
  log.insertBefore(e, log.firstChild);
  while (log.children.length > 15) log.removeChild(log.lastChild);
}

// ─── CLAN WAHL ───────────────────────────────────────────────────────────────

let selectedClan = null;

function selectClan(key) {
  selectedClan = key;
  document.getElementById('clan-wolf').classList.toggle('selected', key==='wolf');
  document.getElementById('clan-bear').classList.toggle('selected', key==='bear');
  const btn = document.getElementById('btn-start');
  btn.disabled = false;
  btn.textContent = `${CLANS[key].icon} Mit ${CLANS[key].name} spielen`;
}

// ─── SPIEL STARTEN ───────────────────────────────────────────────────────────

function startGame() {
  if (!selectedClan) return;

  initState(selectedClan);

  // Canvas konfigurieren
  canvas = document.getElementById('game-canvas');
  const container = document.getElementById('map-container');
  canvas.width  = container.clientWidth;
  canvas.height = container.clientHeight;
  ctx = canvas.getContext('2d');

  // Kamera zentrieren auf Spielerdorf
  G.camX = Math.max(0, 2 * TILE_SIZE - canvas.width * 0.25);
  G.camY = Math.max(0, Math.floor(MAP_ROWS/2) * TILE_SIZE - canvas.height/2);

  // Clan-UI setzen
  const clan = CLANS[selectedClan];
  const enemy = CLANS[selectedClan==='wolf'?'bear':'wolf'];
  document.getElementById('player-icon').textContent = clan.icon;
  document.getElementById('player-name').textContent = clan.name;
  document.getElementById('enemy-icon').textContent  = enemy.icon;
  document.getElementById('enemy-name').textContent  = enemy.name;

  // Startereignis
  addEvent(`${clan.icon} ${clan.name} erwacht! Ruhm oder Tod!`, 'good');
  addEvent(`Gegner: ${enemy.icon} ${enemy.name}`, 'warn');
  addEvent('Tipp: Bau Farm & Holzfäller zuerst!', '');

  // Screen wechseln
  document.getElementById('screen-start').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');

  // Maus-Events
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onCanvasClick);

  // Game Loop
  lastTick = performance.now();
  animFrame = requestAnimationFrame(gameLoop);
}

function gameLoop(now) {
  if (G.over) return;
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  tick(dt);
  updateBuildingUI();
  animFrame = requestAnimationFrame(gameLoop);
}

// ─── MAUS ────────────────────────────────────────────────────────────────────

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left + G.camX;
  const my = e.clientY - rect.top + G.camY;
  const col = Math.floor(mx / TILE_SIZE);
  const row = Math.floor(my / TILE_SIZE);

  if (row >= 0 && row < G.mapH && col >= 0 && col < G.mapW) {
    hoverTile = { row, col };
    const tile = G.tiles[row][col];
    const tt = TILE_TYPES[tile.type];
    const tooltip = document.getElementById('tile-tooltip');
    const res = Object.entries(tt.resources).map(([k,v])=>`+${v} ${k}`).join(', ');
    tooltip.innerHTML = `<strong>${tt.name}</strong>${res ? '<br>'+res : ''}${tile.building ? '<br>🏗 '+BUILDINGS[tile.building]?.name : ''}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
    tooltip.style.top  = (e.clientY - rect.top  - 8)  + 'px';
  } else {
    hoverTile = null;
    document.getElementById('tile-tooltip').style.display = 'none';
  }
}

function onCanvasClick(e) {
  // Kamera-Drag könnte hier kommen – vorerst kein Tile-Klick-Effekt
}

// ─── SPIELENDE ───────────────────────────────────────────────────────────────

function endGame(reason) {
  if (G.over) return;
  G.over = true;
  cancelAnimationFrame(animFrame);

  const endScreen = document.getElementById('screen-end');
  document.getElementById('screen-game').classList.remove('active');
  endScreen.classList.add('active');

  let icon, title, msg;
  if (reason === 'victory') {
    icon = '🏆'; title = 'Sieg!';
    msg = `Der ${CLANS[G.clan].name} hat triumphiert! Die Feinde liegen in Schutt und Asche.`;
  } else if (reason === 'defeat') {
    icon = '💀'; title = 'Niederlage!';
    msg = `Der ${CLANS[G.clan].name} wurde vernichtet. Die Wölfe heulen um deine Krieger.`;
  } else {
    // Zeitende → Wer hat mehr Krieger?
    const pp = totalPower() + G.pop * 2;
    const ep = enemyPower() + G.ai.pop * 2;
    if (pp > ep) { icon='🏆'; title='Sieg nach Zeit!'; msg='Dein Clan war am Ende stärker!'; }
    else if (pp < ep) { icon='💀'; title='Niederlage!'; msg='Der Feind war beim Zeitablauf mächtiger.'; }
    else { icon='⚖️'; title='Unentschieden!'; msg='Beide Clans waren gleich stark. Ehre für beide!'; }
  }

  document.getElementById('end-icon').textContent = icon;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-message').textContent = msg;

  const statsEl = document.getElementById('end-stats');
  statsEl.innerHTML = [
    { value: G.stats.buildingsBuilt,  label: 'Gebäude' },
    { value: G.stats.warriorsTrained, label: 'Krieger' },
    { value: G.stats.attacksMade,     label: 'Angriffe' },
    { value: Math.floor(G.stats.resourcesGathered), label: 'Ressourcen' },
  ].map(s => `
    <div class="end-stat">
      <span class="stat-value">${s.value}</span>
      <span class="stat-label">${s.label}</span>
    </div>
  `).join('');
}

function resetGame() {
  selectedClan = null;
  G = null;
  hoverTile = null;
  cancelAnimationFrame(animFrame);

  document.getElementById('screen-end').classList.remove('active');
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-start').classList.add('active');
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-start').textContent = 'Clan wählen';
  document.getElementById('clan-wolf').classList.remove('selected');
  document.getElementById('clan-bear').classList.remove('selected');
  document.getElementById('event-log').innerHTML = '';
}

// ─── CANVAS RESIZE ───────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (!canvas) return;
  const c = document.getElementById('map-container');
  canvas.width  = c.clientWidth;
  canvas.height = c.clientHeight;
});
