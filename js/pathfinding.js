export const Pathfinding = (() => {
  function bfs(grid, start, end) {
    const rows = grid.length;
    const cols = grid[0].length;

    if (!isWalkable(grid, start.x, start.y)) return null;
    if (!isWalkable(grid, end.x, end.y)) return null;
    if (start.x === end.x && start.y === end.y) return [start];

    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const queue = [{ x: start.x, y: start.y, parent: null }];
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
    visited[start.y][start.x] = true;

    while (queue.length) {
      const current = queue.shift();
      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (!isWalkable(grid, nx, ny) || visited[ny][nx]) continue;
        const neighbor = { x: nx, y: ny, parent: current };
        visited[ny][nx] = true;
        if (nx === end.x && ny === end.y) return reconstructPath(neighbor);
        queue.push(neighbor);
      }
    }
    return null;
  }

  function reconstructPath(node) {
    const path = [];
    while (node) {
      path.unshift({ x: node.x, y: node.y });
      node = node.parent;
    }
    return path;
  }

  function isWalkable(grid, x, y) {
    return grid[y] && (grid[y][x] === 0 || grid[y][x] === 2);
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function randomNeighbor(grid, pos) {
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const walkable = dirs
      .map(d => ({ x: pos.x + d.x, y: pos.y + d.y }))
      .filter(p => isWalkable(grid, p.x, p.y));
    return walkable.length
      ? walkable[Math.floor(Math.random() * walkable.length)]
      : pos;
  }

  function isConnected(grid, a, b) {
    return bfs(grid, a, b) !== null;
  }

  return { bfs, manhattan, randomNeighbor, isWalkable, isConnected };
})();
