import {
  init,
  onReady,
  onceReady,
  renderJournalSheet,
  renderJournalEntryPageSheet,
  renderCompendiumTab,
  getSceneControlButtons,
} from "./hooks";
import extendSceneNavigationContext from "./hooks/navigationContext/extendSceneNavigationContext";
import addMetaDataIndicators from "./hooks/renderSceneDirectory/metaDataIndicator";
import { getHeaderControlsJournalEntrySheetButtons, getJournalSheet5eHeaderButtons } from "./hooks/renderJournalSheet/adventure";
import activateMetaNote from "./hooks/canvas/activateMetaNote";


export const setAllRenderFlags = () => {
  canvas.notes?.setAllRenderFlags({ refreshState: true });
};

Hooks.on("canvasReady", setAllRenderFlags);

// register hooks
Hooks.once("init", init);
Hooks.once("ready", onceReady);
Hooks.on("ready", onReady);
Hooks.on("renderCompendiumDirectory", renderCompendiumTab);
Hooks.on("renderJournalPageSheet", renderJournalSheet);
Hooks.on("renderJournalEntryPageSheet", renderJournalEntryPageSheet);
Hooks.on("getSceneNavigationContext", extendSceneNavigationContext);
Hooks.on("getSceneContextOptions", extendSceneNavigationContext);
Hooks.on("getSceneDirectoryEntryContext", extendSceneNavigationContext);
Hooks.on("renderSceneDirectory", addMetaDataIndicators);
Hooks.on("getJournalSheet5eHeaderButtons", getJournalSheet5eHeaderButtons);
Hooks.on("getHeaderControlsJournalEntrySheet", getHeaderControlsJournalEntrySheetButtons);
Hooks.on("activateNote", activateMetaNote);
Hooks.on("getSceneControlButtons", getSceneControlButtons);

// CONFIG.compatibility.includePatterns.push(includeRgx);

// Hooks.on("ddb-importer.characterProcessDataComplete", (data) => {
// });

// Hooks.on("ddb-importer.monsterAddToCompendiumComplete", (data) => {
// });

// Hooks.on(`ddb-importer.itemsCompendiumUpdateComplete`, (data) => {
// });
