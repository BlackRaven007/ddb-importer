import { logger } from "../../lib/_module";
import DDBEffectHelper from "../DDBEffectHelper";

interface IAuraTracker {
  randomId?: string;
  targetUuids?: string[];
  startRound?: number;
  startTurn?: number;
  spellLevel?: number;
  hasLeft?: boolean;
  condition?: string | null;
  round?: number;
  turn?: number;
}

type TAdjustConditionOptions = Parameters<typeof DDBEffectHelper.adjustCondition>[0];
type TSyntheticWorkflowOptions = Parameters<typeof DDBEffectHelper.syntheticItemWorkflowOptions>[0];
type TFilteredActivitiesOptions = Parameters<typeof DDBEffectHelper.documentWithFilteredActivities>[0];
type TTokenTargetUser = typeof game.user & {
  updateTokenTargets: (targetIds?: string[]) => void;
};

interface IActiveAurasModule {
  api: {
    AAHelpers: {
      applyTemplate: (args: unknown) => Promise<unknown>;
    };
  };
}

function getSafeName(name: string) {
  return name.replace(/\s|'|\.|’/g, "_");
}

export async function setBasicCombatFlag(actor: Actor | Actor.Implementation, flagName: string, origin?: string) {
  await DDBEffectHelper.setFlag(actor as Actor.Implementation, flagName, {
    id: game.combat?.id ?? null,
    round: game.combat?.round ?? null,
    turn: game.combat?.turn ?? null,
    origin,
  });
}

function createDataTracker({
  targetUuids,
  spellLevel,
  hasLeft = false,
  randomId = foundry.utils.randomID(),
}: IAuraTracker = {}, trackerFlags: Partial<IAuraTracker> = {}): IAuraTracker {
  const dataTracker = foundry.utils.mergeObject({
    randomId,
    targetUuids,
    startRound: game.combat?.round ?? 0,
    startTurn: game.combat?.turn ?? 0,
    spellLevel,
    hasLeft,
  }, trackerFlags);
  return dataTracker;
}

async function generateDataTracker({
  targetUuids,
  spellLevel,
  originDocument,
  wait = false,
  actor,
}: {
  targetUuids?: string[];
  spellLevel?: number;
  originDocument: Item.Implementation;
  wait?: boolean;
  actor: Actor.Implementation | null;
}) {
  const dataTracker = createDataTracker({ targetUuids, spellLevel });
  if (wait) await DDBEffectHelper.wait(500);

  const safeName = getSafeName(originDocument.name);

  if (!actor) {
    logger.warn(`generateDataTracker: no actor available for ${originDocument.name}, skipping tracker flag`);
    return dataTracker;
  }

  await DDBEffectHelper.unsetFlag(actor, `${safeName}Tracker`);
  await DDBEffectHelper.setFlag(actor, `${safeName}Tracker`, dataTracker);

  return dataTracker;
}

async function rollDocumentActivityMidiQol({
  targetToken,
  originDocument,
  level = 0,
  activityIds = [],
  nameSuffix = "",
}: {
  targetToken: Token.Implementation;
  originDocument: Item.Implementation;
  level?: number;
  activityIds?: string[];
  nameSuffix?: string;
}) {
  const itemLevel = Number((originDocument.system as { level?: number }).level ?? 0);

  const workflowItemData = DDBEffectHelper.documentWithFilteredActivities({
    document: originDocument,
    activityIds,
    parent: originDocument.parent,
    clearEffectFlags: true,
    renameDocument: `${originDocument.name}${nameSuffix}`,
  } as TFilteredActivitiesOptions);

  if (!workflowItemData) {
    logger.warn(`rollDocumentActivityMidiQol: no workflow item generated for ${originDocument.name}`);
    return;
  }

  await DDBEffectHelper.rollMidiItemUse(workflowItemData, {
    targets: [targetToken.document.uuid],
    slotLevel: level,
    scaling: (level ?? 0) - itemLevel,
  });
}

async function applyConditionVsSave({
  condition,
  targetToken,
  item,
  itemLevel,
  activityIds,
  nameSuffix = "",
}: {
  condition?: string | null;
  targetToken: Token.Implementation;
  item: Item.Implementation;
  itemLevel?: number;
  spellLevel?: number;
  activityIds?: string[];
  nameSuffix?: string;
}) {
  logger.debug(`Running ${item.name}, applyConditionVsSave`);
  const targetActor = targetToken.actor;
  if (!targetActor) return false;
  if (condition && DDBEffectHelper.isConditionEffectAppliedAndActive(condition, targetActor)) return true;

  const targetTokenId = targetToken.id;
  if (!targetTokenId) {
    logger.warn(`applyConditionVsSave: target token has no id for ${item.name}`);
    return false;
  }

  const resolvedNameSuffix = nameSuffix === `: ${condition} save` ? "" : nameSuffix;
  const workflowItemData = DDBEffectHelper.documentWithFilteredActivities({
    document: item,
    activityIds,
    parent: item.parent,
    clearEffectFlags: true,
    renameDocument: `${item.name}${resolvedNameSuffix}`,
  } as TFilteredActivitiesOptions);

  if (!workflowItemData) {
    logger.warn(`applyConditionVsSave: no workflow item generated for ${item.name}`);
    return false;
  }

  const saveTargets = [...(game.user?.targets ?? [])]
    .map((t) => t.id)
    .filter((id): id is string => id !== null);
  (game.user as TTokenTargetUser).updateTokenTargets([targetTokenId]);
  const itemLevelValue = Number((item.system as { level?: number }).level ?? 0);
  const [config, options] = DDBEffectHelper.syntheticItemWorkflowOptions({
    slotLevel: itemLevel,
    scaling: (itemLevel ?? 0) - itemLevelValue,
  } as unknown as TSyntheticWorkflowOptions);
  const result = await MidiQOL.completeItemUse(workflowItemData, config, options);

  (game.user as TTokenTargetUser).updateTokenTargets(saveTargets);
  const failedSaves = Array.from<Token.Implementation>(result.failedSaves);
  const statusOnWorkflow = workflowItemData.effects?.some((e: any) =>
    e.statuses.some((s: any) => s.name.toLowerCase() === condition),
  ) ?? false;
  if (failedSaves.length > 0 && !statusOnWorkflow) {
    await DDBEffectHelper.adjustCondition({
      add: true,
      conditionName: condition,
      actor: failedSaves[0].actor,
    } as TAdjustConditionOptions);
  }

  return result;
}

export async function checkAuraAndUseActivity({
  originDocument,
  tokenUuid,
  activityIds = [],
  nameSuffix = "",
}: {
  originDocument: Item.Implementation;
  tokenUuid: string;
  activityIds?: string[];
  nameSuffix?: string;
}) {
  const safeName = getSafeName(originDocument.name);
  const originParent = originDocument.parent;
  const targetItemTracker = originParent ? DDBEffectHelper.getFlag(originParent, `${safeName}Tracker`) as IAuraTracker | undefined : undefined;
  if (!targetItemTracker) {
    logger.warn(`checkAuraAndUseActivity: no ${safeName}Tracker flag found for ${originDocument.name}`);
    return;
  }
  const combat = game.combat;
  if (!combat) return;
  const originalTarget = (targetItemTracker.targetUuids ?? []).includes(tokenUuid);
  const tokenId = tokenUuid.split(".").pop();
  const target = tokenId ? canvas.tokens.get(tokenId) : undefined;
  if (!target) {
    logger.warn(`checkAuraAndUseActivity: token ${tokenUuid} not found on canvas`);
    return;
  }
  const targetActor = target.actor as Actor.Implementation | null;
  if (!targetActor) return;
  const targetTokenTrackerFlag = DDBEffectHelper.getFlag(targetActor, `${safeName}Tracker`) as IAuraTracker | undefined;
  const targetedThisCombat = targetTokenTrackerFlag && targetItemTracker.randomId === targetTokenTrackerFlag.randomId;
  const targetTokenTracker = targetedThisCombat
    ? targetTokenTrackerFlag
    : createDataTracker({
      targetUuids: targetItemTracker.targetUuids ?? [tokenUuid],
      randomId: targetItemTracker.randomId,
      hasLeft: false,
      spellLevel: targetItemTracker.spellLevel,
    });

  const combatRound = combat.round ?? 0;
  const combatTurn = combat.turn ?? 0;
  const castTurn = targetItemTracker.startRound === combatRound
    && targetItemTracker.startTurn === combatTurn;
  // round/turn are only set on the tracker once a token has left the aura
  const isLaterTurn = (targetTokenTracker.round !== undefined && combatRound > targetTokenTracker.round)
    || (targetTokenTracker.turn !== undefined && combatTurn > targetTokenTracker.turn);

  // if:
  // not cast turn, and not part of the original target
  // AND one of the following
  // not original template and have not yet had this effect applied this combat OR
  // has been targeted this combat, left and re-entered effect, and is a later turn
  if (castTurn && originalTarget) {
    logger.debug(`Token ${target.name} is part of the original target for ${originDocument.name}`);
  } else if (!targetedThisCombat || (targetedThisCombat && targetTokenTracker.hasLeft && isLaterTurn)) {
    logger.debug(`Token ${target.name} is targeted for immediate damage with ${originDocument.name}, using the following factors`, { originalTarget, castTurn, targetedThisCombat, targetTokenTracker, isLaterTurn });
    targetTokenTracker.hasLeft = false;
    await rollDocumentActivityMidiQol({
      targetToken: target,
      originDocument,
      level: targetTokenTracker.spellLevel,
      activityIds,
      nameSuffix,
    });
  }
  await DDBEffectHelper.setFlag(targetActor, `${safeName}Tracker`, targetTokenTracker);
}

export async function checkAuraAndApplyCondition({
  originDocument,
  wait = false,
  tokenUuid,
  condition = null,
  everyEntry = false,
  allowVsRemoveCondition = false,
  activityIds = [],
  nameSuffix = "",
}: {
  originDocument: Item.Implementation;
  wait?: boolean;
  tokenUuid: string;
  condition?: string | null;
  everyEntry?: boolean;
  allowVsRemoveCondition?: boolean;
  activityIds?: string[];
  nameSuffix?: string;
}) {
  logger.debug(`Running ${originDocument.name}, checkAuraAndApplyCondition`);

  const combat = game.combat;
  const combatRound = combat?.round ?? 0;
  const combatTurn = combat?.turn ?? 0;

  const safeName = getSafeName(originDocument.name);
  // sometimes the round info has not updated, so we pause a bit
  if (wait) await DDBEffectHelper.wait(500);
  const originParent = originDocument.parent;
  const targetItemTracker = originParent ? DDBEffectHelper.getFlag(originParent, `${safeName}Tracker`) as IAuraTracker | undefined : undefined;
  if (!targetItemTracker) {
    logger.warn(`checkAuraAndApplyCondition: no ${safeName}Tracker flag found for ${originDocument.name}`);
    return;
  }
  const originalTarget = (targetItemTracker.targetUuids ?? []).includes(tokenUuid);
  const tokenId = tokenUuid.split(".").pop();
  const target = tokenId ? canvas.tokens.get(tokenId) : undefined;
  if (!target) {
    logger.warn(`checkAuraAndApplyCondition: token ${tokenUuid} not found on canvas`);
    return;
  }
  const targetActor = target.actor;
  if (!targetActor) return;
  const targetTokenTrackerFlag = DDBEffectHelper.getFlag(targetActor, `${safeName}Tracker`) as IAuraTracker | undefined;
  const targetedThisCombat = targetTokenTrackerFlag
    && targetItemTracker.randomId === targetTokenTrackerFlag.randomId;
  const targetTokenTracker = targetedThisCombat
    ? targetTokenTrackerFlag
    : createDataTracker({
      targetUuids: targetItemTracker.targetUuids ?? [tokenUuid],
      randomId: targetItemTracker.randomId,
      hasLeft: false,
      spellLevel: targetItemTracker.spellLevel,
    }, { condition });

  const castTurn = targetItemTracker.startRound === combatRound
    && targetItemTracker.startTurn === combatTurn;
  // round/turn are only set on the tracker once a token has left the aura
  const isLaterTurn = (targetTokenTracker.round !== undefined && combatRound > targetTokenTracker.round)
    || (targetTokenTracker.turn !== undefined && combatTurn > targetTokenTracker.turn);

  // if:
  // not cast turn, and not part of the original target
  // AND one of the following
  // not original template and have not yet had this effect applied this combat OR
  // has been targeted this combat, left and re-entered effect, and is a later turn

  if (castTurn && originalTarget) {
    logger.debug(`Token ${target.name} is part of the original target for ${originDocument.name}`);
  } else if (everyEntry || !targetedThisCombat || (targetedThisCombat && isLaterTurn)) {
    logger.debug(`Token ${target.name} is targeted for immediate save vs condition with ${originDocument.name}, using the following factors`, {
      originalTarget, castTurn, targetedThisCombat, targetTokenTracker, isLaterTurn, target,
    });
    targetTokenTracker.hasLeft = false;
    await applyConditionVsSave({
      condition,
      targetToken: target,
      item: originDocument,
      spellLevel: targetItemTracker.spellLevel,
      activityIds,
      nameSuffix,
    });
  }
  await DDBEffectHelper.setFlag(targetActor, `${safeName}Tracker`, targetTokenTracker);
  const effectApplied = targetTokenTracker.condition
    ? DDBEffectHelper.isConditionEffectAppliedAndActive(targetTokenTracker.condition, target.actor)
    : false;
  const currentTokenCombatTurn = combat?.current?.tokenId === tokenId;
  if (currentTokenCombatTurn && allowVsRemoveCondition && effectApplied) {
    logger.log(`Removing ${condition}`);
    await DDBEffectHelper.attemptConditionRemovalDialog(target, condition, {
      document: originDocument,
    });
  }

}


export async function removeAuraFromToken({
  effectOrigin,
  tokenUuid,
  removeOnOff = true,
}: {
  effectOrigin?: string;
  tokenUuid?: string;
  removeOnOff?: boolean;
} = {}) {
  const originDocument = await fromUuid(effectOrigin) as Item.Implementation;
  logger.debug(`Running ${originDocument.name}, removeAuraFromToken`);
  const safeName = getSafeName(originDocument.name);
  const targetToken = await fromUuid(tokenUuid) as TokenDocument.Implementation;
  logger.verbose("removeAuraFromToken args", {
    targetToken,
    tokenUuid,
    effectOrigin,
    originDocument,
  });
  const targetActor = targetToken.actor;
  if (!targetActor) return;
  const targetTokenTracker = await DDBEffectHelper.getFlag(targetActor, `${safeName}Tracker`) as IAuraTracker;
  logger.debug("targetTokenTracker", { targetTokenTracker });

  if (!targetTokenTracker) {
    logger.error(`No ${safeName}Tracker found for ${targetToken.name}`);
    return;
  }

  if (targetTokenTracker.condition && removeOnOff
    && DDBEffectHelper.isConditionEffectAppliedAndActive(targetTokenTracker.condition, targetActor)
  ) {
    logger.debug(`Removing ${targetTokenTracker.condition} from ${targetToken.name}`);
    await DDBEffectHelper.adjustCondition({
      remove: true,
      conditionName: targetTokenTracker.condition,
      actor: targetActor,
    } as TAdjustConditionOptions);
  }

  targetTokenTracker.hasLeft = true;
  targetTokenTracker.turn = game.combat?.turn ?? 0;
  targetTokenTracker.round = game.combat?.round ?? 0;
  await DDBEffectHelper.setFlag(targetActor, `${safeName}Tracker`, targetTokenTracker);
}


export async function applyAuraToTemplate(returnArgs: any, {
  originDocument,
  condition = null,
  sequencerFile = null,
  sequencerScale = 1,
  targetUuids = [],
  applyImmediate = false,
  templateUuid,
  spellLevel,
  failedSaveTokens = [],
  isCantrip = false,
}: {
  originDocument: Item.Implementation;
  condition?: string | null;
  sequencerFile?: string | null;
  sequencerScale?: number;
  targetUuids?: string[];
  applyImmediate?: boolean;
  templateUuid?: string;
  spellLevel?: number;
  failedSaveTokens?: Token.Implementation[];
  isCantrip?: boolean;
}) {
  logger.debug(`Running ${originDocument.name}, applyAuraToTemplate`);
  await generateDataTracker({
    originDocument,
    targetUuids,
    spellLevel,
    actor: originDocument.actor as Actor.Implementation | null,
  });

  const originUuid = originDocument.uuid;
  if (sequencerFile && templateUuid && originUuid) {
    const scale = sequencerScale ?? 1;
    await DDBEffectHelper.attachSequencerFileToTemplate(templateUuid, sequencerFile, originUuid, scale);
  }

  if (isCantrip) {
    const cantripDice = DDBEffectHelper.getCantripDice(originDocument.actor as Actor.Implementation);
    returnArgs[0].spellLevel = cantripDice;
    const newEffects = returnArgs[0].item.effects.map((effect: any) => {
      effect.system.changes = effect.system.changes.map((change: any) => {
        change.value = change.value.replaceAll("@cantripDice", cantripDice);
        return change;
      });
      return effect;
    });
    returnArgs[0].item.effects = foundry.utils.duplicate(newEffects);
    returnArgs[0].itemData.effects = foundry.utils.duplicate(newEffects);
  }

  if (applyImmediate && condition) {
    await DDBEffectHelper.wait(500);
    for (const token of failedSaveTokens) {
      const tokenActor = token.actor as Actor.Implementation | null;
      if (!tokenActor) continue;
      if (!DDBEffectHelper.isConditionEffectAppliedAndActive(condition, tokenActor)) {
        logger.debug(`Applying ${condition} to ${token.name}`);
        await DDBEffectHelper.adjustCondition({ add: true, conditionName: condition, actor: tokenActor } as TAdjustConditionOptions);
      }
    };
  }

  const templateResult = await (game.modules.get("ActiveAuras") as unknown as IActiveAurasModule).api.AAHelpers.applyTemplate(returnArgs);
  return templateResult;

}
