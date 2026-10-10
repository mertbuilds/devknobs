/**
 * Copy a text, from inside the click that asked for it. The async clipboard
 * goes first, and where the page may not use it, a selection copied the old
 * way. Says whether it went.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard here, or no leave to write it: the old way may still work.
  }
  const holder = document.createElement("textarea");
  holder.value = text;
  holder.setAttribute("data-devknobs", "copy");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  try {
    document.body.append(holder);
    holder.select();
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    holder.remove();
  }
}
