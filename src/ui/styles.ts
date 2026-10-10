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
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
/* With the handle hidden, a closed panel slides all the way off its edge,
   handle and all, and once there nothing of it paints or takes a pointer. The
   panel key brings it back, and an open panel shows its handle as ever. */
.wrap[data-handle="hidden"][data-open="false"] {
  visibility: hidden;
  transform: translateX(100%);
  transition: transform 150ms ease-out, translate var(--glide) ease-out,
    visibility 0s linear 150ms;
}
.wrap[data-handle="hidden"][data-open="false"][data-side="left"] { transform: translateX(-100%); }
.wrap[data-handle="hidden"][data-open="false"] .handle { pointer-events: none; }
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
   room, so the results never cover the rows. The settings take the place of
   all of it. */
.body, .home {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* The settings push in from the right and push the rows out to the left, the
   two moving together by the body's width and the 4px out to the border, so
   the view that leaves is clipped away whole by the time it is taken out.
   They pop back the same way, with the curve and the time of an iOS sheet. A
   view coming in starts from where it rests while it is away, and one turned
   round on its way goes back from where it is. The body eases between the
   heights of the two and clips what is past it, out to the panel's border
   across. The view that leaves is taken out of the
   flow and the panel holds it at the height it had, and the settings ride
   above the rows. Reduced motion swaps them at once, as the panel finds no
   time on them. */
.body[data-slide] {
  clip-path: inset(0 -4px);
  transition: height 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
.body[data-slide] > .pane {
  flex: none;
  transition: transform 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
.body[data-slide] > .keys { position: relative; z-index: 1; background: var(--bg); }
.body[data-slide] > .pane.leaving { position: absolute; top: 0; left: 0; width: 100%; }
.wrap[data-mode="keys"] .body[data-slide] > .home { transform: translateX(calc(-100% - 4px)); }
.wrap:not([data-mode="keys"]) .body[data-slide] > .keys { transform: translateX(calc(100% + 4px)); }
@starting-style {
  .wrap[data-mode="keys"] .body[data-slide] > .keys { transform: translateX(calc(100% + 4px)); }
  .wrap:not([data-mode="keys"]) .body[data-slide] > .home { transform: translateX(calc(-100% - 4px)); }
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
.wrap:is([data-mode="results"], [data-mode="browse"]) .rows {
  flex-shrink: 0;
  max-height: calc(min(672px, 100vh - 16px) * 0.4);
  max-height: calc(min(672px, 100dvh - 16px) * 0.4);
}
/* The rows view stays as it was while the settings show, so it leaves and
   comes back as it is. */
.wrap:not([data-mode="results"], [data-mode="browse"]) .results,
.wrap:not([data-mode="results"], [data-mode="browse"]) .head,
.wrap:is([data-mode="results"], [data-mode="browse"]) .add,
.wrap:is([data-mode="results"], [data-mode="browse"]) .home > .empty,
.wrap[data-mode="keys"] .home:not(.leaving),
.wrap:not([data-mode="keys"]) .keys:not(.leaving) { display: none; }
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
/* A device's size and fold, set apart from the list over it. */
.knob-list > .extra-device { margin-top: 5px; }
.fields .field-num { flex: 1; min-width: 0; }
.field-clock { width: 100%; }
.field-route { width: 100%; height: 44px; padding: 3px 6px; resize: vertical; }
.field-ua { width: 100%; height: 56px; padding: 3px 6px; resize: vertical; }
.unit { flex: none; font-size: 11px; color: var(--faint); }
/* The fold slider, experimental: a thumb on a track as far along as the hinge
   is open, a tick under where it lands a third of the way. The thumb eases to
   a stop once let go, and follows the pointer while held, and the hinge
   while the knobs fold it. */
.fold-slider {
  position: relative;
  height: 22px;
  background: var(--track);
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}
.fold-slider:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }
.fold-tick {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: calc(16px + (100% - 32px) * 0.333);
  width: 1px;
  background: var(--faint);
  opacity: 0.5;
}
.fold-thumb {
  position: absolute;
  top: 2px;
  left: calc(2px + (100% - 32px) * var(--at, 0));
  width: 28px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg);
  background: var(--raised);
  border-radius: 2px;
  box-shadow: var(--lift);
  transition: left 200ms ease-out;
}
.fold-slider.held { cursor: grabbing; }
.fold-slider.held .fold-thumb,
.fold-slider.following .fold-thumb { transition: none; }
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
/* The check that marks the value that is on, faint as a result's is. */
.item::before {
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
.item.on::before { border-color: var(--faint); }

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
/* Past the entry's padding to the right edge the rows' x and the settings'
   controls end on. */
.entry .entry-check { margin: 0 -8px 0 auto; }
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
/* Says fresh mode is on, as quiet as the key hints under it. */
.fresh-note { font-size: 10px; line-height: 1.4; color: var(--faint); }
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
/* Opens the settings, at the end of the last line. */
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

/* The settings, in place of the rows: each a row as the knob rows are, its
   grip column empty, and the way back on top of them, its chevron where a
   row's icon is. A row has no x after it, so where a row's x ends, the
   handle's ends with a switch, and a shortcut's with its key as a button that
   records a new one, an x before it that puts it back. A key it cannot take
   shakes the key and turns it red for a moment; reduced motion keeps only the
   red. The group label sits over the icons, as it does over the results'. */
.keys { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.keys .group-label { padding-left: 22px; }
.keys .main { padding-right: 2px; }
.row-control { flex: none; align-self: center; margin-left: auto; }
.keys .clear { align-self: center; margin: -2px 0 -2px auto; }
.keys .clear:not([hidden]) + .row-control { margin-left: 0; }
/* The panel's icons face the side the panel is on. */
.wrap[data-side="left"] .glyph.sided { transform: scaleX(-1); }
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

/* The side pane, a feature's view beside the panel on the page's side of it:
   the panel's ground, hairline and radii, grown sideways. It is as tall as
   the panel at its tallest whatever the panel holds, so it stays still while
   rows open and close. The panel says where it goes as --pane-top, --pane-right,
   --pane-width and --pane-height. It slides out of the panel's edge by
   transform alone, clipped at that edge, in the glide's time, and goes with
   the panel's own slide when the panel closes. data-pane on the wrapper says
   open while it is out and leaving until it has slid away, so it shows and
   the corners where the two meet stay square for as long as it does. Its
   panel side sits a pixel over the panel's border, as the handle does, so
   the two share one line there. */
.side-clip {
  position: absolute;
  top: var(--pane-top, 0px);
  right: var(--pane-right, 239px);
  width: var(--pane-width, 340px);
  height: var(--pane-height, 0px);
  overflow: clip;
  visibility: hidden;
}
.wrap[data-side="left"] .side-clip { right: auto; left: var(--pane-right, 239px); }
.wrap:is([data-pane="open"], [data-pane="leaving"]) .side-clip { visibility: visible; }
.side {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 13px 0 0 13px;
  transform: translateX(100%);
  transition: transform var(--glide) ease-out;
}
/* The handle covers one of the pane's far corners where it sits flush with
   it, which data-pane-tab names, so that one is square. The left side's own
   radii come after the right side's corners, as the panel's do. */
.wrap[data-pane-tab="top"] .side { border-top-left-radius: 0; }
.wrap[data-pane-tab="bottom"] .side { border-bottom-left-radius: 0; }
.wrap[data-side="left"] .side { border-radius: 0 13px 13px 0; transform: translateX(-100%); }
.wrap[data-side="left"][data-pane-tab="top"] .side { border-top-right-radius: 0; }
.wrap[data-side="left"][data-pane-tab="bottom"] .side { border-bottom-right-radius: 0; }
.wrap[data-open="false"] .side { transition-duration: 150ms; }
/* Only a pane that is out catches anything, as with the panel. */
.wrap[data-pane="open"] .side { pointer-events: auto; transform: translateX(0); }
/* The pane spans the panel's whole side, so both of the panel's corners
   there are square while it shows. */
.wrap:is([data-pane="open"], [data-pane="leaving"]):not([data-side="left"]) .panel {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.wrap:is([data-pane="open"], [data-pane="leaving"])[data-side="left"] .panel {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
/* The handle rides out on the pane's far edge, --pane-reach from its place on
   the panel, and back with it. For that while its move is all that eases. */
.wrap:is([data-pane="open"], [data-pane="leaving"]) .handle {
  transition: transform var(--glide) ease-out;
}
.wrap[data-open="false"][data-pane="leaving"] .handle { transition-duration: 150ms; }
.wrap[data-pane="open"] .handle { transform: translateX(calc(-1 * var(--pane-reach, 0px))); }
.wrap[data-pane="open"][data-side="left"] .handle { transform: translateX(var(--pane-reach, 0px)); }
/* The head stays while the body scrolls: the view's title, as quiet as a
   row's label, then its actions and the x, each as a row's x is. They sit 7
   in from the pane's outer edge, so 6 round. */
.side-head {
  flex: none;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  padding: 0 0 4px 10px;
  border-bottom: 1px solid var(--line);
}
.side-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--faint);
}
.side-actions { flex: none; display: flex; }
.side-action {
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
.side-action:hover { color: var(--fg); background: var(--card); }
.side-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* The requests view, in the side pane. A bar on one line stays over the list
   while it scrolls: a filter, the chips that pick whose requests show, and
   how many do. Under it a row a request, as tall as the panel's rows and 8
   round as they are, the pane being 13 with 1 of border and 4 of padding.
   Only the name gives way: the method, the status and the time each keep
   their width, so the columns line up down the list, and nothing wraps. */
.req-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 4px;
  background: var(--bg);
}
.req-filter { flex: 1; min-width: 0; }
.req-chips { flex: none; display: flex; gap: 2px; }
.req-count {
  flex: none;
  min-width: 20px;
  padding: 0 6px 0 2px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--faint);
}
.req-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.req-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background-color 120ms ease-out;
}
.req-row:hover { background: var(--card); }
.req-method { flex: none; width: 36px; overflow: hidden; font-size: 10.5px; color: var(--faint); }
.req-name { flex: 1; min-width: 0; display: flex; font-family: var(--mono); font-size: 11px; }
.req-path { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.req-query { flex: none; color: var(--faint); }
.req-status { flex: none; width: 44px; font-variant-numeric: tabular-nums; text-align: right; }
.req-status.hot { color: var(--hot); }
.req-time {
  flex: none;
  width: 40px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--faint);
}
/* What the page loads on its own, of which the browser tells less, is a step quieter. */
.req-row.light { color: var(--faint); }
/* The device frame's rows carry a line on their edge, only while the page's own are listed too. */
.req-list.mixed .req-row.framed { box-shadow: inset 2px 0 0 var(--line); }

/* One request in full: the way back, then its sections, each a row that
   folds as the panel's rows do, with no grip column to keep. What a section
   holds sits 4 in from the row's edges, so 4 round. Addresses, headers and
   bodies are in mono, wrap anywhere and can be selected. */
.req-detail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.req-detail .main { width: 100%; padding-left: 8px; }
.req-detail > .note { padding: 4px 8px; }
.req-inner {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 2px 4px 6px;
}
.req-kv {
  display: grid;
  grid-template-columns: fit-content(45%) minmax(0, 1fr);
  gap: 2px 8px;
  padding: 0 4px;
}
.req-k { overflow-wrap: anywhere; color: var(--faint); }
.req-headers .req-k { font-family: var(--mono); font-size: 11px; }
.req-v, .req-pre {
  font-family: var(--mono);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
.req-pre {
  max-height: 240px;
  margin: 0;
  padding: 4px 6px;
  overflow: auto;
  white-space: pre-wrap;
  background: var(--bg);
  border-radius: 4px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
`;
