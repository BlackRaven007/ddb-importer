import { describe, it, expect, vi, afterEach } from "vitest";
import AdventureMunchHelpers from "../../../src/muncher/adventure/AdventureMunchHelpers";

const loadMissingDocumentsMock = vi.hoisted(() => vi.fn());

vi.spyOn(AdventureMunchHelpers, "loadMissingDocuments").mockImplementation(loadMissingDocumentsMock);

describe("AdventureMunchHelpers missing documents checkpointing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loadMissingDocumentsMock.mockReset();
  });

  it("requests only the ids that are still missing", async () => {
    vi.spyOn(AdventureMunchHelpers, "getMissingIds").mockResolvedValue([101, 102, 103]);
    loadMissingDocumentsMock.mockResolvedValue([]);

    await AdventureMunchHelpers.checkForMissingDocuments("item", [101, 102, 103], null);

    expect(loadMissingDocumentsMock).toHaveBeenCalledWith("item", [101, 102, 103], null);
  });
});
