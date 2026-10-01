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
setState({ geo: { error: "denied" } });
setState({ timeZone: "Asia/Kathmandu" });
setState({ network: { online: "offline" } });
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

## early script

optional. a page that reads a media query while it boots, before devknobs
mounts (a theme script, a module that checks `prefers-reduced-motion` once),
only sees the knob if the patch is already in place. put the early script
first in `<head>`:

```html
<script src="//unpkg.com/devknobs/dist/early.global.js"></script>
```

it is also `devknobs/early` in the package. it applies the stored scheme,
motion, contrast and transparency on the spot, with no panel: the `matchMedia` and
`matches` patches, `color-scheme` on `<html>`, and the stylesheet rewrite as
sheets arrive. the full script, however it is loaded, takes those patches
over when it mounts instead of patching on top, and lists made in between
still get their change events. it covers the media knobs only, and since it
reads the stored state, it follows the knobs from the next load on. inside a
frame that gets the scheme natively, it leaves the scheme to the browser, as
the full script does.

## knobs

| knob | values | how it is emulated |
| --- | --- | --- |
| color scheme | light, dark, system | rewrites every `prefers-color-scheme` media rule in the page's own stylesheets, patches `matchMedia` and `MediaQueryList.prototype.matches` so js reads the same value, and sets `color-scheme` on `<html>` so `light-dark()` flips too. in the frame the browser does it natively, see below |
| reduced motion | reduce, system | rewrites `prefers-reduced-motion` media rules and patches `matchMedia` the same way |
| animation speed | 1, 0.25, 0.1, pause | sets `playbackRate` (through `updatePlaybackRate`, so nothing jumps) on every animation `getAnimations()` returns, css animations and transitions included, in the document and every open shadow root. new ones are taken as they start: `animationstart` and `transitionrun` listeners, a patched `Element.prototype.animate`, and a light sweep every frame while the knob is off 1. scroll-driven animations keep following the scroll. when `window.gsap` exists, its global timeline's `timeScale` follows too. back to 1, every rate goes back to what it was |
| contrast | more, system | rewrites `prefers-contrast` media rules and patches `matchMedia` the same way |
| reduced transparency | reduce, system | rewrites `prefers-reduced-transparency` media rules and patches `matchMedia` the same way. a browser that does not know the feature drops those rules while it parses them, so there only `matchMedia` follows the knob |
| locale | any bcp 47 tag, plus a direction | sets `lang` and `dir` on `<html>` and puts them back if the page writes them over, patches `navigator.language` / `navigator.languages`, and makes the tag the default locale of every `Intl` service, the `toLocaleString` family and `localeCompare` (a call that names its own locale keeps it). direction comes from `Intl.Locale` text info, with ar, he, fa and ur as the fallback. also writes the tag into the stores i18n libraries read and reloads when it changes: the paraglide cookie always, paraglide and i18next local storage, the i18next session key and cookie when the page has them, and `NEXT_LOCALE` on next.js pages. back to system, each store gets its old value, unless the page changed it since |
| pseudo | on, off | rewrites the page's text and its `placeholder`, `title`, `aria-label` and `alt` attributes to accented, padded, bracketed strings (`[Ŝéţţîñĝš ···]`), once the page is loaded and idle so hydration never sees it. new and changed text follows. skips scripts, styles, textareas, contenteditable and options without a value, whose text is what their form sends. text the page reads back and writes again stays one layer deep. off puts the originals back, in nodes the page detached since too |
| geolocation | a city preset, custom coordinates, a route, system | patches `navigator.geolocation`. answers come a task later, `maximumAge` can hand back the last position and `timeout: 0` without one fails like a real device. active watches hear every knob move, and `clearWatch` stops them. a route takes `lat,lng` per line or a pasted gpx file and plays it on a loop at a set speed, with `heading` and `speed` in the coordinates and a new position for watches every second |
| geo error | none, denied, unavailable, timeout | calls the error callback with an error that reads like `GeolocationPositionError` (`code`, `message`, the code constants). timeout waits for `options.timeout`, and never fires without one, like a fix that never comes. works with geo on system too. `navigator.permissions.query({ name: "geolocation" })` reports granted, or denied for denied, and fires `change` when the knob moves |
| time zone | follow geo, system, an iana zone | follows the geo preset's zone unless set. replaces the page's `Date`: local getters and setters, `getTimezoneOffset`, `new Date(y, m, d, ...)`, `Date.parse` and `new Date(string)` for strings with no zone of their own, `toString`, `toDateString`, `toTimeString` and `toLocale*String` all use the emulated zone, with gaps and overlaps resolved the way browsers do. utc methods, `toISOString` and `toJSON` are untouched, and `instanceof Date` holds for dates made before. also patches `Intl.DateTimeFormat` (so `resolvedOptions().timeZone` reports the zone) and `Temporal.Now` where the browser has it. with the locale knob set too, a formatter or `toLocale*String` call that names neither gets both the knob's locale and its zone |
| online | offline, system | mimicry only: `navigator.onLine` reads false and `online` / `offline` fire on `window`. requests still succeed |
| connection, save data | slow-2g, 2g, 3g, 4g / on, off, system | mimicry only, and chromium only: `navigator.connection` reports the effective type with a matching `rtt` and `downlink`, and `saveData`, and fires `change`. nothing is throttled |
| text size | px, system | emulates the browser's default font size setting. a root `font-size` in %, em, rem or a keyword, or none at all, is taken against the knob's size (62.5% at 20 gives 12.5px), and a px root size is left alone, as the real setting does. em and rem in media queries and `matchMedia` move with it |
| text spacing | on, off | applies the wcag 1.4.12 text spacing values: line height 1.5, letter spacing 0.12em, word spacing 0.16em, 2em after paragraphs |
| viewport width | px, full | renders the page in a same-origin iframe of that width, so media queries, fixed elements, `vw` units and container queries all see a real viewport. the other knobs follow the page into the frame. a width wider than the window is scaled down to fit, and the readout says by how much. back to full, the window goes wherever the frame navigated |
| frame | off, on | puts the page in the same frame at full width, for the native color scheme without picking a width |
| device pixel ratio | 1, 2, 3, system | sets `zoom` on the frame, which multiplies `devicePixelRatio` inside it while its css size stays put, so resolution queries and `srcset` follow. a wrapper scales the drawing back. brings the frame up |
| vision | protanopia, deuteranopia, tritanopia, achromatopsia, blur, none | an svg color matrix (machado et al. 2009, as chromium devtools uses) or a 2px blur, as a `filter` on the frame, so fixed elements inside keep their place and the panel stays readable. brings the frame up |
| overflow | on, off | finds what makes the page scroll sideways: every box that sticks out of the viewport on the right or the left with no box on the way up that clips or scrolls it, counting only the box that starts the overflow, not the children that fill it. each one gets a red mark drawn in a devknobs layer over the page (its own styles are never touched), the console names them once, and the panel shows the count next to width. it looks again on resize, scroll and page changes. with the frame up it runs inside the frame and reports the count up |
| outlines | on, off | injects one style rule that outlines every element |
| replay | action | cancels and replays every animation `getAnimations()` returns, in the document and every open shadow root, then gives the finished css animations it no longer returns (pseudo-elements too) one `animation: none` style pass so they run again. scroll-driven animations are left alone |

new stylesheets are picked up as they arrive, so knobs keep working through
hot reloads and lazily loaded css.

a list from `matchMedia` gets a real `change` event, sent with its own
`dispatchEvent`, whenever a knob moves its verdict, so `onchange`,
`addListener` and the `once` and `signal` options all work. while a feature is
emulated, the browser's own change events for it are held back, since they
carry the real verdict.

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

a `MediaQueryList` made before devknobs mounted reads the emulated `matches`,
because the getter is patched on the prototype, but it gets no change event:
there is no way to find it. reload once the knob is set, so the page makes its
lists after the mount, or load the early script first.

the time zone knob lives in the page, so workers, service workers and server
rendering keep the host zone, and a server rendered date can mismatch on
hydration. code that kept a reference to `Date` from before devknobs loaded
builds dates from local fields in the host zone (reading them is still
emulated), and an `Intl.DateTimeFormat` made before then keeps the host zone.
`Date.parse` reads a string as local time unless it has a `Z`, an offset or a
zone name such as `GMT` or `EST`. an old date in a zone that has since dropped
daylight time can show a different zone name in `toString`.

the speed knob reaches what the Web Animations API can see. an animation
that javascript drives frame by frame (a `requestAnimationFrame` loop, a
spring in Motion) keeps its own pace. Motion's global config has no time scale
to set, so only its WAAPI-backed animations slow down.

the text size knob reads the root `font-size` from same-origin stylesheets; one
set in a cross-origin sheet is taken as relative. a `matchMedia` list made from
an em or rem query keeps the size it was made at when the knob changes later.

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
- network throttling and a real offline (network panel)
- the time zone of workers and of the page before devknobs loads (sensors panel, or a `TZ` environment variable when the browser starts)

## license

MIT
