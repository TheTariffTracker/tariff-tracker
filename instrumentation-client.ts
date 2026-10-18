// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://562ab922ff6a1e4b607defdc645384f0@o4511481092636672.ingest.us.sentry.io/4511481127108608",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Session Replay records a replayable reconstruction of what a visitor saw
  // and did. ** Deliberately 0: we record NOTHING on a normal visit. ** The
  // Sentry wizard defaults this to 0.1, which silently recorded 1 in 10 visits
  // from May to October 2026 -- in direct contradiction with the "No
  // advertising, no tracking" line printed in the site masthead. Do not raise
  // it without changing that claim first. Turned off 2026-10-18.
  replaysSessionSampleRate: 0,

  // Replay IS captured when an error actually occurs, which is the debugging
  // value Sentry was added for in the first place.
  replaysOnErrorSampleRate: 1.0,

  // ** Deliberately false. ** true (the wizard default) attaches IP addresses
  // and request details to every event. The debugging value at this traffic
  // level is negligible; the disclosure burden is not. Turned off 2026-10-18.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
