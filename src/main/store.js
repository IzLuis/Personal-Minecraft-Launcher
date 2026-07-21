// Minimal JSON-file store with atomic writes.
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file;
    this.defaults = defaults;
    this.data = this.#read();
  }

  #read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      return { ...structuredClone(this.defaults), ...JSON.parse(raw) };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  patch(obj) {
    Object.assign(this.data, obj);
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

export const SETTINGS_DEFAULTS = {
  memoryMax: '4G',
  memoryMin: '1G',
  javaPath: '',            // empty = auto-managed runtime
  jvmArgs: '',
  downloadConcurrency: 6,
  curseforgeApiKey: '',
  keepLauncherOpen: true,
  showSnapshots: false,
  language: 'auto',        // 'auto' | 'en' | 'es'
  groupConfigUrl: '',      // empty = baked-in DEFAULT_GROUP_CONFIG_URL
  seenAnnouncements: [],   // announcement ids already shown
  knownGroupPacks: [],     // pack ids already seen (for "new pack!" toasts)
  knownPackVersions: {},   // pack id -> last version we toasted about
  tutorialDone: false,     // first-launch tour completed/skipped
  friends: [],             // Minecraft usernames to watch for on the group servers
};
