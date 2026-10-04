import { copyGrab } from "./clipboard";
import { grabContext } from "./context";
import type { GrabOptions, GrabPayload } from "./types";

export { startMode } from "./mode";

/** Build the elements' context and copy it. Null when nothing was copied. */
export async function grab(
  elements: Element[],
  options: GrabOptions = {},
): Promise<GrabPayload | null> {
  const payload = await grabContext(elements, options);
  if (!payload.content.trim()) return null;
  return (await copyGrab(payload)) ? payload : null;
}
