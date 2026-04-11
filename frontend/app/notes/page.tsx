'use client';

import { useState, useRef, useEffect } from 'react';
import { PageShell, PageContent, Button } from '../components/ui';
import NavBar from '../components/NavBar';
import { useLanguage } from '../context/LanguageContext';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const { locale } = useLanguage();
  const [notes, setNotes] = useState<Note[]>([
    {
      id: '1',
      title: locale === 'bg' ? 'Добре дошли' : 'Welcome',
      content: locale === 'bg' ? 'Това е твоята нова система за бележки' : 'This is your new notes system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(notes[0]);
  const [search, setSearch] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(search.toLowerCase()) ||
    note.content.toLowerCase().includes(search.toLowerCase())
  );

  const updateNote = (updates: Partial<Note>) => {
    if (!selectedNote) return;
    const updated = {
      ...selectedNote,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setSelectedNote(updated);
    setNotes(notes.map(n => n.id === selectedNote.id ? updated : n));

    // Auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      console.log('Note saved:', updated.title);
    }, 1000);
  };

  const createNewNote = () => {
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: locale === 'bg' ? 'Нова бележка' : 'New Note',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
  };

  const deleteNote = (noteId: string) => {
    const newNotes = notes.filter(n => n.id !== noteId);
    setNotes(newNotes);
    if (selectedNote?.id === noteId) {
      setSelectedNote(newNotes[0] || null);
    }
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const formatAsList = (ordered: boolean) => {
    document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false);
    editorRef.current?.focus();
  };

  const formatAsCheckbox = () => {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      const text = selection.toString();
      document.execCommand('insertHTML', false, `☐ ${text}`);
    } else {
      document.execCommand('insertHTML', false, '☐ ');
    }
    editorRef.current?.focus();
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent size="lg">
        <div className="flex h-[calc(100vh-60px)]">
          {/* Left Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <Button variant="primary" onClick={createNewNote} className="w-full">
                ✎ {locale === 'bg' ? 'Нова' : 'New'}
              </Button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              <input
                type="text"
                placeholder={locale === 'bg' ? 'Търси...' : 'Search...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="space-y-1 mt-4">
                {filteredNotes.map(note => (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (confirm(locale === 'bg' ? 'Изтриване?' : 'Delete?')) {
                        deleteNote(note.id);
                      }
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedNote?.id === note.id
                        ? 'bg-white border-l-4 border-blue-500 shadow-sm'
                        : 'hover:bg-white'
                    }`}
                  >
                    <div className="font-semibold text-sm text-gray-900 truncate">
                      {note.title || locale === 'bg' ? 'Без заглавие' : 'Untitled'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate line-clamp-2">
                      {note.content || locale === 'bg' ? 'Няма съдържание' : 'No content'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editor */}
          <div className="flex-1 flex flex-col bg-white">
            {selectedNote ? (
              <>
                {/* Top Bar */}
                <div className="border-b border-gray-200 p-4 space-y-4">
                  <input
                    value={selectedNote.title}
                    onChange={(e) => updateNote({ title: e.target.value })}
                    placeholder={locale === 'bg' ? 'Заглавие' : 'Title'}
                    className="w-full text-3xl font-bold outline-none"
                  />

                  {/* Formatting Toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => applyFormat('bold')}
                      title="Bold"
                      className="px-3 py-2 text-sm font-bold border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      B
                    </button>
                    <button
                      onClick={() => applyFormat('italic')}
                      title="Italic"
                      className="px-3 py-2 text-sm italic border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      I
                    </button>
                    <button
                      onClick={() => applyFormat('underline')}
                      title="Underline"
                      className="px-3 py-2 text-sm underline border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      U
                    </button>

                    <div className="w-px h-6 bg-gray-300" />

                    <button
                      onClick={() => formatAsList(false)}
                      title="Bullet List"
                      className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      •
                    </button>
                    <button
                      onClick={() => formatAsList(true)}
                      title="Numbered List"
                      className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      1.
                    </button>
                    <button
                      onClick={formatAsCheckbox}
                      title="Checklist"
                      className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                    >
                      ☐
                    </button>

                    <div className="w-px h-6 bg-gray-300" />

                    <select
                      onChange={(e) => applyFormat('formatBlock', e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded outline-none"
                      defaultValue="p"
                    >
                      <option value="p">{locale === 'bg' ? 'Текст' : 'Text'}</option>
                      <option value="h1">{locale === 'bg' ? 'Заглавие 1' : 'Heading 1'}</option>
                      <option value="h2">{locale === 'bg' ? 'Заглавие 2' : 'Heading 2'}</option>
                      <option value="h3">{locale === 'bg' ? 'Заглавие 3' : 'Heading 3'}</option>
                    </select>

                    <div className="flex-1" />

                    <button
                      onClick={() => {
                        if (confirm(locale === 'bg' ? 'Изтриване на тази бележка?' : 'Delete this note?')) {
                          deleteNote(selectedNote.id);
                        }
                      }}
                      className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
                    >
                      🗑 {locale === 'bg' ? 'Изтрий' : 'Delete'}
                    </button>
                  </div>
                </div>

                {/* Editor Area */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={() => {
                    const content = editorRef.current?.innerText || '';
                    updateNote({ content });
                  }}
                  className="flex-1 p-6 outline-none text-base leading-relaxed overflow-y-auto max-w-4xl mx-auto w-full"
                  style={{ minHeight: '100px' }}
                >
                  {selectedNote.content}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                {locale === 'bg' ? 'Няма избрана бележка' : 'No note selected'}
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
