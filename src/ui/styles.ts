/**
 * The panel's whole stylesheet. It lives inside the shadow root, so page css
 * cannot reach it and none of it reaches the page. `all: initial` on the
 * wrapper stops inherited page styles too, and `direction` is set by hand
 * because `all` leaves it alone and the locale knob flips it on `<html>`.
 *
 * Pointer events are off everywhere and turned back on one surface at a time,
 * so the panel only ever catches a click where the user can see it.
 *
 * The prefers queries here read what the browser really prefers: devknobs
 * rewrites the page's stylesheets, never this one, so the panel keeps the
 * user's own scheme and motion whatever the knobs emulate.
 *
 * Nested rounded boxes are concentric: a box's radius is its parent's less the
 * space between them. The panel is 13 with 1 of border and 4 of padding, so
 * the rows, results, add knob button and search are 8; an open row pads its
 * editor by 4, so controls are 4, and what sits 2 inside a control is 2.
 *
 * The panel lives on the right edge of the window, and `data-side="left"` on
 * the wrapper mirrors it onto the left: the handle on the panel's other side,
 * the borders, the radii and the slide.
 *
 * The side on the window's edge has no border and no radius. A drag that
 * carries the panel off its edge sets `data-float`, which draws that side like
 * the others, and the padding there gives the border its pixel, so the box is
 * one size whatever shows. It eases back flush with the glide, and the border
 * goes only once it is clear: a clear border with a width still cuts the ends
 * of the lines it meets.
 */
export const CSS = `
.wrap {
  all: initial;
  direction: ltr;
  /* The host box stays the size of an open panel however far the wrapper is
     translated, so nothing in here takes a pointer by default. The reset above
     puts pointer-events back to auto, which is why the wrapper says it again. */
  pointer-events: none;
  color-scheme: light dark;
  --bg: #fbfbf9;
  --fg: #1b1b19;
  --faint: #73736d;
  --line: #e6e6e0;
  --card: #f1f1ec;
  --track: #e6e6e0;
  --raised: #ffffff;
  --lift: 0 1px 2px rgb(0 0 0 / 0.1);
  --hot: #e5484d;
  --edge: 0px;
  --edge-line: transparent;
  --glide: 220ms;
  display: flex;
  align-items: flex-start;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  transform: translateX(239px);
  /* The open and close slide is the transform. A drag moves the wrapper by
     translate, one to one, and lets it glide to its place from there. A glide
     takes --glide, which the panel sets longer for a long way, and the edge
     eases back flush in the same time. */
  transition: transform 150ms ease-out, translate var(--glide) ease-out;
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --bg: #151513;
    --fg: #e9e9e3;
    --faint: #8c8c85;
    --line: #2b2b28;
    --card: #1f1f1c;
    --track: #0f0f0e;
    --raised: #383833;
    --lift: none;
    --hot: #ff6369;
  }
}
.wrap[data-side="left"] { flex-direction: row-reverse; transform: translateX(-239px); }
.wrap[data-open="true"] { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) {
  .wrap, .wrap *, .wrap *::before, .wrap *::after {
    transition: none !important;
    animation: none !important;
  }
}
.wrap [hidden] { display: none !important; }

button, input, textarea {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  margin: 0;
  font: inherit;
  color: inherit;
}
button {
  padding: 0;
  text-align: inherit;
  white-space: nowrap;
  background: none;
  border: 0;
  cursor: pointer;
}
:focus { outline: none; }
button:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }

.handle {
  flex: none;
  box-sizing: border-box;
  /* Sits a pixel over the panel and above it, so the handle's own background
     hides the panel's border on that side and the two read as one outline. */
  position: relative;
  z-index: 1;
  width: 22px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: -1px;
  letter-spacing: 0.06em;
  text-align: center;
  writing-mode: vertical-rl;
  color: var(--faint);
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0 solid var(--edge-line);
  border-radius: 8px var(--edge) var(--edge) 8px;
  /* The one thing a closed panel shows, so the one thing it can be clicked on. */
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.handle:hover { color: var(--fg); }
.handle:focus-visible { outline-offset: 2px; }
.wrap[data-drag="panel"] .handle { cursor: grabbing; }
.wrap[data-drag="handle"] .handle { cursor: ns-resize; }
.wrap[data-side="left"] .handle {
  margin-right: 0;
  margin-left: -1px;
  border-right: 1px solid var(--line);
  border-left: 0 solid var(--edge-line);
  border-radius: var(--edge) 8px 8px var(--edge);
}
/* A closed panel shows the handle alone, so off the edge the handle is what
   floats. Open, its edge side is the panel's and stays as it is. The border
   there comes at once and goes when its color has eased out, and the padding
   on the other side keeps the label in the middle. */
.wrap[data-open="false"] .handle {
  transition: border-top-right-radius var(--glide) ease-out,
    border-bottom-right-radius var(--glide) ease-out, border-right-color var(--glide) ease-out,
    border-right-width 0s linear var(--glide), padding-left 0s linear var(--glide);
}
.wrap[data-open="false"][data-side="left"] .handle {
  transition-property: border-top-left-radius, border-bottom-left-radius, border-left-color,
    border-left-width, padding-right;
}
.wrap[data-float="true"][data-open="false"] .handle {
  --edge: 8px;
  --edge-line: var(--line);
  padding-left: 1px;
  border-right-width: 1px;
  transition-delay: 0s;
}
.wrap[data-float="true"][data-open="false"][data-side="left"] .handle {
  padding: 0 1px 0 0;
  border-left-width: 1px;
}

.panel {
  flex: none;
  box-sizing: border-box;
  width: 240px;
  display: flex;
  flex-direction: column;
  /* All the height there is, less the gap the panel keeps top and bottom, and
     no taller than a list is worth. What is past it scrolls inside. */
  max-height: min(672px, calc(100vh - 16px));
  max-height: min(672px, calc(100dvh - 16px));
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0 solid var(--edge-line);
  border-radius: 13px var(--edge) var(--edge) 13px;
  /* Closed, the wrapper slides out only as far as the handle's width, and the
     handle overlaps the panel by a pixel, so the panel's border by the handle
     would stay on the window's edge as a line the panel's height. It hides
     once the slide is over. The edge side's border and the padding that pays
     for it go once its color has eased out. */
  visibility: hidden;
  transition: visibility 0s linear 150ms, border-top-right-radius var(--glide) ease-out,
    border-bottom-right-radius var(--glide) ease-out, border-right-color var(--glide) ease-out,
    border-right-width 0s linear var(--glide), padding-right 0s linear var(--glide);
}
/* Only a panel that is out catches anything. The attribute flips the moment
   the close starts, so the slide back leaves nothing hit-testable behind. */
.wrap[data-open="true"] .panel {
  pointer-events: auto;
  visibility: visible;
  transition-delay: 0s, 0s, 0s, 0s, var(--glide), var(--glide);
}
/* The handle covers one of these corners, so square that one off. It goes by
   the tab alone, not by data-open: the open flag flips the moment a close
   starts, while the panel shows until the slide is over. A panel the handle
   meets in the middle keeps both radii. The left side's own radii come after
   the right side's corners here, so those never square its edge side. */
.wrap[data-tab="top"] .panel { border-top-left-radius: 0; }
.wrap[data-tab="bottom"] .panel { border-bottom-left-radius: 0; }
.wrap[data-side="left"] .panel {
  border-right: 1px solid var(--line);
  border-left: 0 solid var(--edge-line);
  border-radius: var(--edge) 13px 13px var(--edge);
  transition-property: visibility, border-top-left-radius, border-bottom-left-radius,
    border-left-color, border-left-width, padding-left;
}
.wrap[data-side="left"][data-tab="top"] .panel { border-top-right-radius: 0; }
.wrap[data-side="left"][data-tab="bottom"] .panel { border-bottom-right-radius: 0; }
/* Off the edge the border comes at once. A panel that closes there still
   hides only once its slide is over. */
.wrap[data-float="true"] .panel {
  --edge: 13px;
  --edge-line: var(--line);
  padding-right: 3px;
  border-right-width: 1px;
  transition-delay: 0s;
}
.wrap[data-float="true"][data-side="left"] .panel {
  padding: 4px 4px 4px 3px;
  border-left-width: 1px;
}
.wrap[data-float="true"][data-open="false"] .panel { transition-delay: 150ms, 0s, 0s, 0s, 0s, 0s; }

/* The search opens where the add knob button was, and is as tall as a row. */
.head {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 10px;
  background: var(--card);
  border-radius: 8px;
  cursor: text;
}
.head:focus-within { box-shadow: inset 0 0 0 1px var(--line); }
.search { flex: 1; min-width: 0; padding: 0; background: transparent; border: 0; }
.search::placeholder { color: var(--faint); }
/* 4 in from the search's edges, so 4 round. */
.search-close {
  flex: none;
  width: 22px;
  height: 22px;
  margin-right: -6px;
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.search-close:hover { color: var(--fg); background: var(--track); }

/* Its plus and label line up with the rows' icons and names, past the grip. */
.add {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 10px 0 22px;
  color: var(--faint);
  border-radius: 8px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.add:hover { color: var(--fg); background: var(--card); }
/* Icons sit in the middle of a line whose text sits on its baseline. Beside a
   row's or a result's name they stay faint, so the words are read first. */
.glyph { flex: none; align-self: center; }
.main .glyph, .entry .glyph { color: var(--faint); }
.entry .glyph { margin-right: 2px; }

/* The rows on top, then the add knob button, or the search in its place with
   its results under it. The rows and the results each scroll in their own
   room, so the results never cover the rows. */
.body {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rows, .results {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
/* While the search is open the rows keep their height up to two fifths of the
   tallest panel, and scroll past it, so the results have the rest. */
.wrap:not([data-mode="rows"]) .rows {
  flex-shrink: 0;
  max-height: calc(min(672px, 100vh - 16px) * 0.4);
  max-height: calc(min(672px, 100dvh - 16px) * 0.4);
}
.wrap[data-mode="rows"] .results,
.wrap[data-mode="rows"] .head,
.wrap:not([data-mode="rows"]) .add,
.wrap:not([data-mode="rows"]) .body > .empty,
.wrap[data-mode="keys"] .rows,
.wrap[data-mode="keys"] .results,
.wrap[data-mode="keys"] .head,
.wrap:not([data-mode="keys"]) .keys { display: none; }
.empty { padding: 4px 10px; color: var(--faint); }
/* Heard, not seen. */
.said {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; align-content: start; }
.row { position: relative; border-radius: 8px; transition: background-color 120ms ease-out; }
.row:hover, .row.open { background: var(--card); }
/* The grip has its own column in the row's leading padding, kept whether it
   shows or not so nothing moves on hover. It shows on hover or focus, or
   always where there is no hover. 4 in from the row's edges, so 4 round. */
.grip {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
  width: 14px;
  height: 18px;
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 4px;
  opacity: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.grip:hover { color: var(--fg); }
.row:hover .grip, .row:focus-within .grip, .row.lifted .grip { opacity: 1; }
@media (hover: none) {
  .grip { opacity: 1; }
}
/* While a row is dragged the others make way for it, and it rides above them. */
.rows.reordering .row { transition: transform 150ms ease-out, background-color 120ms ease-out; }
.rows.reordering .row.lifted {
  z-index: 2;
  background: var(--card);
  box-shadow: var(--lift);
  transition: none;
}
.rows.reordering .grip { cursor: grabbing; }
.line { display: flex; align-items: center; }
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px 4px 22px;
  border-radius: 8px;
}
.row-label { flex: none; color: var(--faint); }
.row-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
/* A row kept in the list with its knobs back at their defaults. */
.row-value.idle { color: var(--faint); }
.row-value.hot { color: var(--hot); }
.clear {
  flex: none;
  width: 22px;
  height: 22px;
  margin: 2px;
  display: grid;
  place-items: center;
  color: var(--faint);
  border-radius: 6px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.clear:hover { color: var(--fg); background: var(--track); }

/* An open row's editor folds out under its line and pushes the rows below it
   down. The fold eases between none and all of the editor's height, and clips
   what is past it without scrolling, so a control focused while it folds out
   never shifts the editor. The track's floor of 0 lets it close past the
   editor's padding, which a bare 0fr keeps open. */
.fold {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  overflow: clip;
  transition: grid-template-rows 180ms ease-out;
}
.row.open .fold { grid-template-rows: minmax(0, 1fr); }
.editor {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 2px 4px 6px;
  animation: editor-in 140ms ease-out;
}
@keyframes editor-in {
  from { opacity: 0; transform: translateY(-2px); }
}
.knob { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px; }
.knob-label { padding: 0 6px; font-size: 11px; color: var(--faint); }
.knob-switch { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.knob-switch .switch { margin-right: 2px; }

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--track);
  border-radius: 4px;
}
.seg-item {
  flex: 1 1 auto;
  min-width: 0;
  padding: 1px 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  color: var(--faint);
  border-radius: 2px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg-item:hover { color: var(--fg); }
.seg-item.on { color: var(--fg); background: var(--raised); box-shadow: var(--lift); }

.swatches { display: flex; flex-wrap: wrap; gap: 8px; padding: 3px 5px; }
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--card), 0 0 0 3px transparent;
  transition: box-shadow 120ms ease-out;
}
.swatch:hover { box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--faint); }
.swatch.on { box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--fg); }
.swatch:focus-visible { outline-offset: 4px; }

.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  height: 22px;
  padding: 0 6px;
  line-height: 22px;
  color: var(--faint);
  background: var(--track);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.chip:hover { color: var(--fg); }
.chip.on { color: var(--fg); background: var(--raised); box-shadow: var(--lift); }

.switch {
  position: relative;
  width: 28px;
  height: 16px;
  background: var(--track);
  border-radius: 8px;
  transition: background-color 140ms ease-out;
}
.switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: var(--raised);
  border-radius: 6px;
  box-shadow: var(--lift);
  transition: transform 140ms ease-out, background-color 140ms ease-out;
}
.switch.on { background: var(--fg); }
.switch.on::after { background: var(--bg); transform: translateX(12px); }

.field {
  height: 22px;
  padding: 0 6px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
}
.field::placeholder { color: var(--faint); }
.field:focus { border-color: var(--faint); }
.field::-webkit-outer-spin-button,
.field::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.chip-field { width: 48px; padding: 0 6px; border: 0; background: var(--track); }
.chip-field.on { background: var(--raised); box-shadow: var(--lift); }
.chip-field:focus { box-shadow: inset 0 0 0 1px var(--faint); }
.fields { display: flex; align-items: center; gap: 4px; }
/* A device's size, set apart from the list over it. */
.knob-list > .fields { margin-top: 5px; }
.fields .field-num { flex: 1; min-width: 0; }
.field-clock { width: 100%; }
.field-route { width: 100%; height: 44px; padding: 3px 6px; resize: vertical; }
.field-ua { width: 100%; height: 56px; padding: 3px 6px; resize: vertical; }
.unit { flex: none; font-size: 11px; color: var(--faint); }
.extra { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.note { padding: 0 6px; font-size: 10.5px; line-height: 1.4; color: var(--faint); }

.list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.items {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  /* Items clip their text, which would let the rows shrink to fit the box. */
  grid-auto-rows: max-content;
  max-height: 136px;
  overflow-y: auto;
  padding: 2px;
  background: var(--bg);
  border-radius: 4px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 4px;
  overflow: hidden;
  color: var(--faint);
  border-radius: 2px;
}
/* The check that marks the value that is on. */
.item::before, .current::after {
  content: "";
  flex: none;
  display: inline-block;
  width: 3px;
  height: 7px;
  margin: 0 4px 2px 3px;
  border: solid transparent;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.item:hover, .item.cursor { color: var(--fg); background: var(--card); }
.item.on { color: var(--fg); }
.item.on::before, .current::after { border-color: currentColor; }

.results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  white-space: nowrap;
  border-radius: 8px;
  cursor: pointer;
}
.entry.cursor { background: var(--card); }
.entry-knob { flex: none; color: var(--faint); }
.entry-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.entry-name { flex: none; }
.entry-now {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  color: var(--faint);
}
.group-label { padding: 8px 10px 2px; font-size: 10.5px; color: var(--faint); }
.group-label:first-child { padding-top: 2px; }

.foot {
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 4px;
  padding: 6px 6px 2px;
  border-top: 1px solid var(--line);
}
.badge { color: var(--faint); }
.badge.hot { color: var(--hot); }
/* The key hints, each a button for what its key does. Where they leave no
   room, the line wraps. */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--faint);
}
/* A key and its word. Only the key is a box. */
.hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  border-radius: 4px;
  transition: color 120ms ease-out;
}
.hint:hover { color: var(--fg); }
.hint:focus-visible { outline-offset: 2px; }
.hint:disabled { cursor: default; opacity: 0.5; }
.hint:disabled:hover { color: inherit; }
/* Opens the shortcuts, at the end of the last line. */
.keys-toggle { margin-left: auto; }
.keys-toggle[aria-pressed="true"] { color: var(--fg); }
/* The tooltip of an icon-only control, set over it by the panel. */
.tip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  box-sizing: border-box;
  padding: 3px 8px;
  white-space: nowrap;
  color: var(--fg);
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: var(--lift);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease-out;
}
.tip.on { opacity: 1; }
.tip.hot { color: var(--hot); }
.hint-key {
  box-sizing: border-box;
  min-width: 14px;
  padding: 0 3px;
  font: inherit;
  color: inherit;
  text-align: center;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 4px;
}

/* The shortcuts, in place of the rows: a line each, as tall as a row, with
   its key as a button that records a new one and an x that puts it back. The
   key sits 4 in from the line's edges, so 4 round. A key it cannot take
   shakes the key and turns it red for a moment; reduced motion keeps only the
   red. */
.keys { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding-left: 10px;
  border-radius: 8px;
}
.key-row:hover { background: var(--card); }
.key-word { flex: 1; min-width: 0; color: var(--faint); }
.key-set {
  flex: none;
  box-sizing: border-box;
  min-width: 26px;
  height: 18px;
  /* The line sits a little above the middle, so the text looks centered: a
     key's capitals, and while it records the lowercase by their x-height. */
  padding: 0 6px 1px;
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: 4px;
  transition: border-color 120ms ease-out, color 120ms ease-out, background-color 120ms ease-out;
}
.key-row .clear { margin: 2px 2px 2px -6px; }
.key-set:hover { border-color: var(--faint); }
.key-set.recording {
  padding-bottom: 3px;
  line-height: 13px;
  color: var(--faint);
  border-color: var(--faint);
}
.key-set.refused {
  color: var(--hot);
  background: color-mix(in srgb, var(--hot) 8%, transparent);
  border-color: var(--hot);
  animation: key-shake 320ms ease-out;
}
@keyframes key-shake {
  15% { transform: translateX(-4px); }
  35% { transform: translateX(4px); }
  55% { transform: translateX(-2.5px); }
  75% { transform: translateX(1.5px); }
  90% { transform: translateX(-0.5px); }
}
/* An x that is gone keeps its room, so the keys line up. */
.key-row .clear[hidden] { display: grid !important; visibility: hidden; }
`;
