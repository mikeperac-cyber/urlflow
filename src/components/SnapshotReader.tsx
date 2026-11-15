import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Trash2 } from 'lucide-react';
import type { LinkItem, SnapshotContent } from '../../shared/types';
import { useApp } from '../app-context';
import { Button, Confirm, Modal } from './ui';

interface Block {
  type: 'heading' | 'paragraph' | 'list' | 'quote' | 'code';
  text: string;
  level?: number;
}

/** Minimal Markdown display: headings, paragraphs, lists, quotes and fences. */
function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
    } else if (line.startsWith('```')) {
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) buffer.push(lines[index++]);
      index += 1;
      blocks.push({ type: 'code', text: buffer.join('\n') });
    } else if (/^#{1,6}\s+/.test(line)) {
      const heading = /^(#{1,6})\s+(.*)$/.exec(line)!;
      blocks.push({ type: 'heading', level: Math.min(3, heading[1].length), text: heading[2] });
      index += 1;
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index++].replace(/^\s*[-*]\s+/, ''));
      }
      blocks.push({ type: 'list', text: items.join('\n') });
    } else if (line.startsWith('>')) {
      const quoted: string[] = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        quoted.push(lines[index++].replace(/^>\s?/, ''));
      }
      blocks.push({ type: 'quote', text: quoted.join(' ') });
    } else {
      const paragraph = [line];
      index += 1;
      while (
        index < lines.length
        && lines[index].trim()
        && !lines[index].startsWith('#')
        && !lines[index].startsWith('>')
        && !lines[index].startsWith('```')
        && !/^\s*[-*]\s+/.test(lines[index])
      ) paragraph.push(lines[index++]);
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    }
  }
  return blocks;
}

/** Drops inline Markdown markers so the text reads cleanly without a renderer dependency. */
function inline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2');
}

function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="snapshot-reader__body">
      {parseBlocks(markdown).map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          const text = inline(block.text);
          if (block.level === 1) return <h3 key={key}>{text}</h3>;
          if (block.level === 2) return <h4 key={key}>{text}</h4>;
          return <h5 key={key}>{text}</h5>;
        }
        if (block.type === 'list') {
          return (
            <ul key={key}>
              {block.text.split('\n').map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'quote') return <blockquote key={key}>{inline(block.text)}</blockquote>;
        if (block.type === 'code') return <pre key={key}><code>{block.text}</code></pre>;
        return <p key={key}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

export function SnapshotReader({ link, onClose }: { link: LinkItem; onClose: () => void }) {
  const { api, run, pushToast } = useApp();
  const [snapshot, setSnapshot] = useState<SnapshotContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'reader' | 'source'>('reader');
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.getSnapshot(link.id)
      .then((content) => {
        if (!cancelled) setSnapshot(content);
      })
      .catch(() => {
        if (!cancelled) pushToast('Could not read the offline snapshot', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, link.id, pushToast]);

  const savedAt = snapshot?.savedAt ?? link.snapshotAt;

  return (
    <Modal
      title={snapshot?.title || link.title}
      subtitle={
        loading
          ? 'Reading the offline snapshot...'
          : savedAt
            ? `Offline snapshot · ${new Date(savedAt).toLocaleString()}`
            : 'No readable snapshot is stored for this link.'
      }
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmRemove(true)}>
            Remove snapshot
          </Button>
          <span className="modal__spacer" />
          {snapshot ? (
            <Button variant="subtle" onClick={() => setMode(mode === 'reader' ? 'source' : 'reader')}>
              {mode === 'reader' ? 'View source' : 'Readable view'}
            </Button>
          ) : null}
          <Button
            variant="subtle"
            icon={<ExternalLink size={14} />}
            onClick={() => {
              void run(api.openLink(link.id));
              onClose();
            }}
          >
            Open original
          </Button>
        </>
      }
    >
      <div className="snapshot-reader">
        <p className="snapshot-reader__meta">
          <BookOpen size={13} />
          <span>{link.url}</span>
        </p>
        {loading ? (
          <p className="snapshot-reader__empty" role="status">Loading offline snapshot...</p>
        ) : snapshot ? (
          mode === 'reader'
            ? <MarkdownBody markdown={snapshot.markdown} />
            : <pre className="snapshot-reader__source">{snapshot.markdown}</pre>
        ) : (
          <p className="snapshot-reader__empty">This link has no saved text yet.</p>
        )}
      </div>

      {confirmRemove ? (
        <Confirm
          title="Remove this offline snapshot?"
          message="The link stays, but its saved text is deleted from this computer."
          confirmLabel="Remove"
          onConfirm={() => {
            void run(api.deleteSnapshot(link.id), { success: 'Offline snapshot removed' });
            onClose();
          }}
          onClose={() => setConfirmRemove(false)}
        />
      ) : null}
    </Modal>
  );
}
