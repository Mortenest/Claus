/**
 * The core must stay pure and portable: no ambient randomness, time, DOM, or
 * host APIs. This test greps every src/core file (comments stripped) for
 * banned identifiers so a violation fails CI-less but test-run-visible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'core');

const BANNED = [
  /\bMath\.random\b/,
  /\bDate\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bperformance\b/,
  /\brequestAnimationFrame\b/,
  /\blocalStorage\b/,
  /\bfetch\s*\(/,
  /\bconsole\b/,
];

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('src/core is pure: no randomness, time, DOM, or host APIs', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4, 'core files exist');
  for (const file of files) {
    const code = stripComments(readFileSync(join(coreDir, file), 'utf8'));
    for (const pattern of BANNED) {
      assert.ok(!pattern.test(code), `${file} must not use ${pattern}`);
    }
  }
});

test('src/core imports only from src/core', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const code = readFileSync(join(coreDir, file), 'utf8');
    for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1], /^\.\/[\w-]+\.js$/, `${file} imports outside core: ${match[1]}`);
    }
  }
});
