// Derives the serializable StudioClientConfig from a server StudioConfig
//: strips workflow graphs/node maps and every provider/secret,
// keeping only what the <Studio /> client tree needs to render.

import type {
  StudioClientConfig,
  StudioClientModel,
  StudioConfig,
} from "./types";

export const deriveClientConfig = (
  config: StudioConfig
): StudioClientConfig => {
  const models: StudioClientModel[] = config.models.map(
    ({ workflow: _workflow, ...rest }) => ({
      ...rest,
      coinCost: config.billing.costFor(rest.id),
    })
  );

  return {
    branding: config.branding,
    coinName: config.billing.coinName,
    features: {
      billing: !config.billing.disabled,
      enhance: Boolean(config.prompts?.enhance),
      video: Boolean(config.video),
    },
    models,
    topUpUrl: config.billing.topUpUrl,
    video: config.video
      ? {
          coinsPerSecond: config.billing.videoCost(1),
          durations: config.video.durations,
        }
      : undefined,
  };
};
