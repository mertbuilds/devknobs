# render-duo-fold

renders the frames in `assets/bezels/duo-fold`: the iPhone Duo's turning half,
case only, its screens see-through, every degree from open to shut, 0 to 180
with both ends, 181 frames, as seen from the fold's own camera, at 1.5 px per
css px, each its outline cut into pieces round its clear middle and packed
into one WebP, and the half that stays at the same angle packed the same way,
as a `still-*.webp` for each render of it that differs from those before, so
both halves of a fold come from one render, and `manifest.json` beside this
README with each frame's crop box, its pieces, the corners of its two turned
screens and which half that stays it has, and each of those halves' crop box
and pieces. the manifest never ships: the
build writes what it says into `src/engine/bezelurls.ts`. offline only:
nothing here is part of the package, its build or its runtime, and three.js
never ships.

the scene, its lights, the mesh ids, the screen geometry and the fold's bend
are adapted from [jadon7/iphone-duo](https://github.com/jadon7/iphone-duo)
(MIT), on Apple's Star White model, which its `scripts/prepare-assets.py`
downloads from apple.com. see THIRD_PARTY_NOTICES.md.

these make the ends of the fold match Apple's own pictures of the Duo, open
and shut, which devknobs shows once the hinge is still:

- the black glass round each screen gives off light and takes none:
  `border.py` samples it in those pictures, px by px out from the screen's
  edge, as the light that comes out of the renderer's tone mapping as the
  picture's colour, into `border.json`, which `render.js` reads. it is on
  the inner screen's border meshes (`JnJdTkxbQgUtLwU`, `svvOILdVxasRAOk`,
  `gjdjMOcCfrwBMYH`, `xdyyaajWsatVNxN`) and the cover screen's
  (`xpVpaKuQKnXQhFj`). the camera and the lights are as jadon7 has them.
  run `border.py` again only if the pictures change:

  ```sh
  uv run --python 3.12 --with pillow --with numpy python scripts/render-duo-fold/border.py
  ```

- the metal, the frame of both halves, its buttons and the strip at the
  hinge, is Star White in Apple's model, which lit as jadon7's scene lights
  it comes out light silver, while Apple's pictures show it dark, polished,
  with a bright line along it. the model's other finish, Night Sky, is navy
  and no nearer. so the metal gives off light and takes none, as the border
  does, by the way it faces the camera: `matcap.py` lays a render of the
  metal's normals on Apple's pictures, open and shut, as devknobs lays the
  render, and writes into `matcap.json`, on a 64 by 64 grid of the ways it
  can face, the light that tone maps to the mean colour there. render.js reads
  it. the hinge strip's own bumps, its brushed look, go into which way it
  faces. run it again if the pictures, the metal's meshes or the fold change,
  with step 3's renders `?run&normals` makes, and then render the frames.

- shut, Apple's picture shows the hinge as a spine of brushed metal past the
  halves' edge. jadon7's strip bends with a Hermite curve between the halves,
  which shut reaches only to x = 0.175 and hides under the frame, so under the
  screen each layer of the strip reaches out further as the fold shuts, round
  the one above it, 2.3 times its depth under the screen at shut: the strip
  wraps round the hinge as wide as Apple's spine, the open pose stays flat,
  and every angle between is a smooth curve with no seam.

- the camera is one, the same for every frame and the still half, and sees
  in perspective, so the case behind a screen would come out smaller than
  in Apple's pictures, which are flat: up to 1.8 css px at the edge. so
  every point of the case is first moved out from the camera's axis by as
  much as its depth behind the screen that faces the camera at that end
  takes off. the screens' planes stay where they are, so their corners do
  not change, both ends come out flat, and the turn between keeps its
  perspective. the half that stays lies behind the cover screen once shut,
  so from 160 degrees on it goes over to its depth behind the cover, but
  along the hinge, where it meets the strip, and its screen, under the cover
  by then, comes along: without it its buttons sat 2.3 css px low at shut.
  so it is rendered at every angle too, its screen's hole flat to the hinge
  line as it lies open, and is the same render up to 160 degrees.

## steps

1. clone jadon7/iphone-duo outside this repo and prepare Apple's assets with
   Python 3.12:

   ```sh
   git clone https://github.com/jadon7/iphone-duo.git ~/devknobs-duo-fold/iphone-duo
   cd ~/devknobs-duo-fold/iphone-duo
   uv run --python 3.12 --with-requirements requirements-assets.txt python scripts/prepare-assets.py
   ```

2. serve the renderer, the clone, and a folder for the master PNGs, also
   outside this repo. it listens on port 8767, or on `PORT`:

   ```sh
   bun scripts/render-duo-fold/serve.ts ~/devknobs-duo-fold/iphone-duo ~/devknobs-duo-fold/master-1deg-v3
   ```

3. only where `matcap.json` is to be made again: open
   http://127.0.0.1:8767/?run&normals in a browser with WebGL, which saves
   the metal's normals open and shut as `normals-*` into the master folder,
   the tab's title `rendered 2 angles` when done, then:

   ```sh
   uv run --python 3.12 --with pillow --with numpy python scripts/render-duo-fold/matcap.py ~/devknobs-duo-fold/master-1deg-v3
   ```

   it prints how many px of metal it sampled at each end and `1773 of 4096
   cells sampled`, the rest filled from round them.

4. open http://127.0.0.1:8767/?run&step=1. it renders both halves every
   degree from 0 to 180 and `corners.json`, and saves them into the master
   folder; the tab's title says `rendered 181 angles` when it is done. without
   `step` it renders every 3 degrees. the render is deterministic: an angle
   rendered again matches its earlier master to the pixel.

5. empty the package's folder, so no frame of an earlier set is left, then
   pack every degree, with no finer steps round a right angle (`near` 0), at
   WebP quality 80 and 1.5 px per css px, into it and the manifest beside
   this README:

   ```sh
   rm assets/bezels/duo-fold/*.webp
   uv run --python 3.12 --with pillow python scripts/render-duo-fold/pack.py ~/devknobs-duo-fold/master-1deg-v3 assets/bezels/duo-fold 1 80 1.5 0 1
   ```

   it prints `181 frames and 21 of the half that stays, 2777 KiB, 211.7 MB
   decoded`. a fold decodes only the frames round its angle and the halves
   that stay they name, about 55 MB at most, never all of them.

6. `bun run build`, which writes `src/engine/bezelurls.ts` from the folder and
   the manifest, and copies the folder to `dist/bezels`.

## master PNGs

the masters are 3120 by 2760 px each, about 130 MB for both halves every
degree. keep them outside the repo and the package, in
`~/devknobs-duo-fold/master-1deg-v3` as above or any folder you pass to `serve.ts` and
`pack.py`. only the packed WebP frames go in `assets/bezels/duo-fold`, and
`manifest.json` here.
