// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { muncherRenderMock, cookieRenderMock, setupIsSetupCompleteMock, secretsCheckCobaltMock, secretsGetCobaltMock, patreonIsValidKeyMock, getSettingMock } = vi.hoisted(() => ({
  muncherRenderMock: vi.fn(),
  cookieRenderMock: vi.fn(),
  setupIsSetupCompleteMock: vi.fn(),
  secretsCheckCobaltMock: vi.fn(),
  secretsGetCobaltMock: vi.fn(),
  patreonIsValidKeyMock: vi.fn(),
  getSettingMock: vi.fn(),
}));

vi.mock("../../src/apps/DDBMuncher", () => ({
  default: class {
    render = muncherRenderMock;
  },
}));

vi.mock("../../src/apps/DDBCookie", () => ({
  default: class {
    render = cookieRenderMock;
  },
}));

vi.mock("../../src/apps/DDBSetup", () => ({
  default: {
    isSetupComplete: setupIsSetupCompleteMock,
  },
}));

vi.mock("../../src/lib/_module", () => ({
  PatreonHelper: { isValidKey: patreonIsValidKeyMock },
  Secrets: {
    checkCobalt: secretsCheckCobaltMock,
    getCobalt: secretsGetCobaltMock,
  },
  utils: { getSetting: getSettingMock },
}));

import { addMuncher } from "../../src/hooks/renderMuncher/addMuncher";

describe("addMuncher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).game = {
      ...((globalThis as any).game ?? {}),
      user: { isGM: true },
    };
    getSettingMock.mockReturnValue(true);
    setupIsSetupCompleteMock.mockReturnValue(true);
    secretsGetCobaltMock.mockReturnValue("saved-cookie");
    secretsCheckCobaltMock.mockResolvedValue({ success: false, message: "validation failed" });
    patreonIsValidKeyMock.mockResolvedValue(true);
  });

  it("opens the muncher directly when a cobalt cookie is already saved", async () => {
    const app = { id: "compendium" };
    const html = document.createElement("div");
    const headerActions = document.createElement("div");
    headerActions.className = "header-actions";
    html.appendChild(headerActions);

    addMuncher(app as any, html as any);

    const button = html.querySelector(".ddb-muncher") as HTMLButtonElement;
    expect(button).not.toBeNull();

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(cookieRenderMock).not.toHaveBeenCalled();
    expect(muncherRenderMock).toHaveBeenCalledWith({ force: true });
  });
});
