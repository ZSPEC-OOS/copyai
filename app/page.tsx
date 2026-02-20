'use client';

import Image from 'next/image';
import type React from 'react';
import { useEffect, useState, useRef } from 'react';

/** ---------------- Types (expanded to support tags & pinning) ---------------- */
type Card = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  tags?: string[];
};

type LayoutEntry = {
  id: string;
  title: string;
  savedAt: number; // epoch ms
  cards: Card[];
  tags?: string[];
  isPinned?: boolean;
};

/** ---------------- Theme tokens (from your existing page) ---------------- */
const BG = 'var(--bg)';
const PANEL = 'var(--panel)';
const SURFACE = 'var(--surface)';
const BORDER = 'var(--border)';
const TEXT = 'var(--text)';
const ACCENT = 'var(--accent)';

// Shared font size for modal header buttons
const BUTTON_FONT_SIZE = 14;

// Uniform style so label-based "buttons" match actual <button> elements
const LIB_BTN_STYLE: React.CSSProperties = {
  background: PANEL,
  color: TEXT,
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontSize: BUTTON_FONT_SIZE,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1.2,
  boxSizing: 'border-box',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
};

export default function Page() {
  // ----------- State: cards on the page -----------
  const [cards, setCards] = useState<Card[]>(() => {
    try {
      const raw = localStorage.getItem('copyai_cards');
      if (raw) return JSON.parse(raw) as Card[];
    } catch {}
    return []; // start empty; you add prompts
  });

  // Layout title (kept for logic; not displayed)
  const [currentLayoutTitle, setCurrentLayoutTitle] = useState<string>('');

  // Add form
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');

  // ----------- State: Library (saved layouts) -----------
  const [layouts, setLayouts] = useState<LayoutEntry[]>(() => {
    try {
      const raw = localStorage.getItem('copyai_layouts');
      if (raw) return JSON.parse(raw) as LayoutEntry[];
    } catch {}
    return [];
  });
  const [showLibrary, setShowLibrary] = useState(false);
  // --- Library Editor overlay toggle ---
const [showLibraryEditor, setShowLibraryEditor] = useState(false);

// Optional: if you don't have undo/redo wiring yet, keep these no-ops / placeholders
const history: LayoutEntry[][] = [];
const future: LayoutEntry[][] = [];
function snapshotLayouts() { /* no-op for now */ }
function undoLayouts() { /* no-op for now */ }
function redoLayouts() { /* no-op for now */ }

  // ----------- NEW: Library Editor overlay + Undo/Redo stacks -----------
  const [showLibraryEditor, setShowLibraryEditor] = useState(false);
  const [history, setHistory] = useState<LayoutEntry[][]>([]);
  const [future, setFuture] = useState<LayoutEntry[][]>([]);

  function deepCloneLayouts(src: LayoutEntry[]): LayoutEntry[] {
    return src.map(l => ({
      ...l,
      cards: l.cards.map(c => ({ ...c }))
    }));
  }

  function snapshotLayouts() {
    // Push current layouts before a mutating action
    setHistory((h) => [...h, deepCloneLayouts(layouts)]);
    // New action invalidates redo stack
    setFuture([]);
  }

  function undoLayouts() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [deepCloneLayouts(layouts), ...f]);
      setLayouts(deepCloneLayouts(prev));
      return h.slice(0, -1);
    });
  }

  function redoLayouts() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, deepCloneLayouts(layouts)]);
      setLayouts(deepCloneLayouts(next));
      return f.slice(1);
    });
  }

  function touchSavedAt(id: string) {
    setLayouts(prev => prev.map(l => l.id === id ? { ...l, savedAt: Date.now() } : l));
  }

  // ----------- UI state: temporary expand/collapse per card -----------
  // Not persisted; resets on reload.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Persist page cards + layouts
  useEffect(() => {
    try { localStorage.setItem('copyai_cards', JSON.stringify(cards)); } catch {}
  }, [cards]);
  useEffect(() => {
    try { localStorage.setItem('copyai_layouts', JSON.stringify(layouts)); } catch {}
  }, [layouts]);

  // ----------- Utilities -----------
  function toast(msg: string, ms = 1200) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      background: SURFACE,
      color: TEXT,
      border: `1px solid ${BORDER}`,
      borderRadius: '8px',
      padding: '10px 12px',
      zIndex: '9999',
      boxSizing: 'border-box',
      maxWidth: 'calc(100vw - 24px)',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    } as CSSStyleDeclaration);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  async function copyNow(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast('✅ Copied');
    } catch {
      alert('Clipboard failed');
    }
  }

  function nextUniqueTitle(base: string): string {
    const titles = new Set(layouts.map(l => l.title));
    let t = (base.trim() || 'Untitled');
    while (titles.has(t)) t = t + '-2';
    return t;
  }

  function fmt(ts: number) {
    const d = new Date(ts);
    return d.toLocaleString();
  }

  // Heuristic: decide if a text likely exceeds 3 lines and warrants a "Show more"
  function needsClamp(txt: string): boolean {
    if (!txt) return false;
    const lineCount = txt.split(/\r?\n/).length;
    return lineCount > 3 || txt.length > 240; // simple, layout-free heuristic
  }

  // ----------- Page actions: Add / Edit / Delete cards -----------
  function addCard() {
    const t = title.trim();
    const x = text.trim();
    if (!t && !x) {
      toast('Enter a title or text first');
      return;
    }
    const id = 'c' + Date.now();
    const newCard: Card = { id, title: t || 'Untitled', text: x, createdAt: Date.now() };
    // Append to bottom
    setCards(prev => [...prev, newCard]);
    setTitle('');
    setText('');
    toast('➕ Added (to bottom)');
  }

  function startEdit(id: string) {
    const c = cards.find(c => c.id === id);
    if (!c) return;
    setEditingId(id);
    setEditTitle(c.title);
    setEditText(c.text);
  }

  function saveEdit() {
    if (!editingId) return;
    const t = editTitle.trim() || 'Untitled';
    setCards(prev => prev.map(c => c.id === editingId ? { ...c, title: t, text: editText } : c));
    setEditingId(null);
    setEditTitle('');
    setEditText('');
    toast('💾 Saved');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditText('');
  }

  function removeCard(id: string) {
    if (!confirm('Delete this prompt?')) return;
    setCards(prev => prev.filter(c => c.id !== id));
    toast('🗑 Deleted');
  }

  // ----------- Layout actions: Save / Open / Delete -----------
  function saveLayout() {
    if (cards.length === 0) {
      toast('Nothing to save (no prompts yet)');
      return;
    }
    const base = prompt('Layout title:', currentLayoutTitle || '') ?? '';
    const uniqueTitle = nextUniqueTitle(base);
    const entry: LayoutEntry = {
      id: 'L' + Date.now(),
      title: uniqueTitle,
      savedAt: Date.now(),
      cards
    };
    setLayouts(prev => [...prev, entry]);
    setCurrentLayoutTitle(uniqueTitle);
    toast(`💾 Saved layout: ${uniqueTitle}`);
  }

  function openLayout(id: string) {
    const lay = layouts.find(l => l.id === id);
    if (!lay) return;
    setCards(lay.cards);
    setCurrentLayoutTitle(lay.title);
    setShowLibrary(false);
    setExpanded(new Set()); // reset temp expansion on open
    toast(`📂 Opened: ${lay.title}`);
  }

  function deleteLayout(id: string) {
    const lay = layouts.find(l => l.id === id);
    if (!lay) return;
    if (!confirm(`Delete layout?\n\n${lay.title}`)) return;
    setLayouts(prev => prev.filter(l => l.id !== id));
    toast('🗑 Layout deleted');
  }

  // ----------- Import/Export (inside Library) -----------
  function exportJSON() {
    const blob = new Blob([JSON.stringify({ cards }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'prompts.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // UPDATED: Export Library preserving tags & isPinned
  function exportLibrary() {
    const payload = JSON.stringify({ layouts }, null, 2);

    // Primary: modern clipboard API
    navigator.clipboard.writeText(payload)
      .then(() => {
        toast('✅ Library copied to clipboard');
      })
      .catch(() => {
        // Fallback: create a hidden textarea and copy via execCommand
        try {
          const ta = document.createElement('textarea');
          ta.value = payload;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.setAttribute('readonly', 'true');
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('✅ Library copied to clipboard');
        } catch {
          // Last resort: show an alert so user can copy manually
          alert('Copy failed. Your browser may block clipboard access.\n\nHere is the library JSON so you can copy it manually:\n\n' + payload);
        }
      });
  }

  // UPDATED: Import Library preserving tags & isPinned and using snapshots for undo
  function importLibrary(file: File) {
    file.text().then(t => {
      let data: any;
      try {
        data = JSON.parse(t);
      } catch {
        alert('Invalid JSON');
        return;
      }

      // Accept common shapes:
      // - { layouts: [...] }
      // - [ ... ] (array of layouts)
      const incoming = Array.isArray(data) ? data : data?.layouts;
      if (!Array.isArray(incoming)) {
        alert('Invalid library file (expected { "layouts": [...] })');
        return;
      }

      // Build a set of existing titles to avoid collisions
      const existingTitles = new Set(layouts.map(l => l.title));

      const normalized: LayoutEntry[] = incoming.map((l: any, li: number) => {
        // normalize cards
        const cardsArr: Card[] = Array.isArray(l?.cards) ? l.cards.map((c: any, i: number) => ({
          id: String(c?.id ?? 'c' + Date.now() + '_' + li + '_' + i),
          title: String(c?.title ?? 'Untitled'),
          text: String(c?.text ?? ''),
          createdAt: Number.isFinite(+c?.createdAt) ? +c.createdAt : (Date.now() - i),
          tags: Array.isArray(c?.tags) ? c.tags.map(String) : []
        })) : [];

        // Sort oldest->newest
        cardsArr.sort((a, b) => a.createdAt - b.createdAt);

        // Title uniqueness across existing + within this import
        let baseTitle = String(l?.title ?? 'Untitled');
        let uniqueTitle = baseTitle.trim() || 'Untitled';
        while (existingTitles.has(uniqueTitle)) uniqueTitle = uniqueTitle + '-2';
        existingTitles.add(uniqueTitle);

        const savedAt = Number.isFinite(+l?.savedAt) ? +l.savedAt : Date.now() - li;

        return {
          id: 'L' + Date.now() + '_' + li,
          title: uniqueTitle,
          savedAt,
          cards: cardsArr,
          tags: Array.isArray(l?.tags) ? l.tags.map(String) : [],
          isPinned: Boolean(l?.isPinned)
        };
      });

      if (normalized.length === 0) {
        toast('ℹ️ No layouts found in file');
        return;
      }

      snapshotLayouts();
      setLayouts(prev => [...prev, ...normalized]);
      toast(`📚 Imported ${normalized.length} layout${normalized.length > 1 ? 's' : ''}`);
    }).catch(() => alert('Failed to read file'));
  }

  // ----------- Styles for preview clamping (3 lines) -----------
  const LINE_HEIGHT = 1.4; // visual line-height multiplier
  const PREVIEW_LINES = 3;
  const PREVIEW_HEIGHT = `calc(${LINE_HEIGHT}em * ${PREVIEW_LINES})`;

  // Collapsed preview: fixed height (equal for all), 3 lines visible, rest hidden
  const previewCollapsedStyle: React.CSSProperties = {
    whiteSpace: 'pre-line',
    display: '-webkit-box',
    WebkitLineClamp: PREVIEW_LINES as unknown as number,
    WebkitBoxOrient: 'vertical' as unknown as 'vertical',
    overflow: 'hidden',
    lineHeight: LINE_HEIGHT as unknown as string,
    height: PREVIEW_HEIGHT,
    opacity: 1,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  };

  // Expanded view: full text
  const previewExpandedStyle: React.CSSProperties = {
    whiteSpace: 'pre-wrap',
    display: 'block',
    overflow: 'visible',
    lineHeight: LINE_HEIGHT as unknown as string,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  };

  /** ---------------- Optional: global keyboard shortcuts for undo/redo ---------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z') {
        e.preventDefault();
        undoLayouts();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redoLayouts();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);
  // ----------- Render -----------
  return (
    <div
      style={{
        minHeight: '100svh',
        padding: 12,
        overflowX: 'hidden', // vertical scroll only
        boxSizing: 'border-box',
        maxWidth: '100%',
      }}
    >
      {/* Header / Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '8px 4px',
          boxSizing: 'border-box',
          maxWidth: '100%',
          overflow: 'hidden'
        }}
      >
        {/* Logo + App Name (CopyAI visible) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image
            src="/copyai_logo.png"
            alt="CopyAI logo"
            width={22}
            height={22}
            priority
            style={{ display: 'block' }}
          />
          <div style={{ fontWeight: 700, fontSize: 20 }}>
            CopyAI
          </div>
        </div>

        {/* Spacer pushes the buttons to the right */}
        <div style={{ marginLeft: 'auto' }} />

        {/* Primary actions aligned to the right */}
        <button
          onClick={saveLayout}
          style={{ background: ACCENT, color: '#fff', padding: '8px 12px', borderRadius: 8 }}
          title="Save current list as a layout in the Library"
        >
          💾 Save Layout
        </button>

        <button
          onClick={() => setShowLibrary(true)}
          style={{ background: PANEL, color: TEXT, padding: '8px 12px', borderRadius: 8 }}
          title="Open Library"
        >
          📚 Library
        </button>
      </div>

      {/* Add Form */}
      <div
        style={{
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 16,
          display: 'grid',
          gap: 10,
          marginBottom: 16,
          boxSizing: 'border-box',
          maxWidth: '100%',
          overflow: 'hidden' // ensures rounded corners are always respected
        }}
      >
        {/* No section title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g., Outreach – Follow-up #1)"
          style={{
            width: '100%',
            background: SURFACE,
            color: TEXT,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '10px',
            boxSizing: 'border-box',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prompt text…"
          rows={5}
          style={{
            width: '100%',
            resize: 'vertical',
            background: SURFACE,
            color: TEXT,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 10,
            boxSizing: 'border-box',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        />

        <div>
          <button
            onClick={addCard}
            style={{ background: ACCENT, color: '#fff', padding: '10px 14px', borderRadius: 8 }}
          >
            ➕ Add (goes to bottom)
          </button>
        </div>
      </div>

      {/* Vertical List (oldest first, newest last) */}
      <div style={{ display: 'grid', gap: 12, overflowX: 'hidden', boxSizing: 'border-box', maxWidth: '100%' }}>
        {cards.length === 0 && (
          <div style={{ opacity: .7, textAlign: 'center' }}>(No prompts yet — add one above)</div>
        )}

        {cards.map((c) => {
          const isEditing = editingId === c.id;
          const isExpanded = expanded.has(c.id);
          const showToggle = needsClamp(c.text) || isExpanded;

          return (
            <div
              key={c.id}
              onClick={(e) => {
                if (isEditing) return;
                if ((e.target as HTMLElement).closest('[data-nocopy]')) return;
                // Copy full text on card click (primary behavior)
                copyNow(c.text);
              }}
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 12,
                boxSizing: 'border-box',
                maxWidth: '100%',
                // Critical: Clip children so rounded corners are always respected
                overflow: 'hidden'
              }}
            >
              {isEditing ? (
                <div style={{ display: 'grid', gap: 8, boxSizing: 'border-box', maxWidth: '100%' }}>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                    style={{
                      width: '100%',
                      background: BG,
                      color: TEXT,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      boxSizing: 'border-box',
                      maxWidth: '100%',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word'
                    }}
                  />
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Text"
                    rows={5}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      background: BG,
                      color: TEXT,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      padding: 10,
                      boxSizing: 'border-box',
                      maxWidth: '100%',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word'
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveEdit} style={{ background: ACCENT, color: '#fff', padding: '8px 12px', borderRadius: 8 }} data-nocopy>
                      Save
                    </button>
                    <button onClick={cancelEdit} style={{ background: PANEL, color: TEXT, padding: '8px 12px', borderRadius: 8 }} data-nocopy>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6, boxSizing: 'border-box', maxWidth: '100%' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      boxSizing: 'border-box',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                    title={c.title || 'Untitled'}
                  >
                    {c.title || 'Untitled'}
                  </div>

                  {/* Text + bottom-right toggle container */}
                  <div
                    style={{
                      position: 'relative',
                      boxSizing: 'border-box',
                      maxWidth: '100%',
                      // Ensure toggle never sits outside rounded clipping
                      paddingBottom: showToggle ? 28 : 0
                    }}
                  >
                    <div
                      style={{
                        ...(isExpanded ? previewExpandedStyle : previewCollapsedStyle),
                        opacity: c.text ? 1 : .6
                      }}
                    >
                      {c.text || '(empty)'}
                    </div>

                    {showToggle && (
                      <button
                        data-nocopy
                        onClick={(e) => {
                          e.stopPropagation(); // do not copy text when toggling
                          toggleExpanded(c.id);
                        }}
                        aria-label={isExpanded ? 'Show less' : 'Show more'}
                        title={isExpanded ? 'Show less' : 'Show more'}
                        style={{
                          position: 'absolute',
                          right: 8, // inset to keep away from the clipped edge
                          bottom: 8, // inset to keep away from the clipped edge
                          background: PANEL,
                          color: TEXT,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 12,
                          lineHeight: 1.4,
                          cursor: 'pointer',
                          maxWidth: 'calc(100% - 16px)',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <button onClick={() => startEdit(c.id)} style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8 }} data-nocopy>
                      Edit
                    </button>
                    <button onClick={() => removeCard(c.id)} style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8 }} data-nocopy>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Library Modal (with Import/Export inside) */}
      {showLibrary && (
        <div
          onClick={() => setShowLibrary(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            display: 'grid', placeItems: 'center', zIndex: 10000,
            boxSizing: 'border-box',
            maxWidth: '100%',
            overflow: 'hidden'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              width: 'min(720px, 92vw)',
              maxHeight: '80vh',
              // Scroll stays inside rounded container:
              overflow: 'auto',
              padding: '16px 14px 16px',
              boxSizing: 'border-box',
              maxWidth: '92vw',
              // Clip to preserve rounded corners at all times
              overflowClipMargin: '0px', // harmless if unsupported
              overflowX: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'space-between',
                marginBottom: 10,
                flexWrap: 'wrap',
                rowGap: 8,
                boxSizing: 'border-box',
                maxWidth: '100%'
              }}
            >
              {/* Left cluster: Import / Export Current Layout / Import Library / Export Library */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', boxSizing: 'border-box', maxWidth: '100%' }}>
                {/* Import current layout (cards) */}
                <label
                  style={LIB_BTN_STYLE}
                  title="Import a layout (JSON file with cards)"
                >
                  Import Layout From File
                  <input
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => e.target.files && importJSON(e.target.files[0])}
                  />
                </label>

                {/* Export current layout (cards) */}
                <button
                  onClick={exportJSON}
                  style={LIB_BTN_STYLE}
                  title="Export current layout as JSON"
                >
                  Export Current Layout
                </button>

                {/* NEW: Import Library (layouts) — placed to the LEFT of Export Library */}
                <label
                  style={LIB_BTN_STYLE}
                  title="Import a saved library (JSON with layouts)"
                >
                  Import Library From File
                  <input
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => e.target.files && importLibrary(e.target.files[0])}
                  />
                </label>

                {/* Export Library (layouts) */}
                <button
                  onClick={exportLibrary}
                  style={LIB_BTN_STYLE}
                  title="Export all saved layouts as JSON"
                >
                  Export Library
                </button>
              </div>

              {/* Right cluster: Library Editor + Close */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowLibraryEditor(true)}
                  style={{
                    background: PANEL,
                    color: TEXT,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: BUTTON_FONT_SIZE
                  }}
                  title="Open Library Editor"
                >
                  Library Editor
                </button>
                <button
                  onClick={() => setShowLibrary(false)}
                  style={{
                    background: ACCENT,
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: BUTTON_FONT_SIZE
                  }}
                  title="Close library"
                >
                  Close
                </button>
              </div>
            </div>

            {layouts.length === 0 && <div style={{ opacity: .7 }}>(Library is empty)</div>}

            <div style={{ display: 'grid', gap: 8 }}>
              {layouts.map(l => (
                <div
                  key={l.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',               // inset so buttons don't touch the rounded edge
                    borderBottom: `1px solid ${BORDER}`,
                    borderRadius: 8,                    // optional: softens row corners visually
                    boxSizing: 'border-box',
                    width: '100%',
                    gap: 8,
                    overflow: 'hidden'                  // prevents accidental horizontal overflow within row
                  }}
                >
                  {/* Left block: title + timestamp (flexible, shrinks as needed) */}
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={l.title}
                    >
                      {l.title}
                    </div>
                    <div style={{ opacity: .6, fontSize: 12 }}>Saved: {fmt(l.savedAt)}</div>
                  </div>

                  {/* Right block: buttons (fixed width) */}
                  <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                    <button
                      onClick={() => openLayout(l.id)}
                      style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8 }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => deleteLayout(l.id)}
                      style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* NEW: Library Editor Overlay (mobile-first) */}
      {showLibraryEditor && (
        <LibraryEditor
          layouts={layouts}
          setLayouts={(updater) => {
            snapshotLayouts();
            setLayouts(typeof updater === 'function' ? (updater as any)(layouts) : updater);
          }}
          onOpen={(id) => {
            openLayout(id);
            setShowLibraryEditor(false);
          }}
          onClose={() => setShowLibraryEditor(false)}
          undo={undoLayouts}
          redo={redoLayouts}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          exportLibrary={exportLibrary}
          importLibraryFile={importLibrary}
          colors={{ BG, PANEL, SURFACE, BORDER, TEXT, ACCENT }}
        />
      )}
    </div>
  );
}
/** ---------------------------------------------------------------
 * Library Editor Overlay
 * - Search/filter across titles, tags, and card titles
 * - Inline editing (layout title, card title/text)
 * - Pin, duplicate, delete, open
 * - Drag & drop reorder (layouts; cards within layout)
 * - Undo/Redo wiring provided by parent
 * --------------------------------------------------------------- */
function LibraryEditor(props: {
  layouts: LayoutEntry[];
  setLayouts: React.Dispatch<React.SetStateAction<LayoutEntry[]>>;
  onOpen: (layoutId: string) => void;
  onClose: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportLibrary: () => void;
  importLibraryFile: (file: File) => void;
  colors: { BG: string; PANEL: string; SURFACE: string; BORDER: string; TEXT: string; ACCENT: string; };
}) {
  const { layouts, setLayouts, onOpen, onClose, undo, redo, canUndo, canRedo, exportLibrary, importLibraryFile, colors } = props;

  // Mobile-first editor state
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()); // per-layout card list toggle

  // Auto-save “heartbeat” to mirror desktop’s auto-save intent (localStorage is already persisted by parent)
  useEffect(() => {
    const t = setInterval(() => {/* noop: parent already persists via useEffect */}, 30000);
    return () => clearInterval(t);
  }, []);

  const filtered = layouts
    .slice()
    .sort((a, b) => {
      // Pinned first, then by savedAt desc
      const ap = a.isPinned ? 1 : 0;
      const bp = b.isPinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.savedAt - a.savedAt;
    })
    .filter(l => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = [
        l.title,
        ...(l.tags || []),
        ...l.cards.flatMap(c => [c.title, ...(c.tags || [])])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function renameLayout(id: string, title: string) {
    setLayouts(prev => prev.map(l => l.id === id ? { ...l, title: (title || 'Untitled').slice(0, 200), savedAt: Date.now() } : l));
  }

  function togglePin(id: string) {
    setLayouts(prev => prev.map(l => l.id === id ? { ...l, isPinned: !l.isPinned, savedAt: Date.now() } : l));
  }

  function duplicateLayout(id: string) {
    setLayouts(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const cloned: LayoutEntry = {
        ...src,
        id: 'L' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: `${src.title} (Copy)`,
        savedAt: Date.now(),
        cards: src.cards.map(c => ({
          ...c,
          id: 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          createdAt: Date.now()
        }))
      };
      const next = prev.slice();
      next.splice(idx + 1, 0, cloned);
      return next;
    });
  }

  function deleteLayout(id: string) {
    if (!confirm('Delete this layout?')) return;
    setLayouts(prev => prev.filter(l => l.id !== id));
  }

  // --- Drag & Drop for layouts ---
  const dragLayoutId = useRef<string | null>(null);
  function onLayoutDragStart(e: React.DragEvent, id: string) {
    dragLayoutId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onLayoutDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onLayoutDrop(e: React.DragEvent, overId: string) {
    e.preventDefault();
    const fromId = dragLayoutId.current;
    dragLayoutId.current = null;
    if (!fromId || fromId === overId) return;
    // Reorder in the filtered view while preserving non-filtered relative order:
    setLayouts(prev => {
      // Build visible ids list based on current filter/sort
      const vis = filtered.map(l => l.id);
      const from = vis.indexOf(fromId);
      const to = vis.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return prev;

      // Map: visible ids to actual layouts in their new visible order
      const reorderedVisible = vis.slice();
      const [moved] = reorderedVisible.splice(from, 1);
      reorderedVisible.splice(to, 0, moved);

      // Stitch: walk original array, replace visible ones in that sequence, keep invisible in place
      const visibleSet = new Set(vis);
      const byId = new Map(prev.map(l => [l.id, l]));
      const iterator = reorderedVisible.values();
      const next: LayoutEntry[] = [];
      for (const layout of prev) {
        if (visibleSet.has(layout.id)) {
          const nid = iterator.next().value as string;
          next.push(byId.get(nid)!);
        } else {
          next.push(layout);
        }
      }
      return next;
    });
  }

  // --- Card helpers ---
  function addCard(layoutId: string) {
    setLayouts(prev => prev.map(l => l.id === layoutId ? {
      ...l,
      savedAt: Date.now(),
      cards: [...l.cards, { id: 'c' + Date.now(), title: 'New Card', text: '', createdAt: Date.now(), tags: [] }]
    } : l));
  }

  function updateCard(layoutId: string, cardId: string, patch: Partial<Card>) {
    setLayouts(prev => prev.map(l => {
      if (l.id !== layoutId) return l;
      return {
        ...l,
        savedAt: Date.now(),
        cards: l.cards.map(c => c.id === cardId ? { ...c, ...patch } : c)
      };
    }));
  }

  function deleteCard(layoutId: string, cardId: string) {
    if (!confirm('Delete this card?')) return;
    setLayouts(prev => prev.map(l => l.id === layoutId ? {
      ...l,
      savedAt: Date.now(),
      cards: l.cards.filter(c => c.id !== cardId)
    } : l));
  }

  // Drag & Drop for cards (within a layout)
  const dragCard = useRef<{ layoutId: string; cardId: string } | null>(null);
  function onCardDragStart(e: React.DragEvent, layoutId: string, cardId: string) {
    dragCard.current = { layoutId, cardId };
    e.dataTransfer.effectAllowed = 'move';
  }
  function onCardDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function onCardDrop(e: React.DragEvent, overLayoutId: string, overCardId: string) {
    e.preventDefault();
    const payload = dragCard.current;
    dragCard.current = null;
    if (!payload) return;
    const { layoutId: fromL, cardId: fromC } = payload;
    setLayouts(prev => {
      // Only support reordering within the same layout for now (could extend across layouts)
      if (fromL !== overLayoutId) return prev;
      return prev.map(l => {
        if (l.id !== fromL) return l;
        const ids = l.cards.map(c => c.id);
        const fromIdx = ids.indexOf(fromC);
        const toIdx = ids.indexOf(overCardId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return l;
        const nextCards = l.cards.slice();
        const [moved] = nextCards.splice(fromIdx, 1);
        nextCards.splice(toIdx, 0, moved);
        return { ...l, cards: nextCards, savedAt: Date.now() };
      });
    });
  }

  // Styles
  const WRAP: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 10050, display: 'grid', gridTemplateRows: 'auto 1fr',
    background: colors.BG
  };
  const HDR: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, padding: '10px 12px', background: colors.PANEL, borderBottom: `1px solid ${colors.BORDER}`
  };
  const BTN: React.CSSProperties = {
    background: colors.PANEL, color: colors.TEXT, padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${colors.BORDER}`, fontSize: 14
  };
  const BTN_ACCENT: React.CSSProperties = {
    background: colors.ACCENT, color: '#fff', padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 14
  };
  const TAG: React.CSSProperties = {
    display: 'inline-block', padding: '2px 6px', borderRadius: 6, border: `1px solid ${colors.BORDER}`,
    background: colors.SURFACE, color: colors.TEXT, fontSize: 12
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Library Editor" style={WRAP}>
      {/* Header */}
      <div style={HDR}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button onClick={onClose} style={BTN} aria-label="Close editor">← Back</button>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Library Editor
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layouts, tags, card titles…"
            aria-label="Search"
            style={{
              background: colors.SURFACE, color: colors.TEXT, border: `1px solid ${colors.BORDER}`,
              borderRadius: 8, padding: '8px 10px', minWidth: 160
            }}
          />
          <button onClick={undo} style={{ ...BTN, opacity: canUndo ? 1 : 0.5 }} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button onClick={redo} style={{ ...BTN, opacity: canRedo ? 1 : 0.5 }} disabled={!canRedo} title="Redo (Ctrl+Y)">
            ↷ Redo
          </button>

          <label style={BTN} title="Import Library From File">
            Import
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => e.target.files && importLibraryFile(e.target.files[0])}
            />
          </label>
          <button onClick={exportLibrary} style={BTN} title="Export Library">Export</button>
          <button onClick={onClose} style={BTN_ACCENT} title="Close">Close</button>
        </div>
      </div>

      {/* Body: list of layouts */}
      <div
        style={{
          overflow: 'auto',
          padding: 12,
          display: 'grid',
          gap: 10,
          alignContent: 'start'
        }}
      >
        {filtered.length === 0 && (
          <div style={{ opacity: .7, textAlign: 'center', padding: 24 }}>
            (No matching layouts)
          </div>
        )}

        {filtered.map(l => {
          const isOpen = expanded.has(l.id);
          return (
            <div
              key={l.id}
              role="group"
              aria-label={`Layout ${l.title}`}
              draggable
              onDragStart={(e) => onLayoutDragStart(e, l.id)}
              onDragOver={onLayoutDragOver}
              onDrop={(e) => onLayoutDrop(e, l.id)}
              style={{
                background: colors.SURFACE,
                border: `1px solid ${colors.BORDER}`,
                borderRadius: 12,
                padding: 10,
                display: 'grid',
                gap: 8
              }}
            >
              {/* Row: Title / meta / actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span title="Drag to reorder" aria-hidden>≡</span>
                <input
                  value={l.title}
                  onChange={(e) => renameLayout(l.id, e.target.value)}
                  onBlur={(e) => renameLayout(l.id, e.target.value.trim())}
                  aria-label="Layout title"
                  style={{
                    flex: 1, minWidth: 0,
                    background: colors.BG, color: colors.TEXT, border: `1px solid ${colors.BORDER}`,
                    borderRadius: 8, padding: '6px 8px', fontWeight: 700
                  }}
                />
                {l.isPinned && <span style={TAG} title="Pinned">📌 Pinned</span>}
                <span style={{ opacity: .6, fontSize: 12 }} title="Last saved">
                  {new Date(l.savedAt).toLocaleString()}
                </span>
              </div>

              {/* Tags (optional) */}
              {l.tags && l.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {l.tags.map((t, i) => <span key={i} style={TAG}>#{t}</span>)}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => togglePin(l.id)} style={BTN}>{l.isPinned ? 'Unpin' : 'Pin'}</button>
                <button onClick={() => onOpen(l.id)} style={BTN_ACCENT}>Open</button>
                <button onClick={() => duplicateLayout(l.id)} style={BTN}>Duplicate</button>
                <button onClick={() => deleteLayout(l.id)} style={BTN}>Delete</button>
                <button onClick={() => toggleExpanded(l.id)} style={BTN}>
                  {isOpen ? 'Hide Cards' : `Show Cards (${l.cards.length})`}
                </button>
              </div>

              {/* Card list */}
              {isOpen && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {l.cards.length === 0 && (
                    <div style={{ opacity: .7, paddingLeft: 22 }}>(No cards)</div>
                  )}
                  {l.cards.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, l.id, c.id)}
                      onDragOver={onCardDragOver}
                      onDrop={(e) => onCardDrop(e, l.id, c.id)}
                      style={{
                        background: colors.BG,
                        border: `1px solid ${colors.BORDER}`,
                        borderRadius: 10,
                        padding: 8,
                        display: 'grid',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span aria-hidden title="Drag to reorder">⋮⋮</span>
                        <input
                          value={c.title}
                          onChange={(e) => updateCard(l.id, c.id, { title: e.target.value.slice(0, 200) })}
                          placeholder="Card title"
                          aria-label="Card title"
                          style={{
                            flex: 1, minWidth: 0,
                            background: colors.SURFACE, color: colors.TEXT, border: `1px solid ${colors.BORDER}`,
                            borderRadius: 8, padding: '6px 8px', fontWeight: 600
                          }}
                        />
                        <button onClick={() => deleteCard(l.id, c.id)} style={BTN} title="Delete card">Delete</button>
                      </div>

                      <textarea
                        value={c.text}
                        onChange={(e) => updateCard(l.id, c.id, { text: e.target.value.slice(0, 50000) })}
                        placeholder="Card text…"
                        aria-label="Card text"
                        rows={4}
                        style={{
                          width: '100%',
                          resize: 'vertical',
                          background: colors.SURFACE,
                          color: colors.TEXT,
                          border: `1px solid ${colors.BORDER}`,
                          borderRadius: 8,
                          padding: 8,
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ opacity: .6, fontSize: 12 }}>
                          Created: {new Date(c.createdAt).toLocaleString()}
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(c.text)}
                          style={BTN}
                          title="Copy card text"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                  <div>
                    <button onClick={() => addCard(l.id)} style={BTN_ACCENT}>+ Add Card</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
``
