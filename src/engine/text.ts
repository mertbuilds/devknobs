import type { TextValue } from "../types";

let captured = false;
let original = "";

export function apply(value: TextValue): void {
  const root = document.documentElement;
  if (!captured) {
    original = root.style.fontSize;
    captured = true;
  }
  if (typeof value !== "number" || !(value > 0)) {
    reset();
    return;
  }
  root.style.fontSize = `${value}px`;
}

export function reset(): void {
  if (!captured) return;
  document.documentElement.style.fontSize = original;
  captured = false;
}
