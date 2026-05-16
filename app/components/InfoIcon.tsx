// InfoIcon — small italic "i" inside a 14px circle that reveals a custom
// styled tooltip on hover or keyboard focus. Replaces the native browser
// `title` attribute tooltips used previously.
//
// Styling lives in app/globals.css under .info-icon and .tooltip — the
// component just renders the markup. The .info-icon class handles the
// circle + base color; the .tooltip child handles the popup.
//
// Touch-device note: hover-based tooltips don't appear on touch devices
// because there's no hover. Acceptable for the desktop-first v1; revisit
// with a tap-toggle behavior if mobile UX becomes important.

type InfoIconProps = {
  /** The text shown inside the tooltip popup. */
  tooltip: string;
  /** Optional aria-label for screen readers. Defaults to "More info". */
  ariaLabel?: string;
  /**
   * Visual variant:
   *   - "default" (theme-responsive gray, used everywhere outside the cream
   *     brand zone)
   *   - "counter" (dollar-bill-brown, used inside the masthead + counter
   *     strip so it sits comfortably on the cream background)
   * Both variants share the same tooltip styling.
   */
  variant?: "default" | "counter";
};

export default function InfoIcon({
  tooltip,
  ariaLabel = "More info",
  variant = "default",
}: InfoIconProps) {
  const className = variant === "counter" ? "counter-info" : "info-icon";
  return (
    <span
      className={className}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
    >
      i
      <span className="tooltip" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}
