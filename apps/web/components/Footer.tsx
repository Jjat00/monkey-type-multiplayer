/**
 * Global footer rendered by the root layout. Sits under the page content
 * (not fixed) so it doesn't overlap the typing area or header dropdowns.
 *
 * Kept server-side (no 'use client') — it's static content and having it
 * render on the server avoids any hydration work for a component that
 * never changes.
 */
export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-sub/10 bg-bg/60 py-3 font-mono text-xs text-sub">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6">
        <span>
          <span className="text-text">key</span>
          <span className="text-main">duelo</span>
        </span>
        <span aria-hidden="true" className="text-sub/50">•</span>
        <a
          href="https://github.com/Jjat00/keyduelo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-text"
        >
          <GitHubMark />
          <span>github</span>
        </a>
      </div>
    </footer>
  );
}

/**
 * Inline SVG of the GitHub mark — avoids a dependency on an icon library
 * for a single occurrence. `currentColor` lets it inherit the link's color.
 */
function GitHubMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.18-.02-2.14-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.55-.3-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.48.11-3.07 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.39.98 0 1.98.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .3.21.66.79.55A10.53 10.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}
