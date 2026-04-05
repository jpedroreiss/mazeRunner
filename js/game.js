import { Pathfinding } from './pathfinding.js';
import { MazeGenerator } from './maze-generator.js';
import { Sound } from './sound.js';
import { Renderer } from './renderer.js';

export const Game = (() => {

  /* ── Constantes de estado ── */
  const STATE = {
    MENU:     'menu',
    PLAYING:  'playing',
    PAUSED:   'paused',
    GAMEOVER: 'gameover',
    WIN:      'win',
  };

  const POWER_TYPE = {
    SPEED:     'speed',
    INVISIBLE: 'invisible',
    CONFUSE:   'confuse',
    LIGHT:     'light',
    STAMINA:   'stamina',
  };

  const ENEMY_TYPE = {
    CHASER:  'chaser',
    RUSHER:  'rusher',
    STALKER: 'stalker',
  };

  const LOOT_TYPE = {
    STAMINA: 'stamina',
    SPEED:   'speed',
    LIGHT:   'light',
    CONFUSE: 'confuse',
  };

  const BASE_MAZE_CELLS = 8;
  const NORMAL_SPEED_MULTIPLIER = 2.1;
  const HARD_SPEED_MULTIPLIER = 1.45;
  const HARD_BASE_SPEED_MULTIPLIER = NORMAL_SPEED_MULTIPLIER;

  /* ── Estado de jogo ── */
  let state, phase, score, highScore, lives;
  let grid, player, enemies, items, powerups, activeEffects;
  let exit, dynamicWalls, wallFlashList;
  let sectorTheme, decorTiles, zoneMap;
  let portalLinks, portalCooldownUntil = 0;
  let lootToastText = '', lootToastUntil = 0;
  let slidingWalls  = [], slideWallTimer = 0;
  let dynamicEvent  = { type: null, endsAt: 0, nextAt: 0, cycle: 0 };
  let lastTime, rafId, menuRaf;
  let phaseTimer, phaseTimerMax;
  let dayNight = 0, dayNightDir = 1, dayNightTimer = 0;
  let wallCycleTimer = 0;
  let stamina = 100;
  let cfg;
  let hardMode = localStorage.getItem('mr_hard') === '1';

  /* ── Configuração escalada por fase ── */
  function getPhaseConfig() {
    const style = getSectorStyle(phase);
    const enemyCount = hardMode
      ? Math.min(2 + Math.floor(phase * 1.35), 8)
      : Math.min(1 + Math.floor(phase * 0.9), 5);
    const enemySpeed = Math.min(0.055 + phase * 0.007, 0.13) * (hardMode ? HARD_BASE_SPEED_MULTIPLIER : 1);

    return {
      mazeCells:      BASE_MAZE_CELLS + 3 + Math.floor(phase * 1.1),
      enemyCount,
      enemySpeed,
      bfsInterval:    Math.max(700 - phase * 50, 250),
      phaseTime:      Math.max(90 - phase * 10, 45),
      dayDuration:    20000,
      nightDuration:  15000,
      dynamicWalls:   2 + phase,
      wallCycleMs:    Math.max(4000 - phase * 300, 2000),
      itemCount:      4 + phase,
      slideWallCount: Math.min(1 + Math.floor(phase / 2), 4),
      slideWallMs:    Math.max(1800 - phase * 90, 900),
      mazeStyle:      style,
    };
  }

  function getSectorStyle(currentPhase) {
    const mode = (currentPhase - 1) % 3;

    if (mode === 0) return {
      name: 'Setor Verde', themeType: 'ruinas',
      doorColor: '#7b4e2f', doorFrameColor: '#c99b63',
      loopsChance: 0.3, areaPatches: Math.max(6, Math.floor(currentPhase * 2.2)),
      areaMaxW: 4, areaMaxH: 3, areaCarveChance: 0.88,
      longCuts: 2 + Math.floor(currentPhase * 0.6), longCutLen: 7, longCutThickness: 2,
      decoDensity: 0.11, dynamicBurst: 1, eventBias: ['growth', 'rush'],
    };

    if (mode === 1) return {
      name: 'Setor Madeira', themeType: 'quebrada',
      doorColor: '#6e4a2f', doorFrameColor: '#d3ba92',
      loopsChance: 0.24, areaPatches: Math.max(5, Math.floor(currentPhase * 1.8)),
      areaMaxW: 4, areaMaxH: 2, areaCarveChance: 0.82,
      longCuts: 4 + Math.floor(currentPhase * 0.8), longCutLen: 9, longCutThickness: 2,
      decoDensity: 0.12, dynamicBurst: 2, eventBias: ['growth', 'quake'],
    };

    return {
      name: 'Setor Metal', themeType: 'corredor',
      doorColor: '#58636c', doorFrameColor: '#d2d7dd',
      loopsChance: 0.2, areaPatches: Math.max(4, Math.floor(currentPhase * 1.5)),
      areaMaxW: 2, areaMaxH: 2, areaCarveChance: 0.76,
      longCuts: 5 + currentPhase, longCutLen: 11, longCutThickness: 1,
      decoDensity: 0.08, dynamicBurst: 2, eventBias: ['rush', 'quake'],
    };
  }

  /* ── Inicialização ── */
  function init() {
    setupInput();
    Renderer.init(document.getElementById('canvas'));
    state     = STATE.MENU;
    highScore = parseInt(localStorage.getItem('mr_hi') || '0');
    startMenuLoop();
  }

  function startMenuLoop() {
    const frameData = {
      state, score: 0, highScore, lives: 3, phase: 1,
      grid: [], player: null, enemies: [], items: [], powerups: [],
      activeEffects: {}, exit: null, dynamicWalls: [], wallFlash: [],
      dayNight: 0, stamina: 100, sectorTheme: null,
      decorTiles: [], zoneMap: null, lootToast: null,
      hardMode,
    };
    Renderer.render(frameData);
    menuRaf = requestAnimationFrame(startMenuLoop);
  }

  function startGame() {
    if (menuRaf) { cancelAnimationFrame(menuRaf); menuRaf = null; }
    phase   = 1;
    score   = 0;
    lives   = 3;
    dayNight= 0;
    loadPhase();
  }

  /* ── Carregamento de fase ── */
  function loadPhase() {
    if (rafId) cancelAnimationFrame(rafId);

    cfg         = getPhaseConfig();
    grid        = MazeGenerator.generate(cfg.mazeCells, cfg.mazeCells, cfg.mazeStyle);
    sectorTheme = cfg.mazeStyle;

    const openCells = MazeGenerator.getOpenCells(grid);
    const startCell = openCells[0];
    const exitCell  = findFarthestCell(startCell, openCells);
    exit = { x: exitCell.x, y: exitCell.y };

    const excludedCells = [startCell, exit];

    const itemCells = MazeGenerator.randomOpenCells(grid, cfg.itemCount, excludedCells);
    items = itemCells.map(p => ({ x: p.x, y: p.y, collected: false, loot: rollLootType() }));
    excludedCells.push(...itemCells);

    powerups = [];

    const enemySpawns = pickEnemySpawns(grid, cfg.enemyCount, excludedCells, startCell, Math.min(8 + phase, 16));
    const enemyTypes  = [ENEMY_TYPE.STALKER, ENEMY_TYPE.RUSHER, ENEMY_TYPE.CHASER];
    enemies = enemySpawns.map((pos, i) => createEnemy(pos, enemyTypes[i % enemyTypes.length]));

    dynamicWalls   = buildDynamicWalls();
    wallFlashList  = [];
    wallCycleTimer = cfg.wallCycleMs;
    decorTiles     = buildDecorTiles(openCells, startCell, exit, sectorTheme);
    zoneMap        = buildZoneMap(grid, openCells, startCell, exit);
    portalLinks    = buildPortalLinks(zoneMap);
    slidingWalls   = buildSlidingWalls(grid, startCell, exit, cfg.slideWallCount);
    slideWallTimer = cfg.slideWallMs;
    dynamicEvent   = { type: null, endsAt: 0, nextAt: performance.now() + 9000, cycle: 0 };

    player = {
      x: startCell.x, y: startCell.y,
      rx: startCell.x, ry: startCell.y,
      targetX: startCell.x, targetY: startCell.y,
      moving: false, baseSpeed: hardMode ? 0.092 * HARD_BASE_SPEED_MULTIPLIER : 0.092,
      direction: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 },
      get speed() { return isEffectActive(POWER_TYPE.SPEED) ? this.baseSpeed * getSpeedLootMultiplier() : this.baseSpeed; },
    };

    activeEffects = {};
    lootToastText = '';
    lootToastUntil= 0;
    stamina       = 100;
    phaseTimerMax = cfg.phaseTime;
    phaseTimer    = phaseTimerMax;
    dayNight      = 0;
    dayNightDir   = 1;
    dayNightTimer = 0;

    state    = STATE.PLAYING;
    lastTime = performance.now();

    console.log(`[MazeRunner] Setor ${phase} (${cfg.mazeStyle.name}) | Grid ${grid[0].length}×${grid.length} | Inimigos: ${enemies.length}`);
    rafId = requestAnimationFrame(gameLoop);
  }

  /* ── Loop de jogo ── */
  function gameLoop(timestamp) {
    rafId = requestAnimationFrame(gameLoop);
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    if (state === STATE.PLAYING) update(dt, timestamp);

    Renderer.render({
      state, grid, player, enemies, items, powerups,
      activeEffects, score, highScore, lives, phase, exit,
      dynamicWalls: dynamicWalls.filter(w => !w.open),
      wallFlash:    wallFlashList,
      dayNight, phaseTimer, phaseTimerMax, stamina,
      sectorTheme, decorTiles, zoneMap,
      eventInfo:  { type: dynamicEvent.type, cycle: dynamicEvent.cycle },
      lootToast:  performance.now() < lootToastUntil ? lootToastText : null,
      hardMode,
    });
  }

  function update(dt, timestamp) {
    tickDynamicEvents(timestamp);
    tickEffects(timestamp);
    tickDayNight(dt);
    tickDynamicWalls(dt);
    tickSlidingWalls(dt);
    tickPhaseTimer(dt);
    tickStamina(dt);
    movePlayer(dt);
    moveEnemies(timestamp);
    checkCollisions();
  }

  /* ── Encontra célula mais distante (saída) ── */
  function findFarthestCell(start, openCells) {
    let best = openCells[openCells.length - 1], bestDist = 0;
    const samples = openCells.filter((_, i) => i % 3 === 0).slice(0, 60);
    for (const candidate of samples) {
      const path = Pathfinding.bfs(grid, start, candidate);
      if (path && path.length > bestDist) { bestDist = path.length; best = candidate; }
    }
    return best;
  }

  function pickEnemySpawns(grid, count, exclude, startCell, minDist) {
    const excluded = new Set(exclude.map(p => `${p.x},${p.y}`));
    const open     = MazeGenerator.getOpenCells(grid).filter(p => !excluded.has(`${p.x},${p.y}`));
    let dist       = minDist;
    while (dist >= 3) {
      const farCells = open.filter(p => Pathfinding.manhattan(p, startCell) >= dist);
      if (farCells.length >= count) return MazeGenerator.shuffle(farCells).slice(0, count);
      dist--;
    }
    return MazeGenerator.shuffle(open).slice(0, count);
  }

  /* ── Construção dos sistemas do labirinto ── */
  function buildZoneMap(grid, openCells, startCell, exitCell) {
    const H     = grid.length, W = grid[0].length;
    const zones = Array.from({ length: H }, () => new Array(W).fill(0));

    // Manchas de bioma (verde / cinza)
    const centers = MazeGenerator.shuffle(openCells.slice())
      .slice(0, Math.min(12, Math.max(5, Math.floor(openCells.length * 0.025))));

    centers.forEach((c, i) => {
      if ((c.x === startCell.x && c.y === startCell.y) || (c.x === exitCell.x && c.y === exitCell.y)) return;
      const type   = (i % 2) + 1;
      const radius = 2 + Math.floor(Math.random() * 4);
      for (let y = c.y - radius; y <= c.y + radius; y++) {
        for (let x = c.x - radius; x <= c.x + radius; x++) {
          if (y < 0 || y >= H || x < 0 || x >= W || grid[y][x] !== 0) continue;
          if (Math.abs(x - c.x) + Math.abs(y - c.y) <= radius) zones[y][x] = type;
        }
      }
    });

    // Corredores de metal
    const metalSeeds = MazeGenerator.shuffle(openCells.slice())
      .slice(0, Math.max(2, Math.floor(openCells.length * 0.01)));

    metalSeeds.forEach(seed => {
      const horizontal = Math.random() < 0.5;
      const len        = 4 + Math.floor(Math.random() * 8);
      for (let i = 0; i < len; i++) {
        const x = horizontal ? seed.x + i : seed.x;
        const y = horizontal ? seed.y     : seed.y + i;
        if (y < 0 || y >= H || x < 0 || x >= W || grid[y][x] !== 0) break;
        if ((x === startCell.x && y === startCell.y) || (x === exitCell.x && y === exitCell.y)) continue;
        zones[y][x] = 3;
      }
    });

    // Túneis
    const tunnelSeeds = MazeGenerator.shuffle(openCells.slice())
      .slice(0, Math.max(2, Math.floor(openCells.length * 0.008)));

    tunnelSeeds.forEach(seed => {
      const radius = 2 + Math.floor(Math.random() * 3);
      for (let y = seed.y - radius; y <= seed.y + radius; y++) {
        for (let x = seed.x - radius; x <= seed.x + radius; x++) {
          if (y < 0 || y >= H || x < 0 || x >= W || grid[y][x] !== 0) continue;
          if ((x === startCell.x && y === startCell.y) || (x === exitCell.x && y === exitCell.y)) continue;
          if (Math.abs(x - seed.x) + Math.abs(y - seed.y) <= radius) zones[y][x] = 4;
        }
      }
    });

    // Portais em pares
    const portalCandidates = MazeGenerator.shuffle(openCells.slice()).filter(p => {
      if ((p.x === startCell.x && p.y === startCell.y) || (p.x === exitCell.x && p.y === exitCell.y)) return false;
      return zones[p.y][p.x] !== 4;
    });
    const portalPairCount = Math.min(2, Math.max(1, Math.floor(phase / 3)));
    for (let i = 0; i < portalPairCount; i++) {
      const a = portalCandidates[i * 2];
      const b = portalCandidates[i * 2 + 1];
      if (!a || !b || Pathfinding.manhattan(a, b) < 8) continue;
      zones[a.y][a.x] = 5;
      zones[b.y][b.x] = 5;
    }

    return zones;
  }

  function buildPortalLinks(zones) {
    const nodes = [];
    for (let y = 0; y < zones.length; y++) {
      for (let x = 0; x < zones[y].length; x++) {
        if (zones[y][x] === 5) nodes.push({ x, y });
      }
    }
    const links = {};
    for (let i = 0; i + 1 < nodes.length; i += 2) {
      const a = nodes[i], b = nodes[i + 1];
      links[`${a.x},${a.y}`] = { x: b.x, y: b.y };
      links[`${b.x},${b.y}`] = { x: a.x, y: a.y };
    }
    return links;
  }

  function buildDecorTiles(openCells, startCell, exitCell, style) {
    const density = Math.max(0.03, Math.min(0.18, style?.decoDensity ?? 0.08));
    const tiles   = [];
    for (const p of openCells) {
      if ((p.x === startCell.x && p.y === startCell.y) || (p.x === exitCell.x && p.y === exitCell.y)) continue;
      if (Math.abs(p.x - exitCell.x) + Math.abs(p.y - exitCell.y) < 3) continue;
      if (Math.random() < density) tiles.push({ x: p.x, y: p.y });
      if (tiles.length > 320) break;
    }
    return tiles;
  }

  function buildDynamicWalls() {
    const candidates = MazeGenerator.findDynamicWallCandidates(grid, cfg.dynamicWalls * 3);
    const walls      = [];
    for (const c of candidates) {
      if (walls.length >= cfg.dynamicWalls) break;
      walls.push({ x: c.x, y: c.y, open: false, timer: Math.random() * cfg.wallCycleMs });
    }
    return walls;
  }

  function buildSlidingWalls(grid, startCell, exitCell, count) {
    const openCells  = MazeGenerator.getOpenCells(grid);
    const candidates = MazeGenerator.shuffle(openCells.slice()).filter(p => {
      if ((p.x === startCell.x && p.y === startCell.y) || (p.x === exitCell.x && p.y === exitCell.y)) return false;
      const left  = isCellFree(p.x - 1, p.y), right = isCellFree(p.x + 1, p.y);
      const up    = isCellFree(p.x, p.y - 1), down  = isCellFree(p.x, p.y + 1);
      return (left && right && !up && !down) || (up && down && !left && !right);
    });

    const sliders = [];
    for (const c of candidates) {
      if (sliders.length >= count) break;
      const left = isCellFree(c.x - 1, c.y), right = isCellFree(c.x + 1, c.y);
      const axis = (left && right) ? 'x' : 'y';
      const min  = axis === 'x' ? c.x - 1 : c.y - 1;
      const max  = axis === 'x' ? c.x + 1 : c.y + 1;

      const savedVal = grid[c.y][c.x];
      grid[c.y][c.x] = 1;
      const stillConnected = Pathfinding.isConnected(grid, startCell, exitCell);
      const playerNotBlocked = !(player && player.x === c.x && player.y === c.y);
      if (!stillConnected || !playerNotBlocked) { grid[c.y][c.x] = savedVal; continue; }

      sliders.push({ x: c.x, y: c.y, axis, min, max, dir: Math.random() < 0.5 ? -1 : 1 });
    }
    return sliders;
  }

  /* ── Loot ── */
  function rollLootType() {
    const r = Math.random();
    if (r < 0.30)  return LOOT_TYPE.STAMINA;
    if (r < 0.58)  return LOOT_TYPE.SPEED;
    if (r < 0.82)  return LOOT_TYPE.LIGHT;
    return LOOT_TYPE.CONFUSE;
  }

  function openLootBox(item) {
    item.collected = true;
    const loot = item.loot || LOOT_TYPE.STAMINA;

    if (loot === LOOT_TYPE.STAMINA) {
      stamina = Math.min(100, stamina + 28);
      lootToastText = '+stamina';
    } else if (loot === LOOT_TYPE.SPEED) {
      activateEffect(POWER_TYPE.SPEED);
      lootToastText = 'SPEED!';
    } else if (loot === LOOT_TYPE.LIGHT) {
      activateEffect(POWER_TYPE.LIGHT);
      lootToastText = 'LIGHT!';
    } else if (loot === LOOT_TYPE.CONFUSE) {
      activateEffect(POWER_TYPE.CONFUSE);
      lootToastText = 'CONFUSE!';
    }

    lootToastUntil = performance.now() + 1400;
    Sound.play('collect');
  }

  /* ── Paredes dinâmicas ── */
  function tickDynamicWalls(dt) {
    wallFlashList  = wallFlashList.filter(f => performance.now() - f.t < 500);
    wallCycleTimer -= dt * 1000;
    if (wallCycleTimer > 0) return;
    wallCycleTimer = cfg.wallCycleMs * (0.8 + Math.random() * 0.4);

    const quakeBurst = dynamicEvent.type === 'quake' ? 2 : 0;
    const burst      = 1 + Math.min(2, Math.floor(phase / 3)) + (cfg.mazeStyle.dynamicBurst || 0) + quakeBurst;
    for (let i = 0; i < burst; i++) toggleOneDynamicWall();
  }

  function toggleOneDynamicWall() {
    if (!dynamicWalls.length) return;
    const wall     = dynamicWalls[Math.floor(Math.random() * dynamicWalls.length)];
    const newState = !wall.open;

    if (!newState) {
      grid[wall.y][wall.x] = 1;
      if (!Pathfinding.isConnected(grid, { x: player.x, y: player.y }, exit)) {
        grid[wall.y][wall.x] = 0;
        return;
      }
    } else {
      grid[wall.y][wall.x] = 0;
    }

    wall.open = newState;
    wallFlashList.push({ x: wall.x, y: wall.y, t: performance.now() });
    Sound.play('wallshift');
  }

  function tickSlidingWalls(dt) {
    if (!slidingWalls.length) return;
    slideWallTimer -= dt * 1000;
    if (slideWallTimer > 0) return;

    const speedMul = dynamicEvent.type === 'quake' ? 0.7 : 1;
    slideWallTimer = cfg.slideWallMs * speedMul * (0.8 + Math.random() * 0.4);

    const iterations = 1 + Math.min(1, Math.floor(phase / 4)) + (dynamicEvent.type === 'growth' ? 1 : 0);
    for (let i = 0; i < iterations; i++) moveOneSlidingWall();
  }

  function moveOneSlidingWall() {
    if (!slidingWalls.length) return;
    const slider = slidingWalls[Math.floor(Math.random() * slidingWalls.length)];
    let nx = slider.x, ny = slider.y;

    if (slider.axis === 'x') nx += slider.dir;
    else                     ny += slider.dir;

    const posAlongAxis = slider.axis === 'x' ? nx : ny;
    if (posAlongAxis < slider.min || posAlongAxis > slider.max) {
      slider.dir *= -1;
      nx = slider.x; ny = slider.y;
      if (slider.axis === 'x') nx += slider.dir;
      else                     ny += slider.dir;
    }

    if (!grid[ny] || grid[ny][nx] !== 0) return;
    const playerOnCurrent = player.x === slider.x  && player.y === slider.y;
    const playerOnTarget  = player.x === nx        && player.y === ny;
    const exitOnCurrent   = exit.x   === slider.x  && exit.y   === slider.y;
    const exitOnTarget    = exit.x   === nx         && exit.y   === ny;
    if (playerOnCurrent || playerOnTarget || exitOnCurrent || exitOnTarget) return;
    if (enemies.some(e => (e.x === nx && e.y === ny) || (e.x === slider.x && e.y === slider.y))) return;

    grid[slider.y][slider.x] = 0;
    grid[ny][nx] = 1;

    if (!Pathfinding.isConnected(grid, { x: player.x, y: player.y }, exit)) {
      grid[slider.y][slider.x] = 1;
      grid[ny][nx] = 0;
      return;
    }

    slider.x = nx; slider.y = ny;
    wallFlashList.push({ x: nx, y: ny, t: performance.now() });
    Sound.play('wallshift');
  }

  /* ── Eventos dinâmicos ── */
  function tickDynamicEvents(timestamp) {
    if (dynamicEvent.type && timestamp >= dynamicEvent.endsAt) {
      dynamicEvent.type  = null;
      dynamicEvent.nextAt= timestamp + 12000 + Math.random() * 9000;
    }

    if (!dynamicEvent.type && timestamp >= dynamicEvent.nextAt) {
      const pool = cfg.mazeStyle.eventBias?.length
        ? cfg.mazeStyle.eventBias.concat(['quake', 'rush', 'growth'])
        : ['quake', 'rush', 'growth'];
      dynamicEvent.type  = pool[Math.floor(Math.random() * pool.length)];
      dynamicEvent.endsAt= timestamp + 6500 + Math.random() * 3500;
      dynamicEvent.cycle++;
    }
  }

  /* ── Timer da fase ── */
  function tickPhaseTimer(dt) {
    phaseTimer -= dt;
    if (phaseTimer <= 10 && phaseTimer + dt > 10) Sound.play('tick');
    if (phaseTimer <= 5  && phaseTimer + dt > 5)  Sound.play('tick');

    if (phaseTimer <= 0) {
      phaseTimer = 0;
      Sound.play('death');
      lives--;
      if (lives <= 0) { endGame(); return; }
      loadPhase();
    }
  }

  /* ── Ciclo dia/noite ── */
  function tickDayNight(dt) {
    dayNightTimer += dt * 1000;
    const cycleDuration = dayNightDir === 1 ? cfg.dayDuration : cfg.nightDuration;
    const progress      = dayNightTimer / cycleDuration;

    if (dayNightDir === 1) {
      dayNight = Math.min(1, progress);
      if (progress >= 1) {
        dayNight = 1; dayNightDir = -1; dayNightTimer = 0;
        Sound.play('nightfall');
        enemies.forEach(e => e.bfsInterval = Math.max(cfg.bfsInterval * 0.6, 150));
      }
    } else {
      dayNight = Math.max(0, 1 - progress);
      if (progress >= 1) {
        dayNight = 0; dayNightDir = 1; dayNightTimer = 0;
        Sound.play('dawn');
        enemies.forEach(e => e.bfsInterval = cfg.bfsInterval);
      }
    }
  }

  /* ── Stamina ── */
  function tickStamina(dt) {
    if (isEffectActive(POWER_TYPE.STAMINA)) {
      stamina = Math.min(100, stamina + dt * 25);
    } else if (dayNight > 0.5) {
      stamina = Math.max(0, stamina - dt * 3);
    }

    const baseSpeed = hardMode ? 0.092 * HARD_BASE_SPEED_MULTIPLIER : 0.092;
    const exhaustedSpeed = hardMode ? 0.055 * HARD_BASE_SPEED_MULTIPLIER : 0.055;
    player.baseSpeed = stamina <= 0 && !isEffectActive(POWER_TYPE.INVISIBLE) ? exhaustedSpeed : baseSpeed;
  }

  /* ── Efeitos de poder ── */
  function isEffectActive(key) {
    return activeEffects[key] && performance.now() < activeEffects[key];
  }

  function activateEffect(type) {
    const durations = {
      [POWER_TYPE.SPEED]:     7000,
      [POWER_TYPE.INVISIBLE]: 6000,
      [POWER_TYPE.CONFUSE]:   5000,
      [POWER_TYPE.LIGHT]:     9000,
      [POWER_TYPE.STAMINA]:   8000,
    };
    activeEffects[type] = performance.now() + durations[type];
    if (type === POWER_TYPE.CONFUSE) enemies.forEach(e => e.confused = true);
    if (type === POWER_TYPE.STAMINA) stamina = Math.min(100, stamina + 40);
    Sound.play('powerup');
  }

  function tickEffects(timestamp) {
    for (const key of Object.keys(activeEffects)) {
      if (timestamp >= activeEffects[key]) {
        delete activeEffects[key];
        if (key === POWER_TYPE.CONFUSE) enemies.forEach(e => e.confused = false);
      }
    }
  }

  /* ── Movimento do jogador ── */
  function movePlayer(dt) {
    if (!player.moving) {
      for (const dir of [player.nextDir, player.direction]) {
        if (!dir.x && !dir.y) continue;
        const nx = player.x + dir.x, ny = player.y + dir.y;
        if (isCellFree(nx, ny)) {
          player.direction = dir;
          player.targetX   = nx;
          player.targetY   = ny;
          player.moving    = true;
          break;
        }
      }
    }

    if (player.moving) {
      const dx   = player.targetX - player.rx;
      const dy   = player.targetY - player.ry;
      const dist = Math.hypot(dx, dy);
      const step = player.speed * getTerrainMultiplier(player.x, player.y);

      if (dist <= step) {
        player.rx = player.targetX; player.ry = player.targetY;
        player.x  = player.targetX; player.y  = player.targetY;
        player.moving = false;
      } else {
        player.rx += (dx / dist) * step;
        player.ry += (dy / dist) * step;
      }
    }
  }

  function getZoneAt(x, y)              { return zoneMap?.[y]?.[x] ?? 0; }
  function getTerrainMultiplier(x, y)   {
    const zone = getZoneAt(x, y);
    if (zone === 3) return 1.14;  // metal: mais rápido
    if (zone === 4) return 0.82;  // túnel: mais lento
    return 1;
  }

  /* ── Inimigos ── */
  function createEnemy(pos, type) {
    const speedMultipliers = {
      [ENEMY_TYPE.CHASER]:  0.65,
      [ENEMY_TYPE.RUSHER]:  1.25,
      [ENEMY_TYPE.STALKER]: 0.85,
    };
    return {
      x: pos.x, y: pos.y,
      rx: pos.x, ry: pos.y,
      spawnX: pos.x, spawnY: pos.y,
      targetX: pos.x, targetY: pos.y,
      leashRadius:      Math.min(7  + Math.floor(phase * 0.7), 12),
      activationRadius: Math.min(9  + Math.floor(phase * 0.8), 15),
      awake: false, moving: false, type,
      speed: cfg.enemySpeed * speedMultipliers[type],
      path: [], lastBFS: 0, bfsInterval: cfg.bfsInterval, confused: false,
    };
  }

  function moveEnemies(timestamp) {
    const invisible = isEffectActive(POWER_TYPE.INVISIBLE);
    for (const enemy of enemies) {
      if (!enemy.moving && timestamp - enemy.lastBFS >= enemy.bfsInterval) {
        enemy.lastBFS = timestamp;
        enemy.path    = (enemy.confused || invisible)
          ? [Pathfinding.randomNeighbor(grid, { x: enemy.x, y: enemy.y })]
          : computeEnemyPath(enemy);
      }
      advanceEnemy(enemy);
    }
  }

  function computeEnemyPath(enemy) {
    const src   = { x: enemy.x,      y: enemy.y      };
    const dest  = { x: player.x,     y: player.y     };
    const spawn = { x: enemy.spawnX, y: enemy.spawnY };

    const distPlayerToSpawn = Pathfinding.manhattan(spawn, dest);
    const distEnemyToSpawn  = Pathfinding.manhattan(spawn, src);
    const isAwake           = distPlayerToSpawn <= enemy.activationRadius;
    enemy.awake = isAwake;

    if (!isAwake) {
      if (distEnemyToSpawn > Math.max(1, enemy.leashRadius - 1))
        return Pathfinding.bfs(grid, src, spawn) || [];
      return Pathfinding.bfs(grid, src, randomPatrolTarget(enemy)) || [Pathfinding.randomNeighbor(grid, src)];
    }

    if (distPlayerToSpawn > enemy.leashRadius)
      return Pathfinding.bfs(grid, src, spawn) || [];

    if (enemy.type === ENEMY_TYPE.CHASER)  return Pathfinding.bfs(grid, src, dest) || [];
    if (enemy.type === ENEMY_TYPE.RUSHER)  return Math.random() < 0.58
      ? Pathfinding.bfs(grid, src, dest) || []
      : [Pathfinding.randomNeighbor(grid, src)];

    if (enemy.type === ENEMY_TYPE.STALKER) {
      const visionRange = dayNight > 0.5 ? 16 + phase : 8 + phase;
      return Pathfinding.manhattan(src, dest) <= visionRange
        ? Pathfinding.bfs(grid, src, dest) || []
        : [Pathfinding.randomNeighbor(grid, src)];
    }

    return [];
  }

  function advanceEnemy(enemy) {
    if (enemy.moving) {
      const dx    = enemy.targetX - enemy.rx;
      const dy    = enemy.targetY - enemy.ry;
      const dist  = Math.hypot(dx, dy);
      const step  = enemy.speed * (dynamicEvent.type === 'rush' ? 1.16 : 1);

      if (dist <= step) {
        enemy.rx = enemy.targetX; enemy.ry = enemy.targetY;
        enemy.x  = enemy.targetX; enemy.y  = enemy.targetY;
        enemy.moving = false;
      } else {
        enemy.rx += (dx / dist) * step;
        enemy.ry += (dy / dist) * step;
      }
      return;
    }

    if (enemy.path.length > 1) {
      enemy.path.shift();
      const next = enemy.path[0];
      if (next && isCellFree(next.x, next.y)) {
        enemy.targetX = next.x;
        enemy.targetY = next.y;
        enemy.moving  = true;
      }
    }
  }

  function randomPatrolTarget(enemy) {
    const sx = enemy.spawnX, sy = enemy.spawnY;
    for (let i = 0; i < 10; i++) {
      const dx = Math.floor((Math.random() * 2 - 1) * enemy.leashRadius);
      const dy = Math.floor((Math.random() * 2 - 1) * enemy.leashRadius);
      if (Math.abs(dx) + Math.abs(dy) > enemy.leashRadius) continue;
      const tx = sx + dx, ty = sy + dy;
      if (isCellFree(tx, ty)) return { x: tx, y: ty };
    }
    return { x: sx, y: sy };
  }

  function getSpeedLootMultiplier() {
    return hardMode ? HARD_SPEED_MULTIPLIER : NORMAL_SPEED_MULTIPLIER;
  }

  function toggleHardMode() {
    hardMode = !hardMode;
    localStorage.setItem('mr_hard', hardMode ? '1' : '0');
    window.dispatchEvent(new CustomEvent('maze:hardmodechange', { detail: { hardMode } }));
  }

  function setHardMode(enabled) {
    hardMode = !!enabled;
    localStorage.setItem('mr_hard', hardMode ? '1' : '0');
    window.dispatchEvent(new CustomEvent('maze:hardmodechange', { detail: { hardMode } }));
  }

  function getHardMode() {
    return hardMode;
  }

  /* ── Colisões ── */
  function checkCollisions() {
    // Coleta de lootboxes
    (items || []).forEach(item => {
      if (!item.collected && item.x === player.x && item.y === player.y) openLootBox(item);
    });

    // Chegou na saída
    if (exit && player.x === exit.x && player.y === exit.y) {
      reachExit();
      return;
    }

    // Portal de teleporte
    if (performance.now() >= portalCooldownUntil) {
      const portalKey = `${player.x},${player.y}`;
      const target    = portalLinks?.[portalKey];
      if (target && isCellFree(target.x, target.y)) {
        player.x = target.x; player.y = target.y;
        player.rx= target.x; player.ry= target.y;
        player.targetX = target.x; player.targetY = target.y;
        player.moving  = false;
        portalCooldownUntil = performance.now() + 550;
        Sound.play('powerup');
      }
    }

    // Colisão com inimigos (invisibilidade protege)
    if (!isEffectActive(POWER_TYPE.INVISIBLE)) {
      for (const enemy of enemies) {
        if (Math.abs(enemy.rx - player.rx) < 0.52 && Math.abs(enemy.ry - player.ry) < 0.52) {
          die();
          return;
        }
      }
    }
  }

  function reachExit() {
    const bonusTime   = Math.ceil(phaseTimer) * 3;
    const bonusLoot   = items.every(i => i.collected) ? 100 : 0;
    score += bonusTime + bonusLoot;

    Sound.play('exit');
    state = STATE.WIN;
    player.direction = { x: 0, y: 0 };
    player.nextDir   = { x: 0, y: 0 };
    player.moving    = false;
    phase++;

    setTimeout(() => { if (state === STATE.WIN) loadPhase(); }, 1200);
  }

  function die() {
    lives--;
    Sound.play('death');
    if (lives <= 0) { endGame(); return; }

    const startCell = MazeGenerator.getOpenCells(grid)[0];
    player.x = startCell.x; player.y = startCell.y;
    player.rx= startCell.x; player.ry= startCell.y;
    player.targetX = startCell.x; player.targetY = startCell.y;
    player.moving  = false;
    player.direction = { x: 0, y: 0 };
    player.nextDir   = { x: 0, y: 0 };

    activeEffects = {};
    stamina = 60;

    enemies.forEach(e => {
      e.x = e.spawnX; e.y = e.spawnY;
      e.rx= e.spawnX; e.ry= e.spawnY;
      e.targetX = e.spawnX; e.targetY = e.spawnY;
      e.moving  = false; e.path = []; e.confused = false; e.lastBFS = 0;
    });
  }

  function endGame() {
    if (score > highScore) { highScore = score; localStorage.setItem('mr_hi', highScore); }
    if (rafId) cancelAnimationFrame(rafId);
    state = STATE.GAMEOVER;

    const renderGameOver = () => {
      Renderer.render({
        state: STATE.GAMEOVER, score, highScore, lives: 0, phase,
        grid: [], player: null, enemies: [], items: [], powerups: [],
        activeEffects: {}, exit: null, dynamicWalls: [], wallFlash: [],
        dayNight: 0, stamina: 0, sectorTheme: null,
        decorTiles: [], zoneMap: null, lootToast: null,
      });
      menuRaf = requestAnimationFrame(renderGameOver);
    };
    menuRaf = requestAnimationFrame(renderGameOver);
  }

  function isCellFree(x, y) {
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return false;
    return grid[y][x] === 0;
  }

  /* ── Input ── */
  function setupInput() {
    const keyToDir = {
      ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1},
      ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
      KeyW: {x:0,y:-1}, KeyS: {x:0,y:1},
      KeyA: {x:-1,y:0}, KeyD: {x:1,y:0},
    };

    document.addEventListener('keydown', e => {
      if (keyToDir[e.code]) {
        e.preventDefault();
        if (player) player.nextDir = keyToDir[e.code];
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        if      (state === STATE.PLAYING) state = STATE.PAUSED;
        else if (state === STATE.PAUSED)  { state = STATE.PLAYING; lastTime = performance.now(); }
      }

      if ((e.code === 'Enter' || e.code === 'Space') &&
          (state === STATE.MENU || state === STATE.GAMEOVER)) startGame();
    });

    // Touch: swipe para mover, tap para iniciar
    let touchStartX = 0, touchStartY = 0;

    document.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;

      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
        if (state === STATE.MENU || state === STATE.GAMEOVER) startGame();
        return;
      }

      if (!player) return;
      if (Math.abs(dx) > Math.abs(dy)) player.nextDir = dx > 0 ? {x:1,y:0} : {x:-1,y:0};
      else                             player.nextDir = dy > 0 ? {x:0,y:1} : {x:0,y:-1};
    }, { passive: true });

    document.addEventListener('click', () => {
      if (state === STATE.MENU || state === STATE.GAMEOVER) startGame();
    });
  }

  return { init, startGame, getState: () => state, setHardMode, getHardMode };
})();