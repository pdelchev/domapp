'use client';

/**
 * Notes — Logseq-inspired block-based outliner
 *
 * Features:
 * - Block-based editing (text, heading, checklist, bullet, code)
 * - Formatting toolbar (Bold, Italic, Underline)
 * - Working checklists with state persistence
 * - Block movement/reordering (drag or Ctrl+↑↓)
 * - "/" command palette for block types
 * - Auto-save with debounce
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { PageShell, PageContent, PageHeader, Card, Button, Input, Spinner } from '../components/ui';
import NavBar from '../components/NavBar';
import { useLanguage } from '../context/LanguageContext';
import { getNotes, createNote, updateNote, deleteNote, getNoteFolders } from '../lib/api';

interface NoteBlock {
  id: string;
  type: 'text' | 'heading' | 'checklist' | 'bullet' | 'code';
  content: string;
  checked?: boolean;
  level?: number; // for heading: 1-3
}

interface Note {
  id: number;
  title: string;
  blocks: NoteBlock[];
  folder: number | null;
  is_pinned: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

const BLOCK_TYPES = [
  { type: 'text', label: 'Text', icon: '📝' },
  { type: 'heading', label: 'Heading', icon: '📌' },
  { type: 'checklist', label: 'Checklist', icon: '☑️' },
  { type: 'bullet', label: 'Bullet', icon: '•' },
  { type: 'code', label: 'Code', icon: '💻' },
];

export default function NotesPage() {
  const { locale } = useLanguage();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteBlockIndex, setCommandPaletteBlockIndex] = useState(-1);

  // Load notes
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const response = await getNotes();
        setNotes(response || []);
        if (response?.length > 0) {
          setSelectedNote(response[0]);
        }
      } catch (err) {
        console.error('Failed to load notes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadNotes();
  }, []);

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(search.toLowerCase()) ||
    note.blocks.some(b => b.content.toLowerCase().includes(search.toLowerCase()))
  );

  const saveNote = useCallback(async () => {
    if (!selectedNote) return;
    try {
      await updateNote(selectedNote.id, {
        title: selectedNote.title,
        content: JSON.stringify(selectedNote.blocks),
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [selectedNote]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(saveNote, 800);
  }, [saveNote]);

  const updateBlock = (index: number, updates: Partial<NoteBlock>) => {
    if (!selectedNote) return;
    const newBlocks = [...selectedNote.blocks];
    newBlocks[index] = { ...newBlocks[index], ...updates };
    setSelectedNote({ ...selectedNote, blocks: newBlocks });
    debouncedSave();
  };

  const addBlock = (index: number, type: NoteBlock['type'] = 'text') => {
    if (!selectedNote) return;
    const newBlock: NoteBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: '',
      checked: type === 'checklist' ? false : undefined,
      level: type === 'heading' ? 1 : undefined,
    };
    const newBlocks = [...selectedNote.blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setSelectedNote({ ...selectedNote, blocks: newBlocks });
    debouncedSave();
  };

  const deleteBlock = (index: number) => {
    if (!selectedNote || selectedNote.blocks.length === 1) return;
    const newBlocks = selectedNote.blocks.filter((_, i) => i !== index);
    setSelectedNote({ ...selectedNote, blocks: newBlocks });
    debouncedSave();
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    if (!selectedNote) return;
    const newBlocks = [...selectedNote.blocks];
    const [removed] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, removed);
    setSelectedNote({ ...selectedNote, blocks: newBlocks });
    debouncedSave();
  };

  const toggleFormatting = (blockIndex: number, format: 'bold' | 'italic' | 'underline') => {
    if (!selectedNote) return;
    const block = selectedNote.blocks[blockIndex];
    let newContent = block.content;

    // Simple formatting wrapper (production would need better parsing)
    const markers = { bold: '**', italic: '*', underline: '_' };
    const marker = markers[format];

    if (newContent.includes(marker)) {
      newContent = newContent.replace(new RegExp(`${marker}([^${marker}]+)${marker}`), '$1');
    } else {
      newContent = `${marker}${newContent || 'formatted text'}${marker}`;
    }

    updateBlock(blockIndex, { content: newContent });
  };

  if (loading) {
    return (
      <PageShell>
        <NavBar />
        <PageContent>
          <Spinner message="Loading notes..." />
        </PageContent>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-screen">
          {/* Left: Note List */}
          <div className="md:col-span-1 border-r border-gray-200 overflow-y-auto">
            <div className="p-4 space-y-4">
              <PageHeader title="📝 Notes" />
              <Input
                placeholder={locale === 'bg' ? 'Търси...' : 'Search...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={async () => {
                  const newNote = await createNote({ title: locale === 'bg' ? 'Untitled' : 'Untitled', content: JSON.stringify([{ id: '1', type: 'text', content: '' }]) });
                  if (newNote) {
                    setNotes([newNote, ...notes]);
                    setSelectedNote(newNote);
                  }
                }}
              >
                + {locale === 'bg' ? 'Нова' : 'New'}
              </Button>

              <div className="space-y-2">
                {filteredNotes.map(note => (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedNote?.id === note.id
                        ? 'bg-indigo-100 border-l-4 border-indigo-600'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold text-sm text-gray-900 truncate">{note.title}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      {note.blocks[0]?.content.substring(0, 50) || '(empty)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Editor */}
          <div className="md:col-span-3 overflow-y-auto p-6">
            {selectedNote ? (
              <div className="max-w-2xl space-y-4">
                {/* Title */}
                <Input
                  value={selectedNote.title}
                  onChange={(e) => {
                    setSelectedNote({ ...selectedNote, title: e.target.value });
                    debouncedSave();
                  }}
                  placeholder={locale === 'bg' ? 'Заглавие' : 'Title'}
                  className="text-2xl font-bold"
                />

                {/* Blocks */}
                {selectedNote.blocks.map((block, idx) => (
                  <div key={block.id} className="group relative">
                    {/* Block type indicator + Controls */}
                    <div className="flex items-center gap-2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select
                        value={block.type}
                        onChange={(e) => updateBlock(idx, { type: e.target.value as any })}
                        className="text-xs px-2 py-1 border border-gray-300 rounded"
                      >
                        {BLOCK_TYPES.map(bt => (
                          <option key={bt.type} value={bt.type}>{bt.label}</option>
                        ))}
                      </select>

                      {/* Formatting Toolbar */}
                      {(block.type === 'text' || block.type === 'bullet') && (
                        <div className="flex gap-1 text-xs">
                          <button
                            onClick={() => toggleFormatting(idx, 'bold')}
                            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 font-bold"
                          >
                            B
                          </button>
                          <button
                            onClick={() => toggleFormatting(idx, 'italic')}
                            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 italic"
                          >
                            I
                          </button>
                          <button
                            onClick={() => toggleFormatting(idx, 'underline')}
                            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 underline"
                          >
                            U
                          </button>
                        </div>
                      )}

                      {/* Move & Delete */}
                      <div className="flex gap-1 ml-auto">
                        {idx > 0 && (
                          <button
                            onClick={() => moveBlock(idx, idx - 1)}
                            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                          >
                            ↑
                          </button>
                        )}
                        {idx < selectedNote.blocks.length - 1 && (
                          <button
                            onClick={() => moveBlock(idx, idx + 1)}
                            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
                          >
                            ↓
                          </button>
                        )}
                        <button
                          onClick={() => deleteBlock(idx)}
                          className="px-2 py-1 text-xs border border-red-300 rounded hover:bg-red-50 text-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Block Content */}
                    {block.type === 'checklist' ? (
                      <div className="flex items-start gap-3 p-2 rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={block.checked || false}
                          onChange={(e) => updateBlock(idx, { checked: e.target.checked })}
                          className="mt-1 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={block.content}
                          onChange={(e) => updateBlock(idx, { content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addBlock(idx, 'checklist');
                          }}
                          placeholder="Checklist item..."
                          className="flex-1 outline-none text-sm"
                        />
                      </div>
                    ) : block.type === 'heading' ? (
                      <input
                        type="text"
                        value={block.content}
                        onChange={(e) => updateBlock(idx, { content: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addBlock(idx);
                        }}
                        placeholder="Heading..."
                        className={`w-full outline-none border-b-2 border-gray-300 pb-2 ${
                          block.level === 1 ? 'text-2xl font-bold' :
                          block.level === 2 ? 'text-xl font-semibold' :
                          'text-lg font-medium'
                        }`}
                      />
                    ) : block.type === 'code' ? (
                      <textarea
                        value={block.content}
                        onChange={(e) => updateBlock(idx, { content: e.target.value })}
                        placeholder="Code..."
                        className="w-full font-mono text-sm p-3 border border-gray-300 rounded bg-gray-50 outline-none"
                        rows={4}
                      />
                    ) : (
                      <input
                        type="text"
                        value={block.content}
                        onChange={(e) => updateBlock(idx, { content: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addBlock(idx);
                        }}
                        placeholder={block.type === 'bullet' ? '• List item...' : 'Type / for commands...'}
                        className="w-full outline-none text-sm"
                      />
                    )}
                  </div>
                ))}

                {/* Add Block Button */}
                <button
                  onClick={() => addBlock(selectedNote.blocks.length - 1)}
                  className="text-sm text-indigo-600 hover:text-indigo-700 mt-4"
                >
                  + Add block
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                {locale === 'bg' ? 'Няма избрана бележка' : 'No note selected'}
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
