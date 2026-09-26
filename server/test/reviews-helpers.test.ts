import { describe, it, expect } from 'vitest';
import { skillBlock, skillLogLines, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('skillBlock', () => {
  it('names a manual skill and trims its body', () => {
    expect(skillBlock({ name: 'API Breaking Change Rubric', source: 'manual', body: '  Flag removed fields.\n' })).toBe(
      '### Skill: API Breaking Change Rubric\nFlag removed fields.',
    );
  });

  it('labels an imported skill with its source, without an untrusted wrapper', () => {
    const block = skillBlock({ name: 'Test Coverage Nudge', source: 'imported_url', body: 'Add tests.' });
    expect(block).toBe('### Skill: Test Coverage Nudge (imported url)\nAdd tests.');
    expect(block).not.toContain('<untrusted');
  });
});

describe('skillLogLines', () => {
  it('lists each attached skill with its tokens, then the skipped ones by name', () => {
    expect(
      skillLogLines(
        [
          { name: 'API Breaking Change Rubric', type: 'rubric', tokens: 40 },
          { name: 'REST Contract Versioning Convention', type: 'convention', tokens: 60 },
        ],
        ['Test Coverage Nudge'],
      ),
    ).toEqual([
      'Skills: 2 enabled skill(s) attached (+100 tokens)',
      '  • API Breaking Change Rubric (rubric, ~40 tokens)',
      '  • REST Contract Versioning Convention (convention, ~60 tokens)',
      'Skills: 1 linked skill(s) skipped (disabled): Test Coverage Nudge',
    ]);
  });

  it('names linked dangerous skills on their own skipped line', () => {
    expect(skillLogLines([], [], ['Injected Skill'])).toEqual([
      'Skills: 1 linked skill(s) skipped (dangerous content): Injected Skill',
    ]);
  });

  it('logs nothing when the agent has no linked skills', () => {
    expect(skillLogLines([], [])).toEqual([]);
  });
});
