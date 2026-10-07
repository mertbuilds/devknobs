# render-duo-fold

renders the frames in `assets/bezels/duo-fold`: the iPhone Duo's turning half,
case only, its screens see-through, every 2 degrees from open to shut, 0 to
180 with both ends, 91 frames, as seen from the
fold's own camera, at 1.5 px per css px, each its outline cut into pieces
round its clear middle and packed into one WebP, the half that stays packed
the same way as `still.webp`, so both halves of a fold come from one render,
and `manifest.json` beside this README with each frame's crop box, its pieces
and the corners of its two turned screens, and the still half's crop box and
pieces. the manifest never ships: the
build writes what it says into `src/engine/bezelurls.ts`. offline only:
nothing here is part of the package, its build or its runtime, and three.js
never ships.

the scene, its lights, the mesh ids, the screen geometry and the fold's bend
are adapted from [jadon7/iphone-duo](https://github.com/jadon7/iphone-duo)
(MIT), on Apple's Star White model, which its `scripts/prepare-assets.py`
downloads from apple.com. see THIRD_PARTY_NOTICES.md.

two things make the ends of the fold match Apple's own pictures of the Duo,
open and shut, which devknobs shows once the hinge is still:

- the black glass round each screen gives off light and takes none:
  `border.py` samples it in those pictures, px by px out from the screen's
  edge, as the light that comes out of the renderer's tone mapping as the
  picture's colour, into `border.json`, which `render.js` reads. it is on
  the inner screen's border meshes (`JnJdTkxbQgUtLwU`, `svvOILdVxasRAOk`,
  `gjdjMOcCfrwBMYH`, `xdyyaajWsatVNxN`) and the cover screen's
  (`xpVpaKuQKnXQhFj`). the frame, the buttons, the camera and the lights
  are as jadon7 has them. run `border.py` again only if the pictures change:

  ```sh
  uv run --python 3.12 --with pillow --with numpy python scripts/render-duo-fold/border.py
  ```

- the camera is one, the same for every frame and the still half, and sees
  in perspective, so the case behind a screen would come out smaller than
  in Apple's pictures, which are flat: up to 1.8 css px at the edge. so
  every point of the case is first moved out from the camera's axis by as
  much as its depth behind the screen that faces the camera at that end
  takes off. the screens' planes stay where they are, so their corners do
  not change, both ends come out flat, and the turn between keeps its
  perspective.

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
   bun scripts/render-duo-fold/serve.ts ~/devknobs-duo-fold/iphone-duo ~/devknobs-duo-fold/master-2deg-dark
   ```

3. open http://127.0.0.1:8767/?run&step=2 in a browser with WebGL. it renders
   every 2 degrees from 0 to 180, the half that stays once and
   `corners.json`, and saves them into the master folder; the tab's title
   says `rendered 91 angles` when it is done. without `step` it renders every
   3 degrees. the render is deterministic: an angle rendered again matches its
   earlier master to the pixel.

4. empty the package's folder, so no frame of an earlier set is left, then
   pack every 2 degrees, with no finer steps round a right angle (`near` 0),
   at WebP quality 80 and 1.5 px per css px, into it and the manifest beside
   this README:

   ```sh
   rm assets/bezels/duo-fold/*.webp
   uv run --python 3.12 --with pillow python scripts/render-duo-fold/pack.py ~/devknobs-duo-fold/master-2deg-dark assets/bezels/duo-fold 2 80 1.5 0 2
   ```

   it prints `91 frames and the still half, 1335 KiB, 98.6 MB decoded`. a
   fold decodes only the frames round its angle, never all of them.

5. `bun run build`, which writes `src/engine/bezelurls.ts` from the folder and
   the manifest, and copies the folder to `dist/bezels`.

## master PNGs

the masters are 3120 by 2760 px each, about 41 MB for a render every 2
degrees. keep them outside the repo and the package, in
`~/devknobs-duo-fold/master-2deg-dark` as above or any folder you pass to `serve.ts` and
`pack.py`. only the packed WebP frames go in `assets/bezels/duo-fold`, and
`manifest.json` here.
