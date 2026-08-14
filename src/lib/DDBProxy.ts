import { SETTINGS } from "../config/_module";
import utils from "./Utils";
import logger from "./Logger";

const DDBProxy = {

  // This fork does not run a hosted default proxy: every install is expected
  // to point at the user's own instance, so this is always true.
  isCustom: (_orDev = false): boolean => {
    return true;
  },

  resetProxy: () => {
    game.settings.set(SETTINGS.MODULE_ID, "api-endpoint", SETTINGS.DEFAULT_SETTINGS.READY.PROXY["api-endpoint"].default);
  },

  getProxy: (): string => {
    const endpoint = utils.getSetting<string>("api-endpoint")?.trim();
    if (!endpoint) {
      logger.error("DDB Importer: no proxy address configured (Settings > DDB Importer > Proxy Configuration).");
      ui.notifications.error("DDB Importer: No proxy address configured. Set one in module settings before importing.");
    }
    // strip any trailing slash so we can safely concatenate paths later
    return endpoint ? endpoint.replace(/\/$/, "") : endpoint;
  },

  // Only used if the user is running image hosting separately from their
  // main proxy. Otherwise falls back to the same api-endpoint.
  getDynamicProxy: (): string => {
    const custom = utils.getSetting<string>("dynamic-api-endpoint")?.trim();
    return custom && custom !== "" ? custom.replace(/\/$/, "") : DDBProxy.getProxy();
  },

  // Only used if the user is running image proxying separately from their
  // main proxy. Otherwise falls back to the same api-endpoint (which now
  // exposes a /ddb/<host>/<path> image route alongside the data routes).
  getCORSProxy: (): string => {
    const custom = utils.getSetting<string>("cors-endpoint")?.trim();
    if (custom && custom !== "") return custom;
    const base = DDBProxy.getProxy();
    return base ? `${base}/` : base;
  },

};

export default DDBProxy;
