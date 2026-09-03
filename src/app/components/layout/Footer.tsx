import { ShieldCheck } from 'lucide-react';

import { branding } from '../../../config/branding';

export function Footer() {
  return (
    <footer className="border-t border-default py-4 text-xs text-muted">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-3 sm:px-5">
        <p className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} aria-hidden />
          {branding.tagline}
        </p>
        <p className="flex flex-wrap items-center gap-3">
          <a href="/openapi.yaml" className="hover:text-fg">
            API (OpenAPI)
          </a>
          <a
            href={branding.repositoryUrl}
            rel="noopener noreferrer"
            target="_blank"
            className="hover:text-fg"
          >
            Source code
          </a>
          <span>
            {branding.name} v{__APP_VERSION__}
          </span>
        </p>
      </div>
    </footer>
  );
}
