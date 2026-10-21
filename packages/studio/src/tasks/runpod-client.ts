// RunPod ComfyUI serverless client for the generate-* tasks. Rewritten from
// the host app's RunPod client: instead of resolving a workflow via
// a host model registry (getModelRuntime), every call takes the exact
// WorkflowSpec + RunpodConfig it needs, already resolved by the caller from
// `config.models`/`config.video` — package code never owns a model registry.

import { z } from "zod";

import type {
  RatioKey,
  RunpodConfig,
  StudioConfig,
  WorkflowGraph,
  WorkflowSpec,
} from "../config/types";

export const ASPECT_RATIO = [
  "1:1 (Square)",
  "3:4 (Portrait Standard)",
  "4:3 (Standard)",
  "9:16 (Portrait Widescreen)",
  "16:9 (Widescreen)",
  "21:9 (Ultrawide)",
] as const;

export type AspectRatio = (typeof ASPECT_RATIO)[number];

// Maps the UI's plain ratio key to the exact label the workflow's
// ResolutionSelector node accepts. Shared so callers only ever speak in plain
// ratios (e.g. "16:9") and this stays the single source of truth for the
// mapping.
export const RATIO_TO_ASPECT_RATIO = {
  "16:9": "16:9 (Widescreen)",
  "1:1": "1:1 (Square)",
  "21:9": "21:9 (Ultrawide)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
} satisfies Record<RatioKey, AspectRatio>;

export interface GenerateInput {
  prompt: string;
  seed?: number;
  aspect_ratio?: AspectRatio;
  /** Pure base64 pose depth map; enables the workflow's pose branch. */
  poseImage?: string;
  /** Pure base64 reference image; enables the workflow's reference branch. */
  referenceImage?: string;
  /** Enabled LoRAs, already resolved to workflow file + final strength. */
  loras?: { file: string; strength: number }[];
}

// Filenames the uploaded images are stored under in ComfyUI's input folder;
// the workflow's LoadImage nodes are patched to read them by these names.
const POSE_FILENAME = "pose.png";
const REFERENCE_FILENAME = "reference.png";
const VIDEO_SOURCE_FILENAME = "source.png";

const runpodAssetSchema = z.object({
  data: z.string().optional(),
  filename: z.string().optional(),
  type: z.string().optional(),
  url: z.string().optional(),
});

const runpodRunResultSchema = z.object({
  id: z.string(),
  status: z.string(),
});

const runpodStatusSchema = z.object({
  delayTime: z.number().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
  output: z
    .object({
      images: z.array(runpodAssetSchema).optional(),
      videos: z.array(runpodAssetSchema).optional(),
    })
    .optional(),
  status: z.string().optional(),
  workerId: z.string().optional(),
});

const workflowValueMapSchema = z.record(z.string(), z.json());

export type RunpodRunResult = z.infer<typeof runpodRunResultSchema>;
export type RunpodStatus = z.infer<typeof runpodStatusSchema>;

interface RunpodImageUpload {
  image: string;
  name: string;
}

interface RunpodRunInput {
  images?: RunpodImageUpload[];
  workflow: WorkflowGraph;
}

interface RunpodRunBody {
  input: RunpodRunInput;
  webhook?: string;
}

const runpodBaseUrl = (endpointId: string): string =>
  `https://api.runpod.ai/v2/${endpointId}`;

const authHeader = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}` });

const endpointFor = (runpod: RunpodConfig, modelId: string): string => {
  const endpointId = runpod.endpoints[modelId];
  if (!endpointId) {
    throw new Error(`no RunPod endpoint for model "${modelId}"`);
  }
  return endpointId;
};

type WorkflowKind = "image" | "video";

const targetEntries = (workflow: WorkflowSpec) =>
  Object.entries(workflow.nodes).filter(
    (entry): entry is [string, { node: string; input: string }] =>
      entry[0] !== "loraLoader" && entry[1] !== undefined
  );

const validateWorkflow = (
  modelId: string,
  kind: WorkflowKind,
  workflow: WorkflowSpec
): void => {
  for (const [name, target] of targetEntries(workflow)) {
    const node = workflow.graph[target.node];
    if (!node) {
      throw new Error(
        `workflow "${modelId}" maps ${name} to missing node "${target.node}"`
      );
    }
    if (!(target.input in node.inputs)) {
      throw new Error(
        `workflow "${modelId}" maps ${name} to missing input "${target.input}" on node "${target.node}"`
      );
    }
  }

  const loader = workflow.nodes.loraLoader;
  if (loader && !workflow.graph[loader.node]) {
    throw new Error(
      `workflow "${modelId}" maps loraLoader to missing node "${loader.node}"`
    );
  }

  if (kind === "video") {
    if (!workflow.nodes.sourceImage) {
      throw new Error(`video workflow "${modelId}" requires sourceImage`);
    }
    if (!(workflow.nodes.framesNode || workflow.nodes.durationNode)) {
      throw new Error(
        `video workflow "${modelId}" requires framesNode or durationNode`
      );
    }
    if (workflow.nodes.framesNode && workflow.nodes.durationNode) {
      throw new Error(
        `video workflow "${modelId}" cannot use both framesNode and durationNode`
      );
    }
  }
};

// Clone the workflow graph so the config's shared reference is never mutated
// across requests, then inject each variable into its mapped node. Variables
// with no node mapping (e.g. the Krea dummy) are sent through untouched.
class CompiledWorkflow {
  readonly #spec: WorkflowSpec;

  constructor(modelId: string, kind: WorkflowKind, workflow: WorkflowSpec) {
    validateWorkflow(modelId, kind, workflow);
    this.#spec = structuredClone(workflow);
  }

  buildImage(input: GenerateInput): WorkflowGraph {
    return this.#build(input);
  }

  buildVideo(input: VideoGenerateInput): WorkflowGraph {
    const { durationNode, fpsNode, framesNode, sourceImage } = this.#spec.nodes;
    const built = this.#build({ prompt: input.prompt, seed: input.seed });
    if (!sourceImage) {
      throw new Error("compiled video workflow has no source image target");
    }
    built[sourceImage.node].inputs[sourceImage.input] = VIDEO_SOURCE_FILENAME;
    if (framesNode) {
      built[framesNode.node].inputs[framesNode.input] =
        "frames" in input ? input.frames : input.durationSeconds * input.fps;
    }
    if (durationNode) {
      if (!("durationSeconds" in input)) {
        throw new Error("video workflow requires duration seconds");
      }
      built[durationNode.node].inputs[durationNode.input] =
        input.durationSeconds;
    }
    if (fpsNode) {
      if (!("fps" in input)) {
        throw new Error("video workflow requires fps");
      }
      built[fpsNode.node].inputs[fpsNode.input] = input.fps;
    }
    return built;
  }

  #build(input: GenerateInput): WorkflowGraph {
    const workflow = this.#spec;
    const cloned = structuredClone(workflow.graph);
    const {
      prompt,
      seed,
      aspectRatio,
      poseToggle,
      referenceToggle,
      referenceLoraToggle,
    } = workflow.nodes;
    if (prompt) {
      cloned[prompt.node].inputs[prompt.input] = input.prompt;
    }
    if (seed && input.seed !== undefined) {
      cloned[seed.node].inputs[seed.input] = input.seed;
    }
    if (aspectRatio && input.aspect_ratio) {
      cloned[aspectRatio.node].inputs[aspectRatio.input] = input.aspect_ratio;
    }
    // Presence of an image is the toggle: the boolean node enables the branch and
    // its LoadImage node is pointed at the uploaded filename. When absent, the
    // branch stays off and LoadImage keeps its default (example.png), which
    // always exists so validation passes.
    if (poseToggle) {
      cloned[poseToggle.node].inputs[poseToggle.input] = Boolean(
        input.poseImage
      );
    }
    if (workflow.nodes.poseImage && input.poseImage) {
      const { node, input: field } = workflow.nodes.poseImage;
      cloned[node].inputs[field] = POSE_FILENAME;
    }
    if (referenceToggle) {
      cloned[referenceToggle.node].inputs[referenceToggle.input] = Boolean(
        input.referenceImage
      );
    }
    if (referenceLoraToggle) {
      const nodeInputs = cloned[referenceLoraToggle.node].inputs;
      const slot = workflowValueMapSchema.parse(
        nodeInputs[referenceLoraToggle.input]
      );
      nodeInputs[referenceLoraToggle.input] = {
        ...slot,
        on: Boolean(input.referenceImage),
      };
    }

    if (workflow.nodes.referenceImage && input.referenceImage) {
      const { node, input: field } = workflow.nodes.referenceImage;
      cloned[node].inputs[field] = REFERENCE_FILENAME;
    }
    // Enabled LoRAs are appended as fresh `lora_N` slots after any the graph
    // already declares (e.g. the identity-edit lora_1), so the shipped graph
    // never needs a slot per configured LoRA.
    const { loraLoader } = workflow.nodes;
    if (loraLoader && input.loras?.length) {
      const loaderInputs = cloned[loraLoader.node].inputs;
      let slot = 1;
      while (`lora_${slot}` in loaderInputs) {
        slot += 1;
      }
      for (const lora of input.loras) {
        loaderInputs[`lora_${slot}`] = {
          lora: lora.file,
          on: true,
          strength: lora.strength,
        };
        slot += 1;
      }
    }
    return cloned;
  }
}

// Shared POST /run scaffolding: auth header, JSON body, webhook arming, and
// non-2xx surfacing. Callers only supply the endpoint and the `input` payload.
const postRun = async (
  runpod: RunpodConfig,
  endpointId: string,
  input: RunpodRunInput,
  webhookUrl?: string
): Promise<RunpodRunResult> => {
  const body: RunpodRunBody = { input };
  if (webhookUrl) {
    body.webhook = webhookUrl;
  }
  const response = await fetch(`${runpodBaseUrl(endpointId)}/run`, {
    body: JSON.stringify(body),
    headers: {
      ...authHeader(runpod.apiKey),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`runpod run failed: ${response.status} ${bodyText}`);
  }

  return runpodRunResultSchema.parse(await response.json());
};

interface VideoGenerateInputBase {
  prompt: string;
  seed: number;
  /** Pure base64 source image the video animates. */
  sourceImage: string;
}

export type VideoGenerateInput = VideoGenerateInputBase &
  (
    | { frames: number }
    | {
        durationSeconds: number;
        fps: number;
      }
  );

// Compiled workflows and transport share one module because callers use them
// through this single interface.
// eslint-disable-next-line max-classes-per-file
export class WorkflowExecution {
  readonly #imageWorkflows = new Map<string, CompiledWorkflow>();
  readonly #runpod: RunpodConfig;
  readonly #videoModelId?: string;
  readonly #videoWorkflow?: CompiledWorkflow;

  constructor(config: Pick<StudioConfig, "models" | "runpod" | "video">) {
    this.#runpod = config.runpod;
    for (const model of config.models) {
      if (this.#imageWorkflows.has(model.id)) {
        throw new Error(`duplicate workflow model id "${model.id}"`);
      }
      endpointFor(config.runpod, model.id);
      this.#imageWorkflows.set(
        model.id,
        new CompiledWorkflow(model.id, "image", model.workflow)
      );
    }
    if (config.video) {
      endpointFor(config.runpod, config.video.id);
      this.#videoModelId = config.video.id;
      this.#videoWorkflow = new CompiledWorkflow(
        config.video.id,
        "video",
        config.video.workflow
      );
    }
  }

  submitImage(
    modelId: string,
    input: GenerateInput,
    webhookUrl?: string
  ): Promise<RunpodRunResult> {
    const workflow = this.#imageWorkflows.get(modelId);
    if (!workflow) {
      throw new Error(`unknown image workflow "${modelId}"`);
    }
    const images: RunpodImageUpload[] = [];
    if (input.poseImage) {
      images.push({ image: input.poseImage, name: POSE_FILENAME });
    }
    if (input.referenceImage) {
      images.push({ image: input.referenceImage, name: REFERENCE_FILENAME });
    }
    const runInput: RunpodRunInput = { workflow: workflow.buildImage(input) };
    if (images.length > 0) {
      runInput.images = images;
    }
    return postRun(
      this.#runpod,
      endpointFor(this.#runpod, modelId),
      runInput,
      webhookUrl
    );
  }

  submitVideo(
    modelId: string,
    input: VideoGenerateInput,
    webhookUrl?: string
  ): Promise<RunpodRunResult> {
    if (!this.#videoWorkflow) {
      throw new Error("video workflow is not configured");
    }
    if (modelId !== this.#videoModelId) {
      throw new Error(`unknown video workflow "${modelId}"`);
    }
    return postRun(
      this.#runpod,
      endpointFor(this.#runpod, modelId),
      {
        images: [{ image: input.sourceImage, name: VIDEO_SOURCE_FILENAME }],
        workflow: this.#videoWorkflow.buildVideo(input),
      },
      webhookUrl
    );
  }

  async getStatus(modelId: string, id: string): Promise<RunpodStatus> {
    const response = await fetch(
      `${runpodBaseUrl(endpointFor(this.#runpod, modelId))}/status/${id}`,
      { headers: authHeader(this.#runpod.apiKey) }
    );
    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`runpod status failed: ${response.status} ${bodyText}`);
    }
    return runpodStatusSchema.parse(await response.json());
  }

  async cancel(modelId: string, id: string): Promise<void> {
    const response = await fetch(
      `${runpodBaseUrl(endpointFor(this.#runpod, modelId))}/cancel/${id}`,
      { headers: authHeader(this.#runpod.apiKey), method: "POST" }
    );
    if (!response.ok) {
      throw new Error(`runpod cancel failed: ${response.status}`);
    }
  }
}
