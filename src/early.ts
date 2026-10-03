import { early as earlyClock } from "./engine/clock";
import { isDevknobsFrame, nativeScheme } from "./engine/frame";
import { early } from "./engine/media";
import { load } from "./engine/store";
import { apply as earlyUa } from "./engine/ua";

/**
 * The optional early script. As the first script in `<head>` it applies the
 * stored scheme, motion, contrast and transparency, the clock and the user
 * agent, before any page script runs, with no panel. The full script takes
 * these patches over when it mounts.
 */
const stored = load();
// In a frame that gets the scheme natively, the patch steps aside, as in the full script.
const scheme = isDevknobsFrame() && nativeScheme(stored.scheme) ? "system" : stored.scheme;
const { motion, contrast, transparency } = stored;
early({ scheme, motion, contrast, transparency });
earlyClock(stored.clock);
earlyUa(stored.ua);
