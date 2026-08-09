import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ImportRunTracker from "../../src/lib/ImportRunTracker";

describe("ImportRunTracker resume behavior", () => {
  let store: any;

  beforeEach(() => {
    store = ImportRunTracker.emptyStore();
    vi.spyOn(ImportRunTracker, "getStore").mockImplementation(() => store);
    vi.spyOn(ImportRunTracker, "saveStore").mockImplementation(async (nextStore: any) => {
      store = nextStore;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resumes only pending/failed work items from a partial-failed run", async () => {
    const keys = ["item:1", "item:2", "item:3"];
    const run = ImportRunTracker.createRun("items", keys, null, { optionsHash: "abc" });
    store.runs.push(run);

    await ImportRunTracker.markItemStatus(run.id, "item:1", "succeeded");
    await ImportRunTracker.markItemStatus(run.id, "item:2", "failed", new Error("transient"));
    await ImportRunTracker.completeRun(run.id);

    const resumed = await ImportRunTracker.startOrResumeRun("items", keys, { optionsHash: "abc" });
    expect(resumed.id).toBe(run.id);

    const pendingOrFailed = ImportRunTracker.getPendingOrFailedKeys(run.id);
    expect(pendingOrFailed.has("item:1")).toBe(false);
    expect(pendingOrFailed.has("item:2")).toBe(true);
    expect(pendingOrFailed.has("item:3")).toBe(true);
  });

  it("tracks retry and resumable counters in run summary", async () => {
    const keys = ["item:10", "item:11"];
    const run = ImportRunTracker.createRun("items", keys, null, { optionsHash: "xyz" });
    store.runs.push(run);

    await ImportRunTracker.recordRetry(run.id, "item:10");
    await ImportRunTracker.recordRetry(run.id, "item:10");
    await ImportRunTracker.setResumableCount(run.id, 1);
    await ImportRunTracker.markItemStatus(run.id, "item:10", "succeeded");
    await ImportRunTracker.markItemStatus(run.id, "item:11", "skipped");
    await ImportRunTracker.completeRun(run.id);

    const summary = ImportRunTracker.getRunSummaryById(run.id);
    expect(summary).not.toBeNull();
    expect(summary?.counters.retried).toBe(2);
    expect(summary?.counters.resumable).toBe(1);
    expect(summary?.counters.succeeded).toBe(1);
    expect(summary?.counters.skipped).toBe(1);
    expect(summary?.counters.failed).toBe(0);
  });
});
