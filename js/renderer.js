export const Renderer = (() => {
  let canvas, ctx, tileSize = 20;

  /* ── Paletas de cor (dia / noite) ── */
  const PALETTE_DAY = {
    bgSky: '#87ceeb', bgGround: '#2d4a1e',
    wall: '#4a3728', wallShade: '#6b4f3a', wallTop: '#5c4535',
    floor: '#3d5a1e', floorAlt: '#2d4a1e',
    player: '#e8c84a', playerGlow: '#ffd700',
    enemy: { chaser: '#cc2200', rusher: '#cc6600', stalker: '#8833cc' },
    exit: '#00ff88', exitGlow: '#00cc66',
    item: '#ffd700', itemGlow: '#c8891a',
    powerup: { speed: '#00ddff', stamina: '#ff6b8a', light: '#ffffaa' },
    hud: 'rgba(10,10,6,0.85)', text: '#f0e8d0', dim: '#8b7355',
    dynamicWall: '#8b6914', dynamicOpen: '#4a7a2a',
    ambient: 'rgba(255,220,100,0)',
    timerOk: '#c8d870', timerWarn: '#ff9900', timerCrit: '#ff2244',
  };

  const PALETTE_NIGHT = {
    bgSky: '#0a0f1e', bgGround: '#0f1a0a',
    wall: '#1a1208', wallShade: '#2a1e0a', wallTop: '#221508',
    floor: '#0f1a08', floorAlt: '#0a1205',
    player: '#e8c84a', playerGlow: '#c8891a',
    enemy: { chaser: '#ff4422', rusher: '#ff8822', stalker: '#aa55ff' },
    exit: '#00ff88', exitGlow: '#00ffaa',
    item: '#c8891a', itemGlow: '#8b5a00',
    powerup: { speed: '#00aacc', stamina: '#cc4466', light: '#ffff88' },
    hud: 'rgba(5,5,10,0.9)', text: '#c8b898', dim: '#556644',
    dynamicWall: '#5a4000', dynamicOpen: '#1a3a0a',
    ambient: 'rgba(0,0,30,0.45)',
    timerOk: '#88aa44', timerWarn: '#cc7700', timerCrit: '#ff2244',
  };

  let palette = { ...PALETTE_DAY };
  let particles = [];
  let menuAnimTime = 0;    // para animação da tela inicial
  let menuLastTs  = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  /* ── Interpolação de paleta dia/noite ── */
  function blendPalette(nightAmount) {
    palette.bgSky   = lerpColor(PALETTE_DAY.bgSky,   PALETTE_NIGHT.bgSky,   nightAmount);
    palette.wall    = lerpColor(PALETTE_DAY.wall,     PALETTE_NIGHT.wall,    nightAmount);
    palette.wallShade = lerpColor(PALETTE_DAY.wallShade, PALETTE_NIGHT.wallShade, nightAmount);
    palette.floor   = lerpColor(PALETTE_DAY.floor,    PALETTE_NIGHT.floor,   nightAmount);
    palette.fog     = nightAmount;
    palette.ambient = `rgba(0,0,${Math.round(30 * nightAmount)},${nightAmount * 0.45})`;
    palette.enemy   = nightAmount > 0.5 ? PALETTE_NIGHT.enemy   : PALETTE_DAY.enemy;
    palette.item    = nightAmount > 0.5 ? PALETTE_NIGHT.item     : PALETTE_DAY.item;
    palette.itemGlow= nightAmount > 0.5 ? PALETTE_NIGHT.itemGlow : PALETTE_DAY.itemGlow;
  }

  function lerpColor(colorA, colorB, t) {
    const a = parseRgb(colorA);
    const b = parseRgb(colorB);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl= Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function parseRgb(color) {
    if (color.startsWith('rgb')) {
      const m = color.match(/\d+/g);
      return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
    }
    const h = color.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16),
    ];
  }

  /* ── Helpers de tamanho e câmera ── */
  function calculateTileSize(grid) {
    const base = Math.floor(Math.min(canvas.width, canvas.height) / 10);
    return Math.max(20, Math.min(base, 60));
  }

  function calculateCameraOffset(grid, ts, player) {
    const mapW = grid[0].length * ts;
    const mapH = grid.length    * ts;

    let ox = Math.floor(canvas.width  / 2 - player.rx * ts - ts / 2);
    let oy = Math.floor(canvas.height / 2 - player.ry * ts - ts / 2);

    if (mapW <= canvas.width)  ox = Math.floor((canvas.width  - mapW) / 2);
    else                       ox = Math.max(canvas.width  - mapW, Math.min(0, ox));

    if (mapH <= canvas.height) oy = Math.floor((canvas.height - mapH) / 2);
    else                       oy = Math.max(canvas.height - mapH, Math.min(0, oy));

    return { ox, oy };
  }

  /* ── Render principal ── */
  function render(data) {
    const { state } = data;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = palette.bgSky || '#0a0a06';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state === 'menu')     { drawMenu(data);     return; }
    if (state === 'gameover') { drawGameOver(data); return; }
    if (state === 'victory')  { drawVictory(data);  return; }

    if (state === 'playing' || state === 'paused' || state === 'win') {
      drawGame(data);
      if (state === 'paused') drawPause();
      if (state === 'win')    drawWinFlash(data);
    }
  }

  /* ── Desenho do mundo em jogo ── */
  function drawGame(data) {
    const {
      grid, player, enemies, items, powerups, activeEffects,
      score, highScore, lives, phase, exit,
      dynamicWalls, dayNight, phaseTimer, phaseTimerMax,
      stamina, sectorTheme, decorTiles, zoneMap,
    } = data;

    if (!grid || !grid.length || !player) return;

    tileSize = calculateTileSize(grid);
    const { ox, oy } = calculateCameraOffset(grid, tileSize, player);

    blendPalette(dayNight || 0);

    // Recorte no retângulo do labirinto
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, grid[0].length * tileSize, grid.length * tileSize);
    ctx.clip();

    drawGrid(grid, ox, oy, dynamicWalls || [], data.wallFlash || [], zoneMap, sectorTheme);
    drawThemeDecor(decorTiles || [], ox, oy, sectorTheme, dayNight || 0);
    drawItems(items, ox, oy);
    drawPowerups(powerups, ox, oy, activeEffects);
    drawEnemies(enemies, ox, oy, dayNight || 0);
    drawPlayer(player, activeEffects, ox, oy);

    drawFog(player, activeEffects, ox, oy, dayNight || 0);

    if ((dayNight || 0) > 0.05 && palette.ambient) {
      ctx.fillStyle = palette.ambient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (exit) drawExit(exit, ox, oy, sectorTheme);

    tickParticles();
    renderParticles();
    ctx.restore();

    drawMapBorderMask(ox, oy, grid[0].length * tileSize, grid.length * tileSize);
    drawHUD(
      score, highScore, lives, phase, activeEffects,
      phaseTimer, phaseTimerMax, stamina, dayNight || 0,
      data.lootToast || null, player, exit, grid,
    );
  }

  function drawMapBorderMask(ox, oy, mapW, mapH) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,4,6,0.95)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(ox, oy, mapW, mapH);
    ctx.fill('evenodd');

    ctx.strokeStyle = 'rgba(96,78,62,0.92)';
    ctx.lineWidth = Math.max(2, tileSize * 0.14);
    ctx.strokeRect(ox, oy, mapW, mapH);
    ctx.restore();
  }

  /* ── Grade do labirinto ── */
  function drawGrid(grid, ox, oy, dynWalls, flashList, zoneMap, sectorTheme) {
    const now        = performance.now();
    const dynSet     = new Set(dynWalls.map(w => `${w.x},${w.y}`));
    const flashMap   = new Map(flashList.map(f => [`${f.x},${f.y}`, f.t]));
    const floorPal   = getFloorPalette(sectorTheme);
    const ts         = tileSize;

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const px    = ox + x * ts;
        const py    = oy + y * ts;
        const cell  = grid[y][x];
        const key   = `${x},${y}`;
        const isDyn = dynSet.has(key);
        const flashT= flashMap.get(key);

        if (cell === 1) {
          drawWallTile(x, y, px, py, ts, grid, isDyn, flashT, now);
        } else {
          drawFloorTile(x, y, px, py, ts, grid, isDyn, cell, flashT, now, zoneMap, floorPal);
        }
      }
    }
  }

  function drawWallTile(x, y, px, py, ts, grid, isDyn, flashT, now) {
    const up    = grid[y - 1]?.[x] === 1;
    const down  = grid[y + 1]?.[x] === 1;
    const left  = grid[y][x - 1] === 1;
    const right = grid[y][x + 1] === 1;

    const isHorizontalSlat = left && right && !up && !down;
    const isVerticalSlat   = up && down && !left && !right;

    ctx.fillStyle = '#10180a';
    ctx.fillRect(px, py, ts, ts);

    const wallColor = isDyn ? palette.dynamicWall : palette.wall;
    const topColor  = isDyn ? '#aa8822' : palette.wallTop || '#5c4535';
    ctx.fillStyle = wallColor;

    if (isHorizontalSlat) {
      const h  = Math.max(2, ts * 0.42);
      const y0 = py + (ts - h) / 2;
      ctx.fillRect(px, y0, ts, h);
      ctx.fillStyle = topColor;
      ctx.fillRect(px, y0, ts, Math.max(1, ts * 0.14));
    } else if (isVerticalSlat) {
      const w  = Math.max(2, ts * 0.42);
      const x0 = px + (ts - w) / 2;
      ctx.fillRect(x0, py, w, ts);
      ctx.fillStyle = topColor;
      ctx.fillRect(x0, py, w, Math.max(1, ts * 0.14));
    } else {
      const inset = Math.max(1, Math.floor(ts * 0.1));
      ctx.fillRect(px + inset, py + inset, ts - inset * 2, ts - inset * 2);
      ctx.fillStyle = topColor;
      ctx.fillRect(px + inset, py + inset, ts - inset * 2, Math.max(1, ts * 0.14));
    }

    ctx.strokeStyle = isDyn ? '#c8a030' : palette.wallShade;
    ctx.lineWidth = 0.7;
    ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);

    if (flashT && now - flashT < 400) {
      const alpha = (1 - (now - flashT) / 400) * 0.7;
      ctx.fillStyle = `rgba(255,200,50,${alpha})`;
      ctx.fillRect(px, py, ts, ts);
    }
  }

  function drawFloorTile(x, y, px, py, ts, grid, isDyn, cell, flashT, now, zoneMap, floorPal) {
    const zone = zoneMap?.[y]?.[x] ?? 0;

    if      (zone === 1) ctx.fillStyle = (x + y) % 2 === 0 ? floorPal.zoneA1 : floorPal.zoneA2;
    else if (zone === 2) ctx.fillStyle = (x + y) % 2 === 0 ? floorPal.zoneB1 : floorPal.zoneB2;
    else if (zone === 3) ctx.fillStyle = (x + y) % 2 === 0 ? floorPal.metal1 : floorPal.metal2;
    else if (zone === 4) ctx.fillStyle = (x + y) % 2 === 0 ? floorPal.tunnel1: floorPal.tunnel2;
    else if (zone === 5) ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2550' : '#221d44';
    else                 ctx.fillStyle = (x + y) % 2 === 0 ? floorPal.base1  : floorPal.base2;
    ctx.fillRect(px, py, ts, ts);

    if (zone === 3) drawMetalLines(px, py, ts);
    if (zone === 4) drawTunnelMark(px, py, ts);
    if (zone === 5) drawPortalSwirl(px, py, ts, x, y);

    if (isDyn && cell === 0) {
      ctx.fillStyle = palette.dynamicOpen;
      ctx.fillRect(px, py, ts, ts);
      ctx.strokeStyle = 'rgba(100,200,60,0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, ts, ts);
    }

    if (flashT && now - flashT < 400) {
      const alpha = (1 - (now - flashT) / 400) * 0.5;
      ctx.fillStyle = `rgba(100,220,80,${alpha})`;
      ctx.fillRect(px, py, ts, ts);
    }
  }

  function drawMetalLines(px, py, ts) {
    ctx.strokeStyle = 'rgba(210,220,230,0.33)';
    ctx.lineWidth   = Math.max(1, ts * 0.06);
    ctx.beginPath();
    ctx.moveTo(px + ts * 0.18, py + ts * 0.33); ctx.lineTo(px + ts * 0.82, py + ts * 0.33);
    ctx.moveTo(px + ts * 0.18, py + ts * 0.67); ctx.lineTo(px + ts * 0.82, py + ts * 0.67);
    ctx.stroke();
  }

  function drawTunnelMark(px, py, ts) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = Math.max(1, ts * 0.05);
    ctx.beginPath();
    ctx.arc(px + ts * 0.5, py + ts * 0.5, Math.max(2, ts * 0.32), 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPortalSwirl(px, py, ts, x, y) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#9f7bff';
    ctx.lineWidth   = Math.max(1, ts * 0.08);
    ctx.beginPath();
    ctx.arc(px + ts * 0.5, py + ts * 0.5, Math.max(2, ts * 0.22) + Math.sin(t * 3 + x + y) * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function getFloorPalette(sectorTheme) {
    const type = sectorTheme?.themeType ?? 'ruinas';

    if (type === 'corredor') return {
      base1: '#66747d', base2: '#58656e',
      zoneA1: '#718088', zoneA2: '#64727a',
      zoneB1: '#7a858d', zoneB2: '#6e7880',
      metal1: '#7f8f99', metal2: '#6f7f88',
      tunnel1: '#47403a', tunnel2: '#3a3430',
    };

    if (type === 'quebrada') return {
      base1: '#7b5d42', base2: '#6d5139',
      zoneA1: '#8a6b4a', zoneA2: '#7a5e42',
      zoneB1: '#c8b28f', zoneB2: '#b79f7f',
      metal1: '#7a848d', metal2: '#67727b',
      tunnel1: '#4a3b30', tunnel2: '#3d3128',
    };

    return {
      base1: '#3d5a1e', base2: '#2a4018',
      zoneA1: '#356b34', zoneA2: '#2e5c2f',
      zoneB1: '#596168', zoneB2: '#4d545a',
      metal1: '#69767f', metal2: '#5a656d',
      tunnel1: '#3a332a', tunnel2: '#2f2922',
    };
  }

  /* ── Decoração temática ── */
  function drawThemeDecor(decorTiles, ox, oy, sectorTheme, nightAmt) {
    if (!decorTiles.length) return;
    const style    = sectorTheme?.themeType ?? 'ruinas';
    const alpha    = 0.17 + nightAmt * 0.08;
    const ts       = tileSize;

    decorTiles.forEach(d => {
      const px = ox + d.x * ts;
      const py = oy + d.y * ts;
      ctx.save();
      ctx.globalAlpha = alpha;

      if (style === 'corredor') {
        ctx.strokeStyle = '#b68a4e';
        ctx.lineWidth   = Math.max(1, ts * 0.08);
        ctx.beginPath();
        ctx.moveTo(px + ts * 0.2, py + ts * 0.5);
        ctx.lineTo(px + ts * 0.8, py + ts * 0.5);
        ctx.stroke();
      } else if (style === 'quebrada') {
        ctx.globalAlpha *= 0.9;
        ctx.fillStyle = 'rgba(20,80,20,0.45)';
        ctx.beginPath();
        ctx.arc(px + ts * 0.5, py + ts * 0.5, Math.max(1, ts * 0.2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#8d6a45';
        ctx.lineWidth   = Math.max(1, ts * 0.07);
        ctx.beginPath();
        ctx.moveTo(px + ts * 0.25, py + ts * 0.25); ctx.lineTo(px + ts * 0.75, py + ts * 0.75);
        ctx.moveTo(px + ts * 0.75, py + ts * 0.25); ctx.lineTo(px + ts * 0.25, py + ts * 0.75);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  /* ── Saída (porta) ── */
  function drawExit(exit, ox, oy, sectorTheme) {
    const ts  = tileSize;
    const px  = ox + exit.x * ts + ts / 2;
    const py  = oy + exit.y * ts + ts / 2;
    const r   = Math.max(6, ts * 0.5);
    const doorColor  = sectorTheme?.doorColor      ?? '#7a4b24';
    const frameColor = sectorTheme?.doorFrameColor ?? '#b88952';

    ctx.save();
    setGlow(palette.exit || '#00ff88', r * 2.2);

    const doorW = r * 1.65, doorH = r * 2.35;
    const x0    = px - doorW / 2, y0 = py - doorH / 2;

    ctx.fillStyle = frameColor;
    ctx.fillRect(x0 - 3, y0 - 3, doorW + 6, doorH + 6);

    ctx.beginPath();
    ctx.arc(px, y0, doorW * 0.55, Math.PI, 0);
    ctx.lineTo(px + doorW * 0.55, y0 + 1);
    ctx.lineTo(px - doorW * 0.55, y0 + 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = doorColor;
    ctx.fillRect(x0, y0, doorW, doorH);

    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(px, y0, doorW * 0.08, doorH);

    ctx.fillStyle = '#d7b27a';
    ctx.beginPath();
    ctx.arc(px + doorW * 0.2, py + doorH * 0.02, Math.max(1, ts * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = `bold ${Math.max(8, ts * 0.42)}px "Courier New",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#f3fff9';
    ctx.fillText('EXIT', px, py + doorH * 0.9);
    ctx.restore();
  }

  /* ── Itens (lootboxes) ── */
  function drawItems(items, ox, oy) {
    const t  = performance.now() / 1000;
    const ts = tileSize;

    (items || []).forEach(item => {
      if (item.collected) return;
      const px    = ox + item.x * ts;
      const py    = oy + item.y * ts;
      const w     = Math.max(6, ts * 0.72);
      const h     = Math.max(6, ts * 0.64);
      const x0    = px + (ts - w) / 2;
      const y0    = py + (ts - h) / 2;
      const pulse = Math.sin(t * 3 + item.x + item.y) * 0.15 + 0.85;

      ctx.save();
      ctx.globalAlpha = pulse;
      setGlow('#d7a64a', ts * 0.55);

      ctx.fillStyle = '#8a5b2f';
      ctx.fillRect(x0, y0, w, h);

      ctx.fillStyle = '#a36b3a';
      ctx.fillRect(x0, y0, w, Math.max(2, h * 0.34));

      ctx.fillStyle = '#d7be86';
      ctx.fillRect(x0 + w * 0.44, y0, w * 0.12, h);

      ctx.fillStyle    = '#20160d';
      ctx.font         = `bold ${Math.max(7, ts * 0.35)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x0 + w * 0.5, y0 + h * 0.53);
      ctx.restore();
    });
  }

  /* ── Power-ups ── */
  function drawPowerups(pws, ox, oy, fx) {
    const t  = performance.now() / 1000;
    const ts = tileSize;
    const icons = { speed: '⚡', stamina: '❤', light: '💡' };

    (pws || []).forEach(pw => {
      if (pw.collected) return;
      const px  = ox + pw.x * ts + ts / 2;
      const py  = oy + pw.y * ts + ts / 2;
      const r   = Math.max(4, ts * 0.3);
      const col = (palette.powerup || PALETTE_DAY.powerup)[pw.type] || '#fff';

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 1.2);
      setGlow(col, r * 3);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.font         = `${Math.max(7, ts * 0.3)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[pw.type] || '?', px, py);
      ctx.restore();
    });
  }

  /* ── Inimigos ── */
  function drawEnemies(enemies, ox, oy, nightAmt) {
    const ts = tileSize;

    (enemies || []).forEach(enemy => {
      const px     = ox + enemy.rx * ts + ts / 2;
      const py     = oy + enemy.ry * ts + ts / 2;
      const r      = Math.max(5, ts * 0.38);
      const col    = (palette.enemy || PALETTE_DAY.enemy)[enemy.type] || '#ff2244';
      const glowR  = r * (1.8 + nightAmt * 0.8);

      ctx.save();
      setGlow(col, glowR);

      ctx.fillStyle = enemy.confused ? '#554433' : col;
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();

      if (!enemy.confused) {
        const spikes = 4;
        for (let i = 0; i < spikes; i++) {
          const angle = (i / spikes) * Math.PI * 2 + performance.now() / 800;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(angle) * r * 0.7,  py + Math.sin(angle) * r * 0.55);
          ctx.lineTo(px + Math.cos(angle) * r * 1.4,  py + Math.sin(angle) * r * 1.1);
          ctx.strokeStyle = col;
          ctx.lineWidth   = Math.max(1, ts * 0.07);
          ctx.stroke();
        }
      }

      const eyeOffset = r * 0.28;
      const eyeR      = Math.max(2, r * 0.2);
      [-eyeOffset, eyeOffset].forEach(ex => {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(px + ex, py - r * 0.15, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = enemy.confused ? '#ff6622' : '#111';
        ctx.beginPath(); ctx.arc(px + ex + 1, py - r * 0.15, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
      });

      ctx.restore();
    });
  }

  /* ── Jogador — visual de corredor humano com equipamento ── */
  function drawPlayer(player, fx, ox, oy) {
    const ts      = tileSize;
    const px      = ox + player.rx * ts + ts / 2;
    const py      = oy + player.ry * ts + ts / 2;
    const r       = Math.max(5, ts * 0.42);
    const t       = performance.now() / 1000;
    const isInvis = fx['invisible'] && performance.now() < fx['invisible'];
    const isSpeed = fx['speed']     && performance.now() < fx['speed'];

    ctx.save();
    if (isInvis) ctx.globalAlpha = 0.3;

    // Rastro de movimento (speed trail)
    if (isSpeed) {
      for (let i = 3; i >= 1; i--) {
        ctx.save();
        ctx.globalAlpha = (isInvis ? 0.1 : 0.15) * (4 - i) / 3;
        const trailDx = player.direction?.x ?? 0;
        const trailDy = player.direction?.y ?? 0;
        ctx.fillStyle = palette.powerup?.speed || '#00ddff';
        ctx.beginPath();
        ctx.arc(px - trailDx * i * r * 0.7, py - trailDy * i * r * 0.7, r * (1 - i * 0.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Sombra projetada no chão
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px + r * 0.2, py + r * 0.85, r * 0.65, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Retângulo simples
    setGlow(palette.playerGlow || '#ffd700', r * 2.2);
    ctx.fillStyle = palette.player || '#e8c84a';
    ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);

    // Pulsação / efeito de alerta
    const pulse = Math.sin(t * 4) * 0.5 + 0.5;
    ctx.globalAlpha = (isInvis ? 0.1 : 0.5) * pulse;
    ctx.strokeStyle = palette.playerGlow || '#ffd700';
    ctx.lineWidth   = Math.max(1.5, r * 0.15);
    ctx.strokeRect(px - r * 0.5, py - r * 0.5, r, r);

    ctx.restore();
  }

  /* ── Fog of war ── */
  function drawFog(player, fx, ox, oy, nightAmt) {
    if (nightAmt < 0.05) return;

    const ts       = tileSize;
    const px       = ox + player.rx * ts + ts / 2;
    const py       = oy + player.ry * ts + ts / 2;
    const hasLight = fx['light'] && performance.now() < fx['light'];
    const visR     = Math.max(ts * 1.5, hasLight ? ts * 8 : ts * (4 - nightAmt * 2.5));

    const grad = ctx.createRadialGradient(px, py, visR * 0.35, px, py, visR * 1.15);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, `rgba(0,0,${Math.round(15 * nightAmt)},${nightAmt * 0.25})`);
    grad.addColorStop(1,   `rgba(0,0,${Math.round(15 * nightAmt)},${nightAmt * 0.97})`);

    ctx.fillStyle = grad;
    ctx.save();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(px, py, visR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const darkGrad = ctx.createRadialGradient(px, py, visR, px, py, visR * 1.3);
    darkGrad.addColorStop(0, 'rgba(0,0,0,0)');
    darkGrad.addColorStop(1, `rgba(0,0,0,${nightAmt * 0.98})`);
    ctx.fillStyle = darkGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /* ── Minimapa (círculo) ── */
  function drawMiniMap(grid, player, exit, x, y, size) {
    const r  = Math.floor(size / 2);
    const cx = x + r, cy = y + r;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.24)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    if (!grid || !grid.length) return;

    const inset  = 7;
    const mapSz  = (r - inset) * 2;
    const startX = cx - mapSz / 2, startY = cy - mapSz / 2;
    const sx = mapSz / grid[0].length, sy = mapSz / grid.length;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - inset, 0, Math.PI * 2);
    ctx.clip();

    for (let gy = 0; gy < grid.length; gy++) {
      for (let gx = 0; gx < grid[gy].length; gx++) {
        ctx.fillStyle = grid[gy][gx] === 1 ? '#28303a' : '#4f5f3b';
        ctx.fillRect(startX + gx * sx, startY + gy * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    if (exit) {
      ctx.fillStyle = '#66ffd0';
      ctx.fillRect(startX + exit.x * sx, startY + exit.y * sy, Math.max(2, sx), Math.max(2, sy));
    }

    if (player) {
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(startX + player.rx * sx, startY + player.ry * sy, Math.max(2, sx), Math.max(2, sy));
    }

    ctx.restore();
  }

  /* ── Bússola simples e funcional ── */
  function drawCompass(player, exit, x, y, size) {
    if (!player || !exit) return;

    const cx  = x + size / 2;
    const cy  = y + size / 2;
    const r   = size * 0.38;
    const dx  = exit.x - player.rx;
    const dy  = exit.y - player.ry;
    const ang = Math.atan2(dy, dx);
    const dist= Math.round(Math.hypot(dx, dy));

    // Fundo da bússola
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,8,14,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,200,255,0.45)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Anel interno
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,200,255,0.2)';
    ctx.lineWidth   = 0.8;
    ctx.stroke();

    // Marcações cardinais (N/L/S/O) — pequenos traços
    const cardinals = ['N', 'L', 'S', 'O'];
    ctx.font         = `bold ${Math.max(7, size * 0.11)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(a) * (r + 10);
      const ty = cy + Math.sin(a) * (r + 10);
      ctx.fillStyle = i === 0 ? '#ff5555' : 'rgba(180,200,220,0.55)';
      ctx.fillText(cardinals[i], tx, ty);
    }

    // Seta da bússola apontando para a saída
    ctx.translate(cx, cy);
    ctx.rotate(ang);

    // Metade dianteira (aponta para saída)
    ctx.fillStyle = '#44ccff';
    ctx.beginPath();
    ctx.moveTo(r * 0.82, 0);
    ctx.lineTo(-r * 0.35, r * 0.28);
    ctx.lineTo(-r * 0.18, 0);
    ctx.lineTo(-r * 0.35, -r * 0.28);
    ctx.closePath();
    ctx.fill();

    // Metade traseira (oposta)
    ctx.fillStyle = '#335566';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(-r * 0.18, r * 0.28);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.18, -r * 0.28);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Distância centralizada abaixo da bússola
    ctx.fillStyle    = '#66ccff';
    ctx.font         = `bold ${Math.max(8, size * 0.14)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${dist}m`, cx, y + size - 14);
  }

  /* ── HUD principal ── */
  function drawHUD(score, highScore, lives, phase, fx, timer, timerMax, stamina, nightAmt, lootToast, player, exit, grid) {
    const pad = 12;

    // Timer no topo (barra)
    if (timer !== undefined && timerMax) {
      const ratio    = timer / timerMax;
      const timerCol = ratio > 0.4
        ? (palette.timerOk   || '#c8d870')
        : ratio > 0.2
        ? (palette.timerWarn || '#ff9900')
        : (palette.timerCrit || '#ff2244');

      const tW = 260, tH = 38;
      const tx = Math.floor(canvas.width / 2 - tW / 2), ty = 12;

      roundRect(tx, ty, tW, tH, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.58)'; ctx.fill();

      roundRect(tx + 1, ty + 1, Math.max(0, tW * ratio - 2), tH - 2, 7);
      ctx.fillStyle = timerCol; ctx.fill();

      ctx.strokeStyle = timerCol; ctx.lineWidth = 1;
      roundRect(tx, ty, tW, tH, 8); ctx.stroke();

      ctx.font = 'bold 26px "Consolas",monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#f4fbff';
      ctx.fillText(`${Math.ceil(timer)}s`, tx + tW / 2, ty + tH / 2 + 1);
    }

    // Layout inferior: minimapa | info | bússola
    const minimapSize = 110;
    const infoW       = 380;
    const compassSize = 90;
    const totalW      = minimapSize + 20 + infoW + 20 + compassSize + 24;
    const startX      = Math.floor(canvas.width / 2 - totalW / 2);
    const bottomY     = canvas.height - 135;

    // Minimapa
    drawMiniMap(grid, player, exit, startX, bottomY, minimapSize);

    // Painel de informações
    const infoX = startX + minimapSize + 20;
    const infoY = bottomY + 12;
    const infoH = 86;

    roundRect(infoX, infoY, infoW, infoH, 12);
    ctx.fillStyle   = 'rgba(8,10,14,0.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.38)';
    ctx.lineWidth   = 1.5; ctx.stroke();

    const dayLabel = nightAmt > 0.6 ? 'NOITE' : 'DIA';

    ctx.font = 'bold 15px "Consolas",monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = palette.item || '#ffd700';
    ctx.fillText(`PONTOS ${score}`, infoX + 14, infoY + 28);

    ctx.fillStyle = nightAmt > 0.6 ? '#9cb2ff' : '#e3ca7d';
    ctx.fillText(`SETOR ${phase} · ${dayLabel}`, infoX + 14, infoY + 56);

    ctx.fillStyle = palette.player || '#e8c84a';
    ctx.fillText(`VIDAS ${'♥'.repeat(Math.max(0, lives))}`, infoX + 180, infoY + 28);

    ctx.fillStyle  = palette.dim || '#8b7355';
    ctx.textAlign  = 'right';
    ctx.fillText(`REC ${highScore}`, infoX + infoW - 14, infoY + 56);

    // Bússola
    const compassX = infoX + infoW + 20;
    const compassY = bottomY + 8;
    drawCompass(player, exit, compassX, compassY, compassSize + 24);

    // Efeitos ativos
    const now         = performance.now();
    const effectDefs  = [
      ['speed',     '⚡', palette.powerup?.speed     || '#00ddff'],
      ['light',     '💡', '#ffffaa'],
      ['stamina',   '❤',  '#ff6b8a'],
      ['invisible', '👁', '#cc88ff'],
      ['confuse',   '🌀', '#ff6622'],
    ];
    const effectStartX = Math.floor(canvas.width / 2 - 210);
    let activeCount    = 0;

    effectDefs.forEach(([key, icon, color]) => {
      if (!fx[key] || now >= fx[key]) return;
      const remaining = Math.ceil((fx[key] - now) / 1000);
      const ex = effectStartX + activeCount * 105;
      roundRect(ex, 62, 100, 38, 10);
      ctx.fillStyle   = 'rgba(0,0,0,0.8)'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle   = color;
      ctx.font        = 'bold 18px monospace';
      ctx.textAlign   = 'left';
      ctx.textBaseline= 'middle';
      ctx.fillText(`${icon}${remaining}s`, ex + 14, 62 + 19);
      activeCount++;
    });

    // Toast de loot
    if (lootToast) {
      ctx.save();
      ctx.font         = 'bold 14px "Consolas",monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      roundRect(canvas.width / 2 - 145, 58, 290, 28, 8);
      ctx.fillStyle   = 'rgba(0,0,0,0.62)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,130,0.35)';
      ctx.lineWidth   = 1; ctx.stroke();
      ctx.fillStyle   = '#ffd98a';
      ctx.fillText(`LOOT: ${lootToast}`, canvas.width / 2, 72);
      ctx.restore();
    }
  }


  /* ═══════════════════════════════════════════════════════
     TELAS DE UI — Menu, Pause, GameOver, Victory
  ═══════════════════════════════════════════════════════ */

  /* ── Animação de fundo do menu ── */
  function drawAnimatedMenuBackground(t) {
    const W = canvas.width, H = canvas.height;

    // Fundo com gradiente dinâmico
    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.85);
    bgGrad.addColorStop(0,   '#16120a');
    bgGrad.addColorStop(0.5, '#0c0e08');
    bgGrad.addColorStop(1,   '#060604');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Grade de labirinto animada — paredes se movem lentamente
    const cols = 14, rows = 9;
    const cw = W / cols, ch = H / rows;
    const scroll = (t * 12) % cw;

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#c8891a';
    ctx.lineWidth   = 1;

    for (let x = 0; x <= cols + 1; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cw - scroll, 0);
      ctx.lineTo(x * cw - scroll, H);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * ch);
      ctx.lineTo(W, y * ch);
      ctx.stroke();
    }
    ctx.restore();

    // "Paredes" internas piscando — simulam um labirinto vivo
    const wallSeeds = [
      [2,1,'h'],[5,3,'v'],[8,1,'h'],[11,2,'v'],
      [3,5,'v'],[7,6,'h'],[10,4,'v'],[1,7,'h'],
      [6,2,'h'],[9,5,'v'],[4,7,'h'],[12,3,'v'],
    ];

    ctx.save();
    wallSeeds.forEach(([col, row, dir], i) => {
      const phase = (t * 0.6 + i * 0.41) % (Math.PI * 2);
      const alpha = (Math.sin(phase) * 0.5 + 0.5) * 0.18;
      ctx.globalAlpha   = alpha;
      ctx.fillStyle     = '#c8891a';
      ctx.shadowColor   = '#c8891a';
      ctx.shadowBlur    = 8;
      const wx = col * cw - scroll;
      const wy = row * ch;
      if (dir === 'h') ctx.fillRect(wx, wy - 3, cw, 6);
      else             ctx.fillRect(wx - 3, wy, 6, ch);
    });
    ctx.restore();

    // Partículas de poeira flutuando
    ctx.save();
    for (let i = 0; i < 24; i++) {
      const px = ((i * 0.618 * W) % W);
      const py = ((i * 0.382 * H + t * 18 * (i % 3 === 0 ? 1 : -0.5)) % H + H) % H;
      const alpha = (Math.sin(t * 1.1 + i) * 0.3 + 0.35) * 0.55;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#d4a040';
      ctx.beginPath();
      ctx.arc(px, py, 1.2 + Math.sin(i + t) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ── Tela inicial ── */
  function drawMenu(data) {
    // Atualiza timer de animação interno
    const now = performance.now() / 1000;
    menuAnimTime = now;

    const t  = menuAnimTime;
    const W  = canvas.width;
    const H  = canvas.height;
    const cx = W / 2, cy = H / 2;

    drawAnimatedMenuBackground(t);

    // Painel central com glassmorphism
    const panelW  = Math.min(680, W * 0.9);
    const panelH  = Math.min(380, H * 0.62);
    const panelX  = cx - panelW / 2;
    const panelY  = cy - panelH / 2;

    ctx.save();

    // Borda brilhante pulsante
    const borderAlpha = 0.28 + Math.sin(t * 1.8) * 0.12;
    ctx.strokeStyle = `rgba(220,168,80,${borderAlpha})`;
    ctx.lineWidth   = 2;
    setGlow('#c8891a', 18);
    roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.stroke();

    // Fundo do painel
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    panelGrad.addColorStop(0, 'rgba(12,10,6,0.88)');
    panelGrad.addColorStop(1, 'rgba(8,10,18,0.84)');
    roundRect(panelX, panelY, panelW, panelH, 18);
    ctx.fillStyle = panelGrad;
    ctx.fill();

    // Linha decorativa horizontal no terço superior
    const divY = panelY + panelH * 0.42;
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#c8891a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + panelW * 0.08, divY);
    ctx.lineTo(panelX + panelW * 0.92, divY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Título "THE MAZE"
    const titleSize = Math.min(68, W * 0.13);
    ctx.font         = `bold ${titleSize}px "Consolas",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const titleY = panelY + panelH * 0.18;

    // Sombra empilhada para dar profundidade
    ctx.shadowColor  = '#000';
    ctx.shadowBlur   = 0;
    ctx.shadowOffsetX= 3; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#5a3a00';
    ctx.fillText('THE MAZE', cx, titleY);

    ctx.shadowOffsetX= 0; ctx.shadowOffsetY = 0;
    setGlow('#c8891a', 28 + Math.sin(t * 2) * 8);
    ctx.fillStyle = '#e0ad55';
    ctx.fillText('THE MAZE', cx, titleY);

    // "RUNNER" em amarelo mais claro
    const runnerY = titleY + titleSize * 1.1;
    setGlow('#ffd700', 20 + Math.sin(t * 2.5 + 1) * 6);
    ctx.fillStyle = '#f5e070';
    ctx.fillText('RUNNER', cx, runnerY);

    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Subtítulo
    const subY = panelY + panelH * 0.54;
    ctx.font      = `${Math.min(14, W * 0.026)}px "Consolas",monospace`;
    ctx.fillStyle = '#b89d76';
    ctx.fillText('Explore setores · Abra lootboxes · Alcance o EXIT', cx, subY);

    // Botão de início (piscante)
    const btnPulse  = Math.sin(t * 3) * 0.5 + 0.5;
    const btnY      = panelY + panelH * 0.68;
    const btnW      = Math.min(360, panelW * 0.72);
    const btnH      = 38;
    const btnX      = cx - btnW / 2;

    roundRect(btnX, btnY, btnW, btnH, 10);
    ctx.fillStyle = `rgba(20,16,8,${0.7 + btnPulse * 0.1})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,210,100,${0.4 + btnPulse * 0.35})`;
    ctx.lineWidth   = 1.5;
    setGlow('#ffd700', btnPulse * 14);
    ctx.stroke();

    ctx.fillStyle    = `rgba(240,210,120,${0.75 + btnPulse * 0.25})`;
    ctx.font         = 'bold 14px "Consolas",monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶  ENTER / ESPAÇO / TOQUE PARA INICIAR', cx, btnY + btnH / 2);

    ctx.shadowBlur = 0;

    // Controles
    const ctrlY = panelY + panelH * 0.83;
    ctx.font      = '11px "Consolas",monospace';
    ctx.fillStyle = '#7a6848';
    ctx.fillText('WASD / SETAS: MOVER   ·   P / ESC: PAUSA', cx, ctrlY);

    // Modo difícil
    const hardY = panelY + panelH * 0.88;
    ctx.fillStyle = data.hardMode ? '#ffd36a' : '#8b7355';
    ctx.fillText(`MODO DIFICIL: ${data.hardMode ? 'ATIVO' : 'NORMAL'}   ·   USE OS BOTOES`, cx, hardY);

    // Power-ups disponíveis
    const pwY    = panelY + panelH * 0.93;
    const pwDefs = [['#00ddff','⚡ SPEED'],['#ff6b8a','❤ STAMINA'],['#ffffaa','💡 LIGHT'],['#ff7d4f','🌀 CONFUSE']];
    ctx.font = '11px monospace';
    pwDefs.forEach(([col, lbl], i) => {
      ctx.fillStyle = col;
      ctx.fillText(lbl, cx + (i - 1.5) * 118, pwY);
    });

    // Recorde salvo
    if (data.highScore > 0) {
      const hiY = panelY + panelH + 18;
      ctx.font      = '12px "Consolas",monospace';
      ctx.fillStyle = 'rgba(200,140,26,0.7)';
      ctx.fillText(`✦  RECORDE: ${data.highScore}  ✦`, cx, hiY);
    }

    ctx.restore();
  }

  /* ── Tela de pausa ── */
  function drawPause() {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const t  = performance.now() / 1000;

    // Overlay escuro com leve vinheta colorida
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);

    // Scanlines sutis para dar atmosfera retrô
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let y = 0; y < H; y += 4) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, W, 2);
    }
    ctx.restore();

    // Painel central
    const panelW = Math.min(420, W * 0.82);
    const panelH = 220;
    const panelX = cx - panelW / 2;
    const panelY = cy - panelH / 2;

    // Brilho de borda pulsante
    const borderPulse = 0.3 + Math.sin(t * 2.4) * 0.15;
    setGlow('#e7b96d', 20);
    ctx.strokeStyle = `rgba(231,185,109,${borderPulse})`;
    ctx.lineWidth   = 2;
    roundRect(panelX, panelY, panelW, panelH, 16);
    ctx.stroke();

    // Fundo do painel (gradiente angular)
    const pGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    pGrad.addColorStop(0, 'rgba(14,12,8,0.94)');
    pGrad.addColorStop(1, 'rgba(10,12,20,0.90)');
    roundRect(panelX, panelY, panelW, panelH, 16);
    ctx.fillStyle = pGrad;
    ctx.fill();

    ctx.shadowBlur = 0;

    // Ícone de pausa (dois retângulos)
    const iconX = cx, iconY = panelY + 44;
    ctx.fillStyle = 'rgba(231,185,109,0.85)';
    ctx.fillRect(iconX - 18, iconY - 16, 12, 32);
    ctx.fillRect(iconX + 6,  iconY - 16, 12, 32);

    // Título "PAUSADO"
    const titleY = panelY + 110;
    ctx.font         = `bold 38px "Consolas",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    setGlow('#e7b96d', 14);
    ctx.fillStyle = '#e7c984';
    ctx.fillText('PAUSADO', cx, titleY);

    ctx.shadowBlur = 0;

    // Linha decorativa
    ctx.strokeStyle = 'rgba(200,155,60,0.25)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + panelW * 0.12, titleY + 26);
    ctx.lineTo(panelX + panelW * 0.88, titleY + 26);
    ctx.stroke();

    // Instrução de retorno (piscante)
    const alpha = 0.6 + Math.sin(t * 3) * 0.4;
    ctx.font      = '13px "Consolas",monospace';
    ctx.fillStyle = `rgba(180,155,112,${alpha})`;
    ctx.fillText('[ P / ESC para continuar ]', cx, panelY + panelH - 30);
  }

  /* ── Flash de setor concluído ── */
  function drawWinFlash(data) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(8,36,16,0.56)';
    ctx.fillRect(0, 0, W, H);

    roundRect(W / 2 - 230, H / 2 - 66, 460, 118, 12);
    ctx.fillStyle = 'rgba(10,20,12,0.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,245,160,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();

    ctx.font         = `bold ${Math.min(34, W * 0.07)}px "Consolas",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    setGlow('#75ffbc', 18);
    ctx.fillStyle = '#75ffbc';
    ctx.fillText(`SETOR ${data.phase} CONCLUÍDO`, W / 2, H / 2 - 16);

    ctx.shadowBlur   = 0;
    ctx.font         = '14px monospace';
    ctx.fillStyle    = '#f0d58e';
    ctx.fillText('Bônus de transição aplicado', W / 2, H / 2 + 20);
  }

  /* ── Game Over ── */
  function drawGameOver(data) {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    drawAnimatedMenuBackground(performance.now() / 1000);

    roundRect(cx - 210, cy - 120, 420, 220, 12);
    ctx.fillStyle   = 'rgba(18,10,10,0.78)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,84,84,0.38)'; ctx.lineWidth = 1.1; ctx.stroke();

    ctx.font         = `bold ${Math.min(50, W * 0.1)}px "Consolas",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    setGlow('#ff4d3b', 24);
    ctx.fillStyle = '#cf3c2f';
    ctx.fillText('CAPTURADO', cx, cy - 65);

    ctx.shadowBlur = 0;
    ctx.font       = '16px "Consolas",monospace';
    ctx.fillStyle  = '#f0cd79';
    ctx.fillText(`Setor ${data.phase} · Pontos: ${data.score}`, cx, cy - 12);
    ctx.fillStyle  = '#c8891a';
    ctx.fillText(`Recorde: ${data.highScore}`, cx, cy + 22);

    if (Math.sin(performance.now() / 400) > 0) {
      ctx.fillStyle = '#f2d488';
      ctx.font      = 'bold 14px "Consolas",monospace';
      ctx.fillText('[ ENTER para tentar novamente ]', cx, cy + 68);
    }
  }

  /* ── Vitória ── */
  function drawVictory(data) {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    drawAnimatedMenuBackground(performance.now() / 1000);

    setGlow('#ffd700', 30);
    ctx.font         = `bold ${Math.min(44, W * 0.09)}px "Courier New",monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffd700';
    ctx.fillText('LABIRINTO CONCLUÍDO!', cx, cy - 70);

    ctx.shadowBlur = 0;
    ctx.font       = '18px "Courier New",monospace';
    ctx.fillStyle  = '#e8c84a';
    ctx.fillText(`Pontuação final: ${data.score}`, cx, cy - 20);
    ctx.fillStyle  = '#c8891a';
    ctx.fillText(`Setores completados: ${data.phase - 1}`, cx, cy + 20);
    ctx.fillStyle  = '#8b7355';
    ctx.font       = '13px monospace';
    ctx.fillText('Você escapou do Labirinto!', cx, cy + 58);

    if (Math.sin(performance.now() / 400) > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font      = 'bold 14px monospace';
      ctx.fillText('[ ENTER para jogar novamente ]', cx, cy + 95);
    }
  }


  /* ═══════════════════════════════════════════════════
     PARTÍCULAS e UTILITÁRIOS
  ═══════════════════════════════════════════════════ */

  function spawnParticle(x, y, color) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.04 + Math.random() * 0.03,
        r: 1.5 + Math.random() * 2, color,
      });
    }
  }

  function tickParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.05;
      p.life -= p.decay;
    });
  }

  function renderParticles() {
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function setGlow(color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur  = blur;
  }

  return { init, render, spawnParticle };
})();