/**
 * The Worker's scanner filter (lib/probe-paths.ts). Bots sweep every host for
 * leaked secrets and admin panels (/.env, /.git/config, /wp-login.php) and
 * each miss used to reach Next and render a 404 page, on the Free plan's
 * 10 ms CPU limit. custom-worker.ts answers these with a bare 404 first.
 *
 * The filter's one hard rule: it never catches a path the app serves. The
 * first list is every route and file the app has; adding a route that
 * collides with a probe pattern should fail here, not in production.
 */

import { describe, expect, test } from 'vitest'
import { isProbePath } from '@/lib/probe-paths'

const REAL = [
  '/',
  '/?sport=spikeball',
  '/games',
  '/h2h',
  '/h2h?a=0662c526-c3f8-46a0-b4b2-683cf15c7922&b=aeb9796f-12ac-4cca-9003-9d9605cac734',
  '/table',
  '/roster',
  '/players/0662c526-c3f8-46a0-b4b2-683cf15c7922',
  '/gate',
  '/who',
  '/join/Zm9vYmFyLWJhei1xdXV4X3Rva2VuLXZhbHVl',
  '/join/abc-_DEF123',
  // Invite tokens are base64url, so one can start with any letters, including
  // the WordPress prefix in any case. A probe rule matching one would kill the
  // house's invite link until it was reset.
  '/join/wp-xyz',
  '/join/wP-4f1aQe9-_Zx0Vb7LmN2oPq3RsT5uVw6XyZ8aBcDeF',
  '/join/WP-4f1aQe9-_Zx0Vb7LmN2oPq3RsT5uVw6XyZ8aBcDeF',
  '/api/games',
  '/api/cron/backup',
  '/_next/static/chunks/app/page-0123abcd.js',
  '/_next/static/css/app.css',
  '/_next/static/media/barlow-condensed.woff2',
  '/_next/image?url=%2Ficons%2Ficon-192.png&w=64&q=75',
  '/icon.svg',
  '/icon.svg?b2a4e1f0',
  '/apple-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
  '/favicon.ico',
  '/robots.txt',
  '/.well-known/security.txt',
  '/.well-known/acme-challenge/token123',
  // Not routes, but nothing about them says scanner: Next answers its own 404.
  '/players/not-a-player',
  '/administrator',
]

const PROBES = [
  '/wp-anything',
  '/WP-Login.php',
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.ENV',
  '/api/.env',
  '/backend/.env.bak',
  '/.git/config',
  '/.git/HEAD',
  '/.aws/credentials',
  '/.vscode/sftp.json',
  '/.DS_Store',
  '/%2eenv',
  '/phpinfo.php',
  '/wp-login.php',
  '/xmlrpc.php',
  '/index.php?s=/index/think',
  '/admin/config.php',
  '/wp-admin/',
  '/wp-admin/setup-config.php',
  '/wp-content/plugins/',
  '/wp-includes/wlwmanifest.xml',
  '/blog/wp-includes/js/jquery.js',
  '/wordpress/',
  '/cgi-bin/luci',
  '/phpmyadmin/',
  '/phpMyAdmin/index.php',
  '/config.json',
  '/credentials.json',
  '/backup.zip',
  '/db.sql',
  '/database.sqlite',
  '/config.yml',
  '/docker-compose.yaml',
  '/web.config',
  '/server.key',
  '/debug.log',
  '/default.aspx',
  '/login.jsp',
]

const ORIGIN = 'https://die.lukeghanna.com'

describe('isProbePath', () => {
  test.each(REAL)('lets %s through to the app', (path) => {
    expect(isProbePath(new URL(path, ORIGIN).pathname)).toBe(false)
  })

  test.each(PROBES)('answers %s with a bare 404', (path) => {
    expect(isProbePath(new URL(path, ORIGIN).pathname)).toBe(true)
  })

  test('a malformed escape is not by itself a probe', () => {
    expect(isProbePath('/players/%E0%A4%A')).toBe(false)
  })
})
