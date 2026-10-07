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
   bun scripts/render-duo-fold/serve.ts ~/devknobs-duo-fold/iphone-duo ~/devknobs-duo-fold/master-2deg
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
   uv run --python 3.12 --with pillow python scripts/render-duo-fold/pack.py ~/devknobs-duo-fold/master-2deg assets/bezels/duo-fold 2 80 1.5 0 2
   ```

   it prints `91 frames and the still half, 1433 KiB, 96.7 MB decoded`. a
   fold decodes only the frames round its angle, never all of them.

5. `bun run build`, which writes `src/engine/bezelurls.ts` from the folder and
   the manifest, and copies the folder to `dist/bezels`.

## master PNGs

the masters are 3120 by 2760 px each, about 51 MB for a render every 2
degrees. keep them outside the repo and the package, in
`~/devknobs-duo-fold/master-2deg` as above or any folder you pass to `serve.ts` and
`pack.py`. only the packed WebP frames go in `assets/bezels/duo-fold`, and
`manifest.json` here.
