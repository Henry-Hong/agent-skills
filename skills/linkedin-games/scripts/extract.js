// LinkedIn games board extractor.
//
// This file is a self-contained EXPRESSION that evaluates to a board JSON object.
// It touches only the DOM, so it runs anywhere JS can be evaluated in the page:
//
//   Playwright/Puppeteer : await page.evaluate(<this file's text>)
//   raw CDP              : Runtime.evaluate({expression: <text>, returnByValue: true})
//   DevTools console     : paste it
//   bookmarklet          : javascript:<text>
//
// Keep it dependency-free and side-effect-free. Never read CSS class names: they are
// content hashes that rotate between deploys (observed changing within a single day).
(() => {
  const GAMES = ['mini-sudoku', 'queens', 'tango', 'patches', 'zip'];
  const path = location.pathname;
  const game = (GAMES.find((g) => path.includes('/games/' + g)) || '').replace('mini-sudoku', 'sudoku');
  if (!game) return { ok: false, why: 'not on a known game page', path };

  // aria-hidden spans hold position labels like "행 1, 열 1"; their digits must not be
  // mistaken for puzzle values.
  const text = (el) => {
    const k = el.cloneNode(true);
    k.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
    return (k.textContent || '').trim();
  };

  let nodes = [...document.querySelectorAll('[data-cell-idx]')];
  let byIdx = [];
  if (nodes.length) {
    nodes.forEach((c) => { byIdx[+c.getAttribute('data-cell-idx')] = c; });
  } else {
    // Mini Sudoku has been seen without data-cell-idx; fall back to the n*n-child grid.
    for (const d of document.querySelectorAll('div')) {
      if (d.children.length === 36) { byIdx = [...d.children]; break; }
    }
  }
  const count = byIdx.filter(Boolean).length;
  if (!count) return { ok: false, game, why: 'no cells mounted yet' };
  const n = Math.round(Math.sqrt(count));

  const body = document.body.innerText || '';
  const board = {
    ok: true,
    game,
    n,
    // A cleared board is locked with pointer-events:none, so input is silently ignored.
    // This is a language-independent "already done" signal.
    locked: getComputedStyle(byIdx.find(Boolean)).pointerEvents === 'none',
    finished: !!document.querySelector('a[href*="/results/"]') ||
      /결과 보기|View results|점수 복사|Copy score/.test(body),
    cells: {},
  };
  byIdx.forEach((c, i) => {
    if (!c) return;
    const r = c.getBoundingClientRect();
    board.cells[i] = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  });

  if (game === 'queens') {
    // one queen per row / column / colour region, none touching even diagonally
    board.regions = [];
    const seen = [];
    byIdx.forEach((c, i) => {
      const bg = getComputedStyle(c).backgroundColor;
      let k = seen.indexOf(bg);
      if (k < 0) { seen.push(bg); k = seen.length - 1; }
      board.regions[i] = k;
    });
    board.regionCount = seen.length;
  }

  if (game === 'sudoku') {
    board.values = byIdx.map((c) => {
      const t = text(c);
      return /^[1-9]$/.test(t) ? +t : 0;
    });
  }

  if (game === 'tango') {
    // cell-zero = sun, cell-one = moon, cell-empty = blank
    board.values = byIdx.map((c) => {
      const s = c.querySelector('svg[data-testid]');
      const t = s ? s.getAttribute('data-testid') || '' : '';
      return /cell-zero/.test(t) ? 0 : /cell-one/.test(t) ? 1 : -1;
    });
    board.edges = [];
    document.querySelectorAll('[data-testid="edge-equal"],[data-testid="edge-cross"]').forEach((e) => {
      let p = e.parentElement, owner = null;
      while (p) {
        if (p.hasAttribute && p.hasAttribute('data-cell-idx')) { owner = +p.getAttribute('data-cell-idx'); break; }
        p = p.parentElement;
      }
      if (owner == null || !board.cells[owner]) return;
      const r = e.getBoundingClientRect();
      const dx = r.x + r.width / 2 - board.cells[owner].cx;
      const dy = r.y + r.height / 2 - board.cells[owner].cy;
      const col = owner % n, row = Math.floor(owner / n);
      let other = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && col + 1 < n) other = owner + 1;
        else if (dx < 0 && col > 0) other = owner - 1;
      } else if (dy > 0 && row + 1 < n) other = owner + n;
      else if (dy < 0 && row > 0) other = owner - n;
      if (other == null) return;
      board.edges.push({ kind: e.getAttribute('data-testid') === 'edge-equal' ? 'eq' : 'ne', a: owner, b: other });
    });
  }

  if (game === 'patches') {
    // Every seed says 단서/clue in aria-label. Only SOME carry a size ("셀 4"); a seed
    // without one is a free-size shape, so areas need not sum to the cell count.
    //
    // Non-seed cells belonging to a clued region ALSO say 단서 in their aria-label, but
    // as a reference to another cell: "행 1, 열 5에 단서가 있는 영역" ("region whose clue
    // is at row 1, col 5"). Only the real seed cell's label has 단서 immediately
    // followed by a comma/shape word, never "가 있는" (has-a-clue-at). Filter those out
    // or every referencing cell gets miscounted as its own seed.
    board.seeds = [];
    byIdx.forEach((c, i) => {
      const al = c.getAttribute('aria-label') || '';
      if (!/단서|clue/i.test(al)) return;
      if (/가\s*있는|has\s+a\s+clue/i.test(al)) return;
      let shape = 'any';
      if (/정사각형|square/i.test(al) && !/직사각형|rectangle/i.test(al)) shape = 'square';
      else if (/키 큰|tall/i.test(al)) shape = 'tall';
      else if (/넓은|wide/i.test(al)) shape = 'wide';
      const m = al.match(/셀\s*(\d+)/) || al.match(/(\d+)\s*cells?/i);
      board.seeds.push({ idx: i, area: m ? +m[1] : 0, shape });
    });
  }

  if (game === 'zip') {
    board.nums = {};
    board.wallMarkers = [];
    byIdx.forEach((c, i) => {
      const al = c.getAttribute('aria-label') || '';
      const am = al.match(/^\s*(\d+)/);
      const tm = text(c).match(/^(\d+)$/);
      if (am) board.nums[i] = +am[1];
      else if (tm) board.nums[i] = +tm[1];
      // Walls live on a cell-sized overlay whose ::after is inset ~-7px on the walled
      // side and -2/-5px elsewhere. Emitted RAW: corner joins bleed phantom markers onto
      // neighbours, and filtering that is the solver's job.
      const r = c.getBoundingClientRect();
      for (const ch of c.children) {
        const cr = ch.getBoundingClientRect();
        if (cr.width < r.width * 0.8) continue;
        const a = getComputedStyle(ch, '::after');
        if (!a.content || a.content === 'none') continue;
        const side = { top: parseFloat(a.top), left: parseFloat(a.left), right: parseFloat(a.right), bottom: parseFloat(a.bottom) };
        const vals = Object.values(side).filter((v) => !isNaN(v));
        if (!vals.length) continue;
        const min = Math.min(...vals);
        if (min > -6) continue;
        for (const k of ['top', 'left', 'right', 'bottom']) {
          if (side[k] === min) board.wallMarkers.push({ idx: i, side: k });
        }
      }
    });
  }

  return board;
})()
