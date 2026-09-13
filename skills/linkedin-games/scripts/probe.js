// Cheap liveness probe. Expression -> {locked, finished, undoEnabled}.
//
// Use this for polling instead of the full extractor. extract.js walks every cell and
// calls getComputedStyle on pseudo-elements, which is fine once but ruinous in a 300ms
// poll loop (it was a large part of why a Zip run blew the 120s tool timeout).
(() => {
  const cell = document.querySelector('[data-cell-idx]');
  const undo = [...document.querySelectorAll('button')]
    .find((b) => /실행 취소|Undo/.test(b.textContent || ''));
  return {
    // a cleared board stops accepting pointer input
    locked: cell ? getComputedStyle(cell).pointerEvents === 'none' : null,
    finished: !!document.querySelector('a[href*="/results/"]') ||
      /결과 보기|View results|점수 복사|Copy score/.test(document.body.innerText || ''),
    // proof that at least one move registered; used to detect input that silently no-ops
    undoEnabled: undo ? !undo.disabled : null,
  };
})()
