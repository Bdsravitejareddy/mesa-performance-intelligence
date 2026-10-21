// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { LmsSyncAction } from "./lms-sync-action";

describe("LMS sync action", () => {
  afterEach(() => { vi.unstubAllGlobals(); refresh.mockReset(); });

  it("refreshes imported marks after a successful partial sync", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "partial", message: "Imported marks; some assignments were skipped." }),
    }));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(LmsSyncAction)));
    await act(async () => host.querySelector("button")!.click());
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
