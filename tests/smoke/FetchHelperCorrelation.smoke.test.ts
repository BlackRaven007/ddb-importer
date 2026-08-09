import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson } from "../../src/lib/FetchHelper";
import DDBRunContext from "../../src/lib/DDBRunContext";

describe("FetchHelper correlation propagation smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("injects x-correlation-id from DDBRunContext", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ success: true }),
    }));

    vi.stubGlobal("fetch", fetchSpy);

    await DDBRunContext.runWith({ correlationId: "cid-smoke-123" }, async () => {
      await fetchJson("https://example.invalid/test");
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const options = (fetchSpy.mock.calls[0]?.[1] as unknown) as RequestInit;
    const headers = new Headers(options.headers);
    expect(headers.get("x-correlation-id")).toBe("cid-smoke-123");
  });
});
