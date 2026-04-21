"use client";

import * as React from "react";
import { ReactLenis } from "lenis/react";
import type { LenisOptions } from "lenis";

type LenisProviderProps = {
  children: React.ReactNode;
};

export function LenisProvider({ children }: LenisProviderProps) {
  const [disableLenisOnMobile, setDisableLenisOnMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mobileTouchQuery = window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    );

    const updatePreference = () => {
      setDisableLenisOnMobile(mobileTouchQuery.matches);
    };

    updatePreference();
    mobileTouchQuery.addEventListener("change", updatePreference);

    return () => {
      mobileTouchQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  const options = React.useMemo<LenisOptions>(
    () => ({
      autoRaf: true,
      anchors: true,
      allowNestedScroll: true,
      lerp: 0.085,
      smoothWheel: true,
      syncTouch: true,
      syncTouchLerp: 0.08,
      touchMultiplier: 1,
      wheelMultiplier: 0.95,
      overscroll: true,
      stopInertiaOnNavigate: true,
      prevent: (node) =>
        node.classList.contains("crm-touch-scroll") ||
        node.hasAttribute("data-lenis-prevent") ||
        node.hasAttribute("data-lenis-prevent-touch") ||
        node.hasAttribute("data-lenis-prevent-wheel"),
    }),
    [],
  );

  if (disableLenisOnMobile) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={options}>
      {children}
    </ReactLenis>
  );
}
