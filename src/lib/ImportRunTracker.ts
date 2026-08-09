import { SETTINGS } from "../config/_module";
import utils from "./Utils";

type TImportRunStatus = "queued" | "running" | "completed" | "partial-failed" | "canceled";
type TImportWorkItemStatus = "pending" | "processing" | "succeeded" | "failed" | "skipped";

interface IImportRunItemState {
  status: TImportWorkItemStatus;
  updatedAt: string;
  error?: string;
  retryCount?: number;
}

interface IImportRunCounters {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  retried: number;
  resumable: number;
}

interface IImportRun {
  id: string;
  runType: string;
  keySignature: string;
  optionsHash?: string;
  sourceSnapshot?: Record<string, unknown>;
  status: TImportRunStatus;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  resumedFromRunId: string | null;
  counters: IImportRunCounters;
  itemStates: Record<string, IImportRunItemState>;
}

interface IImportRunFailedItem {
  key: string;
  error?: string;
  updatedAt: string;
}

interface IImportRunSummary {
  id: string;
  runType: string;
  status: TImportRunStatus;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  counters: IImportRunCounters;
  failedItems: IImportRunFailedItem[];
}

interface IImportRunStateStore {
  schemaVersion: number;
  runs: IImportRun[];
}

const STORE_SCHEMA_VERSION = 1;
const STORE_LIMIT = 20;

export default class ImportRunTracker {

  static SETTING_KEY = "import-run-state";

  static emptyStore(): IImportRunStateStore {
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      runs: [],
    };
  }

  static getStore(): IImportRunStateStore {
    const fromSetting = utils.getSetting<IImportRunStateStore>(ImportRunTracker.SETTING_KEY);
    if (!fromSetting || typeof fromSetting !== "object" || !Array.isArray((fromSetting as any).runs)) {
      return ImportRunTracker.emptyStore();
    }
    const store = fromSetting as IImportRunStateStore;
    return {
      schemaVersion: store.schemaVersion ?? STORE_SCHEMA_VERSION,
      runs: store.runs ?? [],
    };
  }

  static async saveStore(store: IImportRunStateStore): Promise<void> {
    const trimmed = {
      ...store,
      runs: [...store.runs].slice(-STORE_LIMIT),
    };
    await game.settings.set(SETTINGS.MODULE_ID, ImportRunTracker.SETTING_KEY as any, trimmed);
  }

  static makeKeySignature(keys: string[]): string {
    return JSON.stringify([...keys].sort());
  }

  static createRun(
    runType: string,
    keys: string[],
    resumedFromRunId: string | null = null,
    metadata: { optionsHash?: string; sourceSnapshot?: Record<string, unknown> } = {},
  ): IImportRun {
    const now = new Date().toISOString();
    const itemStates: Record<string, IImportRunItemState> = {};
    for (const key of keys) {
      itemStates[key] = { status: "pending", updatedAt: now };
    }

    return {
      id: foundry.utils.randomID(),
      runType,
      keySignature: ImportRunTracker.makeKeySignature(keys),
      optionsHash: metadata.optionsHash,
      sourceSnapshot: metadata.sourceSnapshot,
      status: "running",
      startedAt: now,
      updatedAt: now,
      endedAt: null,
      resumedFromRunId,
      counters: {
        total: keys.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        retried: 0,
        resumable: 0,
      },
      itemStates,
    };
  }

  static findLatestResumableRunForKey(store: IImportRunStateStore, runType: string, keySignature: string, optionsHash?: string): IImportRun | null {
    const candidates = store.runs.filter((r) =>
      r.runType === runType
      && r.keySignature === keySignature
      && (optionsHash === undefined || r.optionsHash === optionsHash)
      && (r.status === "partial-failed" || r.status === "running"),
    );
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }

  static async startOrResumeRun(
    runType: string,
    keys: string[],
    metadata: { optionsHash?: string; sourceSnapshot?: Record<string, unknown> } = {},
  ): Promise<IImportRun> {
    const store = ImportRunTracker.getStore();
    const keySignature = ImportRunTracker.makeKeySignature(keys);
    const resumable = ImportRunTracker.findLatestResumableRunForKey(store, runType, keySignature, metadata.optionsHash);

    if (resumable) {
      const now = new Date().toISOString();
      const resumed: IImportRun = {
        ...resumable,
        status: "running",
        updatedAt: now,
        endedAt: null,
      };
      const idx = store.runs.findIndex((r) => r.id === resumed.id);
      if (idx !== -1) store.runs[idx] = resumed;
      await ImportRunTracker.saveStore(store);
      return resumed;
    }

    const run = ImportRunTracker.createRun(runType, keys, null, metadata);
    store.runs.push(run);
    await ImportRunTracker.saveStore(store);
    return run;
  }

  static async resumeImport(runId: string): Promise<IImportRun | null> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return null;

    const now = new Date().toISOString();
    run.status = "running";
    run.updatedAt = now;
    run.endedAt = null;
    await ImportRunTracker.saveStore(store);
    return run;
  }

  static getRunById(store: IImportRunStateStore, runId: string): IImportRun | null {
    return store.runs.find((r) => r.id === runId) ?? null;
  }

  static getLatestRuns(limit = 10): IImportRun[] {
    const store = ImportRunTracker.getStore();
    return [...store.runs].slice(-Math.max(1, limit)).reverse();
  }

  static getLatestResumableRun(): IImportRun | null {
    const store = ImportRunTracker.getStore();
    const candidates = store.runs.filter((run) => run.status === "partial-failed" || run.status === "running");
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }

  static getRunSummaryById(runId: string): IImportRunSummary | null {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return null;

    const failedItems = Object.entries(run.itemStates)
      .filter(([, state]) => state.status === "failed")
      .map(([key, state]) => ({
        key,
        error: state.error,
        updatedAt: state.updatedAt,
      }));

    return {
      id: run.id,
      runType: run.runType,
      status: run.status,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      endedAt: run.endedAt,
      counters: run.counters,
      failedItems,
    };
  }

  static getRecoveryReport(limit = 10): IImportRunSummary[] {
    return ImportRunTracker.getLatestRuns(limit).map((run) => {
      const failedItems = Object.entries(run.itemStates)
        .filter(([, state]) => state.status === "failed")
        .map(([key, state]) => ({
          key,
          error: state.error,
          updatedAt: state.updatedAt,
        }));

      return {
        id: run.id,
        runType: run.runType,
        status: run.status,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        endedAt: run.endedAt,
        counters: run.counters,
        failedItems,
      };
    });
  }

  static async clearRunState(runId: string): Promise<void> {
    const store = ImportRunTracker.getStore();
    const initialLength = store.runs.length;
    store.runs = store.runs.filter((run) => run.id !== runId);
    if (store.runs.length !== initialLength) {
      await ImportRunTracker.saveStore(store);
    }
  }

  static async clearAllRunState(): Promise<void> {
    await ImportRunTracker.saveStore(ImportRunTracker.emptyStore());
  }

  static async cancelRun(runId: string): Promise<void> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return;
    const now = new Date().toISOString();
    run.status = "canceled";
    run.updatedAt = now;
    run.endedAt = now;
    await ImportRunTracker.saveStore(store);
  }

  static recomputeCounters(run: IImportRun): IImportRunCounters {
    const values = Object.values(run.itemStates);
    const succeeded = values.filter((v) => v.status === "succeeded").length;
    const failed = values.filter((v) => v.status === "failed").length;
    const skipped = values.filter((v) => v.status === "skipped").length;
    const retried = values.reduce((acc, value) => acc + (value.retryCount ?? 0), 0);
    const processed = succeeded + failed + skipped;

    return {
      total: run.counters.total,
      processed,
      succeeded,
      failed,
      skipped,
      retried,
      resumable: run.counters.resumable ?? 0,
    };
  }

  static async setResumableCount(runId: string, resumableCount: number): Promise<void> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return;

    run.counters.resumable = Math.max(0, resumableCount);
    run.counters = ImportRunTracker.recomputeCounters(run);
    run.updatedAt = new Date().toISOString();
    await ImportRunTracker.saveStore(store);
  }

  static async recordRetry(runId: string, itemKey: string): Promise<void> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return;

    const existing = run.itemStates[itemKey] ?? {
      status: "pending" as TImportWorkItemStatus,
      updatedAt: new Date().toISOString(),
    };
    run.itemStates[itemKey] = {
      ...existing,
      retryCount: (existing.retryCount ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    run.counters = ImportRunTracker.recomputeCounters(run);
    await ImportRunTracker.saveStore(store);
  }

  static async markItemStatus(runId: string, itemKey: string, status: TImportWorkItemStatus, error?: unknown): Promise<void> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return;

    const now = new Date().toISOString();
    const existing = run.itemStates[itemKey] ?? { status: "pending" as TImportWorkItemStatus, updatedAt: now };

    run.itemStates[itemKey] = {
      ...existing,
      status,
      updatedAt: now,
      error: error ? String(error) : undefined,
    };

    run.updatedAt = now;
    run.counters = ImportRunTracker.recomputeCounters(run);
    await ImportRunTracker.saveStore(store);
  }

  static async completeRun(runId: string): Promise<void> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return;

    const now = new Date().toISOString();
    run.status = run.counters.failed > 0 ? "partial-failed" : "completed";
    run.updatedAt = now;
    run.endedAt = now;
    run.counters = ImportRunTracker.recomputeCounters(run);
    await ImportRunTracker.saveStore(store);
  }

  static getSucceededKeys(runId: string): Set<string> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return new Set();

    return new Set(
      Object.entries(run.itemStates)
        .filter(([, state]) => state.status === "succeeded" || state.status === "skipped")
        .map(([key]) => key),
    );
  }

  static getPendingOrFailedKeys(runId: string): Set<string> {
    const store = ImportRunTracker.getStore();
    const run = ImportRunTracker.getRunById(store, runId);
    if (!run) return new Set();

    return new Set(
      Object.entries(run.itemStates)
        .filter(([, state]) => state.status === "pending" || state.status === "failed" || state.status === "processing")
        .map(([key]) => key),
    );
  }

}
