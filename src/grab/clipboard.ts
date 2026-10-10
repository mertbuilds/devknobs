// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
import { copyText } from "./copy";
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

/** Copy a grab, in all its formats. Where those cannot go, only its text does. */
export function copyGrab(payload: GrabPayload): Promise<boolean> {
  return copyText(payload.content, clipboardData(payload));
}
