/* =================================================================
   Pure helpers for fixed-window UI state.

   These are split out of display.js / app.js so they can be unit
   tested without touching the DOM.  Both functions are referentially
   transparent — given the same inputs they return the same output —
   and they never mutate their arguments.

   `clampStackScroll` answers: "given the current stack depth and a
   requested scroll offset, what's the legal offset?".  A zero offset
   means the bottom row of the LCD shows level 1 (the usual HP50
   reading).  Each step of scroll-up moves the window one row up,
   revealing one higher-numbered level at the top and hiding level 1.

   `computeMenuPage` answers: "given the full list of menu slots and
   a page index, what's the 6-slot view, normalized page number, and
   total page count?".  Pages wrap modularly so NXT/PREV can cycle
   forever without bounds-checking at the call site.
   ================================================================= */

/** Clamp a requested stack scroll to [0, depth-1].
 *  A depth of 0 or 1 always clamps to 0 — there's nothing to scroll. */
export function clampStackScroll(scroll, depth) {
  if (!Number.isFinite(scroll)) return 0;
  if (depth <= 1) return 0;
  const n = Math.floor(scroll);
  if (n <= 0) return 0;
  if (n >= depth - 1) return depth - 1;
  return n;
}

/** Compute the visible 6-slot view of a soft-menu, given the full
 *  slot array and a 0-based page index that may be out of range
 *  (negative or >= totalPages).  Returns:
 *    { view, totalPages, page, hasMore }
 *  `view` is always exactly `pageSize` entries long — short pages are
 *  padded with nulls on the right so F1..F6 always have a defined slot.
 *  `hasMore` is true when totalPages > 1 (i.e., NXT/PREV are useful).
 */
export function computeMenuPage(allSlots, page, pageSize = 6) {
  const slots = Array.isArray(allSlots) ? allSlots : [];
  const totalPages = Math.max(1, Math.ceil(slots.length / pageSize));
  // true modulus so negative pages wrap to the end
  const norm = ((Math.floor(page || 0) % totalPages) + totalPages) % totalPages;
  const start = norm * pageSize;
  const view = slots.slice(start, start + pageSize);
  while (view.length < pageSize) view.push(null);
  return {
    view,
    totalPages,
    page: norm,
    hasMore: totalPages > 1,
  };
}
