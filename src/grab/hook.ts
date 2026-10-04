/**
 * Put a React devtools hook in place before React loads, so React reports its
 * renderers to it. A hook already there, such as the devtools extension's, is
 * left alone. The hook only lands after the early script, in a microtask, which
 * is still before any later script runs.
 */
export function installHook(): void {
  if (Object.hasOwn(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__")) return;
  void import("bippy/install-hook-only");
}
