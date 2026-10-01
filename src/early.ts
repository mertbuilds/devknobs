import { early } from "./engine/media";
import { load } from "./engine/store";

/**
 * The optional early script. As the first script in `<head>` it applies the
 * stored scheme, motion, contrast and transparency before any page script runs, with no
 * panel. The full script takes these patches over when it mounts.
 */
const { scheme, motion, contrast, transparency } = load();
early({ scheme, motion, contrast, transparency });
