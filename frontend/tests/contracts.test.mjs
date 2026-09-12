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
