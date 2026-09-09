import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import assert from 'node:assert/strict';
import { publicAssets } from '../src/public-assets.js';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['node_modules', '.git', 'dist', 'output']);
const failures = [];
const textExtensions = /\.(?:js|mjs|json|md|txt|yml|yaml|html|css|svg)$/i;
const patterns = [
  /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//,
  /[A-Z]:\\Users\\/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /AKIA[0-9A-Z]{16}/,
];
async function walk(dir, exclude = new Set()) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if ((await lstat(path)).isSymbolicLink()) {
      failures.push(`${relative(root, path)}: symbolic link`);
    } else if (entry.isDirectory()) files.push(...(await walk(path, exclude)));
    else files.push(path);
  }
  return files;
}
const files = await walk(root, ignored);
for (const path of files) {
  const name = relative(root, path);
  if (/(^|\/)(?:\.env(?:\..*)?|\.vercel)(?:\/|$)|\.(?:blend\d*|stl|mp4|webm|log)$/i.test(name)) {
    failures.push(`${name}: forbidden publication file`);
  }
  if (textExtensions.test(name)) {
    const content = await readFile(path, 'utf8');
    if (patterns.some((pattern) => pattern.test(content)))
      failures.push(`${name}: sensitive pattern`);
  }
}
const publicFiles = (await walk(resolve(root, 'public')))
  .map((p) => relative(resolve(root, 'public'), p))
  .sort();
assert.deepEqual(
  publicFiles,
  [...publicAssets].sort(),
  'Public assets must match the explicit allowlist',
);
for (const name of publicAssets.filter((p) => p.endsWith('.glb'))) {
  const bytes = await readFile(resolve(root, 'public', name));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${name}: invalid GLB`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    assert.equal(resource.uri, undefined, `${name}: external resource`);
  }
  if (patterns.some((pattern) => pattern.test(JSON.stringify(json))))
    failures.push(`${name}: private metadata`);
}
const built = await walk(resolve(root, 'dist'));
for (const path of built) {
  const name = relative(resolve(root, 'dist'), path);
  if (
    !publicAssets.includes(name) &&
    name !== 'index.html' &&
    !/^assets\/[\w.-]+\.(?:js|css|ttf)$/.test(name)
  ) {
    failures.push(`dist/${name}: unexpected build output`);
  }
  if (textExtensions.test(name)) {
    const content = await readFile(path, 'utf8');
    if (patterns.some((pattern) => pattern.test(content)))
      failures.push(`dist/${name}: sensitive pattern`);
    if (content.includes('/__film-export') || /window\.stoneGambit\s*=/.test(content))
      failures.push(`dist/${name}: development entrypoint`);
  }
}
assert.equal(failures.length, 0, failures.join('\n'));
console.log(
  `PASS: ${files.length} source files, ${publicAssets.length} runtime assets, ${built.length} build files. No forbidden files or detected sensitive patterns. This is not an exhaustive security audit.`,
);
