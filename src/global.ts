import { bezelsBeside } from "./engine/bezels";
import { getState, grab, mount, replay, reset, setState, unmount } from "./index";

const api = { mount, unmount, getState, setState, reset, replay, grab };

declare global {
  interface Window {
    devknobs: typeof api;
  }
}

window.devknobs = api;

// Read as the script runs, the only time the document knows which one it is.
const script = document.currentScript;
bezelsBeside(script instanceof HTMLScriptElement ? script.src : "");

mount();
