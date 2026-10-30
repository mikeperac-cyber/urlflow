import { useEffect, useState } from 'react';
import { faviconTone, initialsFor } from '../../shared/url';
import { api } from '../lib/api';

export function Favicon({ url, faviconKey, size = 'md' }: {
  url: string;
  faviconKey?: string | null;
  size?: 'sm' | 'md';
}) {
  const [icon, setIcon] = useState<{ key: string; data: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setIcon(null);
    if (faviconKey) {
      void api.readFavicon(faviconKey).then((data) => {
        if (alive && data && /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) {
          setIcon({ key: faviconKey, data });
        }
      }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [faviconKey]);

  return (
    <span className={`favicon${size === 'sm' ? ' favicon--sm' : ''}`} style={{ background: faviconTone(url) }} aria-hidden="true">
      {icon && icon.key === faviconKey ? (
        <img src={icon.data} alt="" onError={() => setIcon(null)} />
      ) : initialsFor(url)}
    </span>
  );
}
