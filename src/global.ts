import { getState, grab, mount, replay, reset, setState, unmount } from "./index";

const api = { mount, unmount, getState, setState, reset, replay, grab };

declare global {
  interface Window {
    devknobs: typeof api;
  }
}

window.devknobs = api;

mount();
