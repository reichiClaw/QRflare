import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readCommit(): string {
  // Cloudflare Workers Builds exposes the commit SHA; fall back to git locally.
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export const buildInfo = {
  version: readVersion(),
  commit: readCommit(),
  buildTime: new Date().toISOString(),
};
