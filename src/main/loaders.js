// Mod loader support: Fabric & Quilt via meta profile JSON (launched as MCLC "custom" version),
// Forge & NeoForge via official installer jars (handed to MCLC's `forge` option).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fetchJson, fetchText, download, compareVersions } from './util.js';
import { minecraftRoot, installersDir } from './paths.js';

export const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

/** Map a Minecraft version to the NeoForge version prefix ("1.21.1" -> "21.1"). */
export function neoforgePrefixFor(mcVersion) {
  const parts = String(mcVersion).split('.');
  if (parts[0] !== '1' || parts.length < 2) return null;
  return `${parts[1]}.${parts[2] || '0'}`;
}

function parseMavenVersions(xml) {
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
}

/** List loader versions available for a given Minecraft version, newest first. */
export async function listLoaderVersions(loader, mcVersion) {
  switch (loader) {
    case 'vanilla':
      return [];
    case 'fabric': {
      const list = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.map((e) => ({ version: e.loader.version, stable: !!e.loader.stable }));
    }
    case 'quilt': {
      const list = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`);
      return list.map((e) => ({ version: e.loader.version, stable: !/beta|pre|rc/i.test(e.loader.version) }));
    }
    case 'forge': {
      const xml = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
      const prefix = `${mcVersion}-`;
      const versions = parseMavenVersions(xml)
        .filter((v) => v.startsWith(prefix))
        .map((v) => v.slice(prefix.length));
      versions.sort((a, b) => compareVersions(b, a));
      let recommended = null;
      try {
        const promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
        recommended = promos.promos?.[`${mcVersion}-recommended`] || promos.promos?.[`${mcVersion}-latest`] || null;
      } catch { /* promotions are optional */ }
      return versions.map((v) => ({ version: v, stable: recommended ? v === recommended : true }));
    }
    case 'neoforge': {
      const prefix = neoforgePrefixFor(mcVersion);
      if (!prefix) return [];
      const xml = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
      const versions = parseMavenVersions(xml).filter((v) => v === prefix || v.startsWith(`${prefix}.`));
      versions.sort((a, b) => compareVersions(b, a));
      return versions.map((v) => ({ version: v, stable: !v.includes('beta') }));
    }
    default:
      throw new Error(`Unknown loader: ${loader}`);
  }
}

/**
 * Prepare a loader for launch. Returns MCLC-shaped hints:
 *  - fabric/quilt: { custom: "<version id>" }  (profile JSON written into shared versions dir)
 *  - forge/neoforge: { forge: "/path/to/installer.jar" }
 *  - vanilla: {}
 */
export async function ensureLoader({ loader, loaderVersion, mcVersion }, { onStatus } = {}) {
  switch (loader) {
    case 'vanilla':
      return {};
    case 'fabric':
    case 'quilt': {
      const base =
        loader === 'fabric'
          ? `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
          : `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
      if (onStatus) onStatus(`Fetching ${loader} profile…`);
      const profile = await fetchJson(base);
      const id = profile.id;
      const dir = path.join(minecraftRoot(), 'versions', id);
      await fsp.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${id}.json`);
      if (!fs.existsSync(file)) await fsp.writeFile(file, JSON.stringify(profile, null, 2));
      return { custom: id };
    }
    case 'forge': {
      const full = `${mcVersion}-${loaderVersion}`;
      const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
      const dest = path.join(installersDir(), `forge-${full}-installer.jar`);
      if (onStatus) onStatus('Downloading Forge installer…');
      await download(url, dest);
      return { forge: dest };
    }
    case 'neoforge': {
      const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
      const dest = path.join(installersDir(), `neoforge-${loaderVersion}-installer.jar`);
      if (onStatus) onStatus('Downloading NeoForge installer…');
      await download(url, dest);
      return { forge: dest };
    }
    default:
      throw new Error(`Unknown loader: ${loader}`);
  }
}

/** Translate mrpack "dependencies" keys into our loader model. */
export function loaderFromMrpackDependencies(deps) {
  if (deps['fabric-loader']) return { type: 'fabric', version: deps['fabric-loader'] };
  if (deps['quilt-loader']) return { type: 'quilt', version: deps['quilt-loader'] };
  if (deps.neoforge) return { type: 'neoforge', version: deps.neoforge };
  if (deps.forge) return { type: 'forge', version: deps.forge };
  return { type: 'vanilla', version: '' };
}

/** Translate a CurseForge manifest modLoaders id ("forge-47.2.0") into our loader model. */
export function loaderFromCurseforgeId(id) {
  const [type, ...rest] = String(id).split('-');
  const version = rest.join('-');
  const t = type.toLowerCase();
  if (!['forge', 'neoforge', 'fabric', 'quilt'].includes(t)) throw new Error(`Unsupported mod loader: ${id}`);
  return { type: t, version };
}
