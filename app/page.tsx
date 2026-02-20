'use client';

import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Card = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  // Optional extension for future tags
  tags?: string[];
};

type LayoutEntry = {
  id: string;
  title: string;
  savedAt: number; // epoch ms
  cards: Card[];
  // Extensions to align with Python app behavior:
  tags?: string[];
  isPinned?: boolean;
};

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

// ---------- Utilities ----------
const deepClone = <T,>(obj: T): T => {
  try {
    // @ts-ignore
    if (typeof structuredClone === 'function') return structuredClone(obj);
  } catch {}
  return JSON.parse(JSON.stringify(obj));
};

function now() {
  return Date.now();
}

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

// Heuristic: decide if a text likely exceeds 3 lines and warrants a "Show more"
function needsClamp(txt: string): boolean {
  if (!txt) return false;
  const lineCount = txt.split(/\r?\n/).length;
  return lineCount > 3 || txt.length > 240;
}

// ---------- Component ----------
export default function Page() {
  // ----------- Crash-resistant loaders -----------
  function loadJSON<T>(key: string, backupKey: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // ignore
    }
    // Fallback to backup
    try {
      const rawB = localStorage.getItem(backupKey);
      if (rawB) return JSON.parse(rawB) as T;
    } catch {
      // ignore
    }
    return fallback;
  }

  // ----------- State: cards on the page -----------
  const [cards, setCards] = useState<Card[]>(() => loadJSON<Card[]>('copyai_cards', 'copyai_cards_backup', []));
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
  const [layouts, setLayouts] = useState<LayoutEntry[]>(() =>
    loadJSON<LayoutEntry[]>('copyai_layouts', 'copyai_layouts_backup', [])
  );
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');

  // ----------- Undo / Redo -----------
  type Snapshot = {
    cards: Card[];
    layouts: LayoutEntry[];
    currentLayoutTitle: string;
  };
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const lastInteractionAtRef = useRef<number>(now());

  function snapshot() {
    setHistory((prev) => [
      ...prev,
      { cards: deepClone(cards), layouts: deepClone(layouts), currentLayoutTitle }
    ]);
    setFuture([]); // clear redo stack on new action
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setFuture((fr) => [...fr, { cards: deepClone(cards), layouts: deepClone(layouts), currentLayoutTitle }]);
      setCards(last.cards);
      setLayouts(last.layouts);
      setCurrentLayoutTitle(last.currentLayoutTitle);
      toast('↩️ Undone');
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setFuture((fr) => {
      if (fr.length === 0) return fr;
      const next = fr[fr.length - 1];
      setHistory((h) => [...h, { cards: deepClone(cards), layouts: deepClone(layouts), currentLayoutTitle }]);
      setCards(next.cards);
      setLayouts(next.layouts);
      setCurrentLayoutTitle(next.currentLayoutTitle);
      toast('↪️ Redone');
      return fr.slice(0, -1);
    });
  }

  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  // ----------- UI state: temporary expand/collapse per card -----------
  // Not persisted; resets on reload.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ----------- Persist with backup (crash recovery) -----------
  useEffect(() => {
    try {
      const prev = localStorage.getItem('copyai_cards');
      if (prev) localStorage.setItem('copyai_cards_backup', prev);
      localStorage.setItem('copyai_cards', JSON.stringify(cards));
    } catch {}
  }, [cards]);

  useEffect(() => {
    try {
      const prev = localStorage.getItem('copyai_layouts');
      if (prev) localStorage.setItem('copyai_layouts_backup', prev);
      localStorage.setItem('copyai_layouts', JSON.stringify(layouts));
    } catch {}
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
    const titles = new Set(layouts.map((l) => l.title));
    let t = (base.trim() || 'Untitled');
    while (titles.has(t)) t = t + '-2';
    return t;
  }

  // ----------- Page actions: Add / Edit / Delete cards -----------
  function addCard() {
    const t = title.trim();
    const x = text.trim();
    if (!t && !x) {
      toast('Enter a title or text first');
      return;
    }
    snapshot();
    const id = 'c' + Date.now();
    const newCard: Card = { id, title: t || 'Untitled', text: x, createdAt: Date.now() };
    // Append to bottom
    setCards((prev) => [...prev, newCard]);
    setTitle('');
    setText('');
    setExpanded((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    toast('➕ Added (to bottom)');
  }

  function startEdit(id: string) {
    const c = cards.find((c) => c.id === id);
    if (!c) return;
    setEditingId(id);
    setEditTitle(c.title);
    setEditText(c.text);
  }

  function saveEdit() {
    if (!editingId) return;
    snapshot();
    const t = editTitle.trim() || 'Untitled';
    setCards((prev) => prev.map((c) => (c.id === editingId ? { ...c, title: t, text: editText } : c)));
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
    snapshot();
    setCards((prev) => prev.filter((c) => c.id !== id));
    toast('🗑 Deleted');
  }

  // ----------- Drag-and-drop: Cards -----------
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const dragCopyGuardRef = useRef(false);

  function reorder<T>(arr: T[], from: number, to: number) {
    const a = arr.slice();
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return a;
  }

  function onCardDragStart(e: React.DragEvent, id: string) {
    setDragCardId(id);
    dragCopyGuardRef.current = true; // prevent click-to-copy on drag
    e.dataTransfer.effectAllowed = 'move';
    // Minimal drag image offset to avoid ugly default
    try {
      const crt = document.createElement('div');
      crt.style.padding = '4px 8px';
      crt.style.background = PANEL;
      crt.style.color = TEXT;
      crt.style.border = `1px solid ${BORDER}`;
      crt.style.borderRadius = '6px';
      crt.style.position = 'absolute';
      crt.style.top = '-99999px';
      crt.textContent = 'Moving…';
      document.body.appendChild(crt);
      e.dataTransfer.setDragImage(crt, 0, 0);
      setTimeout(() => crt.remove(), 0);
    } catch {}
  }

  function onCardDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (dragCardId) setDragOverCardId(overId);
  }

  function onCardDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverCardId(null);
    if (!dragCardId || dragCardId === targetId) {
      setDragCardId(null);
      return;
    }
    const from = cards.findIndex((c) => c.id === dragCardId);
    const to = cards.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) {
      setDragCardId(null);
      return;
    }
    snapshot();
    setCards((prev) => reorder(prev, from, to));
    setDragCardId(null);
    toast('↕️ Card reordered');
  }

  function onCardDragEnd() {
    setTimeout(() => (dragCopyGuardRef.current = false), 0); // allow copying again
  }

  // ----------- Layout actions: Save / Open / Delete / Pin / Duplicate -----------
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
      cards,
      isPinned: false
    };
    snapshot();
    setLayouts((prev) => [...prev, entry]);
    setCurrentLayoutTitle(uniqueTitle);
    toast(`💾 Saved layout: ${uniqueTitle}`);
  }

  function openLayout(id: string) {
    const lay = layouts.find((l) => l.id === id);
    if (!lay) return;
    snapshot();
    setCards(lay.cards);
    setCurrentLayoutTitle(lay.title);
    setShowLibrary(false);
    setExpanded(new Set()); // reset temp expansion on open
    toast(`📂 Opened: ${lay.title}`);
  }

  function deleteLayout(id: string) {
    const lay = layouts.find((l) => l.id === id);
    if (!lay) return;
    if (!confirm(`Delete layout?\n\n${lay.title}`)) return;
    snapshot();
    setLayouts((prev) => prev.filter((l) => l.id !== id));
    toast('🗑 Layout deleted');
  }

  function togglePinLayout(id: string) {
    snapshot();
    setLayouts((prev) =>
      prev.map((l) => (l.id === id ? { ...l, isPinned: !l.isPinned, savedAt: Date.now() } : l))
    );
  }

  function duplicateLayout(id: string) {
    const src = layouts.find((l) => l.id === id);
    if (!src) return;
    snapshot();
    const dup: LayoutEntry = {
      id: 'L' + Date.now(),
      title: `${src.title} (Copy)`,
      savedAt: Date.now(),
      isPinned: !!src.isPinned,
      tags: src.tags ? [...src.tags] : [],
      cards: src.cards.map((c) => ({
        ...c,
        id: 'c' + Date.now() + Math.random().toString(16).slice(2),
        createdAt: Date.now()
      }))
    };
    setLayouts((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i < 0) return prev.concat(dup);
      const a = prev.slice();
      a.splice(i + 1, 0, dup);
      return a;
    });
    toast('📄 Layout duplicated');
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
          alert(
            'Copy failed. Your browser may block clipboard access.\n\nHere is the library JSON so you can copy it manually:\n\n' +
            payload
          );
        }
      });
  }

  function importJSON(file: File) {
    file.text().then(t => {
      const data = JSON.parse(t);
      if (!data || !Array.isArray(data.cards)) {
        alert('Invalid file');
        return;
      }
      const norm: Card[] = data.cards.map((c: any, i: number) => ({
        id: String(c.id ?? 'c' + Date.now() + i),
        title: String(c.title ?? 'Untitled'),
        text: String(c.text ?? ''),
        createdAt: Number.isFinite(+c.createdAt) ? +c.createdAt : Date.now() - i,
        tags: Array.isArray(c?.tags) ? c.tags : undefined
      }));
      // Oldest at top, newest at bottom
      norm.sort((a, b) => a.createdAt - b.createdAt);
      snapshot();
      setCards(norm);
      setExpanded(new Set()); // reset temp expansion on import
      toast('📥 Imported');
    }).catch(() => alert('Failed to read file'));
  }

  // New: Import Library (layouts) from file
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
          tags: Array.isArray(c?.tags) ? c.tags : undefined
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
          tags: Array.isArray(l?.tags) ? l.tags : undefined,
          isPinned: !!l?.isPinned
        };
      });

      if (normalized.length === 0) {
        toast('ℹ️ No layouts found in file');
        return;
      }

      snapshot();
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

  // ----------- Library filtering & reordering -----------
  const filteredLayouts = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return layouts;
    return layouts.filter((l) => {
      const titleHit = l.title.toLowerCase().includes(q);
      const tagsHit = (l.tags || []).some((t) => String(t).toLowerCase().includes(q));
      const cardsHit = l.cards.some(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q) ||
          (c.tags || []).some((t) => String(t).toLowerCase().includes(q))
      );
      return titleHit || tagsHit || cardsHit;
    });
  }, [layouts, libraryQuery]);

  function reorderVisibleLayouts(startPos: number, targetPos: number) {
    // Build visible actual indices
    const visibleIndices = filteredLayouts.map((l) => layouts.findIndex((x) => x.id === l.id)).filter((i) => i >= 0);
    if (startPos === targetPos || startPos < 0 || targetPos < 0 || startPos >= visibleIndices.length || targetPos > visibleIndices.length) {
      return;
    }
    const newVisible = visibleIndices.slice();
    const [moved] = newVisible.splice(startPos, 1);
    newVisible.splice(targetPos, 0, moved);

    const visibleSet = new Set(visibleIndices);
    const reorderedVisibleLayouts = newVisible.map((idx) => layouts[idx]);
    const it = reorderedVisibleLayoutsSymbol.iterator;

    const rebuilt: LayoutEntry[] = layouts.map((l, idx) => (visibleSet.has(idx) ? it.next().value! : l));
    setLayouts(rebuilt);
  }

  // DnD state for layouts (library modal)
  const [dragLayoutId, setDragLayoutId] = useState<string | null>(null);
  const [dragLayoutOverId, setDragLayoutOverId] = useState<string | null>(null);

  function onLayoutDragStart(e: React.DragEvent, id: string) {
    setDragLayoutId(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onLayoutDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    setDragLayoutOverId(overId);
  }
  function onLayoutDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragLayoutId || dragLayoutId === targetId) {
      setDragLayoutId(null);
      setDragLayoutOverId(null);
      return;
    }
    const startPos = filteredLayouts.findIndex((l) => l.id === dragLayoutId);
    const targetPos = filteredLayouts.findIndex((l) => l.id === targetId);
    if (startPos < 0 || targetPos < 0) {
      setDragLayoutId(null);
      setDragLayoutOverId(null);
      return;
    }
    snapshot();
    reorderVisibleLayouts(startPos, targetPos);
    setDragLayoutId(null);
    setDragLayoutOverId(null);
    toast('↕️ Layout reordered');
  }

  // ----------- Keyboard shortcuts -----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (meta && key === 's') {
        e.preventDefault();
        saveLayout();
      } else if (meta && key === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      } else if (meta && (key === 'y' || (e.shiftKey && key === 'z'))) {
        e.preventDefault();
        if (canRedo) redo();
      } else if (meta && key === 'f') {
        // Open Library and focus search
        e.preventDefault();
        setShowLibrary(true);
        setTimeout(() => {
          const el = document.getElementById('library-search');
          el?.focus();
          (el as HTMLInputElement)?.select?.();
        }, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, canRedo, cards, layouts, currentLayoutTitle]);

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
      {/* Global focus ring (WCAG) */}
      <style jsx global>{`
        .focus-ring:focus-visible {
          outline: 2px solid ${ACCENT};
          outline-offset: 2px;
        }
        .ghost-outline {
          box-shadow: 0 0 0 2px ${ACCENT} inset;
        }
      `}</style>

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
          className="focus-ring"
          style={{ background: ACCENT, color: '#fff', padding: '8px 12px', borderRadius: 8 }}
          title="Save current list as a layout in the Library"
          aria-label="Save current list as a layout"
        >
          💾 Save Layout
        </button>

        <button
          onClick={() => setShowLibrary(true)}
          className="focus-ring"
          style={{ background: PANEL, color: TEXT, padding: '8px 12px', borderRadius: 8 }}
          title="Open Library"
          aria-haspopup="dialog"
          aria-expanded={showLibrary}
          aria-controls="library-modal"
        >
          📚 Library
        </button>

        <button
          onClick={() => canUndo && undo()}
          disabled={!canUndo}
          className="focus-ring"
          style={{
            background: PANEL,
            color: TEXT,
            padding: '8px 12px',
            borderRadius: 8,
            opacity: canUndo ? 1 : 0.6,
            cursor: canUndo ? 'pointer' : 'not-allowed',
            border: `1px solid ${BORDER}`
          }}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
        >
          ↩️ Undo
        </button>

        <button
          onClick={() => canRedo && redo()}
          disabled={!canRedo}
          className="focus-ring"
          style={{
            background: PANEL,
            color: TEXT,
            padding: '8px 12px',
            borderRadius: 8,
            opacity: canRedo ? 1 : 0.6,
            cursor: canRedo ? 'pointer' : 'not-allowed',
            border: `1px solid ${BORDER}`
          }}
          title="Redo (Ctrl/Cmd+Y)"
          aria-label="Redo"
        >
          ↪️ Redo
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
          className="focus-ring"
          aria-label="New card title"
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
          className="focus-ring"
          aria-label="New card text"
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
            className="focus-ring"
            style={{ background: ACCENT, color: '#fff', padding: '10px 14px', borderRadius: 8 }}
          >
            ➕ Add (goes to bottom)
          </button>
        </div>
      </div>

      {/* Vertical List (oldest first, newest last) */}
      <div
        role="list"
        aria-label="Cards"
        style={{ display: 'grid', gap: 12, overflowX: 'hidden', boxSizing: 'border-box', maxWidth: '100%' }}
      >
        {cards.length === 0 && (
          <div style={{ opacity: .7, textAlign: 'center' }}>
            (No prompts yet — add one above. Tip: Save multiple as a layout and manage them in the Library.)
          </div>
        )}

        {cards.map((c) => {
          const isEditing = editingId === c.id;
          const isExpanded = expanded.has(c.id);
          const showToggle = needsClamp(c.text) || isExpanded;
          const isDragOver = dragOverCardId === c.id && dragCardId !== c.id;

          return (
            <div
              role="listitem"
              key={c.id}
              tabIndex={0}
              draggable={!isEditing}
              onDragStart={(e) => onCardDragStart(e, c.id)}
              onDragOver={(e) => onCardDragOver(e, c.id)}
              onDrop={(e) => onCardDrop(e, c.id)}
              onDragEnd={onCardDragEnd}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  copyNow(c.text);
                }
              }}
              onClick={(e) => {
                if (isEditing) return;
                if ((e.target as HTMLElement).closest('[data-nocopy]')) return;
                if (dragCopyGuardRef.current) return; // prevent copy on drag
                // Copy full text on card click (primary behavior)
                copyNow(c.text);
              }}
              className={`focus-ring${isDragOver ? ' ghost-outline' : ''}`}
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 12,
                boxSizing: 'border-box',
                maxWidth: '100%',
                // Critical: Clip children so rounded corners are always respected
                overflow: 'hidden',
                cursor: isEditing ? 'default' : 'move'
              }}
              aria-label={`Card: ${c.title || 'Untitled'}`}
            >
              {isEditing ? (
                <div style={{ display: 'grid', gap: 8, boxSizing: 'border-box', maxWidth: '100%' }}>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                    className="focus-ring"
                    aria-label="Edit title"
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
                    className="focus-ring"
                    aria-label="Edit text"
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
                    <button onClick={saveEdit} className="focus-ring" style={{ background: ACCENT, color: '#fff', padding: '8px 12px', borderRadius: 8 }} data-nocopy>
                      Save
                    </button>
                    <button onClick={cancelEdit} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '8px 12px', borderRadius: 8 }} data-nocopy>
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
                        className="focus-ring"
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
                    <button onClick={() => startEdit(c.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8 }} data-nocopy>
                      Edit
                    </button>
                    <button onClick={() => removeCard(c.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8 }} data-nocopy>
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
          id="library-modal"
          role="dialog"
          aria-modal="true"
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
              width: 'min(880px, 92vw)',  // widened a bit
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
            {/* Header: actions + search + close */}
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

                {/* Search box */}
                <input
                  id="library-search"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Search layouts (title, tags, card text)…"
                  className="focus-ring"
                  style={{
                    background: SURFACE,
                    color: TEXT,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: BUTTON_FONT_SIZE,
                    minWidth: 200
                  }}
                  aria-label="Search layouts"
                />
                <div aria-live="polite" style={{ opacity: .6, fontSize: 12 }}>
                  {filteredLayouts.length} / {layouts.length}
                </div>
              </div>

              {/* Right: Close (purple) */}
              <button
                onClick={() => setShowLibrary(false)}
                className="focus-ring"
                style={{
                  background: ACCENT,
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: BUTTON_FONT_SIZE
                }}
              >
                Close
              </button>
            </div>

            {layouts.length === 0 && <div style={{ opacity: .7 }}>(Library is empty)</div>}

            <div role="list" aria-label="Saved layouts" style={{ display: 'grid', gap: 8 }}>
              {filteredLayouts.map((l, idx) => {
                const isOver = dragLayoutOverId === l.id && dragLayoutId !== l.id;
                return (
                  <div
                    role="listitem"
                    key={l.id}
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => onLayoutDragStart(e, l.id)}
                    onDragOver={(e) => onLayoutDragOver(e, l.id)}
                    onDrop={(e) => onLayoutDrop(e, l.id)}
                    className={`focus-ring${isOver ? ' ghost-outline' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 12px',               // inset so buttons don't touch the rounded edge
                      borderBottom: `1px solid ${BORDER}`,
                      borderRadius: 8,                    // optional: softens row corners visually
                      boxSizing: 'border-box',
                      width: '100%',
                      gap: 8,
                      overflow: 'hidden',                 // prevents accidental horizontal overflow within row
                      cursor: 'move'
                    }}
                    aria-label={`Layout: ${l.title}`}
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
                        {l.isPinned ? '📌 ' : ''}{l.title}
                      </div>
                      <div style={{ opacity: .6, fontSize: 12 }}>Saved: {fmt(l.savedAt)} • {l.cards.length} cards</div>
                    </div>

                    {/* Right block: buttons (fixed width) */}
                    <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                      <button
                        onClick={() => openLayout(l.id)}
                        className="focus-ring"
                        style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8 }}
                      >
                        Open
                      </button>

                      <button
                        onClick={() => togglePinLayout(l.id)}
                        className="focus-ring"
                        style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}
                        title={l.isPinned ? 'Unpin' : 'Pin'}
                        aria-pressed={!!l.isPinned}
                      >
                        {l.isPinned ? 'Unpin' : 'Pin'}
                      </button>

                      <button
                        onClick={() => duplicateLayout(l.id)}
                        className="focus-ring"
                        style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}
                        title="Duplicate layout"
                      >
                        Duplicate
                      </button>

                      <button
                        onClick={() => deleteLayout(l.id)}
                        className="focus-ring"
                        style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
