import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { bezelFiles, bezelUrlsModule, FOLD_FOLDER, foldShotsIn, foldShotsOf } from "../scripts/bezelurls";
import { BEZELS, type Bezel, bezelMock, bezelUrl, densityOf, loadAll, loadBezel } from "../src/engine/bezels";
import { DUO_FOLD } from "../src/engine/bezelurls";
import { SCREENS, screenOf, turn } from "../src/engine/devices";
import { mockOf, placeIn } from "../src/engine/mock";
import { fit, STRIP } from "../src/engine/width";

const FOLDER = new URL("../assets/bezels", import.meta.url).pathname;

/** Every image with its device and the way it is held. */
const SHOTS = Object.entries(BEZELS).flatMap(([id, { portrait, landscape }]) => {
  const upright: [string, "portrait" | "landscape", Bezel][] = [[id, "portrait", portrait]];
  return landscape ? [...upright, [id, "landscape", landscape] as (typeof upright)[number]] : upright;
});

/** An image's density on its device. */
function densityAt(id: string, shot: Bezel): number {
  const density = densityOf(id, shot);
  if (density === null) throw new Error(`no device ${id}`);
  return density;
}

/** An image that settles a task after it is asked for, the way `ok` says. */
function fakeImage(ok: (src: string) => boolean): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      queueMicrotask(() => (ok(value) ? this.onload : this.onerror)?.());
    }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "Image");
  Reflect.deleteProperty(globalThis, "location");
});

describe("BEZELS", () => {
  test("every iPhone and every Pixel has an image, and nothing else does", () => {
    const ids = SCREENS.filter((device) => /^(iphone|pixel)-/.test(device.id));
    expect(Object.keys(BEZELS).sort()).toEqual(ids.map((device) => device.id).sort());
    expect(SHOTS).toHaveLength(21);
    expect(new Set(SHOTS.map(([, , shot]) => shot.file)).size).toBe(21);
  });

  test("each opening is its device's screen at the image's density, never stretched", () => {
    for (const [id, way, shot] of SHOTS) {
      const device = screenOf(id);
      if (!device) throw new Error(`no device ${id}`);
      const screen = turn(device, way);
      const density = densityAt(id, shot);
      const [left, top, width, height] = shot.opening;
      expect(Math.abs(width / density - screen.width)).toBeLessThan(0.5);
      expect(Math.abs(height / density - screen.height)).toBeLessThan(0.5);
      // The body is around the opening, inside the image.
      const [bodyLeft, bodyTop, bodyRight, bodyBottom] = shot.body;
      expect(bodyLeft).toBeGreaterThanOrEqual(0);
      expect(bodyTop).toBeGreaterThanOrEqual(0);
      expect(bodyLeft).toBeLessThan(left);
      expect(bodyTop).toBeLessThan(top);
      expect(bodyRight).toBeGreaterThan(left + width);
      expect(bodyBottom).toBeGreaterThan(top + height);
      expect(bodyRight).toBeLessThanOrEqual(shot.size[0]);
      expect(bodyBottom).toBeLessThanOrEqual(shot.size[1]);
    }
  });

  test("the drawn mock has the island or the camera hole where the image has it", () => {
    for (const [id, { portrait }] of Object.entries(BEZELS)) {
      const drawn = mockOf(id, "portrait");
      const sensor = drawn?.parts.find((part) => part.kind === "sensor");
      expect(sensor !== undefined).toBe(portrait.cutout !== undefined);
      if (!drawn || !sensor || !portrait.cutout) continue;
      const [left, top, width, height] = portrait.cutout;
      const [x, y] = portrait.opening;
      const density = densityAt(id, portrait);
      expect(Math.abs(sensor.x - drawn.inset.left - (left - x) / density)).toBeLessThan(1);
      expect(Math.abs(sensor.y - drawn.inset.top - (top - y) / density)).toBeLessThan(1);
      expect(Math.abs(sensor.width - width / density)).toBeLessThan(1);
      expect(Math.abs(sensor.height - height / density)).toBeLessThan(1);
    }
  });

  test("the page is clipped just inside the screen's own corners", () => {
    for (const [id, way, shot] of SHOTS) {
      const drawn = mockOf(id, way)?.screenRadius;
      const clip = bezelMock(id, way)?.screenRadius;
      const pairs =
        typeof drawn === "number" || typeof clip === "number"
          ? [[drawn, clip]]
          : (drawn ?? []).map((radius, at) => [radius, clip?.[at]]);
      expect(typeof clip).toBe(typeof shot.radius);
      for (const [screen, round] of pairs) {
        expect(Number(round)).toBeLessThanOrEqual(Number(screen));
        expect(Number(round)).toBeGreaterThan(Number(screen) - 4);
      }
    }
  });

  test.skipIf(!existsSync(FOLDER))("every image is in assets/bezels, and nothing else is", () => {
    const files = SHOTS.map(([, , shot]) => shot.file).sort();
    expect(readdirSync(FOLDER).filter((file) => file !== FOLD_FOLDER).sort()).toEqual(files);
  });
});

describe("densityOf", () => {
  test("is 3 in Apple's iPhone images, 3.52 in the SE's and the panel's own in Google's", () => {
    const densities = Object.fromEntries(
      SHOTS.map(([id, , shot]) => [id, Math.round(densityAt(id, shot) * 100) / 100]),
    );
    for (const [id, density] of Object.entries(densities)) {
      if (id.startsWith("iphone-") && id !== "iphone-se") expect(density).toBe(3);
    }
    expect(densities).toMatchObject({
      "iphone-se": 3.52,
      "pixel-10": 2.62,
      "pixel-10-pro": 3,
      "pixel-10-pro-xl": 3,
      "pixel-10a": 2.62,
      "pixel-9": 2.62,
      "pixel-9-pro": 3,
      "pixel-9-pro-xl": 3,
    });
  });

  test("is an image's own scale, from its opening's width and height together", () => {
    // An opening of 1080 x 2424 image px on a screen of 412 x 924 css px,
    // which is 2.6214 across and 2.6234 down.
    const shot: Bezel = {
      file: "phone.webp",
      size: [1198, 2531],
      opening: [55, 58, 1080, 2424],
      body: [0, 0, 1198, 2531],
      radius: 55,
    };
    const density = densityAt("pixel-9", shot);
    expect(density).toBeCloseTo(3504 / 1336, 9);
    expect(Math.abs(1080 / density - 412)).toBeLessThan(0.25);
    expect(Math.abs(2424 / density - 924)).toBeLessThan(0.25);
    expect(densityOf("none", shot)).toBeNull();
  });
});

describe("bezelMock", () => {
  test("takes its room around the screen from the body with its buttons", () => {
    const mock = bezelMock("iphone-18-pro", "portrait");
    expect(mock?.inset.left).toBeCloseTo((72 - 16) / 3);
    expect(mock?.inset.top).toBeCloseTo((69 - 22) / 3);
    expect(mock?.inset.right).toBeCloseTo((1334 - 72 - 1206) / 3);
    expect(mock?.inset.bottom).toBeCloseTo((2738 - 69 - 2622) / 3);
    expect(mock?.width).toBeCloseTo(1318 / 3);
    expect(mock?.height).toBeCloseTo(2716 / 3);
    // The image is drawn at a third of its size, its opening on the screen.
    expect(mock?.image).toMatchObject({ file: "iphone-18-pro.webp", width: 450, height: 920 });
    expect((mock?.image?.x ?? 0) + 72 / 3).toBeCloseTo(mock?.inset.left ?? 0);
    expect((mock?.image?.y ?? 0) + 69 / 3).toBeCloseTo(mock?.inset.top ?? 0);
    expect(mock?.image?.turn).toBeNull();
    expect(mock?.parts).toEqual([]);
  });

  test("is the screen and the room around it, either way up", () => {
    for (const [id] of Object.entries(BEZELS)) {
      const device = screenOf(id);
      if (!device) throw new Error(`no device ${id}`);
      for (const way of ["portrait", "landscape"] as const) {
        const mock = bezelMock(id, way);
        const size = turn(device, way);
        expect(mock?.width).toBeCloseTo(size.width + (mock?.inset.left ?? 0) + (mock?.inset.right ?? 0));
        expect(mock?.height).toBeCloseTo(
          size.height + (mock?.inset.top ?? 0) + (mock?.inset.bottom ?? 0),
        );
      }
    }
  });

  test("turns the upright image with the device, its top to the left", () => {
    const upright = bezelMock("iphone-duo-closed", "portrait");
    const turned = bezelMock("iphone-duo-closed", "landscape");
    if (!upright?.image || !turned) throw new Error("no bezel");
    expect(turned.image).toEqual({ ...upright.image, turn: upright.width });
    expect(turned.width).toBe(upright.height);
    expect(turned.inset).toEqual({
      top: upright.inset.right,
      right: upright.inset.bottom,
      bottom: upright.inset.left,
      left: upright.inset.top,
    });
    // The hinge side's square corners go to the bottom.
    expect(upright.screenRadius).toEqual([8, 58, 58, 8]);
    expect(turned.screenRadius).toEqual([58, 58, 8, 8]);
  });

  test("the open iPhone Duo held across has an image of its own, not turned", () => {
    const across = bezelMock("iphone-duo-open", "landscape");
    expect(across?.image).toMatchObject({
      file: "iphone-duo-inner-open-landscape.webp",
      width: 1031,
      height: 749,
      turn: null,
    });
    expect(across?.width).toBeCloseTo(951 + (across?.inset.left ?? 0) + (across?.inset.right ?? 0));
    expect(bezelMock("iphone-duo-open", "portrait")?.image?.file).toBe(
      "iphone-duo-inner-open-portrait.webp",
    );
  });

  test("fits the whole phone, buttons and all, in the letterbox", () => {
    const letterbox = { width: 1200, height: 800 + STRIP };
    for (const [id, way] of SHOTS) {
      const device = screenOf(id);
      const mock = bezelMock(id, way);
      if (!device || !mock) throw new Error(`no bezel ${id}`);
      const place = fit({ ...turn(device, way), zoom: "fit" }, letterbox, { mock: mock.inset });
      const margin = place.left - mock.inset.left * place.scale;
      expect(margin).toBeGreaterThan(0);
      expect(mock.width * place.scale + 2 * margin).toBeLessThanOrEqual(place.box.width + 1e-9);
      expect(place.box.width).toBeLessThanOrEqual(letterbox.width + 1e-9);
      expect(place.box.height).toBeLessThanOrEqual(800 + 1e-9);
    }
  });

  test("has the drawn mock stand in its room while it loads, its screen in the same place", () => {
    for (const [id, way] of SHOTS) {
      const drawn = mockOf(id, way);
      const bezel = bezelMock(id, way);
      if (!drawn || !bezel) throw new Error(`no mock ${id}`);
      const stand = placeIn(drawn, bezel);
      expect(stand).toMatchObject({ width: bezel.width, height: bezel.height, inset: bezel.inset });
      expect(stand.body.x - drawn.body.x).toBeCloseTo(bezel.inset.left - drawn.inset.left);
      expect(stand.body.y - drawn.body.y).toBeCloseTo(bezel.inset.top - drawn.inset.top);
      expect(stand.parts).toHaveLength(drawn.parts.length);
      expect(stand.image).toBeUndefined();
    }
  });

  test("draws an image at its own density, the screen in the middle of the opening", () => {
    // Pixel 9: 1080 x 2424 image px over 412 x 924 css px.
    const density = 3504 / 1336;
    const pixel = bezelMock("pixel-9", "portrait");
    expect(pixel?.image).toMatchObject({ file: "pixel-9.webp", turn: null });
    expect(pixel?.image?.x).toBeCloseTo(0);
    expect(pixel?.image?.width).toBeCloseTo(1198 / density);
    expect(pixel?.image?.height).toBeCloseTo(2531 / density);
    expect(pixel?.inset.left).toBeCloseTo((55 + (1080 - 412 * density) / 2) / density);
    expect(pixel?.inset.top).toBeCloseTo((58 + (2424 - 924 * density) / 2) / density);
    // The opening's middle is the screen's middle.
    const middle = (pixel?.image?.x ?? 0) + (55 + 1080 / 2) / density;
    expect(middle).toBeCloseTo((pixel?.inset.left ?? 0) + 412 / 2);
    // The SE at 3.52, its square screen with the home button and camera in the image.
    const se = bezelMock("iphone-se", "portrait");
    expect(se?.image?.width).toBeCloseTo((1536 * 1042) / 3666);
    expect(se?.screenRadius).toBe(0);
    expect(se?.parts).toEqual([]);
    expect(se?.inset.top).toBeCloseTo((387 + (2346 - (667 * 3666) / 1042) / 2) / (3666 / 1042));
  });

  test("turns a Pixel's upright image with the device, punch hole to the left", () => {
    const upright = bezelMock("pixel-10-pro", "portrait");
    const turned = bezelMock("pixel-10-pro", "landscape");
    if (!upright?.image || !turned) throw new Error("no bezel");
    expect(turned.image).toEqual({ ...upright.image, turn: upright.width });
    expect(turned.width).toBeCloseTo(upright.height);
    expect(turned.inset.left).toBeCloseTo(upright.inset.top);
    expect(turned.width).toBeCloseTo(952 + turned.inset.left + turned.inset.right);
  });

  test("has none for a device without an image", () => {
    expect(bezelMock("ipad-mini", "portrait")).toBeNull();
    expect(bezelMock("none", "portrait")).toBeNull();
  });
});

describe("loadBezel", () => {
  test("fails where there is nothing to load an image with, and tries again later", () => {
    expect(loadBezel("iphone-air.webp", () => {})).toBe("failed");
    expect(bezelUrl("iphone-air.webp")).toBeNull();
    fakeImage(() => true);
    expect(loadBezel("iphone-air.webp", () => {})).toBe("loading");
  });

  test("fails for a file it does not know", () => {
    fakeImage(() => true);
    expect(loadBezel("iphone-3g.webp", () => {})).toBe("failed");
  });

  test("loads an image once, from the folder beside the module, and tells when it is in", async () => {
    const asked: string[] = [];
    fakeImage((src) => asked.push(src) > 0);
    let told = 0;
    const settled = () => told++;
    expect(loadBezel("iphone-17.webp", settled)).toBe("loading");
    expect(loadBezel("iphone-17.webp", settled)).toBe("loading");
    expect(bezelUrl("iphone-17.webp")).toBeNull();
    await Bun.sleep(0);
    expect(told).toBe(1);
    expect(loadBezel("iphone-17.webp", settled)).toBe("ready");
    expect(asked).toEqual([new URL("../src/engine/bezels/iphone-17.webp", import.meta.url).href]);
    expect(bezelUrl("iphone-17.webp")).toBe(asked[0] ?? "");
  });

  test("tries the page's own node_modules where the server will not serve the module's folder", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "https://app.test/pricing?plan=pro" },
    });
    const asked: string[] = [];
    fakeImage((src) => asked.push(src) > 1);
    let told = 0;
    expect(loadBezel("iphone-18-pro.webp", () => told++)).toBe("loading");
    await Bun.sleep(0);
    expect(told).toBe(1);
    const linked = "https://app.test/node_modules/devknobs/dist/bezels/iphone-18-pro.webp";
    expect(asked).toEqual([
      new URL("../src/engine/bezels/iphone-18-pro.webp", import.meta.url).href,
      linked,
    ]);
    expect(bezelUrl("iphone-18-pro.webp")).toBe(linked);
  });

  test("an image that does not load has failed for good, as with the folder deleted", async () => {
    fakeImage(() => false);
    let told = 0;
    expect(loadBezel("iphone-17-pro.webp", () => told++)).toBe("loading");
    await Bun.sleep(0);
    expect(told).toBe(1);
    expect(loadBezel("iphone-17-pro.webp", () => told++)).toBe("failed");
    expect(bezelUrl("iphone-17-pro.webp")).toBeNull();
    fakeImage(() => true);
    expect(loadBezel("iphone-17-pro.webp", () => told++)).toBe("failed");
  });
});

describe("bezelUrlsModule", () => {
  test("names each image in a static URL beside the module, so a bundler takes it along", () => {
    const source = bezelUrlsModule(["iphone-16.webp", "iphone-duo-inner-open-landscape.webp"]);
    expect(source).toContain(
      '"iphone-16.webp": () => new URL("./bezels/iphone-16.webp", import.meta.url).href,',
    );
    expect(source).toContain(
      'new URL("./bezels/iphone-duo-inner-open-landscape.webp", import.meta.url).href,',
    );
  });

  test("names no image without the folder, so no bundle asks for one", () => {
    expect(bezelFiles(new URL("../assets/nothing-here", import.meta.url).pathname)).toEqual([]);
    const source = bezelUrlsModule([]);
    expect(source).toContain("= {};");
    expect(source).not.toContain("./bezels/");
  });

  test("the committed module is the one the folder writes, every image in it", () => {
    const committed = readFileSync(new URL("../src/engine/bezelurls.ts", import.meta.url), "utf8");
    expect(committed).toBe(bezelUrlsModule(bezelFiles(FOLDER), foldShotsIn(FOLDER)));
    for (const { file } of SHOTS.map(([, , bezel]) => bezel)) {
      expect(committed).toContain(`"./bezels/${file}"`);
    }
  });
});

describe("the Duo's fold frames", () => {
  const MANIFEST = {
    open: [133.5, 377.45, 2853, 2005.12],
    scale: 0.5,
    frames: [180, 0].map((deg) => ({
      deg,
      file: `fold-${String(deg).padStart(3, "0")}.webp`,
      box: [76, 318, 1624, 2442],
      pieces: [
        [0, 0, 774, 44, 4, 4],
        [0, 44, 64, 972, 4, 56],
      ],
      inner: [[0, 0], [1, 0], [1, 1], [0, 1]],
      cover: [[0, 0], [1, 0], [1, 1], [0, 1]],
    })),
  };

  test.skipIf(!existsSync(FOLDER))("are each a file in assets/bezels/duo-fold, named in the module, with its corners", () => {
    const shots = foldShotsIn(FOLDER);
    expect(shots).toEqual(DUO_FOLD);
    const files = (shots?.frames ?? []).map((shot) => shot.file);
    expect(files).toHaveLength(31);
    // The manifest stays beside the packer: only the frames ship.
    expect([...readdirSync(`${FOLDER}/${FOLD_FOLDER}`)].sort()).toEqual(
      files.map((file) => file.slice(FOLD_FOLDER.length + 1)).sort(),
    );
    expect(bezelFiles(FOLDER).filter((file) => file.startsWith(`${FOLD_FOLDER}/`))).toEqual(files);
  });

  test("are read from the manifest, from open to shut, each file in their folder", () => {
    const shots = foldShotsOf(MANIFEST);
    expect(shots.open).toEqual([133.5, 377.45, 2853, 2005.12]);
    expect(shots.scale).toBe(0.5);
    expect(shots.frames.map((shot) => [shot.deg, shot.file])).toEqual([
      [0, "duo-fold/fold-000.webp"],
      [180, "duo-fold/fold-180.webp"],
    ]);
    expect(shots.frames[0]?.pieces).toEqual([
      [0, 0, 774, 44, 4, 4],
      [0, 44, 64, 972, 4, 56],
    ]);
  });

  test("are none without their folder, whatever the manifest says", () => {
    expect(foldShotsIn(new URL("../assets/nothing-here", import.meta.url).pathname)).toBeNull();
  });

  test("are refused where the manifest is not whole", () => {
    const [shut, open] = MANIFEST.frames;
    if (!shut || !open) throw new Error("no frames");
    expect(() => foldShotsOf(null)).toThrow();
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open] })).toThrow("no frames");
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open, { ...shut, deg: 174 }] })).toThrow("0 to 180");
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open, { ...shut, inner: [[0, 0]] }] })).toThrow("corners");
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open, { ...shut, file: "../x.webp" }] })).toThrow("file");
    expect(() => foldShotsOf({ ...MANIFEST, open: [0, 0, 1] })).toThrow("open");
    expect(() => foldShotsOf({ ...MANIFEST, scale: 0 })).toThrow("scale");
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open, { ...shut, pieces: [] }] })).toThrow("pieces");
    expect(() => foldShotsOf({ ...MANIFEST, frames: [open, { ...shut, pieces: [[0, 0, 1]] }] })).toThrow("piece");
  });

  test("are none in a module written without them", () => {
    expect(bezelUrlsModule([])).toContain("DUO_FOLD: FoldShots | null = null;");
    const source = bezelUrlsModule([], foldShotsOf(MANIFEST));
    expect(source).toContain('file: "duo-fold/fold-180.webp",');
    expect(source).toContain("scale: 0.5,");
    expect(source).toContain("pieces: [[0, 0, 774, 44, 4, 4], [0, 44, 64, 972, 4, 56]],");
  });

  /** An image that loads from the addresses `ok` says, and never decodes. */
  function fakeLoading(ok: (src: string) => boolean, asked: string[]): void {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decoded = false;
      #src = "";

      get src(): string {
        return this.#src;
      }

      set src(url: string) {
        this.#src = url;
        asked.push(url);
        queueMicrotask(() => (ok(url) ? this.onload : this.onerror)?.());
      }

      decode(): Promise<void> {
        this.decoded = true;
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, "Image", { configurable: true, value: FakeImage });
  }

  test("load each from the first address that does, in order, without decoding it", async () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "https://app.test/" },
    });
    const asked: string[] = [];
    fakeLoading((src) => src.includes("node_modules") || src.endsWith("fold-006.webp"), asked);
    const images = await loadAll(["duo-fold/fold-000.webp", "duo-fold/fold-006.webp"]);
    expect(images.map((image) => image.src)).toEqual([
      "https://app.test/node_modules/devknobs/dist/bezels/duo-fold/fold-000.webp",
      new URL("../src/engine/bezels/duo-fold/fold-006.webp", import.meta.url).href,
    ]);
    expect(asked).toHaveLength(3);
    expect(images.map((image) => Reflect.get(image, "decoded"))).toEqual([false, false]);
  });

  test("fail together where one loads from nowhere", async () => {
    fakeLoading((src) => !src.endsWith("fold-012.webp"), []);
    await expect(loadAll(["duo-fold/fold-000.webp", "duo-fold/fold-012.webp"])).rejects.toThrow("fold-012.webp");
    await expect(loadAll(["duo-fold/nothing.webp"])).rejects.toThrow();
  });
});
