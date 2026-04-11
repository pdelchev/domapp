'use client';

import { useRef, useEffect } from 'react';

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

  const ToolbarButton = ({
    onClick,
    title,
    label,
    children
  }: {
    onClick: () => void;
    title: string;
    label?: string;
    children?: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className="h-9 px-3 hover:bg-indigo-100 active:bg-indigo-200 rounded transition-colors text-gray-700 font-medium text-sm flex items-center gap-1"
    >
      {children || label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-300 overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0 p-2 bg-gradient-to-b from-gray-50 to-white border-b border-gray-200 items-center">
        {/* Text formatting */}
        <div className="flex gap-1 border-r border-gray-200 pr-2 mr-2">
          <ToolbarButton
            onClick={() => applyFormat('bold')}
            title="Bold (Ctrl+B)"
            label="Bold"
          />
          <ToolbarButton
            onClick={() => applyFormat('italic')}
            title="Italic (Ctrl+I)"
            label="Italic"
          />
          <ToolbarButton
            onClick={() => applyFormat('underline')}
            title="Underline (Ctrl+U)"
            label="Underline"
          />
        </div>

        {/* Headings & format */}
        <div className="flex gap-1 border-r border-gray-200 pr-2 mr-2">
          <select
            onChange={(e) => {
              if (e.target.value) {
                applyFormat('formatBlock', `<${e.target.value}>`);
                e.target.value = '';
              }
            }}
            className="h-9 px-3 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Format</option>
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>
        </div>

        {/* Lists */}
        <div className="flex gap-1 border-r border-gray-200 pr-2 mr-2">
          <ToolbarButton
            onClick={() => applyFormat('insertUnorderedList')}
            title="Bullet list"
            label="• List"
          />
          <ToolbarButton
            onClick={() => applyFormat('insertOrderedList')}
            title="Numbered list"
            label="1. List"
          />
        </div>

        {/* Clear */}
        <ToolbarButton
          onClick={() => applyFormat('removeFormat')}
          title="Clear formatting"
          label="Clear"
        />
      </div>

      {/* Editor area - takes full remaining space */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        suppressContentEditableWarning
        className="flex-1 overflow-auto p-6 text-gray-900 leading-relaxed outline-none focus:outline-none"
        style={{
          overflowWrap: 'break-word',
          wordWrap: 'break-word',
          lineHeight: '1.75',
          fontSize: '16px',
          minHeight: '300px',
        }}
        data-placeholder={placeholder}
      />
    </div>
  );
}
