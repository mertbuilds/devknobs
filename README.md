# devknobs

a dev-only panel for flipping browser preferences from inside the page. one
script tag and the knobs are there. no css to add, no code to change, no
runtime dependencies.

## install

```
npm i -D devknobs
```

## usage

three ways in. all of them are meant for dev only, so gate them yourself.

script tag:

```html
<script src="//unpkg.com/devknobs/dist/index.global.js"></script>
```

the global build mounts itself on load and puts the api on `window.devknobs`.

import:

```js
import { mount } from "devknobs";

if (import.meta.env.DEV) mount();
```

react, one element:

```jsx
import { DevKnobs } from "devknobs/react";

{process.env.NODE_ENV === "development" && <DevKnobs />}
```

`DevKnobs` is a client component. it mounts the knobs on the first effect,
unmounts them on cleanup, and renders nothing.

a static import stays in the production bundle even behind that check, because
the bundler still has to keep the module. in next.js, gate the import itself:

```jsx
const DevKnobs =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("devknobs/react").then((m) => m.DevKnobs), {
        ssr: false,
      })
    : null;

// in the layout
{DevKnobs && <DevKnobs />}
```

api: `mount(options?)`, `unmount()`, `getState()`, `setState(patch)`,
`reset()`, `replay()`, `PRESETS`.

```js
setState({ scheme: "dark" });
setState({ geo: { preset: "tokyo" } });
setState({ locale: { lang: "ar" } });
```

`mount()` and `<DevKnobs />` take the same options:

| option | default | what it does |
| --- | --- | --- |
| `hotkey` | `d` | key that toggles the panel |
| `open` | the stored state | start the panel open or closed |
| `persist` | `true` | keep the knobs in `sessionStorage` |
| `state` | none | knobs to apply on top of the stored state |

state lives in `sessionStorage` under `devknobs`, so it survives reloads and
dies with the tab. pass `mount({ persist: false })` to keep it in memory.

drag the handle to move it up and down the edge of the window. hold shift while
dragging to move the panel and the handle together.

## knobs

| knob | values | how it is emulated |
| --- | --- | --- |
| color scheme | light, dark, system | rewrites every `prefers-color-scheme` media rule in the page's own stylesheets, patches `matchMedia` so js reads the same value, and sets `color-scheme` on `<html>` so `light-dark()` flips too. in the frame the browser does it natively, see below |
| reduced motion | reduce, system | rewrites `prefers-reduced-motion` media rules and patches `matchMedia` |
| animation speed | 1, 0.25, 0.1, pause | sets `playbackRate` (through `updatePlaybackRate`, so nothing jumps) on every animation `getAnimations()` returns, css animations and transitions included, in the document and every open shadow root. new ones are taken as they start: `animationstart` and `transitionrun` listeners, a patched `Element.prototype.animate`, and a light sweep every frame while the knob is off 1. scroll-driven animations keep following the scroll. when `window.gsap` exists, its global timeline's `timeScale` follows too. back to 1, every rate goes back to what it was |
| contrast | more, system | rewrites `prefers-contrast` media rules and patches `matchMedia` |
| locale | any bcp 47 tag, plus a direction | sets `lang` and `dir` on `<html>` and patches `navigator.language` / `navigator.languages`. direction defaults to rtl for ar, he, fa and ur. also writes the `PARAGLIDE_LOCALE` cookie and reloads when it changes, so paraglide (cookie strategy) server-rendered strings follow the knob |
| geolocation | a city preset, custom coordinates, system | patches `navigator.geolocation.getCurrentPosition` and `watchPosition` with a fixed position |
| time zone | comes with the geo preset | patches `Intl.DateTimeFormat` so calls without an explicit `timeZone` use the emulated one, and patches `Date.prototype.getTimezoneOffset` |
| root font size | px, system | sets `font-size` on `<html>`, so everything in rem scales |
| viewport width | px, full | renders the page in a same-origin iframe of that width, so media queries, fixed elements, `vw` units and container queries all see a real viewport. the other knobs follow the page into the frame. a width wider than the window is scaled down to fit, and the readout says by how much. back to full, the window goes wherever the frame navigated |
| frame | off, on | puts the page in the same frame at full width, for the native color scheme without picking a width |
| device pixel ratio | 1, 2, 3, system | sets `zoom` on the frame, which multiplies `devicePixelRatio` inside it while its css size stays put, so resolution queries and `srcset` follow. a wrapper scales the drawing back. brings the frame up |
| vision | protanopia, deuteranopia, tritanopia, achromatopsia, blur, none | an svg color matrix (machado et al. 2009, as chromium devtools uses) or a 2px blur, as a `filter` on the frame, so fixed elements inside keep their place and the panel stays readable. brings the frame up |
| outlines | on, off | injects one style rule that outlines every element |
| replay | action | cancels and replays every animation `getAnimations()` returns, in the document and every open shadow root, then gives the finished css animations it no longer returns (pseudo-elements too) one `animation: none` style pass so they run again. scroll-driven animations are left alone |

new stylesheets are picked up as they arrive, so knobs keep working through
hot reloads and lazily loaded css.

## the frame

width, frame, device pixel ratio and vision render the page in a same-origin
iframe, a real viewport, and lean on what browsers do natively for frames:

- color scheme: the frame element's `color-scheme` becomes the framed page's
  `prefers-color-scheme` (css color adjust, csswg #7493; chrome 129+, firefox
  105+). a probe frame checks for it once. where it works, devknobs sets it on
  the frame and leaves the page's css and `matchMedia` alone, so cross-origin
  stylesheets and shadow roots follow too. safari gets the rewrite.
- device pixel ratio: `zoom` on an iframe multiplies the ratio inside it
  (csswg #9644, chromium since 2024). a browser seen not to hand it down loses
  the zoom, and the knob does nothing there.
- fit: `transform: scale()`, never `zoom`, so the ratio inside stays the
  screen's and clicks land where they are drawn.

the frame is sandboxed without `allow-top-navigation`, so a frame-busting
script cannot reload the window into its frame forever. a click still can, so
`target="_top"` links work. chrome logs one warning that a frame with scripts
and same-origin access could lift its own sandbox.

the address bar and the tab title follow the frame, so a reload lands where the
frame was. a page that refuses to be framed (`x-frame-options`,
`frame-ancestors`) gets a notice with a button that closes the frame. the page
underneath is `inert` and `content-visibility: hidden` until the frame goes,
and its scroll position comes back after. meanwhile its modal dialogs open as
plain ones and its popovers stay hidden, as both would paint over the frame.

## limits

only same-origin stylesheets can be rewritten. a cross-origin `<link>` keeps
its real media behaviour, because the browser refuses to hand over its rules.
the same goes for css inside a shadow root that devknobs cannot reach.

`Date.prototype.toString` and `toLocaleString` are out of scope: they read the
real system zone, so they keep showing local time even while `Intl` and
`getTimezoneOffset` report the emulated one.

the speed knob reaches what the Web Animations API can see. an animation
that javascript drives frame by frame (a `requestAnimationFrame` loop, a
spring in Motion) keeps its own pace. Motion's global config has no time scale
to set, so only its WAAPI-backed animations slow down.

the frame loads the page a second time, so in-memory state (a half-filled form,
a client store) is not shared between the two, and the page under the frame
keeps running, though it skips rendering. navigations to another origin inside
the frame are not tracked, and get the refusal notice.

these cannot be faked from inside a page, so use the browser devtools for
them:

- viewport height, and device pixel ratio outside chromium (device toolbar)
- `forced-colors` and high contrast mode (rendering panel)
- print media (rendering panel, or print preview)
- pointer and hover type, touch emulation (device toolbar)
- network throttling and offline (network panel)

## license

MIT
