# devknobs

a dev-only panel for flipping browser preferences from inside the page. one
script tag and the knobs are there. no css to add, no code to change, no
runtime dependencies.

## install

```
npm i -D devknobs
```

## usage

script tag, gated to dev:

```html
<script src="//unpkg.com/devknobs/dist/index.global.js"></script>
```

the global build mounts itself on load and puts the api on `window.devknobs`.

or import it:

```js
import { mount } from "devknobs";

if (import.meta.env.DEV) mount();
```

api: `mount(options?)`, `unmount()`, `getState()`, `setState(patch)`,
`reset()`, `replay()`, `PRESETS`.

```js
setState({ scheme: "dark" });
setState({ geo: { preset: "tokyo" } });
setState({ locale: { lang: "ar" } });
```

state lives in `sessionStorage` under `devknobs`, so it survives reloads and
dies with the tab. pass `mount({ persist: false })` to keep it in memory.

## knobs

| knob | values | how it is emulated |
| --- | --- | --- |
| color scheme | light, dark, system | rewrites every `prefers-color-scheme` media rule in the page's own stylesheets, patches `matchMedia` so js reads the same value, and sets `color-scheme` on `<html>` so `light-dark()` flips too |
| reduced motion | reduce, system | rewrites `prefers-reduced-motion` media rules and patches `matchMedia` |
| contrast | more, system | rewrites `prefers-contrast` media rules and patches `matchMedia` |
| locale | any bcp 47 tag, plus a direction | sets `lang` and `dir` on `<html>` and patches `navigator.language` / `navigator.languages`. direction defaults to rtl for ar, he, fa and ur |
| geolocation | a city preset, custom coordinates, system | patches `navigator.geolocation.getCurrentPosition` and `watchPosition` with a fixed position |
| time zone | comes with the geo preset | patches `Intl.DateTimeFormat` so calls without an explicit `timeZone` use the emulated one, and patches `Date.prototype.getTimezoneOffset` |
| root font size | px, system | sets `font-size` on `<html>`, so everything in rem scales |
| body width | px, full | injects one style rule that caps `body` and centers it |
| outlines | on, off | injects one style rule that outlines every element |
| replay | action | cancels and replays every running css animation, then does the classic inline `animation: none` reset so the finished ones run again |

new stylesheets are picked up as they arrive, so knobs keep working through
hot reloads and lazily loaded css.

## limits

only same-origin stylesheets can be rewritten. a cross-origin `<link>` keeps
its real media behaviour, because the browser refuses to hand over its rules.
the same goes for css inside a shadow root that devknobs cannot reach.

`Date.prototype.toString` and `toLocaleString` are out of scope: they read the
real system zone, so they keep showing local time even while `Intl` and
`getTimezoneOffset` report the emulated one.

these cannot be faked from inside a page, so use the browser devtools for
them:

- real viewport size and device pixel ratio (device toolbar)
- `forced-colors` and high contrast mode (rendering panel)
- print media (rendering panel, or print preview)
- pointer and hover type, touch emulation (device toolbar)
- network throttling and offline (network panel)

## license

MIT
