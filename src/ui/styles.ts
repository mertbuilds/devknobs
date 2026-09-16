/**
 * The panel's whole stylesheet. It lives inside the shadow root, so page css
 * cannot reach it and none of it reaches the page. `all: initial` on the
 * wrapper stops inherited page styles too, and `direction` is set by hand
 * because `all` leaves it alone and the locale knob flips it on `<html>`.
 */
export const CSS = `
.wrap {
  all: initial;
  direction: ltr;
  color-scheme: light dark;
  --bg: #fbfbf9;
  --fg: #1b1b19;
  --faint: #73736d;
  --line: #e6e6e0;
  display: flex;
  align-items: flex-start;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg);
  transform: translateX(219px);
  transition: transform 150ms ease-out;
}
.wrap[data-open="true"] { transform: translateX(0); }
.wrap[data-scheme="dark"] {
  --bg: #151513;
  --fg: #e9e9e3;
  --faint: #8c8c85;
  --line: #2b2b28;
}
.wrap[data-motion="reduce"] { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .wrap { transition: none; }
}

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
  margin: 0;
  margin-right: -1px;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
  letter-spacing: 0.06em;
  writing-mode: vertical-rl;
  color: var(--faint);
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0;
  border-radius: 6px 0 0 6px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.handle:hover { color: var(--fg); }
.handle:focus { outline: none; }
.handle:focus-visible { outline: 1px solid var(--faint); outline-offset: 2px; }
.wrap[data-drag="true"] .handle { cursor: grabbing; }

.panel {
  flex: none;
  box-sizing: border-box;
  width: 220px;
  /* All the height there is, less the gap the panel keeps top and bottom. */
  max-height: calc(100vh - 16px);
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-right: 0;
  border-radius: 6px 0 0 6px;
}
/* The handle covers this corner while the panel is out, so square it off. A
   shifted panel starts somewhere else, so there it keeps both left radii. */
.wrap[data-open="true"]:not([data-shifted="true"]) .panel { border-top-left-radius: 0; }

.group + .group { margin-top: 10px; }
.label { color: var(--faint); }
/* A second label inside a group, e.g. direction under locale. */
.row + .label { margin-top: 4px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; }

.btn {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 2px 0;
  font: inherit;
  color: var(--faint);
  background: none;
  border: 0;
  cursor: pointer;
  /* "san francisco" is one button, so it never breaks across two lines. */
  white-space: nowrap;
}
.btn:hover { color: var(--fg); }
.btn.on { color: var(--fg); text-decoration: underline; text-underline-offset: 4px; }
.btn:focus { outline: none; }
.btn:focus-visible { outline: 1px solid var(--faint); outline-offset: 2px; }

.fields { display: flex; flex-wrap: wrap; gap: 10px; }
.field {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  margin: 0;
  padding: 2px 0;
  font: inherit;
  color: var(--fg);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
}
.field::placeholder { color: var(--faint); }
.field:focus { outline: none; border-bottom-color: var(--faint); }
.field::-webkit-outer-spin-button,
.field::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.field-num { width: 70px; }
.field-tz { width: 100%; }

.note { margin-top: 2px; color: var(--faint); font-size: 10px; line-height: 1.4; }
.foot { margin-top: 12px; color: var(--faint); font-size: 10px; line-height: 1.4; }
.foot-link { color: inherit; text-decoration: none; }
.foot-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.foot-link:focus { outline: none; }
.foot-link:focus-visible { outline: 1px solid var(--faint); outline-offset: 2px; }
`;
