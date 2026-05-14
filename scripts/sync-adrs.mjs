#!/usr/bin/env node
/**
 * Sync ADR markdown from the source repo (`../docs/adr`) into this site's
 * `src/adrs/` directory, applying the same name-scrubbing the canvases use.
 *
 * Run after updating any ADR in the source tree:
 *   npm run sync-adrs
 *
 * Why this exists: PowerShell's default Get-Content / Set-Content + -Encoding UTF8
 * pipeline silently mojibakes multi-byte UTF-8 chars (em-dashes, smart quotes,
 * arrows) and inserts a BOM. Node's fs reads/writes raw UTF-8 cleanly.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, '..');
const SRC_DIR   = resolve(SITE_ROOT, '..', 'docs', 'adr');
const DST_DIR   = resolve(SITE_ROOT, 'src', 'adrs');

// Replacements applied to every ADR before it's written to the public site.
// Update this list (and re-run `npm run sync-adrs`) whenever you rename a
// service or pull in new internal identifiers that should be scrubbed.
const REPLACEMENTS = [
  [/mfa-provider/g,             'mfa-service'],
  [/ium-policy-audit-sink/g,    'policy-audit-sink'],
  [/ium-policy-service/g,       'policy-service'],
  [/ium-token-server/g,         'token-service'],
  [/token-server/g,             'token-service'],
  [/identity-directory/g,       'identity-service'],
  [/@ium\/policy-client/g,      'policy-client'],
  [/@ium\/policy-panel/g,       'policy-panel'],
  [/IUM\.PolicyFramework/g,     'PolicyFramework'],
  [/IUM Policies/g,             'Policies'],
  [/IUM Team/g,                 'Identity Team'],
  [/IUM platform/g,             'platform'],
  [/IUM service/g,              'service'],
  [/IUM ecosystem/g,            'ecosystem'],
  [/IUM infra(?!structure)/g,   'infra'],
  [/IUM stack/g,                'stack'],
  [/\bIUM /g,                   ''],
  [/@servicetitan\.com/g,       '@example.com'],
  [/ium\.mfa\./g,               'policy.mfa.'],
  [/ium\.auth\./g,              'policy.auth.'],
  [/ium\.session\./g,           'policy.session.'],
  [/ium\.password\./g,          'policy.password.'],
  [/ium\.legacy\./g,            'policy.legacy.'],
  [/ium\.access\./g,            'policy.access.'],
];

function scrub(content) {
  let out = content;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.error(`[sync-adrs] Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  mkdirSync(DST_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.md'));
  let synced = 0;
  for (const name of files) {
    const raw = await readFile(join(SRC_DIR, name), 'utf8');
    const out = scrub(raw);
    // utf8 writeFile in Node never adds a BOM. Perfect.
    await writeFile(join(DST_DIR, name), out, 'utf8');
    synced++;
  }
  console.log(`[sync-adrs] Synced ${synced} ADRs from ${SRC_DIR} → ${DST_DIR}`);
}

main().catch((err) => {
  console.error('[sync-adrs] fatal:', err);
  process.exit(1);
});
