
'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

type Card = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
};

type LayoutEntry = {
  id: string;
  title: string;
  savedAt: number;
  cards: Card[];
};

// CSS variable references (kept for any remaining inline-only styles)
const BG = 'var(--bg)';
const PANEL = 'var(--panel)';
const SURFACE = 'var(--surface)';
const BORDER = 'var(--border)';
const TEXT = 'var(--text)';
const ACCENT = 'var(--accent)';

// Shared style for library header label-buttons (file inputs must be <label>)
const LIB_BTN_STYLE: React.CSSProperties = {
  background: SURFACE,
  color: TEXT,
  padding: '6px 12px',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  fontSize: 13,
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  lineHeight: 1.2,
  boxSizing: 'border-box',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
};

export default function Page() {
  // ----------- State: auth -----------
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginUser === 'Jesse' && loginPass === 'copyai') {
      setLoggedIn(true);
      setLoginError('');
    } else {
      setLoginError('Incorrect username or password.');
    }
  }

  // ----------- State: cards on the page -----------
  const [cards, setCards] = useState<Card[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [currentLayoutTitle, setCurrentLayoutTitle] = useState<string>('');

  // Add form
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');

  // ----------- State: Library -----------
  const [layouts, setLayouts] = useState<LayoutEntry[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  // Expand/collapse per card
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Track which layout is currently loaded (for Save vs Create New)
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);

  // Reorganize (drag-to-reorder) mode
  const [reorganizing, setReorganizing] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Load from Firestore once after login
  useEffect(() => {
    if (!loggedIn) return;
    getDoc(doc(db, 'users', 'jesse')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.cards) setCards(data.cards as Card[]);
        if (data.layouts) setLayouts(data.layouts as LayoutEntry[]);
      }
      setDataLoaded(true);
    });
  }, [loggedIn]);

  // Save cards to Firestore whenever they change (after initial load)
  useEffect(() => {
    if (!dataLoaded) return;
    setDoc(doc(db, 'users', 'jesse'), { cards }, { merge: true });
  }, [cards, dataLoaded]);

  // Save layouts to Firestore whenever they change (after initial load)
  useEffect(() => {
    if (!dataLoaded) return;
    setDoc(doc(db, 'users', 'jesse'), { layouts }, { merge: true });
  }, [layouts, dataLoaded]);

  // ----------- Utilities -----------
  function toast(msg: string, ms = 1600) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      background: '#1c2035',
      color: '#eaedf5',
      border: '1px solid #2e3350',
      borderRadius: '10px',
      padding: '10px 16px',
      zIndex: '9999',
      boxSizing: 'border-box',
      maxWidth: 'calc(100vw - 32px)',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: "inherit",
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      animation: 'fadeSlideIn 0.2s ease both',
    } as CSSStyleDeclaration);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  async function copyNow(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast('✓ Copied to clipboard');
    } catch {
      alert('Clipboard access failed');
    }
  }

  function nextUniqueTitle(base: string): string {
    const titles = new Set(layouts.map(l => l.title));
    let t = (base.trim() || 'Untitled');
    while (titles.has(t)) t = t + '-2';
    return t;
  }

  function fmt(ts: number) {
    return new Date(ts).toLocaleString();
  }

  function needsClamp(txt: string): boolean {
    if (!txt) return false;
    const lineCount = txt.split(/\r?\n/).length;
    return lineCount > 3 || txt.length > 240;
  }

  // ----------- Card actions -----------
  function addCard() {
    const t = title.trim();
    const x = text.trim();
    if (!t && !x) { toast('Enter a title or text first'); return; }
    const id = 'c' + Date.now();
    setCards(prev => [...prev, { id, title: t || 'Untitled', text: x, createdAt: Date.now() }]);
    setTitle('');
    setText('');
    toast('✓ Prompt added');
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
    toast('✓ Saved');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditText('');
  }

  function removeCard(id: string) {
    if (!confirm('Delete this prompt?')) return;
    setCards(prev => prev.filter(c => c.id !== id));
    toast('Prompt deleted');
  }

  // ----------- Drag-to-reorder -----------
  function onDragStart(idx: number) {
    setDragSrcIdx(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function onDrop(idx: number) {
    if (dragSrcIdx === null || dragSrcIdx === idx) { setDragSrcIdx(null); setDragOverIdx(null); return; }
    const next = [...cards];
    const [moved] = next.splice(dragSrcIdx, 1);
    next.splice(idx, 0, moved);
    setCards(next);
    setDragSrcIdx(null);
    setDragOverIdx(null);
  }

  function onDragEnd() {
    setDragSrcIdx(null);
    setDragOverIdx(null);
  }

  // ----------- Layout actions -----------
  function saveLayout() {
    if (cards.length === 0) { toast('No prompts to save'); return; }
    if (currentLayoutId) {
      // Update the existing layout in-place
      setLayouts(prev => prev.map(l =>
        l.id === currentLayoutId ? { ...l, cards, savedAt: Date.now() } : l
      ));
      toast(`✓ Saved: ${currentLayoutTitle}`);
    } else {
      createNewLayout();
    }
  }

  function createNewLayout() {
    if (cards.length === 0) { toast('No prompts to save'); return; }
    const base = prompt('Layout name:', currentLayoutTitle || '');
    if (base === null) return; // user cancelled
    const uniqueTitle = nextUniqueTitle(base);
    const id = 'L' + Date.now();
    const entry: LayoutEntry = { id, title: uniqueTitle, savedAt: Date.now(), cards };
    setLayouts(prev => [...prev, entry]);
    setCurrentLayoutTitle(uniqueTitle);
    setCurrentLayoutId(id);
    toast(`✓ Created: ${uniqueTitle}`);
  }

  function openLayout(id: string) {
    const lay = layouts.find(l => l.id === id);
    if (!lay) return;
    setCards(lay.cards);
    setCurrentLayoutTitle(lay.title);
    setCurrentLayoutId(id);
    setShowLibrary(false);
    setExpanded(new Set());
    setReorganizing(false);
    toast(`Opened: ${lay.title}`);
  }

  function deleteLayout(id: string) {
    const lay = layouts.find(l => l.id === id);
    if (!lay) return;
    if (!confirm(`Delete layout?\n\n${lay.title}`)) return;
    setLayouts(prev => prev.filter(l => l.id !== id));
    toast('Layout deleted');
  }

  // ----------- Import / Export -----------
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
      .then(() => toast('✓ Library copied to clipboard'))
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
          toast('✓ Library copied to clipboard');
        } catch {
          alert('Copy failed.\n\n' + payload);
        }
      });
  }

  function importJSON(file: File) {
    file.text().then(t => {
      const data = JSON.parse(t);
      if (!data || !Array.isArray(data.cards)) { alert('Invalid file'); return; }
      const norm: Card[] = data.cards.map((c: any, i: number) => ({
        id: String(c.id ?? 'c' + Date.now() + i),
        title: String(c.title ?? 'Untitled'),
        text: String(c.text ?? ''),
        createdAt: Number.isFinite(+c.createdAt) ? +c.createdAt : Date.now() - i
      }));
      norm.sort((a, b) => a.createdAt - b.createdAt);
      setCards(norm);
      setExpanded(new Set());
      toast('✓ Layout imported');
    }).catch(() => alert('Failed to read file'));
  }

  function importLibrary(file: File) {
    file.text().then(t => {
      let data: any;
      try { data = JSON.parse(t); } catch { alert('Invalid JSON'); return; }
      const incoming = Array.isArray(data) ? data : data?.layouts;
      if (!Array.isArray(incoming)) { alert('Invalid library file'); return; }
      const existingTitles = new Set(layouts.map(l => l.title));
      const normalized: LayoutEntry[] = incoming.map((l: any, li: number) => {
        const cardsArr: Card[] = Array.isArray(l?.cards) ? l.cards.map((c: any, i: number) => ({
          id: String(c?.id ?? 'c' + Date.now() + '_' + li + '_' + i),
          title: String(c?.title ?? 'Untitled'),
          text: String(c?.text ?? ''),
          createdAt: Number.isFinite(+c?.createdAt) ? +c.createdAt : (Date.now() - i)
        })) : [];
        cardsArr.sort((a, b) => a.createdAt - b.createdAt);
        let uniqueTitle = (String(l?.title ?? 'Untitled')).trim() || 'Untitled';
        while (existingTitles.has(uniqueTitle)) uniqueTitle = uniqueTitle + '-2';
        existingTitles.add(uniqueTitle);
        return {
          id: 'L' + Date.now() + '_' + li,
          title: uniqueTitle,
          savedAt: Number.isFinite(+l?.savedAt) ? +l.savedAt : Date.now() - li,
          cards: cardsArr
        };
      });
      if (normalized.length === 0) { toast('No layouts found in file'); return; }
      setLayouts(prev => [...prev, ...normalized]);
      toast(`✓ Imported ${normalized.length} layout${normalized.length > 1 ? 's' : ''}`);
    }).catch(() => alert('Failed to read file'));
  }

  // ----------- Preview styles -----------
  const LINE_HEIGHT = 1.5;
  const PREVIEW_LINES = 3;
  const PREVIEW_HEIGHT = `calc(${LINE_HEIGHT}em * ${PREVIEW_LINES})`;

  const previewCollapsedStyle: React.CSSProperties = {
    whiteSpace: 'pre-line',
    display: '-webkit-box',
    WebkitLineClamp: PREVIEW_LINES as unknown as number,
    WebkitBoxOrient: 'vertical' as unknown as 'vertical',
    overflow: 'hidden',
    lineHeight: LINE_HEIGHT as unknown as string,
    height: PREVIEW_HEIGHT,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  const previewExpandedStyle: React.CSSProperties = {
    whiteSpace: 'pre-wrap',
    display: 'block',
    overflow: 'visible',
    lineHeight: LINE_HEIGHT as unknown as string,
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  // ----------- Login screen -----------
  if (!loggedIn) {
    return (
      <div style={{
        minHeight: '100svh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}>
        <form
          onSubmit={handleLogin}
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '40px 36px',
            width: '100%',
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <Image
              src="/copyai_logo.png"
              alt="CopyAI logo"
              width={80}
              height={80}
              priority
              style={{ display: 'block', borderRadius: 16 }}
            />
            <Image
              src="/copyainewlogo.PNG"
              alt="CopyAI"
              width={180}
              height={48}
              priority
              style={{ display: 'block' }}
            />
          </div>

          {/* Fields */}
          <div style={{ width: '100%', display: 'grid', gap: 12 }}>
            <input
              type="text"
              value={loginUser}
              onChange={e => { setLoginUser(e.target.value); setLoginError(''); }}
              placeholder="Username"
              autoComplete="username"
              className="field"
              style={{ fontSize: 15 }}
            />
            <input
              type="password"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setLoginError(''); }}
              placeholder="Password"
              autoComplete="current-password"
              className="field"
              style={{ fontSize: 15 }}
            />
          </div>

          {/* Error */}
          {loginError && (
            <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500, textAlign: 'center' }}>
              {loginError}
            </div>
          )}

          {/* Submit */}
          <button type="submit" className="btn-accent" style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '11px 20px' }}>
            Log In
          </button>
        </form>
      </div>
    );
  }

  // Loading from Firestore
  if (!dataLoaded) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Image src="/copyai_logo.png" alt="CopyAI logo" width={56} height={56} priority style={{ borderRadius: 12, opacity: 0.8 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading your prompts…</span>
      </div>
    );
  }

  // ----------- Render -----------
  return (
    <div style={{ minHeight: '100svh', background: BG }}>

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <header className="header-bar">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
          <Image
            src="/copyai_logo.png"
            alt="CopyAI logo"
            width={26}
            height={26}
            priority
            style={{ display: 'block', borderRadius: 6 }}
          />
          <Image
            src="/copyainewlogo.PNG"
            alt="CopyAI"
            width={95}
            height={25}
            priority
            style={{ display: 'block', marginTop: 4 }}
          />
        </div>

        {/* Prompt count badge */}
        {cards.length > 0 && (
          <span className="count-badge">
            {cards.length} prompt{cards.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        <button className="btn-default btn-sm" onClick={() => setShowLibrary(true)} title="Open Library">
          📚 Library
          {layouts.length > 0 && (
            <span style={{
              background: ACCENT,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 10,
              marginLeft: 2,
            }}>
              {layouts.length}
            </span>
          )}
        </button>

        {currentLayoutId && (
          <span style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={currentLayoutTitle}>
            {currentLayoutTitle}
          </span>
        )}

        <button className="btn-default btn-sm" onClick={createNewLayout} title="Save current prompts as a new layout">
          + New Layout
        </button>

        <button className="btn-accent btn-sm" onClick={saveLayout} title={currentLayoutId ? `Update "${currentLayoutTitle}"` : 'Save current prompts as a layout'}>
          💾 {currentLayoutId ? 'Save' : 'Save Layout'}
        </button>
      </header>

      {/* ── Page body ─────────────────────────────────────────── */}
      <main style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 16px 48px',
        boxSizing: 'border-box',
      }}>

        {/* ── Add Prompt Form ──────────────────────────────────── */}
        <section style={{
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '20px',
          marginBottom: 24,
          boxSizing: 'border-box',
        }}>
          <p className="section-label">New Prompt</p>

          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCard()}
              placeholder="Title — e.g. Outreach Follow-up #1"
              className="field"
              style={{ fontSize: 14 }}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Prompt text…"
              rows={4}
              className="field"
            />
            <div>
              <button onClick={addCard} className="btn-accent">
                + Add Prompt
              </button>
            </div>
          </div>
        </section>

        {/* ── Prompt Cards ─────────────────────────────────────── */}
        {cards.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✦</div>
            <div className="empty-state-text">
              No prompts yet.<br />Add one above to get started.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p className="section-label" style={{ marginBottom: 0 }}>Your Prompts</p>
              {cards.length > 1 && (
                <button
                  className={reorganizing ? 'btn-accent btn-sm' : 'btn-default btn-sm'}
                  onClick={() => { setReorganizing(r => !r); setDragSrcIdx(null); setDragOverIdx(null); }}
                >
                  {reorganizing ? '✓ Done Reorganizing' : '⇅ Reorganize'}
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {cards.map((c, idx) => {
                const isEditing = editingId === c.id;
                const isExpanded = expanded.has(c.id);
                const showToggle = needsClamp(c.text) || isExpanded;
                const isDragSrc = reorganizing && dragSrcIdx === idx;
                const isDragTarget = reorganizing && dragOverIdx === idx && dragSrcIdx !== idx;

                return (
                  <div
                    key={c.id}
                    draggable={reorganizing && !isEditing}
                    onDragStart={reorganizing ? () => onDragStart(idx) : undefined}
                    onDragOver={reorganizing ? (e) => onDragOver(e, idx) : undefined}
                    onDrop={reorganizing ? () => onDrop(idx) : undefined}
                    onDragEnd={reorganizing ? onDragEnd : undefined}
                    className={!isEditing && !reorganizing ? 'prompt-card' : undefined}
                    onClick={(e) => {
                      if (isEditing || reorganizing) return;
                      if ((e.target as HTMLElement).closest('[data-nocopy]')) return;
                      copyNow(c.text);
                    }}
                    style={{
                      background: SURFACE,
                      border: isDragTarget ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                      borderRadius: 12,
                      padding: 16,
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      position: 'relative',
                      opacity: isDragSrc ? 0.4 : 1,
                      cursor: reorganizing ? 'grab' : isEditing ? 'default' : 'pointer',
                      transition: 'opacity 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {/* Drag handle in reorganize mode */}
                    {reorganizing && !isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--text-muted)', userSelect: 'none' }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>⠿</span>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>Drag to reorder</span>
                      </div>
                    )}

                    {/* Copy badge (shown on hover via CSS, hidden in reorganize mode) */}
                    {!isEditing && !reorganizing && <span className="copy-badge">Copy</span>}

                    {isEditing ? (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Title"
                          className="field"
                        />
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          placeholder="Prompt text"
                          rows={5}
                          className="field"
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveEdit} className="btn-accent btn-sm" data-nocopy>Save</button>
                          <button onClick={cancelEdit} className="btn-default btn-sm" data-nocopy>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {/* Title */}
                        <div style={{
                          fontWeight: 700,
                          fontSize: 15,
                          letterSpacing: '-0.01em',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          paddingRight: 60, // make room for copy badge
                        }} title={c.title || 'Untitled'}>
                          {c.title || 'Untitled'}
                        </div>

                        {/* Text + expand toggle */}
                        <div style={{
                          position: 'relative',
                          paddingBottom: showToggle ? 30 : 0,
                        }}>
                          <div style={{
                            ...(isExpanded ? previewExpandedStyle : previewCollapsedStyle),
                            fontSize: 13,
                            color: c.text ? 'var(--text-sub)' : 'var(--text-muted)',
                          }}>
                            {c.text || '(empty)'}
                          </div>

                          {showToggle && (
                            <button
                              data-nocopy
                              onClick={(e) => { e.stopPropagation(); toggleExpanded(c.id); }}
                              aria-label={isExpanded ? 'Show less' : 'Show more'}
                              style={{
                                position: 'absolute',
                                right: 0,
                                bottom: 0,
                                background: SURFACE,
                                color: 'var(--text-muted)',
                                border: `1px solid ${BORDER}`,
                                borderRadius: 6,
                                padding: '2px 10px',
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: '0.03em',
                                cursor: 'pointer',
                              }}
                            >
                              {isExpanded ? '↑ Less' : '↓ More'}
                            </button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => startEdit(c.id)}
                            className="btn-default btn-sm"
                            data-nocopy
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeCard(c.id)}
                            className="btn-danger btn-sm"
                            data-nocopy
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* ── Library Modal ─────────────────────────────────────── */}
      {showLibrary && (
        <div
          className="modal-backdrop"
          onClick={() => setShowLibrary(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              width: 'min(680px, 100%)',
              maxHeight: '82vh',
              overflow: 'auto',
              boxSizing: 'border-box',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${BORDER}`,
              gap: 8,
              flexWrap: 'wrap',
              rowGap: 10,
              position: 'sticky',
              top: 0,
              background: PANEL,
              zIndex: 1,
            }}>
              <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
                Library
                {layouts.length > 0 && (
                  <span className="count-badge" style={{ marginLeft: 10 }}>
                    {layouts.length}
                  </span>
                )}
              </div>
              <button onClick={() => setShowLibrary(false)} className="btn-accent btn-sm">
                ✕ Close
              </button>
            </div>

            {/* Import / Export toolbar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              padding: '14px 20px',
              borderBottom: `1px solid ${BORDER}`,
            }}>
              <label style={LIB_BTN_STYLE} title="Import a layout JSON file">
                ↑ Import Layout
                <input type="file" accept="application/json" hidden
                  onChange={(e) => e.target.files && importJSON(e.target.files[0])} />
              </label>

              <button onClick={exportJSON} style={LIB_BTN_STYLE} title="Export current layout as JSON">
                ↓ Export Layout
              </button>

              <label style={LIB_BTN_STYLE} title="Import a library JSON file">
                ↑ Import Library
                <input type="file" accept="application/json" hidden
                  onChange={(e) => e.target.files && importLibrary(e.target.files[0])} />
              </label>

              <button onClick={exportLibrary} style={LIB_BTN_STYLE} title="Copy all layouts as JSON">
                ↓ Export Library
              </button>
            </div>

            {/* Layout list */}
            <div style={{ padding: '12px 20px 20px' }}>
              {layouts.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 16px' }}>
                  <div className="empty-state-icon">📚</div>
                  <div className="empty-state-text">No saved layouts yet.<br />Save your current prompts to get started.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {layouts.map(l => (
                    <div
                      key={l.id}
                      className="library-item"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderBottom: `1px solid ${BORDER}`,
                        gap: 12,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div
                          className="library-title"
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'color 0.12s ease',
                          }}
                          title={l.title}
                        >
                          {l.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {l.cards.length} prompt{l.cards.length !== 1 ? 's' : ''} · {fmt(l.savedAt)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                        <button onClick={() => openLayout(l.id)} className="btn-accent btn-sm">
                          Open
                        </button>
                        <button onClick={() => deleteLayout(l.id)} className="btn-danger btn-sm">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
