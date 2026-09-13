// In-page batch input. Function expression: (ops) => {ok, done}.
//
// Call it as an expression so no function serialization is needed:
//   page.evaluate(`(${src})(${JSON.stringify(ops)})`)
//
// ops: [{ kind: 'cell', cell, times }, { kind: 'button', label, times }]
//
// Why this exists: driving taps over CDP costs one round trip each. Mini Sudoku is 24
// cells x (select + digit) and Tango is up to 56 taps, which dominated the runtime. This
// collapses a whole batch into a single evaluate.
//
// VERIFIED: synthetic taps register. `element.click()` alone does NOT - it only changes
// styling. The full sequence below is required.
// NOT VERIFIED: synthetic drag. A pointerdown/pointermove/pointerup chain does not trace
// a path on the real grid, so Zip and Patches must stay on real CDP input.
(ops) => {
  const fire = (el, Ctor, type, x, y, buttons) => el.dispatchEvent(new Ctor(type, {
    bubbles: true, composed: true, cancelable: true, view: window,
    clientX: x, clientY: y,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons,
  }));

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const tap = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    fire(el, PointerEvent, 'pointerover', x, y, 0);
    fire(el, PointerEvent, 'pointerenter', x, y, 0);
    fire(el, PointerEvent, 'pointerdown', x, y, 1);
    fire(el, MouseEvent, 'mousedown', x, y, 1);
    fire(el, PointerEvent, 'pointerup', x, y, 0);
    fire(el, MouseEvent, 'mouseup', x, y, 0);
    fire(el, MouseEvent, 'click', x, y, 0);
  };

  // Dispatching many synthetic taps back-to-back with no yield between them causes
  // React to only commit the LAST tap's state; earlier taps in the same batch silently
  // vanish even though `res.ok` reports true and undo becomes enabled (because the last
  // tap did apply). A ~30ms `setTimeout` yield after each tap lets React flush its
  // commit before the next tap fires. This costs about 30ms x total-taps but that is
  // still one CDP round trip and far cheaper than falling back to per-tap CDP clicks.
  return (async () => {
    let done = 0;
    for (const op of ops) {
      let el = null;
      if (op.kind === 'cell') {
        el = document.querySelector(`[data-cell-idx="${op.cell}"]`);
      } else if (op.kind === 'button') {
        el = [...document.querySelectorAll('button')]
          .find((b) => (b.textContent || '').trim() === op.label && !b.disabled);
      }
      if (!el) return { ok: false, done, missing: op };
      for (let k = 0; k < (op.times || 1); k++) { tap(el); await wait(30); }
      done++;
    }
    return { ok: true, done };
  })();
}
