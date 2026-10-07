import { BARS_CSS } from "./browserdraw";
import { STRIP, STRIP_TOP } from "./fit";
import { MAT_CSS } from "./mat";
import { MOCK_CSS } from "./mockdraw";

/** The chevron of the zoom control, as its own arrow is styled away. */
const CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='4'%3E%3Cpath d='M.5.5 3 3.5 5.5.5' fill='none' stroke='%23fff' stroke-opacity='.7'/%3E%3C/svg%3E";

/**
 * The letterbox around the frame. It lives in a shadow root like the panel,
 * so page css cannot reach it. A dark cutting mat reads as chrome in light and
 * dark, under a white page and a near black mock alike. Its grid and rulers
 * stay put from the top left as the frame is fitted or zoomed.
 */
export const VIEWPORT_CSS = `
.viewport {
  all: initial;
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  direction: ltr;
}
/* The mat's paint, which a device change cuts its opening in, and the veil
   under it in the page's color, which hides the page as the frame comes. A
   splash over the paint shows a new color as it spreads. */
.back, .veil, .splash {
  position: absolute;
  inset: 0;
}
.back, .splash { background: var(--mat); }
.splash { pointer-events: none; }
/* The screen of a page that is loading, blank in the page's color. */
.screenblank {
  position: absolute;
  inset: 0;
}
.screenblank[hidden] { display: none; }
.size {
  position: relative;
  /* Over the fold, which turns out of the room under it. */
  z-index: 1;
  flex: none;
  box-sizing: border-box;
  /* A set height, so the room the frame is fitted to never waits on the text. */
  height: ${STRIP}px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: ${STRIP_TOP}px 8px 0;
  font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.8);
  user-select: none;
  -webkit-user-select: none;
}
.size[hidden] { display: none; }
.zoom {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  height: 18px;
  margin: 0;
  padding: 0 16px 0 6px;
  font: inherit;
  color: inherit;
  color-scheme: dark;
  background: url("${CHEVRON}") no-repeat right 5px center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
}
.zoom:focus { outline: none; }
.zoom:hover, .zoom:focus-visible { color: #fff; border-color: rgba(255, 255, 255, 0.7); }
.stage {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  overflow: auto;
}
/* As big as the frame is drawn, margins and all, so a bigger one scrolls both
   ways. Auto margins center a smaller one and drop to nothing on a bigger
   one, so every edge of it scrolls into view. */
.drawing {
  flex: none;
  position: relative;
  margin: auto;
}
/* Scales the frame to fit, or by the zoom. A transform keeps the device pixel
   ratio inside, where zoom would change it, and hit testing follows it into
   the frame, so clicks land where they are drawn. */
.screen {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.glass { position: relative; }
/* A foldable folding: a copy of the half that turns, over the device and
   under the readout, takes no pointer. */
.fold {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.fold > div {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.fold .face, .fold .face > div {
  position: absolute;
  top: 0;
  left: 0;
}
/* Where a phone's browser leaves the page in its screen. */
.page.placed { position: absolute; }
iframe {
  display: block;
  border: 0;
  /* The canvas color of the frame's own scheme, which is what shows through a
     page that leaves its background to the browser. */
  background: Canvas;
}
.blocked {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font: 12px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: rgba(255, 255, 255, 0.85);
  background: var(--mat);
}
.blocked[hidden] { display: none; }
.blocked button {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 2px 8px;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  cursor: pointer;
}
.blocked button:hover { color: #fff; border-color: #fff; }
@media (color-gamut: p3) {
  .back, .splash, .blocked { background: var(--mat-p3); }
}
${MAT_CSS}
${MOCK_CSS}
${BARS_CSS}`;
