import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { contentTypesByGroup } from '@shared/content/registry';
import type { ContentType } from '@shared/content/schemas';

import { cn } from '../../lib/cn';
import { TypeIcon } from '../../lib/icons';

export function ContentTypePicker({
  value,
  onChange,
}: {
  value: ContentType;
  onChange: (type: ContentType) => void;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contentTypesByGroup()
      .map((g) => ({
        ...g,
        types: g.types.filter(
          (t) =>
            !q ||
            t.label.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.id.includes(q),
        ),
      }))
      .filter((g) => g.types.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search content types"
          aria-label="Search content types"
          className="field-input pl-8"
        />
      </div>
      <div role="radiogroup" aria-label="Content type" className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.group}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
              {group.types.map((type) => {
                const selected = type.id === value;
                return (
                  <button
                    key={type.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={type.description}
                    onClick={() => onChange(type.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100'
                        : 'border-default bg-surface-2 text-muted hover:border-strong hover:text-fg',
                    )}
                  >
                    <TypeIcon name={type.icon} size={18} />
                    <span className="truncate w-full">{type.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 ? (
          <p className="text-sm text-muted">No content type matches “{query}”.</p>
        ) : null}
      </div>
    </div>
  );
}
