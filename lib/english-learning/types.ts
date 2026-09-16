export type EnglishEvidenceState =
  | 'insufficient_evidence'
  | 'emerging'
  | 'developing'
  | 'stable'
  | 'strong';

export type EnglishTrend =
  | 'improving'
  | 'stable'
  | 'inconsistent'
  | 'regressing_candidate'
  | 'insufficient_evidence';

export type EnglishConfidence = 'low' | 'medium' | 'high';

export interface EnglishDimension {
  state: EnglishEvidenceState;
  trend: EnglishTrend;
  confidence: EnglishConfidence;
  evidence_count: number;
  note?: string;
}

export interface EnglishWorkingCefr {
  range: string;
  confidence: EnglishConfidence;
  evidence_summary?: string;
  observed?: string;
}

export interface EnglishProfileClaim {
  area?: string;
  label?: string;
  pattern?: string;
  note?: string;
  confidence?: EnglishConfidence;
  evidence_count?: number;
  first_observed?: string;
  last_observed?: string;
  trend?: EnglishTrend;
}

export type EnglishVocabularyStatus =
  | 'seen'
  | 'understood'
  | 'used_with_help'
  | 'used_spontaneously'
  | 'active';

export interface EnglishVocabularyItem {
  expression: string;
  status: EnglishVocabularyStatus;
  meaning?: string;
  evidence_count?: number;
  last_observed?: string;
}

export interface EnglishQuest {
  id: string;
  title: string;
  description: string;
  status?: 'available' | 'active' | 'complete';
  targets?: string[];
  evidence_note?: string;
}

export interface EnglishAchievement {
  id: string;
  title: string;
  description: string;
  earned_at?: string;
  kind?: 'proficiency' | 'practice';
}

export interface EnglishActivity {
  conversations_this_week?: number;
  speaking_minutes_this_week?: number;
  weekly_target?: number;
  active_days?: string[];
  practice_xp?: number;
}

export interface EnglishLearnerProfile {
  schema_version: number;
  project_id: string;
  updated: string;
  baseline_status: 'collecting' | 'ready';
  working_cefr: EnglishWorkingCefr | null;
  summary: string;
  dimensions: Record<string, EnglishDimension>;
  strengths: EnglishProfileClaim[];
  recurring_weaknesses: EnglishProfileClaim[];
  pronunciation_targets: EnglishProfileClaim[];
  vocabulary: EnglishVocabularyItem[];
  current_priorities: Array<string | EnglishProfileClaim>;
  quests: EnglishQuest[];
  achievements: EnglishAchievement[];
  coverage: {
    recent_domains: string[];
    recent_functions: string[];
  };
  activity: EnglishActivity | null;
  evidence_notes?: string[];
}

export type EnglishProfileSourceState = 'ready' | 'unconfigured' | 'unavailable' | 'invalid';

export interface EnglishProfileLoadResult {
  state: EnglishProfileSourceState;
  profile: EnglishLearnerProfile | null;
  notice: string;
}
