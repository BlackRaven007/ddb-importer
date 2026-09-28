import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson } from "../../src/lib/FetchHelper";

describe("FetchHelper correlation propagation smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards request options to fetch", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (_url, options) => {
      expect(options?.headers).toMatchObject({ "x-test-header": "smoke" });
      return Response.json({ success: true });
    });

    vi.stubGlobal("fetch", fetchSpy);

    await fetchJson("https://example.invalid/test", {
      headers: { "x-test-header": "smoke" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
