import { ensureStyle, removeStyle } from "./style";

const NAME = "outlines";

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  ensureStyle(NAME).textContent =
    "body *:not([data-devknobs],[data-devknobs] *){outline:1px solid rgba(127,127,127,.5)!important}";
}

export function reset(): void {
  removeStyle(NAME);
}
