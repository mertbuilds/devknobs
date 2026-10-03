import { early as earlyClock } from "./engine/clock";
import { hasTouch } from "./engine/devices";
import { isDevknobsFrame, nativeScheme } from "./engine/frame";
import { early } from "./engine/media";
import { load } from "./engine/store";

/**
 * The optional early script. As the first script in `<head>` it applies the
 * stored scheme, motion, contrast and transparency, a device's pointer and
 * hover in its frame, and the clock, before any page script runs, with no
 * panel. The full script takes these patches over when it mounts.
 */
const stored = load();
const inFrame = isDevknobsFrame();
// In a frame that gets the scheme natively, the patch steps aside, as in the full script.
const scheme = inFrame && nativeScheme(stored.scheme) ? "system" : stored.scheme;
const { motion, contrast, transparency } = stored;
early({ scheme, motion, contrast, transparency, touch: inFrame && hasTouch(stored.device) });
earlyClock(stored.clock);
