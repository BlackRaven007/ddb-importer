import DDBEnricherData from "../data/DDBEnricherData";

export default class ThunderStep extends DDBEnricherData {

  override get activity(): IDDBActivityData {
    return {
      data: {
        range: {
          override: true,
          value: "",
          units: "self",
        },
        target: {
          override: true,
          affects: {
            type: "creature",
          },
          template: {
            contiguous: false,
            type: "radius",
            size: "10",
            units: "ft",
          },
        },
      },
    };
  }

  override get additionalActivities(): IDDBAdditionalActivity[] {
    return [
      {
        init: {
          name: "Teleport",
          type: DDBEnricherData.ACTIVITY_TYPES.TELEPORT,
        },
        build: {
          noSpellslot: true,
          generateAttack: false,
          generateConsumption: true,
          generateDamage: false,
          generateDuration: true,
          generateRange: true,
          generateSave: false,
          generateTarget: true,
          activationOverride: {
            type: "special",
            condition: "As part of casting Thunder Step",
          },
          rangeOverride: {
            value: "90",
            units: "ft",
            special: "",
          },
          targetOverride: {
            prompt: false,
            affects: {
              count: "2",
              type: "willing",
              special: "Control the caster and, optionally, one willing creature within 5 feet of the caster.",
            },
            template: {},
          },
          durationOverride: {
            units: "inst",
            concentration: false,
          },
        },
        overrides: {
          noConsumeTargets: true,
          noSpellslot: true,
        },
      },
    ];
  }

}
