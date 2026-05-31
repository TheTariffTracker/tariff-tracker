"use client";

// CiteButton — a small "Cite" control attached to a cite-worthy figure on the
// site. Clicking it opens a modal dialog offering the figure's citation in
// four formats (Chicago, APA, BibTeX, Plain text), each with copy-to-clipboard.
//
// The "accessed" date is captured on the client at the moment the dialog opens
// (not at render/build time), so it reflects the reader's actual access date
// and there is no SSR/ISR hydration mismatch — the button renders statically
// and the dialog only mounts after a user interaction.
//
// The dialog is rendered into document.body via a portal so it can never be
// clipped by an overflow:hidden / transformed ancestor (e.g. the horizontally
// scrolling stat-strip the buttons live inside).
//
// Styling lives in app/globals.css under .cite-* classes.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildCitations,
  FORMAT_LABELS,
  type CitationData,
  type CitationFormat,
} from "../lib/citation";

type CiteButtonProps = CitationData & {
  /**
   * Visual variant:
   *   - "default": theme-responsive, used on standard (non-cream) surfaces
   *   - "counter": dollar-bill-brown, used inside the cream counter strip
   */
  variant?: "default" | "counter";
};

const FORMAT_ORDER: CitationFormat[] = ["chicago", "apa", "bibtex", "plain"];

export default function CiteButton({
  variant = "default",
  ...data
}: CiteButtonProps) {
  const [open, setOpen] = useState(false);
  const [accessed, setAccessed] = useState<Date | null>(null);
  const [active, setActive] = useState<CitationFormat>("chicago");
  const [copied, setCopied] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openDialog = useCallback(() => {
    setAccessed(new Date());
    setActive("chicago");
    setCopied(false);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setOpen(false);
    // Restore focus to the trigger for keyboard users.
    triggerRef.current?.focus();
  }, []);

  // ESC to close + lock body scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog.
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeDialog]);

  const citations =
    accessed !== null ? buildCitations(data, accessed) : null;
  const activeText = citations ? citations[active] : "";

  const handleCopy = useCallback(async () => {
    if (!activeText) return;
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable/blocked — select the text so the reader
      // can copy manually with Ctrl/Cmd+C.
      const pre = dialogRef.current?.querySelector(".cite-text");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [activeText]);

  const buttonClass =
    variant === "counter" ? "cite-button cite-button-counter" : "cite-button";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClass}
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Cite
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="cite-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDialog();
            }}
          >
            <div
              ref={dialogRef}
              className="cite-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Cite: ${data.figureLabel}`}
              tabIndex={-1}
            >
              <div className="cite-modal-head">
                <h2 className="cite-modal-title">Cite this figure</h2>
                <button
                  type="button"
                  className="cite-close"
                  onClick={closeDialog}
                  aria-label="Close"
                >
                  &#215;
                </button>
              </div>

              <p className="cite-figure-label">{data.figureLabel}</p>

              <div className="cite-tabs" role="tablist" aria-label="Citation format">
                {FORMAT_ORDER.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    role="tab"
                    aria-selected={active === fmt}
                    className={`cite-tab${active === fmt ? " cite-tab-active" : ""}`}
                    onClick={() => {
                      setActive(fmt);
                      setCopied(false);
                    }}
                  >
                    {FORMAT_LABELS[fmt]}
                  </button>
                ))}
              </div>

              <pre className="cite-text">{activeText}</pre>

              <div className="cite-actions">
                <button type="button" className="cite-copy" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
