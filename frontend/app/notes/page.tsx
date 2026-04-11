'use client';

import { useState } from 'react';
import { PageShell, PageContent, PageHeader, Button } from '../components/ui';
import NavBar from '../components/NavBar';
import { useLanguage } from '../context/LanguageContext';

interface Block {
  id: string;
  type: 'text' | 'heading' | 'checklist' | 'bullet' | 'code';
  content: string;
  checked?: boolean;
}

interface Note {
  id: string;
  title: string;
  blocks: Block[];
}

export default function NotesPage() {
  const { locale } = useLanguage();
  const [notes, setNotes] = useState<Note[]>([
    {
      id: '1',
      title: locale === 'bg' ? 'Добре дошли' : 'Welcome',
      blocks: [
        { id: '1', type: 'text', content: locale === 'bg' ? 'Това е твоята нова система за бележки' : 'This is your new notes system' }
      ]
    }
  ]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(notes[0]);

  const updateBlock = (blockId: string, updates: Partial<Block>) => {
    if (!selectedNote) return;
    const updatedBlocks = selectedNote.blocks.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    const updatedNote = { ...selectedNote, blocks: updatedBlocks };
    setSelectedNote(updatedNote);
    setNotes(notes.map(n => n.id === selectedNote.id ? updatedNote : n));
  };

  const addBlock = (type: Block['type'] = 'text') => {
    if (!selectedNote) return;
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: '',
      checked: type === 'checklist' ? false : undefined,
    };
    const updatedNote = { ...selectedNote, blocks: [...selectedNote.blocks, newBlock] };
    setSelectedNote(updatedNote);
    setNotes(notes.map(n => n.id === selectedNote.id ? updatedNote : n));
  };

  const deleteBlock = (blockId: string) => {
    if (!selectedNote || selectedNote.blocks.length === 1) return;
    const updatedBlocks = selectedNote.blocks.filter(b => b.id !== blockId);
    const updatedNote = { ...selectedNote, blocks: updatedBlocks };
    setSelectedNote(updatedNote);
    setNotes(notes.map(n => n.id === selectedNote.id ? updatedNote : n));
  };

  const createNewNote = () => {
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: locale === 'bg' ? 'Нова бележка' : 'New Note',
      blocks: [{ id: '1', type: 'text', content: '' }]
    };
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
  };

  return (
    <PageShell>
      <NavBar />
      <PageContent>
        <PageHeader title="📝 Notes" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* List */}
          <div className="space-y-2">
            <Button variant="primary" onClick={createNewNote} className="w-full">
              + {locale === 'bg' ? 'Нова' : 'New'}
            </Button>

            {notes.map(note => (
              <div
                key={note.id}
                onClick={() => setSelectedNote(note)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedNote?.id === note.id ? 'bg-indigo-100 border-l-4 border-indigo-600' : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-semibold text-sm">{note.title}</div>
                <div className="text-xs text-gray-500">{note.blocks.length} blocks</div>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div className="md:col-span-2 space-y-4">
            {selectedNote ? (
              <>
                <input
                  value={selectedNote.title}
                  onChange={(e) => {
                    const updated = { ...selectedNote, title: e.target.value };
                    setSelectedNote(updated);
                    setNotes(notes.map(n => n.id === selectedNote.id ? updated : n));
                  }}
                  className="w-full text-2xl font-bold outline-none border-b-2 border-gray-300 pb-2"
                />

                <div className="space-y-3">
                  {selectedNote.blocks.map((block, idx) => (
                    <div key={block.id} className="group relative p-2 rounded hover:bg-gray-50">
                      <div className="flex gap-2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select
                          value={block.type}
                          onChange={(e) => updateBlock(block.id, { type: e.target.value as any })}
                          className="text-xs px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="text">Text</option>
                          <option value="heading">Heading</option>
                          <option value="checklist">Checklist</option>
                          <option value="bullet">Bullet</option>
                          <option value="code">Code</option>
                        </select>

                        <div className="flex gap-1 ml-auto">
                          <button
                            onClick={() => deleteBlock(block.id)}
                            className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {block.type === 'checklist' ? (
                        <div className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={block.checked || false}
                            onChange={(e) => updateBlock(block.id, { checked: e.target.checked })}
                            className="mt-1"
                          />
                          <textarea
                            value={block.content}
                            onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                addBlock('checklist');
                              }
                            }}
                            placeholder="Checklist... (Ctrl+Enter for new item)"
                            className="flex-1 outline-none text-sm resize-none"
                            rows={2}
                          />
                        </div>
                      ) : block.type === 'heading' ? (
                        <textarea
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              addBlock();
                            }
                          }}
                          placeholder="Heading... (Ctrl+Enter for new block)"
                          className="w-full outline-none text-lg font-semibold border-b border-gray-300 resize-none"
                          rows={2}
                        />
                      ) : block.type === 'code' ? (
                        <textarea
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              addBlock();
                            }
                          }}
                          placeholder="Code... (Ctrl+Enter for new block)"
                          className="w-full font-mono text-sm p-2 border border-gray-300 rounded bg-gray-50 outline-none resize-none"
                          rows={4}
                        />
                      ) : (
                        <textarea
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              addBlock();
                            }
                          }}
                          placeholder={block.type === 'bullet' ? '• Item... (Ctrl+Enter for new block)' : 'Type... (Ctrl+Enter for new block)'}
                          className="w-full outline-none text-sm resize-none"
                          rows={2}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <Button variant="secondary" onClick={() => addBlock()} className="w-full">
                  + {locale === 'bg' ? 'Добави блок' : 'Add block'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
