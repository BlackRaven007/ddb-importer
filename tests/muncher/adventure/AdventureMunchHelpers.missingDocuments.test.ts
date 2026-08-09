import { describe, it, expect, vi, afterEach } from "vitest";
import AdventureMunchHelpers from "../../../src/muncher/adventure/AdventureMunchHelpers";
import ImportRunTracker from "../../../src/lib/ImportRunTracker";

describe("AdventureMunchHelpers missing documents checkpointing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes only pending missing ids when resuming", async () => {
    vi.spyOn(AdventureMunchHelpers, "getMissingIds").mockResolvedValue([101, 102, 103]);
    vi.spyOn(ImportRunTracker, "startOrResumeRun").mockResolvedValue({ id: "run-1" } as any);
    vi.spyOn(ImportRunTracker, "getPendingOrFailedKeys").mockReturnValue(new Set(["item:102", "item:103"]));

    const markSpy = vi.spyOn(ImportRunTracker, "markItemStatus").mockResolvedValue();
    const resumableSpy = vi.spyOn(ImportRunTracker, "setResumableCount").mockResolvedValue();
    const completeSpy = vi.spyOn(ImportRunTracker, "completeRun").mockResolvedValue();
    vi.spyOn(ImportRunTracker, "getRunSummaryById").mockReturnValue(null);

    const imported: number[] = [];
    vi.spyOn(AdventureMunchHelpers, "importMissingDocumentById").mockImplementation(async (_type: any, id: number) => {
      imported.push(id);
      if (id === 103) throw new Error("forced failure");
      return [];
    });

    await AdventureMunchHelpers.checkForMissingDocuments("item", [101, 102, 103], null);

    expect(imported).toEqual([102, 103]);
    expect(resumableSpy).toHaveBeenCalledWith("run-1", 1);
    expect(markSpy).toHaveBeenCalledWith("run-1", "item:102", "processing");
    expect(markSpy).toHaveBeenCalledWith("run-1", "item:102", "succeeded");
    expect(markSpy).toHaveBeenCalledWith("run-1", "item:103", "processing");
    expect(markSpy).toHaveBeenCalledWith("run-1", "item:103", "failed", expect.any(Error));
    expect(completeSpy).toHaveBeenCalledWith("run-1");
  });
});
