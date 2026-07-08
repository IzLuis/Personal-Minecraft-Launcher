import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planFilesFromMrpackIndex,
  listMrpackOptionals,
  parseCurseforgeManifest,
  planUpdate,
  parseGithubRepo,
  parseModrinthRef,
} from '../src/main/packs/plan.js';

const baseIndex = {
  formatVersion: 1,
  game: 'minecraft',
  versionId: '1.0.0',
  name: 'Test Pack',
  dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.0' },
  files: [
    {
      path: 'mods/sodium.jar',
      hashes: { sha1: 'AABB01', sha512: 'ff' },
      downloads: ['https://cdn.modrinth.com/sodium.jar'],
      fileSize: 100,
    },
    {
      path: 'mods/litematica.jar',
      hashes: { sha1: 'cc02', sha512: 'ee' },
      env: { client: 'optional', server: 'unsupported' },
      downloads: ['https://cdn.modrinth.com/litematica.jar'],
      fileSize: 50,
    },
    {
      path: 'mods/server-only.jar',
      hashes: { sha1: 'dd03', sha512: 'dd' },
      env: { client: 'unsupported', server: 'required' },
      downloads: ['https://cdn.modrinth.com/server.jar'],
      fileSize: 10,
    },
  ],
};

test('mrpack plan: required included, optional honors choices, server-only skipped', () => {
  const { files, skippedOptional } = planFilesFromMrpackIndex(baseIndex, {});
  assert.ok(files['mods/sodium.jar']);
  assert.equal(files['mods/sodium.jar'].sha1, 'aabb01'); // normalized lowercase
  assert.ok(!files['mods/litematica.jar']);
  assert.deepEqual(skippedOptional, ['mods/litematica.jar']);
  assert.ok(!files['mods/server-only.jar']);

  const withOpt = planFilesFromMrpackIndex(baseIndex, { 'mods/litematica.jar': true });
  assert.ok(withOpt.files['mods/litematica.jar']);
  assert.equal(withOpt.files['mods/litematica.jar'].optional, true);
});

test('mrpack plan: rejects unknown formatVersion and missing URLs', () => {
  assert.throws(() => planFilesFromMrpackIndex({ ...baseIndex, formatVersion: 2 }));
  assert.throws(() =>
    planFilesFromMrpackIndex({ ...baseIndex, files: [{ path: 'mods/x.jar', hashes: { sha1: 'a' }, downloads: [] }] })
  );
});

test('listMrpackOptionals lists only optional client files', () => {
  const opts = listMrpackOptionals(baseIndex);
  assert.deepEqual(opts, [{ path: 'mods/litematica.jar', name: 'litematica.jar' }]);
});

test('curseforge manifest parses loader + files', () => {
  const m = parseCurseforgeManifest({
    manifestType: 'minecraftModpack',
    name: 'CF Pack',
    version: '2.1',
    minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
    files: [
      { projectID: 1, fileID: 11, required: true },
      { projectID: 2, fileID: 22, required: false },
    ],
  });
  assert.equal(m.mcVersion, '1.20.1');
  assert.equal(m.loaderId, 'forge-47.2.0');
  assert.equal(m.files.length, 2);
  assert.equal(m.files[1].required, false);
  assert.throws(() => parseCurseforgeManifest({ manifestType: 'other' }));
});

test('planUpdate: diffs adds, changes, removals; never touches unknown files', () => {
  const oldFiles = {
    'mods/a.jar': { sha1: '1' },
    'mods/b.jar': { sha1: '2' },
    'config/x.cfg': { sha1: '3' },
  };
  const desired = {
    'mods/a.jar': { sha1: '1' },      // unchanged
    'mods/b.jar': { sha1: '2new' },   // changed
    'mods/c.jar': { sha1: '4' },      // added
  };
  const plan = planUpdate(oldFiles, desired);
  assert.deepEqual(plan.unchanged, ['mods/a.jar']);
  assert.deepEqual(plan.toDelete, ['config/x.cfg']);
  assert.deepEqual(plan.toDownload.sort(), ['mods/b.jar', 'mods/c.jar']);
});

test('parseGithubRepo accepts owner/repo and URLs', () => {
  assert.deepEqual(parseGithubRepo('izluis/my-pack'), { owner: 'izluis', repo: 'my-pack' });
  assert.deepEqual(parseGithubRepo('https://github.com/izluis/my-pack'), { owner: 'izluis', repo: 'my-pack' });
  assert.deepEqual(parseGithubRepo('https://github.com/izluis/my-pack.git'), { owner: 'izluis', repo: 'my-pack' });
  assert.throws(() => parseGithubRepo('not a repo'));
});

test('parseModrinthRef accepts URLs and slugs', () => {
  assert.equal(parseModrinthRef('https://modrinth.com/modpack/fabulously-optimized'), 'fabulously-optimized');
  assert.equal(parseModrinthRef('fabulously-optimized'), 'fabulously-optimized');
  assert.throws(() => parseModrinthRef('https://example.com/nope'));
});
