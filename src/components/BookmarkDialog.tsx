import { useMemo, useState } from 'react';
import { Bookmark, FolderTree, Upload } from 'lucide-react';
import type { BookmarkFile } from '../../shared/types';
import { useApp } from '../app-context';
import { displayUrl, normalizeUrl } from '../../shared/url';
import { Button, Modal } from './ui';

export function BookmarkDialog({ file, onClose }: { file: BookmarkFile; onClose: () => void }) {
  const { state, api, run, pushToast } = useApp();
  const [tagFolders, setTagFolders] = useState(true);
  const [busy, setBusy] = useState(false);

  const existing = useMemo(
    () =>
      new Set(
        state.items
          .filter((item) => item.kind === 'link')
          .map((item) => normalizeUrl(item.kind === 'link' ? item.url : '').key),
      ),
    [state.items],
  );

  const preview = useMemo(() => {
    const fresh = [];
    const seen = new Set<string>();
    let duplicates = 0;
    for (const entry of file.entries) {
      const key = normalizeUrl(entry.url).key;
      if (!key || existing.has(key) || seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      fresh.push(entry);
    }
    return { fresh, duplicates, folders: new Set(file.entries.map((entry) => entry.folder).filter(Boolean)).size };
  }, [file.entries, existing]);

  async function importNow() {
    setBusy(true);
    try {
      const result = await run(api.importBookmarks(file.entries, tagFolders));
      if (!result) return;
      if (result.added > 0) {
        pushToast(
          `Imported ${result.added} ${result.added === 1 ? 'link' : 'links'}${
            result.skipped > 0 ? ` · ${result.skipped} already saved` : ''
          }`,
          'success',
        );
      } else {
        pushToast('Every bookmark in that file is already saved', 'info');
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Import browser bookmarks"
      subtitle={file.fileName}
      onClose={onClose}
      size="md"
      footer={
        <>
          <span className="modal__footer-note">
            {preview.fresh.length} of {file.entries.length} will be added.
          </span>
          <span className="modal__spacer" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Upload size={14} />}
            onClick={() => void importNow()}
            disabled={busy || preview.fresh.length === 0}
          >
            {busy
              ? 'Importing…'
              : `Import ${preview.fresh.length} ${preview.fresh.length === 1 ? 'link' : 'links'}`}
          </Button>
        </>
      }
    >
      <div className="form">
        <div className="import-stats">
          <span>
            <strong>{file.entries.length}</strong> bookmarks found
          </span>
          <span>
            <strong>{preview.fresh.length}</strong> new
          </span>
          <span>
            <strong>{preview.duplicates}</strong> already saved
          </span>
          <span>
            <strong>{preview.folders}</strong> folders
          </span>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={tagFolders}
            onChange={(event) => setTagFolders(event.target.checked)}
          />
          <span className="checkbox__inline">
            <FolderTree size={14} /> Tag each link with its bookmark folder
          </span>
        </label>

        {preview.fresh.length > 0 ? (
          <div className="import-list">
            <h4>
              <Bookmark size={13} /> First {Math.min(6, preview.fresh.length)} of the new links
            </h4>
            <ul>
              {preview.fresh.slice(0, 6).map((entry) => (
                <li key={entry.url}>
                  <span className="import-list__title">{entry.title || displayUrl(entry.url)}</span>
                  <span className="import-list__meta">
                    {displayUrl(entry.url)}
                    {entry.folder ? ` · ${entry.folder}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted">Nothing new in this file — every address is already in your library.</p>
        )}

        <p className="field__hint">
          Export bookmarks from Chrome or Edge as an HTML file, then choose it here. Duplicates are skipped
          using the same URL matching as the rest of the app, and the import is one undoable change.
        </p>
      </div>
    </Modal>
  );
}
