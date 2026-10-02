import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAutoGrowTextarea } from "./use-auto-grow-textarea";

/**
 * jsdom reports `scrollHeight` as 0 for every element, so it has to be stubbed. The stub below
 * deliberately is not a constant: it reports a different number depending on the element's current
 * height, because that is what a real browser does *and* it is exactly why the hook has to clear
 * the height before measuring. With a constant stub, an implementation that can only ever grow
 * would pass every one of these tests.
 */
function stubScrollHeight(element: HTMLElement, getContentHeight: () => number): void {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => {
      const current = element.style.height;
      // Height not cleared: the box can only ever report what it already is.
      return current === "auto" ? getContentHeight() : Number.parseFloat(current) || 0;
    },
  });
}

function Harness({ text }: { text: string }) {
  const ref = useAutoGrowTextarea<HTMLTextAreaElement>(text);
  return <textarea ref={ref} value={text} onChange={() => {}} readOnly />;
}

describe("useAutoGrowTextarea", () => {
  it("grows the box to the height its content needs", () => {
    // The first render measures jsdom's default scrollHeight of 0, so the stub is installed
    // afterwards and the measurement re-runs on the next value change. Every test here therefore
    // changes the value, because the hook depends on the value and nothing else.
    const { container, rerender } = render(<Harness text="first" />);
    const element = container.querySelector("textarea") as HTMLTextAreaElement;
    stubScrollHeight(element, () => 96);

    rerender(<Harness text="a much longer option" />);

    expect(element.style.height).toBe("96px");
  });

  it("shrinks again when the content gets shorter", () => {
    // The behaviour a naive implementation loses: measuring without clearing the height first can
    // only ever report the current box, so deleting text would leave the textarea stuck at its
    // tallest height with a large empty gap under the text.
    const { container, rerender } = render(<Harness text="first" />);
    const element = container.querySelector("textarea") as HTMLTextAreaElement;
    let contentHeight = 120;
    stubScrollHeight(element, () => contentHeight);

    rerender(<Harness text="a very long option" />);
    expect(element.style.height).toBe("120px");

    contentHeight = 32;
    rerender(<Harness text="ab" />);

    expect(element.style.height).toBe("32px");
  });

  it("re-measures when the value is set programmatically rather than typed", () => {
    // The bulk importer and the draft loader both fill the field without a keystroke. A hook that
    // listened for input events would leave the box at its previous height and hide most of the
    // pasted text, while looking completely normal to the user. Nothing dispatches an event in
    // these tests at all, which is the point: the value change alone has to do the work.
    const { container, rerender } = render(<Harness text="first" />);
    const element = container.querySelector("textarea") as HTMLTextAreaElement;
    stubScrollHeight(element, () => 88);

    rerender(<Harness text="imported from the bulk editor" />);

    expect(element.style.height).toBe("88px");
  });

  it("does not throw when nothing is rendered", () => {
    function Detached() {
      // The hook's ref stays null, so the layout effect has nothing to measure and must bail out.
      useAutoGrowTextarea("value");
      return <p>no textarea here</p>;
    }

    expect(() => render(<Detached />)).not.toThrow();
  });

  it("does not throw when the element unmounts between renders", () => {
    function Switching({ show }: { show: boolean }) {
      const ref = useAutoGrowTextarea<HTMLTextAreaElement>("text");
      return show ? <textarea ref={ref} value="text" onChange={() => {}} readOnly /> : <p>gone</p>;
    }

    const { rerender, container } = render(<Switching show />);
    expect(() => rerender(<Switching show={false} />)).not.toThrow();
    expect(container.querySelector("textarea")).toBeNull();
  });
});