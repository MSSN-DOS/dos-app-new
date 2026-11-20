import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOADER_MESSAGES, PageLoader, statusMessageAt } from "./page-loader";

describe("statusMessageAt", () => {
  const messages = ["one", "two", "three"] as const;

  it("walks the list in order", () => {
    expect(statusMessageAt(0, messages)).toBe("one");
    expect(statusMessageAt(1, messages)).toBe("two");
    expect(statusMessageAt(2, messages)).toBe("three");
  });

  it("wraps back to the start", () => {
    expect(statusMessageAt(3, messages)).toBe("one");
    expect(statusMessageAt(7, messages)).toBe("two");
  });

  it("stays in range for negative and fractional ticks", () => {
    // A negative modulo in JS returns a negative remainder; the loader must not
    // index off the end of the array because of it.
    expect(statusMessageAt(-1, messages)).toBe("three");
    expect(statusMessageAt(-6, messages)).toBe("one");
    expect(statusMessageAt(1.9, messages)).toBe("two");
  });

  it("renders nothing when there are no messages", () => {
    expect(statusMessageAt(0, [])).toBe("");
  });
});

describe("PageLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the status line through a polite live region", () => {
    render(<PageLoader />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(LOADER_MESSAGES[0]);
  });

  it("advances the status line every 1800ms", async () => {
    render(<PageLoader />);

    expect(screen.getByRole("status")).toHaveTextContent(LOADER_MESSAGES[0]);

    // Async act + advanceTimersByTimeAsync: the interval reschedules itself, so
    // the sync variant leaves the second update queued outside act and the
    // assertion reads the stale line.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });

    expect(screen.getByRole("status")).toHaveTextContent(LOADER_MESSAGES[1]);
  });

  it("names the role that is booting", () => {
    render(<PageLoader role="teacher" />);

    expect(screen.getByText("Teacher")).toBeInTheDocument();
  });

  it("fills the viewport for auth gates and stays inline for route bodies", () => {
    const { unmount } = render(<PageLoader fullScreen />);
    expect(screen.getByRole("status")).toHaveClass("min-h-dvh");
    unmount();

    render(<PageLoader />);
    expect(screen.getByRole("status")).not.toHaveClass("min-h-dvh");
  });

  it("accepts honest route-specific status lines", () => {
    render(<PageLoader messages={["Loading the leaderboard"]} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading the leaderboard");
  });
});
