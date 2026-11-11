/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoUnavailableError } from "./demo-unavailable";
import { useAction } from "./use-action";

describe("useAction", () => {
  it("marks a DemoUnavailableError as unavailable, and still as not saved", async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      await result.current.run(() => Promise.reject(new DemoUnavailableError()));
    });
    expect(result.current.unavailable).toBe(true);
    expect(result.current.failed).toBe(true);
  });

  it("marks any other error as failed only", async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error("boom")));
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.unavailable).toBe(false);
  });

  it("clears both flags on success", async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      await result.current.run(() => Promise.reject(new DemoUnavailableError()));
    });
    await act(async () => {
      await result.current.run(() => Promise.resolve());
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.unavailable).toBe(false);
  });
});
