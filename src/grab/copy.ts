/**
 * Put text on the clipboard, with more formats of it where `data` has them,
 * by type. `execCommand("copy")` runs right away, inside the click or key
 * that asked for it, and a `copy` handler fills in the types. Where that
 * fails, only the text goes, through the async api.
 */
export async function copyText(
  text: string,
  data: Record<string, string> = { "text/plain": text },
): Promise<boolean> {
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    for (const [type, value] of Object.entries(data)) event.clipboardData?.setData(type, value);
  };
  const textarea = document.createElement("textarea");
  textarea.value = text;
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
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
