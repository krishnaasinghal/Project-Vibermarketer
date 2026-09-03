/**
 * @vibe/engine — VC Brain scoring + memory core
 * Deterministic math for scores; LLM optional for language only.
 */

export type * from "./types";

export {
  MemoryStore,
  DEFAULT_STORE_PATH,
  getStore,
} from "./memory/store";

export {
  extractGravityInputs,
  scoreGravity,
  scoreGravityFromSignals,
  scoreGravityFromSignals as computeGravity,
} from "./scoring/gravity";

export {
  composeFounderScore,
  composeFounderScoreFromGravity,
  composeFounderScoreFromGravity as computeFounderScore,
  type FounderScoreResult,
} from "./scoring/founder-score";

export { screenAxes, screenAxes as screenOpportunity } from "./scoring/axes";

export {
  evaluateClaims,
  parseClaimMetrics,
  dedupeClaims,
} from "./scoring/trust";

export {
  validateClaims,
  type ValidatorResult,
} from "./scoring/validator";

export {
  channelIntelligence,
  KNOWN_SOURCING_CHANNELS,
  LIVE_SOURCING_CHANNELS,
  SOON_SOURCING_CHANNELS,
  type ChannelStat,
  type ChannelIntelligence,
  type ChannelIntelInput,
} from "./scoring/channels";

export {
  inferTrackRecord,
  coherenceFromSignals,
} from "./scoring/track-record";

export { firstPassScreen, type FirstPassResult } from "./scoring/first-pass";
export { sectorMatchesThesis } from "./scoring/sector-match";

export {
  thesisFit,
  scoreHistoryTrend,
  momentumDelta,
  type ThesisFit,
} from "./scoring/thesis-fit";

export {
  evaluateConviction,
  hoursInFunnel,
  formatFunnelClock,
  softSkillBands,
  type ConvictionInput,
  type ConvictionResult,
  type TraitBand,
} from "./scoring/conviction";

export { buildMemo, decide100k } from "./memo/build";

export {
  completeJson,
  completeJsonDetailed,
  openaiChatHealth,
  polishMemoSections,
  type PolishMemoOptions,
} from "./adapters/openai";

export {
  isXaiConfigured,
  xaiHealth,
  generateImage,
  analyzeImage,
  buildSocialCreativePrompt,
  type XaiImageResult,
  type XaiVisionResult,
  type XaiHealth,
} from "./adapters/xai";

export { startRun, step, stepLocal, type TraceRun } from "./trace";

export { queryMemory, tokenizeQuery, extractFilters } from "./query";

export { runVcBrainPipeline, type PipelineResult } from "./pipeline";

export {
  runDeepResearch,
  type DeepResearchOpts,
} from "./research/deep-research";
export { planResearchQueries } from "./research/plan";
export {
  enrichFromProfile,
  type ProfileEnrichResult,
  type ProfileSignal,
} from "./research/profile-enrich";
export type {
  ResearchDossier,
  ResearchFinding,
  ResearchHit,
  ResearchProvider,
} from "./research/types";

export {
  runAgentLanes,
  runCodeForensicsLane,
  runWebResearchLane,
  runClaimValidatorLane,
  runHnScoutLane,
  runMemoryWriterLane,
  AGENT_ENDPOINT_CATALOG,
  type AgentLaneResult,
  type AgentFleetResult,
} from "./agents/lanes";

export {
  MARKETING_AGENT_CATALOG,
  marketingAgentsByStatus,
  marketingAgentSummary,
  type MarketingAgentDef,
  type MarketingAgentStatus,
} from "./agents/marketing-catalog";

export {
  runRedditAgent,
  type RedditAgentResult,
  type RedditOpportunity,
} from "./agents/reddit-agent";

export {
  runSeoAgent,
  type SeoAgentResult,
  type SeoBlogDraft,
  type SeoKeyword,
} from "./agents/seo-agent";

export {
  runHnAgent,
  type HnAgentResult,
  type HnOpportunity,
  type HnStory,
} from "./agents/hn-agent";

export {
  runSiteScorecard,
  type SiteScorecard,
  type ScoreCheck,
} from "./research/site-scorecard";

export {
  fetchPageSpeed,
  isPageSpeedConfigured,
  type PageSpeedScores,
} from "./research/pagespeed";

export {
  normalizeThesis,
  normalizeOwnershipTarget,
  ownershipToPercent,
  defaultThesis,
} from "./thesis";

export * from "./connectors/index";

export {
  UNTRUSTED_SCRAPE_SYSTEM,
  wrapUntrustedScrapedData,
  buildUntrustedExtractUser,
} from "./prompts/untrusted-scrape";

export {
  processOutboundSourcing,
  type OutboundSourcingResult,
  type OutboundFounderExtract,
} from "./pipeline/outbound";

export {
  executeAutomatedDiligence,
  type ClaimVerificationItem,
  type DiligenceRecord,
} from "./pipeline/diligence";

export {
  syncBrandMemory,
  recallBrandMemory,
  writeBrandEpisode,
  containerForBrand,
  brandContainerForWorkspace,
  buildCoreBrandLines,
  buildSemanticFactPayload,
  brandSlug,
  taskSearchQuery,
  type BrandMemoryInput,
  type BrandFact,
  type BrandFactStatus,
  type BrandSyncResult,
  type BrandRecallTask,
  type BrandRecallResult,
  type BrandEpisodeKind,
  type BrandEpisodeResult,
} from "./memory/brand-memory";
