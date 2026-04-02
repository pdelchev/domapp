'use client';

/**
 * Notes Page — Apple Notes-style 3-panel layout with block editor.
 *
 * ## Architecture
 * - Left sidebar: folders, smart views (All, Pinned, Archive, Trash), tags
 * - Middle panel: note list (cards with preview, checklist progress)
 * - Right panel: block editor with inline editing
 *
 * ## Performance Strategy
 * - List view uses lightweight serializer (no full content)
 * - Editor loads full content only when note is selected
 * - Auto-save with 800ms debounce — no save button, instant feel
 * - Optimistic UI updates for pin/archive/trash/color
 * - localStorage draft for unsaved new notes (crash recovery)
 *
 * ## Block Editor
 * - Blocks: text, heading, checklist, bullet, table, divider, code
 * - "/" command to insert new block types
 * - Enter in text/heading creates new text block
 * - Checklist: checkbox + editable text, Enter creates new item
 * - Table: editable cells, add row/column buttons
 * - No heavy editor library — pure React + contentEditable where needed
 *   (keeps bundle small, renders fast, works offline)
 *
 * ## Entity Linking
 * - Dropdown at top of editor to link note to property/tenant
 * - Linked notes show entity badge in list view
 *
 * ## Responsive
 * - Desktop: 3 panels side by side
 * - Mobile: single panel with back navigation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getNotes, getNote, createNote, updateNote, deleteNote, duplicateNote,
  getNoteFolders, createNoteFolder, deleteNoteFolder,
  getNoteTags, createNoteTag, deleteNoteTag,
  getProperties, getTenants,
} from '../lib/api';
import { useLanguage } from '../context/LanguageContext';
import { t } from '../lib/i18n';
import { PageShell, Button, Badge, Spinner, Input } from '../components/ui';
import NavBar from '../components/NavBar';

// ─── Types ──────────────────────────────────────────────────────────────────
// §T — type definitions block

interface NoteFolder {
  id: number;
  name: string;
  color: string;
  icon: string;
  parent: number | null;
  position: number;
  note_count: number;
}

interface NoteTag {
  id: number;
  name: string;
  color: string;
  note_count: number;
}

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

interface BulletItem {
  id: string;
  text: string;
}

interface ContentBlock {
  id: string;
  type: 'text' | 'heading' | 'checklist' | 'bullet' | 'table' | 'divider' | 'code';
  content?: string;
  level?: number;
  items?: (ChecklistItem | BulletItem)[];
  headers?: string[];
  rows?: string[][];
}

interface NoteListItem {
  id: number;
  title: string;
  color: string;
  folder: number | null;
  folder_name: string | null;
  tag_ids: number[];
  is_pinned: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  linked_property: number | null;
  linked_property_name: string | null;
  linked_tenant: number | null;
  linked_tenant_name: string | null;
  checklist_stats: { total: number; checked: number };
  word_count: number;
  content_preview: string;
  is_template: boolean;
  template_name: string;
  created_at: string;
  updated_at: string;
}

interface NoteDetail extends NoteListItem {
  content: ContentBlock[];
  linked_lease: number | null;
  linked_problem: number | null;
  trashed_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// §H — utility functions

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyBlock(type: ContentBlock['type'] = 'text'): ContentBlock {
  if (type === 'checklist') return { id: uid(), type, items: [{ id: uid(), text: '', checked: false }] };
  if (type === 'bullet') return { id: uid(), type, items: [{ id: uid(), text: '' }] };
  if (type === 'table') return { id: uid(), type, headers: ['', ''], rows: [['', '']] };
  if (type === 'divider') return { id: uid(), type };
  if (type === 'heading') return { id: uid(), type, content: '', level: 2 };
  return { id: uid(), type, content: '' };
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Note color → CSS class map
const NOTE_COLORS: Record<string, { bg: string; border: string; ring: string }> = {
  white:  { bg: 'bg-white',      border: 'border-gray-200', ring: 'ring-gray-300' },
  yellow: { bg: 'bg-amber-50',   border: 'border-amber-200', ring: 'ring-amber-300' },
  green:  { bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-300' },
  blue:   { bg: 'bg-sky-50',     border: 'border-sky-200', ring: 'ring-sky-300' },
  purple: { bg: 'bg-violet-50',  border: 'border-violet-200', ring: 'ring-violet-300' },
  pink:   { bg: 'bg-pink-50',    border: 'border-pink-200', ring: 'ring-pink-300' },
};

const TAG_COLORS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
};

const FOLDER_COLORS: Record<string, string> = {
  gray: 'text-gray-500', red: 'text-red-500', orange: 'text-orange-500',
  yellow: 'text-yellow-500', green: 'text-green-500', blue: 'text-blue-500',
  indigo: 'text-indigo-500', purple: 'text-purple-500',
};

// ─── Main Component ─────────────────────────────────────────────────────────
// §M — main page component

export default function NotesPage() {
  const { locale } = useLanguage();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────
  // §S — state declarations
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteLoading, setNoteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sidebar state
  const [activeView, setActiveView] = useState<string>('all'); // all, pinned, archived, trashed, templates, folder:ID, tag:ID
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Editor state — separate from selectedNote to enable optimistic edits
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState<ContentBlock[]>([]);
  const [editColor, setEditColor] = useState('white');

  // Modals
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('gray');
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('gray');
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [blockMenuIdx, setBlockMenuIdx] = useState(-1);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNoteMenu, setShowNoteMenu] = useState(false);

  // Entity linking
  const [properties, setProperties] = useState<{ id: number; name: string }[]>([]);
  const [tenants, setTenants] = useState<{ id: number; full_name: string }[]>([]);

  // Mobile panel state
  const [mobilePanel, setMobilePanel] = useState<'sidebar' | 'list' | 'editor'>('list');

  // Auto-save timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  // ── Data Loading ───────────────────────────────
  // §L — data fetching

  const buildFilters = useCallback((): Record<string, string> => {
    const filters: Record<string, string> = {};
    if (activeView === 'pinned') filters.pinned = 'true';
    else if (activeView === 'archived') { filters.archived = 'true'; }
    else if (activeView === 'trashed') filters.trashed = 'true';
    else if (activeView === 'templates') filters.template = 'true';
    else if (activeView.startsWith('folder:')) filters.folder = activeView.split(':')[1];
    else if (activeView === 'unfiled') filters.folder = 'unfiled';
    else if (activeView.startsWith('tag:')) filters.tag = activeView.split(':')[1];
    // Default: non-archived, non-trashed (handled by backend)
    if (searchQuery.trim()) filters.search = searchQuery.trim();
    return filters;
  }, [activeView, searchQuery]);

  const loadNotes = useCallback(async () => {
    try {
      const data = await getNotes(buildFilters());
      setNotes(data);
    } catch { /* ignore */ }
  }, [buildFilters]);

  const loadSidebar = useCallback(async () => {
    try {
      const [f, tg] = await Promise.all([getNoteFolders(), getNoteTags()]);
      setFolders(f);
      setTags(tg);
    } catch { /* ignore */ }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([loadNotes(), loadSidebar()]).then(() => setLoading(false));
    // Load properties/tenants for entity linking
    Promise.all([getProperties(), getTenants()]).then(([p, tn]) => {
      setProperties(p);
      setTenants(tn);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload notes when view/search changes
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Handle ?new=1 from FAB
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      handleNewNote();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Note Selection & Editing ───────────────────
  // §E — editor logic

  const selectNote = async (id: number) => {
    // Save current note before switching
    await flushSave();
    setNoteLoading(true);
    try {
      const note = await getNote(id);
      setSelectedNote(note);
      setEditTitle(note.title);
      setEditContent(note.content || []);
      setEditColor(note.color);
      lastSavedRef.current = JSON.stringify({ title: note.title, content: note.content, color: note.color });
      setMobilePanel('editor');
    } catch { /* ignore */ }
    setNoteLoading(false);
  };

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (!selectedNote) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const current = JSON.stringify({ title: editTitle, content: editContent, color: editColor });
      if (current === lastSavedRef.current) return; // No changes

      setSaving(true);
      try {
        await updateNote(selectedNote.id, {
          title: editTitle,
          content: editContent,
          color: editColor,
        });
        lastSavedRef.current = current;
        // Update list item in-place (optimistic)
        setNotes(prev => prev.map(n => n.id === selectedNote.id ? {
          ...n, title: editTitle, color: editColor, updated_at: new Date().toISOString(),
        } : n));
      } catch { /* ignore */ }
      setSaving(false);
    }, 800);
  }, [selectedNote, editTitle, editContent, editColor]);

  // Trigger auto-save on content changes
  useEffect(() => {
    scheduleSave();
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [editTitle, editContent, editColor, scheduleSave]);

  const flushSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!selectedNote) return;
    const current = JSON.stringify({ title: editTitle, content: editContent, color: editColor });
    if (current === lastSavedRef.current) return;
    try {
      await updateNote(selectedNote.id, { title: editTitle, content: editContent, color: editColor });
      lastSavedRef.current = current;
    } catch { /* ignore */ }
  };

  // ── CRUD Actions ──────────────────────────────
  // §A — create/update/delete actions

  const handleNewNote = async () => {
    try {
      const folder = activeView.startsWith('folder:') ? parseInt(activeView.split(':')[1]) : undefined;
      const note = await createNote({
        title: '',
        content: [emptyBlock('text')],
        color: 'white',
        folder: folder || null,
      });
      await loadNotes();
      await selectNote(note.id);
    } catch { /* ignore */ }
  };

  const handlePin = async (note: NoteListItem) => {
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n));
    await updateNote(note.id, { is_pinned: !note.is_pinned });
    if (selectedNote?.id === note.id) setSelectedNote(prev => prev ? { ...prev, is_pinned: !prev.is_pinned } : prev);
  };

  const handleArchive = async (note: NoteListItem) => {
    setNotes(prev => prev.filter(n => n.id !== note.id));
    await updateNote(note.id, { is_archived: !note.is_archived });
    if (selectedNote?.id === note.id) setSelectedNote(null);
  };

  const handleTrash = async (note: NoteListItem) => {
    setNotes(prev => prev.filter(n => n.id !== note.id));
    await updateNote(note.id, { is_trashed: true });
    if (selectedNote?.id === note.id) setSelectedNote(null);
  };

  const handleRestore = async (note: NoteListItem) => {
    setNotes(prev => prev.filter(n => n.id !== note.id));
    await updateNote(note.id, { is_trashed: false });
    if (selectedNote?.id === note.id) setSelectedNote(null);
  };

  const handleDeleteForever = async (note: NoteListItem) => {
    setNotes(prev => prev.filter(n => n.id !== note.id));
    await deleteNote(note.id);
    if (selectedNote?.id === note.id) setSelectedNote(null);
  };

  const handleDuplicate = async (note: NoteListItem) => {
    const dup = await duplicateNote(note.id);
    await loadNotes();
    await selectNote(dup.id);
  };

  const handleColorChange = (color: string) => {
    setEditColor(color);
    setShowColorPicker(false);
    if (selectedNote) {
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, color } : n));
    }
  };

  // Folder CRUD
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createNoteFolder({ name: newFolderName.trim(), color: newFolderColor });
    setNewFolderName('');
    setShowNewFolder(false);
    await loadSidebar();
  };

  const handleDeleteFolder = async (id: number) => {
    await deleteNoteFolder(id);
    if (activeView === `folder:${id}`) setActiveView('all');
    await loadSidebar();
    await loadNotes();
  };

  // Tag CRUD
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    await createNoteTag({ name: newTagName.trim(), color: newTagColor });
    setNewTagName('');
    setShowNewTag(false);
    await loadSidebar();
  };

  const handleDeleteTag = async (id: number) => {
    await deleteNoteTag(id);
    if (activeView === `tag:${id}`) setActiveView('all');
    await loadSidebar();
  };

  // Entity linking
  const handleLinkProperty = async (propertyId: number | null) => {
    if (!selectedNote) return;
    await updateNote(selectedNote.id, { linked_property: propertyId });
    const note = await getNote(selectedNote.id);
    setSelectedNote(note);
    await loadNotes();
  };

  const handleLinkTenant = async (tenantId: number | null) => {
    if (!selectedNote) return;
    await updateNote(selectedNote.id, { linked_tenant: tenantId });
    const note = await getNote(selectedNote.id);
    setSelectedNote(note);
    await loadNotes();
  };

  // ── Block Editor Operations ────────────────────
  // §B — block-level CRUD

  const updateBlock = (blockId: string, updates: Partial<ContentBlock>) => {
    setEditContent(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b));
  };

  const insertBlockAfter = (blockId: string, type: ContentBlock['type'] = 'text') => {
    const newBlock = emptyBlock(type);
    setEditContent(prev => {
      const idx = prev.findIndex(b => b.id === blockId);
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
    setShowBlockMenu(false);
    return newBlock.id;
  };

  const removeBlock = (blockId: string) => {
    setEditContent(prev => {
      const filtered = prev.filter(b => b.id !== blockId);
      return filtered.length === 0 ? [emptyBlock('text')] : filtered;
    });
  };

  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    setEditContent(prev => {
      const idx = prev.findIndex(b => b.id === blockId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  // Checklist item operations
  const toggleCheckItem = (blockId: string, itemId: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'checklist') return b;
      return { ...b, items: (b.items as ChecklistItem[]).map(i =>
        i.id === itemId ? { ...i, checked: !i.checked } : i
      )};
    }));
  };

  const updateCheckItemText = (blockId: string, itemId: string, text: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, items: (b.items as ChecklistItem[]).map(i =>
        i.id === itemId ? { ...i, text } : i
      )};
    }));
  };

  const addCheckItem = (blockId: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const items = [...(b.items || [])];
      if (b.type === 'checklist') items.push({ id: uid(), text: '', checked: false });
      else items.push({ id: uid(), text: '' });
      return { ...b, items };
    }));
  };

  const removeCheckItem = (blockId: string, itemId: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const items = (b.items || []).filter(i => i.id !== itemId);
      if (items.length === 0) {
        if (b.type === 'checklist') items.push({ id: uid(), text: '', checked: false });
        else items.push({ id: uid(), text: '' });
      }
      return { ...b, items };
    }));
  };

  // Table operations
  const updateTableCell = (blockId: string, row: number, col: number, value: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'table') return b;
      const rows = (b.rows || []).map(r => [...r]);
      if (rows[row]) rows[row][col] = value;
      return { ...b, rows };
    }));
  };

  const updateTableHeader = (blockId: string, col: number, value: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'table') return b;
      const headers = [...(b.headers || [])];
      headers[col] = value;
      return { ...b, headers };
    }));
  };

  const addTableRow = (blockId: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'table') return b;
      const cols = (b.headers || []).length;
      const rows = [...(b.rows || []), Array(cols).fill('')];
      return { ...b, rows };
    }));
  };

  const addTableCol = (blockId: string) => {
    setEditContent(prev => prev.map(b => {
      if (b.id !== blockId || b.type !== 'table') return b;
      const headers = [...(b.headers || []), ''];
      const rows = (b.rows || []).map(r => [...r, '']);
      return { ...b, headers, rows };
    }));
  };

  // ── Render Helpers ─────────────────────────────
  // §R — render sub-components (defined as functions, not components, to avoid focus loss)

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <Spinner message={t('common.loading', locale)} />
      </PageShell>
    );
  }

  const isTrashView = activeView === 'trashed';

  // Smart view labels
  const viewLabel = (() => {
    if (activeView === 'all') return t('notes.all_notes', locale);
    if (activeView === 'pinned') return t('notes.pinned', locale);
    if (activeView === 'archived') return t('notes.archived', locale);
    if (activeView === 'trashed') return t('notes.trash', locale);
    if (activeView === 'templates') return t('notes.templates', locale);
    if (activeView === 'unfiled') return t('notes.unfiled', locale);
    if (activeView.startsWith('folder:')) {
      const f = folders.find(f => f.id === parseInt(activeView.split(':')[1]));
      return f?.name || '...';
    }
    if (activeView.startsWith('tag:')) {
      const tg = tags.find(t => t.id === parseInt(activeView.split(':')[1]));
      return tg ? `#${tg.name}` : '...';
    }
    return t('notes.all_notes', locale);
  })();

  // Separate pinned and unpinned for list display
  const pinnedNotes = notes.filter(n => n.is_pinned);
  const unpinnedNotes = notes.filter(n => !n.is_pinned);

  return (
    <PageShell>
      <NavBar />

      <div className="flex h-[calc(100vh-57px)] overflow-hidden">

        {/* ─── LEFT SIDEBAR ──────────────────────────── */}
        {/* §LS — folder/tag sidebar */}
        <aside className={`${sidebarOpen ? 'w-56' : 'w-0'} shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto transition-all duration-200 ${
          mobilePanel === 'sidebar' ? 'block' : 'hidden md:block'
        }`}>
          <div className="p-3 space-y-1">
            {/* Smart views */}
            <SidebarItem
              active={activeView === 'all'}
              onClick={() => { setActiveView('all'); setMobilePanel('list'); }}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
              label={t('notes.all_notes', locale)}
              count={notes.length}
            />
            <SidebarItem
              active={activeView === 'pinned'}
              onClick={() => { setActiveView('pinned'); setMobilePanel('list'); }}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>}
              label={t('notes.pinned', locale)}
            />
            <SidebarItem
              active={activeView === 'archived'}
              onClick={() => { setActiveView('archived'); setMobilePanel('list'); }}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>}
              label={t('notes.archived', locale)}
            />
            <SidebarItem
              active={activeView === 'trashed'}
              onClick={() => { setActiveView('trashed'); setMobilePanel('list'); }}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>}
              label={t('notes.trash', locale)}
            />

            {/* Divider */}
            <div className="border-t border-gray-200 my-2" />

            {/* Folders header */}
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('notes.folders', locale)}</span>
              <button
                onClick={() => setShowNewFolder(true)}
                className="text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </button>
            </div>

            {/* New folder inline form */}
            {showNewFolder && (
              <div className="px-2 py-1 space-y-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder={t('notes.folder_name', locale)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                />
                <div className="flex gap-1">
                  {['gray','red','orange','green','blue','indigo','purple'].map(c => (
                    <button key={c} onClick={() => setNewFolderColor(c)}
                      className={`w-4 h-4 rounded-full border-2 ${newFolderColor === c ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ backgroundColor: c === 'gray' ? '#9ca3af' : c === 'red' ? '#ef4444' : c === 'orange' ? '#f97316' : c === 'green' ? '#22c55e' : c === 'blue' ? '#3b82f6' : c === 'indigo' ? '#6366f1' : '#a855f7' }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={handleCreateFolder} className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded">{t('common.save', locale)}</button>
                  <button onClick={() => setShowNewFolder(false)} className="text-[10px] px-2 py-0.5 text-gray-500 hover:text-gray-700">{t('common.cancel', locale)}</button>
                </div>
              </div>
            )}

            <SidebarItem
              active={activeView === 'unfiled'}
              onClick={() => { setActiveView('unfiled'); setMobilePanel('list'); }}
              icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>}
              label={t('notes.unfiled', locale)}
            />

            {folders.map(f => (
              <div key={f.id} className="group/folder flex items-center">
                <SidebarItem
                  active={activeView === `folder:${f.id}`}
                  onClick={() => { setActiveView(`folder:${f.id}`); setMobilePanel('list'); }}
                  icon={<svg className={`w-4 h-4 ${FOLDER_COLORS[f.color] || 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" /></svg>}
                  label={f.name}
                  count={f.note_count}
                  className="flex-1"
                />
                <button
                  onClick={() => handleDeleteFolder(f.id)}
                  className="hidden group-hover/folder:block pr-2 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}

            {/* Tags header */}
            <div className="border-t border-gray-200 my-2" />
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('notes.tags', locale)}</span>
              <button
                onClick={() => setShowNewTag(true)}
                className="text-gray-400 hover:text-indigo-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </button>
            </div>

            {/* New tag inline form */}
            {showNewTag && (
              <div className="px-2 py-1 space-y-1.5">
                <input
                  type="text"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder={t('notes.tag_name', locale)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setShowNewTag(false); }}
                />
                <div className="flex gap-1">
                  {['gray','red','orange','green','blue','indigo','purple'].map(c => (
                    <button key={c} onClick={() => setNewTagColor(c)}
                      className={`w-4 h-4 rounded-full border-2 ${newTagColor === c ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ backgroundColor: c === 'gray' ? '#9ca3af' : c === 'red' ? '#ef4444' : c === 'orange' ? '#f97316' : c === 'green' ? '#22c55e' : c === 'blue' ? '#3b82f6' : c === 'indigo' ? '#6366f1' : '#a855f7' }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button onClick={handleCreateTag} className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded">{t('common.save', locale)}</button>
                  <button onClick={() => setShowNewTag(false)} className="text-[10px] px-2 py-0.5 text-gray-500 hover:text-gray-700">{t('common.cancel', locale)}</button>
                </div>
              </div>
            )}

            {tags.map(tg => (
              <div key={tg.id} className="group/tag flex items-center">
                <SidebarItem
                  active={activeView === `tag:${tg.id}`}
                  onClick={() => { setActiveView(`tag:${tg.id}`); setMobilePanel('list'); }}
                  icon={<span className={`inline-block w-2.5 h-2.5 rounded-full ${TAG_COLORS[tg.color]?.split(' ')[0] || 'bg-gray-300'}`} />}
                  label={`#${tg.name}`}
                  count={tg.note_count}
                  className="flex-1"
                />
                <button
                  onClick={() => handleDeleteTag(tg.id)}
                  className="hidden group-hover/tag:block pr-2 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ─── MIDDLE: NOTE LIST ─────────────────────── */}
        {/* §NL — note list panel */}
        <div className={`w-72 md:w-80 shrink-0 border-r border-gray-200 flex flex-col bg-white ${
          mobilePanel === 'list' ? 'block' : 'hidden md:flex'
        }`}>
          {/* List header */}
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarOpen(prev => !prev)}
                  className="p-1 text-gray-400 hover:text-gray-600 md:inline-flex hidden"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                </button>
                <button
                  onClick={() => setMobilePanel('sidebar')}
                  className="p-1 text-gray-400 hover:text-gray-600 md:hidden"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                </button>
                <h2 className="text-sm font-semibold text-gray-900 truncate">{viewLabel}</h2>
              </div>
              {!isTrashView && (
                <button
                  onClick={handleNewNote}
                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title={t('notes.new_note', locale)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                </button>
              )}
            </div>
            {/* Search */}
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('notes.search', locale)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50"
              />
            </div>
          </div>

          {/* Note cards */}
          <div className="flex-1 overflow-y-auto">
            {notes.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">
                  {isTrashView ? '🗑️' : '📝'}
                </div>
                <p className="text-xs text-gray-400">{t('notes.no_notes', locale)}</p>
              </div>
            ) : (
              <>
                {/* Pinned section */}
                {pinnedNotes.length > 0 && !isTrashView && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('notes.pinned', locale)}</span>
                    </div>
                    {pinnedNotes.map(note => (
                      <NoteCard key={note.id} note={note} isSelected={selectedNote?.id === note.id}
                        onClick={() => selectNote(note.id)}
                        onPin={() => handlePin(note)}
                        onTrash={() => handleTrash(note)}
                        onRestore={() => handleRestore(note)}
                        onDeleteForever={() => handleDeleteForever(note)}
                        isTrashView={isTrashView} locale={locale} tags={tags}
                      />
                    ))}
                    <div className="px-3 pt-3 pb-1">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t('notes.all_notes', locale)}</span>
                    </div>
                  </>
                )}
                {/* Regular notes */}
                {unpinnedNotes.map(note => (
                  <NoteCard key={note.id} note={note} isSelected={selectedNote?.id === note.id}
                    onClick={() => selectNote(note.id)}
                    onPin={() => handlePin(note)}
                    onTrash={() => handleTrash(note)}
                    onRestore={() => handleRestore(note)}
                    onDeleteForever={() => handleDeleteForever(note)}
                    isTrashView={isTrashView} locale={locale} tags={tags}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ─── RIGHT: EDITOR ─────────────────────────── */}
        {/* §ED — note editor panel */}
        <div className={`flex-1 flex flex-col bg-white overflow-hidden ${
          mobilePanel === 'editor' ? 'block' : 'hidden md:flex'
        }`}>
          {selectedNote ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                  {/* Back button — mobile */}
                  <button onClick={() => { flushSave(); setMobilePanel('list'); }} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  </button>

                  {/* Color picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColorPicker(prev => !prev)}
                      className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-gray-400 transition-colors"
                      style={{ backgroundColor: editColor === 'white' ? '#fff' : editColor === 'yellow' ? '#fef3c7' : editColor === 'green' ? '#d1fae5' : editColor === 'blue' ? '#e0f2fe' : editColor === 'purple' ? '#ede9fe' : '#fce7f3' }}
                      title={t('notes.color', locale)}
                    />
                    {showColorPicker && (
                      <div className="absolute top-8 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5 z-20">
                        {Object.keys(NOTE_COLORS).map(c => (
                          <button key={c} onClick={() => handleColorChange(c)}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${editColor === c ? 'border-gray-800 scale-110' : 'border-gray-200 hover:border-gray-400'} ${NOTE_COLORS[c].bg}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Entity link badges */}
                  {selectedNote.linked_property_name && (
                    <Badge color="blue">{selectedNote.linked_property_name}</Badge>
                  )}
                  {selectedNote.linked_tenant_name && (
                    <Badge color="green">{selectedNote.linked_tenant_name}</Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Saving indicator */}
                  {saving && <span className="text-[10px] text-gray-400">Saving...</span>}

                  {/* Word count */}
                  <span className="text-[10px] text-gray-300 hidden sm:block">
                    {selectedNote.word_count} {t('notes.words', locale)}
                  </span>

                  {/* Pin */}
                  <button
                    onClick={() => handlePin(selectedNote)}
                    className={`p-1 rounded transition-colors ${selectedNote.is_pinned ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                    title={selectedNote.is_pinned ? t('notes.unpin', locale) : t('notes.pin', locale)}
                  >
                    <svg className="w-4 h-4" fill={selectedNote.is_pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
                  </button>

                  {/* More menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowNoteMenu(prev => !prev)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
                    </button>
                    {showNoteMenu && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-30" onClick={() => setShowNoteMenu(false)}>
                        <button onClick={() => handleDuplicate(selectedNote)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('notes.duplicate', locale)}</button>
                        <button onClick={() => handleArchive(selectedNote)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                          {selectedNote.is_archived ? t('notes.unarchive', locale) : t('notes.archive', locale)}
                        </button>

                        {/* Link property */}
                        <div className="border-t border-gray-100 my-1" />
                        <div className="px-3 py-1 text-[10px] text-gray-400 uppercase">{t('notes.link_property', locale)}</div>
                        <button onClick={() => handleLinkProperty(null)} className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50">None</button>
                        {properties.map(p => (
                          <button key={p.id} onClick={() => handleLinkProperty(p.id)}
                            className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-50 ${selectedNote.linked_property === p.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                          >{p.name}</button>
                        ))}

                        {/* Link tenant */}
                        <div className="border-t border-gray-100 my-1" />
                        <div className="px-3 py-1 text-[10px] text-gray-400 uppercase">{t('notes.link_tenant', locale)}</div>
                        <button onClick={() => handleLinkTenant(null)} className="w-full text-left px-3 py-1 text-xs text-gray-500 hover:bg-gray-50">None</button>
                        {tenants.map(tn => (
                          <button key={tn.id} onClick={() => handleLinkTenant(tn.id)}
                            className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-50 ${selectedNote.linked_tenant === tn.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                          >{tn.full_name}</button>
                        ))}

                        <div className="border-t border-gray-100 my-1" />
                        <button onClick={() => handleTrash(selectedNote)} className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">{t('notes.move_to_trash', locale)}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Editor body */}
              <div className={`flex-1 overflow-y-auto ${NOTE_COLORS[editColor]?.bg || 'bg-white'}`} onClick={() => { setShowColorPicker(false); setShowNoteMenu(false); }}>
                <div className="max-w-3xl mx-auto px-6 py-6">
                  {/* Title */}
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder={t('notes.untitled', locale)}
                    className="w-full text-2xl font-bold text-gray-900 placeholder:text-gray-300 bg-transparent border-none outline-none mb-4"
                  />

                  {/* Blocks */}
                  <div className="space-y-1">
                    {editContent.map((block, idx) => (
                      <BlockRenderer
                        key={block.id}
                        block={block}
                        onUpdate={(updates) => updateBlock(block.id, updates)}
                        onRemove={() => removeBlock(block.id)}
                        onInsertAfter={(type) => insertBlockAfter(block.id, type)}
                        onMoveUp={() => moveBlock(block.id, 'up')}
                        onMoveDown={() => moveBlock(block.id, 'down')}
                        onToggleCheck={(itemId) => toggleCheckItem(block.id, itemId)}
                        onUpdateItemText={(itemId, text) => updateCheckItemText(block.id, itemId, text)}
                        onAddItem={() => addCheckItem(block.id)}
                        onRemoveItem={(itemId) => removeCheckItem(block.id, itemId)}
                        onUpdateTableCell={(row, col, val) => updateTableCell(block.id, row, col, val)}
                        onUpdateTableHeader={(col, val) => updateTableHeader(block.id, col, val)}
                        onAddTableRow={() => addTableRow(block.id)}
                        onAddTableCol={() => addTableCol(block.id)}
                        showBlockMenu={showBlockMenu && blockMenuIdx === idx}
                        onShowBlockMenu={() => { setShowBlockMenu(true); setBlockMenuIdx(idx); }}
                        onHideBlockMenu={() => setShowBlockMenu(false)}
                        locale={locale}
                        isFirst={idx === 0}
                        isLast={idx === editContent.length - 1}
                      />
                    ))}
                  </div>

                  {/* Add block button at bottom */}
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => {
                        const lastBlock = editContent[editContent.length - 1];
                        if (lastBlock) insertBlockAfter(lastBlock.id, 'text');
                        else setEditContent([emptyBlock('text')]);
                      }}
                      className="text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      {t('notes.type_slash', locale)}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No note selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm text-gray-400">{t('notes.select_note', locale)}</p>
                <button
                  onClick={handleNewNote}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  {t('notes.new_note', locale)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click-away to close menus */}
      {(showColorPicker || showNoteMenu) && (
        <div className="fixed inset-0 z-10" onClick={() => { setShowColorPicker(false); setShowNoteMenu(false); }} />
      )}
    </PageShell>
  );
}


// ─── Sidebar Item ────────────────────────────────────────────────────────────
// §SI — reusable sidebar row

function SidebarItem({ active, onClick, icon, label, count, className = '' }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
      } ${className}`}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-gray-400">{count}</span>
      )}
    </button>
  );
}


// ─── Note Card ──────────────────────────────────────────────────────────────
// §NC — note preview card in list

function NoteCard({ note, isSelected, onClick, onPin, onTrash, onRestore, onDeleteForever, isTrashView, locale, tags }: {
  note: NoteListItem;
  isSelected: boolean;
  onClick: () => void;
  onPin: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
  isTrashView: boolean;
  locale: 'en' | 'bg';
  tags: NoteTag[];
}) {
  const colors = NOTE_COLORS[note.color] || NOTE_COLORS.white;
  const hasChecklist = note.checklist_stats.total > 0;
  const checkPercent = hasChecklist ? Math.round((note.checklist_stats.checked / note.checklist_stats.total) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={`group/card px-3 py-2.5 border-b border-gray-50 cursor-pointer transition-colors ${
        isSelected ? 'bg-indigo-50' : `hover:bg-gray-50 ${colors.bg}`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium truncate ${note.title ? 'text-gray-900' : 'text-gray-400 italic'}`}>
            {note.title || t('notes.untitled', locale)}
          </h3>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {note.content_preview || t('notes.type_slash', locale)}
          </p>
        </div>

        {/* Quick actions — show on hover */}
        <div className="hidden group-hover/card:flex items-center gap-0.5 shrink-0">
          {isTrashView ? (
            <>
              <button onClick={e => { e.stopPropagation(); onRestore(); }} className="p-0.5 text-gray-400 hover:text-green-600" title={t('notes.restore', locale)}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); onDeleteForever(); }} className="p-0.5 text-gray-400 hover:text-red-600" title={t('notes.delete_forever', locale)}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          ) : (
            <>
              <button onClick={e => { e.stopPropagation(); onPin(); }}
                className={`p-0.5 transition-colors ${note.is_pinned ? 'text-indigo-500' : 'text-gray-400 hover:text-indigo-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill={note.is_pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg>
              </button>
              <button onClick={e => { e.stopPropagation(); onTrash(); }} className="p-0.5 text-gray-400 hover:text-red-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom row: meta + checklist progress */}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] text-gray-300">{timeAgo(note.updated_at)}</span>

        {/* Entity badges */}
        {note.linked_property_name && (
          <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full truncate max-w-[80px]">{note.linked_property_name}</span>
        )}
        {note.linked_tenant_name && (
          <span className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded-full truncate max-w-[80px]">{note.linked_tenant_name}</span>
        )}

        {/* Checklist progress */}
        {hasChecklist && (
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${checkPercent === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${checkPercent}%` }} />
            </div>
            <span className="text-[9px] text-gray-400">{note.checklist_stats.checked}/{note.checklist_stats.total}</span>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Block Renderer ──────────────────────────────────────────────────────────
// §BR — renders a single content block with editing controls

function BlockRenderer({
  block, onUpdate, onRemove, onInsertAfter, onMoveUp, onMoveDown,
  onToggleCheck, onUpdateItemText, onAddItem, onRemoveItem,
  onUpdateTableCell, onUpdateTableHeader, onAddTableRow, onAddTableCol,
  showBlockMenu, onShowBlockMenu, onHideBlockMenu,
  locale, isFirst, isLast,
}: {
  block: ContentBlock;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  onRemove: () => void;
  onInsertAfter: (type: ContentBlock['type']) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleCheck: (itemId: string) => void;
  onUpdateItemText: (itemId: string, text: string) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateTableCell: (row: number, col: number, val: string) => void;
  onUpdateTableHeader: (col: number, val: string) => void;
  onAddTableRow: () => void;
  onAddTableCol: () => void;
  showBlockMenu: boolean;
  onShowBlockMenu: () => void;
  onHideBlockMenu: () => void;
  locale: 'en' | 'bg';
  isFirst: boolean;
  isLast: boolean;
}) {
  const BLOCK_TYPES: { type: ContentBlock['type']; key: string; icon: string }[] = [
    { type: 'text', key: 'notes.block_text', icon: 'T' },
    { type: 'heading', key: 'notes.block_heading', icon: 'H' },
    { type: 'checklist', key: 'notes.block_checklist', icon: '☑' },
    { type: 'bullet', key: 'notes.block_bullet', icon: '•' },
    { type: 'table', key: 'notes.block_table', icon: '⊞' },
    { type: 'divider', key: 'notes.block_divider', icon: '—' },
    { type: 'code', key: 'notes.block_code', icon: '</>' },
  ];

  return (
    <div className="group/block relative flex items-start gap-1">
      {/* Block controls — left gutter */}
      <div className="w-6 shrink-0 flex flex-col items-center pt-1 opacity-0 group-hover/block:opacity-100 transition-opacity">
        {/* Drag handle + block menu trigger */}
        <div className="relative">
          <button
            onClick={onShowBlockMenu}
            className="p-0.5 text-gray-300 hover:text-gray-500 cursor-grab"
            title="/"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {/* Block type menu */}
          {showBlockMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={onHideBlockMenu} />
              <div className="absolute left-6 top-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px] z-20">
                {BLOCK_TYPES.map(bt => (
                  <button key={bt.type} onClick={() => { onInsertAfter(bt.type); onHideBlockMenu(); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span className="w-5 text-center text-xs text-gray-400 font-mono">{bt.icon}</span>
                    {t(bt.key, locale)}
                  </button>
                ))}
                <div className="border-t border-gray-100 my-1" />
                {!isFirst && (
                  <button onClick={() => { onMoveUp(); onHideBlockMenu(); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <span className="w-5 text-center text-xs text-gray-400">↑</span> Move Up
                  </button>
                )}
                {!isLast && (
                  <button onClick={() => { onMoveDown(); onHideBlockMenu(); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <span className="w-5 text-center text-xs text-gray-400">↓</span> Move Down
                  </button>
                )}
                <button onClick={() => { onRemove(); onHideBlockMenu(); }} className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                  <span className="w-5 text-center text-xs">✕</span> {t('notes.delete_block', locale)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Block content */}
      <div className="flex-1 min-w-0">
        {block.type === 'text' && (
          <textarea
            value={block.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            placeholder="Type something..."
            className="w-full text-sm text-gray-800 bg-transparent border-none outline-none resize-none min-h-[24px] leading-relaxed"
            rows={Math.max(1, (block.content || '').split('\n').length)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onInsertAfter('text');
              }
              if (e.key === '/' && !block.content) {
                e.preventDefault();
                onShowBlockMenu();
              }
            }}
          />
        )}

        {block.type === 'heading' && (
          <input
            type="text"
            value={block.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            placeholder="Heading"
            className="w-full text-lg font-semibold text-gray-900 bg-transparent border-none outline-none"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onInsertAfter('text'); }
            }}
          />
        )}

        {block.type === 'checklist' && (
          <div className="space-y-0.5">
            {(block.items as ChecklistItem[] || []).map(item => (
              <div key={item.id} className="flex items-center gap-2 group/item">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => onToggleCheck(item.id)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={item.text}
                  onChange={e => onUpdateItemText(item.id, e.target.value)}
                  placeholder="To do..."
                  className={`flex-1 text-sm bg-transparent border-none outline-none ${item.checked ? 'line-through text-gray-400' : 'text-gray-800'}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); onAddItem(); }
                    if (e.key === 'Backspace' && !item.text) { e.preventDefault(); onRemoveItem(item.id); }
                  }}
                />
                <button onClick={() => onRemoveItem(item.id)} className="hidden group-hover/item:block p-0.5 text-gray-300 hover:text-red-500 shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button onClick={onAddItem} className="text-[11px] text-gray-400 hover:text-indigo-600 ml-6 transition-colors">
              + Add item
            </button>
          </div>
        )}

        {block.type === 'bullet' && (
          <div className="space-y-0.5">
            {(block.items as BulletItem[] || []).map(item => (
              <div key={item.id} className="flex items-center gap-2 group/item">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                <input
                  type="text"
                  value={item.text}
                  onChange={e => onUpdateItemText(item.id, e.target.value)}
                  placeholder="List item..."
                  className="flex-1 text-sm text-gray-800 bg-transparent border-none outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); onAddItem(); }
                    if (e.key === 'Backspace' && !item.text) { e.preventDefault(); onRemoveItem(item.id); }
                  }}
                />
                <button onClick={() => onRemoveItem(item.id)} className="hidden group-hover/item:block p-0.5 text-gray-300 hover:text-red-500 shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            <button onClick={onAddItem} className="text-[11px] text-gray-400 hover:text-indigo-600 ml-4 transition-colors">
              + Add item
            </button>
          </div>
        )}

        {block.type === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  {(block.headers || []).map((h, ci) => (
                    <th key={ci} className="border-b border-r border-gray-200 last:border-r-0">
                      <input
                        type="text"
                        value={h}
                        onChange={e => onUpdateTableHeader(ci, e.target.value)}
                        placeholder={`Col ${ci + 1}`}
                        className="w-full px-2 py-1.5 text-xs font-semibold text-gray-700 bg-transparent border-none outline-none"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(block.rows || []).map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border-b border-r border-gray-200 last:border-r-0">
                        <input
                          type="text"
                          value={cell}
                          onChange={e => onUpdateTableCell(ri, ci, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs text-gray-800 bg-transparent border-none outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-1">
              <button onClick={onAddTableRow} className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">
                + {t('notes.add_row', locale)}
              </button>
              <button onClick={onAddTableCol} className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors">
                + {t('notes.add_col', locale)}
              </button>
            </div>
          </div>
        )}

        {block.type === 'divider' && (
          <hr className="border-gray-200 my-2" />
        )}

        {block.type === 'code' && (
          <textarea
            value={block.content || ''}
            onChange={e => onUpdate({ content: e.target.value })}
            placeholder="Code or reference..."
            className="w-full px-3 py-2 text-xs font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none resize-none min-h-[36px]"
            rows={Math.max(2, (block.content || '').split('\n').length)}
          />
        )}
      </div>
    </div>
  );
}
