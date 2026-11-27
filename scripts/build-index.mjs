#!/usr/bin/env node
// Build the static catalog index (schema/catalog-index.v1.schema.json) from .claude-plugin/marketplace.json.
//
//   node scripts/build-index.mjs --out dist/index.json [--repository owner/repo] [--commit <40 hex>]
//   node scripts/build-index.mjs --verify dist/index.json
//
// Rules (same as the openmake_llm reader, apps/api/src/agents/git-ingest/catalog-index.ts):
//   - every external entry must pin a 40-char lowercase commit in `ref` (curation rule: verified ref only) — otherwise fail
//   - `github` shorthand sources are rejected (use git-subdir / url)
//   - relative entries (./plugins/...) are pinned to the curation repository commit
//   - plugin sha256 = sha256(canonical JSON of the plugin without sha256); pluginsSha256 = sha256(hashes joined by "\n")
//   - installable = true: the inclusion rule of this repository is "verified to install on openmake_llm"
// No dependencies — Node standard library only.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA_ID = 'openmake.catalog-index';
const SCHEMA_VERSION = 1;
const SHA1 = /^[0-9a-f]{40}$/;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export function entryDigest(entry) {
  const { sha256: _omit, ...rest } = entry;
  return sha256(canonicalJson(rest));
}

export function pluginsDigest(hashes) {
  return sha256(hashes.join('\n'));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function repoCommit() {
  if (process.env.GITHUB_SHA && SHA1.test(process.env.GITHUB_SHA)) return process.env.GITHUB_SHA;
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function localComponents(dir) {
  const has = (p) => existsSync(join(dir, p));
  const comps = [];
  if (has('skills') && statSync(join(dir, 'skills')).isDirectory() && readdirSync(join(dir, 'skills')).length > 0) comps.push('skills');
  if (has('agents')) comps.push('agents');
  if (has('commands')) comps.push('commands');
  if (has('.mcp.json')) comps.push('mcp');
  const layout = has('.claude-plugin/plugin.json') ? 'claude-plugin' : has('gemini-extension.json') ? 'gemini-extension' : 'marketplace-entry';
  return { layout, components: comps };
}

function normalizeSource(plugin, commit) {
  const src = plugin.source;
  if (typeof src === 'string') {
    if (!src.startsWith('./')) throw new Error(`${plugin.name}: string source must be a relative path (./...)`);
    const path = src.replace(/^\.\//, '').replace(/\/+$/, '');
    return { source: { type: 'relative', path }, commit, compat: localComponents(path) };
  }
  if (!src || typeof src !== 'object') throw new Error(`${plugin.name}: missing source`);
  if (src.source !== 'git-subdir' && src.source !== 'url') {
    throw new Error(`${plugin.name}: source "${src.source}" not allowed (use git-subdir or url)`);
  }
  if (typeof src.ref !== 'string' || !SHA1.test(src.ref)) {
    throw new Error(`${plugin.name}: ref must be a verified 40-char lowercase commit (got ${JSON.stringify(src.ref)})`);
  }
  if (typeof src.url !== 'string' || !/^https:\/\//.test(src.url)) throw new Error(`${plugin.name}: url must be https`);
  const source = { type: src.source, url: src.url };
  if (src.source === 'git-subdir') {
    if (typeof src.path !== 'string' || !src.path) throw new Error(`${plugin.name}: git-subdir needs path`);
    source.path = src.path;
  }
  return { source, commit: src.ref, compat: undefined };
}

export function buildIndex(marketplace, { repository, commit, generatedAt }) {
  if (!SHA1.test(commit)) throw new Error(`repository commit must be 40-char hex: ${commit}`);
  const names = new Set();
  const plugins = (marketplace.plugins ?? []).map((p) => {
    if (typeof p.name !== 'string' || !p.name) throw new Error('plugin without name');
    if (names.has(p.name)) throw new Error(`duplicate plugin name: ${p.name}`);
    names.add(p.name);
    const { source, commit: pinned, compat } = normalizeSource(p, commit);
    const entry = {
      name: p.name,
      description: typeof p.description === 'string' ? p.description : undefined,
      version: typeof p.version === 'string' ? p.version : undefined,
      category: typeof p.category === 'string' ? p.category : undefined,
      source,
      commit: pinned,
      installable: true,
      compat,
    };
    const clean = JSON.parse(JSON.stringify(entry));
    return { ...clean, sha256: entryDigest(clean) };
  });
  const index = {
    schema: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    repository,
    commit,
    marketplace: { name: marketplace.name, ...(marketplace.description ? { description: marketplace.description } : {}) },
    plugins,
    pluginsSha256: pluginsDigest(plugins.map((p) => p.sha256)),
  };
  return index;
}

export function verifyIndex(index) {
  if (index.schema !== SCHEMA_ID || index.schemaVersion !== SCHEMA_VERSION) throw new Error('unsupported schema');
  for (const p of index.plugins) {
    if (entryDigest(p) !== p.sha256) throw new Error(`hash mismatch: ${p.name}`);
    if (!SHA1.test(p.commit)) throw new Error(`commit not pinned: ${p.name}`);
  }
  if (pluginsDigest(index.plugins.map((p) => p.sha256)) !== index.pluginsSha256) throw new Error('pluginsSha256 mismatch');
  return true;
}

function main() {
  const verifyPath = arg('--verify');
  if (verifyPath) {
    verifyIndex(JSON.parse(readFileSync(verifyPath, 'utf8')));
    console.log(`ok: ${verifyPath}`);
    return;
  }
  const out = arg('--out') ?? 'dist/index.json';
  const repository = arg('--repository') ?? process.env.GITHUB_REPOSITORY ?? 'openmake/openmake-marketplace';
  const commit = arg('--commit') ?? repoCommit();
  const generatedAt = arg('--generated-at') ?? new Date().toISOString();
  const marketplace = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  const index = buildIndex(marketplace, { repository, commit, generatedAt });
  verifyIndex(index);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`wrote ${out}: ${index.plugins.length} plugins, pluginsSha256 ${index.pluginsSha256}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
