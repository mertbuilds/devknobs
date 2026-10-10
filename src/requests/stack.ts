/** How many frames of the caller's stack a row keeps. */
export const STACK_FRAMES = 12;

/** A frame, as V8 writes one (`at fn (file:1:2)`) or as the others do (`fn@file:1:2`). */
const FRAME = /^at |@/;

/**
 * The stack of the call that made a request, less the first `skip` frames,
 * which are devknobs' own. Kept as the engine wrote it, a frame a line.
 */
export function trimStack(stack: unknown, skip: number): string {
  if (typeof stack !== "string") return "";
  const lines = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  // V8 opens with the error's own line, which is no frame.
  if (lines[0] !== undefined && !FRAME.test(lines[0])) lines.shift();
  return lines.slice(skip, skip + STACK_FRAMES).join("\n");
}
