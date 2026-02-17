// Typed API client for the FastAPI backend
import type {
  QueryResponse,
  ContextInfo,
  WorkflowDetail,
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

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function sendQuery(
  query: string,
  personaId?: string | null,
): Promise<QueryResponse> {
  return request<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify({ query, persona_id: personaId }),
  })
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

export async function deleteFile(uuid: string, fileType: string) {
  return request<{ message: string }>(`/delete_file/${uuid}/${fileType}`, { method: 'DELETE' })
}

export async function deleteAll(type: string) {
  return request<{ message: string }>('/delete_all', {
    method: 'POST',
    body: JSON.stringify({ type }),
  })
}

// ── Context ──────────────────────────────────────────────────────────────────

export async function getContextInfo(): Promise<ContextInfo> {
  return request<ContextInfo>('/context_info')
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getWorkflowDetail(timestamp: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/workflow_detail/${timestamp}`)
}

export async function deleteHistory(timestamp: string) {
  return request<{ message: string }>(`/delete_history/${timestamp}`, { method: 'DELETE' })
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
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  return request<MemoryItem[]>(`/memory${params}`)
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

export async function addMemoryManual(data: {
  content: string
  type: string
  language?: string | null
  context_query?: string
}) {
  return request<{ message: string }>('/memory/manual', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteMemory(timestamp: string) {
  return request<{ message: string }>(`/memory/${timestamp}`, { method: 'DELETE' })
}

export async function downloadMemory(): Promise<Blob> {
  const res = await fetch(`${BASE}/download_memory`)
  if (!res.ok) throw new Error('Failed to download')
  return res.blob()
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

// ── Videos ───────────────────────────────────────────────────────────────────

export async function generateVideo(prompt: string) {
  return request<{ timestamp: string; prompt: string; provider: string; video_path: string }>('/generate_video', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
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

export async function getTtsVoices() {
  return request<import('@/types').TtsVoice[]>('/tts_voices')
}

export function getAudioUrl(path: string): string {
  return `${BASE}/serve_audio?path=${encodeURIComponent(path)}`
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
  return request<Persona[]>('/personas')
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
  tableName: string,
  offset = 0,
  limit = 50,
): Promise<CsvRowsResponse> {
  return request<CsvRowsResponse>('/studio/csv/rows', {
    method: 'POST',
    body: JSON.stringify({ table_name: tableName, offset, limit }),
  })
}

export async function deleteCsvTable(uuid: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/studio/csv/${uuid}`, { method: 'DELETE' })
}

export async function addCsvRows(
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<{ message: string; rows_added: number; new_total: number }> {
  return request('/studio/csv/rows/add', {
    method: 'POST',
    body: JSON.stringify({ table_name: tableName, rows }),
  })
}

export async function updateCsvRow(
  tableName: string,
  originalRow: Record<string, unknown>,
  updatedValues: Record<string, unknown>,
): Promise<{ message: string; rows_updated: number }> {
  return request('/studio/csv/rows/update', {
    method: 'PUT',
    body: JSON.stringify({ table_name: tableName, original_row: originalRow, updated_values: updatedValues }),
  })
}

export async function deleteCsvRows(
  tableName: string,
  rowValues: Record<string, unknown>,
): Promise<{ message: string; rows_deleted: number; new_total: number }> {
  return request('/studio/csv/rows/delete', {
    method: 'DELETE',
    body: JSON.stringify({ table_name: tableName, row_values: rowValues }),
  })
}

export async function revertCsvTable(
  tableName: string,
): Promise<{ message: string; new_total: number; current_version: number; can_undo: boolean }> {
  return request('/studio/csv/revert', {
    method: 'POST',
    body: JSON.stringify({ table_name: tableName }),
  })
}

export async function getCsvVersions(
  tableName: string,
): Promise<import('@/types').CsvVersionsResponse> {
  return request<import('@/types').CsvVersionsResponse>(
    `/studio/csv/versions?table_name=${encodeURIComponent(tableName)}`,
  )
}

// ── Reve AI Edit / Remix ────────────────────────────────────────────────

export async function reveEdit(params: {
  timestamp?: string | null
  uuid?: string | null
  instruction: string
}): Promise<import('@/types').ReveEditResponse> {
  return request<import('@/types').ReveEditResponse>('/studio/reve/edit', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function reveRemix(params: {
  prompt: string
  timestamps?: string[]
  uuids?: string[]
  aspect_ratio?: string | null
}): Promise<import('@/types').ReveRemixResponse> {
  return request<import('@/types').ReveRemixResponse>('/studio/reve/remix', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function reveSave(
  tempPath: string,
): Promise<import('@/types').ReveSaveResponse> {
  return request<import('@/types').ReveSaveResponse>('/studio/reve/save', {
    method: 'POST',
    body: JSON.stringify({ temp_path: tempPath }),
  })
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

export async function getTableSchema(
  path: string,
): Promise<import('@/types').TableInfo> {
  return request<import('@/types').TableInfo>(`/db/table/${path}/schema`)
}

export async function getTimeline(
  limit = 100,
): Promise<import('@/types').TimelineResponse> {
  return request<import('@/types').TimelineResponse>(`/db/timeline?limit=${limit}`)
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

// ── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health')
}
