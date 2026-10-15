/**
 * The properties a child takes from its parent when it sets none of its own.
 * The browser does not say which those are, so they are listed: the longhands,
 * and the few shorthands made only of them, for where one cannot be expanded.
 */
const INHERITED = new Set(
  `accent-color border-collapse border-spacing caption-side caret-color caret-shape clip-rule color
color-interpolation color-interpolation-filters color-rendering color-scheme cursor direction
dominant-baseline dynamic-range-limit empty-cells fill fill-opacity fill-rule font font-family
font-feature-settings font-kerning font-language-override font-optical-sizing font-palette font-size
font-size-adjust font-stretch font-style font-synthesis font-synthesis-position
font-synthesis-small-caps font-synthesis-style font-synthesis-weight font-variant
font-variant-alternates font-variant-caps font-variant-east-asian font-variant-emoji
font-variant-ligatures font-variant-numeric font-variant-position font-variation-settings font-weight
font-width forced-color-adjust hanging-punctuation hyphenate-character hyphenate-limit-chars hyphens
image-orientation image-rendering interactivity interpolate-size letter-spacing line-break line-height
list-style list-style-image list-style-position list-style-type marker marker-end marker-mid
marker-start math-depth math-shift math-style orphans overflow-wrap paint-order pointer-events
print-color-adjust quotes ruby-align ruby-position scrollbar-color shape-rendering speak stroke
stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity
stroke-width tab-size text-align text-align-last text-anchor text-autospace text-box-edge
text-combine-upright text-decoration-skip-ink text-emphasis text-emphasis-color text-emphasis-position
text-emphasis-style text-indent text-justify text-orientation text-rendering text-shadow
text-size-adjust text-spacing-trim text-transform text-underline-offset text-underline-position
text-wrap text-wrap-mode text-wrap-style visibility white-space white-space-collapse widows word-break
word-spacing word-wrap writing-mode -moz-osx-font-smoothing -webkit-border-horizontal-spacing
-webkit-border-vertical-spacing -webkit-font-smoothing -webkit-line-break -webkit-locale
-webkit-print-color-adjust -webkit-rtl-ordering -webkit-tap-highlight-color -webkit-text-fill-color
-webkit-text-orientation -webkit-text-size-adjust -webkit-text-stroke -webkit-text-stroke-color
-webkit-text-stroke-width -webkit-user-modify -webkit-writing-mode`.split(/\s+/),
);

/**
 * Does a child take this property from its parent? A custom property does,
 * unless `@property` registered it with `inherits: false`.
 */
export function isInherited(property: string, registered: ReadonlyMap<string, boolean>): boolean {
  if (property.startsWith("--")) return registered.get(property) ?? true;
  return INHERITED.has(property);
}
