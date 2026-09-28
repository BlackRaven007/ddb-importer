import { logger, DDBProxy, fetchJson } from "../lib/_module";

/**
 * Catalog-level adventure helpers for public metadata summaries used by the
 * Native Adventure Browser.
 */
export default class DDBAdventures {

  // Open GET proxy call (no cobalt/auth). Used for the public meta-data summary.
  private static async get<T>(path: string): Promise<T | null> {
    const parsingApi = DDBProxy.getProxy();
    const data = await fetchJson<IDDBProxyResponse<T>>(`${parsingApi}${path}`, {
      method: "GET",
      cache: "no-cache",
    });
    if (!data.success) {
      logger.warn(`DDBAdventures ${path} unavailable: ${data.message}`);
      return null;
    }
    return (data.data ?? null) as T | null;
  }

  /**
   * Public meta-data summary for every book with enhanced content (scene counts
   * + per-scene walls/lights/notes/tokens/tiles/stairways).
   */
  static async fetchMetaDataSummary(): Promise<IMetaDataSummary | null> {
    if (CONFIG.DDBI.METADATA_SUMMARY) return CONFIG.DDBI.METADATA_SUMMARY;
    try {
      const data = await DDBAdventures.get<IMetaDataSummary>("/proxy/maps/metadata/summary");
      if (data) CONFIG.DDBI.METADATA_SUMMARY = data;
      return data;
    } catch (error) {
      logger.warn(`DDBAdventures.fetchMetaDataSummary failed: ${error}`);
      return null;
    }
  }

}
