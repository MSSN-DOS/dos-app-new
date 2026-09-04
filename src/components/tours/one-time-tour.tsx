"use client";

import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "./one-time-tour.css";
import { apiFetch } from "@/lib/auth/client-fetch";

export interface OneTimeTourProps {
  tourKey: string;
  steps: DriveStep[];
  delayMs?: number;
}

const activeTours = new Set<string>();

export function OneTimeTour({ tourKey, steps, delayMs = 800 }: OneTimeTourProps) {
  const instanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (activeTours.has(tourKey)) return;
    activeTours.add(tourKey);

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let started = false;

    const markSeen = () => {
      if (completedRef.current || cancelled) return;
      completedRef.current = true;
      void apiFetch<{ data: { seen: boolean } }>("/tours", {
        method: "POST",
        body: JSON.stringify({ tourKey }),
      }).catch(() => undefined);
    };

    const launch = () => {
      if (cancelled || started) return;
      started = true;
      const instance = driver({
        animate: true,
        allowClose: true,
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        showButtons: ["next", "previous", "close"],
        popoverClass: "dos-tour-popover",
        overlayOpacity: 0.55,
        stagePadding: 8,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        onDestroyed: () => {
          instanceRef.current = null;
          markSeen();
        },
        steps,
      });
      instanceRef.current = instance;
      instance.drive();
    };

    let tries = 0;
    const start = () => {
      if (cancelled) return;
      const allPresent = steps.every(
        (step) => !step.element || document.querySelector(step.element as string),
      );
      if (allPresent) {
        launch();
        return;
      }
      tries += 1;
      if (tries <= 4) timers.push(setTimeout(start, 800));
    };

    void apiFetch<{ data: { seen: boolean } }>(
      `/tours?tourKey=${encodeURIComponent(tourKey)}`,
    )
      .then((res) => {
        if (cancelled || res.data.seen) return;
        timers.push(setTimeout(start, delayMs));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      instanceRef.current?.destroy();
      instanceRef.current = null;
      activeTours.delete(tourKey);
    };
    // steps is expected to be a module-level constant per route; delayMs is a stable default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);

  return null;
}
