import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': path.resolve(__dirname, 'src/vendor/shared'),
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Hermetic secrets: without this, LocalSecretsProvider reads the developer's
    // real ~/.devdigest/secrets.json (and server/.env), so any test path that
    // forgets to inject a mock LLM/GitHub makes a REAL, paid call. Empty values
    // win over dotenv (it never overrides a set var) and are falsy, so
    // container.llm()/github() throw ConfigError instead.
    env: {
      DEVDIGEST_SECRETS_PATH: '/nonexistent/devdigest-test-secrets.json',
      OPENAI_API_KEY: '',
      OPENROUTER_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GITHUB_TOKEN: '',
      GITHUB_PAT: '',
    },
    // Testcontainers integration tests can be slow to spin up Postgres.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
