// Regression test for the pure solvers. No browser, no network.
//
//   const api = new Function('return (' + solversSrc + ')')()();
//   const fx  = JSON.parse(fixturesJson);
//   const run = new Function('return (' + selftestSrc + ')')();
//   console.log(run({ api, fixtures: fx.fixtures }).report);
//
// Run this after ANY edit to solvers.js, and first when a live game starts failing: if
// selftest passes, the solver is fine and the problem is in extraction or input.
({ api, fixtures }) => {
  const rows = [];
  let pass = 0;

  for (const fx of fixtures) {
    const e = fx.expect || {};
    const res = api.solve(fx.board);
    const fail = [];

    if (!res.ok) {
      fail.push('solve failed: ' + res.why);
    } else {
      if (e.solutionJson && JSON.stringify(res.solution) !== e.solutionJson) fail.push('solution mismatch');
      if (e.solutionDigits && res.solution.join('') !== e.solutionDigits) fail.push('digits mismatch');
      if (e.box && res.box !== e.box) fail.push(`box ${res.box} != ${e.box}`);
      if (e.planSteps && res.plan.length !== e.planSteps) fail.push(`plan ${res.plan.length} != ${e.planSteps}`);
      if (e.regions && res.regions !== e.regions) fail.push(`regions ${res.regions} != ${e.regions}`);
      if (e.wallMode && res.wallMode !== e.wallMode) fail.push(`wallMode ${res.wallMode} != ${e.wallMode}`);

      if (e.pathLength) {
        const p = res.solution;
        if (p.length !== e.pathLength) fail.push(`path ${p.length} != ${e.pathLength}`);
        if (new Set(p).size !== e.pathLength) fail.push('path revisits cells');
      }
      if (e.waypointOrder) {
        const nums = fx.board.nums || {};
        const order = res.solution
          .map((c, i) => (nums[c] !== undefined ? [nums[c], i] : null))
          .filter(Boolean).sort((a, b) => a[1] - b[1]).map((x) => x[0]).join(',');
        if (order !== e.waypointOrder) fail.push(`waypoints ${order} != ${e.waypointOrder}`);
      }
      if (e.fullCover && res.solution.some((v) => v === -1)) fail.push('tiling leaves cells unclaimed');

      // Every 'drag' step must visit EVERY cell of its rectangle, each consecutive pair
      // grid-adjacent (row/col differs by exactly 1 in one axis). A corners-only path
      // (e.g. [topLeft, bottomRight]) drags past the grid on a diagonal and the game only
      // ever commits the cells the pointer actually crossed, silently leaving the
      // interior unclaimed. Regressed once already; keep this check.
      if (fx.board.game === 'patches') {
        const n = fx.board.n;
        for (const step of res.plan || []) {
          if (step.op !== 'drag') continue;
          for (let i = 1; i < step.cells.length; i++) {
            const a = step.cells[i - 1], b = step.cells[i];
            const ar = Math.floor(a / n), ac = a % n, br = Math.floor(b / n), bc = b % n;
            const adjacent = (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
            if (!adjacent) { fail.push(`drag step has non-adjacent hop ${a}->${b}`); break; }
          }
        }
      }
    }

    if (!fail.length) pass++;
    rows.push((fail.length ? 'FAIL' : 'PASS') + '  ' + fx.name + (fail.length ? '  <- ' + fail.join('; ') : ''));
  }

  return {
    ok: pass === fixtures.length,
    pass, total: fixtures.length,
    report: rows.join('\n') + `\n\n${pass}/${fixtures.length} passed`,
  };
}
