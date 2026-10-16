import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { ChatPage } from '../src/components/chat/chat-page'
import { ToastProvider } from '../src/components/ui/toast'
import * as api from '../src/lib/api'

vi.mock('../src/lib/api', () => ({
  getPersonas: vi.fn(), getUserInfo: vi.fn(), getConversation: vi.fn(),
  sendQuery: vi.fn(), generateSpeech: vi.fn(), saveGeneratedSpeechToCollection: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getPersonas).mockResolvedValue([])
  vi.mocked(api.getUserInfo).mockResolvedValue({ user_name: '' })
  vi.mocked(api.getConversation).mockImplementation(async (conversation_id) => ({ conversation_id, messages: [] }))
})

function renderChat() {
  return render(<StrictMode><MemoryRouter><ToastProvider><ChatPage /></ToastProvider></MemoryRouter></StrictMode>)
}

test('keeps the first turn mounted while pinning the conversation URL', async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.sendQuery>>) => void
  vi.mocked(api.sendQuery).mockReturnValue(new Promise((resolve) => { finish = resolve }))
  const user = userEvent.setup()
  renderChat()
  await user.type(screen.getByRole('textbox'), 'What can Pixeltable do?{Enter}')
  expect(screen.getByText('What can Pixeltable do?')).toBeTruthy()
  expect(api.sendQuery).toHaveBeenCalledTimes(1)
  await act(async () => finish({ answer: 'Store media and compute on insert.', metadata: { timestamp: '', has_doc_context: false, has_image_context: false, has_tool_output: false, has_history_context: false, has_memory_context: false, has_chat_memory_context: false }, image_context: [], video_frame_context: [], follow_up_text: null }))
  expect(await screen.findByText('Store media and compute on insert.')).toBeTruthy()
})

test('keeps a failed prompt available to correct and retry', async () => {
  vi.mocked(api.sendQuery).mockRejectedValue(new Error('Set GEMINI_API_KEY and restart the service.'))
  const user = userEvent.setup()
  renderChat()
  await user.type(screen.getByRole('textbox'), 'Summarize my files{Enter}')
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveProperty('value', 'Summarize my files'))
  expect(screen.getByRole('alert').textContent).toContain('GEMINI_API_KEY')
})

test('does not mark failed speech saves as saved', async () => {
  vi.mocked(api.generateSpeech).mockResolvedValue({ audio_url: '/audio.mp3', audio_path: '/audio.mp3', timestamp: '', voice: 'alloy' })
  vi.mocked(api.saveGeneratedSpeechToCollection).mockRejectedValue(new Error('Save failed'))
  const user = userEvent.setup()
  renderChat()
  await user.click(screen.getByRole('button', { name: 'Generate speech' }))
  await user.type(screen.getByRole('textbox'), 'Hello{Enter}')
  await user.click(await screen.findByRole('button', { name: 'Save to Library' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save to Library' }).disabled).toBe(false))
  expect(screen.queryByRole('button', { name: 'Saved to Library' })).toBeNull()
})

test('runs queued requests once and preserves the selected generation mode', async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.sendQuery>>) => void
  vi.mocked(api.sendQuery).mockReturnValue(new Promise((resolve) => { finish = resolve }))
  vi.mocked(api.generateSpeech).mockResolvedValue({ audio_url: '/audio.mp3', audio_path: '/audio.mp3', timestamp: '', voice: 'alloy' })
  const user = userEvent.setup()
  renderChat()
  await user.type(screen.getByRole('textbox'), 'First{Enter}')
  await user.click(screen.getByRole('button', { name: 'Voice', exact: true }))
  await user.type(screen.getByRole('textbox'), 'Read this{Enter}')
  expect(api.generateSpeech).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Voice mode', exact: true }))
  await act(async () => finish({ answer: 'First answer', metadata: { timestamp: '', has_doc_context: false, has_image_context: false, has_tool_output: false, has_history_context: false, has_memory_context: false, has_chat_memory_context: false }, image_context: [], video_frame_context: [], follow_up_text: null }))
  await screen.findByText('Generated speech (alloy)')
  expect(api.sendQuery).toHaveBeenCalledTimes(1)
  expect(api.generateSpeech).toHaveBeenCalledExactlyOnceWith('Read this')
})
