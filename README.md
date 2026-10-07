# devknobs

a dev-only panel for flipping browser preferences from inside the page. one
script tag and the knobs are there. no css to add, no code to change. zero
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
`reset()`, `replay()`, `grab(elements, options?)`, `PRESETS`. `replay()` is what
the panel calls replay animations.

```js
setState({ scheme: "dark" });
setState({ geo: { preset: "tokyo" } });
setState({ geo: { error: "denied" } });
setState({ timeZone: "Asia/Kathmandu" });
setState({ clock: { mode: "frozen", at: Date.parse("2026-12-24T18:00") } });
setState({ clock: { mode: "offset", speed: 60 } });
setState({ network: { online: "offline" } });
setState({ device: "iphone-16-pro", orientation: "landscape" });
setState({ width: 390, height: 844 });
setState({ locale: { lang: "ar" } });
setState({ ua: { preset: "iphone-safari" } });
```

`mount()` and `<DevKnobs />` take the same options:

| option | default | what it does |
| --- | --- | --- |
| `hotkey` | `k` | letter that with shift toggles the panel. a key set in the panel wins, see shortcuts |
| `open` | the stored state, closed at first | start the panel open or closed |
| `persist` | `true` | keep the knobs in `sessionStorage` |
| `state` | none | knobs to apply on top of the stored state |
| `grab` | `true` | press a key to grab elements, see grab below |
| `grabKey` | `shift+g` | the key that grabs, such as `alt+shift+g`. a key set in the panel wins |
| `grabColor` | the stored one, `auto` at first | the color of grab's boxes: `auto`, `blue`, `green`, `pink`, `orange`, `purple` or `cyan` |

state lives in `sessionStorage` under `devknobs`, so it survives reloads and
dies with the tab. pass `mount({ persist: false })` to keep it in memory.

the panel starts closed, as a handle on the right edge of the window. click it
or press shift and the hotkey (`⇧K`) to open it, and it stays open across
reloads. opening it puts the focus on its add knob button, where typing a
knob's name opens the search with it, so `⇧K` then `dark` works in one go, and
closing it gives the focus back to what had it before. a panel that comes back
open after a reload leaves the focus on the page.

drag the handle to move the panel and the handle together up and down the edge
of the window. hold shift while dragging to move the handle alone along the
panel. with the panel closed, a drag moves the handle, and the panel opens
beside it where it left it.

the handle follows the pointer sideways too. let go past the middle of the
window, or fling it toward the other edge, and the panel moves to the left or
the right edge; anywhere else it glides back to its own. each time you let go of
it, its side and where it sits on it are also kept in `localStorage` under
`devknobs:place`, so a new tab starts with the panel where you last put it. a
tab you did not drag in never writes it.

within 24px of an edge, the panel snaps flush with the top or the bottom of the
window, and the handle with the top or the bottom corner of the panel, or of the
window while the panel is closed. each stays with the edge it snapped to: a
panel at the bottom grows upward as rows and editors open, and keeps to the
bottom when the window resizes.

## the panel

the panel lists the knobs that are off their default, one row each, with
related knobs together: the device row holds the device, its mock, touch
pointer, browser, bars, edge to edge and user agent, the viewport row the
width, device pixel ratio, zoom and frame, and the time row the clock with its
mode, speed, time zone and server header. the rows stand by group: look
(scheme, contrast, transparency, vision, text), motion, locale, location,
time, network, device, viewport and debug.
a fresh session starts with four rows at their defaults, in this order: the
device, scheme, text and locale. a row added from the panel goes to the bottom
of the list. the `×` of the device row takes the size and device pixel ratio
the device brought along with it. that size and ratio are the device row's, so
the viewport row lists only for a value set on it, and its `×` leaves the
device as it is, its own pixel ratio included.
click a row to open its editor in place under it, pushing the rows below it
down, and click it again to close it. one editor is open at a time. `×` puts
that row back to its default.
a knob named the same as its row shows no label of its own under the row's
title. a row set or added from the panel stays in the list, at its default
too, until its `×` takes it off. a default row's `×` takes it off for the session
too, and reset all puts every knob back to its default and the four rows back
in the list, in their order. with every row taken off the panel says nothing
emulated, over the add knob button.

drag a row by the six dots at its leading edge, which show on hover and focus
and always on a touch screen, to put it elsewhere in the list. with the dots
focused, the up and down arrows move the row a place. the order is kept with
the rest of the session.

the rows stay on top. the add knob button under them opens a field in its
place that finds knobs and values, and the results show under the field, the
rows and the results each scrolling in its own room. type `dark`, `390`,
`+2d`, `tr`, `tokyo`, `rtl`, `pause` or `offline` and enter sets the first
result and shows its row. a value typed out in full works too: `500` for a width, `3d` for the
clock, `pt-BR`, `Europe/Paris`, or `36.9, 30.7` for a position. a knob's name
adds its row and opens its editor, with no value to set, and with nothing
typed the list shows every knob by category. arrows move through the results. a value or knob picked adds its row
at the bottom, if it is not listed yet, and gives it the focus. escape leaves
the search, query and all, back to the add knob button, then closes an open
editor, and then the panel. a click anywhere outside the search and its
results, or on the `×` at its end, leaves it too. with the focus on any of the
panel's buttons, typing a character opens the search with it typed in.

while the panel is out and the focus is in no field, `/` opens the search,
`⇧R` replays the page's animations and shift backspace (or shift delete) resets
every knob, from the frame too.
while the frame is up, meta or ctrl with `+` and `-` zoom it a step in and out,
and with `0` fit it again, from the frame too, unless the focus is in a field.
every other key goes to the page as it would without the panel. `⇧K` toggles
the panel everywhere except in a field of the page, where shift types a capital
as ever. in the panel's search, which finds in lower case anyway, `⇧K`, `⇧R` and
`⇧G` are the panel's keys and are not typed, so `⇧K` closes the panel from it,
and a plain `k` is just a letter. the panel's other fields, a list's filter and
the user agent and route boxes, take every letter.

the footer lists the keys, most used first: `⇧K` for the panel, `/` for search,
the grab key, `⇧R` for replay animations and `⇧⌫` for reset, as `Shift K`,
`Shift R` and `Shift Backspace` off a Mac. each one is a button too, so a click does what its key does. with
the overflow knob on, the count of overflowing boxes sits above them.

### shortcuts

the panel, grab, replay and reset keys above are the defaults, and each can be
set from the panel: the keyboard button at the end of the footer lists them,
click one and press the new key, escape to cancel. a key needs shift, alt
(option), ctrl or meta (⌘) with it, as a key alone types, except F1 to F12,
which work alone too. the browser's own keys (meta or ctrl with c, v, x, z,
a, w, r, t, q, l, n, f, p, s, h, m, a digit or the zoom keys, F5, F11, F12),
`/` and a key another shortcut has are refused, with the reason under the
row. a key with shift alone, like the defaults, is the panel's in its search
and the page's in a field of the page, and so is one with alt, ctrl or meta;
a function key works in fields too. a grab key with meta, ctrl or alt turns
grab on with a hold, as above, and any other with a press. the keys set are
kept in `localStorage` under `devknobs:keys`, for every tab of the origin,
the width knob's frame included at once, and win over the `hotkey` and
`grabKey` options. reset all leaves them; the x by a key puts that one back.

the panel keeps the real color scheme and motion preference of the browser,
whatever the knobs emulate for the page.

## grab

press `⇧G` (`Shift G` off a Mac) to grab an element for a coding agent. hover
it, click it, and its html, the components that rendered it and where they live
are on the clipboard, one line per element:

```
[<button type="button" data-testid="save">Save</button> in SaveButton (at src/App.jsx:5:5) in App (at src/App.jsx:28:7)]
```

paste that into the agent and it can find the code. the clipboard also carries
the same context as json, under `application/x-devknobs-grab` and react-grab's
own `application/x-react-grab`.

grab turns on with the press, and stays on until a copy, escape or `⇧G` again.
holding the key down does not turn it off. in a field of the page `⇧G` types a
capital and grab stays off, and in the panel's search it is grab's. a grab key
with meta, ctrl or alt, such as `alt+shift+g` or a copy shortcut like
`meta+c`, turns on once it is held for 100ms, and a quick press of a copy
shortcut is still a copy. the hold is 500ms while a field has
the focus and 700ms while text is selected, and a key that copied something
waits for the key to repeat, or to be let go after 200ms. grab then stays on
until a copy or escape. the search finds it too:
`grab`, `inspect` or `pick`. grab is an action, not a row: it is never
listed, and never kept, so a reload starts with it off.

while it is on:

- the element under the pointer gets a box and a label with its tag and its
  component, and the cursor is a crosshair. devknobs' own panel and frame are
  passed over, open shadow roots are reached into, and so are the children a
  hit test passes over: those that take no pointer events, or sit under a clear
  layer or a pseudo element stretched over a card.
- a click copies the element, and grab ends. the page's own click, mouse and
  pointer handlers never hear of it, and its hover handlers neither.
- shift and a click gather elements, lighter boxes, and a second one takes one
  back out. letting go of shift, or a click without it, copies them all, one
  line each.
- up goes to the parent, down back the way it came or to the first child, left
  and right (and tab, shift-tab) to the previous and the next element, siblings
  first, then the sibling of the nearest parent that has one. enter or `c`
  copies.
- a check and "Copied" show by the element for a moment, the box still on it.

the context of the element under the pointer is worked out while the pointer
rests there, so a click copies it whole, inside the click, as Safari wants.
where it is not ready yet, the click copies it without lines and columns, by
component names, and the rest is worked out for the next copy.

grab runs in the page that owns React. with the width knob's frame up, the
page above hands grab to the frame, and the box and the copy happen there.
escape in the frame ends it.

pass `grabKey: "alt+shift+g"` for another key, or `grab: false` to leave it out.
`grab(elements)` copies elements from code. the overlay and the context load
the first time grab is used.

for the full owner stack, with a file, a line and a column for each component,
React has to report to a devtools hook from its first render. the React
devtools extension has one. without it, load the early script first (see
below), which puts one in place. with neither, grab names the components it
finds on the element and falls back to a selector.

the copied line keeps to the app's own code: the component the element is
written in, at the line and column of its jsx, then the components that
rendered it, three at most, with paths from the project's root. a library's
frames, React's and nameless ones stay out, a place shows once, and class
names a tool generated (StyleX, CSS modules, emotion, styled-components) are
dropped. where a dev
server's source map has no place for an element, as a route split from its
file can, the place is looked up in the source the map carries.

grab is adapted from [react-grab](https://github.com/aidenybai/react-grab) and
reads React's internals through [bippy](https://github.com/aidenybai/bippy),
both by Aiden Bai and MIT, see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### migrating from react-grab

devknobs covers it: the same grab, the same line format, the same
clipboard type. remove the `react-grab` script or package, and mount devknobs.
pass `grabKey: "meta+c"` (`"ctrl+c"` off a Mac) to keep react-grab's key.

## early script

optional. a page that reads a media query or the time while it boots, before
devknobs mounts (a theme script, a module that checks `prefers-reduced-motion`
once, a store that stamps `Date.now()`), only sees the knob if the patch is
already in place. put the early script first in `<head>`:

```html
<script src="//unpkg.com/devknobs/dist/early.global.js"></script>
```

it is also `devknobs/early` in the package. it applies the stored scheme,
motion, contrast and transparency on the spot, and in a device's frame its
pointer and hover, with no panel: the `matchMedia` and
`matches` patches, `color-scheme` on `<html>`, and the stylesheet rewrite as
sheets arrive. it sets the stored clock the same way, through `Date` and
`Temporal.Now`, and the stored user agent on `navigator`, so a page that
sniffs it while it boots sees the preset. the full script, however it is
loaded, takes those patches over when it mounts instead of patching on top,
and lists made in between still get their change events. a `Date` the page
kept in between follows the clock still. it covers the media knobs, the clock
and the user agent only, and since it reads the stored state, it follows the
knobs from the next load on. inside a frame that gets the scheme natively, it
leaves the scheme to the browser, as the full script does. it also puts a
React devtools hook in place for grab, when the page has none, so React
reports to it from its first render.

when the stored knobs put the page in a frame, the early script also hides
the page under the frame's mat from the first paint, so a reload never shows
it full width while devknobs loads. the frame as the last page left it (the
mat, the case and the phone's browser, its screen blank in the page's color)
is kept in `sessionStorage` as the page unloads, and put back as it was, when
the device, the way it is held and the window's size are the same. otherwise
the bare mat stands in. the full script takes it over without a jump, and the
screen shows the page loading as Safari does a reload. without devknobs after
3 seconds, the page shows again.

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
| clock | system, +1h to +30d, a date and time, offset or frozen, speed 1, 60, 3600 | `Date.now()`, `new Date()` and `Date()` read the clock, and so do `Temporal.Now.instant()` and the zoned and plain readers. offset runs on from the set instant at its speed, frozen stays there. a date built from an argument (`new Date(ms)`, `new Date(y, m, d)`, a string) names its own instant and is left alone. one `Date` proxy serves this knob and the time zone knob, and either can go first or come off first. the presets count from the real now. the clock is stored as the instant it was set to and the real time it was set at, so a reload carries on where it was and the frame reads the same time. `setState({ clock: { at } })` takes epoch ms and stamps that real time itself. durations keep real time, see limits |
| online | offline, system | mimicry only: `navigator.onLine` reads false and `online` / `offline` fire on `window`. requests still succeed |
| connection, save data | slow-2g, 2g, 3g, 4g / on, off, system | mimicry only, and chromium only: `navigator.connection` reports the effective type with a matching `rtt` and `downlink`, and `saveData`, and fires `change`. nothing is throttled |
| text size | px, system | emulates the browser's default font size setting. a root `font-size` in %, em, rem or a keyword, or none at all, is taken against the knob's size (62.5% at 20 gives 12.5px), and a px root size is left alone, as the real setting does. em and rem in media queries and `matchMedia` move with it |
| text spacing | on, off | applies the wcag 1.4.12 text spacing values: line height 1.5, letter spacing 0.12em, word spacing 0.16em, 2em after paragraphs |
| viewport width | px, full | renders the page in a same-origin iframe of that width, so media queries, fixed elements, `vw` units and container queries all see a real viewport. the other knobs follow the page into the frame. a width wider than the window is scaled down to fit, see zoom. back to full, the window goes wherever the frame navigated |
| viewport height | px, full | makes the frame that tall, centered in the window both ways, so `innerHeight`, `100vh`, `svh`, `dvh` and height media queries see it. a frame taller or wider than the window is scaled down to fit both ways |
| device | a preset, none | sets the width, height and device pixel ratio of a phone, tablet, laptop or desktop together, and a touch screen where it has one. see devices below |
| orientation | portrait, landscape | turns a frame that has a width and a height, a device's or a custom one. it follows the size, so a size set across reads as landscape |
| posture | closed, open | folds a foldable shut on its cover screen or open on its inner one, which turns the frame as its hinge stays put. only the iPhone Duo folds. see devices below |
| mock | on, off | draws a phone's or tablet's body around its frame. on by default, and only offered while a phone or tablet is picked. see devices below |
| touch pointer | on, off | the mouse acts as a finger inside a touch device's frame, like the devtools device toolbar: a round cursor, touch events, `pointerType: "touch"`, no hover, drag to scroll. on by default, and only offered while a device with a touch screen is picked. see devices below |
| browser | compact, bottom, top, off on an iPhone; top, bottom, off on an Android phone | draws the phone's browser in its screen around the page, Safari on an iPhone and Chrome on an Android phone, and makes the frame the viewport that browser leaves the page. on by default with the browser's own default layout, and only offered while a phone is picked. see devices below |
| bars | auto, expanded, minimized | auto follows the page's scroll as the phone does: a scroll down of 16 px minimizes the bars, which gives the page more height, and a scroll up of 40 px, the top of the page, a tap on the minimized address or a new page brings them back. expanded and minimized hold them one way. only offered while the browser is drawn |
| edge to edge | on, off | on an iPhone, draws the page under Safari's bars to the bottom of the screen as the phone looks, in both states, so the page reads a taller viewport than Safari reports. off gives Safari's measured viewport. on by default, and only offered while Safari is drawn. see devices below |
| frame | off, on | puts the page in the same frame at full width, for the native color scheme without picking a width |
| device pixel ratio | 1, 2, 3, system | sets `zoom` on the frame, which multiplies `devicePixelRatio` inside it while its css size stays put, so resolution queries and `srcset` follow. a wrapper scales the drawing back. brings the frame up |
| zoom | fit, 50, 75, 100, 125, 150 | how big the frame is drawn, like the zoom of the devtools device toolbar. fit draws it whole, with a margin, up to its own size. a percent draws it at exactly that, and the letterbox scrolls both ways where it is bigger. the page inside keeps its viewport, media queries and device pixel ratio. the control in the letterbox's readout, ctrl or meta with the wheel or a trackpad pinch over the letterbox (around the pointer), and the zoom keys set it too |
| mat | blue, green, magenta, purple, red, graphite | the color of the cutting mat the frame lies on, its lines and numbers in a light tint of the same hue, wider on a p3 screen. green is the classic cutting mat green. it changes in place, with no reload |
| user agent | iphone safari, android chrome, ipad safari, mac safari, mac chrome, windows chrome, windows edge, linux firefox, googlebot, a custom string, system | patches `userAgent`, `appVersion`, `platform`, `vendor` and `maxTouchPoints` on `Navigator.prototype`, and `navigator.userAgentData`: its brands, `mobile`, `platform`, `toJSON` and `getHighEntropyValues` (platform version, model, architecture, bitness, full version list), all from the same browser. safari and firefox have no `userAgentData`, so their presets take it away. the ipad is the one iPadOS shows sites by default, a mac with touch points. a custom string sets `userAgent` and `appVersion` alone, as chrome devtools does: platform, vendor and touch points stay the browser's, and a `userAgentData` the browser has reports no brands. the field under the list shows the string in use, and editing it makes it the custom one. back to system, every property is the browser's own again. in a device's frame a new user agent reloads the frame, see devices |
| vision | protanopia, deuteranopia, tritanopia, achromatopsia, blur, none | an svg color matrix (machado et al. 2009, as chromium devtools uses) or a 2px blur, as a `filter` on the frame, so fixed elements inside keep their place and the panel stays readable. brings the frame up |
| overflow | on, off | finds what makes the page scroll sideways: every box that sticks out of the viewport on the right or the left with no box on the way up that clips or scrolls it, counting only the box that starts the overflow, not the children that fill it. each one gets a red mark drawn in a devknobs layer over the page (its own styles are never touched), the console names them once, and the panel shows the count in its debug row and footer. it looks again on resize, scroll and page changes. with the frame up it runs inside the frame and reports the count up |
| outlines | on, off | injects one style rule that outlines every element |
| grab color | auto, blue, green, pink, orange, purple, cyan | the color of grab's boxes and glow, wider on a p3 screen. auto is blue, and green on an element with blue behind it, so the box shows. a picked color stays whatever the page. the frame's grab follows |
| replay animations | action, `⇧R` | cancels and replays every animation `getAnimations()` returns, in the document and every open shadow root, then gives the finished css animations it no longer returns (pseudo-elements too) one `animation: none` style pass so they run again. scroll-driven animations are left alone |

new stylesheets are picked up as they arrive, so knobs keep working through
hot reloads and lazily loaded css.

a list from `matchMedia` gets a real `change` event, sent with its own
`dispatchEvent`, whenever a knob moves its verdict, so `onchange`,
`addListener` and the `once` and `signal` options all work. while a feature is
emulated, the browser's own change events for it are held back, since they
carry the real verdict.

## the frame

width, height, device, frame, device pixel ratio and vision render the page in
a same-origin iframe, a real viewport, and lean on what browsers do natively
for frames:

- color scheme: the frame element's `color-scheme` becomes the framed page's
  `prefers-color-scheme` (css color adjust, csswg #7493; chrome 129+, firefox
  105+). a probe frame checks for it once. where it works, devknobs sets it on
  the frame and leaves the page's css and `matchMedia` alone, so cross-origin
  stylesheets and shadow roots follow too. safari gets the rewrite.
- device pixel ratio: `zoom` on an iframe multiplies the ratio inside it
  (csswg #9644, chromium since 2024). a browser seen not to hand it down loses
  the zoom, and the knob does nothing there.
- fit and zoom: `transform: scale()`, never `zoom`, so the ratio inside stays
  the screen's and clicks land where they are drawn. a frame with a height is
  fitted to the window both ways, with a margin, and one with a set width
  stays clear of the open panel. the readout says the device, the size and
  the ratio, `iPhone 16 Pro · 402 × 874 · 3x`, and its zoom control the
  scale: `fit 89%`, or the zoom picked.

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

## devices

the device knob sets a size, a ratio and a touch screen in one pick. the list
in the panel groups them by kind, and search finds them by name, kind or
platform (`iphone`, `pixel`, `ipad`, `macbook`, `phone`, `tablet`,
`android`). `landscape` turns the frame, and a size typed out such as
`390x844` sets a custom one. the presets are also `PRESETS.device`.

| device | css px | dpr | touch |
| --- | --- | --- | --- |
| iPhone 18 Pro | 402 × 874 | 3 | yes |
| iPhone 18 Pro Max | 440 × 956 | 3 | yes |
| iPhone Duo | 466 × 678, open 951 × 669 | 3 | yes |
| iPhone Air | 420 × 912 | 3 | yes |
| iPhone 17 | 402 × 874 | 3 | yes |
| iPhone 17 Pro | 402 × 874 | 3 | yes |
| iPhone 17 Pro Max | 440 × 956 | 3 | yes |
| iPhone 16 | 393 × 852 | 3 | yes |
| iPhone 16 Plus | 430 × 932 | 3 | yes |
| iPhone 16 Pro | 402 × 874 | 3 | yes |
| iPhone 16 Pro Max | 440 × 956 | 3 | yes |
| iPhone SE | 375 × 667 | 2 | yes |
| Pixel 10 | 412 × 924 | 2.625 | yes |
| Pixel 10 Pro | 427 × 952 | 3 | yes |
| Pixel 10 Pro XL | 448 × 998 | 3 | yes |
| Pixel 10a | 412 × 924 | 2.625 | yes |
| Pixel 9 | 412 × 924 | 2.625 | yes |
| Pixel 9 Pro | 427 × 952 | 3 | yes |
| Pixel 9 Pro XL | 448 × 998 | 3 | yes |
| iPad mini | 744 × 1133 | 2 | yes |
| iPad Air 11 | 820 × 1180 | 2 | yes |
| iPad Pro 13 | 1032 × 1376 | 2 | yes |
| MacBook Air 13 | 1470 × 956 | 2 | no |
| laptop | 1366 × 768 | 1 | no |
| desktop | 1920 × 1080 | 1 | no |

each size is the whole screen in css px, the device held its usual way:
phones and tablets upright, laptops and desktops across. a phone shows its
browser in that screen too, see below, and a laptop's menu bar and window
frame would take some of the height as well.

a phone or tablet picked after another is held the same way, anything else
comes up its usual way, unless the patch names an orientation. a width or
height set by hand that is no longer the device's drops the device and keeps
the size, and a device pixel ratio set by hand keeps the device.

the iPhone Duo folds. it comes up closed, on its cover screen, and the device
row's `unfold` and `fold`, or `posture`, open it onto its inner screen and
shut it again. like a book, its hinge stays where it is, so the cover screen
held upright opens to the inner screen held across, and held across, it opens
upright. it folds in view: the page goes under a cover in its own color, the
half past the hinge swings toward you about it, and the page comes back laid
out on the other screen. in its bezels the half that swings is Apple's own
Duo, rendered offline every 6 degrees from Apple's model, with the page on its
turned screen, once those frames have loaded, and a copy of the bezel till then. search finds it as `unfold`, `fold`, `open`,
`closed` or `duo open`. a session kept from when the two screens were two
devices, `iphone-duo-closed` and `iphone-duo-open`, comes back as the Duo in
that posture.

a phone or tablet comes up in a mock of its body, drawn in svg around the
frame: the front glass in its band, the dynamic island, the punch hole, the
camera or the home button, and the side buttons. each device has its own
bezels, corners and parts, taken from apple's dimensional drawings and
android's display config, so an iPhone SE has its square screen, round corners,
tall forehead and chin and home button. it turns with the frame, is fitted
and zoomed with it, and never takes a pointer. the viewport stays the device's
size. the mock switch in the device editor turns it off. laptops and desktops
have none.

every iPhone and every Pixel wears its maker's own bezel instead: Apple's
product bezels from Apple Design Resources, Apple's marketing image of the
iPhone SE, and the Pixel frames of Google's Android Studio emulator. each is
drawn at its own size, 3 image px per css px on the newer iPhones, 3.52 on
the SE and 2.62 or 3 on a Pixel, with its screen opening exactly on the
frame, so no model is ever stretched onto another. the punch hole, the home
button and the buttons are the image's own. it loads from `dist/bezels` the
first time the device is shown with the mock on, the drawn mock standing in
its place until then, and the drawn mock stays where an image does not load.
the Duo's fold frames load with it, from `dist/bezels/duo-fold`, about 0.8 MB.
the images are not under this project's license, see THIRD_PARTY_NOTICES.md:
delete `assets/bezels` and run `bun run build`, which then names no image, and
every phone draws its own mock again.

a phone shows the page in its browser, drawn in the screen around the frame:
Safari's status bar and Liquid Glass bars on an iPhone, and Android's status
bar, Chrome's toolbar and the chin on a Pixel. the home indicator
and the gesture handle are left out, as they go once you switch apps and here
none are switched. the browser knob picks the layout, Safari's compact, bottom
or top and Chrome's top or bottom, or off for the whole screen. the readout
says the size the page gets.

on an iPhone the edge to edge switch, on by default, draws the page as the
phone looks: under Safari's bars to the bottom of the screen, expanded or
minimized, with the glass over it and a light scroll edge over its last
stretch. the page is then the screen under the status bar, 402 × 812 on an
iPhone 16 Pro in every layout, taller than the viewport Safari reports, so
`position: fixed; bottom: 0` elements and `100dvh` layouts sit lower than on
the phone: 58 px lower in compact minimized, 98 expanded, 158 in bottom
expanded. the end of the page gets that much room after it, as a bottom
margin on the root that follows the bars, so the last content scrolls clear
of them with the page's background under it, as on the phone: 92 px with the
bar at the top, none under its pill or turned across. a page that scrolls an
inner box, or overflows a root of a set height, gets none. turn it off for Safari's real numbers, measured in iOS 26.5:
402 × 714 in compact, 402 × 654 with the bar at the bottom and 402 × 660 at
the top, 754, 754 and 768 minimized. the strip under the page then takes the
page's background, and the end of the page fades into it. Chrome always gives
its real viewport, as its toolbar is opaque: a Pixel 9 is 412 × 777 with the
toolbar and 412 × 857 without. the 9s' status bars are AOSP's own. Google
publishes none for the 10s, so theirs are derived from where the punch hole
sits, as AOSP lines the 9s' bars up with theirs.

the bars minimize and come back with the page's scroll, or stay one way with
the bars knob. Safari's address capsule, or the bottom layout's card, is one
glass shape that becomes the minimized pill: its box and corners tween over
500 ms when it minimizes and 400 ms when it expands (the transitions.dev
very slow and slow durations) on css's ease, the address glides and shrinks
from 17 to 13 px in it, the page menu, reload and the bottom buttons fade out
early and in late, and the capsules beside it fade and drift 10 px. a scroll
the other way mid way turns it back from where it is. Chrome's toolbar
slides away under the status bar, or down with the chin, on the same timing.
where the page's height changes, edge to edge off and on Chrome, it gets one
resize for each change, at the start when its viewport grows and at the end
when it shrinks, so no gap shows, and its own scrolling as it settles never
flips the bars again. with reduced motion in the browser the bars just
switch. turned across, Safari keeps one row at the top and leaves room for
the island at both sides. Chrome's numbers come from the Chromium and AOSP
sources. the screen around
the bars takes the page's own background, read again on each load,
navigation and scheme change, and Safari's glass and glyphs go dark on a
dark page as they do on the phone. the address shows the frame's host, back
and forward step through the frame's history and reload reloads it, and the
rest is drawn only. the glyphs are drawn for devknobs, none come from Apple
or Google. tablets, laptops and desktops have no browser drawn.

a device sets the user agent knob to its own browser too: iPhone or iPad
Safari, Android Chrome, Mac Safari on the MacBook, Windows Chrome on the laptop
and desktop. taking the device away puts the user agent back to system, unless
it was changed since.

a page reads some of a device once, as it loads: a script sniffs the user
agent or the touch screen, a canvas sets up for the pixel ratio. so the frame
reloads, keeping where it is, when a pick changes any of the user agent, the
touch screen or the ratio: iPhone to Pixel, a device to the laptop, the user
agent or ratio knob on its own, a reset. one pick reloads once, and a frame
still on its first load finishes it first. iPhone 16 to iPhone 16 Pro, a turn,
the zoom, the mock, the browser bars, the touch pointer, the scheme and every
other knob follow live with no reload. the page above patches each new page in
the frame before its first script runs, as soon as the frame's window has it:
the user agent fields, `ontouchstart`, the touch points and the pointer and
hover answers of `matchMedia`, so even an inline script at the top of `<head>`
reads the device, with no early script. on its first load, on a reload and on
a link followed inside the frame alike. the copy of devknobs in the frame takes
those patches over when it mounts. tested in chrome. without a frame, a new
user agent does not reload the page: reload it yourself, or load the early
script.

a device with a touch screen gets one inside its frame: `(pointer: coarse)`,
`(any-pointer: coarse)`, `(hover: none)` and `(any-hover: none)` match, in
stylesheets and `matchMedia` alike, through the same rewrite as the prefers
knobs, `'ontouchstart' in window` is true, and `navigator.maxTouchPoints` reads
5, or what the user agent preset says while one is set. the page above the
frame keeps its own pointer.

its scrollbars take no room either, as a phone's lie over the page: every
scroller in the frame, the page itself included, has its scrollbar hidden from
before the page's first script, so `documentElement.clientWidth` and
`innerWidth` both read the device's width. the page scrolls as before, by the
wheel and the touch pointer. laptops and desktops keep their scrollbars.

the mouse acts as a finger there too, as in the devtools device toolbar. the
cursor over the frame is a round dot, a little smaller and darker while
pressed. a press sends `touchstart`, `touchmove` and `touchend` (`touchcancel`
when the browser cancels it) to the element it went down on, for the whole
gesture, and page listeners read `pointerType: "touch"` on pointer events. a
finger does not hover, so no move, over, out, enter or leave event reaches the
page without a press. a press that stays within 10px is a tap and clicks as
usual. one that moves further scrolls the nearest element that can scroll that
way, both ways where it can, within the `touch-action` of every element on the
way up, and flings on with the speed it was let go at until the next press. the
page gets a `pointercancel` then, its mouse events stop, and no click follows
a drag. after a tap the page gets `mousemove`, `mousedown` and `mouseup` once
the finger is up, after `touchend`, as a phone sends them, but the browser
still focuses and places the caret at the press, so a `preventDefault` on
`mousedown` does not keep the focus where it was. a touch listener that calls
`preventDefault` keeps the page from scrolling, and on `touchstart` or
`touchend` stops the mouse events and the click as a touch screen does. text
does not get selected and nothing starts a native drag along the way. a press
on a range slider, editable text or a scrollbar, or with any button but the
main one, is left to the browser: the page's own pointer and mouse moves pass
through untouched, and the pointer type stays the mouse's. while grab is on the
mouse is a mouse again, until grab ends. the touch pointer switch in the device
editor turns it off, and the panel never gets it.

## the clock and your server

optional, and dev only. the clock lives in the page, so a server that decides
whether a trial ran out or a feature is unlocked keeps its own time. turn on
"send to server" (`setState({ clock: { header: true } })`) and every `fetch`
and `XMLHttpRequest` to the page's own origin carries the clock's instant:

```
x-devknobs-now: 2026-10-04T09:30:00.000Z
```

a request to any other origin never gets it: a custom header there sets off a
CORS preflight, and would hand your clock to someone else's server. nothing
goes out while the clock is on system.

the server reads it with a few lines of its own, behind a dev check. generic
`Request` (hono, remix, sveltekit, `Bun.serve`):

```ts
const now = (request: Request) => {
  const header =
    process.env.NODE_ENV === "development" ? request.headers.get("x-devknobs-now") : null;
  return header ? new Date(header) : new Date();
};
```

tanstack start server function:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const getTrial = createServerFn().handler(async () => {
  const header = import.meta.env.DEV ? getRequestHeader("x-devknobs-now") : undefined;
  const now = header ? new Date(header) : new Date();
  // ...
});
```

next.js route handler:

```ts
// app/api/trial/route.ts
export async function GET(request: Request) {
  const header =
    process.env.NODE_ENV === "development" ? request.headers.get("x-devknobs-now") : null;
  const now = header ? new Date(header) : new Date();
  // ...
}
```

the first load of a page is a navigation, not a fetch, so it never carries the
header, and server rendering on that load keeps real time.

never honor the header in production. any client can send any header, so a
server that trusts it lets anyone pick the day their trial ends. gate it on a
flag that is false in production builds, as above.

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

the clock moves the time a page reads, not the time that passes.
`performance.now()`, `setTimeout`, `setInterval`, `requestAnimationFrame` and
event `timeStamp`s keep real time: they measure durations, which a date jump
does not change, and a stopped or racing timer would hang or flood the page. a
countdown that ticks every second still ticks every second, and what each
tick reads off `Date.now()` follows the clock, so at speed 60 each tick moves
a minute. an offset clock is anchored to real time, so it keeps running while
the tab is closed or reloading: an hour away at speed 60 is 60 hours on the
clock. a frozen clock waits. like the time zone, the clock lives in the page:
workers, service workers and the server keep real time (see the header above
for the server), and a server rendered timestamp can mismatch on hydration.
code that kept `Date`, `Date.now` or a `Temporal.Now` reader from before
devknobs loaded reads the real time, so load the early script first.
`Intl.DateTimeFormat` `format()` with no date, `document.lastModified` and a
file's `lastModified` read the real time too. only `fetch` and
`XMLHttpRequest` carry the header: forms, links, `sendBeacon`, `EventSource`
and websockets do not.

the user agent knob changes what page code reads, not what goes over the
wire. the server still sees the real `User-Agent` request header, as browsers
do not let page code change it on the page's own loads, so server-side
sniffing (a mobile redirect, a bot check, rendering per device) does not
follow the knob. the `Sec-CH-UA` client hint headers stay real too, in a
device's frame as well, its reloads included. workers and service workers keep
the real `navigator`. without a frame, code that read the user agent before
the knob moved keeps what it read: reload, or load the early script first. in
a frame the page reloads on its own. stylesheets in the frame's page see the
touch screen's pointer and hover once devknobs mounts there, as before.

the speed knob reaches what the Web Animations API can see. an animation
that javascript drives frame by frame (a `requestAnimationFrame` loop, a
spring in Motion) keeps its own pace. Motion's global config has no time scale
to set, so only its WAAPI-backed animations slow down.

the text size knob reads the root `font-size` from same-origin stylesheets; one
set in a cross-origin sheet is taken as relative. a `matchMedia` list made from
an em or rem query keeps the size it was made at when the knob changes later.

the touch pointer is made in the page, not by the browser. css `:hover` still
follows the real mouse, as no script can turn it off. touch events and the
`pointercancel` it sends are not trusted (`isTrusted` is false), it is one
finger only, with no pinch and no long press menu, and a fling is a simple
one, with no overscroll bounce. a page's own capture listeners on the window
still get hover moves, and ones it put there before devknobs loaded read
`pointerType: "mouse"`. desktop Safari and Firefox have no
`Touch` constructor, so they get the cursor, the pointer type and the scrolling
but no touch events. turn the switch off for the mouse as it is: clicks,
hover and `pointerType: "mouse"`. `ontouchstart` is on the window only, not on
elements or the document. `screen.width`,
`screen.height` and `screen.orientation` keep the real screen's.

a touch device's scrollbars are hidden, not drawn as a phone draws them: the
thin indicator that shows over the page while it scrolls is left out, and a
page's own `::-webkit-scrollbar` or `scrollbar-width` styles do not show in
the frame.

the bars follow the scroll of the document only, as on the phone, so a page
that scrolls an inner box keeps them as they are, and they do not come back
at the bottom of the page. with edge to edge off the page is not drawn under
the glass: the screen there takes the page's background color, and Safari's
scroll edge fades the last 64 px of the page into that color, eased from
clear to 0.85 opaque at the frame's end and 0.92 at the bottom, where on the
phone the page runs on under the bars. the top edge has no fade, as Safari
shows none there. `env(safe-area-inset-*)` stays 0. there is no keyboard, and the tabs, the
menus and the share sheet do not open. a page that changes its background
without a load, a navigation or a scheme change keeps the old color around
the bars until the next one. Safari is drawn as iOS 26.5 has it, with the
more button in compact, where iOS 27 has the tabs button. Chrome is its
classic toolbar, with no theme color and no dynamic color.

the frame loads the page a second time, so in-memory state (a half-filled form,
a client store) is not shared between the two, and the page under the frame
keeps running, though it skips rendering. navigations to another origin inside
the frame are not tracked, and get the refusal notice.

these cannot be faked from inside a page, so use the browser devtools for
them:

- device pixel ratio outside chromium (device toolbar)
- `forced-colors` and high contrast mode (rendering panel)
- print media (rendering panel, or print preview)
- trusted touch events, pinch and `:hover` that follows touch (device toolbar)
- network throttling and a real offline (network panel)
- the time zone of workers and of the page before devknobs loads (sensors panel, or a `TZ` environment variable when the browser starts)

## license

MIT, except the bezel images in `dist/bezels`. bippy and the code adapted
from react-grab are MIT too, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for them and for the images' own terms.
