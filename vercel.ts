import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  // Production builds apply lib/schema.sql before building, so a deploy can
  // never serve code ahead of its schema. The schema is idempotent and only
  // ever adds things, so re-running it on every deploy is a no-op, and the
  // version still serving traffic keeps working against it. If the migration
  // fails, the build fails and the previous deployment stays live. Preview
  // builds skip it: DATABASE_URL is production-only, and a preview must never
  // alter the production schema anyway.
  buildCommand: 'if [ "$VERCEL_ENV" = "production" ]; then npm run migrate; fi && next build',
  crons: [{ path: '/api/cron/backup', schedule: '0 9 * * *' }],
}
