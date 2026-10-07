# render-duo-fold

renders the frames in `assets/bezels/duo-fold`: the iPhone Duo's turning half,
case only, its screens see-through, every 6 degrees from open to shut and
every 3 within 24 of a right angle, where it turns edge on, as seen from the
fold's own camera, at 1.5 px per css px, each its outline cut into pieces
round its clear middle and packed into one WebP, and `manifest.json` beside
this README with each frame's crop box, its pieces and the corners of its two
turned screens and of its free edge's side. the manifest never ships: the
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
   outside this repo:

   ```sh
   bun scripts/render-duo-fold/serve.ts ~/devknobs-duo-fold/iphone-duo ~/devknobs-duo-fold/master
   ```

3. open http://127.0.0.1:8767/?run in a browser with WebGL. it renders every
   3 degrees from 0 to 180, the half that stays once and `corners.json`, and
   saves them into the master folder; the tab's title says `rendered 61
   angles` when it is done. `?run&step=6` renders fewer.

4. pack every 6 degrees, and every 3 within 24 of a right angle, into the
   package's folder, at WebP quality 80 and 1.5 px per css px, and the
   manifest beside this README:

   ```sh
   uv run --python 3.12 --with pillow python scripts/render-duo-fold/pack.py ~/devknobs-duo-fold/master assets/bezels/duo-fold 6 80 1.5
   ```

5. `bun run build`, which writes `src/engine/bezelurls.ts` from the folder and
   the manifest, and copies the folder to `dist/bezels`.

## master PNGs

the masters are 3120 by 2760 px each, about 36 MB for a render every 3
degrees. keep them outside the repo and the package, in
`~/devknobs-duo-fold/master` as above or any folder you pass to `serve.ts` and
`pack.py`. only the packed WebP frames go in `assets/bezels/duo-fold`, and
`manifest.json` here.
