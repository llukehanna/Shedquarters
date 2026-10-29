/**
 * Every <Link> in the app opts out of prefetching. Each prefetch of a page
 * here is a whole Worker invocation (every page is dynamic), and with the
 * defaults opening the app cost ~18 of them: the tab bar, every player row,
 * the Games and H2H cards. On the Free plan's 10 ms CPU limit that fan-out
 * turned into Error 1102s. A new link that forgets the prop fails here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

/** Each `<Link ...>` opening tag in a file, up to its closing `>`. */
function linkTags(source: string): string[] {
  const tags: string[] = []
  const re = /<Link\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    let depth = 0
    let i = m.index + 1
    for (; i < source.length; i++) {
      const c = source[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(source.slice(m.index, i + 1))
  }
  return tags
}

describe('links do not prefetch', () => {
  const files = [...sources(path.join(ROOT, 'app')), ...sources(path.join(ROOT, 'components'))].filter((f) =>
    readFileSync(f, 'utf8').includes("from 'next/link'"),
  )

  it('finds the links', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const file of files) {
    it(path.relative(ROOT, file), () => {
      const tags = linkTags(readFileSync(file, 'utf8'))
      expect(tags.length).toBeGreaterThan(0)
      for (const tag of tags) expect(tag).toContain('prefetch={false}')
    })
  }
})
