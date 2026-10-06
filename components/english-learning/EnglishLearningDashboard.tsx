import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Flame,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type {
  EnglishDimension,
  EnglishEvidenceState,
  EnglishLearnerProfile,
  EnglishProfileClaim,
  EnglishProfileLoadResult,
} from "@/lib/english-learning/types";

import styles from "./EnglishLearningDashboard.module.scss";

const DIMENSION_LABELS: Record<string, string> = {
  range: "Range",
  accuracy: "Accuracy",
  fluency: "Fluency",
  interaction: "Interaction",
  coherence: "Coherence",
  pronunciation_intelligibility: "Pronunciation",
  active_vocabulary: "Active vocabulary",
  repair_ability: "Repair ability",
  spontaneous_complexity: "Spontaneous complexity",
  transfer: "Transfer",
};

const STATE_LABELS: Record<EnglishEvidenceState, string> = {
  insufficient_evidence: "Not enough evidence",
  emerging: "Emerging",
  developing: "Developing",
  stable: "Stable",
  strong: "Strong",
};

const STATE_LEVEL: Record<EnglishEvidenceState, number> = {
  insufficient_evidence: 0,
  emerging: 1,
  developing: 2,
  stable: 3,
  strong: 4,
};

function claimText(claim: EnglishProfileClaim): string {
  return (
    claim.label ||
    claim.area ||
    claim.pattern ||
    claim.note ||
    "Evidence-based observation"
  );
}

function priorityText(priority: string | EnglishProfileClaim): string {
  return typeof priority === "string" ? priority : claimText(priority);
}

function stateClassName(state: EnglishEvidenceState): string {
  return styles[`state-${state.replaceAll("_", "-")}`] ?? "";
}

function SkillMeter({ dimension }: { dimension: EnglishDimension }) {
  const active = STATE_LEVEL[dimension.state];
  return (
    <div
      className={styles["skill-meter"]}
      aria-label={STATE_LABELS[dimension.state]}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={in...[truncated]