import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('database page is read-only', async () => {
  const [page, api] = await Promise.all([
    read('../src/components/database/database-page.tsx'),
    read('../src/lib/api.ts'),
  ])
  assert.doesNotMatch(page, /TableActionsToolbar|CreateTableDialog|Manage/)
  assert.match(page, /pxt schema diff pixelbot\/app\.py pixelbot_v3/)
  assert.doesNotMatch(api, /\/db\/(create|drop|rename|insert|delete|add_|recompute)/)
})

test('removed Reve controls and API calls stay absent', async () => {
  const [images, api] = await Promise.all([
    read('../src/components/images/images-page.tsx'),
    read('../src/lib/api.ts'),
  ])
  assert.doesNotMatch(images, /Reve/)
  assert.doesNotMatch(api, /\/studio\/reve/)
})

test('CSV mutations use registry UUIDs', async () => {
  const api = await read('../src/lib/api.ts')
  assert.match(api, /csv_uuid: csvUuid/)
  assert.doesNotMatch(api, /table_name: tableName/)
})

test('pipeline UI matches the deployed Gemini schema', async () => {
  const [architecture, database, developerPage] = await Promise.all([
    read('../src/components/architecture/architecture-page.tsx'),
    read('../src/components/database/database-page.tsx'),
    read('../src/components/developer/developer-page.tsx'),
  ])
  assert.doesNotMatch(architecture, /transcript_sentences|Claude →|e5-large/)
  assert.match(architecture, /gemini\.generate_content/)
  assert.doesNotMatch(database, /transcript_sentences/)
  assert.match(database, /path\.split\('\/'\)\.at\(-1\)/)
  assert.doesNotMatch(database, /agents\//)
  assert.match(developerPage, /pxt\.list_tables\("pixelbot_v3"/)
})

test('memory and persona reads use canonical Pixeltable query routes', async () => {
  const [api, developerPage] = await Promise.all([
    read('../src/lib/api.ts'),
    read('../src/components/developer/developer-page.tsx'),
  ])
  assert.match(api, /request<\{ rows: MemoryItem\[\] \}>\('\/memory'\)/)
  assert.match(api, /\/memory\/search\?query_text=/)
  assert.match(api, /request<\{ rows: Persona\[\] \}>\('\/personas'\)/)
  assert.doesNotMatch(`${api}\n${developerPage}`, /memory\/v2|personas\/v2|memory\/manual|download_memory/)
})
