import { describe, it, expect } from 'vitest';
import {
  buildConventionSkillBody,
  buildSampleText,
  dedupeCandidates,
  truncateFile,
  verifyCandidate,
  type SampledFile,
  type RawConventionCandidate,
  type VerifiedCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionCandidate } from '@devdigest/shared';
import { MAX_FILE_LINES, MAX_SAMPLE_CHARS } from '../src/modules/conventions/constants.js';

function raw(overrides: Partial<RawConventionCandidate> = {}): RawConventionCandidate {
  return {
    rule: 'Always use async/await instead of .then() chains',
    evidence_path: 'src/api/users.ts',
    evidence_line: 1,
    evidence_snippet: 'const user = await db.users.find(id);',
    category: 'style',
    confidence: 0.9,
    ...overrides,
  };
}

function sample(path: string, lines: string[]): SampledFile {
  return { path, lines };
}

describe('truncateFile', () => {
  it('caps at MAX_FILE_LINES', () => {
    const content = Array.from({ length: MAX_FILE_LINES + 50 }, (_, i) => `line ${i}`).join('\n');
    const lines = truncateFile(content);
    expect(lines.length).toBeLessThanOrEqual(MAX_FILE_LINES);
  });
});

describe('buildSampleText', () => {
  it('renders a 1-based line-number gutter', () => {
    const text = buildSampleText([sample('a.ts', ['const x = 1;', 'const y = 2;'])]);
    expect(text).toContain('--- a.ts ---');
    expect(text).toContain('1\tconst x = 1;');
    expect(text).toContain('2\tconst y = 2;');
  });

  it('stops once the whole sample hits MAX_SAMPLE_CHARS', () => {
    const bigLine = 'x'.repeat(1000);
    const files = Array.from({ length: 200 }, (_, i) => sample(`file${i}.ts`, [bigLine]));
    const text = buildSampleText(files);
    expect(text.length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS + 200);
    expect(text).not.toContain('file199.ts');
  });
});

describe('verifyCandidate', () => {
  const sampled = [
    sample('src/api/users.ts', ['const user = await db.users.find(id);', 'const posts = await db.posts.findMany({ userId });']),
    sample('src/lib/redis.ts', ['export const redis = new Redis(config.redisUrl);']),
  ];

  it('accepts a grounded candidate on an exact path match', () => {
    const v = verifyCandidate(raw(), sampled);
    expect(v).not.toBeNull();
    expect(v!.evidencePath).toBe('src/api/users.ts');
    expect(v!.evidenceLine).toBe(1);
    expect(v!.evidenceLineEnd).toBe(1);
    expect(v!.evidenceSnippet).toBe('const user = await db.users.find(id);');
  });

  describe('multi-line snippets', () => {
    const file = sample('src/api/handlers.ts', [
      "import { db } from './db';",
      '',
      'export async function getUser(id: string) {',
      '  const user = await db.users.find(id);',
      '',
      '  const posts = await db.posts.findMany({ userId: id });',
      '  return { user, posts };',
      '}',
    ]);
    const multi = (snippet: string, line = 3) =>
      verifyCandidate(raw({ evidence_path: 'src/api/handlers.ts', evidence_line: line, evidence_snippet: snippet }), [file]);

    it('grounds consecutive lines, spanning a blank line, and stores the start-end range', () => {
      const v = multi(
        'export async function getUser(id: string) {\n  const user = await db.users.find(id);\n  const posts = await db.posts.findMany({ userId: id });',
      );
      expect(v!.evidenceLine).toBe(3);
      expect(v!.evidenceLineEnd).toBe(6);
      expect(v!.evidenceSnippet).toBe(
        'export async function getUser(id: string) {\n  const user = await db.users.find(id);\n\n  const posts = await db.posts.findMany({ userId: id });',
      );
    });

    it('slices the SOURCE lines and keeps relative indentation after dedent', () => {
      const v = multi('CONST USER = AWAIT db.users.find(id);\nconst   posts = await db.posts.findMany({ userId: id });', 99);
      expect(v!.evidenceLine).toBe(4);
      expect(v!.evidenceLineEnd).toBe(6);
      expect(v!.evidenceSnippet).toBe(
        'const user = await db.users.find(id);\n\nconst posts = await db.posts.findMany({ userId: id });',
      );
    });

    it('truncates an invented tail instead of keeping model text', () => {
      const v = multi('const user = await db.users.find(id);\nconst invented = somethingThatIsNotThere();');
      expect(v!.evidenceLine).toBe(4);
      expect(v!.evidenceLineEnd).toBe(4);
      expect(v!.evidenceSnippet).toBe('const user = await db.users.find(id);');
    });

    it('strips a copied line-number gutter before matching', () => {
      const v = multi('7\t  return { user, posts };\n8\t}');
      expect(v!.evidenceLine).toBe(7);
      expect(v!.evidenceLineEnd).toBe(8);
      expect(v!.evidenceSnippet).toBe('  return { user, posts };\n}');
    });

    it('prefers the run matching the most lines over the one nearest the claimed line', () => {
      const twice = sample('src/a.ts', ['const a = await load();', 'other();', 'const a = await load();', 'save(a);']);
      const v = verifyCandidate(
        raw({ evidence_path: 'src/a.ts', evidence_line: 1, evidence_snippet: 'const a = await load();\nsave(a);' }),
        [twice],
      );
      expect(v!.evidenceLine).toBe(3);
      expect(v!.evidenceLineEnd).toBe(4);
    });
  });

  it('resolves a claimed path via a UNIQUE suffix match', () => {
    const v = verifyCandidate(raw({ evidence_path: 'api/users.ts' }), sampled);
    expect(v).not.toBeNull();
    expect(v!.evidencePath).toBe('src/api/users.ts');
  });

  it('drops when the suffix match is ambiguous', () => {
    const ambiguous = [
      sample('a/users.ts', ['const x = 1;']),
      sample('b/users.ts', ['const x = 1;']),
    ];
    const v = verifyCandidate(raw({ evidence_path: 'users.ts' }), ambiguous);
    expect(v).toBeNull();
  });

  it('corrects a wrong line number to the nearest matching hit', () => {
    const v = verifyCandidate(raw({ evidence_line: 99 }), sampled);
    expect(v).not.toBeNull();
    expect(v!.evidenceLine).toBe(1);
  });

  it('drops an invented snippet not present in the file', () => {
    const v = verifyCandidate(raw({ evidence_snippet: 'this text does not exist anywhere' }), sampled);
    expect(v).toBeNull();
  });

  it('drops a snippet shorter than the minimum non-space length', () => {
    const v = verifyCandidate(raw({ evidence_snippet: 'ab' }), sampled);
    expect(v).toBeNull();
  });

  it('matches whitespace/case-insensitively and stores the SOURCE line, never the model text', () => {
    const v = verifyCandidate(
      raw({ evidence_snippet: 'CONST   USER = AWAIT db.users.find(id)' }),
      sampled,
    );
    expect(v).not.toBeNull();
    expect(v!.evidenceSnippet).toBe('const user = await db.users.find(id);');
  });

  it('drops when the path was never sampled', () => {
    const v = verifyCandidate(raw({ evidence_path: 'src/unrelated.ts' }), sampled);
    expect(v).toBeNull();
  });
});

describe('dedupeCandidates', () => {
  function verified(rule: string, confidence = 0.5): VerifiedCandidate {
    return {
      category: 'style',
      rule,
      evidencePath: 'a.ts',
      evidenceLine: 1,
      evidenceLineEnd: 1,
      evidenceSnippet: 'x',
      confidence,
    };
  }

  it('sorts by confidence descending', () => {
    const { kept } = dedupeCandidates([verified('low', 0.2), verified('high', 0.9)], []);
    expect(kept.map((c) => c.rule)).toEqual(['high', 'low']);
  });

  it('drops duplicates within the same batch, case/whitespace-insensitively', () => {
    const { kept, droppedDuplicate } = dedupeCandidates(
      [verified('Always use async/await'), verified('always   use async/await')],
      [],
    );
    expect(kept).toHaveLength(1);
    expect(droppedDuplicate).toBe(1);
  });

  it('drops candidates matching an already-decided rule', () => {
    const { kept, droppedDuplicate } = dedupeCandidates(
      [verified('Always use async/await')],
      ['always use async/await'],
    );
    expect(kept).toHaveLength(0);
    expect(droppedDuplicate).toBe(1);
  });
});

describe('buildConventionSkillBody', () => {
  it('merges accepted conventions into one markdown skill body', () => {
    const accepted: ConventionCandidate[] = [
      {
        id: '1',
        category: 'style',
        rule: 'Always use async/await instead of .then() chains',
        rationale: null,
        evidence_path: 'src/api/users.ts',
        evidence_line: 23,
        evidence_line_end: 23,
        evidence_snippet: 'const user = await db.users.find(id);',
        confidence: 0.91,
        status: 'accepted',
        created_at: new Date().toISOString(),
      },
    ];
    const body = buildConventionSkillBody('payments-api', accepted);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('Always use async/await instead of .then() chains');
    expect(body).toContain('Detected in `src/api/users.ts:23`:');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('cites a line range for a multi-line snippet', () => {
    const body = buildConventionSkillBody('payments-api', [
      {
        id: '1',
        category: 'style',
        rule: 'Await sequential queries',
        rationale: null,
        evidence_path: 'src/api/users.ts',
        evidence_line: 23,
        evidence_line_end: 31,
        evidence_snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });',
        confidence: 0.91,
        status: 'accepted',
        created_at: new Date().toISOString(),
      },
    ]);
    expect(body).toContain('Detected in `src/api/users.ts:23-31`:');
    expect(body).toContain('const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });');
  });

  it('fences a snippet that itself contains ``` with a longer fence', () => {
    const snippet = 'Run the checks:\n```sh\npnpm test\n```';
    const body = buildConventionSkillBody('payments-api', [
      {
        id: '1',
        category: 'testing',
        rule: 'Run pnpm test before pushing',
        rationale: null,
        evidence_path: 'CONTRIBUTING.md',
        evidence_line: 4,
        evidence_line_end: 7,
        evidence_snippet: snippet,
        confidence: 0.9,
        status: 'accepted',
        created_at: new Date().toISOString(),
      },
    ]);
    expect(body).toContain('````\n' + snippet + '\n````');
  });
});
