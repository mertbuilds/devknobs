import { describe, expect, test } from "bun:test";
import { DEVICES, turn } from "../src/engine/devices";
import { type Mock, mockOf, type Part } from "../src/engine/mock";

function kinds(id: string): string[] {
  return mockOf(id, "portrait")?.parts.map((part) => part.kind) ?? [];
}

function parts(mock: Mock | null, kind: Part["kind"]): Part[] {
  return mock?.parts.filter((part) => part.kind === kind) ?? [];
}

/** A part's center, in the mock. */
function center(part: Part | undefined): { x: number; y: number } {
  const { x = 0, y = 0, width = 0, height = 0 } = part ?? {};
  return { x: x + width / 2, y: y + height / 2 };
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

  test("gives each device its own radii, not the screen's and the bezel", () => {
    expect(mockOf("iphone-16", "portrait")).toMatchObject({ screenRadius: 55, bodyRadius: 75.5 });
    expect(mockOf("iphone-16-pro", "portrait")).toMatchObject({
      screenRadius: 62,
      bodyRadius: 77.9,
    });
    expect(mockOf("pixel-9", "portrait")).toMatchObject({ screenRadius: 50.3, bodyRadius: 72 });
    expect(mockOf("ipad-air-11", "portrait")).toMatchObject({ screenRadius: 18, bodyRadius: 66.5 });
    // A square screen in a very round body.
    expect(mockOf("iphone-se", "portrait")).toMatchObject({ screenRadius: 0, bodyRadius: 65.6 });
  });

  test("is the screen and the room around it, either way up", () => {
    for (const device of DEVICES) {
      for (const way of ["portrait", "landscape"] as const) {
        const mock = mockOf(device.id, way);
        if (!mock) continue;
        const size = turn(device, way);
        expect(mock.width).toBe(size.width + mock.inset.left + mock.inset.right);
        expect(mock.height).toBe(size.height + mock.inset.top + mock.inset.bottom);
        expect(mock.body.x + mock.body.width).toBeLessThanOrEqual(mock.width + 1e-9);
        expect(mock.body.y + mock.body.height).toBeLessThanOrEqual(mock.height + 1e-9);
      }
    }
    // The buttons on both sides stand 2.7 px out of the body.
    const upright = mockOf("iphone-16-pro", "portrait");
    expect(upright?.bezel).toEqual({ top: 14.7, right: 14.7, bottom: 14.4, left: 14.7 });
    expect(upright?.inset).toEqual({
      top: 14.7,
      right: 14.7 + 2.7,
      bottom: 14.4,
      left: 14.7 + 2.7,
    });
    expect(upright?.width).toBeCloseTo(431.4 + 5.4);
    expect(upright?.height).toBeCloseTo(903.1);
    expect(upright?.body).toMatchObject({ x: 2.7, y: 0 });
    expect(upright?.body.width).toBeCloseTo(431.4);
    expect(upright?.body.height).toBeCloseTo(903.1);
    const turned = mockOf("iphone-16-pro", "landscape");
    expect(turned?.inset).toEqual({ top: 14.7 + 2.7, right: 14.4, bottom: 14.7 + 2.7, left: 14.7 });
    expect(turned?.width).toBe(upright?.height ?? 0);
    expect(turned?.height).toBe(upright?.width ?? 0);
    expect(turned?.body.x).toBe(0);
    expect(turned?.body.y).toBeCloseTo(2.7);
    expect(mockOf("iphone-se", "landscape")?.bezel).toEqual({
      top: 28.1,
      right: 110.3,
      bottom: 28.1,
      left: 110.2,
    });
  });

  test("gives each device its own parts", () => {
    expect(kinds("iphone-16")).toEqual([...Array(5).fill("button"), "sensor"]);
    expect(kinds("iphone-se")).toEqual([...Array(4).fill("button"), "slot", "lens", "home", "key"]);
    expect(kinds("galaxy-s25")).toEqual(["button", "button", "sensor"]);
    expect(kinds("ipad-mini")).toEqual(["button", "button", "button", "lens"]);
  });

  test("draws the iPhone SE from its drawing", () => {
    const mock = mockOf("iphone-se", "portrait");
    expect(mock?.bezel).toEqual({ top: 110.2, right: 28.1, bottom: 110.3, left: 28.1 });
    expect(mock?.body.width).toBeCloseTo(431.2);
    expect(mock?.body.height).toBeCloseTo(887.5);
    const screen = { x: mock?.inset.left ?? 0, y: mock?.inset.top ?? 0 };
    // The home button sits on the center line, 51 px under the screen.
    const [home] = parts(mock, "home");
    expect(home).toMatchObject({ width: 69.9, height: 69.9 });
    expect(center(home).x - screen.x).toBeCloseTo(187.5);
    expect(center(home).y - screen.y).toBeCloseTo(718);
    const [key] = parts(mock, "key");
    expect(center(key)).toEqual(center(home));
    expect(key?.width).toBe(60);
    const [slot] = parts(mock, "slot");
    expect(slot).toMatchObject({ width: 76.1, height: 7.7, radius: 3.85 });
    expect(center(slot).x - screen.x).toBeCloseTo(187.5, 0);
    expect(slot?.y).toBeCloseTo(screen.y - 55.4);
    const [lens] = parts(mock, "lens");
    expect(center(lens).x - screen.x).toBeCloseTo(119.3);
    expect(center(lens).y - screen.y).toBeCloseTo(-51.5);
    // The ring switch, both volume keys on the left, the side button on the right.
    const buttons = parts(mock, "button");
    expect(buttons.map((part) => part.y)).toEqual([94.6, 187.5, 268.3, 188]);
    expect(buttons.map((part) => part.height)).toEqual([36, 68.1, 68.1, 68.1]);
    expect(buttons.map((part) => part.x < (mock?.body.x ?? 0))).toEqual([true, true, true, false]);
  });

  test("draws the iPhone 16 Pro's island and buttons where they are, Camera Control too", () => {
    const mock = mockOf("iphone-16-pro", "portrait");
    const screen = { x: mock?.inset.left ?? 0, y: mock?.inset.top ?? 0 };
    const [island] = parts(mock, "sensor");
    expect(island).toMatchObject({ width: 125.2, height: 36.7, radius: 18.35 });
    expect((island?.x ?? 0) - screen.x).toBeCloseTo(138.4);
    expect((island?.y ?? 0) - screen.y).toBeCloseTo(13.5);
    const buttons = parts(mock, "button");
    expect(buttons.map((part) => [part.y, part.height])).toEqual([
      [185, 41.7],
      [257.4, 67.6],
      [343.2, 67.6],
      [280.7, 106.9],
      [541.3, 103.3],
    ]);
    // Camera Control sits nearly flush with the band.
    const right = (mock?.body.x ?? 0) + (mock?.body.width ?? 0);
    expect((buttons[3]?.x ?? 0) + (buttons[3]?.width ?? 0) - right).toBeCloseTo(2.7);
    expect((buttons[4]?.x ?? 0) + (buttons[4]?.width ?? 0) - right).toBeCloseTo(1);
  });

  test("draws the Pixel 9's punch hole from its display config", () => {
    const mock = mockOf("pixel-9", "portrait");
    const [hole] = parts(mock, "sensor");
    expect(hole).toMatchObject({ width: 32, height: 32, radius: 16 });
    expect(center(hole).x - (mock?.inset.left ?? 0)).toBeCloseTo(205.5);
    expect(center(hole).y - (mock?.inset.top ?? 0)).toBeCloseTo(33);
    expect(mock?.bezel).toEqual({ top: 21.9, right: 22.2, bottom: 21.9, left: 22.2 });
  });

  test("puts the iPad Air's camera on the right long edge, and the top button on top", () => {
    const mock = mockOf("ipad-air-11", "portrait");
    expect(mock?.bezel).toEqual({ top: 53.5, right: 53.9, bottom: 53.5, left: 53.9 });
    const screen = { x: mock?.inset.left ?? 0, y: mock?.inset.top ?? 0 };
    const [lens] = parts(mock, "lens");
    expect(center(lens).x - screen.x).toBeCloseTo(850.5);
    expect(center(lens).y - screen.y).toBeCloseTo(540.6);
    expect(center(lens).x).toBeGreaterThan(screen.x + 820);
    const [top, up, down] = parts(mock, "button");
    expect(top).toMatchObject({ y: 0, width: 89, height: 5 });
    expect((top?.x ?? 0) - (mock?.body.x ?? 0)).toBeCloseTo(772.9);
    expect(up).toMatchObject({ y: 2.5 + 75.1, height: 52.3 });
    expect(down).toMatchObject({ y: 2.5 + 137.8, height: 52.3 });
  });

  test("turns every part with the body, so the top of the device is on the left", () => {
    const upright = mockOf("iphone-16-pro", "portrait");
    const turned = mockOf("iphone-16-pro", "landscape");
    const width = upright?.width ?? 0;
    for (const [index, part] of (upright?.parts ?? []).entries()) {
      expect(turned?.parts[index]).toEqual({
        ...part,
        x: part.y,
        y: width - part.x - part.width,
        width: part.height,
        height: part.width,
      });
    }
    // The island goes to the left, the left buttons to the bottom, the right ones to the top.
    const [island] = parts(turned, "sensor");
    expect(island).toMatchObject({ width: 36.7, height: 125.2 });
    expect(island?.x).toBeCloseTo((turned?.inset.left ?? 0) + 13.5);
    const bottom = (turned?.body.y ?? 0) + (turned?.body.height ?? 0);
    const [action, , , side, control] = parts(turned, "button");
    expect(action?.y ?? 0).toBeGreaterThan(bottom - 2.7 - 1e-9);
    expect(action?.x).toBeCloseTo(185);
    expect(side?.y).toBeCloseTo(0);
    expect(control?.y).toBeCloseTo(2.7 - 1);
    // The iPad Air's camera goes to the top long edge.
    const [lens] = parts(mockOf("ipad-air-11", "landscape"), "lens");
    expect(center(lens).y).toBeLessThan(mockOf("ipad-air-11", "landscape")?.inset.top ?? 0);
  });

  test("hangs the buttons on the body's edge", () => {
    for (const device of DEVICES) {
      const mock = mockOf(device.id, "portrait");
      if (!mock) continue;
      const { body } = mock;
      for (const part of parts(mock, "button")) {
        const out =
          part.x < body.x || part.x + part.width > body.x + body.width || part.y < body.y;
        expect(out).toBe(true);
      }
    }
  });
});
