# changelog

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
