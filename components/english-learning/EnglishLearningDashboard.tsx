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
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type {
  EnglishDimension,
  EnglishEvidenceState,
  EnglishLearnerProfile,
  EnglishProfileClaim,
  EnglishProfileLoadResult,
} from '@/lib/english-learning/types';

import styles from './EnglishLearningDashboard.module.scss';

const DIMENSION_LABELS: Record<string, string> = {
  range: 'Range',
  accuracy: 'Accuracy',
  fluency: 'Fluency',
  interaction: 'Interaction',
  coherence: 'Coherence',
  pronunciation_intelligibility: 'Pronunciation',
  active_vocabulary: 'Active vocabulary',
  repair_ability: 'Repair ability',
  spontaneous_complexity: 'Spontaneous complexity',
  transfer: 'Transfer',
};

const STATE_LABELS: Record<EnglishEvidenceState, string> = {
  insufficient_evidence: 'Not enough evidence',
  emerging: 'Emerging',
  developing: 'Developing',
  stable: 'Stable',
  strong: 'Strong',
};

const STATE_LEVEL: Record<EnglishEvidenceState, number> = {
  insufficient_evidence: 0,
  emerging: 1,
  developing: 2,
  stable: 3,
  strong: 4,
};

function claimText(claim: EnglishProfileClaim): string {
  return claim.label || claim.area || claim.pattern || claim.note || 'Evidence-based observation';
}

function priorityText(priority: string | EnglishProfileClaim): string {
  return typeof priority === 'string' ? priority : claimText(priority);
}

function SkillMeter({ dimension }: { dimension: EnglishDimension }) {
  const active = STATE_LEVEL[dimension.state];
  return (
    <div className={styles.skillMeter} aria-label={STATE_LABELS[dimension.state]}>
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          className={`${styles.skillSegment} ${index < active ? styles.segmentActive : ''}`}
        />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <CircleDashed size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}

function SourceUnavailable({ result }: { result: EnglishProfileLoadResult }) {
  return (
    <Card className={styles.sourceCard}>
      <div className={styles.sourceIcon} aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div>
        <p className={styles.eyebrow}>English Speaking Lab</p>
        <h2>Dashboard preparado, fuente todavía no disponible</h2>
        <p>{result.notice}</p>
        <p className={styles.muted}>
          No se muestran niveles, XP ni habilidades simuladas. Cuando la lectura canónica esté
          configurada, esta misma pantalla se completa con evidencia real.
        </p>
      </div>
    </Card>
  );
}

function Hero({ profile, notice }: { profile: EnglishLearnerProfile; notice: string }) {
  const activity = profile.activity;
  const currentPriority = profile.current_priorities[0];
  const cefr = profile.working_cefr;

  return (
    <Card className={styles.hero}>
      <div className={styles.heroMain}>
        <div className={styles.levelOrb} aria-hidden="true">
          <MessageCircle size={25} />
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>English Speaking</p>
          <div className={styles.levelRow}>
            <h2>{cefr?.range ?? 'Baseline'}</h2>
            <span className={styles.statusPill}>
              {profile.baseline_status === 'collecting' ? 'Collecting evidence' : 'Profile ready'}
            </span>
          </div>
          <p className={styles.summary}>{profile.summary || notice}</p>
          <p className={styles.canonicalNote}>{notice}</p>
        </div>
      </div>

      <div className={styles.heroStats}>
        <div className={styles.heroStat}>
          <span className={styles.heroStatIcon} aria-hidden="true">
            <Target size={17} />
          </span>
          <div>
            <span className={styles.statLabel}>Current focus</span>
            <strong>{
              currentPriority ? priorityText(currentPriority) : 'Build a reliable speaking baseline'
            }</strong>
          </div>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroStatIcon} aria-hidden="true">
            <Flame size={17} />
          </span>
          <div>
            <span className={styles.statLabel}>Momentum</span>
            <strong>
              {activity?.conversations_this_week !== undefined
                ? `${activity.conversations_this_week} conversations this week`
                : 'Activity data not connected yet'}
            </strong>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Skills({ profile }: { profile: EnglishLearnerProfile }) {
  const dimensions = Object.entries(profile.dimensions);

  return (
    <Card>
      <SectionHeader
        title="Skill map"
        description="Evidence-backed abilities. No hidden 0–100 score."
        icon={Sparkles}
        domain="learning"
      />
      <div className={styles.skillGrid}>
        {dimensions.map(([key, dimension]) => (
          <div key={key} className={`${styles.skill} ${styles[`state_${dimension.state}`]}`}>
            <div className={styles.skillTop}>
              <strong>{DIMENSION_LABELS[key] ?? key}</strong>
              <span>{STATE_LABELS[dimension.state]}</span>
            </div>
            <SkillMeter dimension={dimension} />
            <div className={styles.skillMeta}>
              <span>{dimension.evidence_count} evidence</span>
              <span>{dimension.confidence} confidence</span>
              {dimension.trend !== 'insufficient_evidence' ? <span>{dimension.trend}</span> : null}
            </div>
            {dimension.note ? <p>{dimension.note}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Quests({ profile }: { profile: EnglishLearnerProfile }) {
  return (
    <Card>
      <SectionHeader
        title="Current quests"
        description="Challenges chosen from real learning priorities."
        icon={Target}
        domain="learning"
      />
      {profile.quests.length ? (
        <div className={styles.stack}>
          {profile.quests.map((quest) => (
            <article key={quest.id} className={styles.quest}>
              <div className={styles.questIcon} aria-hidden="true">
                {quest.status === 'complete' ? <CheckCircle2 size={20} /> : <Target size={20} />}
              </div>
              <div>
                <div className={styles.questTitleRow}>
                  <strong>{quest.title}</strong>
                  <span>{quest.status ?? 'available'}</span>
                </div>
                <p>{quest.description}</p>
                {quest.targets?.length ? (
                  <div className={styles.tags}>
                    {quest.targets.map((target) => (
                      <span key={target}>{target}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No quest assigned yet"
          body="The first quest will appear after the baseline provides a reliable priority."
        />
      )}
    </Card>
  );
}

function Vocabulary({ profile }: { profile: EnglishLearnerProfile }) {
  return (
    <Card>
      <SectionHeader
        title="Vocabulary arsenal"
        description="Expressions progress only when you can actually retrieve them."
        icon={BookOpen}
        domain="learning"
      />
      {profile.vocabulary.length ? (
        <div className={styles.vocabularyList}>
          {profile.vocabulary.slice(0, 12).map((item) => (
            <div key={item.expression} className={styles.vocabularyItem}>
              <div>
                <strong>{item.expression}</strong>
                {item.meaning ? <p>{item.meaning}</p> : null}
              </div>
              <span className={styles.vocabularyStatus}>{item.status.replaceAll('_', ' ')}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Arsenal not built yet"
          body="Expressions will appear after they have useful evidence beyond a single exposure."
        />
      )}
    </Card>
  );
}

function ProgressEvidence({ profile }: { profile: EnglishLearnerProfile }) {
  return (
    <Card>
      <SectionHeader
        title="Evidence & progress"
        description="What the system can currently defend about your English."
        icon={ShieldCheck}
        domain="learning"
      />
      <div className={styles.evidenceColumns}>
        <div>
          <h3>Strengths</h3>
          {profile.strengths.length ? (
            <ul className={styles.evidenceList}>
              {profile.strengths.map((strength, index) => (
                <li key={`${claimText(strength)}-${index}`}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{claimText(strength)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Waiting for repeated evidence.</p>
          )}
        </div>
        <div>
          <h3>Targets</h3>
          {profile.current_priorities.length ? (
            <ul className={styles.evidenceList}>
              {profile.current_priorities.map((target, index) => (
                <li key={`${priorityText(target)}-${index}`}>
                  <Target size={16} aria-hidden="true" />
                  <span>{priorityText(target)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Baseline first; priorities come after evidence.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function AchievementsAndCoverage({ profile }: { profile: EnglishLearnerProfile }) {
  return (
    <Card>
      <SectionHeader
        title="Journey"
        description="Meaningful achievements and recent practice coverage."
        icon={Trophy}
        domain="learning"
      />
      <div className={styles.evidenceColumns}>
        <div>
          <h3>Achievements</h3>
          {profile.achievements.length ? (
            <div className={styles.stack}>
              {profile.achievements.slice(0, 6).map((achievement) => (
                <div key={achievement.id} className={styles.achievement}>
                  <Trophy size={17} aria-hidden="true" />
                  <div>
                    <strong>{achievement.title}</strong>
                    <p>{achievement.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Achievements unlock from demonstrated behavior.</p>
          )}
        </div>
        <div>
          <h3>Recent coverage</h3>
          <p className={styles.coverageLabel}>Domains</p>
          <div className={styles.tags}>
            {profile.coverage.recent_domains.length ? (
              profile.coverage.recent_domains.map((domain) => <span key={domain}>{domain}</span>)
            ) : (
              <span>No data yet</span>
            )}
          </div>
          <p className={styles.coverageLabel}>Speaking functions</p>
          <div className={styles.tags}>
            {profile.coverage.recent_functions.length ? (
              profile.coverage.recent_functions.map((fn) => <span key={fn}>{fn}</span>)
            ) : (
              <span>No data yet</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function EnglishLearningDashboard({ result }: { result: EnglishProfileLoadResult }) {
  if (!result.profile) return <SourceUnavailable result={result} />;

  return (
    <div className={styles.dashboard}>
      <Hero profile={result.profile} notice={result.notice} />
      <Skills profile={result.profile} />
      <div className={styles.twoColumns}>
        <Quests profile={result.profile} />
        <Vocabulary profile={result.profile} />
      </div>
      <div className={styles.twoColumns}>
        <ProgressEvidence profile={result.profile} />
        <AchievementsAndCoverage profile={result.profile} />
      </div>
    </div>
  );
}
