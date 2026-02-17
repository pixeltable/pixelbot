// Shared TypeScript types for the Pixelbot frontend

export interface QueryMetadata {
  timestamp: string
  has_doc_context: boolean
  has_image_context: boolean
  has_tool_output: boolean
  has_history_context: boolean
  has_memory_context: boolean
  has_chat_memory_context: boolean
}

export interface ImageContext {
  encoded_image: string
}

export interface VideoFrameContext {
  encoded_frame: string
  sim?: number
  timestamp?: string
}

export interface QueryResponse {
  answer: string
  metadata: QueryMetadata
  image_context: ImageContext[]
  video_frame_context: VideoFrameContext[]
  follow_up_text: string | null
}

export interface ToolInfo {
  name: string
  description: string
}

export interface FileItem {
  name: string
  uuid: string
  thumbnail?: string | null
}

export interface ContextInfo {
  tools: ToolInfo[]
  documents: FileItem[]
  images: FileItem[]
  videos: FileItem[]
  audios: FileItem[]
  initial_prompt: string
  final_prompt: string
  workflow_data: WorkflowEntry[]
  parameters: LLMParameters
}

export interface WorkflowEntry {
  timestamp: string
  prompt: string
  answer: string
}

export interface WorkflowDetail {
  prompt: string
  timestamp: string
  initial_system_prompt: string
  final_system_prompt: string
  initial_response: unknown
  tool_output: unknown
  final_response: unknown
  answer: string
  max_tokens: number
  temperature: number
}

export interface LLMParameters {
  max_tokens: number | null
  temperature: number | null
}

export interface MemoryItem {
  content: string
  type: 'code' | 'text'
  language: string | null
  context_query: string
  timestamp: string
  sim?: number
}

export interface Persona {
  persona_name: string
  initial_prompt: string
  final_prompt: string
  llm_params: LLMParameters
  timestamp: string
}

export interface GeneratedImage {
  prompt: string
  timestamp: string
  thumbnail_image: string
  full_image: string
  provider?: string
}

export interface GeneratedVideo {
  prompt: string
  timestamp: string
  video_path: string
  provider?: string
}

export interface GenerationConfig {
  image_provider: string
  image_model: string
  video_provider: string
  video_model: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  image_context?: ImageContext[]
  video_frame_context?: VideoFrameContext[]
  follow_up_text?: string | null
  metadata?: QueryMetadata
  video_url?: string
}

// ── CSV Version History ─────────────────────────────────────────────────────

export interface CsvVersion {
  version: number
  created_at: string | null
  change_type: 'data' | 'schema'
  inserts: number
  updates: number
  deletes: number
  errors: number
  schema_change: string | null
}

export interface CsvVersionsResponse {
  table_name: string
  current_version: number
  can_undo: boolean
  versions: CsvVersion[]
}

// ── Studio ──────────────────────────────────────────────────────────────────

export interface DocumentSummary {
  title: string
  summary: string
  key_topics: string[]
}

export interface StudioFile {
  uuid: string
  name: string
  type: 'document' | 'image' | 'video' | 'audio' | 'csv'
  thumbnail?: string | null
  timestamp?: string | null
  summary?: DocumentSummary | null
  // CSV-specific fields
  table_name?: string
  row_count?: number
  columns?: string[]
}

export interface StudioFiles {
  documents: StudioFile[]
  images: StudioFile[]
  videos: StudioFile[]
  audios: StudioFile[]
  csv_tables: StudioFile[]
}

export interface CsvRowsResponse {
  table_name: string
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
  offset: number
  limit: number
}

export interface OperationParam {
  name: string
  type: 'number' | 'string'
  default: number | string
  min?: number
  max?: number
  step?: number
}

export interface Operation {
  id: string
  label: string
  description: string
  category: string
  params: OperationParam[]
}

export type OperationsCatalog = Record<string, Operation[]>

export interface ImagePreview {
  preview: string
  width: number
  height: number
  mode: string
}

export interface TransformResult {
  preview: string
  width: number
  height: number
  mode: string
  operation: string
}

export interface DocumentChunks {
  uuid: string
  chunks: { text: string; title?: string; heading?: string; page?: number }[]
  total: number
}

export interface VideoFrames {
  uuid: string
  frames: { frame: string; position: number }[]
  total: number
}

export interface Transcription {
  uuid: string
  media_type: string
  sentences: string[]
  full_text: string
}

// ── Video Transform Results ─────────────────────────────────────────────────

export interface VideoMetadataResult {
  operation: 'view_metadata'
  duration: number | null
  metadata: {
    format_size?: number | null
    bit_rate?: number | null
    width?: number | null
    height?: number | null
    fps?: number | null
    total_frames?: number | null
    codec?: string | null
    profile?: string | null
    pix_fmt?: string | null
  }
}

export interface ExtractFrameResult {
  operation: 'extract_frame'
  frame: string
  width: number
  height: number
  timestamp: number
}

export interface ClipVideoResult {
  operation: 'clip_video'
  video_url: string
  video_path: string
  duration: number | null
}

export interface OverlayTextResult {
  operation: 'overlay_text'
  video_url: string
  video_path: string
}

export interface DetectScenesResult {
  operation: 'detect_scenes'
  scenes: { start_time: number; duration: number; start_pts?: number }[]
  total_duration: number | null
  scene_count: number
}

export type VideoTransformResult =
  | VideoMetadataResult
  | ExtractFrameResult
  | ClipVideoResult
  | OverlayTextResult
  | DetectScenesResult

// ── Studio Search ───────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'document' | 'image' | 'video' | 'video_transcript' | 'audio_transcript'
  uuid: string
  similarity: number
  text?: string
  thumbnail?: string | null
  metadata?: Record<string, unknown>
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}

// ── Embedding Visualization ─────────────────────────────────────────────────

export interface EmbeddingPoint {
  type: string
  uuid: string
  label: string
  thumbnail?: string | null
  x: number
  y: number
}

export interface EmbeddingResponse {
  space: 'text' | 'visual'
  points: EmbeddingPoint[]
  count: number
}

// ── Object Detection / Classification ───────────────────────────────────────

export interface DetectionModel {
  key: string
  type: 'detection' | 'classification'
  label: string
}

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DetectionItem {
  label: string
  score: number
  box: BoundingBox
}

export interface ClassificationItem {
  label: string
  score: number
}

export interface DetectionResponse {
  type: 'detection' | 'classification'
  model: string
  image_width: number
  image_height: number
  count: number
  detections?: DetectionItem[]
  classifications?: ClassificationItem[]
}

// ── Reve AI Edit / Remix ────────────────────────────────────────────────

export interface ReveEditResponse {
  preview: string
  width: number
  height: number
  instruction: string
  temp_path: string
}

export interface ReveRemixResponse {
  preview: string
  width: number
  height: number
  prompt: string
  temp_path: string
}

export interface ReveSaveResponse {
  message: string
  uuid: string
}

// ── Prompt Lab (Experiments) ─────────────────────────────────────────────────

export interface ExperimentModelInfo {
  id: string
  name: string
  provider: string
  available: boolean
}

export interface ExperimentResult {
  model_id: string
  model_name: string
  provider: string
  response: string | null
  response_time_ms: number
  word_count: number
  char_count: number
  error: string | null
}

export interface ExperimentModelConfig {
  model_id: string
  provider?: string | null
  display_name?: string | null
}

export interface ExperimentRun {
  experiment_id: string
  task: string
  system_prompt: string
  user_prompt: string
  temperature: number
  max_tokens: number
  timestamp: string
  results: ExperimentResult[]
}

export interface ExperimentSummary {
  experiment_id: string
  task: string
  user_prompt: string
  model_ids: string[]
  results_count: number
  timestamp: string
}

// ── Database Browser ────────────────────────────────────────────────────────

export interface TableColumn {
  name: string
  type: string
  is_computed: boolean
}

export interface TableInfo {
  path: string
  type: 'table' | 'view' | 'unknown'
  base_table: string | null
  columns: TableColumn[]
  row_count: number
  error?: string
}

export interface TablesResponse {
  namespace: string
  tables: TableInfo[]
  count: number
}

export interface TableRowsResponse {
  path: string
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
  offset: number
  limit: number
}

export interface TimelineEvent {
  table: string
  type: string
  role: string | null
  label: string
  timestamp: string | null
  user_id: string | null
}

export interface TimelineResponse {
  events: TimelineEvent[]
  total: number
}
