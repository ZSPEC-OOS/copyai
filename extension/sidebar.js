// sidebar.js — CopyAI Browser Extension Sidebar
// Uses Firebase Firestore REST API for cloud sync (same data as the website).
(function () {
  'use strict';

  // ── Firebase config (matches lib/firebase.ts) ────────────
  const FB_API_KEY   = 'AIzaSyALNxKQjAlTTpzcmBusII-zmiNjgXjnDhU';
  const FB_PROJECT   = 'copyai-c2e3b';
  const FB_DOC_PATH  = `projects/${FB_PROJECT}/databases/(default)/documents/users/jesse`;
  const FIRESTORE    = `https://firestore.googleapis.com/v1/${FB_DOC_PATH}?key=${FB_API_KEY}`;

  // ── State ────────────────────────────────────────────────
  let cards      = [];
  let layouts    = [];
  let editingId  = null;
  let searchQuery = '';
  let addOpen    = false;
  let expandedIds = new Set();
  let saveTimer  = null;  // debounce Firestore writes

  // ── Firestore REST helpers ───────────────────────────────
  // Convert a plain JS value → Firestore REST value object
  function toFV(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean')          return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val)
        ? { integerValue: String(val) }
        : { doubleValue: val };
    }
    if (typeof val === 'string')           return { stringValue: val };
    if (Array.isArray(val))                return { arrayValue: { values: val.map(toFV) } };
    if (typeof val === 'object') {
      const fields = {};
      for (const [k, v] of Object.entries(val)) fields[k] = toFV(v);
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  // Convert a Firestore REST value object → plain JS value
  function fromFV(fv) {
    if (!fv)                    return null;
    if ('nullValue'    in fv)   return null;
    if ('booleanValue' in fv)   return fv.booleanValue;
    if ('integerValue' in fv)   return Number(fv.integerValue);
    if ('doubleValue'  in fv)   return fv.doubleValue;
    if ('stringValue'  in fv)   return fv.stringValue;
    if ('arrayValue'   in fv)   return (fv.arrayValue.values || []).map(fromFV);
    if ('mapValue'     in fv) {
      const obj = {};
      for (const [k, v] of Object.entries(fv.mapValue.fields || {})) obj[k] = fromFV(v);
      return obj;
    }
    return null;
  }

  // Read cards + layouts from Firestore
  async function firestoreLoad() {
    const res = await fetch(FIRESTORE);
    if (!res.ok) throw new Error('Firestore read failed: ' + res.status);
    const doc = await res.json();
    const fields = doc.fields || {};
    return {
      cards:   fields.cards   ? fromFV(fields.cards)   : [],
      layouts: fields.layouts ? fromFV(fields.layouts) : [],
    };
  }

  // Write cards + layouts to Firestore (PATCH with updateMask)
  async function firestoreSave() {
    const url = FIRESTORE + '&updateMask.fieldPaths=cards&updateMask.fieldPaths=layouts';
    const body = {
      fields: {
        cards:   toFV(cards),
        layouts: toFV(layouts),
      },
    };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Firestore write failed: ' + res.status);
  }

  // Debounced save — waits 800ms after last change before writing
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      firestoreSave().catch(() => showToast('⚠ Sync error — check your connection'));
    }, 800);
  }

  // ── Auth (simple hardcoded credentials, same as website) ─
  function checkLogin(user, pass) {
    return user === 'Jesse' && pass === 'copyai';
  }

  function isLoggedIn() {
    return new Promise(resolve => {
      chrome.storage.local.get('copyai_logged_in', r => resolve(!!r.copyai_logged_in));
    });
  }

  function setLoggedIn(val) {
    return new Promise(resolve => {
      chrome.storage.local.set({ copyai_logged_in: val }, resolve);
    });
  }

  // ── Screens ──────────────────────────────────────────────
  function showScreen(name) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById(name).classList.remove('hidden');
  }

  // ── Utilities ────────────────────────────────────────────
  function fmt(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function nextUniqueTitle(base) {
    const titles = new Set(layouts.map(l => l.title));
    let t = (base || 'Untitled').trim() || 'Untitled';
    let attempt = t, n = 2;
    while (titles.has(attempt)) { attempt = t + '-' + n; n++; }
    return attempt;
  }

  function needsClamp(text) {
    if (!text) return false;
    return text.split(/\r?\n/).length > 3 || text.length > 200;
  }

  let toastTimer2 = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = '';
    if (toastTimer2) clearTimeout(toastTimer2);
    toastTimer2 = setTimeout(() => el.classList.add('hidden'), 2000);
  }

  async function copyText(text) {
    if (!text) { showToast('Nothing to copy'); return; }
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ Copied to clipboard');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('✓ Copied');
      } catch {
        showToast('⚠ Copy failed — try again');
      }
    }
  }

  // ── Render ───────────────────────────────────────────────
  function render() {
    renderHeader();
    renderPrompts();
  }

  function renderHeader() {
    const countBadge     = document.getElementById('prompt-count');
    const libLabel       = document.getElementById('lib-label');
    const libModalCount  = document.getElementById('lib-modal-count');

    if (countBadge) {
      if (cards.length > 0) {
        countBadge.textContent = `${cards.length} prompt${cards.length !== 1 ? 's' : ''}`;
        countBadge.style.display = '';
      } else {
        countBadge.style.display = 'none';
      }
    }
    if (libLabel) {
      libLabel.textContent = layouts.length > 0 ? `Library (${layouts.length})` : 'Library';
    }
    if (libModalCount) {
      libModalCount.textContent = layouts.length;
      libModalCount.style.display = layouts.length > 0 ? '' : 'none';
    }
  }

  function renderPrompts() {
    const container = document.getElementById('prompts-container');
    const label     = document.getElementById('prompts-label');
    if (!container) return;

    const query    = searchQuery.trim().toLowerCase();
    const filtered = query
      ? cards.filter(c =>
          c.title.toLowerCase().includes(query) ||
          c.text.toLowerCase().includes(query)
        )
      : cards;

    if (label) label.style.display = filtered.length > 0 ? '' : 'none';

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">✦</div>' +
          '<div class="empty-text">' +
            (query ? 'No prompts match your search.' : 'No prompts yet.<br>Add one above to get started.') +
          '</div>' +
        '</div>';
      return;
    }

    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'prompts-list';
    filtered.forEach(card => list.appendChild(buildCard(card)));
    container.appendChild(list);
  }

  function buildCard(card) {
    const isExpanded = expandedIds.has(card.id);
    const showToggle = needsClamp(card.text) || isExpanded;

    const div = document.createElement('div');
    div.className = 'prompt-card';

    const badge = document.createElement('span');
    badge.className = 'copy-badge';
    badge.textContent = 'Copy';
    div.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.className = 'prompt-title';
    titleEl.title = card.title || 'Untitled';
    titleEl.textContent = card.title || 'Untitled';
    div.appendChild(titleEl);

    const textEl = document.createElement('div');
    textEl.className = 'prompt-text' +
      (isExpanded ? ' expanded' : '') +
      (!card.text ? ' empty' : '');
    textEl.textContent = card.text || '(empty)';
    div.appendChild(textEl);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-default btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEdit(card.id); });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger btn-sm';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${card.title || 'this prompt'}"?`)) {
        cards = cards.filter(c => c.id !== card.id);
        expandedIds.delete(card.id);
        render();
        scheduleSave();
        showToast('Prompt deleted');
      }
    });
    actions.appendChild(delBtn);

    if (showToggle) {
      const expBtn = document.createElement('button');
      expBtn.className = 'expand-btn';
      expBtn.textContent = isExpanded ? '↑ Less' : '↓ More';
      expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedIds.has(card.id)) expandedIds.delete(card.id);
        else expandedIds.add(card.id);
        renderPrompts();
      });
      actions.appendChild(expBtn);
    }

    div.appendChild(actions);

    div.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      copyText(card.text);
    });

    return div;
  }

  // ── Library ──────────────────────────────────────────────
  function renderLibrary() {
    renderHeader();
    const list = document.getElementById('layouts-list');
    if (!list) return;

    if (layouts.length === 0) {
      list.innerHTML =
        '<div class="empty-state" style="padding:24px 0">' +
          '<div class="empty-icon">📚</div>' +
          '<div class="empty-text">No saved layouts yet.<br>Save your current prompts to get started.</div>' +
        '</div>';
      return;
    }

    list.innerHTML = '';
    layouts.forEach(l => {
      const item = document.createElement('div');
      item.className = 'layout-item';

      const info = document.createElement('div');
      info.className = 'layout-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'layout-title';
      titleEl.title = l.title;
      titleEl.textContent = l.title;

      const meta = document.createElement('div');
      meta.className = 'layout-meta';
      meta.textContent = `${l.cards.length} prompt${l.cards.length !== 1 ? 's' : ''} · ${fmt(l.savedAt)}`;

      info.appendChild(titleEl);
      info.appendChild(meta);

      const btns = document.createElement('div');
      btns.className = 'layout-btns';

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-accent btn-sm';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        cards = [...l.cards];
        expandedIds.clear();
        render();
        scheduleSave();
        closeLibrary();
        showToast(`Opened: ${l.title}`);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm(`Delete layout "${l.title}"?`)) {
          layouts = layouts.filter(x => x.id !== l.id);
          scheduleSave();
          renderLibrary();
          showToast('Layout deleted');
        }
      });

      btns.appendChild(openBtn);
      btns.appendChild(delBtn);
      item.appendChild(info);
      item.appendChild(btns);
      list.appendChild(item);
    });
  }

  function openLibrary()  { renderLibrary(); document.getElementById('library-modal').classList.remove('hidden'); }
  function closeLibrary() { document.getElementById('library-modal').classList.add('hidden'); }

  // ── Add Prompt ───────────────────────────────────────────
  function setupAddPrompt() {
    const toggle     = document.getElementById('add-toggle');
    const form       = document.getElementById('add-form');
    const titleInput = document.getElementById('new-title');
    const textInput  = document.getElementById('new-text');
    const addBtn     = document.getElementById('add-btn');

    toggle.addEventListener('click', () => {
      addOpen = !addOpen;
      toggle.classList.toggle('open', addOpen);
      form.classList.toggle('hidden', !addOpen);
      if (addOpen) titleInput.focus();
    });

    function doAdd() {
      const t = titleInput.value.trim();
      const x = textInput.value.trim();
      if (!t && !x) { showToast('Enter a title or prompt text first'); return; }
      const id = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
      cards.push({ id, title: t || 'Untitled', text: x, createdAt: Date.now() });
      titleInput.value = '';
      textInput.value  = '';
      titleInput.focus();
      render();
      scheduleSave();
      showToast('✓ Prompt added');
    }

    addBtn.addEventListener('click', doAdd);
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  }

  // ── Save Layout ──────────────────────────────────────────
  function setupSaveLayout() {
    document.getElementById('save-btn').addEventListener('click', () => {
      if (cards.length === 0) { showToast('No prompts to save'); return; }
      const base = prompt('Layout name:', '');
      if (base === null) return;
      const title = nextUniqueTitle(base);
      layouts.push({ id: 'L' + Date.now(), title, savedAt: Date.now(), cards: [...cards] });
      scheduleSave();
      renderHeader();
      showToast(`✓ Saved: ${title}`);
    });
  }

  // ── Library modal events ─────────────────────────────────
  function setupLibrary() {
    document.getElementById('library-btn').addEventListener('click', openLibrary);
    document.getElementById('close-library').addEventListener('click', closeLibrary);
    document.getElementById('library-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeLibrary();
    });

    document.getElementById('export-layout-btn').addEventListener('click', () => {
      if (cards.length === 0) { showToast('No prompts to export'); return; }
      const blob = new Blob([JSON.stringify({ cards }, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'prompts.json'; a.click();
      URL.revokeObjectURL(url);
      showToast('✓ Layout exported');
    });

    document.getElementById('export-library-btn').addEventListener('click', () => {
      if (layouts.length === 0) { showToast('No layouts to export'); return; }
      navigator.clipboard.writeText(JSON.stringify({ layouts }, null, 2))
        .then(() => showToast('✓ Library copied to clipboard'))
        .catch(() => showToast('⚠ Copy failed'));
    });

    document.getElementById('import-layout-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(t => {
        let data;
        try { data = JSON.parse(t); } catch { showToast('⚠ Invalid JSON file'); return; }
        if (!Array.isArray(data.cards)) { showToast('⚠ Not a valid layout file'); return; }
        cards = data.cards.map((c, i) => ({
          id: String(c.id ?? 'c' + Date.now() + i),
          title: String(c.title ?? 'Untitled'),
          text: String(c.text ?? ''),
          createdAt: Number.isFinite(+c.createdAt) ? +c.createdAt : Date.now() - i,
        })).sort((a, b) => a.createdAt - b.createdAt);
        expandedIds.clear();
        render();
        scheduleSave();
        closeLibrary();
        showToast('✓ Layout imported');
        e.target.value = '';
      }).catch(() => showToast('⚠ Failed to read file'));
    });

    document.getElementById('import-library-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(t => {
        let data;
        try { data = JSON.parse(t); } catch { showToast('⚠ Invalid JSON file'); return; }
        const incoming = Array.isArray(data) ? data : data?.layouts;
        if (!Array.isArray(incoming)) { showToast('⚠ Not a valid library file'); return; }
        const existingTitles = new Set(layouts.map(l => l.title));
        const normalized = incoming.map((l, li) => {
          const cardsArr = Array.isArray(l?.cards)
            ? l.cards.map((c, i) => ({
                id: String(c?.id ?? 'c' + Date.now() + '_' + li + '_' + i),
                title: String(c?.title ?? 'Untitled'),
                text: String(c?.text ?? ''),
                createdAt: Number.isFinite(+c?.createdAt) ? +c.createdAt : Date.now() - i,
              }))
            : [];
          let attempt = String(l?.title ?? 'Untitled').trim() || 'Untitled';
          let n = 2;
          while (existingTitles.has(attempt)) { attempt = String(l?.title ?? 'Untitled').trim() + '-' + n; n++; }
          existingTitles.add(attempt);
          return { id: 'L' + Date.now() + '_' + li, title: attempt, savedAt: Number.isFinite(+l?.savedAt) ? +l.savedAt : Date.now() - li, cards: cardsArr };
        });
        if (normalized.length === 0) { showToast('No layouts found in file'); return; }
        layouts.push(...normalized);
        scheduleSave();
        renderLibrary();
        showToast(`✓ Imported ${normalized.length} layout${normalized.length !== 1 ? 's' : ''}`);
        e.target.value = '';
      }).catch(() => showToast('⚠ Failed to read file'));
    });
  }

  // ── Edit Modal ───────────────────────────────────────────
  function openEdit(id) {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    editingId = id;
    document.getElementById('edit-title').value = card.title;
    document.getElementById('edit-text').value  = card.text;
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-title').focus();
  }

  function closeEdit() {
    editingId = null;
    document.getElementById('edit-modal').classList.add('hidden');
  }

  function setupEdit() {
    document.getElementById('close-edit').addEventListener('click', closeEdit);
    document.getElementById('edit-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeEdit();
    });
    document.getElementById('save-edit-btn').addEventListener('click', () => {
      if (!editingId) return;
      const t = document.getElementById('edit-title').value.trim() || 'Untitled';
      const x = document.getElementById('edit-text').value;
      cards = cards.map(c => c.id === editingId ? { ...c, title: t, text: x } : c);
      render();
      scheduleSave();
      closeEdit();
      showToast('✓ Saved');
    });
    document.getElementById('edit-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('save-edit-btn').click();
      }
    });
  }

  // ── Search ───────────────────────────────────────────────
  function setupSearch() {
    document.getElementById('search-input').addEventListener('input', e => {
      searchQuery = e.target.value;
      renderPrompts();
    });
  }

  // ── Keyboard shortcuts ───────────────────────────────────
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('library-modal').classList.contains('hidden')) { closeLibrary(); return; }
        if (!document.getElementById('edit-modal').classList.contains('hidden'))   { closeEdit();    return; }
      }
    });
  }

  // ── Login setup ──────────────────────────────────────────
  function setupLogin() {
    const userInput  = document.getElementById('login-user');
    const passInput  = document.getElementById('login-pass');
    const loginBtn   = document.getElementById('login-btn');
    const errorEl    = document.getElementById('login-error');

    function doLogin() {
      const user = userInput.value.trim();
      const pass = passInput.value;
      if (!checkLogin(user, pass)) {
        errorEl.textContent = 'Incorrect username or password.';
        errorEl.classList.remove('hidden');
        passInput.value = '';
        passInput.focus();
        return;
      }
      errorEl.classList.add('hidden');
      setLoggedIn(true).then(loadAndShow);
    }

    loginBtn.addEventListener('click', doLogin);
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    userInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });
  }

  // ── Logout ───────────────────────────────────────────────
  function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', () => {
      if (!confirm('Sign out of CopyAI?')) return;
      setLoggedIn(false).then(() => {
        cards = []; layouts = []; expandedIds.clear(); searchQuery = '';
        showScreen('login-screen');
        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
      });
    });
  }

  // ── Load from Firestore and show main UI ─────────────────
  async function loadAndShow() {
    showScreen('loading-screen');
    try {
      const data = await firestoreLoad();
      cards   = data.cards   || [];
      layouts = data.layouts || [];
      showScreen('main-app');
      render();
    } catch {
      // Firestore unavailable — fall back to empty state, still show app
      showScreen('main-app');
      showToast('⚠ Could not load from cloud — check connection');
      render();
    }
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    setupLogin();
    setupLogout();
    setupAddPrompt();
    setupSaveLayout();
    setupLibrary();
    setupEdit();
    setupSearch();
    setupKeyboard();

    const loggedIn = await isLoggedIn();
    if (loggedIn) {
      await loadAndShow();
    } else {
      showScreen('login-screen');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
