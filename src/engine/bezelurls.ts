// Written by scripts/bezelurls.ts from assets/bezels: run `bun run build` after changing the folder.

/** Where each image is, beside the built module. */
export const BEZEL_URLS: Record<string, () => string> = {
  "iphone-16-plus.webp": () => new URL("./bezels/iphone-16-plus.webp", import.meta.url).href,
  "iphone-16-pro-max.webp": () => new URL("./bezels/iphone-16-pro-max.webp", import.meta.url).href,
  "iphone-16-pro.webp": () => new URL("./bezels/iphone-16-pro.webp", import.meta.url).href,
  "iphone-16.webp": () => new URL("./bezels/iphone-16.webp", import.meta.url).href,
  "iphone-17-pro-max.webp": () => new URL("./bezels/iphone-17-pro-max.webp", import.meta.url).href,
  "iphone-17-pro.webp": () => new URL("./bezels/iphone-17-pro.webp", import.meta.url).href,
  "iphone-17.webp": () => new URL("./bezels/iphone-17.webp", import.meta.url).href,
  "iphone-18-pro-max.webp": () => new URL("./bezels/iphone-18-pro-max.webp", import.meta.url).href,
  "iphone-18-pro.webp": () => new URL("./bezels/iphone-18-pro.webp", import.meta.url).href,
  "iphone-air.webp": () => new URL("./bezels/iphone-air.webp", import.meta.url).href,
  "iphone-duo-inner-open-landscape.webp": () =>
    new URL("./bezels/iphone-duo-inner-open-landscape.webp", import.meta.url).href,
  "iphone-duo-inner-open-portrait.webp": () =>
    new URL("./bezels/iphone-duo-inner-open-portrait.webp", import.meta.url).href,
  "iphone-duo-outer-closed.webp": () =>
    new URL("./bezels/iphone-duo-outer-closed.webp", import.meta.url).href,
  "iphone-se.webp": () => new URL("./bezels/iphone-se.webp", import.meta.url).href,
  "pixel-10-pro-xl.webp": () => new URL("./bezels/pixel-10-pro-xl.webp", import.meta.url).href,
  "pixel-10-pro.webp": () => new URL("./bezels/pixel-10-pro.webp", import.meta.url).href,
  "pixel-10.webp": () => new URL("./bezels/pixel-10.webp", import.meta.url).href,
  "pixel-10a.webp": () => new URL("./bezels/pixel-10a.webp", import.meta.url).href,
  "pixel-9-pro-xl.webp": () => new URL("./bezels/pixel-9-pro-xl.webp", import.meta.url).href,
  "pixel-9-pro.webp": () => new URL("./bezels/pixel-9-pro.webp", import.meta.url).href,
  "pixel-9.webp": () => new URL("./bezels/pixel-9.webp", import.meta.url).href,
};
