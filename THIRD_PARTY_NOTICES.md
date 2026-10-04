# third party notices

devknobs ships, or adapts code from, the projects below. each is under the MIT license, reproduced here. the iPhone bezel images at the end are not.

## bippy

https://github.com/aidenybai/bippy, bundled into the grab chunk and the global builds, so it is no dependency of the package. `src/grab/fiber.ts` adapts a few of its fiber helpers.

```
Copyright 2024-present Aiden Bai

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## react-grab

https://github.com/aidenybai/react-grab. the grab context format and the code in `src/grab/` marked as adapted from it.

```
MIT License

Copyright (c) 2025 Aiden Bai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## @jridgewell/sourcemap-codec

https://github.com/jridgewell/sourcemaps, bundled inside bippy for reading source maps.

```
Copyright 2024 Justin Ridgewell <justin@ridgewell.name>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Apple product bezels

the images in `assets/bezels`, copied to `dist/bezels` by the build, are Apple's product bezels for the iPhone 16, 16 Plus, 16 Pro, 16 Pro Max, 17, 17 Pro, 17 Pro Max, Air, 18 Pro, 18 Pro Max and Duo, from Apple Design Resources, converted to WebP by `scripts/bezels.sh` at their own size.

- https://developer.apple.com/design/resources/#product-bezels
- https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-16.dmg
- https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg
- https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-18.dmg
- https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-Duo.dmg

copyright Apple Inc. they are NOT covered by this project's MIT license, and Apple's own terms apply to them: the Apple Design Resources License for the 17, 18 and Duo packages and the App Store Marketing Artwork License Agreement for the 16 package.

to remove them, delete the `assets/bezels` folder and build. nothing else names a file in it but `src/engine/bezels.ts`, and without it every iPhone draws its own svg mock, as it does wherever an image does not load.
