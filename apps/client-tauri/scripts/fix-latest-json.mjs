#!/usr/bin/env node
/**
 * Нормализует latest.json на GitHub Release: все platform.url должны
 * указывать на assets текущего тега (github.ref_name), иначе после
 * split-release Windows-URL'ы часто ведут на 404.
 *
 * Вызывается из release-tauri.yml (job finalize) после matrix build.
 * Требует: gh CLI, GH_TOKEN, env TAG=tauri-vX.Y.Z
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tag = process.env.TAG;
if (!tag) {
  console.error('TAG env is required (e.g. tauri-v0.3.2)');
  process.exit(1);
}

const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const tmp = mkdtempSync(join(tmpdir(), 'vc-latest-json-'));
const jsonPath = join(tmp, 'latest.json');

gh('release', 'download', tag, '--pattern', 'latest.json', '--dir', tmp, '--clobber');

const raw = readFileSync(jsonPath, 'utf8');
const data = JSON.parse(raw);
let fixed = 0;

for (const entry of Object.values(data.platforms ?? {})) {
  if (!entry?.url || typeof entry.url !== 'string') continue;
  const next = entry.url.replace(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/)[^/]+(\/.+)$/,
    `$1${tag}$2`,
  );
  if (next !== entry.url) {
    entry.url = next;
    fixed++;
  }
}

writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`fixed ${fixed} platform url(s) → tag ${tag}`);

gh('release', 'upload', tag, jsonPath, '--clobber');

console.log('uploaded latest.json');
