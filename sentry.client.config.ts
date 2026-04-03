// Sentry client configuration
// Requires SENTRY_DSN environment variable to be set
// Get your DSN at https://sentry.io
// Gracefully degrades when DSN is not configured

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? undefined,
  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',
  // Capture Replays for better debugging
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  tracesSampleRate: 0.1,
  // Automatically strip URLs and query strings from errors
  beforeSend(event) {
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url)
        event.request.url = url.pathname // Strip query strings with potential secrets
      } catch {}
    }
    return event
  },
})
