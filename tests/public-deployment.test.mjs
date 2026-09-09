import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publicAssets } from '../src/public-assets.js';

test('production assets are an explicit runtime-only allowlist with attribution', () => {
  assert.equal(new Set(publicAssets).size, publicAssets.length);
  assert.ok(publicAssets.includes('credits.txt'));
  for (const name of publicAssets) {
    assert.ok(!/(^\.|\.\.|\.blend|\.stl|\.env|review|output|source)/i.test(name), name);
    assert.ok(existsSync(new URL(`../public/${name}`, import.meta.url)), name);
  }
  assert.equal(publicAssets.filter((n) => n.endsWith('.glb')).length, 12);
});
test('public deployment blocks third-party scripts, framing, and sensitive device permissions', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const headers = Object.fromEntries(config.headers[0].headers.map((h) => [h.key, h.value]));
  assert.match(headers['Content-Security-Policy'], /script-src 'self';/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-eval/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /connect-src 'self'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Permissions-Policy'], /microphone=\(\)/);
  assert.equal(config.rewrites, undefined, 'no blanket rewrite disguises private paths as HTML');
});
