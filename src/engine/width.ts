import type { WidthValue } from "../types";
import { ensureStyle, removeStyle } from "./style";

const NAME = "width";

export function apply(value: WidthValue): void {
  if (typeof value !== "number" || !(value > 0)) {
    reset();
    return;
  }
  ensureStyle(NAME).textContent =
    `body{max-width:${value}px;margin-inline:auto;box-sizing:border-box;outline:1px dashed rgba(127,127,127,.6)}`;
}

export function reset(): void {
  removeStyle(NAME);
}
