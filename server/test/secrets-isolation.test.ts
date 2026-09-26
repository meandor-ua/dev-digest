import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { ConfigError } from '../src/platform/errors.js';
import type { Db } from '../src/db/client.js';

// Guards vitest.config.ts `test.env`: a test that forgets to inject a mock
// provider must fail fast, never spend the developer's real API keys.
describe('test runs are isolated from real secrets', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  it("does not read the developer's ~/.devdigest/secrets.json", () => {
    expect(config.secretsPath.startsWith(homedir())).toBe(false);
  });

  it.each(['openai', 'openrouter', 'anthropic'] as const)('an un-mocked %s provider throws ConfigError', async (id) => {
    const container = new Container(config, {} as Db);
    await expect(container.llm(id)).rejects.toBeInstanceOf(ConfigError);
  });

  it('an un-mocked GitHub client throws ConfigError', async () => {
    const container = new Container(config, {} as Db);
    await expect(container.github()).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('DEVDIGEST_SECRETS_PATH', () => {
  const base = { DATABASE_URL: 'postgres://x/y', NODE_ENV: 'test' } as NodeJS.ProcessEnv;

  it('overrides where BYO keys are stored', () => {
    expect(loadConfig({ ...base, DEVDIGEST_SECRETS_PATH: '/tmp/keys.json' }).secretsPath).toBe('/tmp/keys.json');
  });

  it('falls back to ~/.devdigest/secrets.json when unset or empty (.env.example ships it empty)', () => {
    const home = join(homedir(), '.devdigest', 'secrets.json');
    expect(loadConfig(base).secretsPath).toBe(home);
    expect(loadConfig({ ...base, DEVDIGEST_SECRETS_PATH: '' }).secretsPath).toBe(home);
  });
});
