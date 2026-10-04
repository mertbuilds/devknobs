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
 * the search, rows and results are 8; an open row pads its editor by 4, so
 * controls are 4, and what sits 2 inside a control is 2.
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
  display: flex;
  align-items: flex-start;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  transform: translateX(239px);
  transition: transform 150ms ease-out;
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
button:focus-visible, a:focus-visible { outline: 1px solid var(--faint); outline-offset: -1px; }

.handle {
  flex: none;
  box-sizing: border-box;
  /* Sits a pixel over the panel and above it, so the handle's own background
     hides the panel's left border and the two read as one outline. */
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
  border-right: 0;
  border-radius: 8px 0 0 8px;
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

.panel {
  flex: none;
  box-sizing: border-box;
  width: 240px;
  display: flex;
  flex-direction: column;
  /* All the height there is, less the gap the panel keeps top and bottom, and
     no taller than a list is worth. What is past it scrolls inside. */
  max-height: min(560px, calc(100vh - 16px));
  max-height: min(560px, calc(100dvh - 16px));
  padding: 4px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0;
  border-radius: 13px 0 0 13px;
  /* Closed, the wrapper slides out only as far as the handle's width, and the
     handle overlaps the panel by a pixel, so the panel's left border would
     stay on the window's edge as a line the panel's height. It hides once
     the slide is over. */
  visibility: hidden;
  transition: visibility 0s linear 150ms;
}
/* Only a panel that is out catches anything. The attribute flips the moment
   the close starts, so the slide back leaves nothing hit-testable behind. */
.wrap[data-open="true"] .panel {
  pointer-events: auto;
  visibility: visible;
  transition-delay: 0s;
}
/* The handle covers one of these corners while the panel is out, so square
   that one off. A panel the handle meets in the middle keeps both radii. */
.wrap[data-open="true"][data-tab="top"] .panel { border-top-left-radius: 0; }
.wrap[data-open="true"][data-tab="bottom"] .panel { border-bottom-left-radius: 0; }

.head {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  background: var(--card);
  border-radius: 8px;
  cursor: text;
}
.head:focus-within { box-shadow: inset 0 0 0 1px var(--line); }
.name { flex: none; font-size: 11px; color: var(--faint); }
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
  font-size: 14px;
  line-height: 1;
  color: var(--faint);
  border-radius: 4px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.search-close:hover { color: var(--fg); background: var(--track); }
/* Only while the search is open: it has the focus, or a query. */
.wrap[data-mode="rows"] .search-close { display: none; }

.body {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  margin-top: 4px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.wrap[data-mode="rows"] .results,
.wrap:not([data-mode="rows"]) .rows,
.wrap:not([data-mode="rows"]) .body > .empty { display: none; }
.empty { padding: 4px 10px; color: var(--faint); }

.rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; }
.row { border-radius: 8px; transition: background-color 120ms ease-out; }
.row:hover, .row.open { background: var(--card); }
.line { display: flex; align-items: center; }
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px 4px 10px;
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
  font-size: 14px;
  line-height: 1;
  color: var(--faint);
  border-radius: 6px;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.clear:hover { color: var(--fg); background: var(--track); }

.editor {
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
/* A row of one knob already says its name, unless the knob is a bare switch. */
.knob:only-child:not(.knob-switch) > .knob-label { display: none; }
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
  gap: 4px;
  margin-top: 4px;
  padding: 6px 6px 2px;
  border-top: 1px solid var(--line);
}
.act { color: var(--faint); transition: color 120ms ease-out; }
.act + .act { margin-left: 12px; }
.act:hover { color: var(--fg); }
.act:disabled { cursor: default; opacity: 0.5; }
.act:disabled:hover { color: var(--faint); }
.badge { color: var(--faint); }
.badge.hot { color: var(--hot); }
/* One line of key hints with the link at its right end. Where a long key
   leaves no room, the line wraps and the link keeps to the right. */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--faint);
}
/* A key and its word. Only the key is a box. */
.hint { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
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
.foot-link { margin-left: auto; color: inherit; text-decoration: none; }
.foot-link:hover { text-decoration: underline; text-underline-offset: 3px; }
`;
