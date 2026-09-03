/** Platform / identity handles for a founder. */
export type Handles = {
  github?: string;
  twitter?: string;
  x?: string;
  linkedin?: string;
  hn?: string;
  producthunt?: string;
  email?: string;
  [key: string]: string | undefined;
};

/** Source-tagged observation about a founder or product. */
export type Signal = {
  id: string;
  entity_type: 'founder' | 'product';
  entity_id: string;
  source: string;
  url?: string;
  payload: Record<string, unknown>;
  observed_at: string;
  ingested_at: string;
};

/** Per-claim trust unit — never invent; flag contradictions. */
export type Claim = {
  text: string;
  category: string;
  evidence_url?: string;
  confidence: number;
  contradiction: boolean;
  contradiction_note?: string;
};

/** Components feeding distribution gravity. */
export type GravityComponents = {
  velocity: number;
  pull_ratio: number;
  cadence: number;
  stars: number;
  forks: number;
  hn_points: number;
  followers: number;
  engagement: number;
  post_count: number;
  shipping_events: number;
  audience: number;
  external_engagement: number;
  own_output: number;
};

/** Distribution-gravity breakdown (deterministic). */
export type GravityBreakdown = {
  gravity_score: number;
  confidence: number;
  components: GravityComponents;
  evidence: string[];
  abstain?: boolean;
  abstain_reason?: string;
};

/** Point-in-time Founder Score — Memory never resets; history shows trend. */
export type ScoreHistoryPoint = {
  score: number;
  confidence: number;
  at: string;
  gravity?: number;
};

/** Outbound activate → inbound converge track. */
export type Activation = {
  status: "none" | "drafted" | "sent" | "applied";
  channel?: "email" | "x" | "linkedin";
  subject?: string;
  body?: string;
  drafted_at?: string;
  sent_at?: string;
  applied_at?: string;
  note?: string;
};

/** Persistent founder record — Founder Score never resets. */
export type Founder = {
  id: string;
  name: string;
  handles: Handles;
  links: string[];
  bio?: string;
  claims: Claim[];
  founder_score: number;
  score_confidence: number;
  gravity: GravityBreakdown;
  /** Cap ~20; newest last. Surfaces trend over time (brief Memory pillar). */
  score_history?: ScoreHistoryPoint[];
  activation?: Activation;
  created_at: string;
  updated_at: string;
};

/** Product / company attached to a founder. */
export type Product = {
  id: string;
  founder_id: string;
  name: string;
  domain?: string;
  oneliner?: string;
  sector?: string;
  stage?: string;
  traction_claims: Claim[];
};

export type Trend = 'improving' | 'declining' | 'stable';

/** Market stance — brief: bullish / neutral / bear (not strong/weak). */
export type MarketStance = "bullish" | "neutral" | "bear";

/**
 * Single screening axis. NEVER average founder/market/idea into one number.
 */
export type AxisScore = {
  score: number;
  /** Human label — market axis uses bullish/neutral/bear. */
  label: string;
  trend: Trend;
  rationale: string;
  confidence: number;
  abstain?: boolean;
  /** Present on market axis. */
  stance?: MarketStance;
};

/** Three independent axes for one opportunity. */
export type Screening = {
  founder_id: string;
  product_id?: string;
  founder_axis: AxisScore;
  market_axis: AxisScore;
  idea_axis: AxisScore;
  scored_at: string;
};

export type MemoSectionKey =
  | 'company_snapshot'
  | 'investment_hypotheses'
  | 'swot'
  | 'problem_product'
  | 'traction_kpis'
  | 'team_history'
  | 'technology_defensibility'
  | 'market_sizing'
  | 'competition'
  | 'financials'
  | 'cap_table'
  | 'due_diligence_log'
  | 'exit_perspective'
  | 'decision';

export type MemoSection = {
  key: MemoSectionKey | string;
  title: string;
  body: string;
  required: boolean;
};

export type Decision = 'yes' | 'no' | 'watch';

/** Evidence-backed investment memo + $100K decision. */
export type Memo = {
  id: string;
  founder_id: string;
  product_id?: string;
  sections: MemoSection[];
  decision: Decision;
  decision_conf: number;
  claims: Claim[];
  gaps: string[];
  created_at: string;
};

/** Configurable fund thesis — filters every recommendation. */
export type Thesis = {
  sectors: string[];
  stage: string;
  geo: string;
  check_size: number;
  ownership_target: number;
  risk: 'low' | 'medium' | 'high' | string;
};

/** Step-level agentic traceability record. */
export type TraceStep = {
  run_id: string;
  step: string;
  input: unknown;
  output: unknown;
  evidence: string[];
  ts: string;
};

/** Aggregated public metrics extracted from signals for scoring. */
export type GravityInputs = {
  stars: number;
  forks: number;
  hn_points: number;
  followers: number;
  engagement: number;
  post_count: number;
  shipping_events: number;
  /** Window in months for cadence; default 3. */
  window_months?: number;
  evidence?: string[];
};

export type FounderScoreInputs = {
  gravity_score: number;
  gravity_confidence: number;
  cadence: number;
  /** 0–100; default mid (50) when unknown. */
  coherence?: number;
  /** 0–100; omit to redistribute weight (anti cold-start bias). */
  track_record?: number | null;
  evidence?: string[];
};

export type AxisScreenInput = {
  founder: Founder;
  product?: Product;
  thesis?: Thesis | null;
  /** Prior screenings for trend (oldest → newest). */
  history?: Screening[];
  claims?: Claim[];
};

export type MemoBuildInput = {
  founder: Founder;
  product?: Product;
  screening: Screening;
  thesis?: Thesis | null;
  claims?: Claim[];
  extra_gaps?: string[];
  /** Cite-bound deep research dossier (optional). */
  research?: {
    findings: Array<{
      claim: string;
      topic: string;
      support: string;
      confidence: number;
      citations: Array<{ url: string; snippet: string }>;
    }>;
    open_questions: string[];
    synthesis: string;
    partial: boolean;
    provider_status: Record<string, string>;
  } | null;
};

export type QueryResult = {
  founders: Founder[];
  products: Product[];
  matched_terms: string[];
};

/** On-disk / in-memory persistence shape. */
export type StoreData = {
  founders: Founder[];
  products: Product[];
  signals: Signal[];
  thesis: Thesis | null;
  screenings: Screening[];
  memos: Memo[];
  traces: TraceStep[];
};
