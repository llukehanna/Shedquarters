/**
 * Paths no visitor asks for: the probes vulnerability scanners sweep every
 * host with, looking for leaked secrets and stock admin panels.
 * custom-worker.ts answers them with a bare 404 before the request reaches
 * Next.
 *
 * Why it matters here: an unmatched path is still a full Next render through
 * OpenNext (the not-found page, the proxy, the framework's own work), and a
 * sweep fans out across cold isolates, each of which also pays to load the
 * handler. On the Free plan's 10 ms CPU limit that is Error 1102
 * (exceededResources). A bare 404 costs next to nothing.
 *
 * The one hard rule: never catch a path the app serves. It is a blocklist of
 * shapes no route of this app has (a dot-segment, a server-side script or
 * secret file extension, a WordPress or phpMyAdmin directory), not an
 * allowlist of routes, so a new route needs no change here.
 * tests/probe-paths.test.ts lists the app's routes and files and holds every
 * one of them to passing through.
 *
 * Pure and dependency-free: the Worker entry imports it. After Circuit's
 * src/lib/probe-paths.ts.
 */

/** File extensions this app never serves and scanners always ask for. */
const PROBE_EXTENSIONS = new Set([
  // Server-side scripts of other stacks.
  'php', 'php3', 'php4', 'php5', 'php7', 'phtml', 'phar', 'asp', 'aspx', 'ashx', 'jsp', 'jspx', 'cgi', 'pl',
  // Secrets, configs and keys.
  'env', 'ini', 'cfg', 'conf', 'config', 'yml', 'yaml', 'toml', 'json', 'pem', 'key', 'crt', 'p12', 'pfx',
  // Dumps, backups and archives.
  'sql', 'sqlite', 'db', 'bak', 'backup', 'old', 'orig', 'save', 'swp', 'tmp', 'log',
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'rar', '7z',
])

/** Directory names of software this app is not, at any depth. */
const PROBE_SEGMENTS = new Set(['wordpress', 'cgi-bin', 'phpmyadmin'])

/** Whether `pathname` (a URL's pathname, no query) is a scanner's probe rather than anything the app serves. */
export function isProbePath(pathname: string): boolean {
  let path = pathname
  try {
    path = decodeURIComponent(pathname)
  } catch {
    // A malformed escape says nothing either way: judge it as written.
  }
  path = path.toLowerCase()

  // Next's own files, and the well-known URIs (ACME, security.txt), are never probes.
  if (path.startsWith('/_next/') || path.startsWith('/.well-known/')) return false

  const segments = path.split('/').filter((segment) => segment !== '')
  for (const segment of segments) {
    // A dotfile or dot-directory: /.env, /.git/config, /gitlab/.env, /.aws/credentials.
    if (segment.startsWith('.')) return true
    if (segment.startsWith('wp-') || PROBE_SEGMENTS.has(segment)) return true
  }

  const last = segments.at(-1) ?? ''
  const dot = last.lastIndexOf('.')
  return dot > 0 && PROBE_EXTENSIONS.has(last.slice(dot + 1))
}
