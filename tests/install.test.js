// End-to-end test of the pack install/update engine using an overrides-only
// mrpack (no network needed): import v1, user edits + adds files, update to v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';

import { setBaseDir, ensureBaseDirs, instanceDir } from '../src/main/paths.js';

const tmpBase = await fsp.mkdtemp(path.join(os.tmpdir(), 'pmcl-test-'));
setBaseDir(tmpBase);
ensureBaseDirs();

const { createInstance, readInstance } = await import('../src/main/instances.js');
const { applyPackArchive } = await import('../src/main/packs/install.js');

const fakeSettings = { get: (_k, d) => d };

function makeMrpack(file, { versionId, overrides }) {
  const zip = new AdmZip();
  zip.addFile(
    'modrinth.index.json',
    Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        game: 'minecraft',
        versionId,
        name: 'Engine Test Pack',
        files: [],
        dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.15.11' },
      })
    )
  );
  for (const [rel, content] of Object.entries(overrides)) {
    zip.addFile(`overrides/${rel}`, Buffer.from(content));
  }
  zip.writeZip(file);
  return file;
}

test('install then update: user data preserved, pack files managed', async () => {
  const inst = await createInstance({ name: 'Engine Test', mcVersion: '0.0.0' });
  const dir = instanceDir(inst.id);

  // ---- v1 install ----
  const v1 = makeMrpack(path.join(tmpBase, 'v1.mrpack'), {
    versionId: '1.0.0',
    overrides: {
      'config/shared.cfg': 'setting=v1',
      'mods/bundled.jar': 'jar-bytes-v1',
    },
  });
  const r1 = await applyPackArchive(inst.id, v1, { choices: {}, settings: fakeSettings, source: { type: 'mrpack-url', url: 'https://example.com/pack.mrpack' } });
  assert.equal(r1.summary.added, 2);

  let meta = await readInstance(inst.id);
  assert.equal(meta.packVersion, '1.0.0');
  assert.equal(meta.mc.version, '1.20.1');
  assert.deepEqual(meta.loader, { type: 'fabric', version: '0.15.11' });
  assert.equal(fs.readFileSync(path.join(dir, 'config/shared.cfg'), 'utf8'), 'setting=v1');
  assert.ok(meta.packFiles['config/shared.cfg']);
  assert.ok(meta.packFiles['mods/bundled.jar']);
  assert.equal(meta.source.type, 'mrpack-url');

  // ---- user activity between updates ----
  await fsp.writeFile(path.join(dir, 'mods/my-personal-mod.jar'), 'my own jar'); // user mod
  await fsp.writeFile(path.join(dir, 'config/shared.cfg'), 'setting=user-tweaked'); // user edit of pack file
  await fsp.mkdir(path.join(dir, 'saves/world1'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'saves/world1/level.dat'), 'world data');

  // ---- v2 update: config changed, bundled.jar dropped, new config added ----
  const v2 = makeMrpack(path.join(tmpBase, 'v2.mrpack'), {
    versionId: '1.1.0',
    overrides: {
      'config/shared.cfg': 'setting=v2',
      'config/brand-new.cfg': 'fresh',
    },
  });
  const r2 = await applyPackArchive(inst.id, v2, { choices: {}, settings: fakeSettings, source: { type: 'mrpack-url', url: 'https://example.com/pack.mrpack' } });

  meta = await readInstance(inst.id);
  assert.equal(meta.packVersion, '1.1.0');

  // Pack-managed changes applied:
  assert.equal(fs.readFileSync(path.join(dir, 'config/shared.cfg'), 'utf8'), 'setting=v2');
  assert.equal(fs.readFileSync(path.join(dir, 'config/brand-new.cfg'), 'utf8'), 'fresh');
  assert.ok(!fs.existsSync(path.join(dir, 'mods/bundled.jar')), 'dropped pack file removed');

  // User's edit was backed up before being overwritten:
  assert.ok(r2.summary.backedUp.includes('config/shared.cfg'));
  const bak = path.join(dir, 'config/shared.cfg.bak-1.1.0');
  assert.equal(fs.readFileSync(bak, 'utf8'), 'setting=user-tweaked');

  // User data untouched:
  assert.equal(fs.readFileSync(path.join(dir, 'mods/my-personal-mod.jar'), 'utf8'), 'my own jar');
  assert.equal(fs.readFileSync(path.join(dir, 'saves/world1/level.dat'), 'utf8'), 'world data');

  // Bookkeeping:
  assert.ok(!meta.packFiles['mods/bundled.jar']);
  assert.ok(meta.packFiles['config/brand-new.cfg']);
});

test('update keeps user-modified files that the pack dropped (orphan warning)', async () => {
  const inst = await createInstance({ name: 'Orphan Test', mcVersion: '0.0.0' });
  const dir = instanceDir(inst.id);

  const v1 = makeMrpack(path.join(tmpBase, 'o1.mrpack'), {
    versionId: '1.0',
    overrides: { 'config/tweaked-then-dropped.cfg': 'original' },
  });
  await applyPackArchive(inst.id, v1, { choices: {}, settings: fakeSettings });
  await fsp.writeFile(path.join(dir, 'config/tweaked-then-dropped.cfg'), 'user changed this');

  const v2 = makeMrpack(path.join(tmpBase, 'o2.mrpack'), { versionId: '2.0', overrides: {} });
  const r = await applyPackArchive(inst.id, v2, { choices: {}, settings: fakeSettings });

  assert.ok(fs.existsSync(path.join(dir, 'config/tweaked-then-dropped.cfg')), 'modified file kept');
  assert.ok(r.summary.orphaned.includes('config/tweaked-then-dropped.cfg'));
  assert.equal(r.summary.removed, 0);
});

test('plain zip pack: installs with config-declared metadata, extracts icon', async () => {
  const inst = await createInstance({ name: 'Plain Test', mcVersion: '0.0.0' });
  const dir = instanceDir(inst.id);
  const zipPath = path.join(tmpBase, 'plain.zip');
  const zip = new AdmZip();
  // Everything wrapped in a single root folder, like a hand-zipped folder would be.
  zip.addFile('MiPack/mods/somemod.jar', Buffer.from('jar-bytes'));
  zip.addFile('MiPack/config/settings.toml', Buffer.from('speed=fast'));
  zip.addFile('MiPack/icon.png', Buffer.from('png-bytes'));
  zip.writeZip(zipPath);

  const defaults = { name: 'Mi Pack', version: '1.2', mcVersion: '1.21.1', loader: { type: 'fabric', version: '0.16.9' } };
  const r = await applyPackArchive(inst.id, zipPath, { choices: {}, settings: fakeSettings, defaults });
  assert.equal(r.meta.version, '1.2');

  const meta = await readInstance(inst.id);
  assert.equal(meta.mc.version, '1.21.1');
  assert.deepEqual(meta.loader, { type: 'fabric', version: '0.16.9' });
  assert.equal(meta.packVersion, '1.2');
  assert.equal(fs.readFileSync(path.join(dir, 'mods/somemod.jar'), 'utf8'), 'jar-bytes');
  assert.equal(fs.readFileSync(path.join(dir, 'config/settings.toml'), 'utf8'), 'speed=fast');
  assert.equal(fs.readFileSync(path.join(dir, '.pmcl-icon.png'), 'utf8'), 'png-bytes');
  assert.deepEqual(meta.icon, { type: 'file' });
  assert.ok(!fs.existsSync(path.join(dir, 'icon.png')), 'icon is not dumped into the game dir');
});

test('plain zip without declared minecraft version is rejected', async () => {
  const inst = await createInstance({ name: 'Plain NoMeta', mcVersion: '0.0.0' });
  const zipPath = path.join(tmpBase, 'plain2.zip');
  const zip = new AdmZip();
  zip.addFile('mods/a.jar', Buffer.from('x'));
  zip.writeZip(zipPath);
  await assert.rejects(
    applyPackArchive(inst.id, zipPath, { choices: {}, settings: fakeSettings }),
    /minecraft/
  );
});

// adm-zip sanitizes entry names it writes, so craft the attack zip byte-by-byte
// the way a real malicious archive would look (raw "../" in the entry name).
function buildRawZip(entries) {
  const { crc32 } = zlib;
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(0, 8);           // method: stored
    local.writeUInt32LE(0, 10);          // dos time+date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra len
    chunks.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);             // made by
    cd.writeUInt16LE(20, 6);             // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt32LE(0, 12);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 30);             // extra+comment len
    cd.writeUInt16LE(0, 34);             // disk start
    cd.writeUInt16LE(0, 36);             // internal attrs
    cd.writeUInt32LE(0, 38);             // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));
    offset += local.length + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

test('malicious archive paths are rejected', async () => {
  const inst = await createInstance({ name: 'Evil Test', mcVersion: '0.0.0' });
  const zipPath = path.join(tmpBase, 'evil.mrpack');
  const indexJson = Buffer.from(JSON.stringify({
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1',
    name: 'Evil',
    files: [],
    dependencies: { minecraft: '1.20.1' },
  }));
  const raw = buildRawZip([
    { name: 'modrinth.index.json', data: indexJson },
    { name: 'overrides/../../../escape.txt', data: Buffer.from('pwned') },
  ]);
  await fsp.writeFile(zipPath, raw);
  await assert.rejects(applyPackArchive(inst.id, zipPath, { choices: {}, settings: fakeSettings }), /Unsafe path/);
  assert.ok(!fs.existsSync(path.join(tmpBase, 'escape.txt')));
  assert.ok(!fs.existsSync(path.resolve(tmpBase, '..', 'escape.txt')));
});
