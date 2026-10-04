import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { BEZELS, type Bezel, bezelMock, bezelUrl, loadBezel } from "../src/engine/bezels";
import { DEVICES, deviceOf, turn } from "../src/engine/devices";
import { mockOf, placeIn } from "../src/engine/mock";
import { fit, STRIP } from "../src/engine/width";

const FOLDER = new URL("../assets/bezels", import.meta.url).pathname;

/** Every image with its device and the way it is held. */
const SHOTS = Object.entries(BEZELS).flatMap(([id, { portrait, landscape }]) => {
  const upright: [string, "portrait" | "landscape", Bezel][] = [[id, "portrait", portrait]];
  return landscape ? [...upright, [id, "landscape", landscape] as (typeof upright)[number]] : upright;
});

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
  test("every iPhone but the SE has an image, and nothing else does", () => {
    const ids = DEVICES.filter((device) => device.ua === "iphone-safari" && device.id !== "iphone-se");
    expect(Object.keys(BEZELS).sort()).toEqual(ids.map((device) => device.id).sort());
    expect(SHOTS).toHaveLength(13);
    expect(new Set(SHOTS.map(([, , shot]) => shot.file)).size).toBe(13);
  });

  test("each opening is its device's screen at 3 image px per css px, never stretched", () => {
    for (const [id, way, shot] of SHOTS) {
      const device = deviceOf(id);
      if (!device) throw new Error(`no device ${id}`);
      const screen = turn(device, way);
      const [left, top, width, height] = shot.opening;
      expect(Math.abs(width / 3 - screen.width)).toBeLessThan(0.5);
      expect(Math.abs(height / 3 - screen.height)).toBeLessThan(0.5);
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
      expect(Math.abs(sensor.x - drawn.inset.left - (left - x) / 3)).toBeLessThan(1);
      expect(Math.abs(sensor.y - drawn.inset.top - (top - y) / 3)).toBeLessThan(1);
      expect(Math.abs(sensor.width - width / 3)).toBeLessThan(1);
      expect(Math.abs(sensor.height - height / 3)).toBeLessThan(1);
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
    expect(readdirSync(FOLDER).sort()).toEqual(files);
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
      const device = deviceOf(id);
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
      const device = deviceOf(id);
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

  test("has none for a device without an image", () => {
    expect(bezelMock("iphone-se", "portrait")).toBeNull();
    expect(bezelMock("pixel-9", "portrait")).toBeNull();
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
