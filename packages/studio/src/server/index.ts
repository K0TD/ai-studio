// biome-ignore-all lint/performance/noBarrelFile: this is the package's "/server" entry point
export { createStudioHandlers, type StudioRouteHandlers } from "./handlers";
export { embedPngText } from "./png-metadata";
export { applyWatermarks } from "./watermark";
export {
  canTransitionGeneration,
  GenerationRepository,
} from "./generation-repository";
export type {
  CreateGenerationInput,
  RealtimeInfo,
} from "./generation-repository";
