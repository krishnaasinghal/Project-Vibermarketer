/** Pipeline stage labels — ids match `runVcBrainPipeline` step names. */

export const PIPELINE_STEPS = [
  { id: "first_pass", label: "Screening · first-pass" },
  { id: "load_signals", label: "Memory · load signals" },
  { id: "agent_lanes", label: "Sourcing · agent lanes" },
  { id: "deep_research_plan", label: "Diligence · research plan" },
  { id: "deep_research_collect", label: "Diligence · multi-search" },
  { id: "deep_research_synthesize", label: "Diligence · synthesize" },
  { id: "distribution_gravity", label: "Screening · gravity" },
  { id: "trust_claims", label: "Diligence · Trust check" },
  { id: "validator", label: "Diligence · validator" },
  { id: "url_diligence", label: "Diligence · URL verify" },
  { id: "three_axis_screen", label: "Screening · 3 axes" },
  { id: "memo_decision", label: "Decision · $100K" },
] as const;
