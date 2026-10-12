# changelog

## unreleased

### requests

- `⇧N`, or `requests` in the search, shows what the page asks for, as a view in the panel: `fetch` and `XMLHttpRequest` whole, and what the page loads on its own by its timing and size. a row opens its request in full, and copy puts it on the clipboard as text for an AI, with the values of secret headers left out. the key can be set in the settings like the others

### fresh mode

- `?devknobs=fresh` in the page's address shows the page and the panel as a first visit sees them: `localStorage` is left alone, and every load devknobs did not ask for starts with no knobs set. the footer says so while it is on

### inspect

- `⇧C` (`Shift C` off a Mac), the inspect action in the search or its key in the footer picks an element as grab does and shows its css in the panel, in place of the rows, read only: its `style` attribute, the rules that reach it in cascade order with overridden declarations struck through, each rule's `@layer`, `@media`, `@supports` and `@container` and its stylesheet's file, its `::before` and `::after`, what each ancestor hands down, color swatches and what a custom property resolves to. a click copies nothing. a stylesheet from another origin shows as `rules hidden`. the key is set in the settings like the others, and `inspect` in the search no longer finds grab. the styles have two modes, set beside the filter and kept: `simple`, the default, lists only the declarations that apply to the element, grouped by what they do, with what it inherits folded under them, and `advanced` is the cascade view above
- inspect draws the box of the element under the pointer, as the browsers' tools do: content blue, padding green, border yellow, margin orange. a turned or scaled element is drawn by its own corners where the browser has `getBoxQuads`, and by its bounding box where it has not. grab keeps its plain box
- the styles view starts with the element's box under `box`, in both modes: margin, border, padding and content one inside the other with the length of each side, the content's size, and the offsets of a positioned element. the pointer on an area draws it alone on the page. a narrow panel says the lengths in a line under the box. the fold stays the way you leave it
- inspect's label is a card: the element and its size, then its color and background, the font its text is likely set in with its size, line height and weight, the wcag contrast with a mark for level AA, and its margin and padding, each only where it applies. the font is the first family of the list that the browser says is there, as a page cannot ask which font a glyph was drawn with
- picking is a mode that ends with the pick, as in the browsers' own tools: a click shows the element in the styles view and nothing stays drawn on the page, which takes clicks again. the view's head has a select button, pressed while the picking is on, that starts it again, and `⇧C` does the same and stops it while it picks. escape ends the picking and keeps the element. inspect's row opens the view on the element it holds, and picks only with none: it says `picking`, the element's name, or `off`, stays listed while it holds an element, and its x and reset all let go of the element. a crumb, the box's diagram and the name in the view's head box their element on the page while the pointer is on them. an element that left the page is said so, with the select button there to pick another. starting grab ends the picking, and the reverse
- inspect has a row as grab and replay animations do: run from the search, the add knob list, the footer or its row, its row stays in the list, says `picking` while it picks, and its x takes it off and ends the picking. its key in the footer and its row now turn it off where it is on

### storage

- a storage view in the panel (`⇧S`, or search for storage, data, cookies): `localStorage`, `sessionStorage` and the cookies a page can read, to look at, copy, edit, add and delete; IndexedDB and Cache Storage to read; clear site data in one go after one question; and presets, named sets of values to put back with a press or on every load. see the storage section of the readme

### panel

- the pin button in the footer, and the pin panel action in the search, dock the panel to its side as a column the height of the window, like devtools. the page runs in a frame beside it, so its viewport really is narrower: media queries, `100vw` and fixed boxes follow. pinning loads the page once more when no frame is up, and never with a device or a width set. the pin is kept with the panel's place. the column is as wide as the panel, a view's width while one shows, and its edge sets that width down to a page of 320px. the page follows the column's edge frame by frame as the panel opens, closes or glides to a view's width, and slides across as the column changes side. two buttons by the pin, and the move panel across action, take it to the other side and close it. run from the panel, pin panel and move panel across are rows like any action: the pin's row says `on` while the panel is pinned, and its `×` and reset all leave the panel where it is
- a fresh panel starts with its handle 128px below the top of the window, and opens from there, not from the very top. a place you already dragged it to is kept
- the panel's width is yours to set: drag its edge on the page's side, or focus the edge and press the arrows. a double click puts it back, and the width is kept
- grab, replay animations and requests have rows as the knobs do. run one from the search, the add knob list, the footer or its row and its row stays in the list, to drag where you want it. its row runs it, shows its key and whether a mode is on, and its x takes it off and turns the mode off. a key alone lists a mode only while it is on
- the head of the settings has its way back at the row's leading edge, where a row's grip is, and its title where a row's content starts
### iPhone Duo

- the half that turns shows the page at the text size knob's size: its lines meet the other half's at the hinge. a page that sets its own root font size folds right too
- the half that turns is sharp at the hinge through the whole fold, and blurs gently toward its free edge: 48 px at most, where it was 128. its top and bottom ends still blur into the black past them, at the hinge too
- nothing marks the hinge: the bend's dark strip is gone from both halves
- no thin dark line runs down the hinge as the Duo folds: the half that turns stops 2 px short of the hinge and the black under it 4 px short, each on an edge of its own, and the other half goes on under both, so the black never shows through the page's edge
- a fold that turns copies of the half has no black px down the hinge either
- where WebGL2 does not draw the half that turns, its blur rises with no lines down it: the blurred pictures laid over each other are twice as wide each, not four times, and each fades in exactly where the one under it is all in
- the half that turns is no longer shaded toward its free edge as it turns: it keeps the screen's own light, the same as the other half's, so no lines run down it. the three shades are still in the fold's numbers, at 0
- a shade brought back has no lines either: WebGL2 works it out at every px, and where gradients draw it they go through as many stops as its bends need, not 9
- a picture on the page that covers its box, or is contained in it, is cut and placed on the half that turns as the page shows it. it was stretched over its box, so a page that had not yet picked its picture for the open screen showed the folded screen's twice as wide as it is tall
- unfolding, the open screen's half shows the page as it lays itself out open, once it has picked what it shows there: its picture is taken again when the frame is drawn open, where the page changed since
- the half that turns shows the page's pictures as they were when its picture was taken, not as they are a moment later, the frame laid out for the other screen and back
- nothing devknobs put on the page is on the half that turns, nor the browser's box for a picture it could not load
- a rough picture of the page is kept by all it depends on: its screen, viewport and knobs, the device pixel ratio, the text size, the scroll and what the page's pictures show. one of the folded screen never stands in for the open one's

### internal

- the numbers of the fold's look are in one table. the package has them as they ship and no way to set them
- the four below are in development from source only, with `DEVKNOBS_TUNE` not defined: the build defines it false and fails if any of them is in the package
- the table is on `window` under `Symbol.for("devknobs.foldtune")`, to tune by hand on a live page. nothing is stored
- the same hook's `info()` says what drew the half that turns the last time, WebGL2 or the layers, and why
- the table has two switches for finding what draws a line, `shadeOn` and `blurOn`, and `grain`, the fine noise WebGL2 adds to a shade it draws
- three more switches for finding what draws a line: `backTint` makes the black under the half that turns magenta, `frameOn` leaves out the pictures of the case, `stillOn` hides the half that stays

### device frame

- `frame.show(url)` shows a page from another origin in the device, at its size, in its body and bars, and `frame.own()` puts your own page back. only `http` and `https` addresses are taken. `frame.get()` and `frame.subscribe()` say what the frame shows and when it loaded
- an outside page is a frame only: turning, folding, another device, the mat and the reload button work, and the bars are drawn still with the page's host. knobs that change the page do not reach it, and the panel says so in one line
- around an outside page the device's own screen follows the scheme knob: the status bar, the browser's bars, the screen beside and under the page, the blank screen of a reload and the refused message are dark for dark, light for light, and follow the system for system. the screen takes the browser's default dark or light, as the page's own background cannot be read
- `frame.show(url, { look: { light, dark } })` and `frame.look(look)` give the outside page's own colors, such as its `theme-color` as your server read it, and the device's own screen takes the one for its scheme in place of the browser's default, with dark or light ink by how bright it is. one color alone is for both schemes, `frame.look(null)` takes them away, and they go with the page. only a hex or an `rgb()` of plain numbers is taken
- the back button of the drawn browser's bars leaves an outside page for your own page, as `frame.own()` does, from the refused message too. forward stays off
- `frame.show(url, { refused: true })` and `frame.refuse()` put a plain message on the device's screen for a site that refuses to be framed, after the host's own check of its headers
- an outside page is never stored: a reload of the window is back on your own page

### fixes

- a load devknobs asks for keeps the scroll position: the reload a locale or a device needs, the reload button in the device's browser bars, and a frame a knob brings up. the page, and the copy of it in the device's frame, go back to where they were once they are long enough, also when the host sends them to the top as it mounts. it stops as soon as you scroll, press a key or click, and a load of your own restores nothing

### colors

- the mat and grab's color take colors of your own: the plus after the swatches opens the browser's color picker, and a hex or `rgb()` can be typed in the field under it. the color shows on the mat, or on grab's box, while you pick it
- a color of your own is kept per site, up to 8 for the mat and 8 for grab, and the x on its swatch, or delete with the focus on it, takes it off. one the same as a swatch that is there picks that swatch
- the mat's lines and numbers go dark on a light color such as white or yellow, and the splash, the reload's stand-in and the early script follow any color

## 0.1.2

### iPhone Duo

- a fold goes at one constant speed, half a second shut to open, with no easing. the hinge under a hand on the fold slider still follows through its spring
- a fold started from the fold chip or the posture knob starts sharp: no grey bands where the text is, and no jump as it begins
- the half that turns shows the page in its own fonts, not a fallback
- a fold back, a hand letting go and a hand taking the hinge go on from exactly where the fold is drawn
- a draw that comes late slows the fold instead of skipping part of it
- the fold's frames for the end the Duo rests at stay decoded while it is shown in its bezels

### react

- `dist/react.js` has `"use client"` once, on its first line. a second one further down failed under Next.js with webpack

### internal

- `bun run link <app>` and `bun run unlink <app>` put a local build into an app's `node_modules` as a copy, and put the installed one back

## 0.1.1

### iPhone Duo

- every layer follows the frame on screen, so nothing drifts during slow slider drags
- the turning screen's free edge darkens as it stands up, measured from Apple's fold
- the whole turning screen blurs near a right angle

### device frame

- the status bar clock reads 04:20
- the device glides over when the panel changes side or opens and closes beside it

### panel

- a panel that shrinks, as a row closes, keeps its top instead of jumping to the bottom

### internal

- panel.ts and catalog.ts split into focused modules, no behaviour change

## 0.1.0

### breaking

- the default keys moved to shift: `⇧K` opens the panel (was `d`), `⇧R` replays animations (was `r`), and `⇧G` turns grab on and off with a press (was holding `⌘C`, `Ctrl+C` off a Mac). `⇧⌫` still resets
- `hotkey` is now the letter that toggles the panel with shift. `hotkey` and `grabKey` keep working; pass `grabKey: "meta+c"` to keep the old grab key
- the two iPhone Duo devices are now one, with an open or closed posture. a kept `iphone-duo-closed` or `iphone-duo-open` comes back as the Duo in that posture

### stored data

- every item devknobs keeps in session or local storage now carries a version, so a later release can change its shape safely. data kept by 0.0.3 carries over: knobs, place, keys and preferences read as before

### panel

- lives on either side of the window: drag or fling it across, and it keeps its place across reloads
- rows open their editor in place, one at a time, like an accordion
- an add knob button under the rows opens search; rows reorder by drag or by arrow keys
- rows regrouped: device and viewport split, related knobs merged into one row each, row icons from lucide
- a fresh panel lists device, scheme, text size and locale; grab is an action in the footer, not a row
- a control shows only once it does something (clock mode and speed, zoom, mat, header)
- settings behind a gear, sliding in like ios navigation: hide the handle, and rebind every shortcut, kept per site
- tooltips on icon-only controls; a refused key shakes and says why

### device frame

- a device change animates, and rotation turns the device in view
- each device has its own rounded screen opening, tracked frame by frame
- a mat color knob (classic green, magenta and more); a new color splashes out from behind the device
- a reload keeps the mat, case and safari ui, from a snapshot the early script puts back on the first paint
- safari's reload and stop glyphs redrawn to match iOS 26; reload waits for the new page and stop stops it
- the user agent box shows only for a custom user agent

### iPhone Duo

- folds in 3D around its hinge on Apple's hinge spring, from the device row's `fold` and `unfold`, or a fold slider
- the case is rendered offline from Apple's own Duo model, one frame every degree, shaded from Apple's bezel pictures
- the page stays flat behind the turning screen, as on Apple's product page
- the turning screen blurs through a small WebGL2 pass, safari's bars included, with plain layers as fallback
- thanks to jadon7: the scene, fold rig and screen projection come from [iphone-duo](https://github.com/jadon7/iphone-duo), MIT

### grab

- the frame waits for the pointer to settle before it moves on
- the frame glides on transforms alone, with no layout or page paint per frame
- turning grab on takes the focus out of the panel, so the arrows are grab's

### fixes

- the grab frame holds at fractional pixel ratios
- a focused plain scroll box leaves the shortcuts on; keys the panel acts on skip the browser default
- focus, touch and kept-place fixes across the panel
