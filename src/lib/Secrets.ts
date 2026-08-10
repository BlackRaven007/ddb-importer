import logger from "./Logger";
import utils from "./Utils";
import DDBProxy from "./DDBProxy";
import { postJson } from "./FetchHelper";
import PatreonHelper from "./PatreonHelper";
import { SETTINGS } from "../config/_module";

function isJSON(str: string): boolean {
  try {
    return (JSON.parse(str) && !!str && str !== null);
  } catch (_e) {
    return false;
  }
}

function getStorage(): Storage | null {
  if (typeof localStorage === "undefined" || localStorage === null) {
    return null;
  }
  return localStorage;
}

export function isLocalCobalt(keyPostfix: string | null): boolean {
  const storage = getStorage();
  return Boolean(storage && keyPostfix && keyPostfix !== "" && storage.getItem(`ddb-cobalt-cookie-${keyPostfix}`) !== null);
}

export function getCobalt(keyPostfix = ""): string {
  let cobalt: string;
  const storage = getStorage();
  const localCookie = utils.getSetting<boolean>("cobalt-cookie-local");
  const characterCookie = isLocalCobalt(keyPostfix);

  logger.debug(`Getting Cookie: Key postfix? "${keyPostfix}" -  Local? ${localCookie} - Character? ${characterCookie}`);
  if (characterCookie && storage) {
    cobalt = storage.getItem(`ddb-cobalt-cookie-${keyPostfix}`) ?? "";
  } else if (localCookie && storage) {
    cobalt = storage.getItem("ddb-cobalt-cookie") ?? "";
  } else {
    cobalt = utils.getSetting<string>("cobalt-cookie");
  }

  return cobalt;
}

export async function setCobalt(value: string, keyPostfix = "") {
  const storage = getStorage();
  const localCookie = utils.getSetting<boolean>("cobalt-cookie-local");
  const characterCookie = keyPostfix && keyPostfix !== "";

  let cobaltValue = value;
  if (isJSON(value)) {
    cobaltValue = JSON.parse(value).cbt;
  }

  logger.debug(`Setting Cookie: Key postfix? "${keyPostfix}" -  Local? ${localCookie} - Character? ${characterCookie}`);
  if (characterCookie && storage) {
    storage.setItem(`ddb-cobalt-cookie-${keyPostfix}`, cobaltValue);
  } else if (localCookie && storage) {
    storage.setItem("ddb-cobalt-cookie", cobaltValue);
  } else {
    await game.settings.set(SETTINGS.MODULE_ID, "cobalt-cookie", cobaltValue);
  }
}

export function deleteLocalCobalt(keyPostfix: string | null) {
  const storage = getStorage();
  const localCookie = isLocalCobalt(keyPostfix);

  if (localCookie && storage) {
    storage.removeItem(`ddb-cobalt-cookie-${keyPostfix}`);
  }
}

export async function moveCobaltToLocal() {
  const storage = getStorage();
  if (storage) {
    storage.setItem("ddb-cobalt-cookie", utils.getSetting<string>("cobalt-cookie"));
  }
  await game.settings.set(SETTINGS.MODULE_ID, "cobalt-cookie", "");
  game.settings.set(SETTINGS.MODULE_ID, "cobalt-cookie-local", true);
}

export async function moveCobaltToSettings() {
  const storage = getStorage();
  game.settings.set(SETTINGS.MODULE_ID, "cobalt-cookie", storage?.getItem("ddb-cobalt-cookie") ?? "");
  game.settings.set(SETTINGS.MODULE_ID, "cobalt-cookie-local", false);
}

export async function checkCobalt(keyPostfix = "", alternativeKey = null as string | null) : Promise<{ success: boolean; message: string }> {
  const cobaltCookie = alternativeKey
    ? isJSON(alternativeKey)
      ? JSON.parse(alternativeKey).cbt
      : alternativeKey
    : getCobalt(keyPostfix);
  const parsingApi = DDBProxy.getProxy();
  const betaKey = PatreonHelper.getPatreonKey();
  const body = { cobalt: cobaltCookie, betaKey: betaKey };

  try {
    const data = await postJson<{ success: boolean; message: string }>(`${parsingApi}/proxy/auth`, body);
    logger.debug("Cobalt cookie check result:", data);
    return data;
  } catch (error) {
    logger.error(`Cobalt cookie check error`, error);
    throw error;
  }
}

interface IDDBUserDataResponse {
  success: boolean;
  message: string;
  data: {
    status: string;
    userId: number;
    userDisplayName: string;
    twitchUserName: string;
    AvatarUrl: string;
    email?: string;
    firstName: string;
    lastName: string | null;
    subscriptionPaidThruDate: number;
    subscriptionPlan: string;
    subscriptionTierName: string;
    subscriptionProvider: string;
    subscriptionStatus: string;
    isLegendaryBundleBuyer: boolean;
    isSourcebookBundleBuyer: boolean;
    isAdventureBundleBuyer: boolean;
    isAdventureLeagueBundleBuyer: boolean;
    isMapBundleBuyer: boolean;
  };
}

export async function getUserData(keyPostfix = "", alternativeKey = null as string | null): Promise<IDDBUserDataResponse> {
  const cobaltCookie = alternativeKey
    ? isJSON(alternativeKey)
      ? JSON.parse(alternativeKey).cbt
      : alternativeKey
    : getCobalt(keyPostfix);
  const parsingApi = DDBProxy.getProxy();
  const betaKey = PatreonHelper.getPatreonKey();
  const body = { cobalt: cobaltCookie, betaKey: betaKey };

  try {
    return await postJson<IDDBUserDataResponse>(`${parsingApi}/proxy/user-data`, body);
  } catch (error) {
    logger.error(`User data fetch error`, error);
    throw error;
  }
}
