// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { escapeText } from "./preview";
import type { GrabEntry, GrabPayload } from "./types";

export const DEVKNOBS_TYPE = "application/x-devknobs-grab";

/** react-grab's own type, which agents that paste from it already read. */
export const REACT_GRAB_TYPE = "application/x-react-grab";

interface ReactGrabEntry {
  tagName?: string;
  componentName?: string;
  content: string;
  source?: GrabEntry["source"];
  stackContext?: string;
  frames?: GrabEntry["frames"];
}

/** Every format a grab puts on the clipboard, by type. */
export function clipboardData(payload: GrabPayload, now = Date.now()): Record<string, string> {
  const entries: ReactGrabEntry[] = payload.entries.map((entry) => ({
    tagName: entry.tagName,
    componentName: entry.componentName,
    content: entry.content,
    source: entry.source,
    stackContext: entry.stackContext,
    frames: entry.frames,
  }));
  return {
    "text/plain": payload.content,
    "text/html": `<meta charset='utf-8'><pre><code>${escapeText(payload.content)}</code></pre>`,
    [DEVKNOBS_TYPE]: JSON.stringify({ ...payload, timestamp: now }),
    [REACT_GRAB_TYPE]: JSON.stringify({
      version: "devknobs",
      content: payload.content,
      entries,
      timestamp: now,
    }),
  };
}

/**
 * Copy a grab, in all its formats. `execCommand("copy")` runs right away,
 * inside the click or key that asked for it, and a `copy` handler fills in
 * the types. Where that fails, only the text goes, through the async api.
 */
export async function copyGrab(payload: GrabPayload): Promise<boolean> {
  const data = clipboardData(payload);
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    for (const [type, value] of Object.entries(data)) event.clipboardData?.setData(type, value);
  };
  const textarea = document.createElement("textarea");
  textarea.value = payload.content;
  textarea.setAttribute("data-devknobs", "grab");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.addEventListener("copy", onCopy);
  let copied = false;
  try {
    document.body.append(textarea);
    textarea.select();
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.removeEventListener("copy", onCopy);
    textarea.remove();
  }
  if (copied) return true;
  try {
    await navigator.clipboard.writeText(payload.content);
    return true;
  } catch {
    return false;
  }
}
