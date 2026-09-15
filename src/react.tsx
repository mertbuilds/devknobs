"use client";

import { useEffect, useRef } from "react";
import { mount, type MountOptions, unmount } from "./index";

/**
 * Mount the knobs from a React tree. Renders nothing, so drop it anywhere and
 * render it in development only. Options are read once, on mount.
 */
export function DevKnobs(props: MountOptions): null {
  const options = useRef(props);
  useEffect(() => {
    mount(options.current);
    return unmount;
  }, []);
  return null;
}
