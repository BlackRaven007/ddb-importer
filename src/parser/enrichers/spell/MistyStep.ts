import DDBEnricherData from "../data/DDBEnricherData";

export default class MistyStep extends DDBEnricherData {

  override get type(): IDDBActivityType | null {
    return DDBEnricherData.ACTIVITY_TYPES.TELEPORT;
  }

  override get activity(): IDDBActivityData {
    return {
      activationType: "bonus",
      overrideActivation: true,
      data: {
        name: "Misty Step",
        range: {
          override: true,
          value: "30",
          units: "ft",
          special: "",
        },
        target: {
          override: true,
          prompt: false,
          affects: {
            count: "1",
            type: "self",
          },
          template: {},
        },
      },
    };
  }

}
