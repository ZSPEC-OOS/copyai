// sidebar.js — CopyAI Browser Extension Sidebar Logic
// Uses chrome.storage.local instead of Firebase — no network needed.
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let cards = [];
  let layouts = [];
  let editingId = null;
  let searchQuery = '';
  let addOpen = false;
  let expandedIds = new Set();
  let currentLayoutId = null;
  let currentLayoutTitle = '';
  let reorganizing = false;
  let dragSrcIdx = null;

  // ── Storage ──────────────────────────────────────────────
  function loadData() {
    chrome.storage.local.get(['cards', 'layouts'], (result) => {
      cards = result.cards || [];
      layouts = result.layouts || [];
      render();
    });
  }

  function saveCards() {
    chrome.storage.local.set({ cards });
  }

  function saveLayouts() {
    chrome.storage.local.set({ layouts });
  }

  // Listen for storage changes from other extension pages (if any)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    if (changes.cards) { cards = changes.cards.newValue || []; changed = true; }
    if (changes.layouts) { layouts = changes.layouts.newValue || []; changed = true; }
    if (changed) render();
  });

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
    let attempt = t;
    let n = 2;
    while (titles.has(attempt)) { attempt = t + '-' + n; n++; }
    return attempt;
  }

  function needsClamp(text) {
    if (!text) return false;
    return text.split(/\r?\n/).length > 3 || text.length > 200;
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    // restart animation
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2000);
  }

  async function copyText(text) {
    if (!text) { showToast('Nothing to copy'); return; }
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ Copied to clipboard');
    } catch {
      // Fallback for environments where clipboard API isn't available
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

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Render ───────────────────────────────────────────────
  function render() {
    renderHeader();
    renderPrompts();
  }

  function renderHeader() {
    const countBadge = document.getElementById('prompt-count');
    const libLabel = document.getElementById('lib-label');
    const libModalCount = document.getElementById('lib-modal-count');
    const saveBtnLabel = document.getElementById('save-btn-label');

    if (countBadge) {
      if (cards.length > 0) {
        countBadge.textContent = `${cards.length} prompt${cards.length !== 1 ? 's' : ''}`;
        countBadge.style.display = '';
      } else {
        countBadge.style.display = 'none';
      }
    }

    if (libLabel) {
      libLabel.textContent = layouts.length > 0
        ? `Library (${layouts.length})`
        : 'Library';
    }

    if (libModalCount) {
      libModalCount.textContent = layouts.length;
      libModalCount.style.display = layouts.length > 0 ? '' : 'none';
    }

    if (saveBtnLabel) {
      saveBtnLabel.textContent = currentLayoutId ? 'Save' : 'Save Layout';
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) saveBtn.title = currentLayoutId ? `Update "${currentLayoutTitle}"` : 'Save current prompts as a layout';
    }
  }

  function renderPrompts() {
    const container = document.getElementById('prompts-container');
    const labelRow = document.getElementById('prompts-label-row');
    const reorgBtn = document.getElementById('reorganize-btn');
    if (!container) return;

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? cards.filter(c =>
          c.title.toLowerCase().includes(query) ||
          c.text.toLowerCase().includes(query)
        )
      : cards;

    if (labelRow) labelRow.style.display = filtered.length > 0 ? 'flex' : 'none';

    // Show reorganize button only when there are multiple cards and no active search
    if (reorgBtn) {
      reorgBtn.style.display = cards.length > 1 && !query ? '' : 'none';
      reorgBtn.textContent = reorganizing ? '✓ Done' : '⇅ Reorganize';
      reorgBtn.className = reorganizing ? 'btn-accent btn-sm' : 'btn-default btn-sm';
    }

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">✦</div>' +
          '<div class="empty-text">' +
            (query
              ? 'No prompts match your search.'
              : 'No prompts yet.<br>Add one above to get started.'
            ) +
          '</div>' +
        '</div>';
      return;
    }

    container.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'prompts-list';
    filtered.forEach((card, idx) => list.appendChild(buildCard(card, idx)));
    container.appendChild(list);

    // Set up drag-and-drop on the list if reorganizing
    if (reorganizing && !query) {
      setupDragAndDrop(list);
    }
  }

  function setupDragAndDrop(list) {
    let srcIdx = null;
    const items = list.querySelectorAll('.prompt-card');
    items.forEach((el, idx) => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', () => {
        srcIdx = idx;
        el.style.opacity = '0.4';
      });
      el.addEventListener('dragend', () => {
        el.style.opacity = '';
        srcIdx = null;
        items.forEach(i => i.style.border = '');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        items.forEach((i, ii) => {
          i.style.border = ii === idx && ii !== srcIdx ? '2px solid #8b5cf6' : '';
        });
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (srcIdx === null || srcIdx === idx) return;
        const next = [...cards];
        const [moved] = next.splice(srcIdx, 1);
        next.splice(idx, 0, moved);
        cards = next;
        saveCards();
        renderPrompts();
      });
    });
  }

  function buildCard(card, idx) {
    const isExpanded = expandedIds.has(card.id);
    const showToggle = needsClamp(card.text) || isExpanded;

    const div = document.createElement('div');
    div.className = 'prompt-card';
    if (reorganizing) {
      div.style.cursor = 'grab';
    }

    // Drag handle (reorganize mode)
    if (reorganizing) {
      const handle = document.createElement('div');
      handle.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#6b7280;user-select:none;font-size:12px';
      handle.innerHTML = '<span style="font-size:16px;line-height:1">⠿</span><span>Drag to reorder</span>';
      div.appendChild(handle);
    }

    // Copy badge (only when not reorganizing)
    if (!reorganizing) {
      const badge = document.createElement('span');
      badge.className = 'copy-badge';
      badge.textContent = 'Copy';
      div.appendChild(badge);
    }

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'prompt-title';
    titleEl.title = card.title || 'Untitled';
    titleEl.textContent = card.title || 'Untitled';
    div.appendChild(titleEl);

    // Text preview
    const textEl = document.createElement('div');
    textEl.className = 'prompt-text' + (isExpanded ? ' expanded' : '') + (!card.text ? ' empty' : '');
    textEl.textContent = card.text || '(empty)';
    div.appendChild(textEl);

    // Action buttons row
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
        saveCards();
        render();
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

    // Click card body → copy text (disabled in reorganize mode)
    div.addEventListener('click', (e) => {
      if (reorganizing) return;
      if (e.target.closest('button')) return;
      copyText(card.text);
    });

    return div;
  }

  // ── Library Render ───────────────────────────────────────
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
        currentLayoutId = l.id;
        currentLayoutTitle = l.title;
        reorganizing = false;
        expandedIds.clear();
        saveCards();
        render();
        closeLibrary();
        showToast(`Opened: ${l.title}`);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm(`Delete layout "${l.title}"?`)) {
          layouts = layouts.filter(x => x.id !== l.id);
          saveLayouts();
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

  // ── Add Prompt ───────────────────────────────────────────
  function setupAddPrompt() {
    const toggle = document.getElementById('add-toggle');
    const form = document.getElementById('add-form');
    const titleInput = document.getElementById('new-title');
    const textInput = document.getElementById('new-text');
    const addBtn = document.getElementById('add-btn');

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
      textInput.value = '';
      titleInput.focus();
      saveCards();
      render();
      showToast('✓ Prompt added');
    }

    addBtn.addEventListener('click', doAdd);
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
    });
  }

  // ── Save Layout ──────────────────────────────────────────
  function doNewLayout() {
    if (cards.length === 0) { showToast('No prompts to save'); return; }
    const base = prompt('Layout name:', '');
    if (base === null) return; // user cancelled
    const title = nextUniqueTitle(base);
    const id = 'L' + Date.now();
    layouts.push({ id, title, savedAt: Date.now(), cards: [...cards] });
    currentLayoutId = id;
    currentLayoutTitle = title;
    saveLayouts();
    renderHeader();
    showToast(`✓ Created: ${title}`);
  }

  function setupSaveLayout() {
    document.getElementById('save-btn').addEventListener('click', () => {
      if (cards.length === 0) { showToast('No prompts to save'); return; }
      if (currentLayoutId) {
        // Update existing layout in-place
        layouts = layouts.map(l =>
          l.id === currentLayoutId ? { ...l, cards: [...cards], savedAt: Date.now() } : l
        );
        saveLayouts();
        renderHeader();
        showToast(`✓ Saved: ${currentLayoutTitle}`);
      } else {
        doNewLayout();
      }
    });

    document.getElementById('new-layout-btn').addEventListener('click', doNewLayout);
  }

  // ── Library Modal ────────────────────────────────────────
  function openLibrary() {
    renderLibrary();
    document.getElementById('library-modal').classList.remove('hidden');
  }

  function closeLibrary() {
    document.getElementById('library-modal').classList.add('hidden');
  }

  function setupLibrary() {
    document.getElementById('library-btn').addEventListener('click', openLibrary);
    document.getElementById('close-library').addEventListener('click', closeLibrary);

    // Close on backdrop click
    document.getElementById('library-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeLibrary();
    });

    // Export current cards as JSON file
    document.getElementById('export-layout-btn').addEventListener('click', () => {
      if (cards.length === 0) { showToast('No prompts to export'); return; }
      const blob = new Blob([JSON.stringify({ cards }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prompts.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('✓ Layout exported');
    });

    // Export full library to clipboard
    document.getElementById('export-library-btn').addEventListener('click', () => {
      if (layouts.length === 0) { showToast('No layouts to export'); return; }
      const payload = JSON.stringify({ layouts }, null, 2);
      navigator.clipboard.writeText(payload)
        .then(() => showToast('✓ Library copied to clipboard'))
        .catch(() => showToast('⚠ Copy failed'));
    });

    // Import a layout JSON file
    document.getElementById('import-layout-input').addEventListener('change', (e) => {
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
        saveCards();
        render();
        closeLibrary();
        showToast('✓ Layout imported');
        e.target.value = '';
      }).catch(() => showToast('⚠ Failed to read file'));
    });

    // Import a library JSON file (merges with existing)
    document.getElementById('import-library-input').addEventListener('change', (e) => {
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
          return {
            id: 'L' + Date.now() + '_' + li,
            title: attempt,
            savedAt: Number.isFinite(+l?.savedAt) ? +l.savedAt : Date.now() - li,
            cards: cardsArr,
          };
        });
        if (normalized.length === 0) { showToast('No layouts found in file'); return; }
        layouts.push(...normalized);
        saveLayouts();
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
    document.getElementById('edit-text').value = card.text;
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-title').focus();
  }

  function closeEdit() {
    editingId = null;
    document.getElementById('edit-modal').classList.add('hidden');
  }

  function setupEdit() {
    document.getElementById('close-edit').addEventListener('click', closeEdit);
    document.getElementById('edit-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEdit();
    });

    document.getElementById('save-edit-btn').addEventListener('click', () => {
      if (!editingId) return;
      const t = document.getElementById('edit-title').value.trim() || 'Untitled';
      const x = document.getElementById('edit-text').value;
      cards = cards.map(c => c.id === editingId ? { ...c, title: t, text: x } : c);
      saveCards();
      render();
      closeEdit();
      showToast('✓ Saved');
    });

    // Save on Ctrl/Cmd + Enter inside edit textarea
    document.getElementById('edit-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.getElementById('save-edit-btn').click();
      }
    });
  }

  // ── Search ───────────────────────────────────────────────
  function setupSearch() {
    document.getElementById('search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderPrompts();
    });
  }

  // ── Keyboard shortcuts ───────────────────────────────────
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Escape closes any open modal
      if (e.key === 'Escape') {
        if (!document.getElementById('library-modal').classList.contains('hidden')) {
          closeLibrary(); return;
        }
        if (!document.getElementById('edit-modal').classList.contains('hidden')) {
          closeEdit(); return;
        }
      }
    });
  }

  // ── Reorganize ───────────────────────────────────────────
  function setupReorganize() {
    document.getElementById('reorganize-btn').addEventListener('click', () => {
      reorganizing = !reorganizing;
      renderPrompts();
    });
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    setupAddPrompt();
    setupSaveLayout();
    setupLibrary();
    setupEdit();
    setupSearch();
    setupKeyboard();
    setupReorganize();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
