import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compareVersions, safeJoin, slugify } from '../src/main/util.js';
import { offlineUuid } from '../src/main/auth.js';
import { neoforgePrefixFor, loaderFromMrpackDependencies, loaderFromCurseforgeId } from '../src/main/loaders.js';

test('compareVersions orders releases and prereleases', () => {
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(compareVersions('1.2.0', '1.2'), 0);
  assert.equal(compareVersions('v2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
});

test('safeJoin blocks zip-slip and absolute paths', () => {
  const base = path.resolve('/tmp/instance');
  assert.equal(safeJoin(base, 'mods/a.jar'), path.resolve(base, 'mods/a.jar'));
  assert.throws(() => safeJoin(base, '../evil.jar'));
  assert.throws(() => safeJoin(base, 'mods/../../evil.jar'));
  assert.throws(() => safeJoin(base, '/etc/passwd'));
  assert.throws(() => safeJoin(base, 'C:/Windows/system32'));
});

test('slugify produces filesystem-safe ids', () => {
  assert.equal(slugify('My Cool Pack! v2'), 'my-cool-pack-v2');
  assert.equal(slugify('***'), 'instance');
});

test('offlineUuid is deterministic, versioned, and variant-correct', () => {
  const a = offlineUuid('Steve');
  const b = offlineUuid('Steve');
  const c = offlineUuid('Alex');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('neoforge prefix mapping', () => {
  assert.equal(neoforgePrefixFor('1.21.1'), '21.1');
  assert.equal(neoforgePrefixFor('1.21'), '21.0');
  assert.equal(neoforgePrefixFor('2.0'), null);
});

test('loader detection from pack metadata', () => {
  assert.deepEqual(loaderFromMrpackDependencies({ minecraft: '1.20.1', 'fabric-loader': '0.15.0' }), { type: 'fabric', version: '0.15.0' });
  assert.deepEqual(loaderFromMrpackDependencies({ minecraft: '1.20.1', neoforge: '21.1.7' }), { type: 'neoforge', version: '21.1.7' });
  assert.deepEqual(loaderFromMrpackDependencies({ minecraft: '1.8.9' }), { type: 'vanilla', version: '' });
  assert.deepEqual(loaderFromCurseforgeId('forge-47.2.0'), { type: 'forge', version: '47.2.0' });
  assert.throws(() => loaderFromCurseforgeId('rift-1.0'));
});
