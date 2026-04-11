'use client';

import { useRef, useEffect } from 'react';
import { Button } from './ui';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder = 'Start typing...' }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialize content
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && content) {
      editorRef.current.innerHTML = content;
    }
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-100 rounded-t border border-gray-300">
        <button
          onClick={() => applyFormat('bold')}
          title="Bold (Ctrl+B)"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
        >
          B
        </button>
        <button
          onClick={() => applyFormat('italic')}
          title="Italic (Ctrl+I)"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 italic"
        >
          I
        </button>
        <button
          onClick={() => applyFormat('underline')}
          title="Underline (Ctrl+U)"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 underline"
        >
          U
        </button>

        <div className="w-px bg-gray-300" />

        <select
          onChange={(e) => {
            if (e.target.value) {
              applyFormat('formatBlock', `<${e.target.value}>`);
              e.target.value = '';
            }
          }}
          className="px-2 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          <option value="">Format</option>
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <div className="w-px bg-gray-300" />

        <button
          onClick={() => applyFormat('insertUnorderedList')}
          title="Bullet list"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          • List
        </button>
        <button
          onClick={() => applyFormat('insertOrderedList')}
          title="Numbered list"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          1. List
        </button>

        <div className="w-px bg-gray-300" />

        <button
          onClick={() => applyFormat('removeFormat')}
          title="Clear formatting"
          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-xs"
        >
          Clear
        </button>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        suppressContentEditableWarning
        className="w-full min-h-96 p-4 border-l-4 border-r border-b border-gray-300 rounded-b bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 leading-relaxed"
        data-placeholder={placeholder}
        style={{
          overflowWrap: 'break-word',
          wordWrap: 'break-word',
        }}
      />
    </div>
  );
}
