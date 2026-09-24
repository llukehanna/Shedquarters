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
  // Only `main` deploys from Git. A preview would have no DATABASE_URL (it's
  // production-only) and fail collecting page data, a red check on every PR,
  // while CI already builds, typechecks, lints and tests each one. Decided by
  // branch name, not an ignoreCommand: one reading $VERCEL_ENV skipped the
  // production build too. `**`, not `*`, so branches with a slash
  // (claude/...) match; a branch matching both rules deploys (true wins).
  git: { deploymentEnabled: { '**': false, main: true } },
  crons: [{ path: '/api/cron/backup', schedule: '0 9 * * *' }],
}
