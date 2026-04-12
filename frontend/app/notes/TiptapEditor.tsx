'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui';

interface TiptapEditorProps {
  initialContent?: string | any[];
  onChange: (content: string) => void;
}

// Convert old block format to HTML
const convertBlocksToHTML = (blocks: any[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '<p></p>';
  }

  const html = blocks
    .map((block: any) => {
      if (!block || typeof block !== 'object') return '';

      const type = block.type || '';
      let content = block.content || '';

      // Handle text-like blocks
      if (type === 'text') {
        if (!content) return '';
        // Escape HTML special characters
        const escaped = String(content)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<p>${escaped}</p>`;
      }

      if (type === 'heading') {
        if (!content) return '';
        const level = block.level || 2;
        const escaped = String(content)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<h${level}>${escaped}</h${level}>`;
      }

      if (type === 'paragraph') {
        let text = '';
        if (Array.isArray(content)) {
          text = content.map((c: any) => c.text || '').join('');
        } else if (typeof content === 'string') {
          text = content;
        }
        if (!text) return '';
        const escaped = String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<p>${escaped}</p>`;
      }

      if (type === 'checklist') {
        const items = (block.items || [])
          .map((item: any) => {
            const text = item.text || '';
            const checkbox = item.checked ? '✓ ' : '☐ ';
            return `<li>${checkbox}${text}</li>`;
          })
          .join('');
        return items ? `<ul>${items}</ul>` : '';
      }

      if (type === 'bullet') {
        const items = (block.items || [])
          .map((item: any) => `<li>${item.text || ''}</li>`)
          .join('');
        return items ? `<ul>${items}</ul>` : '';
      }

      if (type === 'orderedList') {
        const items = (block.items || [])
          .map((item: any) => `<li>${item.text || ''}</li>`)
          .join('');
        return items ? `<ol>${items}</ol>` : '';
      }

      if (type === 'code') {
        if (!content) return '';
        const language = block.language || '';
        return `<pre><code${language ? ` class="language-${language}"` : ''}>${content}</code></pre>`;
      }

      if (type === 'blockquote') {
        if (!content) return '';
        return `<blockquote>${content}</blockquote>`;
      }

      if (type === 'divider') {
        return '<hr />';
      }

      // Fallback for unknown types - try to extract any text
      if (type && content) {
        const escaped = String(content)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<p>${escaped}</p>`;
      }

      return '';
    })
    .filter((h: string) => h.trim().length > 0)
    .join('');

  return html || '<p></p>';
};

export default function TiptapEditor({ initialContent = '', onChange }: TiptapEditorProps) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Normalize content: convert blocks to HTML if needed
  const normalizedContent =
    typeof initialContent === 'string'
      ? initialContent
      : convertBlocksToHTML(Array.isArray(initialContent) ? initialContent : []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: {
          HTMLAttributes: {
            class: 'text-base leading-relaxed',
          },
        },
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc list-inside space-y-1',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal list-inside space-y-1',
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-gray-100 rounded p-3 font-mono text-sm overflow-x-auto',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-gray-300 pl-4 italic text-gray-700',
          },
        },
      }),
      Underline,
      TaskList.configure({
        HTMLAttributes: {
          class: 'list-none space-y-2',
        },
      }),
      TaskItem.configure({
        HTMLAttributes: {
          class: 'flex items-start gap-2',
        },
        nested: true,
      }),
    ],
    content: normalizedContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none max-w-none px-4 py-3 text-base',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();

      // Debounce to avoid too many updates
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onChange(html);
      }, 1500);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!editor) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-2 border-b border-gray-200 bg-gray-50">
        {/* Text Style */}
        <Button
          size="sm"
          variant={editor.isActive('bold') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
          className="text-sm font-bold"
        >
          B
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('italic') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
          className="text-sm italic"
        >
          I
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('underline') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
          className="text-sm underline"
        >
          U
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('strike') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
          className="text-sm line-through"
        >
          S
        </Button>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Headings */}
        <Button
          size="sm"
          variant={editor.isActive('heading', { level: 1 }) ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
          className="text-sm font-bold"
        >
          H1
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('heading', { level: 2 }) ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
          className="text-sm font-bold"
        >
          H2
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('heading', { level: 3 }) ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
          className="text-sm font-bold"
        >
          H3
        </Button>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Lists */}
        <Button
          size="sm"
          variant={editor.isActive('bulletList') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          •
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('orderedList') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          1.
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('taskList') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Checklist"
        >
          ☑
        </Button>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Blocks */}
        <Button
          size="sm"
          variant={editor.isActive('blockquote') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Block Quote"
        >
          "
        </Button>
        <Button
          size="sm"
          variant={editor.isActive('codeBlock') ? 'primary' : 'ghost'}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code Block"
        >
          &lt;&gt;
        </Button>

        <div className="w-px bg-gray-300 mx-1" />

        {/* Clear formatting */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().clearNodes().run()}
          title="Clear formatting"
        >
          ✕
        </Button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto focus:outline-none"
      />

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
        Saves automatically • Use formatting buttons or keyboard shortcuts
      </div>
    </div>
  );
}
