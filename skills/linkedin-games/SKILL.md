---
name: "linkedin-games"
description: "Solve the LinkedIn daily games (Queens, Mini Sudoku, Tango, Zip, Patches) automatically by reading the board from the DOM and computing the answer. Use when the user asks to play, solve, or clear LinkedIn games, or names one of those puzzles."
license: "MIT"
compatibility: "Needs a logged-in LinkedIn session and a browser surface that can evaluate JavaScript in the page and deliver pointer input. Works with Playwright/Puppeteer/CDP-based hosts. Coordinate-only computer-use agents cannot read the board and are not supported."
---

# LinkedIn Games

Read the board from the DOM, solve it in-process, input the answer. **One call per game.**
Never re-derive a puzzle by screenshotting and eyeballing it; that is the slow, unreliable
path this skill exists to replace.

## Layering

Three files, cut so that only one of them is host-specific:

| File | Depends on | Role |
|---|---|---|
| `scripts/extract.js` | DOM only | a self-contained **expression** evaluating to board JSON |
| `scripts/probe.js` | DOM only | cheap expression -> `{locked, finished, undoEnabled}` |
| `scripts/input.js` | DOM only | in-page batch tap executor |
| `scripts/solvers.js` | nothing | pure: board JSON -> solution + action plan |
| `scripts/aside.js` | Aside REPL | glues the above, owns CDP drags |

`extract.js` needs only "evaluate JS in the page, get JSON back", which every browser
automation surface provides: `page.evaluate(src)`, CDP `Runtime.evaluate`, a DevTools
console paste, or a bookmarklet.

The action plan is declarative, so a new host needs roughly 20 lines:

```js
{ op: 'tap',  cell, times }   // tap a cell N times
{ op: 'key',  key }           // type a key at the current focus
{ op: 'drag', cells: [...] }  // press on cells[0], move through the rest, release
```

## Run it (Aside)

```js
const dir = '<absolute path to this skill directory>';
const G = new Function('return (' + await fs.readFile(dir + '/scripts/aside.js', 'utf8') + ')')()({ openTab, sleep, fs, dir });

const report = await G.playAll();      // all five; skips ones already played
console.log(JSON.stringify(report, null, 1));
```

Single game: `await G.play('queens')` — names are `queens`, `sudoku`, `tango`, `zip`,
`patches`. To inspect a board without touching it: `await G.peek('zip')`.

Each result is `{ game, ok, ms, timing, steps, ... }`, where `timing` splits read / solve /
input / confirm. `skipped` means it was already played today. `playAll` closes each tab
when it is done; pass `{ closeTab: false }` to keep them.

**Report the actual times and whether anything needed a retry.** A run that technically
finished but hit a timeout and retried is not a clean run, and saying otherwise is how a
regression gets missed.

If a host caps tool-call duration, prefer one `play()` call per game. `playAll()` bundles
all five into a single call and has blown a 120s limit on a large Zip board.

## When something fails

Run the self-test first. It isolates solver bugs from browser bugs in one step.

```js
const api = new Function('return (' + await fs.readFile(dir + '/scripts/solvers.js', 'utf8') + ')')()();
const fx  = JSON.parse(await fs.readFile(dir + '/references/fixtures.json', 'utf8'));
const run = new Function('return (' + await fs.readFile(dir + '/scripts/selftest.js', 'utf8') + ')')();
console.log(run({ api, fixtures: fx.fixtures }).report);
```

- **Self-test passes, live game fails** -> extraction or input, not the solver. `peek()` the
  board and compare against `references/board-schema.md`.
- **Sub-second failure** -> the board was read before it finished painting. Readiness bug.
- **`ok: false` but the solution looks right** -> check whether the board is simply already
  done: cells go `pointer-events: none` and a `결과 보기` link appears.
- **Self-test fails** -> a solver regressed. Fix it before touching the browser.

Add every newly seen board variant to `references/fixtures.json`. That file is the only
defence against silent drift, and LinkedIn does change these boards: grid sizes vary by day
and Patches has both numbered and free-size shapes.

Read `references/board-schema.md` before editing any extraction or solver logic. It holds
the DOM contract and the non-obvious traps (phantom corner walls, hashed class names,
`aria-hidden` position text, practice boards, click cycles).

## Performance

The solvers are microseconds. Runtime is CDP round trips, so:

- taps go out as **one** in-page batch (`input.js`), ~20x faster than per-tap CDP
- polling uses `probe.js` (~2 ms), never the full extractor (~11 ms)
- drags stay on CDP because synthetic drag does not work, but use `steps: 1`
- board readiness is polled, not slept on; an already-played game is detected in ~10 ms

Before claiming an optimisation worked, measure it. See the cost model in
`references/board-schema.md`.

## Scope

Solving and submitting is fine. Do **not** press the share buttons (`올리기`, `보내기`,
`점수 복사`) — that posts a score to the user's feed or messages. Ask first.
