/* global window, document, I18N, MD */
const api = (channel, payload) => window.pmcl.invoke(channel, payload);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key, params) => I18N.t(key, params);

const state = {
  view: 'library',            // group | library | instance | news | settings
  tab: 'mods',                // instance tab: mods | settings | logs
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
  group: null,                // { config, fromCache, installs, error }
};

/* ---------------- Toasts & modals ---------------- */

function toast(message, kind = 'info', ms = 5000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function modal(html, opts = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal" ${opts.wide ? 'style="width:680px"' : ''}>${html}</div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  $$('[data-close]', backdrop).forEach((b) => b.addEventListener('click', close));
  $('#modal-root').appendChild(backdrop);
  return { el: backdrop, close };
}

function confirmModal(title, body, confirmLabel) {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(body)}</p>
      <div class="modal-actions">
        <button class="btn" data-close>${t('common.cancel')}</button>
        <button class="btn danger" id="cf-yes">${esc(confirmLabel || t('common.delete'))}</button>
      </div>`);
    $('#cf-yes', m.el).addEventListener('click', () => { m.close(); resolve(true); });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(false); });
    $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

/* External links (markdown, discord, etc.) always open in the system browser. */
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
  const box = $('#global-progress');
  box.classList.remove('hidden');
  $('#gp-label').textContent = I18N.translateStatus(label);
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  $('#gp-fill').style.width = `${pct}%`;
  clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(() => box.classList.add('hidden'), 4000);
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
      showLauncherUpdate('downloading', evt.version);
      break;
    case 'launcher-update-ready':
      showLauncherUpdate('ready', evt.version);
      break;
    default:
      break;
  }
});

function showLauncherUpdate(phase, version) {
  const box = $('#launcher-update');
  box.classList.remove('hidden');
  if (phase === 'downloading') {
    $('#lu-text').textContent = t('update.downloading', { v: version });
    $('#lu-restart').classList.add('hidden');
  } else {
    $('#lu-text').textContent = t('update.ready', { v: version });
    const btn = $('#lu-restart');
    btn.textContent = t('update.restart');
    btn.classList.remove('hidden');
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

async function refreshGroup({ force = false, announce = false } = {}) {
  try {
    state.group = await api('group:get', { force });
  } catch (err) {
    state.group = { config: null, error: err.message };
  }
  const cfg = state.group?.config;
  if (cfg && announce) {
    // "New pack!" toasts
    const known = new Set(state.settings.knownGroupPacks || []);
    const fresh = cfg.packs.filter((p) => !known.has(p.id));
    if (known.size && fresh.length) {
      fresh.forEach((p) => toast(t('group.newPack', { name: p.name }), 'success', 9000));
    }
    if (fresh.length || !known.size) {
      state.settings.knownGroupPacks = cfg.packs.map((p) => p.id);
      api('group:rememberPacks', { ids: state.settings.knownGroupPacks }).catch(() => {});
    }
    // Announcement popup for unseen items
    const seen = new Set(state.settings.seenAnnouncements || []);
    const unseen = cfg.announcements.filter((a) => !seen.has(a.id));
    if (unseen.length) announcementPopup(unseen);
  }
  render();
}

function unseenAnnouncements() {
  const cfg = state.group?.config;
  if (!cfg) return [];
  const seen = new Set(state.settings.seenAnnouncements || []);
  return cfg.announcements.filter((a) => !seen.has(a.id));
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

/* ---------------- Rendering ---------------- */

function packColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 42%)`;
}

function packIcon(name, cls = 'pack-icon') {
  const letter = (String(name).trim()[0] || '?').toUpperCase();
  return `<div class="${cls}" style="background:${packColor(name)}">${esc(letter)}</div>`;
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

function serverString(server) {
  if (!server?.address) return null;
  return server.port ? `${server.address}:${server.port}` : server.address;
}

function renderAccountChip() {
  const active = state.accounts.list.find((a) => a.id === state.accounts.activeId);
  $('#account-name').textContent = active ? active.name : t('account.none');
  $('#account-avatar').innerHTML = active
    ? `<img src="https://mc-heads.net/avatar/${encodeURIComponent(active.type === 'msa' ? active.id : active.name)}/26" alt="" />`
    : '';
}

function renderSidebar() {
  const hasGroup = !!state.group?.config;
  const unseen = unseenAnnouncements().length;
  const navItems = [
    ...(hasGroup ? [['group', `🌐 ${t('nav.group')}`]] : []),
    ['library', `📦 ${t('nav.library')}`],
    ...(hasGroup ? [['news', `📣 ${t('nav.news')}`]] : []),
    ['settings', `⚙ ${t('nav.settings')}`],
  ];
  $('#nav').innerHTML = navItems.map(([key, label]) => `
    <button class="nav-btn ${state.view === key || (state.view === 'instance' && key === 'library') ? 'active' : ''}" data-nav="${key}">
      ${label}${key === 'news' && unseen ? '<span class="dot-badge"></span>' : ''}
    </button>`).join('');
  $$('#nav .nav-btn').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.nav;
    if (state.view === 'library') state.currentId = null;
    render();
  }));

  $('#instances-label').textContent = t('sidebar.instances');
  $('#btn-new').textContent = t('sidebar.new');
  $('#btn-import').textContent = t('sidebar.import');

  const discordBtn = $('#btn-discord');
  const discordUrl = state.group?.config?.discordUrl;
  if (discordUrl) {
    discordBtn.classList.remove('hidden');
    discordBtn.textContent = `💬 ${t('sidebar.discord')}`;
    discordBtn.onclick = () => api('app:openExternal', { url: discordUrl }).catch((e) => toast(e.message, 'error'));
  } else {
    discordBtn.classList.add('hidden');
  }

  const list = $('#instance-list');
  list.innerHTML = state.instances.map((i) => `
    <button class="instance-item ${state.currentId === i.id && state.view === 'instance' ? 'active' : ''}" data-id="${esc(i.id)}">
      <span class="dot ${i.running ? 'running' : ''}"></span>
      <span class="ii-name">${esc(i.name)}<div class="ii-sub">${esc(i.mc.version)} · ${esc(loaderLabel(i))}</div></span>
    </button>`).join('') || `<div class="muted" style="padding:8px">${t('sidebar.noInstances')}</div>`;
  $$('.instance-item', list).forEach((el) => el.addEventListener('click', () => openInstance(el.dataset.id)));
}

function render() {
  renderSidebar();
  renderAccountChip();
  const main = $('#main');
  if (state.view === 'settings') return renderGlobalSettings(main);
  if (state.view === 'group') return renderGroup(main);
  if (state.view === 'news') return renderNews(main);
  if (state.view === 'instance' && state.current) return renderInstance(main);
  return renderLibrary(main);
}

/* ---------------- Group view ---------------- */

function renderGroup(main) {
  const g = state.group;
  if (!g?.config) {
    main.innerHTML = `<div class="empty"><h2>🌐</h2><p>${esc(g?.error || t('group.notConfigured'))}</p></div>`;
    return;
  }
  const cfg = g.config;
  main.innerHTML = `
    <div class="toolbar">
      <h1>${esc(cfg.groupName)} — ${t('group.title')}</h1>
      <div class="spacer"></div>
      <button class="btn" id="grp-refresh">🔄 ${t('common.refresh')}</button>
    </div>
    ${g.fromCache ? `<div class="offline-note">${t('group.fromCache')}</div>` : ''}
    ${cfg.packs.length ? '' : `<p class="muted">${t('group.empty')}</p>`}
    ${cfg.packs.map((p) => {
      const install = g.installs?.[p.id];
      const server = serverString(p.server);
      return `
        <div class="pack-row">
          ${packIcon(p.name)}
          <div class="grow">
            <h3>${esc(p.name)} ${p.recommended ? `<span class="star">${t('group.recommended')}</span>` : ''}</h3>
            ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
            <div class="meta-line">
              ${server ? `${t('group.server')}: <b>${esc(server)}</b> · ` : ''}
              ${install ? `${t('group.installed')}${install.packVersion ? ` · v${esc(install.packVersion)}` : ''}` : ''}
            </div>
          </div>
          ${install
            ? `<button class="btn" data-open="${esc(install.instanceId)}">${t('group.open')}</button>`
            : `<button class="btn primary" data-install="${esc(p.id)}">${t('group.install')}</button>`}
        </div>`;
    }).join('')}`;

  $('#grp-refresh').addEventListener('click', () => refreshGroup({ force: true }));
  $$('[data-open]', main).forEach((b) => b.addEventListener('click', () => openInstance(b.dataset.open)));
  $$('[data-install]', main).forEach((b) => b.addEventListener('click', () => {
    const pack = cfg.packs.find((p) => p.id === b.dataset.install);
    if (pack) installGroupPack(pack);
  }));
}

async function installGroupPack(pack) {
  const wait = modal(`<h2>${t('import.preparing')}</h2><p class="muted">${t('import.preparingSub')}</p>`);
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
    extra: { server: pack.server, groupPackId: pack.id },
    onDone: () => refreshGroup({}),
  });
}

/* ---------------- Announcements ---------------- */

function annCard(a, unseenSet) {
  return `
    <div class="ann-card ${unseenSet?.has(a.id) ? 'unseen' : ''}">
      <div class="ann-head">
        <h3>${esc(a.title)}</h3>
        ${a.pinned ? `<span class="ann-pin">${t('news.pinned')}</span>` : ''}
        <span class="ann-date">${esc(a.date)}</span>
      </div>
      <div class="md">${MD.render(a.body)}</div>
    </div>`;
}

function renderNews(main) {
  const cfg = state.group?.config;
  const anns = cfg?.announcements || [];
  const unseen = new Set(unseenAnnouncements().map((a) => a.id));
  main.innerHTML = `
    <h1>${t('news.title')}</h1>
    <div class="mt"></div>
    ${anns.length ? anns.map((a) => annCard(a, unseen)).join('') : `<p class="muted">${t('news.empty')}</p>`}`;
  if (unseen.size) {
    api('group:markAnnouncementsSeen', { ids: [...unseen] }).then((seen) => {
      state.settings.seenAnnouncements = seen;
      renderSidebar();
    }).catch(() => {});
  }
}

function announcementPopup(unseen) {
  const newest = unseen[0];
  const m = modal(`
    ${annCard(newest, null)}
    <div class="modal-actions">
      ${unseen.length > 1 ? `<button class="btn" id="ann-all">${t('news.viewAll')} (${unseen.length})</button>` : ''}
      <button class="btn primary" id="ann-ok">${t('news.gotIt')}</button>
    </div>`, { wide: true });
  const markSeen = (ids) => api('group:markAnnouncementsSeen', { ids }).then((seen) => {
    state.settings.seenAnnouncements = seen;
    renderSidebar();
  }).catch(() => {});
  $('#ann-ok', m.el).addEventListener('click', () => { markSeen([newest.id]); m.close(); });
  $('#ann-all', m.el)?.addEventListener('click', () => {
    m.close();
    state.view = 'news';
    render();
  });
}

/* ---------------- Library ---------------- */

function renderLibrary(main) {
  if (!state.instances.length) {
    main.innerHTML = `
      <div class="empty">
        <h2>${t('library.welcome')}</h2>
        <p>${t('library.welcomeSub')}</p>
        <div style="display:flex;gap:10px">
          <button class="btn" id="e-new">${t('library.newInstance')}</button>
          <button class="btn primary" id="e-import">${t('library.importPack')}</button>
        </div>
      </div>`;
    $('#e-new').addEventListener('click', newInstanceModal);
    $('#e-import').addEventListener('click', importModal);
    return;
  }
  main.innerHTML = `
    <h1>${t('library.title')}</h1>
    <div class="grid">
      ${state.instances.map((i) => `
        <div class="card" data-id="${esc(i.id)}">
          ${packIcon(i.name)}
          <h3>${esc(i.name)}</h3>
          <div class="meta">${esc(i.mc.version)} · ${esc(loaderLabel(i))}${i.packVersion ? ` · v${esc(i.packVersion)}` : ''}</div>
        </div>`).join('')}
    </div>`;
  $$('.card', main).forEach((el) => el.addEventListener('click', () => openInstance(el.dataset.id)));
}

/* ---------------- Instance detail ---------------- */

function renderUpdateBanner() {
  const holder = $('#update-banner-holder');
  if (!holder) return;
  const u = state.update;
  if (state.checkingUpdate) {
    holder.innerHTML = `<div class="update-banner"><span class="muted">${t('inst.checkingUpdate')}</span></div>`;
    return;
  }
  if (!u) { holder.innerHTML = ''; return; }
  if (u.error) {
    holder.innerHTML = `<div class="update-banner"><span class="muted">${t('inst.updateFailed', { e: esc(u.error) })}</span></div>`;
    return;
  }
  if (!u.available) { holder.innerHTML = ''; return; }
  holder.innerHTML = `
    <div class="update-banner">
      <div class="grow"><b>${t('inst.updateAvailable')}</b><div class="muted">${esc(u.current ?? '?')} → ${esc(u.latest)}</div></div>
      <button class="btn primary" id="btn-apply-update">${t('inst.updateNow')}</button>
    </div>`;
  $('#btn-apply-update').addEventListener('click', applyUpdateFlow);
}

function renderInstance(main) {
  const inst = state.current;
  const src = sourceLabel(inst.source);
  const server = serverString(inst.server);
  main.innerHTML = `
    <div class="detail-header">
      ${packIcon(inst.name)}
      <div class="detail-title">
        <h1>${esc(inst.name)}</h1>
        <div class="meta">
          <span class="badge">${esc(inst.mc.version)}</span>
          <span class="badge">${esc(loaderLabel(inst))}</span>
          ${inst.packVersion ? `<span class="badge">${t('inst.packVersion', { v: esc(inst.packVersion) })}</span>` : ''}
          ${src ? `<span class="badge src">${esc(src)}</span>` : ''}
          ${server ? `<span class="badge">${t('inst.serverBadge', { addr: esc(server) })}</span>` : ''}
        </div>
      </div>
      <div class="detail-actions">
        ${inst.running
          ? `<button class="btn danger" id="btn-kill">${t('inst.stop')}</button>`
          : `${server ? `<button class="btn small" id="btn-play-solo">${t('inst.playSolo')}</button>` : ''}
             <button class="btn play" id="btn-play">${server ? t('inst.playJoin') : t('inst.play')}</button>`}
      </div>
    </div>
    <div id="update-banner-holder"></div>
    <div class="tabs">
      <button class="tab ${state.tab === 'mods' ? 'active' : ''}" data-tab="mods">${t('inst.tabMods')}</button>
      <button class="tab ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">${t('inst.tabSettings')}</button>
      <button class="tab ${state.tab === 'logs' ? 'active' : ''}" data-tab="logs">${t('inst.tabLogs')}</button>
    </div>
    <div id="tab-body"></div>`;

  $$('.tab', main).forEach((x) => x.addEventListener('click', () => { state.tab = x.dataset.tab; render(); }));
  $('#btn-play')?.addEventListener('click', () => playCurrent(true));
  $('#btn-play-solo')?.addEventListener('click', () => playCurrent(false));
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
    <div class="toolbar">
      <button class="btn" id="btn-add-jar">${t('mods.addJar')}</button>
      <div class="spacer"></div>
      <input type="text" id="mod-search" placeholder="${t('mods.searchPlaceholder')}" style="max-width:300px" />
      <button class="btn" id="btn-mod-search">${t('common.search')}</button>
    </div>
    <div id="mod-search-results"></div>
    ${state.mods.length === 0 && notInstalled.length === 0 ? `<p class="muted">${t('mods.none')}</p>` : ''}
    ${state.mods.map((m) => `
      <div class="mod-row ${m.enabled ? '' : 'disabled'}">
        <label class="switch"><input type="checkbox" data-toggle="${esc(m.file)}" data-rel="mods/${esc(m.name)}" data-optional="${m.optional ? '1' : ''}" ${m.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        <span class="mod-name" title="${esc(m.name)}">${esc(m.name)}</span>
        ${m.fromPack ? `<span class="badge">${m.optional ? t('mods.optional') : t('mods.pack')}</span>` : `<span class="badge">${t('mods.yours')}</span>`}
        ${!m.fromPack || m.optional ? `<button class="icon-btn" title="${t('common.delete')}" data-del="${esc(m.file)}">🗑</button>` : ''}
      </div>`).join('')}
    ${notInstalled.length ? `<h2 class="mt">${t('mods.optionalHeader')}</h2>` : ''}
    ${notInstalled.map(([rel, meta]) => `
      <div class="mod-row disabled">
        <label class="switch"><input type="checkbox" data-opt-install="${esc(rel)}"/><span class="slider"></span></label>
        <span class="mod-name">${esc(meta.name || rel)}</span>
        <span class="badge">${t('mods.notInstalled')}</span>
      </div>`).join('')}`;

  $('#btn-add-jar').addEventListener('click', async () => {
    try { state.mods = await api('mods:addLocal', { id: inst.id }); render(); } catch (err) { toast(err.message, 'error'); }
  });

  const doSearch = async () => {
    const q = $('#mod-search').value.trim();
    if (!q) return;
    const holder = $('#mod-search-results');
    holder.innerHTML = `<p class="muted">${t('common.searching')}</p>`;
    try {
      const hits = await api('mods:searchModrinth', { id: inst.id, query: q });
      holder.innerHTML = hits.length ? hits.map((h) => `
        <div class="result-row">
          ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : '<div class="avatar"></div>'}
          <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
          <button class="btn" data-install="${esc(h.projectId)}">${t('mods.add')}</button>
          <button class="btn" data-install-opt="${esc(h.projectId)}" title="${t('mods.addOptionalTitle')}">${t('mods.addOptional')}</button>
        </div>`).join('') : `<p class="muted">${t('common.noResults')}</p>`;
      $$('[data-install]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.install, false, b)));
      $$('[data-install-opt]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.installOpt, true, b)));
    } catch (err) {
      holder.innerHTML = `<p class="muted">${t('mods.searchFailed', { e: esc(err.message) })}</p>`;
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
  $$('[data-opt-install]', body).forEach((cb) => cb.addEventListener('change', async () => {
    try {
      await api('mods:setOptionalEnabled', { id: inst.id, rel: cb.dataset.optInstall, enabled: cb.checked });
      toast(t('mods.optionalInstalled'), 'success');
      await openInstance(inst.id, 'mods');
    } catch (err) { toast(err.message, 'error'); render(); }
  }));
  $$('[data-del]', body).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmModal(t('mods.deleteTitle'), t('mods.deleteBody', { f: b.dataset.del })))) return;
    try { state.mods = await api('mods:delete', { id: inst.id, file: b.dataset.del }); render(); } catch (err) { toast(err.message, 'error'); }
  }));
}

async function installSearchedMod(projectId, optional, btn) {
  btn.disabled = true;
  btn.textContent = t('mods.adding');
  try {
    const res = await api('mods:installModrinth', { id: state.currentId, project: projectId, optional });
    toast(t('mods.added', { f: res.file }), 'success');
    await openInstance(state.currentId, 'mods');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = optional ? t('mods.addOptional') : t('mods.add');
  }
}

function renderInstanceSettings(body) {
  const inst = state.current;
  const s = inst.settings || {};
  const isGroupManaged = !!inst.source?.groupPackId;
  body.innerHTML = `
    <section class="settings-block">
      <h2>${t('iset.general')}</h2>
      <div class="field"><label>${t('iset.name')}</label><input type="text" id="is-name" value="${esc(inst.name)}"/></div>
      <div class="field-row">
        <div class="field"><label>${t('iset.maxRam')}</label><input type="text" id="is-memmax" placeholder="e.g. 8" value="${esc(s.memoryMax || '')}"/></div>
        <div class="field"><label>${t('iset.minRam')}</label><input type="text" id="is-memmin" placeholder="e.g. 1G" value="${esc(s.memoryMin || '')}"/></div>
      </div>
      <div class="field"><label>${t('iset.javaPath')}</label><input type="text" id="is-java" placeholder="${t('iset.javaPlaceholder')}" value="${esc(s.javaPath || '')}"/></div>
      <div class="field"><label>${t('iset.jvmArgs')}</label><input type="text" id="is-jvm" value="${esc(s.jvmArgs || '')}"/></div>
      <button class="btn primary" id="is-save">${t('common.save')}</button>
    </section>
    <section class="settings-block">
      <h2>${t('iset.serverTitle')}</h2>
      ${isGroupManaged ? `<p class="muted" style="margin-bottom:10px">${t('iset.serverManaged')}</p>` : ''}
      <div class="field">
        <label>${t('iset.server')}</label>
        <input type="text" id="is-server" placeholder="${t('iset.serverPlaceholder')}" value="${esc(serverString(inst.server) || '')}" ${isGroupManaged ? 'disabled' : ''}/>
        <div class="hint">${t('iset.serverHint')}</div>
      </div>
      ${isGroupManaged ? '' : `<button class="btn" id="is-server-save">${t('common.save')}</button>`}
    </section>
    <section class="settings-block">
      <h2>${t('iset.sharing')}</h2>
      <p class="muted" style="margin-bottom:12px">${t('iset.sharingHint')}</p>
      <button class="btn" id="is-export">${t('iset.export')}</button>
      <button class="btn" id="is-check-update">${t('iset.checkUpdates')}</button>
      <button class="btn" id="is-open">${t('iset.openFolder')}</button>
    </section>
    <section class="settings-block">
      <h2>${t('iset.danger')}</h2>
      <button class="btn danger" id="is-delete">${t('iset.deleteInstance')}</button>
    </section>`;

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
    <div class="toolbar">
      <button class="btn" id="log-clear">${t('logs.clear')}</button>
    </div>
    <pre class="logs" id="log-pre">${esc(buf.join('\n')) || t('logs.empty')}</pre>`;
  const pre = $('#log-pre');
  pre.scrollTop = pre.scrollHeight;
  $('#log-clear').addEventListener('click', () => { state.logs[state.currentId] = []; renderLogsTab(body); });
}

/* ---------------- Global settings ---------------- */

function renderGlobalSettings(main) {
  const s = state.settings;
  main.innerHTML = `
    <h1>${t('settings.title')}</h1>
    <section class="settings-block mt">
      <h2>${t('settings.language')}</h2>
      <div class="field">
        <select id="gs-lang">
          <option value="auto" ${s.language === 'auto' ? 'selected' : ''}>${t('settings.langAuto')}</option>
          <option value="es" ${s.language === 'es' ? 'selected' : ''}>Español</option>
          <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
        </select>
      </div>
    </section>
    <section class="settings-block">
      <h2>${t('settings.defaults')}</h2>
      <div class="field-row">
        <div class="field"><label>${t('settings.maxRam')}</label><input type="text" id="gs-memmax" value="${esc(s.memoryMax)}"/></div>
        <div class="field"><label>${t('settings.minRam')}</label><input type="text" id="gs-memmin" value="${esc(s.memoryMin)}"/></div>
      </div>
      <div class="field"><label>${t('settings.concurrency')}</label><input type="text" id="gs-conc" value="${esc(s.downloadConcurrency)}"/></div>
      <div class="check-row"><input type="checkbox" id="gs-snapshots" ${s.showSnapshots ? 'checked' : ''}/><label for="gs-snapshots">${t('settings.snapshots')}</label></div>
    </section>
    <section class="settings-block">
      <h2>${t('settings.cf')}</h2>
      <div class="field">
        <label>${t('settings.cfKey')}</label>
        <input type="password" id="gs-cfkey" value="${esc(s.curseforgeApiKey)}"/>
        <div class="hint">${t('settings.cfHint')}</div>
      </div>
    </section>
    <section class="settings-block">
      <h2>${t('settings.group')}</h2>
      <div class="field">
        <label>${t('settings.groupUrl')}</label>
        <input type="text" id="gs-group" value="${esc(s.groupConfigUrl)}"/>
        <div class="hint">${t('settings.groupHint')}</div>
      </div>
    </section>
    <section class="settings-block">
      <h2>${t('settings.launcher')}</h2>
      <p class="muted">${t('settings.dataFolder', { p: esc(state.appInfo.dataDir || '') })}</p>
      <div class="mt">
        <button class="btn" id="gs-open-data">${t('settings.openData')}</button>
        <button class="btn" id="gs-open-exports">${t('settings.openExports')}</button>
        <button class="btn" id="gs-check-update">${t('settings.checkUpdates')}</button>
      </div>
    </section>
    <button class="btn primary" id="gs-save">${t('settings.saveBtn')}</button>
    <p class="muted mt">IzLauncher v${esc(state.appInfo.version || 'dev')}</p>`;

  $('#gs-save').addEventListener('click', async () => {
    try {
      state.settings = await api('settings:set', {
        language: $('#gs-lang').value,
        memoryMax: $('#gs-memmax').value.trim() || '4G',
        memoryMin: $('#gs-memmin').value.trim() || '1G',
        downloadConcurrency: Math.max(1, parseInt($('#gs-conc').value, 10) || 6),
        showSnapshots: $('#gs-snapshots').checked,
        curseforgeApiKey: $('#gs-cfkey').value.trim(),
        groupConfigUrl: $('#gs-group').value.trim(),
      });
      applyLanguage();
      toast(t('settings.savedToast'), 'success');
      refreshGroup({ force: true });
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#gs-lang').addEventListener('change', async () => {
    state.settings = await api('settings:set', { language: $('#gs-lang').value });
    applyLanguage();
    render();
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
      <h2>${t('accounts.title')}</h2>
      ${list.length ? list.map((a) => `
        <div class="result-row">
          <img src="https://mc-heads.net/avatar/${encodeURIComponent(a.type === 'msa' ? a.id : a.name)}/34" alt=""/>
          <div class="grow"><b>${esc(a.name)}</b><div class="desc">${a.type === 'msa' ? t('accounts.microsoft') : t('accounts.offline')}${a.id === activeId ? ` · ${t('accounts.active')}` : ''}</div></div>
          ${a.id !== activeId ? `<button class="btn" data-active="${esc(a.id)}">${t('accounts.use')}</button>` : ''}
          <button class="icon-btn" data-remove="${esc(a.id)}" title="${t('common.delete')}">🗑</button>
        </div>`).join('') : `<p class="muted">${t('accounts.none')}</p>`}
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn primary" id="acc-ms">${t('accounts.signin')}</button>
      </div>
      <div class="field mt">
        <label>${t('accounts.offlineLabel')}</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="acc-offline-name" placeholder="PlayerName" maxlength="16"/>
          <button class="btn" id="acc-offline-add">${t('accounts.add')}</button>
        </div>
      </div>
      <div class="modal-actions"><button class="btn" data-close>${t('common.close')}</button></div>`;
  };

  const m = modal(renderBody());
  const bind = () => {
    $('#acc-ms', m.el).addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = t('accounts.signingIn');
      try {
        await api('accounts:addMicrosoft');
        await refreshAccounts();
        rerender();
        toast(t('accounts.signedIn'), 'success');
      } catch (err) {
        toast(err.message, 'error');
        e.target.disabled = false;
        e.target.textContent = t('accounts.signin');
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
    $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', m.close));
  };
  const rerender = () => { $('.modal', m.el).innerHTML = renderBody(); bind(); };
  bind();
}

/* ---------------- New instance ---------------- */

async function newInstanceModal() {
  const m = modal(`
    <h2>${t('new.title')}</h2>
    <div class="field"><label>${t('new.name')}</label><input type="text" id="ni-name" placeholder="${t('new.namePlaceholder')}"/></div>
    <div class="field"><label>${t('new.mcVersion')}</label><select id="ni-mc"><option>${t('common.loading')}</option></select></div>
    <div class="field"><label>${t('new.loader')}</label>
      <div class="subtabs" id="ni-loaders">
        ${['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map((l, i) => `<button class="subtab ${i === 0 ? 'active' : ''}" data-loader="${l}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="field hidden" id="ni-lv-field"><label>${t('new.loaderVersion')}</label><select id="ni-lv"></select></div>
    <div class="modal-actions">
      <button class="btn" data-close>${t('common.cancel')}</button>
      <button class="btn primary" id="ni-create">${t('new.create')}</button>
    </div>`);

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

  $$('#ni-loaders .subtab', m.el).forEach((b) => b.addEventListener('click', () => {
    loader = b.dataset.loader;
    $$('#ni-loaders .subtab', m.el).forEach((x) => x.classList.toggle('active', x === b));
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
  const m = modal(`
    <h2>${t('import.title')}</h2>
    <div class="subtabs">
      ${[['file', t('import.fromFile')], ['modrinth', t('import.modrinth')], ['github', t('import.github')], ['curseforge', t('import.curseforge')], ['url', t('import.url')]]
        .map(([k, label], i) => `<button class="subtab ${i === 0 ? 'active' : ''}" data-sub="${k}">${label}</button>`).join('')}
    </div>
    <div id="import-body"></div>
    <div class="modal-actions"><button class="btn" data-close>${t('common.cancel')}</button></div>`);

  const body = $('#import-body', m.el);
  let sub = 'file';

  const renderSub = () => {
    if (sub === 'file') {
      body.innerHTML = `
        <p class="muted">${t('import.fileHint')}</p>
        <div class="mt"><button class="btn primary" id="imp-pick">${t('import.choose')}</button></div>`;
      $('#imp-pick', body).addEventListener('click', async () => {
        const file = await api('packs:pickFile');
        if (file) startImport({ type: 'file', path: file }, m);
      });
    } else if (sub === 'url') {
      body.innerHTML = `
        <div class="field"><label>${t('import.urlLabel')}</label><input type="text" id="imp-url" placeholder="https://…/pack.mrpack"/></div>
        <button class="btn primary" id="imp-url-go">${t('import.import')}</button>`;
      $('#imp-url-go', body).addEventListener('click', () => {
        const url = $('#imp-url', body).value.trim();
        if (url) startImport({ type: 'url', url }, m);
      });
    } else if (sub === 'github') {
      body.innerHTML = `
        <p class="muted">${t('import.ghHint')}</p>
        <div class="field mt"><label>${t('import.repo')}</label><input type="text" id="imp-gh" placeholder="username/modpack-repo"/></div>
        <button class="btn primary" id="imp-gh-go">${t('import.ghGo')}</button>`;
      $('#imp-gh-go', body).addEventListener('click', () => {
        const repo = $('#imp-gh', body).value.trim();
        if (repo) startImport({ type: 'github-releases', repo }, m);
      });
    } else if (sub === 'curseforge') {
      body.innerHTML = `
        <p class="muted">${t('import.cfHint')}</p>
        <div class="field mt"><label>${t('import.cfLabel')}</label><input type="text" id="imp-cf" placeholder="e.g. 715572"/></div>
        <button class="btn primary" id="imp-cf-go">${t('import.cfGo')}</button>`;
      $('#imp-cf-go', body).addEventListener('click', () => {
        const project = $('#imp-cf', body).value.trim();
        if (project) startImport({ type: 'curseforge', project }, m);
      });
    } else if (sub === 'modrinth') {
      body.innerHTML = `
        <div class="toolbar"><input type="text" id="imp-mr-q" placeholder="${t('import.searchPacks')}"/><button class="btn" id="imp-mr-go">${t('common.search')}</button></div>
        <div id="imp-mr-results"></div>`;
      const doSearch = async () => {
        const holder = $('#imp-mr-results', body);
        holder.innerHTML = `<p class="muted">${t('common.searching')}</p>`;
        try {
          const hits = await api('packs:searchModrinth', { query: $('#imp-mr-q', body).value.trim() });
          holder.innerHTML = hits.length ? hits.map((h) => `
            <div class="result-row">
              ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : '<div class="avatar"></div>'}
              <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
              <button class="btn primary" data-mr="${esc(h.projectId)}">${t('import.import')}</button>
            </div>`).join('') : `<p class="muted">${t('common.noResults')}</p>`;
          $$('[data-mr]', holder).forEach((b) => b.addEventListener('click', () => startImport({ type: 'modrinth', project: b.dataset.mr }, m)));
        } catch (err) {
          holder.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
        }
      };
      $('#imp-mr-go', body).addEventListener('click', doSearch);
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
  const wait = modal(`<h2>${t('import.preparing')}</h2><p class="muted">${t('import.preparingSub')}</p>`);
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

/**
 * Shared phase-2 install modal (used by Import and by Group installs).
 * opts: { name?, extra?, onDone? }
 */
function installArchiveModal(info, opts = {}) {
  const suggested = opts.name || info.name;
  const m = modal(`
    <h2>${t('import.installTitle', { n: esc(suggested) })}</h2>
    <p class="muted">Minecraft ${esc(info.mcVersion || '?')} · ${esc(info.loader?.type || 'vanilla')} ${esc(info.loader?.version || '')} · v${esc(info.version || '?')}</p>
    <div class="field mt"><label>${t('import.instanceName')}</label><input type="text" id="pi-name" value="${esc(suggested)}"/></div>
    ${info.optionals?.length ? `
      <h2 style="font-size:14px">${t('import.optionalPick')}</h2>
      ${info.optionals.map((o) => `
        <div class="check-row"><input type="checkbox" id="opt-${esc(o.path)}" data-opt="${esc(o.path)}"/><label for="opt-${esc(o.path)}">${esc(o.name)}</label></div>`).join('')}
    ` : ''}
    <div class="modal-actions">
      <button class="btn" data-close>${t('common.cancel')}</button>
      <button class="btn primary" id="pi-go">${t('import.install')}</button>
    </div>`);

  $('#pi-go', m.el).addEventListener('click', async () => {
    const btn = $('#pi-go', m.el);
    btn.disabled = true;
    btn.textContent = t('import.installing');
    const choices = {};
    $$('[data-opt]', m.el).forEach((cb) => { choices[cb.dataset.opt] = cb.checked; });
    try {
      const res = await api('packs:completeImport', {
        ticket: info.ticket,
        name: $('#pi-name', m.el).value,
        choices,
        extra: opts.extra || {},
      });
      m.close();
      await refreshInstances();
      if (opts.onDone) await opts.onDone(res);
      await openInstance(res.instanceId);
      toast(t('import.done', { n: res.meta.name, c: res.summary.added }), 'success');
    } catch (err) {
      toast(err.message, 'error', 10000);
      btn.disabled = false;
      btn.textContent = t('import.install');
    }
  });
}

/* ---------------- Update flow ---------------- */

async function applyUpdateFlow() {
  const id = state.currentId;
  const wait = modal(`<h2>${t('up.fetching')}</h2><p class="muted">${t('up.fetchingSub')}</p>`);
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
    const wait2 = modal(`<h2>${t('up.applying')}</h2><p class="muted">${t('up.applyingSub')}</p>`);
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
    const m = modal(`
      <h2>${t('up.title', { v: esc(up.toVersion) })}</h2>
      <p class="muted">${t('up.newOptionals')}</p>
      ${up.newOptionals.map((o) => `
        <div class="check-row"><input type="checkbox" data-opt="${esc(o.path)}"/><label>${esc(o.name)}</label></div>`).join('')}
      <div class="modal-actions">
        <button class="btn" data-close>${t('common.cancel')}</button>
        <button class="btn primary" id="up-go">${t('up.update')}</button>
      </div>`);
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
  const m = modal(`
    <h2>${t('export.title', { n: esc(inst.name) })}</h2>
    <div class="field"><label>${t('export.version')}</label>
      <input type="text" id="ex-version" placeholder="1.0.0" value="${esc(inst.packVersion || '1.0.0')}"/></div>
    <div class="field"><label>${t('export.summary')}</label><input type="text" id="ex-summary" placeholder="${t('export.summaryPlaceholder')}"/></div>
    <p class="muted">${t('export.hint')}</p>
    <div class="modal-actions">
      <button class="btn" data-close>${t('common.cancel')}</button>
      <button class="btn primary" id="ex-go">${t('export.go')}</button>
    </div>`);
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

async function playCurrent(join) {
  const id = state.currentId;
  if (!state.accounts.list.length) {
    toast(t('accounts.addFirst'), 'error');
    accountsModal();
    return;
  }
  const btn = $('#btn-play');
  if (btn) { btn.disabled = true; btn.textContent = t('inst.launching'); }
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
  $('#lu-restart').addEventListener('click', () => api('app:installUpdate').catch((e) => toast(e.message, 'error')));

  try {
    [state.appInfo, state.settings] = await Promise.all([api('app:info'), api('settings:get')]);
    applyLanguage();
    $('#brand-version').textContent = `v${state.appInfo.version}`;
    await refreshAccounts();
    await refreshInstances();
    await refreshGroup({ announce: true });
    if (state.group?.config?.packs?.length && !state.instances.length) {
      state.view = 'group';
    } else if (state.group?.config && state.view === 'library' && state.instances.length === 0) {
      state.view = 'group';
    }
    render();
  } catch (err) {
    applyLanguage();
    toast(t('startup.error', { e: err.message }), 'error', 15000);
    render();
  }
}

boot();
