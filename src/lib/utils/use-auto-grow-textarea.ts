"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Makes a `<textarea>` grow to fit its content, in both directions.
 *
 * WHY THIS EXISTS
 * ---------------
 * Option text is allowed to be 1000 characters, but it was being edited in a single-line
 * `<Input>`. A long option therefore scrolled horizontally off the right edge of the field with
 * no way to see the tail, and the teacher had to guess whether their text had wrapped. The
 * validation allows the length; the control has to be able to *show* it.
 *
 * WHY IT DEPENDS ON `value`, NOT ON AN INPUT EVENT
 * -----------------------------------------------
 * An `onInput` listener only ever runs on user keystrokes, so a textarea filled programmatically
 * — a pasted row from the bulk importer, a form reset, loading a draft for editing — keeps the
 * stale height of whatever it used to contain. Depending on the value covers every path that can
 * change the content, including the ones nobody thinks about.
 *
 * WHY IT RESETS TO `"auto"` FIRST
 * ------------------------------
 * Assigning `scrollHeight` directly can only ever *grow* the box, because the current height
 * constrains `scrollHeight`. Measuring with the height released is what lets it shrink back down.
 * Without that first assignment, deleting text leaves the field at its tallest old height.
 *
 * `scrollHeight` measures the laid-out content box, so this needs no assumptions about line
 * height, padding, or border width — which is what makes it survive a change to those tokens.
 */
export function useAutoGrowTextarea<T extends HTMLTextAreaElement>(
  value: string | number | readonly string[] | undefined,
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return ref;
}