import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

process.env.PMCL_DATA_DIR = process.env.PMCL_DATA_DIR || `${process.env.TMPDIR || '/tmp'}/izl-group-test`;

const { normalizeGroupConfig, refFromGroupPack } = await import('../src/main/group.js');
const { quickPlayFor } = await import('../src/main/launch.js');

test('group config: normalizes packs, drops malformed entries, sorts announcements', () => {
  const cfg = normalizeGroupConfig({
    groupName: 'Los Compas',
    discordUrl: 'https://discord.gg/abc123',
    packs: [
      { id: 's3', name: 'Season 3', source: { type: 'modrinth', project: 'my-pack' }, server: { address: 'mc.izl.mx', port: 25565 }, recommended: true },
      { id: 'bad', name: 'No source' },                          // dropped
      { id: 'bad2', name: 'Bad url', source: { type: 'url', url: 'ftp://x' } }, // dropped
      { id: 'gh', name: 'GH pack', source: { type: 'github-releases', repo: 'iz/pack' } },
    ],
    announcements: [
      { id: 'a1', date: '2026-07-01', title: 'Old' },
      { id: 'a2', date: '2026-07-08', title: 'New', body: '# Hi' },
      { id: 'a0', date: '2026-01-01', title: 'Pinned old', pinned: true },
      { title: 'no id' },                                         // dropped
    ],
  });
  assert.equal(cfg.groupName, 'Los Compas');
  assert.equal(cfg.discordUrl, 'https://discord.gg/abc123');
  assert.deepEqual(cfg.packs.map((p) => p.id), ['s3', 'gh']);
  assert.deepEqual(cfg.packs[0].server, { address: 'mc.izl.mx', port: 25565 });
  assert.equal(cfg.packs[0].recommended, true);
  // pinned first, then newest first
  assert.deepEqual(cfg.announcements.map((a) => a.id), ['a0', 'a2', 'a1']);
});

test('group config: rejects non-https discord, non-object config', () => {
  const cfg = normalizeGroupConfig({ groupName: 'x', discordUrl: 'http://evil' });
  assert.equal(cfg.discordUrl, null);
  assert.throws(() => normalizeGroupConfig('nope'));
});

test('group config: forgives doubled-paste discord URLs', () => {
  const cfg = normalizeGroupConfig({
    groupName: 'x',
    discordUrl: 'https://discord.gg/Y5WtKnwEqUhttps://discord.gg/Y5WtKnwEqU',
  });
  assert.equal(cfg.discordUrl, 'https://discord.gg/Y5WtKnwEqU');
});

test('refFromGroupPack maps sources to import refs', () => {
  assert.deepEqual(refFromGroupPack({ source: { type: 'modrinth', project: 'abc' } }), { type: 'modrinth', project: 'abc' });
  assert.deepEqual(refFromGroupPack({ source: { type: 'github-releases', repo: 'a/b' } }), { type: 'github-releases', repo: 'a/b' });
  assert.deepEqual(refFromGroupPack({ source: { type: 'url', url: 'https://x/p.mrpack' } }), { type: 'url', url: 'https://x/p.mrpack' });
  assert.throws(() => refFromGroupPack({ source: { type: 'zzz' } }));
});

test('quickPlayFor: modern vs legacy join, none without server', () => {
  assert.deepEqual(quickPlayFor('1.21.1', { address: 'mc.izl.mx', port: null }), { type: 'multiplayer', identifier: 'mc.izl.mx' });
  assert.deepEqual(quickPlayFor('1.20', { address: 'mc.izl.mx', port: 25566 }), { type: 'multiplayer', identifier: 'mc.izl.mx:25566' });
  assert.deepEqual(quickPlayFor('1.16.5', { address: 'mc.izl.mx', port: null }), { type: 'legacy', identifier: 'mc.izl.mx' });
  assert.equal(quickPlayFor('1.21.1', null), null);
  assert.equal(quickPlayFor('1.21.1', { address: '' }), null);
});

// ---- markdown renderer (classic browser script, run in a VM sandbox) ----

const mdSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'md.js'),
  'utf8'
);
const sandbox = {};
vm.runInNewContext(mdSource, sandbox);
const MD = sandbox.MD;

test('markdown: renders text, links, images, video', () => {
  const html = MD.render([
    '# Season 3 is live!',
    '',
    'Join **now** at `mc.izl.mx` — new *shaders*!',
    '',
    '![map](https://example.com/map.png)',
    '![trailer](https://example.com/clip.mp4)',
    '[Discord](https://discord.gg/abc)',
    '- New dungeons',
    '- New bosses',
  ].join('\n'));
  assert.match(html, /<h2>Season 3 is live!<\/h2>/);
  assert.match(html, /<strong>now<\/strong>/);
  assert.match(html, /<code>mc\.izl\.mx<\/code>/);
  assert.match(html, /<img src="https:\/\/example\.com\/map\.png"/);
  assert.match(html, /<video controls[^>]+src="https:\/\/example\.com\/clip\.mp4"/);
  assert.match(html, /<a href="https:\/\/discord\.gg\/abc">Discord<\/a>/);
  assert.match(html, /<li>New dungeons<\/li>/);
});

test('markdown: HTML injection is neutralized', () => {
  const html = MD.render('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))');
  assert.ok(!html.includes('<script>'), 'script tag must be escaped');
  assert.ok(!/<img src=x/.test(html), 'raw img must be escaped');
  assert.ok(!html.includes('javascript:') || !html.includes('<a'), 'javascript: URLs must not become links');
  assert.match(html, /&lt;script&gt;/);
});

test('markdown: non-https URLs never become tags', () => {
  const html = MD.render('![x](http://insecure.com/a.png) [y](ftp://nope)');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<a '));
});
