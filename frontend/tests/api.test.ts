import { afterEach, expect, test, vi } from 'vitest'
import { generateImage, sendQuery, uploadFile } from '../src/lib/api'

afterEach(() => vi.unstubAllGlobals())

test('renders Pixeltable structured errors as readable messages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { error_code: 'MISSING_CREDENTIALS', message: 'Set GEMINI_API_KEY', retryable: false } }), { status: 403 })))
  await expect(sendQuery('hi')).rejects.toThrow('Set GEMINI_API_KEY')
})

test('shows FastAPI field validation errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ loc: ['body', 'prompt'], msg: 'String should have at least 1 character' }] }), { status: 422 })))
  await expect(generateImage('')).rejects.toThrow('prompt: String should have at least 1 character')
})

test('upload failures use the same readable error contract', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Upload exceeds 100 MB' }), { status: 413 })))
  await expect(uploadFile(new File(['test'], 'test.csv'))).rejects.toThrow('Upload exceeds 100 MB')
})
