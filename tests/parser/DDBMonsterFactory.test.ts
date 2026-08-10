import { vi } from "vitest";

const { postJsonMock } = vi.hoisted(() => ({
  postJsonMock: vi.fn(),
}));

vi.mock("../../src/lib/_module", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/_module")>("../../src/lib/_module");
  return {
    ...actual,
    postJson: postJsonMock,
  };
});

import Iconizer from "../../src/lib/Iconizer";
import DDBMonsterFactory from "../../src/parser/DDBMonsterFactory";

describe("Iconizer.preFetchDDBIconImages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("continues when one prefetch step fails", async () => {
    vi.spyOn(Iconizer, "getDDBGenericItemImages").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(Iconizer, "getDDBGenericLootImages").mockResolvedValueOnce([]);
    vi.spyOn(Iconizer, "getDDBSchoolSpellImages").mockResolvedValueOnce([]);

    await expect(Iconizer.preFetchDDBIconImages()).resolves.toBeUndefined();
  });
});

describe("DDBMonsterFactory.fetchDDBMonsterSourceData", () => {
  beforeEach(() => {
    postJsonMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty list when the monster API rejects due to missing auth", async () => {
    postJsonMock.mockRejectedValueOnce(new Error("No cobalt token"));
    const factory = new DDBMonsterFactory({ notifier: () => undefined });

    await expect(factory.fetchDDBMonsterSourceData({ searchTerm: "dragon" })).resolves.toEqual([]);
  });
});
