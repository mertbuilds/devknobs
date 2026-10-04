import { describe, expect, test } from "bun:test";
import { DEVICES, turn } from "../src/engine/devices";
import { mockOf } from "../src/engine/mock";

function kinds(id: string): string[] {
  return mockOf(id, "portrait")?.parts.map((part) => part.kind) ?? [];
}

describe("mockOf", () => {
  test("draws phones and tablets, and nothing for laptops, desktops or no device", () => {
    for (const device of DEVICES) {
      const handheld = device.kind === "phone" || device.kind === "tablet";
      expect(mockOf(device.id, "portrait") !== null).toBe(handheld);
      expect(mockOf(device.id, "landscape") !== null).toBe(handheld);
    }
    expect(mockOf("none", "portrait")).toBeNull();
    expect(mockOf("pixel-42", "portrait")).toBeNull();
  });

  test("keeps its corners concentric: the body's radius is the screen's and the bezel", () => {
    expect(mockOf("iphone-16-pro", "portrait")).toMatchObject({ screenRadius: 55, bodyRadius: 67 });
    expect(mockOf("pixel-9", "portrait")).toMatchObject({ screenRadius: 44, bodyRadius: 54 });
    expect(mockOf("ipad-air-11", "portrait")).toMatchObject({ screenRadius: 18, bodyRadius: 42 });
    // Thick top and bottom: the sides, the thinnest bezel, set the body's corners.
    expect(mockOf("iphone-se", "portrait")).toMatchObject({ screenRadius: 4, bodyRadius: 22 });
  });

  test("is the screen and the room around it, either way up", () => {
    for (const device of DEVICES) {
      for (const way of ["portrait", "landscape"] as const) {
        const mock = mockOf(device.id, way);
        if (!mock) continue;
        const size = turn(device, way);
        expect(mock.width).toBe(size.width + mock.inset.left + mock.inset.right);
        expect(mock.height).toBe(size.height + mock.inset.top + mock.inset.bottom);
        expect(mock.body.x + mock.body.width).toBeLessThanOrEqual(mock.width);
        expect(mock.body.y + mock.body.height).toBeLessThanOrEqual(mock.height);
      }
    }
    expect(mockOf("iphone-16-pro", "portrait")).toMatchObject({
      width: 402 + 28,
      height: 874 + 24,
      inset: { top: 12, right: 14, bottom: 12, left: 14 },
      body: { x: 2, y: 0, width: 426, height: 898 },
    });
    expect(mockOf("iphone-16-pro", "landscape")).toMatchObject({
      width: 874 + 24,
      height: 402 + 28,
      inset: { top: 14, right: 12, bottom: 14, left: 12 },
      body: { x: 0, y: 2, width: 898, height: 426 },
    });
    expect(mockOf("iphone-se", "landscape")?.inset).toEqual({
      top: 18,
      right: 100,
      bottom: 18,
      left: 100,
    });
  });

  test("gives each family its own parts", () => {
    expect(kinds("iphone-16")).toEqual(["sensor", "button", "button", "button", "button"]);
    expect(kinds("iphone-se")).toEqual(["sensor", "ring"]);
    expect(kinds("galaxy-s25")).toEqual(["sensor"]);
    expect(kinds("ipad-mini")).toEqual(["sensor"]);
  });

  test("puts the island over the top of the screen, and a turn puts it on the left", () => {
    const upright = mockOf("iphone-16-pro", "portrait");
    const island = upright?.parts[0];
    expect(island).toMatchObject({ width: 125, height: 36, radius: 18, y: 12 + 11 });
    expect((island?.x ?? 0) * 2 + 125).toBe(upright?.width ?? 0);
    const turned = mockOf("iphone-16-pro", "landscape")?.parts[0];
    expect(turned).toMatchObject({ x: 12 + 11, width: 36, height: 125, radius: 18 });
    expect((turned?.y ?? 0) * 2 + 125).toBe(402 + 28);
  });

  test("keeps the punch hole on the screen and the tablet's camera on the bezel", () => {
    const hole = mockOf("pixel-9", "portrait")?.parts[0];
    expect(hole).toMatchObject({ width: 12, height: 12, radius: 6, y: 10 + 14 });
    const camera = mockOf("ipad-pro-13", "portrait")?.parts[0];
    expect(camera).toMatchObject({ width: 6, height: 6 });
    expect((camera?.y ?? 0) + 6).toBeLessThanOrEqual(24);
  });

  test("puts the home button in the bottom bezel and the speaker in the top one", () => {
    const mock = mockOf("iphone-se", "portrait");
    const [speaker, home] = mock?.parts ?? [];
    expect((speaker?.y ?? 0) + (speaker?.height ?? 0)).toBeLessThanOrEqual(100);
    expect(home?.y ?? 0).toBeGreaterThanOrEqual(100 + 667);
    expect((home?.y ?? 0) + (home?.height ?? 0)).toBeLessThanOrEqual(mock?.height ?? 0);
  });

  test("hangs the buttons on the body's edge", () => {
    const mock = mockOf("iphone-16-pro-max", "portrait");
    for (const part of mock?.parts.filter((entry) => entry.kind === "button") ?? []) {
      const left = part.x < (mock?.body.x ?? 0);
      const right = part.x + part.width > (mock?.body.x ?? 0) + (mock?.body.width ?? 0);
      expect(left || right).toBe(true);
    }
  });
});
