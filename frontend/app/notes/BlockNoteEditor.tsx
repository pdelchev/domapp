'use client';

import { useEffect, useState, useRef } from 'react';
import { BlockNoteViewRaw, useBlockNoteEditor } from '@blocknote/react';
import '@blocknote/react/style.css';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
}

export default function BlockNoteEditor({ initialContent, onChange }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const lastContentRef = useRef<any>(null);

  const editor = useBlockNoteEditor();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Load initial content
  useEffect(() => {
    if (!editor || !isClient) return;

    try {
      if (initialContent && Array.isArray(initialContent) && initialContent.length > 0) {
        editor.replaceBlocks(editor.topLevelBlocks, initialContent);
        lastContentRef.current = initialContent;
      }
    } catch (error) {
      console.error('Failed to load initial content:', error);
    }
  }, [editor, isClient, initialContent]);

  // Monitor content changes
  useEffect(() => {
    if (!editor || !isClient) return;

    const checkAndNotifyChanges = () => {
      try {
        const currentContent = editor.topLevelBlocks;

        // Check if content has changed
        if (JSON.stringify(currentContent) !== JSON.stringify(lastContentRef.current)) {
          lastContentRef.current = currentContent;
          onChange(currentContent);
        }
      } catch (error) {
        console.error('Failed to check content changes:', error);
      }
    };

    // Poll for changes every 500ms as a fallback
    const interval = setInterval(checkAndNotifyChanges, 500);

    return () => clearInterval(interval);
  }, [editor, isClient, onChange]);

  if (!isClient || !editor) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 overflow-hidden editor-wrapper">
      <style>{`
        .editor-wrapper .bn-editor {
          padding: 20px;
          font-size: 16px;
          line-height: 1.6;
        }
        .editor-wrapper .bn-block-group {
          margin-bottom: 12px;
        }
        .editor-wrapper {
          --bn-colors-editor-bg: white;
          --bn-colors-side-menu: #f3f4f6;
          --bn-colors-highlights-gray-highlight: #f3f4f6;
          --bn-colors-ui-text: #374151;
        }
      `}</style>
      <BlockNoteViewRaw editor={editor} />
    </div>
  );
}
