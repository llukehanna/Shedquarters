import { readFileSync } from 'node:fs'
import postgres from 'postgres'

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const sql = postgres(url)
  const ddl = readFileSync('lib/schema.sql', 'utf8')

  const statements = ddl
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // sql.unsafe is required here: DDL cannot be parameterised, and these
  // statements come from a file in the repo, never from user input.
  for (const statement of statements) {
    await sql.unsafe(statement)
  }

  const rows = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `
  console.log('tables:', rows.map((r) => r.table_name).join(', '))
  await sql.end()
})()
