import { useMemo } from 'react';
import { Globe, Plus, Search } from 'lucide-react';
import { groupLinksByHost } from '../../shared/sites';
import { hostOf } from '../../shared/url';
import { useApp } from '../app-context';
import { LinkCard } from '../components/items';
import { Button, EmptyState } from '../components/ui';

export function SitesView() {
  const { links, search, openEditor } = useApp();
  const query = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const filtered = links.filter((link) => (
      !query || [link.title, link.url, hostOf(link.url), link.siteName, link.notes, ...link.tags]
        .join(' ').toLowerCase().includes(query)
    ));
    return groupLinksByHost(filtered);
  }, [links, query]);

  if (groups.length === 0) {
    return query ? (
      <EmptyState
        icon={<Search size={22} />}
        title="No sites match"
        hint="Try a different website, title or search term."
      />
    ) : (
      <EmptyState
        icon={<Globe size={22} />}
        title="Your sites will appear here"
        hint="Save a link to start browsing your library by website."
        action={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'link' })}>
            Save a link
          </Button>
        }
      />
    );
  }

  return (
    <div className="stack">
      {groups.map((group) => (
        <section key={group.host} className="site-group" aria-label={group.host}>
          <header className="site-group__header">
            <h2>{group.host}</h2>
            <div className="site-group__counts">
              <span>{group.links.length} {group.links.length === 1 ? 'link' : 'links'}</span>
              <span>{group.unreadCount} unread</span>
              <span>{group.laterCount} later</span>
            </div>
          </header>
          <div className="card-grid">
            {group.links.map((link) => <LinkCard key={link.id} link={link} compact />)}
          </div>
        </section>
      ))}
    </div>
  );
}
