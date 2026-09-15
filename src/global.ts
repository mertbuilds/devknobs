import { getState, mount, replay, reset, setState, unmount } from "./index";

const api = { mount, unmount, getState, setState, reset, replay };

declare global {
  interface Window {
    devknobs: typeof api;
  }
}

window.devknobs = api;

mount();
