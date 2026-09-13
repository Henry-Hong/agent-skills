// Pure solvers for the LinkedIn daily games.
//
// No DOM, no browser, no host APIs. Input is a board object from extract.js; output is a
// solution plus a declarative action plan. Runs in node, deno, bun, a browser console, or
// any agent REPL:
//
//   const api = new Function('return (' + src + ')')()();
//   const { plan } = api.solve(board);
//
// Action plan ops (a host needs ~20 lines to execute these):
//   { op: 'tap',  cell, times }   tap a cell N times
//   { op: 'key',  key }           type a key at the current focus
//   { op: 'drag', cells: [...] }  press on cells[0], move through the rest, release
() => {
  // ---------- queens ----------
  // one queen per row / column / region, none adjacent (incl. diagonally)
  function solveQueens(n, region) {
    const place = new Array(n).fill(-1);
    const usedCol = new Set(), usedReg = new Set();
    function dfs(r) {
      if (r === n) return true;
      for (let c = 0; c < n; c++) {
        if (usedCol.has(c)) continue;
        const g = region[r * n + c];
        if (usedReg.has(g)) continue;
        // queens are one-per-row, so only the previous row can be adjacent
        if (r > 0 && Math.abs(place[r - 1] - c) <= 1) continue;
        place[r] = c; usedCol.add(c); usedReg.add(g);
        if (dfs(r + 1)) return true;
        place[r] = -1; usedCol.delete(c); usedReg.delete(g);
      }
      return false;
    }
    return dfs(0) ? place.slice() : null;
  }

  // ---------- mini sudoku ----------
  function solveSudoku(vals, n, bh, bw) {
    const g = vals.slice();
    const ok = (i, v) => {
      const r = Math.floor(i / n), c = i % n;
      for (let k = 0; k < n; k++) {
        if (g[r * n + k] === v) return false;
        if (g[k * n + c] === v) return false;
      }
      const r0 = Math.floor(r / bh) * bh, c0 = Math.floor(c / bw) * bw;
      for (let a = 0; a < bh; a++) for (let b = 0; b < bw; b++) if (g[(r0 + a) * n + c0 + b] === v) return false;
      return true;
    };
    const sols = [];
    function bt() {
      const i = g.indexOf(0);
      if (i === -1) { sols.push(g.slice()); return sols.length > 1; }
      for (let v = 1; v <= n; v++) if (ok(i, v)) { g[i] = v; if (bt()) return true; g[i] = 0; }
      return false;
    }
    bt();
    return sols;
  }

  // ---------- tango ----------
  // each row/col half suns half moons, never 3 identical in a line, plus =/x edges
  function solveTango(vals, n, eq, ne) {
    const g = vals.slice();
    const half = n / 2;
    function feasible() {
      for (let r = 0; r < n; r++) {
        let a = 0, b = 0;
        for (let c = 0; c < n; c++) { const v = g[r * n + c]; if (v === 0) a++; else if (v === 1) b++; }
        if (a > half || b > half) return false;
      }
      for (let c = 0; c < n; c++) {
        let a = 0, b = 0;
        for (let r = 0; r < n; r++) { const v = g[r * n + c]; if (v === 0) a++; else if (v === 1) b++; }
        if (a > half || b > half) return false;
      }
      for (let r = 0; r < n; r++) for (let c = 0; c + 2 < n; c++) {
        const x = g[r * n + c];
        if (x !== -1 && x === g[r * n + c + 1] && x === g[r * n + c + 2]) return false;
      }
      for (let c = 0; c < n; c++) for (let r = 0; r + 2 < n; r++) {
        const x = g[r * n + c];
        if (x !== -1 && x === g[(r + 1) * n + c] && x === g[(r + 2) * n + c]) return false;
      }
      for (const [a, b] of eq) if (g[a] !== -1 && g[b] !== -1 && g[a] !== g[b]) return false;
      for (const [a, b] of ne) if (g[a] !== -1 && g[b] !== -1 && g[a] === g[b]) return false;
      return true;
    }
    function bt(i) {
      if (i === n * n) return feasible();
      if (g[i] !== -1) return feasible() && bt(i + 1);
      for (const v of [0, 1]) {
        g[i] = v;
        if (feasible() && bt(i + 1)) return true;
        g[i] = -1;
      }
      return false;
    }
    return bt(0) ? g.slice() : null;
  }

  // ---------- zip ----------
  // A vertical wall paints on BOTH neighbours (right on the left cell, left on the right
  // cell). Where two walls meet, the corner join bleeds a phantom marker onto an adjacent
  // cell, so an unpaired vertical marker is noise. Horizontal walls only ever paint
  // 'bottom' on the upper cell, so those are taken at face value.
  function interpretWalls(n, markers, mode) {
    if (mode === 'loose') return markers.slice();
    const has = new Set(markers.map((w) => w.idx + ':' + w.side));
    return markers.filter((w) => {
      const r = Math.floor(w.idx / n), c = w.idx % n;
      if (w.side === 'right') return c + 1 < n && has.has(w.idx + 1 + ':left');
      if (w.side === 'left') return c > 0 && has.has(w.idx - 1 + ':right');
      if (w.side === 'bottom') return true;
      if (w.side === 'top') return r > 0 && has.has(w.idx - n + ':bottom');
      return false;
    });
  }

  function solveZip(n, nums, walls) {
    const total = n * n;
    const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
    const blocked = new Set();
    for (const w of walls) {
      const r = Math.floor(w.idx / n), c = w.idx % n;
      let o = null;
      if (w.side === 'right' && c + 1 < n) o = w.idx + 1;
      if (w.side === 'left' && c > 0) o = w.idx - 1;
      if (w.side === 'bottom' && r + 1 < n) o = w.idx + n;
      if (w.side === 'top' && r > 0) o = w.idx - n;
      if (o != null) blocked.add(key(w.idx, o));
    }
    const nb = [];
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / n), c = i % n, list = [];
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const j = nr * n + nc;
        if (!blocked.has(key(i, j))) list.push(j);
      }
      nb.push(list);
    }
    let maxNum = 0, start = -1;
    for (const k in nums) {
      if (nums[k] > maxNum) maxNum = nums[k];
      if (nums[k] === 1) start = +k;
    }
    if (start < 0) return { path: null, why: 'no cell numbered 1' };

    const visited = new Array(total).fill(false);
    const path = [];
    let out = null;
    // prune: from the current cell every remaining cell must still be reachable
    function reachAll(cur) {
      const seen = new Set([cur]); const st = [cur];
      while (st.length) {
        const v = st.pop();
        for (const x of nb[v]) if (!visited[x] && !seen.has(x)) { seen.add(x); st.push(x); }
      }
      let left = 0;
      for (let i = 0; i < total; i++) if (!visited[i]) left++;
      return seen.size - 1 >= left;
    }
    function dfs(cur, need) {
      path.push(cur); visited[cur] = true;
      const at = nums[cur];
      let nx = need;
      if (at !== undefined) {
        if (at !== need) { visited[cur] = false; path.pop(); return false; }
        nx = need + 1;
      }
      if (path.length === total) {
        if (nx === maxNum + 1) { out = path.slice(); visited[cur] = false; path.pop(); return true; }
        visited[cur] = false; path.pop(); return false;
      }
      if (!reachAll(cur)) { visited[cur] = false; path.pop(); return false; }
      for (const x of nb[cur]) {
        if (visited[x]) continue;
        const ax = nums[x];
        if (ax !== undefined && ax !== nx) continue;
        if (dfs(x, nx)) { visited[cur] = false; path.pop(); return true; }
      }
      visited[cur] = false; path.pop(); return false;
    }
    dfs(start, 1);
    return { path: out };
  }

  // ---------- patches ----------
  // Split the grid into rectangles, one seed each. A numbered seed needs exactly that
  // area; a seed without a number is free-size, so the grid is only solved when every
  // cell is claimed.
  function solvePatches(n, seeds) {
    const seedPos = new Set(seeds.map((s) => s.idx));
    const total = n * n;
    const fixed = seeds.reduce((s, c) => s + (c.area || 0), 0);
    const freeBudget = total - fixed;
    const opts = seeds.map((sd) => {
      const sr = Math.floor(sd.idx / n), sc = sd.idx % n;
      const list = [];
      for (let h = 1; h <= n; h++) for (let w = 1; w <= n; w++) {
        const area = h * w;
        if (sd.area) { if (area !== sd.area) continue; }
        else if (area > freeBudget) continue;
        if (sd.shape === 'tall' && !(h > w)) continue;
        if (sd.shape === 'wide' && !(w > h)) continue;
        if (sd.shape === 'square' && h !== w) continue;
        for (let r0 = Math.max(0, sr - h + 1); r0 <= Math.min(sr, n - h); r0++) {
          for (let c0 = Math.max(0, sc - w + 1); c0 <= Math.min(sc, n - w); c0++) {
            const cells = []; let bad = false;
            for (let r = r0; r < r0 + h && !bad; r++) for (let c = c0; c < c0 + w; c++) {
              const id = r * n + c;
              if (seedPos.has(id) && id !== sd.idx) { bad = true; break; }
              cells.push(id);
            }
            if (!bad) list.push({ r0, c0, h, w, cells });
          }
        }
      }
      return { sd, list };
    });
    const own = new Array(total).fill(-1);
    let done = null;
    function bt(rem) {
      if (!rem.length) { if (own.every((v) => v !== -1)) { done = own.slice(); return true; } return false; }
      const sorted = rem.slice().sort((a, b) =>
        a.list.filter((o) => o.cells.every((x) => own[x] === -1)).length -
        b.list.filter((o) => o.cells.every((x) => own[x] === -1)).length);
      const cur = sorted[0], rest = sorted.slice(1);
      for (const o of cur.list) {
        if (!o.cells.every((x) => own[x] === -1)) continue;
        o.cells.forEach((x) => (own[x] = cur.sd.idx));
        if (bt(rest)) return true;
        o.cells.forEach((x) => (own[x] = -1));
      }
      return false;
    }
    bt(opts);
    return done;
  }

  // ---------- dispatcher: board -> solution + action plan ----------
  function solve(board) {
    if (!board || !board.ok) return { ok: false, why: (board && board.why) || 'bad board' };
    const n = board.n;

    if (board.game === 'queens') {
      if (board.regionCount !== n) return { ok: false, why: `expected ${n} regions, saw ${board.regionCount}` };
      const sol = solveQueens(n, board.regions);
      if (!sol) return { ok: false, why: 'no solution' };
      // click cycle is empty -> X -> queen
      return { ok: true, solution: sol, plan: sol.map((c, r) => ({ op: 'tap', cell: r * n + c, times: 2 })) };
    }

    if (board.game === 'sudoku') {
      let sol = null, box = null;
      for (const [bh, bw] of [[2, 3], [3, 2]]) {
        const s = solveSudoku(board.values, n, bh, bw);
        if (s.length === 1) { sol = s[0]; box = bh + 'x' + bw; break; }
      }
      if (!sol) return { ok: false, why: 'no unique solution' };
      const plan = [];
      for (let i = 0; i < n * n; i++) {
        if (board.values[i]) continue;
        plan.push({ op: 'tap', cell: i, times: 1 });
        plan.push({ op: 'key', key: String(sol[i]) });
      }
      return { ok: true, solution: sol, box, plan };
    }

    if (board.game === 'tango') {
      const eq = (board.edges || []).filter((e) => e.kind === 'eq').map((e) => [e.a, e.b]);
      const ne = (board.edges || []).filter((e) => e.kind === 'ne').map((e) => [e.a, e.b]);
      const sol = solveTango(board.values, n, eq, ne);
      if (!sol) return { ok: false, why: 'no solution' };
      const plan = [];
      for (let i = 0; i < n * n; i++) {
        if (board.values[i] !== -1) continue;
        // cycle empty -> sun(0) -> moon(1) -> empty
        plan.push({ op: 'tap', cell: i, times: sol[i] === 0 ? 1 : 2 });
      }
      return { ok: true, solution: sol, plan };
    }

    if (board.game === 'zip') {
      for (const mode of ['paired', 'loose']) {
        const walls = interpretWalls(n, board.wallMarkers || [], mode);
        const r = solveZip(n, board.nums || {}, walls);
        if (r.path) {
          return { ok: true, solution: r.path, wallMode: mode, walls: walls.length, plan: [{ op: 'drag', cells: r.path }] };
        }
      }
      return { ok: false, why: 'no path in any wall interpretation' };
    }

    if (board.game === 'patches') {
      const sum = (board.seeds || []).reduce((s, c) => s + c.area, 0);
      if (sum > n * n) return { ok: false, why: `seed areas sum to ${sum}, exceeds ${n * n}` };
      const own = solvePatches(n, board.seeds || []);
      if (!own) return { ok: false, why: 'no tiling found' };
      const groups = {};
      own.forEach((o, i) => { (groups[o] = groups[o] || []).push(i); });
      const plan = Object.keys(groups).map((o) => {
        const rs = groups[o].map((x) => Math.floor(x / n)), cs = groups[o].map((x) => x % n);
        const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
        // The drag must visit every cell of the rectangle, not just its corners: the game
        // registers cells as the pointer passes over them, it does not infer a bounding
        // box from the start/end point alone. A corners-only path leaves interior cells
        // (and, for anything but a single row/column, most of the rectangle) unclaimed
        // even though the drag itself "succeeds". Snake through every row so consecutive
        // waypoints are always adjacent.
        const cells = [];
        for (let r = r0; r <= r1; r++) {
          if ((r - r0) % 2 === 0) { for (let c = c0; c <= c1; c++) cells.push(r * n + c); }
          else { for (let c = c1; c >= c0; c--) cells.push(r * n + c); }
        }
        return { op: 'drag', cells };
      });
      return { ok: true, solution: own, regions: plan.length, plan };
    }

    return { ok: false, why: 'unknown game: ' + board.game };
  }

  return { solve, solveQueens, solveSudoku, solveTango, solveZip, solvePatches, interpretWalls };
}
