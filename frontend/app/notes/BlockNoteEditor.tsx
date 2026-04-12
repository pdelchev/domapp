'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '../components/ui';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
  contentType?: string;
}

export default function BlockNoteEditor({ initialContent, onChange, contentType = 'blocks' }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const [content, setContent] = useState<any[]>([]);
  const [text, setText] = useState<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<string>('');

  // Extract plain text from block structure
  const extractTextFromBlocks = (blocks: any[]): string => {
    if (!Array.isArray(blocks)) return '';
    return blocks
      .map((block: any) => {
        const type = block.type || '';
        if (type === 'text' || type === 'heading') return block.content || '';
        if (type === 'paragraph') {
          const content = block.content || [];
          return Array.isArray(content)
            ? content.map((c: any) => c.text || '').join('')
            : '';
        }
        if (type === 'checklist') {
          return (block.items || [])
            .map((item: any) => `${item.checked ? '[x]' : '[ ]'} ${item.text || ''}`)
            .join('\n');
        }
        if (type === 'bullet') {
          return (block.items || []).map((item: any) => `• ${item.text || ''}`).join('\n');
        }
        if (type === 'code') return block.content || '';
        return '';
      })
      .filter((t: string) => t.trim().length > 0)
      .join('\n\n');
  };

  useEffect(() => {
    setIsClient(true);
    // Always start in Text mode for better UX - extract text from blocks
    if (initialContent) {
      setContent(Array.isArray(initialContent) ? initialContent : []);
      if (Array.isArray(initialContent) && initialContent.length > 0) {
        const plainText = extractTextFromBlocks(initialContent);
        setText(plainText);
        lastSentRef.current = plainText;
      } else if (typeof initialContent === 'string') {
        setText(initialContent);
        lastSentRef.current = initialContent;
      } else {
        setText('');
        lastSentRef.current = '';
      }
    }
  }, [initialContent]);

  const sendChanges = (newText: string) => {
    // Only send if content actually changed
    if (newText === lastSentRef.current) {
      return;
    }

    lastSentRef.current = newText;

    // Convert text to block structure
    if (newText.trim() === '') {
      onChange([]);
    } else {
      // Split by double newlines for paragraphs, single newlines for lines
      const paragraphs = newText.split('\n\n').filter(p => p.trim());
      const blocks = paragraphs.map(para => ({
        type: 'text',
        content: para.trim()
      }));
      onChange(blocks);
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce with longer delay (2 seconds) to reduce API calls
    debounceTimerRef.current = setTimeout(() => {
      sendChanges(newText);
    }, 2000);
  };

  const insertBlock = (type: 'heading' | 'bullet' | 'checklist') => {
    let insertText = '';
    switch (type) {
      case 'heading':
        insertText = '# ';
        break;
      case 'bullet':
        insertText = '• ';
        break;
      case 'checklist':
        insertText = '[ ] ';
        break;
    }

    const newText = text + (text.endsWith('\n') ? '' : '\n') + insertText;
    setText(newText);
    handleTextChange(newText);
  };

  if (!isClient) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar with formatting buttons */}
      <div className="flex gap-1 p-2 border-b border-gray-200 bg-gray-50 flex-wrap items-center">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => insertBlock('heading')}
          title="Add heading"
          className="text-lg"
        >
          H
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => insertBlock('bullet')}
          title="Add bullet point"
          className="text-lg"
        >
          •
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => insertBlock('checklist')}
          title="Add checklist item"
          className="text-lg"
        >
          ☑
        </Button>
      </div>

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        className="flex-1 p-4 border-0 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        placeholder="Enter your note here..."
        spellCheck="false"
      />

      {/* Info footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
        {text.length} characters • Saves automatically after typing pauses
      </div>
    </div>
  );
}
