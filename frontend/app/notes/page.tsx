'use client';

/**
 * NOTES APP - Complete Redesign with BlockNote
 * ============================================
 * Modern 3-column layout:
 * - Sidebar: Folders, Tags, Filters
 * - Note List: Search, preview, actions
 * - Editor: BlockNote (rich, collaborative-ready)
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageShell, PageContent, Button, Card, Input, Badge, EmptyState, Spinner, Alert } from '../components/ui';
import NavBar from '../components/NavBar';
import { useLanguage } from '../context/LanguageContext';
import {
  getNotes, getNoteFolders, getNoteTags, createNote, updateNote, deleteNote,
  createNoteFolder, updateNoteFolder, deleteNoteFolder,
} from '../lib/api';
import TiptapEditor from './TiptapEditor';

interface Note {
  id: number;
  folder_id: number | null;
  title: string;
  content: any; // JSON from BlockNote
  content_type?: 'blocks' | 'richtext' | 'plaintext';
  color: string;
  is_pinned: boolean;
  is_archived: boolean;
  is_trashed: boolean;
  tags: any[];
  created_at: string;
  updated_at: string;
}

interface Folder {
  id: number;
  name: string;
  color: string;
  icon: string;
  parent_id: number | null;
  children?: Folder[];
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

export default function NotesPage() {
  const { locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned' | 'archived' | 'trashed'>('all');
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notesData, foldersData, tagsData] = await Promise.all([
        getNotes(),
        getNoteFolders(),
        getNoteTags(),
      ]);
      setNotes(Array.isArray(notesData) ? notesData : notesData.results || []);
      setFolders(foldersData || []);
      setTags(tagsData || []);
      if (notesData && notesData.length > 0 && !selectedNote) {
        setSelectedNote(notesData[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  // Filter notes
  const filteredNotes = notes.filter(note => {
    // Status filter
    if (filter === 'pinned' && !note.is_pinned) return false;
    if (filter === 'archived' && !note.is_archived) return false;
    if (filter === 'trashed' && !note.is_trashed) return false;
    if (filter === 'all' && (note.is_trashed || note.is_archived)) return false;

    // Folder filter
    if (selectedFolder && note.folder_id !== selectedFolder) return false;

    // Tags filter
    if (selectedTags.length > 0) {
      const noteTags = Array.isArray(note.tags) ? note.tags : [];
      if (!selectedTags.some(tid => noteTags.some(t => t.id === tid))) return false;
    }

    // Search
    const searchLower = search.toLowerCase();
    if (search && !note.title.toLowerCase().includes(searchLower)) {
      return false;
    }

    return true;
  });

  // Create new note
  const handleNewNote = async () => {
    try {
      setSaving(true);
      const newNote = await createNote({
        title: locale === 'bg' ? 'Нова бележка' : 'New Note',
        content: '<p></p>',
        content_type: 'richtext',
        folder_id: selectedFolder,
      });
      setNotes([newNote, ...notes]);
      setSelectedNote(newNote);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create note');
    } finally {
      setSaving(false);
    }
  };

  // Update note (with auto-save, non-blocking)
  const handleUpdateNote = useCallback(
    (updates: Partial<Note>) => {
      if (!selectedNote) return;
      const updated = { ...selectedNote, ...updates };
      setSelectedNote(updated);
      setNotes(notes.map(n => (n.id === selectedNote.id ? updated : n)));
      setSaveStatus('saving');

      // Fire-and-forget: save in background without blocking UI
      updateNote(selectedNote.id, updates)
        .then(() => {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 1500);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to save note');
          setSaveStatus('idle');
        });
    },
    [selectedNote, notes]
  );

  // Delete note
  const handleDeleteNote = async (noteId: number) => {
    if (!confirm(locale === 'bg' ? 'Сигурен ли си?' : 'Are you sure?')) return;
    try {
      await deleteNote(noteId);
      const newNotes = notes.filter(n => n.id !== noteId);
      setNotes(newNotes);
      if (selectedNote?.id === noteId) {
        setSelectedNote(newNotes[0] || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete note');
    }
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <Spinner message={locale === 'bg' ? 'Зареждане...' : 'Loading...'} />
        </PageContent>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        {error && <Alert type="error" message={error} />}

        <div className="flex gap-3 h-[calc(100vh-120px)]">
          {/* ═══ LEFT SIDEBAR ═══ */}
          <div className="w-48 flex flex-col gap-3 overflow-y-auto pb-4">
            {/* New Note Button */}
            <Button variant="primary" onClick={handleNewNote} disabled={saving} className="w-full text-xs py-1 h-8">
              + {locale === 'bg' ? 'Нова' : 'New'}
            </Button>

            {/* Filters */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2">
                {locale === 'bg' ? 'Филтри' : 'Filters'}
              </div>
              {['all', 'pinned', 'archived', 'trashed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f as any)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                    filter === f
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {f === 'all' && (locale === 'bg' ? '📋 Всички' : '📋 All')}
                  {f === 'pinned' && (locale === 'bg' ? '📌 Закачени' : '📌 Pinned')}
                  {f === 'archived' && (locale === 'bg' ? '📦 Архивирани' : '📦 Archived')}
                  {f === 'trashed' && (locale === 'bg' ? '🗑 Изтрити' : '🗑 Trashed')}
                </button>
              ))}
            </div>

            {/* Folders */}
            {folders.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2">
                  {locale === 'bg' ? 'Папки' : 'Folders'}
                </div>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(selectedFolder === folder.id ? null : folder.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                      selectedFolder === folder.id
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {folder.icon} {folder.name}
                  </button>
                ))}
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2">
                  {locale === 'bg' ? 'Етикети' : 'Tags'}
                </div>
                <div className="flex flex-wrap gap-1 px-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() =>
                        setSelectedTags(
                          selectedTags.includes(tag.id)
                            ? selectedTags.filter((t) => t !== tag.id)
                            : [...selectedTags, tag.id]
                        )
                      }
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        selectedTags.includes(tag.id)
                          ? `bg-${tag.color}-200 text-${tag.color}-700 border border-${tag.color}-300`
                          : `bg-gray-100 text-gray-600 hover:bg-gray-200`
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══ MIDDLE: NOTE LIST ═══ */}
          <div className="w-56 flex flex-col gap-1 border-l border-r border-gray-200">
            {/* Search */}
            <Input
              placeholder={locale === 'bg' ? 'Търси...' : 'Search...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mx-0.5 my-1 h-7 text-xs px-1.5"
            />

            {/* Note List */}
            <div className="flex-1 overflow-y-auto space-y-0.5 px-1 pb-2">
              {filteredNotes.length === 0 ? (
                <EmptyState
                  icon="📝"
                  message={locale === 'bg' ? 'Няма бележки' : 'No notes'}
                />
              ) : (
                filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`p-1.5 rounded text-xs cursor-pointer transition-all ${
                      selectedNote?.id === note.id
                        ? 'bg-indigo-50 border-l-3 border-indigo-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 truncate text-[13px]">
                      {note.is_pinned && '📌 '}
                      {note.title}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(note.updated_at).toLocaleDateString(locale === 'bg' ? 'bg-BG' : 'en-US')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ═══ RIGHT: EDITOR ═══ */}
          {selectedNote ? (
            <div className="flex-1 flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-200">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => handleUpdateNote({ title: e.target.value })}
                  placeholder={locale === 'bg' ? 'Без заглавие' : 'Untitled'}
                  className="flex-1 text-2xl font-bold outline-none bg-transparent"
                />
                <div className="flex items-center gap-2">
                  {saveStatus === 'saving' && (
                    <span className="text-xs text-amber-600">{locale === 'bg' ? '💾 Запазване...' : '💾 Saving...'}</span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="text-xs text-green-600">✓ {locale === 'bg' ? 'Запазено' : 'Saved'}</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateNote({ is_pinned: !selectedNote.is_pinned })}
                  >
                    {selectedNote.is_pinned ? '📌' : '📍'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDeleteNote(selectedNote.id)}
                  >
                    🗑
                  </Button>
                </div>
              </div>

              {/* Tiptap Editor */}
              <div className="flex-1 overflow-hidden">
                <TiptapEditor
                  initialContent={selectedNote.content as string || ''}
                  onChange={(html) => handleUpdateNote({
                    content: html,
                    content_type: 'richtext'
                  })}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="📝"
                message={locale === 'bg' ? 'Избери или създай бележка' : 'Select or create a note'}
              />
            </div>
          )}
        </div>
      </PageContent>
    </PageShell>
  );
}
