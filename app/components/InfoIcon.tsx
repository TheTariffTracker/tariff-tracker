// InfoIcon — small italic "i" inside a 14px circle that reveals a custom
// styled tooltip on hover or keyboard focus. Replaces the native browser
// `title` attribute tooltips used previously.
//
// Styling lives in app/globals.css under .info-icon and .tooltip — the
// component just renders the markup. The .info-icon class handles the
// circle + base color; the .tooltip child handles the popup.
//
// Touch-device note: an earlier version of this comment claimed tooltips
// never appear on touch devices because there is no hover. That is wrong, and
// it was wrong in a way that mattered — it argued for hiding the tooltip on
// phones, which would have deleted a working feature. Tapping the span
// focuses it (tabIndex=0 below), and the `.counter-info:focus .tooltip` /
// `.info-icon:focus .tooltip` rules reveal it, so tooltips ARE reachable by
// tap. Confirmed on a real phone, 2026-10-24.
//
// They used to open mostly off screen; app/globals.css now pins .tooltip to
// the viewport under 700px. There is still no way to dismiss one except by
// tapping elsewhere to blur the icon.

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
