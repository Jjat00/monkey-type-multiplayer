'use client';

import { useEffect, useRef, useState } from 'react';

interface CopyButtonProps {
  value: string;
  label: string;
  /** Label shown briefly after a successful copy. */
  copiedLabel?: string;
  /** ms the "copied" state sticks around before reverting. */
  resetAfterMs?: number;
  className?: string;
}

/**
 * Small pill-style copy button. Tries the modern Clipboard API first; if
 * that's unavailable (older browser, non-secure context) falls back to a
 * hidden textarea + execCommand so it still works on http://localhost.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = 'copied!',
  resetAfterMs = 1800,
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async (): Promise<void> => {
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), resetAfterMs);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded bg-sub-alt px-3 py-1.5 font-mono text-xs text-sub transition-colors hover:bg-main hover:text-bg ${className}`}
    >
      <span aria-hidden="true">{copied ? '✓' : '📋'}</span>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

async function copyToClipboard(value: string): Promise<boolean> {
  // Modern path — requires https or localhost, available in all evergreens.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through to legacy path */
    }
  }
  // Legacy fallback: offscreen textarea + execCommand. Deprecated but still
  // works in contexts where the Clipboard API is blocked (iframes, old browsers).
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
