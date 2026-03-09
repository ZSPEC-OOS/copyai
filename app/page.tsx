
'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
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

// Map CopyAI's internal layout shape to what WrkFlow expects
function mapToWrkFlowShape(layout: LayoutEntry) {
  return {
    id: layout.id,
    title: layout.title,
    prompts: layout.cards.map(c => ({ id: c.id, title: c.title, content: c.text })),
  };
}

// Dropdown menu item style
const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: 'transparent',
  color: TEXT,
  fontSize: 14,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.12s ease',
  boxSizing: 'border-box',
};

export default function Page() {
  // ----------- Embed mode (?embed=true hides the header for iframe use) -----------
  const [isEmbed, setIsEmbed] = useState(false);
  useEffect(() => {
    setIsEmbed(new URLSearchParams(window.location.search).get('embed') === 'true');
  }, []);

  // Signal to wrkflow that the page is ready (must fire on mount, before any message arrives)
  useEffect(() => {
    window.parent.postMessage({ type: 'COPYAI_READY' }, 'https://wolfkrow.onrender.com');
  }, []);

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

  // Hamburger menu + clear confirmation
  const [showMenu, setShowMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Refs so the WrkFlow message listener always sees current values without re-registering
  const layoutsRef = useRef<LayoutEntry[]>(layouts);
  useEffect(() => { layoutsRef.current = layouts; }, [layouts]);
  const dataLoadedRef = useRef(false);
  useEffect(() => { dataLoadedRef.current = dataLoaded; }, [dataLoaded]);
  // If WRKFLOW_REQUEST_LIBRARY arrives before Firestore finishes loading, store it here
  const pendingLibraryReqRef = useRef<{ source: MessageEventSource; origin: string } | null>(null);

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

  // WrkFlow postMessage protocol listener
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (event.origin !== 'https://wolfkrow.onrender.com') return;
      const { type, username, password } = event.data ?? {};
      const src = event.source as Window;

      if (type === 'WRKFLOW_INIT') {
        // wrkflow is ready — no action needed; COPYAI_READY was already sent on mount
      }

      if (type === 'WRKFLOW_LOGIN') {
        if (username === 'Jesse' && password === 'copyai') {
          setLoggedIn(true);
          src.postMessage({ type: 'COPYAI_LOGGED_IN' }, event.origin);
        } else {
          src.postMessage({ type: 'COPYAI_LOGIN_FAILED', error: 'Incorrect credentials' }, event.origin);
        }
      }

      if (type === 'WRKFLOW_REQUEST_LIBRARY') {
        if (dataLoadedRef.current) {
          src.postMessage(
            { type: 'COPYAI_LIBRARY', layouts: layoutsRef.current.map(mapToWrkFlowShape) },
            event.origin
          );
        } else {
          // Data not loaded yet — store the request and reply once Firestore finishes
          pendingLibraryReqRef.current = { source: event.source!, origin: event.origin };
        }
      }
    }

    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Respond to a pending WRKFLOW_REQUEST_LIBRARY once Firestore data is loaded
  useEffect(() => {
    if (!dataLoaded || !pendingLibraryReqRef.current) return;
    const { source, origin } = pendingLibraryReqRef.current;
    pendingLibraryReqRef.current = null;
    (source as Window).postMessage(
      { type: 'COPYAI_LIBRARY', layouts: layouts.map(mapToWrkFlowShape) },
      origin
    );
  }, [dataLoaded, layouts]);

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

  function clearPrompts() {
    setCards([]);
    setCurrentLayoutId(null);
    setCurrentLayoutTitle('');
    setExpanded(new Set());
    setReorganizing(false);
    setShowClearConfirm(false);
    toast('All prompts cleared');
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

  // ----------- Send layout to WrkFlow (embed mode, user clicked Open) -----------
  function sendToWrkFlow(layout: LayoutEntry) {
    window.parent.postMessage(
      { type: 'COPYAI_LAYOUT_SELECTED', layout: mapToWrkFlowShape(layout) },
      'https://wolfkrow.onrender.com'
    );
    toast(`✓ Sent "${layout.title}" to WrkFlow`);
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

  // ----------- Embed mode: library-only view -----------
  if (isEmbed) {
    return (
      <div style={{ minHeight: '100svh', background: BG, padding: '12px 12px 24px', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2 }}>
          Layouts
        </div>
        {layouts.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-text">No saved layouts yet.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {layouts.map(l => (
              <div
                key={l.id}
                style={{
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.title}>
                    {l.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {l.cards.length} prompt{l.cards.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button onClick={() => sendToWrkFlow(l)} className="btn-accent btn-sm" style={{ flex: '0 0 auto' }}>
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----------- Render -----------
  return (
    <div style={{ minHeight: '100svh', background: BG }}>

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <header className="header-bar" style={{ justifyContent: 'center', position: 'relative', display: isEmbed ? 'none' : undefined }}>

        {/* Left: Hamburger menu */}
        <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}>
          <button
            className="btn-default btn-sm"
            onClick={() => setShowMenu(m => !m)}
            style={{ padding: '6px 10px', fontSize: 17, lineHeight: 1 }}
            title="Menu"
          >
            ☰
          </button>

          {showMenu && (
            <>
              {/* Backdrop to close menu */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 150 }}
                onClick={() => setShowMenu(false)}
              />
              {/* Dropdown panel */}
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                background: PANEL,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 6,
                minWidth: 210,
                zIndex: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
                animation: 'fadeSlideIn 0.15s ease both',
              }}>
                {/* Library */}
                <button
                  style={MENU_ITEM_STYLE}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  onClick={() => { setShowLibrary(true); setShowMenu(false); }}
                >
                  📚 Library
                  {layouts.length > 0 && (
                    <span style={{ background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 'auto' }}>
                      {layouts.length}
                    </span>
                  )}
                </button>

                <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />

                {/* Current layout indicator */}
                {currentLayoutId && (
                  <div style={{ padding: '5px 12px', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ✦ {currentLayoutTitle}
                  </div>
                )}

                {/* Save */}
                <button
                  style={MENU_ITEM_STYLE}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  onClick={() => { saveLayout(); setShowMenu(false); }}
                >
                  💾 {currentLayoutId ? 'Save' : 'Save Layout'}
                </button>

                {/* New Layout */}
                <button
                  style={MENU_ITEM_STYLE}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  onClick={() => { createNewLayout(); setShowMenu(false); }}
                >
                  + New Layout
                </button>
              </div>
            </>
          )}
        </div>

        {/* Center: Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

        {/* Right: prompt count badge */}
        {cards.length > 0 && (
          <span className="count-badge" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}>
            {cards.length} prompt{cards.length !== 1 ? 's' : ''}
          </span>
        )}
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {cards.length > 1 && (
                  <button
                    className={reorganizing ? 'btn-accent btn-sm' : 'btn-default btn-sm'}
                    onClick={() => { setReorganizing(r => !r); setDragSrcIdx(null); setDragOverIdx(null); }}
                  >
                    {reorganizing ? '✓ Done Reorganizing' : '⇅ Reorganize'}
                  </button>
                )}
                <button
                  className="btn-danger btn-sm"
                  onClick={() => { setShowClearConfirm(c => !c); }}
                >
                  🗑 Clear
                </button>
              </div>
            </div>

            {/* ── Clear confirmation banner ─────────────────────── */}
            {showClearConfirm && (
              <div style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}>
                    Clear all prompts?
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Removes all {cards.length} prompt{cards.length !== 1 ? 's' : ''} from the page. Slide right to confirm.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                  {/* Slide-to-confirm range input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', whiteSpace: 'nowrap' }}>Slide →</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      defaultValue={0}
                      onChange={e => { if (+e.target.value >= 95) clearPrompts(); }}
                      style={{
                        width: 100,
                        accentColor: '#ef4444',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                  <button onClick={() => setShowClearConfirm(false)} className="btn-default btn-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
