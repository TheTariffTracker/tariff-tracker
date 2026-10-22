"use client";

// UnlockModal — the Phase 3.7 lead-capture dialog.
//
// ONE modal, opened by ANY gate trigger (Decision 1: "any trigger opens the
// same modal"). It is intentionally generic: it says nothing about which page
// the visitor came from, because that varies and hardcoding it would go stale.
//
// Submitting POSTs to /api/unlock, which writes the lead_capture row, sets the
// HttpOnly tt_unlock cookie (soft unlock, SITE-WIDE), and sends a confirmation
// email. Clicking that link flips verified = true, which is what actually
// releases the calculator's Yale per-authority block (Decision 1d). So a
// successful submit here does NOT unlock that block -- the success copy has to
// be accurate about that.
//
// Dialog conventions mirror CiteButton.tsx: portal into document.body, Escape
// to close, scroll lock, focus moved in and restored to the trigger on close.
// Styling lives in app/globals.css under .unlock-* classes.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SEGMENTS, USE_CASES, MAX_NOTE_LENGTH } from "../lib/unlock-config";

// Display labels for the stored slugs. The slug lists are imported, never
// retyped, so a label edit here cannot desync from what the API accepts.
// Wording is Decision 2, locked 2026-10-17.
const SEGMENT_LABELS: Record<string, string> = {
  importer_business: "Importer, exporter, or business affected by tariffs",
  trade_attorney_broker: "Trade attorney or customs broker",
  journalist: "Journalist or writer",
  researcher_academic_student: "Researcher, academic, or student",
  government_policy: "Government or policy staff",
  financial_analyst: "Financial or investment analyst",
  citizen: "Citizen trying to understand this",
  other: "Other",
};

const USE_CASE_LABELS: Record<string, string> = {
  specific_product_rates: "Looking up rates for a specific product",
  research_writing: "Research or writing",
  professional_client_work: "Professional or client work",
  following_policy: "Following tariff policy",
  general_interest: "General interest",
  other: "Other",
};

// The exact partner-opt-in wording identified by CONSENT_TEXT_VERSION in
// unlock-config.ts. If this sentence changes, bump that constant in the same
// commit -- it is the stored proof of what a person actually agreed to.
const PARTNER_OPT_IN_TEXT =
  "Occasionally send me a message from a sponsor or partner — a few times a year at most. Tariff Tracker sends it; your address is never shared.";

type Phase = "form" | "submitting" | "done";

export default function UnlockModal({
  open,
  onClose,
  onSubmitted,
  triggerRef,
  // "resend" trims the dialog down to the email field alone. The survey
  // answers are already stored and /api/unlock deliberately does not overwrite
  // them, so re-asking the three questions would be pure friction. Submitting
  // in this mode re-issues the confirm token and sends a fresh link.
  mode = "full",
}: {
  open: boolean;
  onClose: () => void;
  mode?: "full" | "resend";
  // Called after a successful submit so the page behind the dialog can switch
  // its locked panel to the "awaiting confirmation" state without a refresh.
  onSubmitted?: (verified: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [segment, setSegment] = useState("");
  const [useCase, setUseCase] = useState("");
  const [note, setNote] = useState("");
  const [partnerOptIn, setPartnerOptIn] = useState(false);
  // True when the submitted address turned out to be already confirmed, so the
  // success state does not tell a verified user to go check their inbox.
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  const closeDialog = useCallback(() => {
    onClose();
    triggerRef?.current?.focus();
  }, [onClose, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closeDialog]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "submitting") return;
    setError(null);
    setPhase("submitting");

    let res: Response;
    try {
      res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          segment: segment || null,
          use_case: useCase || null,
          improvement_note: note.trim() || null,
          partner_opt_in: partnerOptIn,
        }),
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPhase("form");
      return;
    }

    if (res.ok) {
      let verified = false;
      try {
        const data = (await res.json()) as { verified?: boolean };
        verified = data.verified === true;
      } catch {
        // Body unreadable but the status was 200 -- the row was written. Treat
        // it as an unverified success rather than showing a false error.
      }
      setAlreadyVerified(verified);
      setPhase("done");
      onSubmitted?.(verified);
      return;
    }

    // Surface the server's own message for 400 (it explains what is wrong with
    // the address); everything else gets copy a non-technical visitor can act on.
    let serverMessage = "";
    try {
      const data = (await res.json()) as { error?: string };
      serverMessage = typeof data.error === "string" ? data.error : "";
    } catch {
      /* non-JSON error body */
    }

    if (res.status === 400) {
      setError(serverMessage || "That email address does not look valid.");
    } else if (res.status === 429) {
      setError("Too many attempts from your connection. Try again in an hour.");
    } else if (res.status === 503) {
      setError("Sign-ups are not open yet. Please try again later.");
    } else {
      setError("Something went wrong on our end. Try again in a moment.");
    }
    setPhase("form");
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="unlock-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        className="unlock-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Unlock Tariff Tracker"
        tabIndex={-1}
      >
        <div className="unlock-head">
          <h2 className="unlock-title">
            {phase === "done"
              ? alreadyVerified
                ? "You’re all set"
                : "Check your email"
              : mode === "resend"
                ? "Send the link again"
                : "Unlock the rest of Tariff Tracker"}
          </h2>
          <button type="button" className="unlock-close" onClick={closeDialog} aria-label="Close">
            &times;
          </button>
        </div>

        {phase === "done" ? (
          <>
            {alreadyVerified ? (
              <p className="unlock-success-body">
                This address is already confirmed. The calculator&apos;s full rate breakdown
                and the Tariff Trends charts are unlocked on this browser.
              </p>
            ) : (
              <>
                {mode === "resend" ? (
                  <p className="unlock-success-body">
                    A new link is on its way to <strong>{email.trim()}</strong>. The older link
                    no longer works, so use this one.
                  </p>
                ) : (
                  <p className="unlock-success-body">
                    Your answers are saved. One step left: click the link we sent to{" "}
                    <strong>{email.trim()}</strong>{" "}
                    to unlock the calculator&apos;s full rate breakdown and the Tariff Trends
                    charts.
                  </p>
                )}
                <p className="unlock-success-note">
                  Confirmed on a different device? Refresh this page.
                </p>
              </>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="unlock-intro">
              {mode === "resend"
                ? "Enter the same address you signed up with and we’ll send a fresh confirmation link. Your earlier answers are kept — no need to fill anything in again."
                : "Much of this site is free with no sign-up. Two things ask for an email first: the full rate breakdown in the calculator, and the decomposition charts on Tariff Trends. That’s the price of the work, in place of advertising or a subscription. Takes about twenty seconds."}
            </p>

            {error && (
              <p className="unlock-error" role="alert">
                {error}
              </p>
            )}

            <div className="unlock-field">
              <label className="unlock-label" htmlFor="unlock-email">
                Email address
              </label>
              <input
                id="unlock-email"
                className="unlock-input"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            {mode === "full" && (
            <>
            <div className="unlock-field">
              <label className="unlock-label" htmlFor="unlock-segment">
                Which best describes you?
              </label>
              <select
                id="unlock-segment"
                className="unlock-select"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                required
              >
                <option value="">Select one&hellip;</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="unlock-field">
              <label className="unlock-label" htmlFor="unlock-usecase">
                What brings you to Tariff Tracker?
              </label>
              <select
                id="unlock-usecase"
                className="unlock-select"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                required
              >
                <option value="">Select one&hellip;</option>
                {USE_CASES.map((u) => (
                  <option key={u} value={u}>
                    {USE_CASE_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>

            <div className="unlock-field">
              <label className="unlock-label" htmlFor="unlock-note">
                What would make Tariff Tracker more useful to you?{" "}
                <span className="unlock-optional">optional</span>
              </label>
              <textarea
                id="unlock-note"
                className="unlock-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                maxLength={MAX_NOTE_LENGTH}
                placeholder="One line is plenty."
              />
              <span className="unlock-count">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>

            <label className="unlock-check">
              <input
                type="checkbox"
                checked={partnerOptIn}
                onChange={(e) => setPartnerOptIn(e.target.checked)}
              />
              <span className="unlock-check-label">
                <span className="unlock-check-tag">Optional</span>
                {PARTNER_OPT_IN_TEXT}
              </span>
            </label>
            </>
            )}

            <button type="submit" className="unlock-submit" disabled={phase === "submitting"}>
              {phase === "submitting"
                ? mode === "resend"
                  ? "Sending…"
                  : "Unlocking…"
                : mode === "resend"
                  ? "Send it again"
                  : "Unlock the site"}
            </button>

            {mode === "full" && (
              <p className="unlock-fine">
                We may email you about significant changes to the project &mdash; a few times a
                year at most, and you can opt out without losing access. See our{" "}
                <a href="/privacy">Privacy Policy</a>.
              </p>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
