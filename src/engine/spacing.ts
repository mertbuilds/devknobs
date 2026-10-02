import { ensureStyle, removeStyle } from "./style";

const NAME = "spacing";

const NOT_OURS = ":not([data-devknobs],[data-devknobs] *)";

/** WCAG 1.4.12 text spacing, at the values its test bookmarklet uses. */
const CSS =
  `*${NOT_OURS}{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}` +
  `p${NOT_OURS}{margin-bottom:2em!important}`;

export function apply(value: boolean): void {
  if (!value) {
    reset();
    return;
  }
  ensureStyle(NAME).textContent = CSS;
}

export function reset(): void {
  removeStyle(NAME);
}
