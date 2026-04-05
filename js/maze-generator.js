export const MazeGenerator = (() => {
  function generate(cols, rows, opts = {}) {
    const W = cols * 2 + 1;
    const H = rows * 2 + 1;
    const grid = Array.from({ length: H }, () => new Array(W).fill(1));
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

    const loopsChance = opts.loopsChance ?? 0.24;
    const areaPatches = opts.areaPatches ?? Math.max(3, Math.floor((cols + rows) * 0.32));
    const areaMaxW = opts.areaMaxW ?? 3;
    const areaMaxH = opts.areaMaxH ?? 2;
    const areaCarveChance = opts.areaCarveChance ?? 0.82;
    const longCuts = opts.longCuts ?? 0;
    const longCutLen = opts.longCutLen ?? 8;
    const longCutThickness = opts.longCutThickness ?? 1;

    carveRecursive(grid, visited, 0, 0, cols, rows);
    addLoops(grid, loopsChance);
    carveOpenAreas(grid, areaPatches, areaMaxW, areaMaxH, areaCarveChance);
    carveLongCuts(grid, longCuts, longCutLen, longCutThickness);

    return grid;
  }

  function carveRecursive(grid, visited, cx, cy, cols, rows) {
    visited[cy][cx] = true;
    const gx = cx * 2 + 1;
    const gy = cy * 2 + 1;
    grid[gy][gx] = 0;

    const dirs = shuffle([{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }]);
    for (const { dx, dy } of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || visited[ny][nx]) continue;
      grid[gy + dy][gx + dx] = 0;
      carveRecursive(grid, visited, nx, ny, cols, rows);
    }
  }

  function addLoops(grid, chance) {
    for (let y = 1; y < grid.length - 1; y++) {
      for (let x = 1; x < grid[y].length - 1; x++) {
        if (grid[y][x] !== 1) continue;
        const hPass = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
        const vPass = grid[y - 1][x] === 0 && grid[y + 1][x] === 0;
        if ((hPass || vPass) && Math.random() < chance) grid[y][x] = 0;
      }
    }
  }

  function carveOpenAreas(grid, patches, maxW, maxH, carveChance) {
    for (let i = 0; i < patches; i++) {
      const cx = 2 + Math.floor(Math.random() * (grid[0].length - 4));
      const cy = 2 + Math.floor(Math.random() * (grid.length - 4));
      const rw = 1 + Math.floor(Math.random() * Math.max(1, maxW));
      const rh = 1 + Math.floor(Math.random() * Math.max(1, maxH));
      for (let y = cy - rh; y <= cy + rh; y++) {
        for (let x = cx - rw; x <= cx + rw; x++) {
          if (y <= 0 || y >= grid.length - 1 || x <= 0 || x >= grid[0].length - 1) continue;
          if (Math.random() < carveChance) grid[y][x] = 0;
        }
      }
    }
  }

  function carveLongCuts(grid, count, len, thickness) {
    const maxLen = Math.max(3, len);
    const thick = Math.max(1, thickness);
    for (let i = 0; i < count; i++) {
      const horizontal = Math.random() < 0.5;
      const startX = 2 + Math.floor(Math.random() * (grid[0].length - 4));
      const startY = 2 + Math.floor(Math.random() * (grid.length - 4));
      const cutLen = 3 + Math.floor(Math.random() * maxLen);
      for (let step = 0; step < cutLen; step++) {
        const cx = horizontal ? startX + step : startX;
        const cy = horizontal ? startY : startY + step;
        if (cy <= 0 || cy >= grid.length - 1 || cx <= 0 || cx >= grid[0].length - 1) break;
        const halfThick = Math.floor(thick / 2);
        for (let dy = -halfThick; dy <= halfThick; dy++) {
          for (let dx = -halfThick; dx <= halfThick; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (ny <= 0 || ny >= grid.length - 1 || nx <= 0 || nx >= grid[0].length - 1) continue;
            grid[ny][nx] = 0;
          }
        }
      }
    }
  }

  function getOpenCells(grid) {
    const cells = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === 0 || grid[y][x] === 2) cells.push({ x, y });
      }
    }
    return cells;
  }

  function randomOpenCells(grid, count, exclude = []) {
    const excluded = new Set(exclude.map(p => `${p.x},${p.y}`));
    const available = getOpenCells(grid).filter(p => !excluded.has(`${p.x},${p.y}`));
    shuffle(available);
    return available.slice(0, count);
  }

  function findDynamicWallCandidates(grid, maxCount) {
    const W = grid[0].length;
    const H = grid.length;
    const candidates = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== 1) continue;
        const betweenVertical = grid[y - 1]?.[x] === 0 && grid[y + 1]?.[x] === 0;
        const betweenHorizontal = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
        if (betweenVertical || betweenHorizontal) candidates.push({ x, y });
      }
    }
    shuffle(candidates);
    return candidates.slice(0, maxCount);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { generate, getOpenCells, randomOpenCells, findDynamicWallCandidates, shuffle };
})();
