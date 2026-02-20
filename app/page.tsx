'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export default function Page() {
  // ----------- Crash-resistant loaders -----------
  function loadJSON<T>(key: string, backupKey: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
    try {
      const rawB = localStorage.getItem(backupKey);
      if (rawB) return JSON.parse(rawB) as T;
    } catch {}
    return fallback;
  }

  // ----------- State: cards on the page -----------
  const [cards, setCards] = useState<Card[]>(() =>
    loadJSON<Card[]>('copyai_cards', 'copyai_cards_backup', [])
  );

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

  // ----------- NEW: Library Editor UI state -----------
  const [showLibraryEditor, setShowLibraryEditor] = useState(false);

  // ----------- Undo / Redo -----------
  type Snapshot = {
    cards: Card[];
    layouts: LayoutEntry[];
    currentLayoutTitle: string;
  };
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

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
      setFuture((fr) => [
        ...fr,
        { cards: deepClone(cards), layouts: deepClone(layouts), currentLayoutTitle }
      ]);
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
      setHistory((h) => [
        ...h,
        { cards: deepClone(cards), layouts: deepClone(layouts), currentLayoutTitle }
      ]);
      setCards(next.cards);
      setLayouts(next.layouts);
      setCurrentLayoutTitle(next.currentLayoutTitle);
      toast('↪️ Redone');
      return fr.slice(0, -1);
    });
  }

  // ----------- UI state: temporary expand/collapse per card -----------
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
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  async function copyNow(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast('✅ Copied');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.setAttribute('readonly', 'true');
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('✅ Copied');
      } catch {
        alert('Clipboard failed');
      }
    }
  }

  function nextUniqueTitle(base: string): string {
    const titles = new Set(layouts.map((l) => l.title));
    let t = base.trim() || 'Untitled';
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
    dragCopyGuardRef.current = true;
    e.dataTransfer.effectAllowed = 'move';
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
    setTimeout(() => (dragCopyGuardRef.current = false), 0);
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
    setExpanded(new Set());
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

    navigator.clipboard.writeText(payload)
      .then(() => {
        toast('✅ Library copied to clipboard');
      })
      .catch(() => {
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
      norm.sort((a, b) => a.createdAt - b.createdAt);
      snapshot();
      setCards(norm);
      setExpanded(new Set());
      toast('📥 Imported');
    }).catch(() => alert('Failed to read file'));
  }

  function importLibrary(file: File) {
    file.text().then(t => {
      let data: any;
      try {
        data = JSON.parse(t);
      } catch {
        alert('Invalid JSON');
        return;
      }

      const incoming = Array.isArray(data) ? data : data?.layouts;
      if (!Array.isArray(incoming)) {
        alert('Invalid library file (expected { "layouts": [...] })');
        return;
      }

      const existingTitles = new Set(layouts.map(l => l.title));

      const normalized: LayoutEntry[] = incoming.map((l: any, li: number) => {
        const cardsArr: Card[] = Array.isArray(l?.cards) ? l.cards.map((c: any, i: number) => ({
          id: String(c?.id ?? 'c' + Date.now() + '_' + li + '_' + i),
          title: String(c?.title ?? 'Untitled'),
          text: String(c?.text ?? ''),
          createdAt: Number.isFinite(+c?.createdAt) ? +c.createdAt : (Date.now() - i),
          tags: Array.isArray(c?.tags) ? c.tags : undefined
        })) : [];

        cardsArr.sort((a, b) => a.createdAt - b.createdAt);

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

  const previewCollapsedStyle: React.CSSProperties = {
    whiteSpace: 'pre-line',
    display: '-webkit-box',
    // @ts-ignore vendor prop not in React types across all versions
    WebkitLineClamp: PREVIEW_LINES as unknown as number,
    // @ts-ignore vendor prop not in React types across all versions
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: LINE_HEIGHT,
    height: PREVIEW_HEIGHT,
    opacity: 1,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  };

  const previewExpandedStyle: React.CSSProperties = {
    whiteSpace: 'pre-wrap',
    display: 'block',
    overflow: 'visible',
    lineHeight: LINE_HEIGHT,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  };

  // ----------- Library filtering -----------
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

  // ----------- Reorder visible layouts (helper) -----------
  const reorderVisibleLayouts = useCallback(
    (startPos: number, targetPos: number) => {
      // Map visible layouts -> indices in the full layouts array
      const visibleIndices = filteredLayouts
        .map(l => layouts.findIndex(x => x.id === l.id))
        .filter(i => i >= 0);

      if (
        startPos === targetPos ||
        startPos < 0 ||
        targetPos < 0 ||
        startPos >= visibleIndices.length ||
        targetPos >= visibleIndices.length
      ) {
        return;
      }

      // New order of visible *indices* after moving one
      const newOrderOfVisible = visibleIndices.slice();
      const [moved] = newOrderOfVisible.splice(startPos, 1);
      newOrderOfVisible.splice(targetPos, 0, moved);

      setLayouts(prev => {
        const next = prev.slice();
        // Items to place into the visible slots, captured before writes
        const itemsInNewOrder = newOrderOfVisible.map(idx => next[idx]);
        // Write back into the same visible positions in the new order
        visibleIndices.forEach((pos, i) => {
          next[pos] = itemsInNewOrder[i];
        });
        return next;
      });
    },
    [filteredLayouts, layouts]
  );

  // ----------- DnD state for layouts (library modal) -----------
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
        e.preventDefault();
        setShowLibrary(true);
        setTimeout(() => {
          const el = document.getElementById('library-search');
          el?.focus();
          (el as HTMLInputElement)?.select?.();
        }, 0);
      } else if (meta && e.shiftKey && key === 'l') {
        // NEW: Ctrl/Cmd + Shift + L -> open NEW editor
        e.preventDefault();
        setShowLibraryEditor(true);
        setTimeout(() => {
          const el = document.getElementById('library-editor-search');
          el?.focus();
          (el as HTMLInputElement)?.select?.();
        }, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    canUndo,
    canRedo,
    cards,
    layouts,
    currentLayoutTitle
  ]);

  // ----------- Render -----------
  return (
    <div
      style={{
        minHeight: '100svh',
        padding: 12,
        overflowX: 'hidden',
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
        {/* Logo + App Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image
            src="/copyai_logo.png"
            alt="CopyAI logo"
            width={22}
            height={22}
            priority
            style={{ display: 'block' }}
          />
          <div style={{ fontWeight: 700, fontSize: 20 }}>CopyAI</div>
        </div>

        <div style={{ marginLeft: 'auto' }} />

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

        {/* NEW: Second button to open the Library Editor */}
        <button
          onClick={() => setShowLibraryEditor(true)}
          className="focus-ring"
          style={{ background: PANEL, color: TEXT, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}` }}
          title="Open Library Editor (advanced)"
          aria-haspopup="dialog"
          aria-expanded={showLibraryEditor}
          aria-controls="library-editor-modal"
        >
          🛠 Library Editor
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
          overflow: 'hidden'
        }}
      >
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
                if (dragCopyGuardRef.current) return;
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
                          e.stopPropagation();
                          toggleExpanded(c.id);
                        }}
                        aria-label={isExpanded ? 'Show less' : 'Show more'}
                        title={isExpanded ? 'Show less' : 'Show more'}
                        className="focus-ring"
                        style={{
                          position: 'absolute',
                          right: 8,
                          bottom: 8,
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

      {/* Library Modal (existing) */}
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
              width: 'min(880px, 92vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '16px 14px 16px',
              boxSizing: 'border-box',
              maxWidth: '92vw',
              overflowX: 'hidden'
            }}
          >
            {/* Header */}
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
              {/* Left: Import/Export + Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', boxSizing: 'border-box', maxWidth: '100%' }}>
                <label style={LIB_BTN_STYLE} title="Import a layout (JSON file with cards)">
                  Import Layout From File
                  <input
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) importJSON(file);
                    }}
                  />
                </label>

                <button onClick={exportJSON} style={LIB_BTN_STYLE} title="Export current layout as JSON">
                  Export Current Layout
                </button>

                <label style={LIB_BTN_STYLE} title="Import a saved library (JSON with layouts)">
                  Import Library From File
                  <input
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={(e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) importLibrary(file);
                    }}
                  />
                </label>

                <button onClick={exportLibrary} style={LIB_BTN_STYLE} title="Export all saved layouts as JSON">
                  Export Library
                </button>

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

              {/* Right: Close */}
              <button
                onClick={() => setShowLibrary(false)}
                className="focus-ring"
                style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: BUTTON_FONT_SIZE }}
              >
                Close
              </button>
            </div>

            {layouts.length === 0 && <div style={{ opacity: .7 }}>(Library is empty)</div>}

            {/* List */}
            <div role="list" aria-label="Saved layouts" style={{ display: 'grid', gap: 8 }}>
              {filteredLayouts.map((l) => {
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
                      padding: '10px 12px',
                      borderBottom: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      boxSizing: 'border-box',
                      width: '100%',
                      gap: 8,
                      overflow: 'hidden',
                      cursor: 'move'
                    }}
                    aria-label={`Layout: ${l.title}`}
                  >
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.title}>
                        {l.isPinned ? '📌 ' : ''}{l.title}
                      </div>
                      <div style={{ opacity: .6, fontSize: 12 }}>Saved: {fmt(l.savedAt)} • {l.cards.length} cards</div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                      <button onClick={() => openLayout(l.id)} className="focus-ring" style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8 }}>
                        Open
                      </button>
                      <button onClick={() => togglePinLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }} title={l.isPinned ? 'Unpin' : 'Pin'} aria-pressed={!!l.isPinned}>
                        {l.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button onClick={() => duplicateLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }} title="Duplicate layout">
                        Duplicate
                      </button>
                      <button onClick={() => deleteLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}>
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

      {/* NEW: Library Editor Modal (advanced) */}
      {showLibraryEditor && (
        <div
          id="library-editor-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLibraryEditor(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            display: 'grid', placeItems: 'center', zIndex: 10001,
            boxSizing: 'border-box', maxWidth: '100%', overflow: 'hidden'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              width: 'min(1000px, 96vw)',
              maxHeight: '86vh',
              overflow: 'auto',
              padding: '16px 14px 16px',
              boxSizing: 'border-box',
              maxWidth: '96vw',
              overflowX: 'hidden'
            }}
          >
            {/* Editor Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700 }}>Library Editor</div>
                <input
                  id="library-editor-search"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Search (title, tags, card text)…"
                  className="focus-ring"
                  style={{
                    background: SURFACE,
                    color: TEXT,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: BUTTON_FONT_SIZE,
                    minWidth: 240
                  }}
                  aria-label="Search layouts"
                />
                <div aria-live="polite" style={{ opacity: .6, fontSize: 12 }}>
                  {filteredLayouts.length} / {layouts.length}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowLibraryEditor(false)} className="focus-ring" style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: BUTTON_FONT_SIZE }}>
                  Close Editor
                </button>
              </div>
            </div>

            {/* Editor Body (re-uses the same list; expand here with richer editing as needed) */}
            <div role="list" aria-label="Library editor list" style={{ display: 'grid', gap: 8 }}>
              {filteredLayouts.map((l) => {
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
                      padding: '10px 12px',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      display: 'grid',
                      gap: 8,
                      cursor: 'move'
                    }}
                    aria-label={`Layout row: ${l.title}`}
                  >
                    {/* Top row: title + meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', minWidth: 0 }}>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.title}>
                          {l.isPinned ? '📌 ' : ''}{l.title}
                        </div>
                        <div style={{ opacity: .6, fontSize: 12 }}>
                          Saved: {fmt(l.savedAt)} • {l.cards.length} cards {l.tags?.length ? `• tags: ${l.tags.join(', ')}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                        <button onClick={() => openLayout(l.id)} className="focus-ring" style={{ background: ACCENT, color: '#fff', padding: '6px 10px', borderRadius: 8 }}>Open</button>
                        <button onClick={() => togglePinLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }} aria-pressed={!!l.isPinned}>{l.isPinned ? 'Unpin' : 'Pin'}</button>
                        <button onClick={() => duplicateLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}>Duplicate</button>
                        <button onClick={() => deleteLayout(l.id)} className="focus-ring" style={{ background: PANEL, color: TEXT, padding: '6px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}>Delete</button>
                      </div>
                    </div>

                    {/* Cards preview (compact) */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {l.cards.slice(0, 3).map((c) => (
                        <div key={c.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</div>
                          <div style={{ fontSize: 12, opacity: .8, maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-line' }}>
                            {c.text}
                          </div>
                        </div>
                      ))}
                      {l.cards.length > 3 && (
                        <div style={{ fontSize: 12, opacity: .7 }}>…and {l.cards.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredLayouts.length === 0 && (
                <div style={{ opacity: .7, textAlign: 'center', padding: 12 }}>(No layouts match your search.)</div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
