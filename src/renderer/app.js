/* global window, document, I18N, MD */
const api = (channel, payload) => window.pmcl.invoke(channel, payload);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key, params) => I18N.t(key, params);

const ICONS = {
  group: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2A3.2 3.2 0 0 1 16 11"/><path d="M18 14.2A6 6 0 0 1 21 20"/></svg>',
  library: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  news: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 14-6v14L3 13z"/><path d="M17 8a3 3 0 0 1 0 8"/><path d="M6 13v4a2 2 0 0 0 2 2h1"/></svg>',
  settings: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="15" cy="8" r="2.4"/><circle cx="7" cy="16" r="2.4"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>',
  upload: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>',
  refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  play: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  stop: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  folder: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  lock: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  discord: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.3 5.4A17 17 0 0 0 15 4l-.3.5a12 12 0 0 1 3.7 1.9 15.6 15.6 0 0 0-12.8 0A12 12 0 0 1 9.4 4.5L9 4a17 17 0 0 0-4.3 1.4C2 9.3 1.4 13.1 1.7 16.8A17 17 0 0 0 6.9 19l.6-.9c-.9-.3-1.7-.7-2.4-1.2l.6-.4a12 12 0 0 0 10.6 0l.6.4c-.7.5-1.5.9-2.4 1.2l.6.9a17 17 0 0 0 5.2-2.2c.4-4.3-.6-8-3.6-11.4ZM8.5 14.5c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z"/></svg>',
  spin: '<svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-3-6.7"/></svg>',
  warn: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.3 3.9-8 13.9A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.2l-8-13.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 7 7 .5-5.5 4.5 2 7L12 18l-6.5 3 2-7L2 9.5 9 9z"/></svg>',
};

const state = {
  view: 'library',            // group | library | instance | news | newsDetail | settings
  tab: 'mods',
  appInfo: {},
  settings: {},
  accounts: { list: [], activeId: null },
  instances: [],
  currentId: null,
  current: null,
  mods: [],
  update: null,
  logs: {},
  checkingUpdate: false,
  group: null,
  newsId: null,
  pings: {},                  // "host:port" -> { at, res }
};

/* ---------------- Small helpers ---------------- */

function artGradient(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const h2 = (h + 40) % 360;
  return `linear-gradient(135deg, hsl(${h},52%,46%), hsl(${h2},60%,32%))`;
}

/** Icon tile: gradient + initial always render as the base layer; the real pack
 *  icon (when present) covers them. A slow or broken image therefore shows the
 *  placeholder immediately — no blank boxes. */
function artTile(name, iconUrl, cls, inner = '') {
  const initial = esc((String(name).trim()[0] || '?').toUpperCase());
  const img = iconUrl ? `<span class="fb-initial">${initial}</span><img class="tile-img" src="${esc(iconUrl)}" alt="" loading="lazy"/>` : '';
  return `<span class="${cls} art-tile ${iconUrl ? 'has-img' : ''}" style="background:${artGradient(name)}">${img}${inner}</span>`;
}

/* Broken images degrade gracefully: tile images vanish (placeholder is beneath),
 * avatars become initials, photo/hero layers disappear (error events only reach
 * us in the capture phase — they don't bubble). */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const avatar = img.closest('.avatar[data-fb], .a-avatar[data-fb]');
  if (avatar) {
    const name = avatar.dataset.fb || '?';
    img.remove();
    avatar.textContent = name.trim().slice(0, 2).toUpperCase() || '?';
    return;
  }
  if (img.classList.contains('tile-img') || img.classList.contains('art-photo') || img.classList.contains('hero-img') || img.closest('.r-icon')) {
    img.remove(); // the gradient / initial / emoji behind it takes over
  }
}, true);

function tagPillClass(tag) {
  let h = 0;
  for (const c of String(tag)) h = (h * 7 + c.charCodeAt(0)) % 3;
  return ['gold', 'purple', 'green'][h];
}

function excerptOf(md, max = 150) {
  const text = String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function serverString(server) {
  if (!server?.address) return null;
  return server.port && server.port !== 25565 ? `${server.address}:${server.port}` : server.address;
}

function loaderLabel(inst) {
  if (!inst.loader || inst.loader.type === 'vanilla') return 'Vanilla';
  return `${inst.loader.type[0].toUpperCase()}${inst.loader.type.slice(1)} ${inst.loader.version || ''}`.trim();
}

function sourceLabel(source) {
  switch (source?.type) {
    case 'modrinth': return 'Modrinth';
    case 'curseforge': return 'CurseForge';
    case 'github-releases': return `GitHub ${source.owner}/${source.repo}`;
    case 'mrpack-url': return 'URL';
    default: return null;
  }
}

function fmtDownloads(n) {
  if (!n) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/* ---------------- Toasts & modals ---------------- */

function toast(message, kind = 'info', ms = 5500) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="t-dot"></span><span class="t-msg">${esc(message)}</span><button class="t-close">✕</button>`;
  $('.t-close', el).addEventListener('click', () => el.remove());
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function modal(html, opts = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${opts.cls || ''}">${html}</div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  $$('[data-close]', backdrop).forEach((b) => b.addEventListener('click', close));
  $('#modal-root').appendChild(backdrop);
  return { el: backdrop, close };
}

function modalShell(title, bodyHtml, opts = {}) {
  return modal(`
    <div class="modal-head"><h2>${title}</h2><button class="modal-close" data-close>✕</button></div>
    <div class="modal-body">${bodyHtml}</div>`, opts);
}

function confirmModal(title, body, confirmLabel) {
  return new Promise((resolve) => {
    const m = modal(`
      <div class="modal-body" style="text-align:center;padding:26px 24px">
        <div class="m-icon" style="width:52px;height:52px;margin:0 auto 16px;border-radius:14px;background:rgba(240,97,109,.12);display:flex;align-items:center;justify-content:center;color:var(--red)">${ICONS.warn}</div>
        <h2 style="font:800 18px var(--font-disp)">${esc(title)}</h2>
        <p style="color:var(--muted);margin:9px auto 22px;line-height:1.5;font-size:13.5px">${esc(body)}</p>
        <div style="display:flex;gap:10px">
          <button class="btn grow-btn" style="flex:1;height:46px" data-close>${t('common.cancel')}</button>
          <button class="btn grow-btn" id="cf-yes" style="flex:1;height:46px;border:none;background:var(--red);color:#2a0608;font-weight:800">${esc(confirmLabel || t('common.delete'))}</button>
        </div>
      </div>`, { cls: 'narrow' });
    $('#cf-yes', m.el).addEventListener('click', () => { m.close(); resolve(true); });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(false); });
    $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

function waitingModal(title, sub) {
  return modal(`
    <div class="modal-body" style="text-align:center;padding:34px 26px">
      <span class="spin-big" style="animation:spin 1.1s linear infinite;color:var(--gold);font-size:30px;display:inline-block">◌</span>
      <div style="font:800 17px var(--font-disp);margin-top:16px">${esc(title)}</div>
      <div style="color:var(--muted);margin-top:7px;line-height:1.5;font-size:13px">${esc(sub)}</div>
    </div>`, { cls: 'narrow' });
}

/* External links open in the system browser. */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="https://"]');
  if (a) {
    e.preventDefault();
    api('app:openExternal', { url: a.href }).catch(() => {});
  }
});

/* ---------------- Progress / events from main ---------------- */

let progressHideTimer = null;
function showProgress(label, value, max) {
  $('#global-progress').classList.remove('hidden');
  $('#gp-idle').classList.add('hidden');
  $('#gp-label').textContent = I18N.translateStatus(label);
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  $('#gp-pct').textContent = max ? `${pct}%` : '';
  $('#gp-fill').style.width = max ? `${pct}%` : '30%';
  clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(() => {
    $('#global-progress').classList.add('hidden');
    $('#gp-idle').classList.remove('hidden');
  }, 4000);
}

window.pmcl.onEvent((evt) => {
  switch (evt.type) {
    case 'status':
      showProgress(evt.text, 0, 0);
      break;
    case 'progress':
      showProgress(evt.label || t('common.working'), evt.value || 0, evt.max || 0);
      break;
    case 'log': {
      const id = evt.instanceId;
      if (!id) break;
      const buf = state.logs[id] || (state.logs[id] = []);
      buf.push(evt.line);
      if (buf.length > 3000) buf.splice(0, buf.length - 3000);
      if (state.view === 'instance' && state.currentId === id && state.tab === 'logs') {
        const pre = $('#log-pre');
        if (pre) {
          pre.textContent = buf.join('\n');
          pre.scrollTop = pre.scrollHeight;
        }
      }
      break;
    }
    case 'exit':
      toast(t('inst.exited', { c: evt.code }), evt.code === 0 ? 'info' : 'error');
      refreshInstances();
      break;
    case 'instances-changed':
      refreshInstances();
      break;
    case 'launcher-update-available':
      renderLauncherUpdate('downloading', evt.version);
      break;
    case 'launcher-update-ready':
      renderLauncherUpdate('ready', evt.version);
      break;
    default:
      break;
  }
});

function renderLauncherUpdate(phase, version) {
  const box = $('#launcher-update');
  box.classList.remove('hidden');
  if (phase === 'downloading') {
    box.innerHTML = `
      <div class="launcher-update-dl">
        <div class="row"><span class="spin">◌</span><span style="flex:1">${t('update.downloading', { v: esc(version) })}</span></div>
        <div class="bar"><div class="fill" style="width:40%"></div></div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="launcher-update-ready">
        <div style="flex:1;min-width:0">
          <div class="lu-title">${t('update.ready', { v: esc(version) })}</div>
        </div>
        <button class="lu-btn" id="lu-restart">${t('update.restart')}</button>
      </div>`;
    $('#lu-restart').addEventListener('click', () => api('app:installUpdate').catch((e) => toast(e.message, 'error')));
  }
}

/* ---------------- Data loading ---------------- */

async function refreshAccounts() {
  state.accounts = await api('accounts:list');
  renderAccountChip();
}

async function refreshInstances() {
  state.instances = await api('instances:list');
  if (state.currentId) {
    const found = state.instances.find((i) => i.id === state.currentId);
    if (!found) { state.currentId = null; state.view = 'library'; }
  }
  if (state.view === 'instance' && state.currentId) {
    state.current = await api('instances:get', { id: state.currentId });
    state.mods = await api('mods:list', { id: state.currentId });
  }
  render();
}

let lastGroupSnapshot = null;
const popupShownIds = new Set();

async function refreshGroup({ force = false, announce = false } = {}) {
  try {
    state.group = await api('group:get', { force });
  } catch (err) {
    state.group = { config: null, error: err.message };
  }
  const cfg = state.group?.config;
  const snapshot = JSON.stringify([cfg, state.group?.installs]);
  const changed = snapshot !== lastGroupSnapshot;
  const firstLoad = lastGroupSnapshot === null;
  lastGroupSnapshot = snapshot;

  if (cfg && announce) {
    const known = new Set(state.settings.knownGroupPacks || []);
    const fresh = cfg.packs.filter((p) => !known.has(p.id));
    if (known.size && fresh.length) {
      fresh.forEach((p) => toast(t('group.newPack', { name: p.name }), 'success', 9000));
    }
    if (fresh.length || !known.size) {
      state.settings.knownGroupPacks = cfg.packs.map((p) => p.id);
      api('group:rememberPacks', { ids: state.settings.knownGroupPacks }).catch(() => {});
    }
    // Version bumps on installed packs -> "update available" toast (once per version).
    const knownVers = { ...(state.settings.knownPackVersions || {}) };
    let versChanged = false;
    for (const p of cfg.packs) {
      if (!p.version) continue;
      const install = state.group?.installs?.[p.id];
      if (install && install.packVersion !== p.version && knownVers[p.id] !== p.version) {
        toast(t('group.updToast', { name: p.name, v: p.version }), 'success', 9000);
      }
      if (knownVers[p.id] !== p.version) { knownVers[p.id] = p.version; versChanged = true; }
    }
    if (versChanged) {
      state.settings.knownPackVersions = knownVers;
      api('settings:set', { knownPackVersions: knownVers }).catch(() => {});
    }
    const seen = new Set(state.settings.seenAnnouncements || []);
    const unseen = cfg.announcements.filter((a) => !seen.has(a.id) && !popupShownIds.has(a.id));
    if (unseen.length && !$('#modal-root').children.length) {
      unseen.forEach((a) => popupShownIds.add(a.id));
      announcementPopup(unseen);
    }
  }
  if (changed || firstLoad) {
    renderSidebar();
    renderTopbar();
    if (['group', 'news', 'newsDetail', 'library'].includes(state.view)) render();
  }
}

function startGroupAutoRefresh() {
  setInterval(() => refreshGroup({ force: true, announce: true }).catch(() => {}), 3 * 60_000);
  let lastFocusRefresh = 0;
  window.addEventListener('focus', () => {
    if (Date.now() - lastFocusRefresh > 30_000) {
      lastFocusRefresh = Date.now();
      refreshGroup({ force: true, announce: true }).catch(() => {});
    }
  });
}

function unseenAnnouncements() {
  const cfg = state.group?.config;
  if (!cfg) return [];
  const seen = new Set(state.settings.seenAnnouncements || []);
  return cfg.announcements.filter((a) => !seen.has(a.id));
}

function markSeen(ids) {
  return api('group:markAnnouncementsSeen', { ids }).then((seen) => {
    state.settings.seenAnnouncements = seen;
    renderSidebar();
    renderTopbar();
  }).catch(() => {});
}

async function openInstance(id, tab = 'mods') {
  state.view = 'instance';
  state.currentId = id;
  state.tab = tab;
  state.update = null;
  state.current = await api('instances:get', { id });
  state.mods = await api('mods:list', { id });
  render();
  autoCheckUpdate();
}

async function autoCheckUpdate() {
  const inst = state.current;
  if (!inst || !inst.source || inst.source.type === 'none') return;
  state.checkingUpdate = true;
  renderUpdateBanner();
  try {
    state.update = await api('packs:checkUpdate', { id: inst.id });
  } catch (err) {
    state.update = { error: err.message };
  }
  state.checkingUpdate = false;
  renderUpdateBanner();
}

/* ---------------- Server pings ---------------- */

async function pingAndRender(server) {
  const key = serverString(server);
  if (!key) return;
  const cached = state.pings[key];
  if (cached && Date.now() - cached.at < 60_000) return updatePingSlots(key, cached.res);
  try {
    const res = await api('server:ping', { address: server.address, port: server.port || 25565 });
    state.pings[key] = { at: Date.now(), res };
    updatePingSlots(key, res);
  } catch {
    state.pings[key] = { at: Date.now(), res: { online: false } };
    updatePingSlots(key, { online: false });
  }
}

function updatePingSlots(key, res) {
  $$(`[data-ping-slot="${CSS.escape(key)}"]`).forEach((el) => {
    if (res.online) {
      el.className = 'status online';
      el.innerHTML = `<span class="s-dot"></span>${t('group.srvOnline')} · ${res.playersOnline}/${res.playersMax} · ${res.latencyMs}ms`;
    } else {
      el.className = 'status offline';
      el.innerHTML = `<span class="s-dot"></span>${t('group.srvOffline')}`;
    }
  });
}

/* ---------------- Rendering: chrome ---------------- */

function renderAccountChip() {
  const active = state.accounts.list.find((a) => a.id === state.accounts.activeId);
  $('#account-avatar').dataset.fb = active ? active.name : '?';
  $('#account-name').textContent = active ? active.name : t('account.none');
  const status = $('#account-status');
  if (active) {
    status.textContent = `● ${active.type === 'msa' ? t('account.status.ms') : t('account.status.offline')}`;
    status.classList.remove('none');
  } else {
    status.textContent = `● ${t('account.status.none')}`;
    status.classList.add('none');
  }
  $('#account-avatar').innerHTML = active
    ? `<img src="https://mc-heads.net/avatar/${encodeURIComponent(active.type === 'msa' ? active.id : active.name)}/68" alt="" />`
    : '?';
}

function screenTitle() {
  switch (state.view) {
    case 'group': return state.group?.config?.groupName || t('nav.group');
    case 'news': case 'newsDetail': return t('news.title');
    case 'settings': return t('settings.title');
    case 'instance': return state.current?.name || t('nav.library');
    default: return t('library.title');
  }
}

function renderTopbar() {
  $('#screen-title').textContent = screenTitle();
  const off = $('#chip-offline');
  if (state.group?.fromCache) {
    off.classList.remove('hidden');
    off.textContent = `⚠ ${t('topbar.offline')}`;
  } else {
    off.classList.add('hidden');
  }
  $$('#lang-seg button').forEach((b) => b.classList.toggle('active', b.dataset.lang === I18N.getLang()));
  $('#bell-dot').classList.toggle('hidden', unseenAnnouncements().length === 0);
}

function renderSidebar() {
  const hasGroup = !!state.group?.config;
  const unseen = unseenAnnouncements().length;
  const navItems = [
    ...(hasGroup ? [['group', ICONS.group, t('nav.group')]] : []),
    ['library', ICONS.library, t('nav.library')],
    ...(hasGroup ? [['news', ICONS.news, t('nav.news')]] : []),
    ['settings', ICONS.settings, t('nav.settings')],
  ];
  const activeNav = state.view === 'instance' ? 'library' : state.view === 'newsDetail' ? 'news' : state.view;
  $('#nav').innerHTML = navItems.map(([key, icon, label]) => `
    <button class="nav-btn ${activeNav === key ? 'active' : ''}" data-nav="${key}">
      ${icon}<span>${label}</span>${key === 'news' && unseen ? '<span class="dot-badge"></span>' : ''}
    </button>`).join('');
  $$('#nav .nav-btn').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.nav;
    if (state.view === 'library') state.currentId = null;
    render();
  }));

  $('#instances-label').textContent = t('sidebar.instances').toUpperCase();
  $('#instances-count').textContent = String(state.instances.length || '');
  $('#btn-new').innerHTML = `${ICONS.plus}${t('sidebar.new').replace(/^＋\s*/, '')}`;
  $('#btn-import').innerHTML = `${ICONS.download}${t('sidebar.import').replace(/^⬇\s*/, '')}`;

  const discordBtn = $('#btn-discord');
  const discordUrl = state.group?.config?.discordUrl;
  if (discordUrl) {
    discordBtn.classList.remove('hidden');
    discordBtn.innerHTML = `${ICONS.discord}${t('sidebar.discord')}<span class="arrow">↗</span>`;
    discordBtn.onclick = () => api('app:openExternal', { url: discordUrl }).catch((e) => toast(e.message, 'error'));
  } else {
    discordBtn.classList.add('hidden');
  }

  const list = $('#instance-list');
  list.innerHTML = state.instances.map((i) => `
    <button class="instance-item ${state.currentId === i.id && state.view === 'instance' ? 'active' : ''}" data-id="${esc(i.id)}">
      ${artTile(i.name, i.iconUrl, 'art', i.running ? '<span class="run-dot"></span>' : '')}
      <span class="grow">
        <span class="ii-name">${esc(i.name)}</span>
        <span class="ii-sub">${esc(i.mc.version)} · ${esc(loaderLabel(i))}</span>
      </span>
    </button>`).join('') || `<div class="muted" style="padding:8px;font-size:12px">${t('sidebar.noInstances')}</div>`;
  $$('.instance-item', list).forEach((el) => el.addEventListener('click', () => openInstance(el.dataset.id)));

  $('#gp-idle').textContent = t('gp.idle');
}

function render() {
  renderSidebar();
  renderTopbar();
  renderAccountChip();
  const main = $('#main');
  if (state.view === 'settings') return renderGlobalSettings(main);
  if (state.view === 'group') return renderGroup(main);
  if (state.view === 'news') return renderNews(main);
  if (state.view === 'newsDetail') return renderNewsDetail(main);
  if (state.view === 'instance' && state.current) return renderInstance(main);
  return renderLibrary(main);
}

/* ---------------- Group view ---------------- */

function renderGroup(main) {
  const g = state.group;
  if (!g?.config) {
    main.innerHTML = `
      <div class="empty-state error">
        <div class="icon">!</div>
        <h2>${t('group.errorTitle')}</h2>
        <p>${esc(g?.error || t('group.notConfigured'))}</p>
        <button class="btn danger" id="grp-retry">${t('group.retry')}</button>
      </div>`;
    $('#grp-retry').addEventListener('click', () => refreshGroup({ force: true }));
    return;
  }
  const cfg = g.config;
  main.innerHTML = `
    <div class="view-head">
      <div>
        <h1>${esc(cfg.groupName)}</h1>
        <div class="sub">${t('group.title')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex:none">
        ${g.fromCache ? `<span class="chip-cached">${t('group.fromCache')}</span>` : ''}
        <button class="btn" id="grp-refresh">${ICONS.refresh}${t('common.refresh')}</button>
      </div>
    </div>
    ${cfg.packs.length ? '' : `
      <div class="empty-state">
        <div class="icon">${ICONS.group}</div>
        <h2>${t('group.emptyTitle')}</h2>
        <p>${t('group.empty')}</p>
      </div>`}
    <div class="pack-grid">
      ${cfg.packs.map((p) => {
        const install = g.installs?.[p.id];
        const inst = install ? state.instances.find((i) => i.id === install.instanceId) : null;
        const server = serverString(p.server);
        const iconUrl = p.icon || inst?.iconUrl || null;
        const updateAvail = install && p.version && install.packVersion !== p.version;
        return `
          <div class="pack-card">
            <div class="strip" style="background:${artGradient(p.name)}"></div>
            <div class="body">
              <div class="head">
                ${artTile(p.name, iconUrl, 'p-icon')}
                <div style="flex:1;min-width:0">
                  <h3>${esc(p.name)}</h3>${p.recommended ? `<span class="pill star">★ ${t('group.recommended').replace(/^★\s*/, '')}</span>` : ''}
                  ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
                </div>
              </div>
              ${server ? `
                <div class="server-row">
                  <span class="ip" data-copy-ip="${esc(server)}" title="Copy">${esc(server)}</span>
                  <span class="status" data-ping-slot="${esc(server)}"><span class="s-dot"></span>${t('group.srvChecking')}</span>
                </div>` : ''}
              <div style="flex:1"></div>
              <div class="actions">
                ${install ? `
                  <div class="installed-row">
                    <span class="installed-tag">${ICONS.check}${t('group.installed')}${install.packVersion ? ` · v${esc(install.packVersion)}` : ''}</span>
                    <div style="flex:1"></div>
                    <button class="btn" data-open="${esc(install.instanceId)}">${t('group.open')}</button>
                    ${updateAvail
                      ? `<button class="btn purple" data-update="${esc(install.instanceId)}">${t('group.updateTo', { v: esc(p.version) })}</button>`
                      : inst && !inst.running ? `<button class="btn play-sm" data-play="${esc(install.instanceId)}">${ICONS.play}${t('inst.play').replace(/^▶\s*/, '')}</button>` : ''}
                  </div>` : `
                  <button class="btn gold-big install-big" data-install="${esc(p.id)}">${ICONS.download}${t('group.install')}</button>`}
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  $('#grp-refresh').addEventListener('click', () => refreshGroup({ force: true }));
  $$('[data-open]', main).forEach((b) => b.addEventListener('click', () => openInstance(b.dataset.open)));
  $$('[data-play]', main).forEach((b) => b.addEventListener('click', () => playInstance(b.dataset.play, true, b)));
  $$('[data-update]', main).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    await openInstance(b.dataset.update);
    applyUpdateFlow();
  }));
  $$('[data-install]', main).forEach((b) => b.addEventListener('click', () => {
    const pack = cfg.packs.find((p) => p.id === b.dataset.install);
    if (pack) installGroupPack(pack);
  }));
  $$('[data-copy-ip]', main).forEach((el) => el.addEventListener('click', async () => {
    await api('app:copyText', { text: el.dataset.copyIp }).catch(() => {});
    toast(t('group.copied'), 'success', 3000);
  }));
  for (const p of cfg.packs) if (p.server) pingAndRender(p.server);
}

async function installGroupPack(pack) {
  const wait = waitingModal(t('import.preparing'), t('import.preparingSub'));
  let info;
  try {
    info = await api('group:beginInstall', { pack });
  } catch (err) {
    wait.close();
    toast(err.message, 'error', 9000);
    return;
  }
  wait.close();
  installArchiveModal(info, {
    name: pack.name,
    extra: { server: pack.server, groupPackId: pack.id, icon: info.iconUrl || pack.icon || null },
    onDone: () => refreshGroup({}),
  });
}

/* ---------------- Library ---------------- */

function renderLibrary(main) {
  if (!state.instances.length) {
    main.innerHTML = `
      <div class="empty-state">
        <div class="icon">${ICONS.library}</div>
        <h2>${t('library.welcome')}</h2>
        <p>${t('library.welcomeSub')}</p>
        <div style="display:flex;gap:12px;justify-content:center">
          <button class="btn gold-big" id="e-new" style="padding:12px 22px">${ICONS.plus}${t('library.newInstance').replace(/^＋\s*/, '')}</button>
          <button class="btn" id="e-import" style="padding:12px 22px">${t('library.importPack').replace(/^⬇\s*/, '')}</button>
        </div>
      </div>`;
    $('#e-new').addEventListener('click', newInstanceModal);
    $('#e-import').addEventListener('click', importModal);
    return;
  }
  main.innerHTML = `
    <div class="lib-grid">
      ${state.instances.map((i) => `
        <div class="lib-card" data-id="${esc(i.id)}">
          <div class="art ${i.iconUrl ? 'photo' : ''}" style="background:${artGradient(i.name)}">
            ${i.iconUrl ? `<img class="art-photo" src="${esc(i.iconUrl)}" alt="" loading="lazy"/>` : ''}
            ${i.running ? `<span class="badge-running"><span class="pulse"></span>${t('inst.launching').replace('…', '')}</span>` : ''}
          </div>
          <div class="body">
            <h3>${esc(i.name)}</h3>
            <div class="meta">${esc(i.mc.version)} · ${esc(loaderLabel(i))}${i.packVersion ? ` · v${esc(i.packVersion)}` : ''}</div>
          </div>
        </div>`).join('')}
    </div>`;
  $$('.lib-card', main).forEach((el) => el.addEventListener('click', () => openInstance(el.dataset.id)));
}

/* ---------------- Instance detail ---------------- */

function renderUpdateBanner() {
  const holder = $('#update-banner-holder');
  if (!holder) return;
  const u = state.update;
  if (state.checkingUpdate) {
    holder.innerHTML = `<div class="update-banner neutral"><span class="spin">◌</span><span>${t('inst.checkingUpdate')}</span></div>`;
    return;
  }
  if (!u) { holder.innerHTML = ''; return; }
  if (u.error) {
    holder.innerHTML = `
      <div class="update-banner error">
        <div class="grow" style="color:#ff9098">${t('inst.updateFailed', { e: esc(u.error) })}</div>
        <button class="btn" id="btn-recheck">${t('group.retry')}</button>
      </div>`;
    $('#btn-recheck').addEventListener('click', autoCheckUpdate);
    return;
  }
  if (!u.available) { holder.innerHTML = ''; return; }
  holder.innerHTML = `
    <div class="update-banner">
      <div class="grow"><b>${t('inst.updateAvailable')}</b> <span class="vers">${esc(u.current ?? '?')} → ${esc(u.latest)}</span></div>
      <button class="btn purple" id="btn-apply-update">${t('inst.updateNow')}</button>
    </div>`;
  $('#btn-apply-update').addEventListener('click', applyUpdateFlow);
}

function renderInstance(main) {
  const inst = state.current;
  const src = sourceLabel(inst.source);
  const server = serverString(inst.server);
  main.innerHTML = `
    <button class="btn subtle back-btn" id="btn-back">${ICONS.back}${t('nav.library')}</button>
    <div class="detail-header">
      ${artTile(inst.name, inst.iconUrl, 'd-icon')}
      <div style="flex:1;min-width:0">
        <div>
          <h1>${esc(inst.name)}</h1>
          ${inst.running ? `<span class="badge-running"><span class="pulse"></span>RUNNING</span>` : ''}
        </div>
        <div class="pills">
          <span class="pill">${esc(inst.mc.version)}</span>
          <span class="pill">${esc(loaderLabel(inst))}</span>
          ${inst.packVersion ? `<span class="pill gold">${t('inst.packVersion', { v: esc(inst.packVersion) })}</span>` : ''}
          ${src ? `<span class="pill">${esc(src)}</span>` : ''}
          ${server ? `<span class="pill purple">${esc(server)}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        ${inst.running
          ? `<button class="btn danger stop-big" id="btn-kill">${ICONS.stop}${t('inst.stop').replace(/^■\s*/, '')}</button>`
          : `<button class="btn play-big" id="btn-play">${ICONS.play}${(server ? t('inst.playJoin') : t('inst.play')).replace(/^▶\s*/, '')}</button>
             ${server ? `<button class="link-btn" id="btn-play-solo">${t('inst.playSolo')}</button>` : ''}`}
      </div>
    </div>
    <div id="update-banner-holder"></div>
    <div class="tabs">
      <button class="tab ${state.tab === 'mods' ? 'active' : ''}" data-tab="mods">${t('inst.tabMods')}</button>
      <button class="tab ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">${t('inst.tabSettings')}</button>
      <button class="tab ${state.tab === 'logs' ? 'active' : ''}" data-tab="logs">${t('inst.tabLogs')}</button>
    </div>
    <div id="tab-body"></div>`;

  $('#btn-back').addEventListener('click', () => { state.view = 'library'; state.currentId = null; render(); });
  $$('.tab', main).forEach((x) => x.addEventListener('click', () => { state.tab = x.dataset.tab; render(); }));
  $('#btn-play')?.addEventListener('click', (e) => playInstance(inst.id, true, e.currentTarget));
  $('#btn-play-solo')?.addEventListener('click', () => playInstance(inst.id, false));
  $('#btn-kill')?.addEventListener('click', async () => { await api('launch:kill', { id: inst.id }); refreshInstances(); });
  renderUpdateBanner();

  const body = $('#tab-body');
  if (state.tab === 'mods') renderModsTab(body);
  else if (state.tab === 'settings') renderInstanceSettings(body);
  else renderLogsTab(body);
}

function renderModsTab(body) {
  const inst = state.current;
  const catalog = inst.optionalCatalog || {};
  const choices = inst.optionalChoices || {};
  const onDisk = new Set(state.mods.map((m) => `mods/${m.name}`));
  const notInstalled = Object.entries(catalog).filter(([rel]) => !onDisk.has(rel) && !choices[rel]);

  body.innerHTML = `
    <div class="mods-wrap">
      <div class="mods-toolbar">
        <button class="btn" id="btn-add-jar">${ICONS.download}${t('mods.addJar').replace(/^＋\s*/, '')}</button>
        <div class="search-box">${ICONS.search}<input type="text" id="mod-search" placeholder="${t('mods.searchPlaceholder')}"/></div>
        <button class="btn" id="btn-mod-search">${t('common.search')}</button>
      </div>
      <div id="mod-search-results"></div>
      <div class="section-label">${t('mods.installedHeader')} · ${state.mods.length}</div>
      <div class="mod-rows">
        ${state.mods.length === 0 && notInstalled.length === 0 ? `<p class="muted" style="padding:6px 2px">${t('mods.none')}</p>` : ''}
        ${state.mods.map((m) => `
          <div class="mod-row ${m.enabled ? '' : 'off'}">
            <label class="switch"><input type="checkbox" data-toggle="${esc(m.file)}" data-rel="mods/${esc(m.name)}" data-optional="${m.optional ? '1' : ''}" ${m.enabled ? 'checked' : ''}/><span class="slider"></span></label>
            <span class="mod-name" title="${esc(m.name)}">${esc(m.name)}</span>
            ${m.fromPack ? `<span class="pill ${m.optional ? 'purple' : 'gold'}">${m.optional ? t('mods.optional') : t('mods.pack')}</span>` : `<span class="pill">${t('mods.yours')}</span>`}
            ${!m.fromPack || m.optional ? `<button class="icon-btn" title="${t('common.delete')}" data-del="${esc(m.file)}">${ICONS.trash}</button>` : ''}
          </div>`).join('')}
      </div>
      ${notInstalled.length ? `<div class="section-label" style="margin-top:22px">${t('mods.optionalHeader').toUpperCase()}</div>` : ''}
      <div class="mod-rows">
        ${notInstalled.map(([rel, meta]) => `
          <div class="mod-row dashed">
            <div style="flex:1;min-width:0">
              <div class="mod-name">${esc(meta.name || rel)}</div>
              <div class="sub">${t('mods.notInstalled')}</div>
            </div>
            <button class="btn" data-opt-install="${esc(rel)}">${t('group.install')}</button>
          </div>`).join('')}
      </div>
    </div>`;

  $('#btn-add-jar').addEventListener('click', async () => {
    try { state.mods = await api('mods:addLocal', { id: inst.id }); render(); } catch (err) { toast(err.message, 'error'); }
  });

  const doSearch = async () => {
    const q = $('#mod-search').value.trim();
    if (!q) return;
    const holder = $('#mod-search-results');
    holder.innerHTML = `<p class="muted" style="margin-bottom:14px">${t('common.searching')}</p>`;
    try {
      const hits = await api('mods:searchModrinth', { id: inst.id, query: q });
      holder.innerHTML = hits.length ? `
        <div class="results-panel">
          <div class="rp-head">${ICONS.star} ${t('mods.results')}</div>
          ${hits.map((h) => `
            <div class="result-row">
              <div class="r-icon">${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : ''}</div>
              <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
              <span class="dl">${fmtDownloads(h.downloads)}</span>
              <button class="btn gold" data-install="${esc(h.projectId)}" style="padding:7px 13px;font-size:12px">${t('mods.add')}</button>
              <button class="btn subtle" data-install-opt="${esc(h.projectId)}" title="${t('mods.addOptionalTitle')}" style="padding:7px 12px;font-size:12px;white-space:nowrap">${t('mods.addOptional')}</button>
            </div>`).join('')}
        </div>` : `<p class="muted" style="margin-bottom:14px">${t('common.noResults')}</p>`;
      $$('[data-install]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.install, false, b)));
      $$('[data-install-opt]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.installOpt, true, b)));
    } catch (err) {
      holder.innerHTML = `<p class="muted" style="margin-bottom:14px">${t('mods.searchFailed', { e: esc(err.message) })}</p>`;
    }
  };
  $('#btn-mod-search').addEventListener('click', doSearch);
  $('#mod-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  $$('[data-toggle]', body).forEach((cb) => cb.addEventListener('change', async () => {
    try {
      if (cb.dataset.optional) {
        await api('mods:setOptionalEnabled', { id: inst.id, rel: cb.dataset.rel, enabled: cb.checked });
        await openInstance(inst.id, 'mods');
      } else {
        state.mods = await api('mods:toggle', { id: inst.id, file: cb.dataset.toggle });
        render();
      }
    } catch (err) { toast(err.message, 'error'); render(); }
  }));
  $$('[data-opt-install]', body).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api('mods:setOptionalEnabled', { id: inst.id, rel: b.dataset.optInstall, enabled: true });
      toast(t('mods.optionalInstalled'), 'success');
      await openInstance(inst.id, 'mods');
    } catch (err) { toast(err.message, 'error'); render(); }
  }));
  $$('[data-del]', body).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmModal(t('mods.deleteTitle'), t('mods.deleteBody', { f: b.dataset.del })))) return;
    try { state.mods = await api('mods:delete', { id: inst.id, file: b.dataset.del }); render(); } catch (err) { toast(err.message, 'error'); }
  }));
}

function renderInstanceSettings(body) {
  const inst = state.current;
  const s = inst.settings || {};
  const isGroupManaged = !!inst.source?.groupPackId;
  const server = serverString(inst.server) || '';
  body.innerHTML = `
    <div class="settings-col">
      <section class="settings-card">
        <h2>${t('iset.general')}</h2>
        <div class="field"><label>${t('iset.name')}</label><input type="text" id="is-name" value="${esc(inst.name)}"/></div>
        <div class="field-row">
          <div class="field"><label>${t('iset.maxRam')}</label><input type="text" class="mono" id="is-memmax" placeholder="8G" value="${esc(s.memoryMax || '')}"/></div>
          <div class="field"><label>${t('iset.minRam')}</label><input type="text" class="mono" id="is-memmin" placeholder="1G" value="${esc(s.memoryMin || '')}"/></div>
        </div>
        <div class="field"><label>${t('iset.javaPath')}</label><input type="text" class="mono" id="is-java" placeholder="${t('iset.javaPlaceholder')}" value="${esc(s.javaPath || '')}"/></div>
        <div class="field"><label>${t('iset.jvmArgs')}</label><input type="text" class="mono" id="is-jvm" value="${esc(s.jvmArgs || '')}"/></div>
        <button class="btn gold" id="is-save">${t('common.save')}</button>
      </section>
      <section class="settings-card">
        <h2>${t('iset.serverTitle')}</h2>
        ${isGroupManaged ? `
          <div class="server-locked">
            ${ICONS.lock}
            <div style="flex:1">
              <div class="addr">${esc(server) || '—'}</div>
              <div class="note">${t('iset.serverManaged')}</div>
            </div>
          </div>` : `
          <div class="field">
            <label>${t('iset.server')}</label>
            <input type="text" class="mono" id="is-server" placeholder="${t('iset.serverPlaceholder')}" value="${esc(server)}"/>
            <div class="hint">${t('iset.serverHint')}</div>
          </div>
          <button class="btn" id="is-server-save">${t('common.save')}</button>`}
      </section>
      <section class="settings-card">
        <h2>${t('iset.sharing')}</h2>
        <p class="muted" style="margin:-6px 0 14px;font-size:13px">${t('iset.sharingHint')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <button class="btn" id="is-export">${ICONS.upload}${t('iset.export').replace(/^📤\s*/, '')}</button>
          <button class="btn" id="is-check-update">${ICONS.refresh}${t('iset.checkUpdates').replace(/^🔄\s*/, '')}</button>
          <button class="btn" id="is-open">${ICONS.folder}${t('iset.openFolder').replace(/^📁\s*/, '')}</button>
        </div>
      </section>
      <section class="danger-card">
        <h2>${t('iset.danger')}</h2>
        <div class="row">
          <p>${t('iset.dangerDesc')}</p>
          <button class="btn danger" id="is-delete">${t('iset.deleteInstance')}</button>
        </div>
      </section>
    </div>`;

  $('#is-save').addEventListener('click', async () => {
    try {
      await api('instances:rename', { id: inst.id, name: $('#is-name').value });
      await api('instances:patchSettings', {
        id: inst.id,
        patch: {
          memoryMax: $('#is-memmax').value.trim(),
          memoryMin: $('#is-memmin').value.trim(),
          javaPath: $('#is-java').value.trim(),
          jvmArgs: $('#is-jvm').value.trim(),
        },
      });
      toast(t('common.saved'), 'success');
      await refreshInstances();
      await openInstance(inst.id, 'settings');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#is-server-save')?.addEventListener('click', async () => {
    try {
      await api('instances:setServer', { id: inst.id, address: $('#is-server').value });
      toast(t('common.saved'), 'success');
      await openInstance(inst.id, 'settings');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#is-open').addEventListener('click', () => api('instances:openFolder', { id: inst.id }));
  $('#is-export').addEventListener('click', exportModal);
  $('#is-check-update').addEventListener('click', autoCheckUpdate);
  $('#is-delete').addEventListener('click', async () => {
    if (!(await confirmModal(t('iset.deleteTitle'), t('iset.deleteBody', { n: inst.name }), t('iset.deleteConfirm')))) return;
    try {
      await api('instances:delete', { id: inst.id });
      state.view = 'library';
      state.currentId = null;
      await refreshInstances();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function renderLogsTab(body) {
  const buf = state.logs[state.currentId] || [];
  body.innerHTML = `
    <div style="max-width:900px">
      <div class="logs-head">
        <span class="lh-label">${buf.length} lines</span>
        <button class="btn subtle" id="log-clear">${ICONS.trash}${t('logs.clear')}</button>
      </div>
      ${buf.length
        ? `<pre class="logs" id="log-pre">${esc(buf.join('\n'))}</pre>`
        : `<div class="logs empty" id="log-pre">${t('logs.empty')}</div>`}
    </div>`;
  const pre = $('#log-pre');
  pre.scrollTop = pre.scrollHeight;
  $('#log-clear').addEventListener('click', () => { state.logs[state.currentId] = []; renderLogsTab(body); });
}

/* ---------------- News ---------------- */

function editConfigUrl() {
  const url = (state.settings.groupConfigUrl || state.group?.url || '').trim();
  const m = String(url).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}/edit/${m[3]}/${m[4]}`;
}

function annCardHtml(a, unseenSet) {
  const tagCls = tagPillClass(a.tag || 'update');
  return `
    <div class="ann-card ${unseenSet?.has(a.id) ? 'unseen' : ''}" data-ann="${esc(a.id)}">
      <div class="a-icon" style="background:${artGradient(a.id + a.title)}">${esc(a.emoji || '📣')}${a.image ? `<img class="art-photo" src="${esc(a.image)}" alt="" loading="lazy"/>` : ''}</div>
      <div class="grow">
        <div class="tags">
          ${a.tag ? `<span class="pill ${tagCls}">${esc(a.tag)}</span>` : ''}
          ${a.pinned ? `<span class="pill pin">${t('news.pinned')}</span>` : ''}
          ${unseenSet?.has(a.id) ? `<span class="pill new-chip">${t('news.unseenChip')}</span>` : ''}
        </div>
        <h3>${esc(a.title)}</h3>
        <div class="excerpt">${esc(excerptOf(a.body))}</div>
        <div class="byline">${t('news.by')} ${esc(a.author || '')} · ${esc(a.date)}</div>
      </div>
    </div>`;
}

function renderNews(main) {
  const cfg = state.group?.config;
  const anns = cfg?.announcements || [];
  const unseen = new Set(unseenAnnouncements().map((a) => a.id));
  const editUrl = editConfigUrl();
  main.innerHTML = `
    ${editUrl ? `<div class="news-topbar"><button class="btn gold" id="new-ann">${ICONS.plus}${t('news.newAnn')}</button></div>` : ''}
    ${anns.length ? `<div class="news-col">${anns.map((a) => annCardHtml(a, unseen)).join('')}</div>` : `
      <div class="empty-state">
        <div class="icon">${ICONS.news}</div>
        <h2>${t('news.empty')}</h2>
      </div>`}`;
  $('#new-ann')?.addEventListener('click', () => api('app:openExternal', { url: editUrl }).catch(() => {}));
  $$('[data-ann]', main).forEach((el) => el.addEventListener('click', () => {
    state.newsId = el.dataset.ann;
    state.view = 'newsDetail';
    markSeen([state.newsId]);
    render();
  }));
}

function renderNewsDetail(main) {
  const cfg = state.group?.config;
  const a = cfg?.announcements.find((x) => x.id === state.newsId);
  if (!a) { state.view = 'news'; return renderNews(main); }
  const tagCls = tagPillClass(a.tag || 'update');
  main.innerHTML = `
    <button class="btn subtle back-btn" id="news-back">${ICONS.back}${t('nav.news')}</button>
    <div class="news-detail">
      <div class="hero ${a.image ? 'has-img' : ''}" style="background:${artGradient(a.id + a.title)}">
        ${a.image ? `<img class="hero-img" src="${esc(a.image)}" alt=""/>` : ''}
        <span class="emoji">${esc(a.emoji || '📣')}</span>
      </div>
      ${a.tag ? `<span class="pill ${tagCls}">${esc(a.tag)}</span>` : ''}
      <h1>${esc(a.title)}</h1>
      <div class="byline"><span class="a-avatar">${esc((a.author || 'Iz').slice(0, 2))}</span>${esc(a.author || '')} · ${esc(a.date)}</div>
      <div class="md">${MD.render(a.body)}</div>
    </div>`;
  $('#news-back').addEventListener('click', () => { state.view = 'news'; render(); });
}

function announcementPopup(unseen) {
  const newest = unseen[0];
  const m = modal(`
    <div class="popup-hero ${newest.image ? 'has-img' : ''}" style="background:${artGradient(newest.id + newest.title)}">
      ${newest.image ? `<img class="hero-img" src="${esc(newest.image)}" alt=""/>` : ''}
      <span class="emoji">${esc(newest.emoji || '📣')}</span>
    </div>
    <div class="modal-body">
      ${newest.tag ? `<span class="pill ${tagPillClass(newest.tag)}">${esc(newest.tag)}</span>` : ''}
      <div style="font:800 20px var(--font-disp);letter-spacing:-.01em;margin:12px 0 8px;line-height:1.2">${esc(newest.title)}</div>
      <div style="color:var(--muted);line-height:1.55">${esc(excerptOf(newest.body, 220))}</div>
      <div style="font:500 12px var(--font-mono);color:var(--dim);margin-top:12px">${t('news.by')} ${esc(newest.author || '')} · ${esc(newest.date)}</div>
      <div class="modal-actions">
        <button class="btn gold-big grow-btn" id="ann-ok" style="flex:1;height:46px">${t('news.gotIt')}</button>
        ${unseen.length > 1 ? `<button class="btn" id="ann-all" style="height:46px">${t('news.viewAll')} (${unseen.length})</button>` : `<button class="btn" id="ann-read" style="height:46px">${t('news.viewAll')}</button>`}
      </div>
    </div>`, { cls: 'narrow' });
  $('#ann-ok', m.el).addEventListener('click', () => { markSeen([newest.id]); m.close(); });
  const goNews = () => { m.close(); state.view = 'news'; render(); };
  $('#ann-all', m.el)?.addEventListener('click', goNews);
  $('#ann-read', m.el)?.addEventListener('click', () => {
    m.close();
    state.newsId = newest.id;
    state.view = 'newsDetail';
    markSeen([newest.id]);
    render();
  });
}

/* ---------------- Global settings ---------------- */

const ACCENTS = [
  { id: 'gold-ench', accent2: '#a970ff', dots: ['#e6b53f', '#a970ff'], label: 'settings.accentGoldEnch' },
  { id: 'gold-green', accent2: '#46d17f', dots: ['#e6b53f', '#46d17f'], label: 'settings.accentGoldGreen' },
  { id: 'ench', accent2: '#c9a6ff', dots: ['#a970ff', '#6d5bd0'], label: 'settings.accentEnch' },
];

function applyAccent() {
  const acc = ACCENTS.find((a) => a.id === (state.settings.accent || 'gold-ench')) || ACCENTS[0];
  document.documentElement.style.setProperty('--accent2', acc.accent2);
}

function ramGbFrom(memStr) {
  const m = String(memStr || '8G').match(/^(\d+)\s*([gGmM])?/);
  if (!m) return 8;
  let v = parseInt(m[1], 10);
  if ((m[2] || 'G').toUpperCase() === 'M') v = Math.round(v / 1024) || 1;
  return Math.min(16, Math.max(2, v));
}

function renderGlobalSettings(main) {
  const s = state.settings;
  const ramGb = ramGbFrom(s.memoryMax);
  const conc = Math.min(12, Math.max(1, Number(s.downloadConcurrency) || 6));
  main.innerHTML = `
    <div class="settings-col">
      <section class="settings-card">
        <h2>${t('settings.language')}</h2>
        <div class="seg-row">
          <button class="seg-btn ${s.language === 'auto' ? 'active' : ''}" data-set-lang="auto">${t('settings.langAuto')}</button>
          <button class="seg-btn ${s.language === 'es' ? 'active' : ''}" data-set-lang="es">Español</button>
          <button class="seg-btn ${s.language === 'en' ? 'active' : ''}" data-set-lang="en">English</button>
        </div>
      </section>

      <section class="settings-card">
        <h2>${t('settings.defaults')}</h2>
        <div style="margin-bottom:18px">
          <div class="slider-head"><span style="color:var(--muted)">${t('settings.allocMem')}</span><span class="val" id="ram-val">${ramGb} GB</span></div>
          <input type="range" id="gs-ram" min="2" max="16" step="1" value="${ramGb}"/>
          <div class="slider-scale"><span>2 GB</span><span>16 GB</span></div>
        </div>
        <div class="setting-row">
          <div><div class="s-title">${t('settings.concurrency')}</div><div class="s-desc">${t('settings.concDesc')}</div></div>
          <div class="stepper">
            <button id="conc-minus">−</button>
            <span class="val" id="conc-val">${conc}</span>
            <button id="conc-plus">+</button>
          </div>
        </div>
        <div class="setting-row">
          <div><div class="s-title">${t('settings.snapshots')}</div><div class="s-desc">${t('settings.snapDesc')}</div></div>
          <label class="switch"><input type="checkbox" id="gs-snapshots" ${s.showSnapshots ? 'checked' : ''}/><span class="slider"></span></label>
        </div>
      </section>

      <section class="settings-card">
        <h2>${t('settings.integrations')}</h2>
        <div class="field">
          <label>${t('settings.cfKey')}</label>
          <input type="password" class="mono" id="gs-cfkey" value="${esc(s.curseforgeApiKey)}"/>
          <div class="hint">${t('settings.cfHint')}</div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label>${t('settings.groupUrl')}<span class="tag-advanced">${t('settings.advancedTag')}</span></label>
          <input type="text" class="mono" id="gs-group" value="${esc(s.groupConfigUrl)}"/>
          <div class="hint">${t('settings.groupHint')}</div>
        </div>
      </section>

      <section class="settings-card">
        <h2>${t('settings.appearance')}</h2>
        <p class="muted" style="margin:-8px 0 16px;font-size:12px">${t('settings.appearanceDesc')}</p>
        <div class="accent-row">
          ${ACCENTS.map((a) => `
            <div class="accent-card ${(s.accent || 'gold-ench') === a.id ? 'active' : ''}" data-accent="${a.id}">
              <div class="dots"><span style="background:${a.dots[0]}"></span><span style="background:${a.dots[1]}"></span></div>
              <div class="a-name">${t(a.label)}</div>
            </div>`).join('')}
        </div>
      </section>

      <section class="settings-card">
        <h2>${t('settings.launcher')}</h2>
        <div style="font:500 12px var(--font-mono);color:var(--muted)">${t('settings.dataFolder', { p: esc(state.appInfo.dataDir || '') })}</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">
          <button class="btn" id="gs-open-data">${t('settings.openData')}</button>
          <button class="btn" id="gs-open-exports">${t('settings.openExports')}</button>
          <button class="btn" id="gs-check-update">${t('settings.checkUpdates')}</button>
        </div>
      </section>

      <div class="settings-footer">
        <button class="btn gold" id="gs-save" style="padding:10px 24px;font-size:14px">${t('settings.saveBtn')}</button>
        <span class="ver">IzLauncher v${esc(state.appInfo.version || 'dev')} · ${t('settings.madeBy')} 🍎</span>
      </div>
    </div>`;

  let ram = ramGb;
  let concurrency = conc;
  $('#gs-ram').addEventListener('input', (e) => {
    ram = Number(e.target.value);
    $('#ram-val').textContent = `${ram} GB`;
  });
  $('#conc-minus').addEventListener('click', () => { concurrency = Math.max(1, concurrency - 1); $('#conc-val').textContent = concurrency; });
  $('#conc-plus').addEventListener('click', () => { concurrency = Math.min(12, concurrency + 1); $('#conc-val').textContent = concurrency; });

  $$('[data-set-lang]', main).forEach((b) => b.addEventListener('click', async () => {
    state.settings = await api('settings:set', { language: b.dataset.setLang });
    applyLanguage();
    render();
  }));
  $$('[data-accent]', main).forEach((el) => el.addEventListener('click', async () => {
    state.settings = await api('settings:set', { accent: el.dataset.accent });
    applyAccent();
    render();
  }));

  $('#gs-save').addEventListener('click', async () => {
    try {
      state.settings = await api('settings:set', {
        memoryMax: `${ram}G`,
        downloadConcurrency: concurrency,
        showSnapshots: $('#gs-snapshots').checked,
        curseforgeApiKey: $('#gs-cfkey').value.trim(),
        groupConfigUrl: $('#gs-group').value.trim(),
      });
      toast(t('settings.savedToast'), 'success');
      refreshGroup({ force: true });
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#gs-open-data').addEventListener('click', () => api('app:openPath', { target: 'data' }));
  $('#gs-open-exports').addEventListener('click', () => api('app:openPath', { target: 'exports' }));
  $('#gs-check-update').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const res = await api('app:checkLauncherUpdate');
      if (res.latest && res.latest !== res.current) toast(t('settings.updateFound', { v: res.latest }), 'success', 8000);
      else toast(t('settings.upToDate', { v: res.current }), 'info');
    } catch (err) {
      toast(t('settings.updateCheckFailed', { e: err.message }), 'error', 8000);
    }
    e.target.disabled = false;
  });
}

/* ---------------- Accounts ---------------- */

function accountsModal() {
  const renderBody = () => {
    const { list, activeId } = state.accounts;
    return `
      ${list.length ? list.map((a) => `
        <div class="acct-row">
          <div class="a-avatar" data-fb="${esc(a.name)}"><img src="https://mc-heads.net/avatar/${encodeURIComponent(a.type === 'msa' ? a.id : a.name)}/80" alt=""/></div>
          <div class="grow"><b>${esc(a.name)}</b><div class="a-type">${a.type === 'msa' ? t('accounts.microsoft') : t('accounts.offline')}</div></div>
          ${a.id === activeId
            ? `<span class="pill active-acct"><span style="width:6px;height:6px;border-radius:50%;background:var(--green)"></span>${t('accounts.active')}</span>`
            : `<button class="btn" data-active="${esc(a.id)}" style="padding:7px 14px;font-size:12px">${t('accounts.use')}</button>`}
          <button class="icon-btn" data-remove="${esc(a.id)}" title="${t('common.delete')}">${ICONS.trash}</button>
        </div>`).join('') : `<p class="muted" style="margin-bottom:10px">${t('accounts.none')}</p>`}
      <button class="btn-ms" id="acc-ms"><span class="ms-logo"><span></span><span></span><span></span><span></span></span>${t('accounts.signin')}</button>
      <div class="offline-block">
        <div class="ob-title">${t('accounts.offline')}</div>
        <div class="ob-hint">${t('accounts.offlineLabel')}</div>
        <div style="display:flex;gap:10px">
          <input type="text" id="acc-offline-name" placeholder="PlayerName" maxlength="16" style="flex:1"/>
          <button class="btn" id="acc-offline-add" style="padding:0 22px">${t('accounts.add')}</button>
        </div>
      </div>`;
  };

  const m = modalShell(t('accounts.title'), renderBody(), { cls: 'narrow' });
  const bind = () => {
    $('#acc-ms', m.el).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `${ICONS.spin}${t('accounts.signingIn')}`;
      try {
        await api('accounts:addMicrosoft');
        await refreshAccounts();
        rerender();
        toast(t('accounts.signedIn'), 'success');
      } catch (err) {
        toast(err.message, 'error');
        rerender();
      }
    });
    $('#acc-offline-add', m.el).addEventListener('click', async () => {
      try {
        await api('accounts:addOffline', { name: $('#acc-offline-name', m.el).value });
        await refreshAccounts();
        rerender();
      } catch (err) { toast(err.message, 'error', 9000); }
    });
    $$('[data-active]', m.el).forEach((b) => b.addEventListener('click', async () => {
      state.accounts = await api('accounts:setActive', { id: b.dataset.active });
      renderAccountChip();
      rerender();
    }));
    $$('[data-remove]', m.el).forEach((b) => b.addEventListener('click', async () => {
      state.accounts = await api('accounts:remove', { id: b.dataset.remove });
      renderAccountChip();
      rerender();
    }));
  };
  const rerender = () => { $('.modal-body', m.el).innerHTML = renderBody(); bind(); };
  bind();
}

/* ---------------- New instance ---------------- */

async function newInstanceModal() {
  const m = modalShell(t('new.title'), `
    <div class="field"><label>${t('new.name')}</label><input type="text" id="ni-name" placeholder="${t('new.namePlaceholder')}"/></div>
    <div class="field"><label>${t('new.mcVersion')}</label><select id="ni-mc" class="mono"><option>${t('common.loading')}</option></select></div>
    <div class="field"><label>${t('new.loader')}</label>
      <div class="loader-chips" id="ni-loaders">
        ${['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map((l, i) => `<button class="loader-chip ${i === 0 ? 'active' : ''}" data-loader="${l}">${l[0].toUpperCase()}${l.slice(1)}</button>`).join('')}
      </div>
    </div>
    <div class="field hidden" id="ni-lv-field"><label>${t('new.loaderVersion')}</label><select id="ni-lv" class="mono"></select></div>
    <button class="btn gold-big" id="ni-create" style="width:100%;height:48px;margin-top:6px">${t('new.create')}</button>`);

  let loader = 'vanilla';
  const mcSel = $('#ni-mc', m.el);
  const lvSel = $('#ni-lv', m.el);

  try {
    const versions = await api('mc:versions', { includeSnapshots: !!state.settings.showSnapshots });
    mcSel.innerHTML = versions.map((v) => `<option value="${esc(v.id)}">${esc(v.id)}${v.type === 'snapshot' ? t('new.snapshot') : ''}</option>`).join('');
  } catch (err) {
    mcSel.innerHTML = `<option value="">${t('common.failed')}</option>`;
    toast(err.message, 'error');
  }

  const loadLoaderVersions = async () => {
    if (loader === 'vanilla') { $('#ni-lv-field', m.el).classList.add('hidden'); return; }
    $('#ni-lv-field', m.el).classList.remove('hidden');
    lvSel.innerHTML = `<option>${t('common.loading')}</option>`;
    try {
      const list = await api('mc:loaderVersions', { loader, mcVersion: mcSel.value });
      lvSel.innerHTML = list.length
        ? list.map((v) => `<option value="${esc(v.version)}">${esc(v.version)}${v.stable ? '' : t('new.beta')}</option>`).join('')
        : `<option value="">${t('new.noLoaderVersions')}</option>`;
    } catch (err) {
      lvSel.innerHTML = `<option value="">${t('common.failed')}</option>`;
      toast(err.message, 'error');
    }
  };

  $$('#ni-loaders .loader-chip', m.el).forEach((b) => b.addEventListener('click', () => {
    loader = b.dataset.loader;
    $$('#ni-loaders .loader-chip', m.el).forEach((x) => x.classList.toggle('active', x === b));
    loadLoaderVersions();
  }));
  mcSel.addEventListener('change', loadLoaderVersions);

  $('#ni-create', m.el).addEventListener('click', async () => {
    const btn = $('#ni-create', m.el);
    btn.disabled = true;
    try {
      const inst = await api('instances:create', {
        name: $('#ni-name', m.el).value,
        mcVersion: mcSel.value,
        loader,
        loaderVersion: loader === 'vanilla' ? '' : lvSel.value,
      });
      m.close();
      await refreshInstances();
      await openInstance(inst.id);
      toast(t('inst.created'), 'success');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/* ---------------- Import pack ---------------- */

function importModal() {
  const m = modalShell(t('import.title'), `
    <div class="subtabs">
      ${[['file', t('import.fromFile')], ['modrinth', t('import.modrinth')], ['github', t('import.github')], ['curseforge', t('import.curseforge')], ['url', t('import.url')]]
        .map(([k, label], i) => `<button class="subtab ${i === 0 ? 'active' : ''}" data-sub="${k}">${label}</button>`).join('')}
    </div>
    <div id="import-body"></div>`, { cls: 'wide' });

  const body = $('#import-body', m.el);
  let sub = 'file';

  const fetchRow = (id, label, placeholder, mono = true) => `
    <div class="field"><label>${label}</label>
      <div style="display:flex;gap:10px">
        <input type="text" ${mono ? 'class="mono"' : ''} id="${id}" placeholder="${placeholder}" style="flex:1"/>
        <button class="btn gold" id="${id}-go" style="padding:0 22px">${t('import.fetch')}</button>
      </div>
    </div>`;

  const renderSub = () => {
    if (sub === 'file') {
      body.innerHTML = `
        <div class="drop-zone" id="imp-pick">
          <div class="dz-icon">${ICONS.download}</div>
          <div class="dz-title">${t('import.drop')}</div>
          <div class="dz-sub">${t('import.dropSub')}</div>
        </div>`;
      $('#imp-pick', body).addEventListener('click', async () => {
        const file = await api('packs:pickFile');
        if (file) startImport({ type: 'file', path: file }, m);
      });
    } else if (sub === 'url') {
      body.innerHTML = fetchRow('imp-url', t('import.urlLabel'), 'https://…/pack.mrpack');
      $('#imp-url-go', body).addEventListener('click', () => {
        const url = $('#imp-url', body).value.trim();
        if (url) startImport({ type: 'url', url }, m);
      });
    } else if (sub === 'github') {
      body.innerHTML = `<p class="muted" style="margin-bottom:14px;font-size:13px;line-height:1.5">${t('import.ghHint')}</p>` +
        fetchRow('imp-gh', t('import.repo'), 'username/modpack-repo');
      $('#imp-gh-go', body).addEventListener('click', () => {
        const repo = $('#imp-gh', body).value.trim();
        if (repo) startImport({ type: 'github-releases', repo }, m);
      });
    } else if (sub === 'curseforge') {
      body.innerHTML = `<p class="muted" style="margin-bottom:14px;font-size:13px;line-height:1.5">${t('import.cfHint')}</p>` +
        fetchRow('imp-cf', t('import.cfLabel'), '715572');
      $('#imp-cf-go', body).addEventListener('click', () => {
        const project = $('#imp-cf', body).value.trim();
        if (project) startImport({ type: 'curseforge', project }, m);
      });
    } else if (sub === 'modrinth') {
      body.innerHTML = `
        <div class="search-box" style="margin-bottom:12px">${ICONS.search}<input type="text" id="imp-mr-q" placeholder="${t('import.searchPacks')}"/></div>
        <div id="imp-mr-results"></div>`;
      const doSearch = async () => {
        const holder = $('#imp-mr-results', body);
        holder.innerHTML = `<p class="muted">${t('common.searching')}</p>`;
        try {
          const hits = await api('packs:searchModrinth', { query: $('#imp-mr-q', body).value.trim() });
          holder.innerHTML = hits.length ? hits.map((h) => `
            <div class="result-row" style="border:1px solid var(--line);border-radius:11px;background:var(--panel);margin-bottom:8px">
              <div class="r-icon">${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : ''}</div>
              <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
              <span class="dl">${fmtDownloads(h.downloads)}</span>
              <button class="btn gold" data-mr="${esc(h.projectId)}" style="padding:7px 14px;font-size:12px">${t('group.install')}</button>
            </div>`).join('') : `<p class="muted">${t('common.noResults')}</p>`;
          $$('[data-mr]', holder).forEach((b) => b.addEventListener('click', () => startImport({ type: 'modrinth', project: b.dataset.mr }, m)));
        } catch (err) {
          holder.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
        }
      };
      let debounce = null;
      $('#imp-mr-q', body).addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(doSearch, 400); });
      $('#imp-mr-q', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      doSearch();
    }
  };

  $$('.subtab', m.el).forEach((b) => b.addEventListener('click', () => {
    sub = b.dataset.sub;
    $$('.subtab', m.el).forEach((x) => x.classList.toggle('active', x === b));
    renderSub();
  }));
  renderSub();
}

async function startImport(ref, parentModal) {
  parentModal?.close();
  const wait = waitingModal(t('import.preparing'), t('import.preparingSub'));
  let info;
  try {
    info = await api('packs:beginImport', { ref });
  } catch (err) {
    wait.close();
    toast(err.message, 'error', 9000);
    return;
  }
  wait.close();
  installArchiveModal(info, {});
}

function installArchiveModal(info, opts = {}) {
  const suggested = opts.name || info.name;
  const m = modalShell(t('import.installTitle', { n: esc(suggested) }), `
    <div class="install-summary">
      ${artTile(suggested, info.iconUrl, 'is-icon')}
      <div>
        <div class="is-name">${esc(suggested)}</div>
        <div class="is-meta">${esc(info.mcVersion || '?')} · ${esc(info.loader?.type || 'vanilla')} ${esc(info.loader?.version || '')} · v${esc(info.version || '?')}</div>
      </div>
    </div>
    <div class="field"><label>${t('import.instanceName')}</label><input type="text" id="pi-name" value="${esc(suggested)}"/></div>
    ${info.optionals?.length ? `
      <div class="field" style="margin-bottom:9px"><label>${t('import.optionalPick')}</label></div>
      ${info.optionals.map((o) => `
        <label class="check-row"><input type="checkbox" data-opt="${esc(o.path)}"/><span>${esc(o.name)}</span></label>`).join('')}
    ` : ''}
    <div id="pi-slot" style="margin-top:14px">
      <button class="btn gold-big" id="pi-go" style="width:100%;height:48px">${ICONS.download}${t('import.install')}</button>
    </div>`);

  $('#pi-go', m.el).addEventListener('click', async () => {
    const choices = {};
    $$('[data-opt]', m.el).forEach((cb) => { choices[cb.dataset.opt] = cb.checked; });
    $('#pi-slot', m.el).innerHTML = `<div class="busy-btn"><span class="spin">◌</span>${t('import.installing')}</div>`;
    const extra = { ...(opts.extra || {}) };
    if (!extra.icon && info.iconUrl) extra.icon = info.iconUrl;
    try {
      const res = await api('packs:completeImport', {
        ticket: info.ticket,
        name: $('#pi-name', m.el).value,
        choices,
        extra,
      });
      m.close();
      await refreshInstances();
      if (opts.onDone) await opts.onDone(res);
      await openInstance(res.instanceId);
      toast(t('import.done', { n: res.meta.name, c: res.summary.added }), 'success');
    } catch (err) {
      toast(err.message, 'error', 10000);
      $('#pi-slot', m.el).innerHTML = `<button class="btn gold-big" id="pi-go2" style="width:100%;height:48px">${t('import.install')}</button>`;
      $('#pi-go2', m.el).addEventListener('click', () => $('#pi-go', m.el)?.click());
    }
  });
}

/* ---------------- Update flow ---------------- */

async function applyUpdateFlow() {
  const id = state.currentId;
  const wait = waitingModal(t('up.fetching'), t('up.fetchingSub'));
  let up;
  try {
    up = await api('packs:beginUpdate', { id });
  } catch (err) {
    wait.close();
    toast(err.message, 'error', 9000);
    return;
  }
  wait.close();

  const run = async (newChoices) => {
    const wait2 = waitingModal(t('up.applying'), t('up.applyingSub'));
    try {
      const res = await api('packs:completeUpdate', { id, ticket: up.ticket, newChoices });
      wait2.close();
      const s = res.summary;
      let msg = t('up.done', { v: up.toVersion, a: s.added, u: s.updated, r: s.removed });
      if (s.backedUp.length) msg += t('up.backedUp', { n: s.backedUp.length });
      toast(msg, 'success', 9000);
      s.warnings.slice(0, 3).forEach((w) => toast(w, 'info', 9000));
      await openInstance(id);
    } catch (err) {
      wait2.close();
      toast(err.message, 'error', 10000);
    }
  };

  if (up.newOptionals?.length) {
    const m = modalShell(t('up.title', { v: esc(up.toVersion) }), `
      <p class="muted" style="margin-bottom:12px;font-size:13px;line-height:1.5">${t('up.newOptionals')}</p>
      ${up.newOptionals.map((o) => `
        <label class="check-row"><input type="checkbox" data-opt="${esc(o.path)}"/><span>${esc(o.name)}</span></label>`).join('')}
      <button class="btn" id="up-go" style="width:100%;height:48px;margin-top:14px;border:none;background:var(--grad-purple);color:#fff;font:800 15px var(--font-disp);box-shadow:0 6px 18px rgba(169,112,255,.35)">${t('up.update')}</button>`,
      { cls: 'narrow' });
    $('#up-go', m.el).addEventListener('click', () => {
      const choices = {};
      $$('[data-opt]', m.el).forEach((cb) => { choices[cb.dataset.opt] = cb.checked; });
      m.close();
      run(choices);
    });
  } else {
    run({});
  }
}

/* ---------------- Export ---------------- */

function exportModal() {
  const inst = state.current;
  const m = modalShell(t('export.title', { n: esc(inst.name) }), `
    <div class="field"><label>${t('export.version')}</label><input type="text" class="mono" id="ex-version" placeholder="1.0.0" value="${esc(inst.packVersion || '1.0.0')}"/></div>
    <div class="field"><label>${t('export.summary')}</label><input type="text" id="ex-summary" placeholder="${t('export.summaryPlaceholder')}"/></div>
    <div class="info-block" style="margin-bottom:20px">${t('export.hint')}</div>
    <button class="btn gold-big" id="ex-go" style="width:100%;height:48px">${ICONS.upload}${t('export.go')}</button>`,
    { cls: 'narrow' });
  $('#ex-go', m.el).addEventListener('click', async () => {
    const btn = $('#ex-go', m.el);
    btn.disabled = true;
    try {
      const res = await api('packs:export', { id: inst.id, version: $('#ex-version', m.el).value, summary: $('#ex-summary', m.el).value.trim() });
      m.close();
      toast(t('export.done', { r: res.remoteFiles, o: res.overrideFiles }), 'success', 10000);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/* ---------------- Launch ---------------- */

async function playInstance(id, join, btn) {
  if (!state.accounts.list.length) {
    toast(t('accounts.addFirst'), 'error');
    accountsModal();
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = `${ICONS.spin}${t('inst.launching')}`; }
  state.logs[id] = state.logs[id] || [];
  try {
    await api('launch:play', { id, join });
    await refreshInstances();
  } catch (err) {
    toast(err.message, 'error', 10000);
    await refreshInstances();
  }
}

/* ---------------- Boot ---------------- */

function applyLanguage() {
  I18N.setLang(I18N.resolve(state.settings.language || 'auto', state.appInfo.locale));
  document.documentElement.lang = I18N.getLang();
}

async function boot() {
  $('#btn-new').addEventListener('click', newInstanceModal);
  $('#btn-import').addEventListener('click', importModal);
  $('#account-chip').addEventListener('click', accountsModal);
  let prevViewBeforeNews = 'library';
  $('#bell-btn').addEventListener('click', () => {
    if (state.view === 'news' || state.view === 'newsDetail') {
      // Second click: close news and return where the user was.
      state.view = state.currentId && prevViewBeforeNews === 'instance' ? 'instance' : prevViewBeforeNews;
      if (state.view === 'instance' && !state.current) state.view = 'library';
    } else {
      prevViewBeforeNews = state.view;
      state.view = 'news';
    }
    render();
  });
  $$('#lang-seg button').forEach((b) => b.addEventListener('click', async () => {
    state.settings = await api('settings:set', { language: b.dataset.lang });
    applyLanguage();
    render();
  }));

  try {
    [state.appInfo, state.settings] = await Promise.all([api('app:info'), api('settings:get')]);
    applyLanguage();
    applyAccent();
    $('#brand-version').textContent = `v${state.appInfo.version || 'dev'} · ${t('brand.hub')}`;
    await refreshAccounts();
    await refreshInstances();
    await refreshGroup({ announce: true });
    if (state.group?.config?.packs?.length && !state.instances.length) {
      state.view = 'group';
    }
    startGroupAutoRefresh();
    render();
  } catch (err) {
    applyLanguage();
    toast(t('startup.error', { e: err.message }), 'error', 15000);
    render();
  }
}

boot();
