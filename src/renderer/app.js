/* global window, document */
const api = (channel, payload) => window.pmcl.invoke(channel, payload);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  view: 'library',            // library | instance | settings
  tab: 'mods',                // instance tab: mods | settings | logs
  appInfo: {},
  settings: {},
  accounts: { list: [], activeId: null },
  instances: [],
  currentId: null,
  current: null,              // full instance record
  mods: [],
  update: null,               // update-check result for current instance
  logs: {},                   // instanceId -> [lines]
  checkingUpdate: false,
};

/* ---------------- Toasts & modals ---------------- */

function toast(message, kind = 'info', ms = 5000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function modal(html) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  $$('[data-close]', backdrop).forEach((b) => b.addEventListener('click', close));
  $('#modal-root').appendChild(backdrop);
  return { el: backdrop, close };
}

function confirmModal(title, body, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>${esc(title)}</h2>
      <p class="muted">${esc(body)}</p>
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn danger" id="cf-yes">${esc(confirmLabel)}</button>
      </div>`);
    $('#cf-yes', m.el).addEventListener('click', () => { m.close(); resolve(true); });
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) resolve(false); });
    $$('[data-close]', m.el).forEach((b) => b.addEventListener('click', () => resolve(false)));
  });
}

/* ---------------- Progress / events from main ---------------- */

let progressHideTimer = null;
function showProgress(label, value, max) {
  const box = $('#global-progress');
  box.classList.remove('hidden');
  $('#gp-label').textContent = label;
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
      showProgress(evt.label || 'Working…', evt.value || 0, evt.max || 0);
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
      toast(`Minecraft exited (code ${evt.code})`, evt.code === 0 ? 'info' : 'error');
      refreshInstances();
      break;
    case 'instances-changed':
      refreshInstances();
      break;
    case 'launcher-update-ready':
      toast(`Launcher update ${evt.version} downloaded — restart to apply.`, 'success', 10000);
      break;
    default:
      break;
  }
});

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

function renderAccountChip() {
  const active = state.accounts.list.find((a) => a.id === state.accounts.activeId);
  $('#account-name').textContent = active ? active.name : 'Add account';
  $('#account-avatar').innerHTML = active
    ? `<img src="https://mc-heads.net/avatar/${encodeURIComponent(active.type === 'msa' ? active.id : active.name)}/26" alt="" />`
    : '';
}

function renderSidebar() {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === state.view || (state.view === 'instance' && b.dataset.nav === 'library')));
  const list = $('#instance-list');
  list.innerHTML = state.instances.map((i) => `
    <button class="instance-item ${state.currentId === i.id && state.view === 'instance' ? 'active' : ''}" data-id="${esc(i.id)}">
      <span class="dot ${i.running ? 'running' : ''}"></span>
      <span class="ii-name">${esc(i.name)}<div class="ii-sub">${esc(i.mc.version)} · ${esc(loaderLabel(i))}</div></span>
    </button>`).join('') || '<div class="muted" style="padding:8px">No instances yet</div>';
  $$('.instance-item', list).forEach((el) => el.addEventListener('click', () => openInstance(el.dataset.id)));
}

function render() {
  renderSidebar();
  renderAccountChip();
  const main = $('#main');
  if (state.view === 'settings') return renderGlobalSettings(main);
  if (state.view === 'instance' && state.current) return renderInstance(main);
  return renderLibrary(main);
}

function renderLibrary(main) {
  if (!state.instances.length) {
    main.innerHTML = `
      <div class="empty">
        <h2>Welcome! 👋</h2>
        <p>Create a vanilla instance for any Minecraft version, or import a modpack.</p>
        <div style="display:flex;gap:10px">
          <button class="btn" id="e-new">＋ New instance</button>
          <button class="btn primary" id="e-import">⬇ Import modpack</button>
        </div>
      </div>`;
    $('#e-new').addEventListener('click', newInstanceModal);
    $('#e-import').addEventListener('click', importModal);
    return;
  }
  main.innerHTML = `
    <h1>Library</h1>
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

function renderUpdateBanner() {
  const holder = $('#update-banner-holder');
  if (!holder) return;
  const u = state.update;
  if (state.checkingUpdate) {
    holder.innerHTML = `<div class="update-banner"><span class="muted">Checking for pack updates…</span></div>`;
    return;
  }
  if (!u) { holder.innerHTML = ''; return; }
  if (u.error) {
    holder.innerHTML = `<div class="update-banner"><span class="muted">Update check failed: ${esc(u.error)}</span></div>`;
    return;
  }
  if (!u.available) { holder.innerHTML = ''; return; }
  holder.innerHTML = `
    <div class="update-banner">
      <div class="grow"><b>Pack update available</b><div class="muted">${esc(u.current ?? 'installed')} → ${esc(u.latest)}</div></div>
      <button class="btn primary" id="btn-apply-update">Update now</button>
    </div>`;
  $('#btn-apply-update').addEventListener('click', applyUpdateFlow);
}

function renderInstance(main) {
  const inst = state.current;
  const src = sourceLabel(inst.source);
  main.innerHTML = `
    <div class="detail-header">
      ${packIcon(inst.name)}
      <div class="detail-title">
        <h1>${esc(inst.name)}</h1>
        <div class="meta">
          <span class="badge">${esc(inst.mc.version)}</span>
          <span class="badge">${esc(loaderLabel(inst))}</span>
          ${inst.packVersion ? `<span class="badge">pack v${esc(inst.packVersion)}</span>` : ''}
          ${src ? `<span class="badge src">${esc(src)}</span>` : ''}
        </div>
      </div>
      <div class="detail-actions">
        ${inst.running
          ? '<button class="btn danger" id="btn-kill">■ Stop</button>'
          : '<button class="btn play" id="btn-play">▶ Play</button>'}
      </div>
    </div>
    <div id="update-banner-holder"></div>
    <div class="tabs">
      <button class="tab ${state.tab === 'mods' ? 'active' : ''}" data-tab="mods">Mods</button>
      <button class="tab ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">Instance settings</button>
      <button class="tab ${state.tab === 'logs' ? 'active' : ''}" data-tab="logs">Logs</button>
    </div>
    <div id="tab-body"></div>`;

  $$('.tab', main).forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; render(); }));
  $('#btn-play')?.addEventListener('click', playCurrent);
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
      <button class="btn" id="btn-add-jar">＋ Add mod jar</button>
      <div class="spacer"></div>
      <input type="text" id="mod-search" placeholder="Search Modrinth for mods to add…" style="max-width:300px" />
      <button class="btn" id="btn-mod-search">Search</button>
    </div>
    <div id="mod-search-results"></div>
    ${state.mods.length === 0 && notInstalled.length === 0 ? '<p class="muted">No mods yet. Add jars or search Modrinth above.</p>' : ''}
    ${state.mods.map((m) => `
      <div class="mod-row ${m.enabled ? '' : 'disabled'}">
        <label class="switch"><input type="checkbox" data-toggle="${esc(m.file)}" data-rel="mods/${esc(m.name)}" data-optional="${m.optional ? '1' : ''}" ${m.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        <span class="mod-name" title="${esc(m.name)}">${esc(m.name)}</span>
        ${m.fromPack ? `<span class="badge">${m.optional ? 'optional' : 'pack'}</span>` : '<span class="badge">your mod</span>'}
        ${!m.fromPack || m.optional ? `<button class="icon-btn" title="Delete" data-del="${esc(m.file)}">🗑</button>` : ''}
      </div>`).join('')}
    ${notInstalled.length ? `<h2 class="mt">Optional mods from the pack</h2>` : ''}
    ${notInstalled.map(([rel, meta]) => `
      <div class="mod-row disabled">
        <label class="switch"><input type="checkbox" data-opt-install="${esc(rel)}"/><span class="slider"></span></label>
        <span class="mod-name">${esc(meta.name || rel)}</span>
        <span class="badge">optional · not installed</span>
      </div>`).join('')}`;

  $('#btn-add-jar').addEventListener('click', async () => {
    try { state.mods = await api('mods:addLocal', { id: inst.id }); render(); } catch (err) { toast(err.message, 'error'); }
  });

  const doSearch = async () => {
    const q = $('#mod-search').value.trim();
    if (!q) return;
    const holder = $('#mod-search-results');
    holder.innerHTML = '<p class="muted">Searching…</p>';
    try {
      const hits = await api('mods:searchModrinth', { id: inst.id, query: q });
      holder.innerHTML = hits.length ? hits.map((h) => `
        <div class="result-row">
          ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : '<div class="avatar"></div>'}
          <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
          <button class="btn" data-install="${esc(h.projectId)}">Add</button>
          <button class="btn" data-install-opt="${esc(h.projectId)}" title="Friends can choose whether to use it">Add as optional</button>
        </div>`).join('') : '<p class="muted">No results.</p>';
      $$('[data-install]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.install, false, b)));
      $$('[data-install-opt]', holder).forEach((b) => b.addEventListener('click', () => installSearchedMod(b.dataset.installOpt, true, b)));
    } catch (err) {
      holder.innerHTML = `<p class="muted">Search failed: ${esc(err.message)}</p>`;
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
      toast('Optional mod installed', 'success');
      await openInstance(inst.id, 'mods');
    } catch (err) { toast(err.message, 'error'); render(); }
  }));
  $$('[data-del]', body).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmModal('Delete mod', `Delete ${b.dataset.del}?`, 'Delete'))) return;
    try { state.mods = await api('mods:delete', { id: inst.id, file: b.dataset.del }); render(); } catch (err) { toast(err.message, 'error'); }
  }));
}

async function installSearchedMod(projectId, optional, btn) {
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const res = await api('mods:installModrinth', { id: state.currentId, project: projectId, optional });
    toast(`Added ${res.file}`, 'success');
    await openInstance(state.currentId, 'mods');
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = optional ? 'Add as optional' : 'Add';
  }
}

function renderInstanceSettings(body) {
  const inst = state.current;
  const s = inst.settings || {};
  body.innerHTML = `
    <section class="settings-block">
      <h2>General</h2>
      <div class="field"><label>Instance name</label><input type="text" id="is-name" value="${esc(inst.name)}"/></div>
      <div class="field-row">
        <div class="field"><label>Max RAM in GB (blank = global default)</label><input type="text" id="is-memmax" placeholder="e.g. 8 or 8G" value="${esc(s.memoryMax || '')}"/></div>
        <div class="field"><label>Min RAM</label><input type="text" id="is-memmin" placeholder="e.g. 1G" value="${esc(s.memoryMin || '')}"/></div>
      </div>
      <div class="field"><label>Java path override</label><input type="text" id="is-java" placeholder="blank = auto-managed Java" value="${esc(s.javaPath || '')}"/></div>
      <div class="field"><label>Extra JVM args</label><input type="text" id="is-jvm" value="${esc(s.jvmArgs || '')}"/></div>
      <button class="btn primary" id="is-save">Save</button>
    </section>
    <section class="settings-block">
      <h2>Sharing</h2>
      <p class="muted" style="margin-bottom:12px">Export this instance as a .mrpack and attach it to a GitHub release — friends who imported from your repo get a one-click update.</p>
      <button class="btn" id="is-export">📤 Export as .mrpack</button>
      <button class="btn" id="is-check-update">🔄 Check for updates</button>
      <button class="btn" id="is-open">📁 Open instance folder</button>
    </section>
    <section class="settings-block">
      <h2>Danger zone</h2>
      <button class="btn danger" id="is-delete">Delete this instance</button>
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
      toast('Saved', 'success');
      await refreshInstances();
      await openInstance(inst.id, 'settings');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#is-open').addEventListener('click', () => api('instances:openFolder', { id: inst.id }));
  $('#is-export').addEventListener('click', exportModal);
  $('#is-check-update').addEventListener('click', autoCheckUpdate);
  $('#is-delete').addEventListener('click', async () => {
    if (!(await confirmModal('Delete instance', `This permanently deletes "${inst.name}" including its saves. Consider backing up the folder first.`, 'Delete forever'))) return;
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
      <button class="btn" id="log-clear">Clear</button>
    </div>
    <pre class="logs" id="log-pre">${esc(buf.join('\n')) || 'No output yet — press Play.'}</pre>`;
  const pre = $('#log-pre');
  pre.scrollTop = pre.scrollHeight;
  $('#log-clear').addEventListener('click', () => { state.logs[state.currentId] = []; renderLogsTab(body); });
}

function renderGlobalSettings(main) {
  const s = state.settings;
  main.innerHTML = `
    <h1>Settings</h1>
    <section class="settings-block mt">
      <h2>Defaults</h2>
      <div class="field-row">
        <div class="field"><label>Max RAM (e.g. 8 or 8G)</label><input type="text" id="gs-memmax" value="${esc(s.memoryMax)}"/></div>
        <div class="field"><label>Min RAM</label><input type="text" id="gs-memmin" value="${esc(s.memoryMin)}"/></div>
      </div>
      <div class="field"><label>Download concurrency</label><input type="text" id="gs-conc" value="${esc(s.downloadConcurrency)}"/></div>
      <div class="check-row"><input type="checkbox" id="gs-snapshots" ${s.showSnapshots ? 'checked' : ''}/><label for="gs-snapshots">Show snapshot versions when creating instances</label></div>
    </section>
    <section class="settings-block">
      <h2>CurseForge</h2>
      <div class="field">
        <label>API key (optional but recommended for CurseForge packs)</label>
        <input type="password" id="gs-cfkey" value="${esc(s.curseforgeApiKey)}"/>
        <div class="hint">Free key from console.curseforge.com → API keys. Without it the launcher uses a fallback that works for most, but not all, CurseForge mods.</div>
      </div>
    </section>
    <section class="settings-block">
      <h2>Storage</h2>
      <p class="muted">Data folder: ${esc(state.appInfo.dataDir || '')}</p>
      <div class="mt"><button class="btn" id="gs-open-data">Open data folder</button>
      <button class="btn" id="gs-open-exports">Open exports folder</button></div>
    </section>
    <button class="btn primary" id="gs-save">Save settings</button>
    <p class="muted mt">Personal Minecraft Launcher v${esc(state.appInfo.version || 'dev')}</p>`;

  $('#gs-save').addEventListener('click', async () => {
    try {
      state.settings = await api('settings:set', {
        memoryMax: $('#gs-memmax').value.trim() || '4G',
        memoryMin: $('#gs-memmin').value.trim() || '1G',
        downloadConcurrency: Math.max(1, parseInt($('#gs-conc').value, 10) || 6),
        showSnapshots: $('#gs-snapshots').checked,
        curseforgeApiKey: $('#gs-cfkey').value.trim(),
      });
      toast('Settings saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#gs-open-data').addEventListener('click', () => api('app:openPath', { target: 'data' }));
  $('#gs-open-exports').addEventListener('click', () => api('app:openPath', { target: 'exports' }));
}

/* ---------------- Accounts ---------------- */

function accountsModal() {
  const renderBody = () => {
    const { list, activeId } = state.accounts;
    return `
      <h2>Accounts</h2>
      ${list.length ? list.map((a) => `
        <div class="result-row">
          <img src="https://mc-heads.net/avatar/${encodeURIComponent(a.type === 'msa' ? a.id : a.name)}/34" alt=""/>
          <div class="grow"><b>${esc(a.name)}</b><div class="desc">${a.type === 'msa' ? 'Microsoft' : 'Offline profile'}${a.id === activeId ? ' · active' : ''}</div></div>
          ${a.id !== activeId ? `<button class="btn" data-active="${esc(a.id)}">Use</button>` : ''}
          <button class="icon-btn" data-remove="${esc(a.id)}" title="Remove">🗑</button>
        </div>`).join('') : '<p class="muted">No accounts yet.</p>'}
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn primary" id="acc-ms">Sign in with Microsoft</button>
      </div>
      <div class="field mt">
        <label>Offline profile (for accounts that already own Minecraft — LAN / no-internet play)</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="acc-offline-name" placeholder="PlayerName" maxlength="16"/>
          <button class="btn" id="acc-offline-add">Add</button>
        </div>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Close</button></div>`;
  };

  const m = modal(renderBody());
  const bind = () => {
    $('#acc-ms', m.el).addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Waiting for Microsoft sign-in…';
      try {
        await api('accounts:addMicrosoft');
        await refreshAccounts();
        rerender();
        toast('Signed in!', 'success');
      } catch (err) {
        toast(err.message, 'error');
        e.target.disabled = false;
        e.target.textContent = 'Sign in with Microsoft';
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
    <h2>New instance</h2>
    <div class="field"><label>Name</label><input type="text" id="ni-name" placeholder="e.g. Survival 1.21"/></div>
    <div class="field"><label>Minecraft version</label><select id="ni-mc"><option>Loading…</option></select></div>
    <div class="field"><label>Mod loader</label>
      <div class="subtabs" id="ni-loaders">
        ${['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map((l, i) => `<button class="subtab ${i === 0 ? 'active' : ''}" data-loader="${l}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="field hidden" id="ni-lv-field"><label>Loader version</label><select id="ni-lv"></select></div>
    <div class="modal-actions">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="ni-create">Create</button>
    </div>`);

  let loader = 'vanilla';
  const mcSel = $('#ni-mc', m.el);
  const lvSel = $('#ni-lv', m.el);

  try {
    const versions = await api('mc:versions', { includeSnapshots: !!state.settings.showSnapshots });
    mcSel.innerHTML = versions.map((v) => `<option value="${esc(v.id)}">${esc(v.id)}${v.type === 'snapshot' ? ' (snapshot)' : ''}</option>`).join('');
  } catch (err) {
    mcSel.innerHTML = '<option value="">Failed to load versions</option>';
    toast(err.message, 'error');
  }

  const loadLoaderVersions = async () => {
    if (loader === 'vanilla') { $('#ni-lv-field', m.el).classList.add('hidden'); return; }
    $('#ni-lv-field', m.el).classList.remove('hidden');
    lvSel.innerHTML = '<option>Loading…</option>';
    try {
      const list = await api('mc:loaderVersions', { loader, mcVersion: mcSel.value });
      lvSel.innerHTML = list.length
        ? list.map((v) => `<option value="${esc(v.version)}">${esc(v.version)}${v.stable ? '' : ' (beta)'}</option>`).join('')
        : '<option value="">No versions for this Minecraft version</option>';
    } catch (err) {
      lvSel.innerHTML = '<option value="">Failed to load</option>';
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
      toast('Instance created', 'success');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/* ---------------- Import pack ---------------- */

function importModal() {
  const m = modal(`
    <h2>Import modpack</h2>
    <div class="subtabs">
      ${[['file', 'From file'], ['modrinth', 'Modrinth'], ['github', 'Friend’s GitHub'], ['curseforge', 'CurseForge'], ['url', 'Direct URL']]
        .map(([k, label], i) => `<button class="subtab ${i === 0 ? 'active' : ''}" data-sub="${k}">${label}</button>`).join('')}
    </div>
    <div id="import-body"></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button></div>`);

  const body = $('#import-body', m.el);
  let sub = 'file';

  const renderSub = () => {
    if (sub === 'file') {
      body.innerHTML = `
        <p class="muted">Import a Modrinth <b>.mrpack</b> or a CurseForge modpack <b>.zip</b> from your computer.</p>
        <div class="mt"><button class="btn primary" id="imp-pick">Choose file…</button></div>`;
      $('#imp-pick', body).addEventListener('click', async () => {
        const file = await api('packs:pickFile');
        if (file) startImport({ type: 'file', path: file }, m);
      });
    } else if (sub === 'url') {
      body.innerHTML = `
        <div class="field"><label>Direct link to a .mrpack or CurseForge .zip</label><input type="text" id="imp-url" placeholder="https://…/pack.mrpack"/></div>
        <button class="btn primary" id="imp-url-go">Import</button>`;
      $('#imp-url-go', body).addEventListener('click', () => {
        const url = $('#imp-url', body).value.trim();
        if (url) startImport({ type: 'url', url }, m);
      });
    } else if (sub === 'github') {
      body.innerHTML = `
        <p class="muted">Your friend publishes the pack as a GitHub release with a .mrpack attached. Imports the latest release and enables one-click updates.</p>
        <div class="field mt"><label>Repository</label><input type="text" id="imp-gh" placeholder="username/modpack-repo"/></div>
        <button class="btn primary" id="imp-gh-go">Import latest release</button>`;
      $('#imp-gh-go', body).addEventListener('click', () => {
        const repo = $('#imp-gh', body).value.trim();
        if (repo) startImport({ type: 'github-releases', repo }, m);
      });
    } else if (sub === 'curseforge') {
      body.innerHTML = `
        <p class="muted">Enter a CurseForge modpack <b>project ID</b> (shown in the sidebar of the pack's page). For best results add an API key in Settings.</p>
        <div class="field mt"><label>Project ID</label><input type="text" id="imp-cf" placeholder="e.g. 715572"/></div>
        <button class="btn primary" id="imp-cf-go">Import latest version</button>`;
      $('#imp-cf-go', body).addEventListener('click', () => {
        const project = $('#imp-cf', body).value.trim();
        if (project) startImport({ type: 'curseforge', project }, m);
      });
    } else if (sub === 'modrinth') {
      body.innerHTML = `
        <div class="toolbar"><input type="text" id="imp-mr-q" placeholder="Search modpacks…"/><button class="btn" id="imp-mr-go">Search</button></div>
        <div id="imp-mr-results"></div>`;
      const doSearch = async () => {
        const holder = $('#imp-mr-results', body);
        holder.innerHTML = '<p class="muted">Searching…</p>';
        try {
          const hits = await api('packs:searchModrinth', { query: $('#imp-mr-q', body).value.trim() });
          holder.innerHTML = hits.length ? hits.map((h) => `
            <div class="result-row">
              ${h.iconUrl ? `<img src="${esc(h.iconUrl)}" alt=""/>` : '<div class="avatar"></div>'}
              <div class="grow"><b>${esc(h.title)}</b><div class="desc">${esc(h.description)}</div></div>
              <button class="btn primary" data-mr="${esc(h.projectId)}">Import</button>
            </div>`).join('') : '<p class="muted">No results.</p>';
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
  const wait = modal('<h2>Preparing import…</h2><p class="muted">Downloading and inspecting the pack. Progress shows in the sidebar.</p>');
  let info;
  try {
    info = await api('packs:beginImport', { ref });
  } catch (err) {
    wait.close();
    toast(err.message, 'error', 9000);
    return;
  }
  wait.close();

  const m = modal(`
    <h2>Install ${esc(info.name)}</h2>
    <p class="muted">Minecraft ${esc(info.mcVersion || '?')} · ${esc(info.loader?.type || 'vanilla')} ${esc(info.loader?.version || '')} · version ${esc(info.version || '?')}</p>
    <div class="field mt"><label>Instance name</label><input type="text" id="pi-name" value="${esc(info.name)}"/></div>
    ${info.optionals?.length ? `
      <h2 style="font-size:14px">Optional mods — pick what you want</h2>
      ${info.optionals.map((o) => `
        <div class="check-row"><input type="checkbox" id="opt-${esc(o.path)}" data-opt="${esc(o.path)}"/><label for="opt-${esc(o.path)}">${esc(o.name)}</label></div>`).join('')}
    ` : ''}
    <div class="modal-actions">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="pi-go">Install</button>
    </div>`);

  $('#pi-go', m.el).addEventListener('click', async () => {
    const btn = $('#pi-go', m.el);
    btn.disabled = true;
    btn.textContent = 'Installing…';
    const choices = {};
    $$('[data-opt]', m.el).forEach((cb) => { choices[cb.dataset.opt] = cb.checked; });
    try {
      const res = await api('packs:completeImport', { ticket: info.ticket, name: $('#pi-name', m.el).value, choices });
      m.close();
      await refreshInstances();
      await openInstance(res.instanceId);
      toast(`Installed ${res.meta.name} (${res.summary.added} files)`, 'success');
    } catch (err) {
      toast(err.message, 'error', 10000);
      btn.disabled = false;
      btn.textContent = 'Install';
    }
  });
}

/* ---------------- Update flow ---------------- */

async function applyUpdateFlow() {
  const id = state.currentId;
  const wait = modal('<h2>Fetching update…</h2><p class="muted">Downloading the new pack version…</p>');
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
    const wait2 = modal('<h2>Updating…</h2><p class="muted">Applying the update. Your own mods, saves and settings are preserved.</p>');
    try {
      const res = await api('packs:completeUpdate', { id, ticket: up.ticket, newChoices });
      wait2.close();
      const s = res.summary;
      toast(`Updated to ${up.toVersion}: +${s.added} new, ${s.updated} changed, −${s.removed} removed${s.backedUp.length ? `, ${s.backedUp.length} backed up` : ''}`, 'success', 9000);
      s.warnings.slice(0, 3).forEach((w) => toast(w, 'info', 9000));
      await openInstance(id);
    } catch (err) {
      wait2.close();
      toast(err.message, 'error', 10000);
    }
  };

  if (up.newOptionals?.length) {
    const m = modal(`
      <h2>Update to ${esc(up.toVersion)}</h2>
      <p class="muted">This update adds new optional mods. Pick what you want:</p>
      ${up.newOptionals.map((o) => `
        <div class="check-row"><input type="checkbox" data-opt="${esc(o.path)}"/><label>${esc(o.name)}</label></div>`).join('')}
      <div class="modal-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn primary" id="up-go">Update</button>
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
    <h2>Export "${esc(inst.name)}" as .mrpack</h2>
    <div class="field"><label>Pack version (friends see this — bump it every release)</label>
      <input type="text" id="ex-version" placeholder="e.g. 1.0.0" value="${esc(inst.packVersion || '1.0.0')}"/></div>
    <div class="field"><label>Summary (optional)</label><input type="text" id="ex-summary" placeholder="Season 3 pack for the gang"/></div>
    <p class="muted">Mods added from Modrinth are referenced by URL (small file). Local jars and configs are bundled. Saves, screenshots and personal settings are not included.</p>
    <div class="modal-actions">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="ex-go">Export</button>
    </div>`);
  $('#ex-go', m.el).addEventListener('click', async () => {
    const btn = $('#ex-go', m.el);
    btn.disabled = true;
    try {
      const res = await api('packs:export', { id: inst.id, version: $('#ex-version', m.el).value, summary: $('#ex-summary', m.el).value.trim() });
      m.close();
      toast(`Exported: ${res.remoteFiles} linked mods, ${res.overrideFiles} bundled files. Upload it to a GitHub release!`, 'success', 10000);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

/* ---------------- Launch ---------------- */

async function playCurrent() {
  const id = state.currentId;
  if (!state.accounts.list.length) {
    toast('Add an account first (top-left).', 'error');
    accountsModal();
    return;
  }
  const btn = $('#btn-play');
  if (btn) { btn.disabled = true; btn.textContent = 'Launching…'; }
  state.logs[id] = state.logs[id] || [];
  try {
    await api('launch:play', { id });
    await refreshInstances();
  } catch (err) {
    toast(err.message, 'error', 10000);
    await refreshInstances();
  }
}

/* ---------------- Boot ---------------- */

async function boot() {
  $('#btn-new').addEventListener('click', newInstanceModal);
  $('#btn-import').addEventListener('click', importModal);
  $('#account-chip').addEventListener('click', accountsModal);
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.nav;
    if (state.view === 'library') state.currentId = null;
    render();
  }));

  try {
    [state.appInfo, state.settings] = await Promise.all([api('app:info'), api('settings:get')]);
    $('#brand-version').textContent = `v${state.appInfo.version}`;
    await refreshAccounts();
    await refreshInstances();
  } catch (err) {
    toast(`Startup error: ${err.message}`, 'error', 15000);
  }
  render();
}

boot();
