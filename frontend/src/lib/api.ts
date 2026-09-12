// Typed API client for the FastAPI backend
import type {
  QueryResponse,
  MemoryItem,
  Persona,
  GeneratedImage,
  LLMParameters,
  StudioFiles,
  OperationsCatalog,
  ImagePreview,
  TransformResult,
  VideoTransformResult,
  DocumentChunks,
  VideoFrames,
  Transcription,
  CsvRowsResponse,
} from '@/types'

const BASE = '/api'

function unwrapRows<T>(res: { rows: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : res.rows
}

function formatTimestamp(ts: unknown): string {
  if (typeof ts === 'string') return ts
  if (ts && typeof ts === 'object' && ts !== null && 'isoformat' in ts && typeof (ts as { isoformat: () => string }).isoformat === 'function') {
    return (ts as { isoformat: () => string }).isoformat()
  }
  return ts != null ? String(ts) : ''
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── User ────────────────────────────────────────────────────────────────────

export async function getUserInfo(): Promise<{ user_name: string }> {
  return request<{ user_name: string }>('/user_info')
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function sendQuery(
  query: string,
  personaId?: string | null,
  conversationId?: string | null,
): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify({ query, persona_id: personaId, conversation_id: conversationId }),
  })
}

// ── Conversations ────────────────────────────────────────────────────────────

export async function getConversations(): Promise<import('@/types').Conversation[]> {
  return request<import('@/types').Conversation[]>('/conversations')
}

export async function getConversation(conversationId: string): Promise<{ conversation_id: string; messages: import('@/types').ChatMessage[] }> {
  return request('/conversations/' + encodeURIComponent(conversationId))
}

export async function deleteConversation(conversationId: string): Promise<{ message: string; num_deleted: number }> {
  return request('/conversations/' + encodeURIComponent(conversationId), { method: 'DELETE' })
}

// ── Files ────────────────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<{ message: string; filename: string; uuid: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function addUrl(url: string) {
  return request<{ message: string; url: string; filename: string; uuid: string }>('/add_url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function downloadHistory(): Promise<Blob> {
  const res = await fetch(`${BASE}/download_history`)
  if (!res.ok) throw new Error('Failed to download')
  return res.blob()
}

export async function debugExport(): Promise<Blob> {
  const res = await fetch(`${BASE}/debug_export`)
  if (!res.ok) throw new Error('Failed to download debug export')
  return res.blob()
}

// ── Memory ───────────────────────────────────────────────────────────────────

export async function getMemory(search?: string): Promise<MemoryItem[]> {
  const rows = search
    ? unwrapRows(await request<{ rows: MemoryItem[] }>(
        `/memory/search?query_text=${encodeURIComponent(search)}`,
      ))
    : unwrapRows(await request<{ rows: MemoryItem[] }>('/memory'))
  return rows.map((row) => ({
    ...row,
    timestamp: formatTimestamp(row.timestamp),
  }))
}

export async function saveMemory(data: {
  content: string
  type: string
  context_query: string
  language?: string | null
}) {
  return request<{ message: string }>('/memory', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteMemory(timestamp: string) {
  return request<{ message: string }>(`/memory/${timestamp}`, { method: 'DELETE' })
}

export async function downloadMemory(): Promise<Blob> {
  const rows = await getMemory()
  return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
}

// ── Generation Config ────────────────────────────────────────────────────────

export async function getGenerationConfig(): Promise<import('@/types').GenerationConfig> {
  return request<import('@/types').GenerationConfig>('/generation_config')
}

// ── Images ───────────────────────────────────────────────────────────────────

export async function generateImage(prompt: string) {
  return request<{ generated_image_base64: string; timestamp: string; prompt: string; provider: string }>('/generate_image', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

export async function getImageHistory(): Promise<GeneratedImage[]> {
  return request<GeneratedImage[]>('/image_history')
}

export async function deleteImage(timestamp: string) {
  return request<{ message: string }>(`/delete_image/${timestamp}`, { method: 'DELETE' })
}

// ── FLUX Images ─────────────────────────────────────────────────────────────

export async function generateFluxImage(prompt: string, width = 1024, height = 1024) {
  return request<{ generated_image_base64: string; timestamp: string; prompt: string; provider: string }>('/generate_flux_image', {
    method: 'POST',
    body: JSON.stringify({ prompt, width, height }),
  })
}

export async function getFluxImageHistory(): Promise<GeneratedImage[]> {
  return request<GeneratedImage[]>('/flux_image_history')
}

export async function saveFluxImage(timestamp: string) {
  return request<{ message: string; uuid: string }>('/save_flux_image', {
    method: 'POST',
    body: JSON.stringify({ timestamp }),
  })
}

// ── Videos ───────────────────────────────────────────────────────────────────

export async function generateVideo(prompt: string) {
  return request<{ timestamp: string; prompt: string; provider: string; video_path: string }>('/generate_video', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

export async function generateSlideshow(timestamps: string[]) {
  return request<{ video_url: string; video_path: string; uuid: string }>('/generate_slideshow', {
    method: 'POST',
    body: JSON.stringify({ timestamps }),
  })
}

export async function getVideoHistory(): Promise<import('@/types').GeneratedVideo[]> {
  return request<import('@/types').GeneratedVideo[]>('/video_history')
}

export async function deleteVideo(timestamp: string) {
  return request<{ message: string }>(`/delete_video/${timestamp}`, { method: 'DELETE' })
}

export function getVideoUrl(path: string): string {
  return `${BASE}/serve_video?path=${encodeURIComponent(path)}`
}

// ── Text-to-Speech ──────────────────────────────────────────────────────────

export async function generateSpeech(text: string, voice: string = 'alloy') {
  return request<{ audio_url: string; audio_path: string; timestamp: string; voice: string }>('/generate_speech', {
    method: 'POST',
    body: JSON.stringify({ text, voice }),
  })
}

export async function saveGeneratedSpeechToCollection(audioPath: string) {
  return request<{ message: string; uuid: string }>('/save_generated_speech', {
    method: 'POST',
    body: JSON.stringify({ audio_path: audioPath }),
  })
}

// ── Cross-Table Join ────────────────────────────────────────────────────────

export async function joinTables(params: {
  left_table: string
  right_table: string
  left_column: string
  right_column: string
  join_type?: string
  limit?: number
}) {
  return request<import('@/types').JoinResult>('/db/join', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ── Save Generated Media to Collection ──────────────────────────────────────

export async function saveGeneratedImageToCollection(timestamp: string) {
  return request<{ message: string; uuid: string }>('/save_generated_image', {
    method: 'POST',
    body: JSON.stringify({ timestamp }),
  })
}

export async function saveGeneratedVideoToCollection(timestamp: string) {
  return request<{ message: string; uuid: string }>('/save_generated_video', {
    method: 'POST',
    body: JSON.stringify({ timestamp }),
  })
}

// ── Personas ─────────────────────────────────────────────────────────────────

export async function getPersonas(): Promise<Persona[]> {
  return unwrapRows(await request<{ rows: Persona[] }>('/personas'))
}

export async function createPersona(data: {
  persona_name: string
  initial_prompt: string
  final_prompt: string
  llm_params: Record<string, unknown> | LLMParameters
}) {
  return request<{ message: string }>('/personas', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updatePersona(
  name: string,
  data: { initial_prompt: string; final_prompt: string; llm_params: Record<string, unknown> | LLMParameters },
) {
  return request<{ message: string }>(`/personas/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deletePersona(name: string) {
  return request<{ message: string }>(`/personas/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

// ── Studio ──────────────────────────────────────────────────────────────────

export async function getStudioFiles(): Promise<StudioFiles> {
  return request<StudioFiles>('/studio/files')
}

export async function getStudioOperations(): Promise<OperationsCatalog> {
  return request<OperationsCatalog>('/studio/operations')
}

export async function getImagePreview(uuid: string): Promise<ImagePreview> {
  return request<ImagePreview>(`/studio/image_preview/${uuid}`)
}

export async function transformImage(
  uuid: string,
  operation: string,
  params: Record<string, number | string> = {},
): Promise<TransformResult> {
  return request<TransformResult>('/studio/transform/image', {
    method: 'POST',
    body: JSON.stringify({ uuid, operation, params }),
  })
}

export async function saveTransformedImage(
  uuid: string,
  operation: string,
  params: Record<string, number | string> = {},
): Promise<{ message: string; uuid: string; filename: string }> {
  return request<{ message: string; uuid: string; filename: string }>('/studio/save/image', {
    method: 'POST',
    body: JSON.stringify({ uuid, operation, params }),
  })
}

export async function downloadTransformedImage(
  uuid: string,
  operation: string,
  params: Record<string, number | string> = {},
): Promise<Blob> {
  const res = await fetch(`${BASE}/studio/download/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuid, operation, params }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`)
  }
  return res.blob()
}

export async function transformVideo(
  uuid: string,
  operation: string,
  params: Record<string, number | string> = {},
): Promise<VideoTransformResult> {
  return request<VideoTransformResult>('/studio/transform/video', {
    method: 'POST',
    body: JSON.stringify({ uuid, operation, params }),
  })
}

export async function saveVideoResult(
  uuid: string,
  operation: string,
  params: Record<string, number | string> = {},
): Promise<{ message: string; uuid: string }> {
  return request<{ message: string; uuid: string }>('/studio/save/video', {
    method: 'POST',
    body: JSON.stringify({ uuid, operation, params }),
  })
}

export async function saveExtractedFrame(
  uuid: string,
  params: Record<string, number | string> = {},
): Promise<{ message: string; uuid: string }> {
  return request<{ message: string; uuid: string }>('/studio/save/extracted_frame', {
    method: 'POST',
    body: JSON.stringify({ uuid, operation: 'extract_frame', params }),
  })
}

export async function getDocumentSummary(
  uuid: string,
): Promise<{ uuid: string; summary: import('@/types').DocumentSummary | null; text_preview: string }> {
  return request<{ uuid: string; summary: import('@/types').DocumentSummary | null; text_preview: string }>(
    `/studio/summary/${uuid}`,
  )
}

export async function getDocumentChunks(uuid: string): Promise<DocumentChunks> {
  return request<DocumentChunks>(`/studio/chunks/${uuid}`)
}

export async function getVideoFrames(uuid: string, limit = 12): Promise<VideoFrames> {
  return request<VideoFrames>(`/studio/frames/${uuid}?limit=${limit}`)
}

export async function getTranscription(uuid: string, mediaType: string): Promise<Transcription> {
  return request<Transcription>(`/studio/transcription/${uuid}/${mediaType}`)
}

export async function searchStudio(
  query: string,
  types: string[] = ['document', 'image', 'video', 'audio'],
  limit = 20,
  threshold = 0.2,
): Promise<import('@/types').SearchResponse> {
  return request<import('@/types').SearchResponse>('/studio/search', {
    method: 'POST',
    body: JSON.stringify({ query, types, limit, threshold }),
  })
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export async function getCsvRows(
  csvUuid: string,
  offset = 0,
  limit = 50,
): Promise<CsvRowsResponse> {
  return request<CsvRowsResponse>('/studio/csv/rows', {
    method: 'POST',
    body: JSON.stringify({ csv_uuid: csvUuid, offset, limit }),
  })
}

export async function deleteCsvTable(uuid: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/studio/csv/${uuid}`, { method: 'DELETE' })
}

export async function addCsvRows(
  csvUuid: string,
  rows: Record<string, unknown>[],
): Promise<{ message: string; rows_added: number; new_total: number }> {
  return request('/studio/csv/rows/add', {
    method: 'POST',
    body: JSON.stringify({ csv_uuid: csvUuid, rows }),
  })
}

export async function updateCsvRow(
  csvUuid: string,
  originalRow: Record<string, unknown>,
  updatedValues: Record<string, unknown>,
): Promise<{ message: string; rows_updated: number }> {
  return request('/studio/csv/rows/update', {
    method: 'PUT',
    body: JSON.stringify({ csv_uuid: csvUuid, original_row: originalRow, updated_values: updatedValues }),
  })
}

export async function deleteCsvRows(
  csvUuid: string,
  rowValues: Record<string, unknown>,
): Promise<{ message: string; rows_deleted: number; new_total: number }> {
  return request('/studio/csv/rows/delete', {
    method: 'DELETE',
    body: JSON.stringify({ csv_uuid: csvUuid, row_values: rowValues }),
  })
}

export async function revertCsvTable(
  csvUuid: string,
): Promise<{ message: string; new_total: number; current_version: number; can_undo: boolean }> {
  return request('/studio/csv/revert', {
    method: 'POST',
    body: JSON.stringify({ csv_uuid: csvUuid }),
  })
}

export async function getCsvVersions(
  csvUuid: string,
): Promise<import('@/types').CsvVersionsResponse> {
  return request<import('@/types').CsvVersionsResponse>(
    `/studio/csv/versions?csv_uuid=${encodeURIComponent(csvUuid)}`,
  )
}

// ── Object Detection / Classification ───────────────────────────────────────

export async function getDetectionModels(): Promise<import('@/types').DetectionModel[]> {
  return request<import('@/types').DetectionModel[]>('/studio/detect/models')
}

export async function detectObjects(params: {
  uuid: string
  source?: 'image' | 'video_frame'
  frame_idx?: number | null
  model?: string
  threshold?: number
  top_k?: number
}): Promise<import('@/types').DetectionResponse> {
  return request<import('@/types').DetectionResponse>('/studio/detect', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ── Embeddings ──────────────────────────────────────────────────────────────

export async function getEmbeddings(
  space: 'text' | 'visual' = 'text',
  limit = 200,
): Promise<import('@/types').EmbeddingResponse> {
  return request<import('@/types').EmbeddingResponse>(
    `/studio/embeddings?space=${space}&limit=${limit}`,
  )
}

// ── Database Browser ────────────────────────────────────────────────────────

export async function listTables(): Promise<import('@/types').TablesResponse> {
  return request<import('@/types').TablesResponse>('/db/tables')
}

export async function getTableRows(
  path: string,
  limit = 50,
  offset = 0,
): Promise<import('@/types').TableRowsResponse> {
  return request<import('@/types').TableRowsResponse>(
    `/db/table/${path}/rows?limit=${limit}&offset=${offset}`,
  )
}

export async function getTimeline(
  limit = 100,
): Promise<import('@/types').TimelineResponse> {
  return request<import('@/types').TimelineResponse>(`/db/timeline?limit=${limit}`)
}

export async function getPipeline(): Promise<import('@/types').PipelineResponse> {
  return request<import('@/types').PipelineResponse>('/db/pipeline')
}

export async function sampleTable(params: {
  path: string
  n?: number | null
  fraction?: number | null
  stratify_by?: string | null
  seed?: number | null
  limit?: number
}): Promise<import('@/types').SampleResponse> {
  return request<import('@/types').SampleResponse>('/db/sample', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ── Prompt Lab (Experiments) ─────────────────────────────────────────────────

export async function getExperimentModels(): Promise<import('@/types').ExperimentModelInfo[]> {
  return request<import('@/types').ExperimentModelInfo[]>('/experiments/models')
}

export async function runExperiment(params: {
  task: string
  system_prompt: string
  user_prompt: string
  models: import('@/types').ExperimentModelConfig[]
  temperature: number
  max_tokens: number
}): Promise<import('@/types').ExperimentRun> {
  return request<import('@/types').ExperimentRun>('/experiments/run', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getExperimentHistory(): Promise<import('@/types').ExperimentSummary[]> {
  return request<import('@/types').ExperimentSummary[]>('/experiments/history')
}

export async function getExperiment(experimentId: string): Promise<import('@/types').ExperimentRun> {
  return request<import('@/types').ExperimentRun>(`/experiments/${experimentId}`)
}

export async function deleteExperiment(experimentId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/experiments/${experimentId}`, { method: 'DELETE' })
}

// ── Integrations ────────────────────────────────────────────────────────────

export async function getIntegrationsStatus(): Promise<import('@/types').IntegrationsStatusResponse> {
  return request<import('@/types').IntegrationsStatusResponse>('/integrations/status')
}

export async function testNotification(service: string, message: string): Promise<import('@/types').TestNotificationResponse> {
  return request<import('@/types').TestNotificationResponse>('/integrations/test', {
    method: 'POST',
    body: JSON.stringify({ service, message }),
  })
}

export async function getNotificationLog(limit = 50): Promise<import('@/types').NotificationLogResponse> {
  return request<import('@/types').NotificationLogResponse>(`/integrations/log?limit=${limit}`)
}
