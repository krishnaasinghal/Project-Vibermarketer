/**
 * Thin re-export — all screening/memo logic lives in @vibe/engine.
 * Keep this file so existing `@/lib/pipeline` imports keep working.
 */
export {
  runVcBrainPipeline,
  type PipelineResult,
} from "@vibe/engine";
