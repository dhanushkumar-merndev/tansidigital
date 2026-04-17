"use client";

import * as React from "react";
import { ReactLenis } from "lenis/react";

type LenisProviderProps = {
  children: React.ReactNode;
};

export function LenisProvider({ children }: LenisProviderProps) {
  return (
    <ReactLenis
      root
      options={{
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
      }}
    >
      {children}
    </ReactLenis>
  );
}
