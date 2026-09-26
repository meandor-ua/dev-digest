import { describe, it, expect } from 'vitest';
import {
  perPrThenMean,
  costTrend,
  scoreTrend,
  findingsBySeverity,
  findingsByCategory,
  runHistory,
  mostUsedSkills,
  isoWeek,
  lastIsoWeeks,
  buildCardStats,
  buildRepoStats,
  type RunRow,
  type FindingRow,
} from '../src/modules/agents/stats.js';

function run(partial: Partial<RunRow> & { runId: string }): RunRow {
  return {
    prId: 'pr1',
    prNumber: 1,
    ranAt: new Date('2026-01-15T00:00:00Z'),
    score: null,
    costUsd: null,
    durationMs: null,
    tokensIn: null,
    tokensOut: null,
    findingsCount: null,
    source: 'local',
    hasTrace: false,
    ...partial,
  };
}

describe('perPrThenMean (per-PR first, then across PRs)', () => {
  it('averages within a PR before averaging across PRs', () => {
    const runs = [
      run({ runId: 'a', prId: 'pr1', score: 100 }),
      run({ runId: 'b', prId: 'pr1', score: 0 }), // pr1 mean = 50
      run({ runId: 'c', prId: 'pr2', score: 80 }), // pr2 mean = 80
    ];
    // mean(50, 80) = 65 — NOT the flat mean of (100,0,80)=60.
    expect(perPrThenMean(runs, (r) => r.score)).toBe(65);
  });

  it('skips null values and returns null when nothing has a value', () => {
    const runs = [
      run({ runId: 'a', prId: 'pr1', costUsd: null }),
      run({ runId: 'b', prId: 'pr1', costUsd: 0.04 }),
    ];
    expect(perPrThenMean(runs, (r) => r.costUsd)).toBe(0.04);
    expect(perPrThenMean([run({ runId: 'x' })], (r) => r.score)).toBeNull();
  });

  it('treats runs with no PR as their own group', () => {
    const runs = [
      run({ runId: 'a', prId: null, score: 10 }),
      run({ runId: 'b', prId: null, score: 90 }),
    ];
    expect(perPrThenMean(runs, (r) => r.score)).toBe(50);
  });
});

describe('costTrend', () => {
  it('is null with 10 or fewer runs', () => {
    const runs = Array.from({ length: 10 }, (_, i) => run({ runId: `r${i}`, costUsd: 0.05 }));
    expect(costTrend(runs)).toBeNull();
  });

  it('compares overall mean to the mean excluding the 10 most recent runs', () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    // 11 runs: the oldest is cheap (0.00), the 10 most recent are 0.10.
    const runs: RunRow[] = [];
    runs.push(run({ runId: 'old', ranAt: new Date(base), costUsd: 0 }));
    for (let i = 1; i <= 10; i++) {
      runs.push(run({ runId: `r${i}`, ranAt: new Date(base + i * 86400000), costUsd: 0.1 }));
    }
    // allMean = (0 + 10*0.1)/11 ≈ 0.0909 ; earlier(=just the old one)=0 → trend ≈ +0.0909
    const trend = costTrend(runs)!;
    expect(trend).toBeGreaterThan(0);
    expect(trend).toBeCloseTo(0.0909, 3);
  });
});

describe('ISO week helpers', () => {
  it('computes ISO week number', () => {
    // 2026-01-15 is in ISO week 3.
    expect(isoWeek(new Date('2026-01-15T00:00:00Z')).week).toBe(3);
  });

  it('returns 6 consecutive weeks oldest→newest', () => {
    const weeks = lastIsoWeeks(new Date('2026-02-15T00:00:00Z'));
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.label.startsWith('w'))).toBe(true);
  });
});

describe('scoreTrend', () => {
  it('produces one point per week, empty weeks = 0', () => {
    const now = new Date('2026-02-15T00:00:00Z');
    const runs = [run({ runId: 'a', ranAt: now, score: 80 })];
    const trend = scoreTrend(runs, now);
    expect(trend).toHaveLength(6);
    expect(trend[trend.length - 1]!.value).toBe(80);
    expect(trend[0]!.value).toBe(0);
  });
});

describe('findingsBySeverity', () => {
  it('buckets findings into the last 6 weeks by severity', () => {
    const now = new Date('2026-02-15T00:00:00Z');
    const findings: FindingRow[] = [
      { severity: 'CRITICAL', category: 'security', ranAt: now },
      { severity: 'WARNING', category: 'perf', ranAt: now },
      { severity: 'SUGGESTION', category: 'style', ranAt: now },
    ];
    const weeks = findingsBySeverity(findings, now);
    expect(weeks).toHaveLength(6);
    const last = weeks[weeks.length - 1]!;
    expect(last).toMatchObject({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
  });
});

describe('findingsByCategory', () => {
  it('counts and sorts categories descending', () => {
    const findings: FindingRow[] = [
      { severity: 'WARNING', category: 'perf', ranAt: new Date() },
      { severity: 'WARNING', category: 'perf', ranAt: new Date() },
      { severity: 'CRITICAL', category: 'security', ranAt: new Date() },
    ];
    expect(findingsByCategory(findings)).toEqual([
      { label: 'perf', value: 2 },
      { label: 'security', value: 1 },
    ]);
  });
});

describe('runHistory', () => {
  it('returns the 5 newest runs and sums tokens', () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    const runs = Array.from({ length: 7 }, (_, i) =>
      run({ runId: `r${i}`, ranAt: new Date(base + i * 86400000), tokensIn: 100, tokensOut: 20 }),
    );
    const hist = runHistory(runs);
    expect(hist).toHaveLength(5);
    expect(hist[0]!.run_id).toBe('r6'); // newest first
    expect(hist[0]!.tokens).toBe(120);
  });

  it('tokens are null when both token counts are null', () => {
    const hist = runHistory([run({ runId: 'a', tokensIn: null, tokensOut: null })]);
    expect(hist[0]!.tokens).toBeNull();
  });
});

describe('mostUsedSkills', () => {
  it('is a 100% placeholder per enabled skill, in order', () => {
    expect(mostUsedSkills(['A', 'B'])).toEqual([
      { label: 'A', value: 100 },
      { label: 'B', value: 100 },
    ]);
  });
});

describe('assemblers', () => {
  it('buildCardStats reports counts and per-PR averages', () => {
    const runs = [
      run({ runId: 'a', prId: 'pr1', score: 80, costUsd: 0.04 }),
      run({ runId: 'b', prId: 'pr2', score: 60, costUsd: 0.06 }),
    ];
    expect(buildCardStats('ag1', 3, runs)).toEqual({
      agent_id: 'ag1',
      skills_count: 3,
      runs: 2,
      avg_score: 70,
      avg_cost_usd: 0.05,
    });
  });

  it('buildRepoStats fills every section', () => {
    const now = new Date('2026-02-15T00:00:00Z');
    const stats = buildRepoStats({
      agentId: 'ag1',
      repoId: 'repo1',
      runs: [run({ runId: 'a', ranAt: now, score: 80, costUsd: 0.04, durationMs: 10000 })],
      findings: [{ severity: 'CRITICAL', category: 'security', ranAt: now }],
      enabledSkillNames: ['Sec'],
      now,
    });
    expect(stats.runs).toBe(1);
    expect(stats.avg_score).toBe(80);
    expect(stats.avg_duration_ms).toBe(10000);
    expect(stats.cost_trend).toBeNull();
    expect(stats.score_trend).toHaveLength(6);
    expect(stats.findings_by_severity).toHaveLength(6);
    expect(stats.findings_by_category).toEqual([{ label: 'security', value: 1 }]);
    expect(stats.most_used_skills).toEqual([{ label: 'Sec', value: 100 }]);
    expect(stats.run_history).toHaveLength(1);
  });
});
