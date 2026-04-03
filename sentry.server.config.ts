// Sentry server configuration
// Requires SENTRY_DSN environment variable to be set
// Gracefully degrades when DSN is not configured

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? undefined,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  // Strip query strings from URLs before sending to Sentry
  beforeSend(event) {
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url)
        event.request.url = url.pathname
      } catch {}
    }
    return event
  },
})
