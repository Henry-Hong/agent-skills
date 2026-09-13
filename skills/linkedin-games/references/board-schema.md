# Board schema and DOM contract

`extract.js` returns this shape. `solvers.js` consumes it and nothing else.

```js
{
  ok: true,
  game: 'queens' | 'sudoku' | 'tango' | 'patches' | 'zip',   // from the URL path
  n: 6,                        // grid is always n x n, derived from cell count
  locked: false,               // pointer-events:none -> input is silently ignored
  finished: false,             // results link present
  cells: { 0: {cx, cy, w, h}, ... },   // viewport centres, for the host's input layer

  regions: [0,1,1,...], regionCount: 8,        // queens
  values:  [0,1,-1,...],                       // tango (0 sun, 1 moon, -1 empty)
  values:  [0,2,0,...],                        // sudoku (0 empty)
  edges:   [{kind:'eq'|'ne', a, b}],           // tango
  seeds:   [{idx, area, shape}],               // patches (area 0 = free size)
  nums:    {cellIdx: waypointNumber},          // zip
  wallMarkers: [{idx, side}],                  // zip, RAW and unfiltered
}
```

Cell indices are row-major: `idx = row * n + col`.

## Rules

- **Queens** — one queen per row, per column, per colour region; no two queens adjacent,
  including diagonally. Since queens are one-per-row, only the previous row can conflict.
- **Mini Sudoku** — 6x6, digits 1-6, boxes are 2 rows x 3 cols. The solver tries `3x2` too
  and keeps whichever yields a unique solution.
- **Tango** — each row and column holds exactly n/2 suns and n/2 moons, never 3 identical
  in a line. `=` edges force equality, `x` edges force difference.
- **Zip** — one path visiting every cell exactly once, hitting waypoints 1..k in ascending
  order, never crossing a wall.
- **Patches** — partition the grid into rectangles, exactly one seed per rectangle. A
  numbered seed must have exactly that area. Shape constraint per seed: any / tall (h>w) /
  wide (w>h) / square.

## Extraction rules that are load-bearing

**Never key on CSS class names.** They are content hashes and rotate between deploys; a
Zip wall class was observed changing within a single day.

**Strip `aria-hidden` nodes before reading text.** Cells contain position labels like
`행 1, 열 1`, whose digits otherwise get parsed as puzzle values.

**Queens regions** come from each cell's computed `backgroundColor`, mapped to indices. If
the distinct colour count is not `n`, extraction is wrong or a theme changed.

**Tango** values are `svg[data-testid]`: `cell-zero` = sun, `cell-one` = moon,
`cell-empty` = blank. Constraint signs are `[data-testid="edge-equal"]` and
`[data-testid="edge-cross"]`; the owning cell is a DOM ancestor and the direction comes
from the sign's offset against the owner's centre.

**Patches seeds** are found by `aria-label` containing `단서` / `clue`, *not* by
`[data-testid^="patches-clue-number"]`. Some seeds carry no number and have no such span;
those are free-size shapes. So seed areas do **not** always sum to the cell count, and the
grid is only solved when every cell is claimed. Grid size varies by day (6x6 and 7x7 seen).
Shape words: `자유형` any, `키 큰 직사각형` tall, `넓은 직사각형` wide, `정사각형` square.

**Zip walls** are the subtlest part. Each walled cell holds a cell-sized overlay `div`
whose `::after` is inset about `-7px` on the side carrying the wall and `-2px`/`-5px`
elsewhere. Read `getComputedStyle(child, '::after')` and treat the most negative side(s) as
walls when that minimum is `<= -6`. One overlay can encode two walls at a corner.

Corner joins bleed a **phantom marker** onto the neighbouring cell. A real vertical wall
paints on both sides of the boundary (`right` on the left cell *and* `left` on the right
cell), so an unpaired vertical marker is noise and must be dropped, or the puzzle comes out
unsolvable. Horizontal walls only ever paint `bottom` on the upper cell, so take those at
face value. `interpretWalls` does this; `solve` tries `paired` first, then `loose`.

## Input

Click cycles, established by experiment:

| Game | Cycle | Action |
|---|---|---|
| Queens | empty -> X -> queen | 2 taps per queen |
| Tango | empty -> sun -> moon -> empty | 1 tap for sun, 2 for moon |
| Sudoku | select then type | 1 tap, then the digit key |
| Zip | drag | one press-move-release through the whole path |
| Patches | drag | one press-move-release per rectangle, top-left to bottom-right |

### Synthetic vs real input

All measured on a live unlocked `interactive-grid`.

| Method | Taps | Drags |
|---|---|---|
| `element.click()` | **no** (styling only) | n/a |
| synthetic event sequence | **yes** | **no** |
| real CDP input | yes | yes |

The working tap sequence is `pointerdown` -> `mousedown` -> `pointerup` -> `mouseup` ->
`click`, each with `bubbles: true, composed: true`, correct `clientX/clientY`,
`pointerId: 1`, `pointerType: 'mouse'`, `isPrimary: true`. This is what `input.js` does.

**Synthetic drag does not work.** A `pointerdown` / `pointermove` chain / `pointerup`
sequence leaves no trace on the grid, whether the moves are dispatched on the start cell
or on the cell under each coordinate. The same path over real CDP input selects every cell
correctly. So Zip and Patches must stay on CDP, and a synthetic-only host cannot run them.

`steps: 1` on each CDP `mouse.move` is enough for the grid to register every cell along a
path, and is three times fewer round trips than `steps: 3`.

### Cost model

The solvers take milliseconds. Runtime is dominated by CDP round trips and repeated DOM
walks, so optimise those and nothing else:

| Operation | Measured |
|---|---|
| one CDP tap | ~100 ms |
| 12 taps via CDP | ~1200 ms (12 round trips) |
| 12 taps via one in-page batch | ~60 ms (1 round trip), **20x faster** |
| full `extract.js` | ~11 ms |
| `probe.js` | ~2 ms, **5x cheaper** |

That is why Mini Sudoku (24 cells x select+digit) and Tango (up to 56 taps) used to take
20 seconds, and why an 8x8 Zip drag at `steps: 3` (~190 moves) once blew a 120s tool
timeout. Batch every tap into a single `page.evaluate`; poll with `probe.js`, never with
the full extractor.

Mini Sudoku digits can be entered by tapping the on-screen `1`-`6` buttons, which keeps the
whole plan inside one in-page batch instead of interleaving CDP keyboard presses.

When an in-page batch silently no-ops, undo stays disabled. That is the signal to replay
the batch over CDP, and it is safe precisely because nothing was applied.

### Screenshot clips are device pixels

`page.screenshot({clip})` takes **device** pixels while `boundingBox()` returns CSS pixels.
On a 2x display the clip must be multiplied by `devicePixelRatio` or the crop lands in the
wrong place. This wasted time twice; prefer reading the DOM over cropping screenshots.

## Completion

A cleared board does two things: it sets `pointer-events: none` on cells and exposes a
results link (`결과 보기` / `View results`). The results **card** with `점수 복사` does not
always appear, so keying the win check on that text alone reports false failures on boards
that were in fact solved. Treat `locked || finished` as done.

Reopening a cleared game serves a fully playable practice board that keeps whatever was
last entered. Solving it changes nothing and records nothing.

## Readiness

Cells mount before walls, clue numbers, and region colours finish painting. A single read
yields a half-built board that fails as "no solution" in well under a second. Poll until
two consecutive reads agree on the puzzle content. **A sub-second failure is the signature
of this bug, not of a broken solver.**

## Reset time

All games roll over at **midnight Pacific Time**, so schedule against
`America/Los_Angeles` rather than a fixed local hour, or the offset drifts by an hour twice
a year. Puzzle numbers increment by one per day.
