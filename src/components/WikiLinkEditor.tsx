import { useEffect, useRef, useState } from 'react';
import { insertWikiLink, searchWikiTargets, wikiQueryAt } from '../../shared/wikiLinks';
import { ITEM_KIND_LABEL, type AnyItem } from '../../shared/types';
import { useWikiItems } from './WikiText';

export function WikiLinkEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  rows?: number;
}) {
  const items = useWikiItems();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = query ? searchWikiTargets(query.query, items) : [];

  useEffect(() => {
    setActive(0);
  }, [query?.query]);

  function choose(item: AnyItem) {
    const caret = textarea.current?.selectionStart ?? value.length;
    const result = insertWikiLink(value, caret, item);
    onChange(result.text);
    setQuery(null);
    window.requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(result.caret, result.caret);
    });
  }

  return (
    <div className="wiki-editor">
      <textarea
        ref={textarea}
        className="input textarea"
        rows={rows}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(wikiQueryAt(event.target.value, event.target.selectionStart ?? 0));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query) {
            event.preventDefault();
            setQuery(null);
            return;
          }
          if (!query || suggestions.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (current + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (current - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            choose(suggestions[active]);
          }
        }}
        onBlur={() => setQuery(null)}
      />
      {query ? (
        <ul className="wiki-suggestions" role="listbox" aria-label="Wiki link suggestions">
          {suggestions.length === 0 ? (
            <li className="wiki-suggestions__empty">No matching items</li>
          ) : (
            suggestions.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`wiki-suggestion ${index === active ? 'is-active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(item);
                  }}
                >
                  <span>{item.title}</span>
                  <em>{ITEM_KIND_LABEL[item.kind]}</em>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
