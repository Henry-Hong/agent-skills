// Aside adapter: drives the browser, delegates all puzzle logic to extract.js + solvers.js.
//
// This is the only file that knows about Aside's REPL globals. Porting to another host
// means rewriting `runPlan` and how the extractor source is evaluated in the page.
//
// Cost model, which is what actually determines runtime: the solvers take milliseconds.
// Everything else is CDP round trips and repeated DOM walks. So taps go through a single
// in-page batch, polling uses the cheap probe, and only drags pay per-move CDP cost.
(ctx) => {
  const { openTab, closeTab, sleep, fs, dir } = ctx;
  const SKILL_DIR = dir;
  if (!SKILL_DIR) throw new Error('linkedin-games: pass ctx.dir = absolute path to this skill directory');

  const URLS = {
    queens: 'https://www.linkedin.com/games/queens',
    sudoku: 'https://www.linkedin.com/games/mini-sudoku',
    tango: 'https://www.linkedin.com/games/tango',
    patches: 'https://www.linkedin.com/games/patches',
    zip: 'https://www.linkedin.com/games/zip',
  };

  let extractSrc = null, probeSrc = null, inputSrc = null, api = null;
  async function load() {
    const rd = (f) => fs.readFile(SKILL_DIR + '/scripts/' + f, 'utf8');
    if (!extractSrc) extractSrc = await rd('extract.js');
    if (!probeSrc) probeSrc = await rd('probe.js');
    if (!inputSrc) inputSrc = await rd('input.js');
    if (!api) api = new Function('return (' + await rd('solvers.js') + ')')()();
  }

  const read = (page) => page.evaluate(extractSrc);      // full board, expensive
  const probe = (page) => page.evaluate(probeSrc);       // 3 booleans, cheap

  const sig = (b) => JSON.stringify([b && b.ok, b && b.n, b && b.values, b && b.regions,
    b && b.nums, b && b.wallMarkers, b && b.seeds, b && b.edges]);

  // Cells mount before walls / clues / region colours finish painting. Reading once gives a
  // half-built board that fails as "no solution" in well under a second.
  async function stable(page, ms = 9000) {
    let prev = null, prevSig = null;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const cur = await read(page);
      const s = sig(cur);
      if (prevSig && s === prevSig && cur && cur.ok) return cur;
      prev = cur; prevSig = s;
      await sleep(400);
    }
    return prev;
  }

  async function cdpTaps(page, steps, cells) {
    for (const s of steps) {
      if (s.op === 'tap') {
        const p = cells[s.cell];
        for (let k = 0; k < (s.times || 1); k++) await page.mouse.click(p.cx, p.cy);
      } else if (s.op === 'key') {
        await page.keyboard.press(s.key);
      }
    }
  }

  async function runPlan(page, plan, cells) {
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const ops = batch.map((s) => (s.op === 'tap'
        ? { kind: 'cell', cell: s.cell, times: s.times || 1 }
        : { kind: 'button', label: s.key, times: 1 }));
      let res = null;
      try { res = await page.evaluate(`(${inputSrc})(${JSON.stringify(ops)})`); } catch (e) { res = null; }
      // If nothing registered at all, the batch was a no-op and replaying it over CDP is
      // safe. Undo staying disabled is the decisive signal; a partial apply would have
      // enabled it.
      const after = await probe(page);
      if (!res || !res.ok || after.undoEnabled === false) {
        await cdpTaps(page, batch, cells);
      }
      batch = [];
    };

    for (const step of plan) {
      if (step.op === 'drag') {
        await flush();
        const pts = step.cells.map((i) => cells[i]);
        await page.mouse.move(pts[0].cx, pts[0].cy);
        await page.mouse.down();
        // steps:2 plus a 400ms settle after mouse.up() is required, at least for Patches:
        // a long multi-cell drag (a whole rectangle's worth of cells) with steps:1 and a
        // short settle silently drops most cells from the selection even though the board
        // visually flashes every cell as filled during the drag and undo goes enabled.
        // The game only actually commits under time pressure if given enough per-move and
        // post-drag processing time; the color shown mid-drag is a live preview, not the
        // committed state. Confirmed empirically: steps:1 + 120ms settle -> only 1-2 of 10
        // rectangles commit; steps:2 + 400ms settle -> all 10 commit and the board locks.
        for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i].cx, pts[i].cy, { steps: 2 });
        await page.mouse.up();
        await sleep(400);
      } else {
        batch.push(step);
      }
    }
    await flush();
  }

  // A solved board locks (pointer-events:none) and exposes a results link. The results
  // *card* does not always appear, so never key this on "점수 복사" alone.
  async function waitDone(page, ms = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const p = await probe(page);
      if (p.finished || p.locked) return true;
      await sleep(300);
    }
    return false;
  }

  // Poll for the grid instead of sleeping a fixed 2s per game. probe() returns
  // locked:null until a cell exists, so it doubles as a readiness check.
  async function waitMounted(page, ms = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const p = await probe(page);
      if (p.locked !== null) return p;
      await sleep(200);
    }
    return await probe(page);
  }

  async function play(name, opts = {}) {
    await load();
    if (!URLS[name]) throw new Error('unknown game: ' + name);
    const page = await openTab(URLS[name]);
    const t0 = Date.now();

    const early = await waitMounted(page);
    const finish = async (r) => {
      if (opts.closeTab && closeTab) { try { await closeTab(page); } catch (e) { /* ignore */ } }
      return r;
    };
    if (early.finished || early.locked) return finish({ game: name, ok: true, skipped: 'already played today', ms: Date.now() - t0 });

    const board = await stable(page);
    if (!board || !board.ok) return finish({ game: name, ok: false, why: (board && board.why) || 'no board' });
    if (board.finished || board.locked) return finish({ game: name, ok: true, skipped: 'already played today' });
    const tRead = Date.now();

    const res = api.solve(board);
    if (!res.ok) return finish({ game: name, ok: false, why: res.why });
    const tSolve = Date.now();

    await runPlan(page, res.plan, board.cells);
    const tInput = Date.now();

    const done = await waitDone(page);
    return finish({
      game: name, ok: done, ms: Date.now() - t0,
      timing: { read: tRead - t0, solve: tSolve - tRead, input: tInput - tSolve, confirm: Date.now() - tInput },
      steps: res.plan.length,
      wallMode: res.wallMode, box: res.box, regions: res.regions,
      why: done ? undefined : 'input done but board never locked',
    });
  }

  // Solve one game per call. playAll bundles all five into a single tool call, which has
  // blown a 120s tool timeout on a big Zip board; prefer per-game calls when a host caps
  // call duration.
  async function playAll(order = ['queens', 'sudoku', 'tango', 'patches', 'zip'], opts = { closeTab: true }) {
    const out = [];
    for (const g of order) {
      try { out.push(await play(g, opts)); }
      catch (e) { out.push({ game: g, ok: false, why: 'threw: ' + e.message }); }
    }
    return out;
  }

  async function peek(name) {
    await load();
    const page = await openTab(URLS[name]);
    await waitMounted(page);
    return await stable(page);
  }

  return { play, playAll, peek, URLS, load, read, probe, get api() { return api; } };
}
