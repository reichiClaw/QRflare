#!/usr/bin/env node
/**
 * Deploys EdgeQR Studio WITH the optional dynamic QR module:
 *   1. reads the Wrangler config, finds the D1 binding named DYNAMIC_DB
 *   2. applies pending D1 migrations to that database (remote)
 *   3. builds the app and runs `wrangler deploy`
 *
 * Usage: npm run deploy:dynamic [-- --config wrangler.dynamic.example.jsonc]
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const configIndex = args.indexOf('--config');
const configPath = configIndex !== -1 ? args[configIndex + 1] : 'wrangler.jsonc';

if (!configPath || !existsSync(configPath)) {
  console.error(`Config file not found: ${configPath}`);
  process.exit(1);
}

// Strip comments so JSONC can be parsed.
const raw = readFileSync(configPath, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const config = JSON.parse(raw);

const d1 = (config.d1_databases ?? []).find((db) => db.binding === 'DYNAMIC_DB');
if (!d1) {
  console.error(`No d1_databases entry with binding "DYNAMIC_DB" found in ${configPath}.`);
  console.error('See wrangler.dynamic.example.jsonc and docs/dynamic-qr.md.');
  process.exit(1);
}
if (String(config.vars?.DYNAMIC_QR_ENABLED) !== 'true') {
  console.warn(
    'Warning: vars.DYNAMIC_QR_ENABLED is not "true"; the module will stay disabled after deployment.',
  );
}
if (!d1.database_id || /REPLACE/i.test(d1.database_id)) {
  console.error('Set d1_databases[].database_id to the id printed by `wrangler d1 create edgeqr-dynamic`.');
  process.exit(1);
}

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

run(`npx wrangler d1 migrations apply ${d1.database_name} --remote --config ${configPath}`);
run('npm run build');
run(`npx wrangler deploy --config ${configPath}`);
console.log(
  '\nDynamic QR module deployed. Remember to set the DYNAMIC_ADMIN_TOKEN secret if you have not yet.',
);
