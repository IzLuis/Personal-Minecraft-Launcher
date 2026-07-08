// Account management.
// - Microsoft accounts use msmc (official MSA -> Xbox -> Minecraft chain) with refresh
//   tokens persisted so friends sign in once.
// - Offline profiles are a convenience for players who already own the game (LAN /
//   no-internet sessions) and can only be created after at least one Microsoft
//   account has signed in on this launcher. This launcher does not support piracy.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { JsonStore } from './store.js';
import { accountsFile } from './paths.js';

const require = createRequire(import.meta.url);
const { Auth } = require('msmc');

let store = null;
function accounts() {
  if (!store) store = new JsonStore(accountsFile(), { list: [], activeId: null });
  return store;
}

export function listAccounts() {
  const s = accounts();
  return { list: s.get('list', []).map(({ refresh, ...pub }) => pub), activeId: s.get('activeId', null) };
}

export function setActiveAccount(id) {
  const s = accounts();
  if (!s.get('list', []).some((a) => a.id === id)) throw new Error('Unknown account');
  s.set('activeId', id);
  return listAccounts();
}

export function removeAccount(id) {
  const s = accounts();
  const list = s.get('list', []).filter((a) => a.id !== id);
  s.set('list', list);
  if (s.get('activeId') === id) s.set('activeId', list[0]?.id ?? null);
  return listAccounts();
}

function upsertAccount(entry) {
  const s = accounts();
  const list = s.get('list', []);
  const i = list.findIndex((a) => a.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.push(entry);
  s.set('list', list);
  if (!s.get('activeId')) s.set('activeId', entry.id);
  return entry;
}

/** Interactive Microsoft sign-in (opens a login window). */
export async function addMicrosoftAccount() {
  const authManager = new Auth('select_account');
  const xbox = await authManager.launch('electron');
  const mc = await xbox.getMinecraft();
  if (!mc?.profile?.id) throw new Error('This Microsoft account does not own Minecraft: Java Edition.');
  const entry = {
    id: mc.profile.id,
    name: mc.profile.name,
    type: 'msa',
    refresh: typeof xbox.save === 'function' ? xbox.save() : mc.parent?.save?.(),
    addedAt: new Date().toISOString(),
  };
  upsertAccount(entry);
  return { id: entry.id, name: entry.name, type: 'msa' };
}

/** Stable offline UUID, identical to Java's UUID.nameUUIDFromBytes("OfflinePlayer:"+name). */
export function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; // version 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // IETF variant
  const hex = md5.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function addOfflineAccount(name) {
  const clean = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
    throw new Error('Offline name must be 3-16 characters (letters, numbers, underscore).');
  }
  const hasMsa = accounts().get('list', []).some((a) => a.type === 'msa');
  if (!hasMsa) {
    throw new Error(
      'Offline profiles unlock after a Microsoft account that owns Minecraft signs in on this launcher. ' +
      'They are meant for playing without internet, not for skipping game ownership.'
    );
  }
  const entry = { id: offlineUuid(clean), name: clean, type: 'offline', addedAt: new Date().toISOString() };
  upsertAccount(entry);
  return { id: entry.id, name: entry.name, type: 'offline' };
}

/** Build the MCLC `authorization` object for the active (or given) account, refreshing MSA tokens. */
export async function getMclcAuth(accountId) {
  const s = accounts();
  const id = accountId || s.get('activeId');
  const acc = s.get('list', []).find((a) => a.id === id);
  if (!acc) throw new Error('No account selected. Add an account first.');
  if (acc.type === 'offline') {
    return {
      access_token: acc.id,
      client_token: acc.id,
      uuid: acc.id,
      name: acc.name,
      user_properties: '{}',
      meta: { type: 'mojang', demo: false },
    };
  }
  if (!acc.refresh) throw new Error('Saved login expired. Please sign in to Microsoft again.');
  const authManager = new Auth('select_account');
  let xbox;
  try {
    xbox = await authManager.refresh(acc.refresh);
  } catch (err) {
    throw new Error(`Could not refresh Microsoft login (sign in again): ${err.message || err}`);
  }
  const mc = await xbox.getMinecraft();
  upsertAccount({
    id: mc.profile.id,
    name: mc.profile.name,
    type: 'msa',
    refresh: typeof xbox.save === 'function' ? xbox.save() : acc.refresh,
  });
  return mc.mclc();
}
