"use client";

// UnlockGate — the in-page placeholder that stands where gated content would
// be, plus the button that opens the shared UnlockModal.
//
// This is a small client island inside an otherwise server-rendered page. The
// server decides WHETHER to render it (by checking the tt_unlock cookie and the
// row's verified flag) and passes down which state it should start in; the
// client only handles opening the dialog and the post-submit transition.
//
// Two states:
//   1. No cookie / unknown visitor -> the unlock pitch + button, full modal.
//   2. Cookie present but verified = false -> "check your email", plus a
//      resend button that opens the modal in email-only mode. Submitting from
//      state 1 switches to state 2 without needing a page refresh.
//
// Styling lives in app/globals.css under .unlock-* classes.

import { useRef, useState } from "react";
import UnlockModal from "./UnlockModal";

export default function UnlockGate({
  // What the gated content is, in the visitor's words. Passed in rather than
  // hardcoded so this component can front any gated surface later.
  label,
  // Server-detected: the visitor has an unlock cookie but has not clicked the
  // confirmation link yet.
  awaitingConfirmation = false,
}: {
  label: string;
  awaitingConfirmation?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [awaiting, setAwaiting] = useState(awaitingConfirmation);
  // Captured when the dialog opens, NOT derived from `awaiting` on each render.
  // A successful signup sets awaiting = true while the dialog is still showing
  // its success state; deriving the mode live would swap that copy out from
  // under the person who just submitted.
  const [modalMode, setModalMode] = useState<"full" | "resend">("full");
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openModal(m: "full" | "resend") {
    setModalMode(m);
    setOpen(true);
  }

  // One modal instance, shared by both states.
  const modal = (
    <UnlockModal
      open={open}
      mode={modalMode}
      onClose={() => setOpen(false)}
      onSubmitted={(verified) => {
        // A verified returning address means the server will release the
        // content on the next render, so send them to a refresh rather than
        // faking an unlock in the client. Otherwise show "check your email".
        if (verified) {
          window.location.reload();
        } else {
          setAwaiting(true);
        }
      }}
      triggerRef={triggerRef}
    />
  );

  if (awaiting) {
    return (
      <div className="unlock-locked">
        <p className="unlock-locked-title">Check your email</p>
        <p className="unlock-locked-body">
          We sent you a confirmation link. Clicking it releases the {label}. Already clicked it
          on another device? Refresh this page.
        </p>
        <button
          ref={triggerRef}
          type="button"
          className="unlock-submit"
          style={{ width: "auto", minWidth: "200px" }}
          onClick={() => openModal("resend")}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Send it again
        </button>
        {modal}
      </div>
    );
  }

  return (
    <div className="unlock-locked">
      <p className="unlock-locked-title">The {label} is behind a free sign-up</p>
      <p className="unlock-locked-body">
        An email address and three short questions &mdash; no payment, no advertising. It unlocks
        the whole site, not just this panel.
      </p>
      <button
        ref={triggerRef}
        type="button"
        className="unlock-submit"
        style={{ width: "auto", minWidth: "200px" }}
        onClick={() => openModal("full")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Unlock the site
      </button>
      {modal}
    </div>
  );
}
