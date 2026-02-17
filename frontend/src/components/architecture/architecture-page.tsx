import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// dagre no longer used — layout is manual grid-based
import {
  FileText,
  ImageIcon,
  Film,
  Music,
  Table2,
  Brain,
  MessageSquare,
  Wand2,
  Layers,
  Search,
  Mic,
  Sparkles,
  Bot,
  Cpu,
  ArrowRight,
  GitBranch,
  Globe,
  UserCog,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Schema definition (mirrors setup_pixeltable.py) ──────────────────────────

interface SchemaNode {
  id: string
  label: string
  type: 'table' | 'view' | 'index' | 'model' | 'udf' | 'output' | 'external'
  icon: LucideIcon
  description: string
  color: string
  details?: string[]
  group: string
}

interface SchemaEdge {
  source: string
  target: string
  label?: string
  animated?: boolean
  excludeFromLayout?: boolean
}

const SCHEMA_NODES: SchemaNode[] = [
  // ── Input Tables ─────────────────────────────────
  { id: 'documents', label: 'Documents', type: 'table', icon: FileText, description: 'agents.collection — PDF, HTML, MD, Office, TXT uploads', color: '#7DA8EF', details: ['document (pxt.Document)', 'uuid', 'timestamp', 'user_id'], group: 'input' },
  { id: 'images', label: 'Images', type: 'table', icon: ImageIcon, description: 'agents.images — JPG, PNG, WebP, GIF, HEIC', color: '#F1AE03', details: ['image (pxt.Image)', 'thumbnail (computed)', 'uuid'], group: 'input' },
  { id: 'videos', label: 'Videos', type: 'table', icon: Film, description: 'agents.videos — MP4, MOV, AVI + extracted audio', color: '#DC2404', details: ['video (pxt.Video)', 'audio (computed, extract_audio → MP3)'], group: 'input' },
  { id: 'audios', label: 'Audios', type: 'table', icon: Music, description: 'agents.audios — MP3, WAV, M4A files', color: '#22c55e', details: ['audio (pxt.Audio)', 'uuid', 'timestamp'], group: 'input' },
  { id: 'csv_registry', label: 'CSV Registry', type: 'table', icon: Table2, description: 'agents.csv_registry — metadata for dynamic CSV tables', color: '#34d399', details: ['table_name', 'display_name', 'col_names (Json)', 'row_count'], group: 'input' },

  // ── Document Processing ──────────────────────────
  { id: 'chunks', label: 'chunks', type: 'view', icon: Layers, description: 'agents.chunks — DocumentSplitter(page, sentence) with metadata', color: '#7DA8EF', details: ['text', 'title', 'heading', 'page'], group: 'processing' },
  { id: 'extract_text', label: 'extract_document_text', type: 'udf', icon: Cpu, description: 'UDF: pdfplumber / docx / pptx / openpyxl → full text (max 15k chars)', color: '#7DA8EF', details: ['document → document_text'], group: 'processing' },
  { id: 'gemini_summary', label: 'Gemini Summary', type: 'model', icon: Sparkles, description: 'gemini-2.5-flash → structured JSON {title, summary, key_topics}', color: '#7DA8EF', details: ['response_mime_type: application/json'], group: 'processing' },

  // ── Image Processing ─────────────────────────────
  { id: 'img_thumb', label: 'Thumbnail', type: 'udf', icon: Cpu, description: 'resize(96×96) → b64_encode → thumbnail computed column', color: '#F1AE03', group: 'processing' },

  // ── Video Processing ─────────────────────────────
  { id: 'video_frames', label: 'video_frames', type: 'view', icon: Film, description: 'agents.video_frames — FrameIterator(keyframes_only=True)', color: '#DC2404', details: ['frame', 'frame_idx', 'frame_thumbnail (192×192)'], group: 'processing' },
  { id: 'video_audio_chunks', label: 'video_audio_chunks', type: 'view', icon: Layers, description: 'agents.video_audio_chunks — AudioSplitter(30s chunks)', color: '#DC2404', details: ['audio chunks from video'], group: 'processing' },
  { id: 'whisper_video', label: 'Whisper', type: 'model', icon: Mic, description: 'openai.transcriptions(model=whisper-1) on video audio', color: '#DC2404', details: ['transcription.text'], group: 'processing' },
  { id: 'video_sentences', label: 'video_transcript_sentences', type: 'view', icon: Layers, description: 'StringSplitter(sentence) on Whisper output', color: '#DC2404', group: 'processing' },

  // ── Audio Processing ─────────────────────────────
  { id: 'audio_chunks', label: 'audio_chunks', type: 'view', icon: Layers, description: 'agents.audio_chunks — AudioSplitter(60s chunks)', color: '#22c55e', group: 'processing' },
  { id: 'whisper_audio', label: 'Whisper', type: 'model', icon: Mic, description: 'openai.transcriptions(model=whisper-1) on audio', color: '#22c55e', details: ['transcription.text'], group: 'processing' },
  { id: 'audio_sentences', label: 'audio_transcript_sentences', type: 'view', icon: Layers, description: 'StringSplitter(sentence) on Whisper output', color: '#22c55e', group: 'processing' },

  // ── Embedding Indexes ────────────────────────────
  { id: 'doc_embed', label: 'Text Index', type: 'index', icon: Search, description: 'e5-large-instruct on chunks.text', color: '#7DA8EF', details: ['multilingual-e5-large-instruct'], group: 'index' },
  { id: 'img_embed', label: 'Image Index', type: 'index', icon: Search, description: 'CLIP on images.image', color: '#F1AE03', details: ['clip-vit-base-patch32'], group: 'index' },
  { id: 'vid_frame_embed', label: 'Frame Index', type: 'index', icon: Search, description: 'CLIP on video_frames.frame', color: '#DC2404', details: ['clip-vit-base-patch32'], group: 'index' },
  { id: 'vid_text_embed', label: 'Video Text Index', type: 'index', icon: Search, description: 'e5-large on video_transcript_sentences.text', color: '#DC2404', group: 'index' },
  { id: 'audio_text_embed', label: 'Audio Text Index', type: 'index', icon: Search, description: 'e5-large on audio_transcript_sentences.text', color: '#22c55e', group: 'index' },

  // ── Memory & Chat ────────────────────────────────
  { id: 'memory', label: 'Memory Bank', type: 'table', icon: Brain, description: 'agents.memory_bank — user-saved knowledge snippets', color: '#a78bfa', details: ['content', 'type', 'language', 'context_query'], group: 'memory' },
  { id: 'memory_embed', label: 'Memory Index', type: 'index', icon: Search, description: 'e5-large on memory_bank.content', color: '#a78bfa', group: 'index' },
  { id: 'chat_history', label: 'Chat History', type: 'table', icon: MessageSquare, description: 'agents.chat_history — full Q&A pairs (role + content)', color: '#a78bfa', details: ['role', 'content', 'timestamp', 'user_id'], group: 'memory' },
  { id: 'chat_embed', label: 'Chat Index', type: 'index', icon: Search, description: 'e5-large on chat_history.content', color: '#a78bfa', group: 'index' },

  // ── Personas ─────────────────────────────────────
  { id: 'personas', label: 'User Personas', type: 'table', icon: UserCog, description: 'agents.user_personas — configurable system prompts + LLM params', color: '#94a3b8', details: ['persona_name', 'initial_prompt', 'final_prompt', 'llm_params (Json)'], group: 'config' },

  // ── External APIs (tools) ────────────────────────
  { id: 'ext_apis', label: 'External APIs', type: 'external', icon: Globe, description: 'NewsAPI, DuckDuckGo News, Yahoo Finance (yfinance)', color: '#38bdf8', details: ['get_latest_news', 'search_news (DDG)', 'fetch_financial_data'], group: 'external' },

  // ── Agent Pipeline (agents.tools) ────────────────
  { id: 'agent', label: 'Agent Table', type: 'table', icon: Bot, description: 'agents.tools — 11 computed columns, prompt → answer', color: '#fb923c', details: ['prompt', 'initial_system_prompt', 'final_system_prompt', 'max_tokens', 'temperature'], group: 'agent' },
  { id: 'claude_tools', label: 'Claude → Tools', type: 'model', icon: Bot, description: 'Step 1-2: claude-sonnet-4 selects tools → invoke_tools() executes', color: '#fb923c', details: ['anthropic.messages(tools=...)', 'invoke_tools(tools, response)'], group: 'agent' },
  { id: 'assemble_context', label: 'assemble_context', type: 'udf', icon: GitBranch, description: 'Step 5: Merge tool_output + doc_context + memory + chat_memory into text', color: '#fb923c', details: ['assemble_multimodal_context()'], group: 'agent' },
  { id: 'assemble_messages', label: 'assemble_messages', type: 'udf', icon: GitBranch, description: 'Step 6: Build multimodal messages with history + images + video frames', color: '#fb923c', details: ['assemble_final_messages()', 'base64 images for Claude vision'], group: 'agent' },
  { id: 'claude_answer', label: 'Claude → Answer', type: 'model', icon: Bot, description: 'Step 7-8: claude-sonnet-4 generates final answer from full context', color: '#fb923c', details: ['anthropic.messages()', 'answer = response.content[0].text'], group: 'agent' },
  { id: 'gemini_followup', label: 'Gemini → Follow-ups', type: 'model', icon: Sparkles, description: 'Step 9-11: gemini-2.5-flash generates 3 follow-up questions (JSON)', color: '#fb923c', details: ['assemble_follow_up_prompt()', 'generate_content(JSON)'], group: 'agent' },
  { id: 'answer', label: 'Answer + Follow-ups', type: 'output', icon: ArrowRight, description: 'Final answer text + 3 follow-up suggestions. Q&A pair written back to Chat History.', color: '#fb923c', group: 'agent' },

  // ── Generation ───────────────────────────────────
  { id: 'img_gen', label: 'Image Gen', type: 'table', icon: Wand2, description: 'agents.image_generation_tasks — prompt table (Studio UI)', color: '#f472b6', details: ['prompt', 'timestamp', 'user_id'], group: 'generation' },
  { id: 'imagen', label: 'Imagen / DALL-E', type: 'model', icon: Sparkles, description: 'Gemini Imagen 4.0 or OpenAI DALL-E 3. Can be saved to Images collection for CLIP + RAG.', color: '#f472b6', details: ['generated_image (computed)', 'thumbnail 128×128', 'Save to Collection → agents.images'], group: 'generation' },
  { id: 'vid_gen', label: 'Video Gen', type: 'table', icon: Wand2, description: 'agents.video_generation_tasks — prompt table (Studio UI)', color: '#f472b6', details: ['prompt', 'timestamp', 'user_id'], group: 'generation' },
  { id: 'veo', label: 'Veo 3.0', type: 'model', icon: Sparkles, description: 'Gemini Veo 3.0 video generation. Can be saved to Videos collection for keyframes + transcription + RAG.', color: '#f472b6', details: ['generated_video (computed)', 'Save to Collection → agents.videos'], group: 'generation' },
  { id: 'speech_tasks', label: 'Speech Tasks', type: 'table', icon: Mic, description: 'agents.speech_tasks — TTS input text + voice selection', color: '#f472b6', details: ['input_text', 'voice', 'timestamp', 'user_id'], group: 'generation' },
  { id: 'tts_model', label: 'OpenAI TTS', type: 'model', icon: Mic, description: 'openai.speech(tts-1) — 6 voices: alloy, echo, fable, onyx, nova, shimmer', color: '#f472b6', details: ['audio (computed)', 'model=tts-1'], group: 'generation' },

  // ── Prompt Lab ──────────────────────────────────
  { id: 'prompt_experiments', label: 'Prompt Experiments', type: 'table', icon: FlaskConical, description: 'agents.prompt_experiments — multi-model prompt comparison results', color: '#e879f9', details: ['experiment_id', 'model_id', 'response', 'response_time_ms', 'word_count'], group: 'experiments' },
]

const SCHEMA_EDGES: SchemaEdge[] = [
  // ── Document pipeline ─────────────────────────────
  { source: 'documents', target: 'chunks', label: 'DocumentSplitter' },
  { source: 'documents', target: 'extract_text', label: 'extract' },
  { source: 'extract_text', target: 'gemini_summary', label: 'summarize' },
  { source: 'chunks', target: 'doc_embed', label: 'e5-large' },

  // ── Image pipeline ────────────────────────────────
  { source: 'images', target: 'img_thumb', label: 'resize' },
  { source: 'images', target: 'img_embed', label: 'CLIP' },

  // ── Video pipeline (visual) ───────────────────────
  { source: 'videos', target: 'video_frames', label: 'FrameIterator' },
  { source: 'video_frames', target: 'vid_frame_embed', label: 'CLIP' },

  // ── Video pipeline (audio transcription) ──────────
  { source: 'videos', target: 'video_audio_chunks', label: 'extract_audio → split' },
  { source: 'video_audio_chunks', target: 'whisper_video', label: 'transcribe' },
  { source: 'whisper_video', target: 'video_sentences', label: 'StringSplitter' },
  { source: 'video_sentences', target: 'vid_text_embed', label: 'e5-large' },

  // ── Audio pipeline ────────────────────────────────
  { source: 'audios', target: 'audio_chunks', label: 'AudioSplitter' },
  { source: 'audio_chunks', target: 'whisper_audio', label: 'transcribe' },
  { source: 'whisper_audio', target: 'audio_sentences', label: 'StringSplitter' },
  { source: 'audio_sentences', target: 'audio_text_embed', label: 'e5-large' },

  // ── Memory & Chat → Embedding ─────────────────────
  { source: 'memory', target: 'memory_embed', label: 'e5-large' },
  { source: 'chat_history', target: 'chat_embed', label: 'e5-large' },

  // ── Personas → Agent (system prompts + LLM config) ─
  { source: 'personas', target: 'agent', label: 'system prompts' },

  // ── Agent Step 1-2: Claude tool selection + external API calls ─
  { source: 'agent', target: 'claude_tools', label: 'step 1' },
  { source: 'ext_apis', target: 'claude_tools', label: 'tools' },
  { source: 'csv_registry', target: 'claude_tools', label: 'query_csv_table' },
  { source: 'vid_text_embed', target: 'claude_tools', label: 'search_video_transcripts' },
  { source: 'audio_text_embed', target: 'claude_tools', label: 'search_audio_transcripts' },

  // ── Agent Step 3-4: RAG retrieval (computed columns on agent table) ─
  { source: 'doc_embed', target: 'assemble_context', label: 'search_documents' },
  { source: 'memory_embed', target: 'assemble_context', label: 'search_memory' },
  { source: 'chat_embed', target: 'assemble_context', label: 'search_chat_history' },
  { source: 'claude_tools', target: 'assemble_context', label: 'tool_output' },

  // ── Agent Step 5-6: assemble_context → assemble_messages (multimodal) ─
  { source: 'assemble_context', target: 'assemble_messages', label: 'text context' },
  { source: 'img_embed', target: 'assemble_messages', label: 'search_images' },
  { source: 'vid_frame_embed', target: 'assemble_messages', label: 'search_video_frames' },
  { source: 'chat_history', target: 'assemble_messages', label: 'recent 4 Q&A' },

  // ── Agent Step 7-8: Final LLM answer ──────────────
  { source: 'assemble_messages', target: 'claude_answer', label: 'step 7' },

  // ── Agent Step 9-11: Follow-ups ───────────────────
  { source: 'claude_answer', target: 'gemini_followup', label: 'step 9' },
  { source: 'gemini_followup', target: 'answer', label: 'step 11' },

  // ── Feedback: Q&A pairs written back ──────────────
  { source: 'answer', target: 'chat_history', label: 'write-back Q&A', animated: true, excludeFromLayout: true },

  // ── Generation pipelines ──────────────────────────
  { source: 'img_gen', target: 'imagen', label: 'generate' },
  { source: 'vid_gen', target: 'veo', label: 'generate' },

  // ── Save to Collection (user-triggered) ──────────
  { source: 'imagen', target: 'images', label: 'save to collection', excludeFromLayout: true },
  { source: 'veo', target: 'videos', label: 'save to collection', excludeFromLayout: true },

  // ── TTS pipeline ─────────────────────────────────
  { source: 'speech_tasks', target: 'tts_model', label: 'generate' },
]

// ── Node type styles ─────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { bg: string; border: string; badge: string; badgeText: string }> = {
  table: { bg: 'bg-card', border: 'border-2', badge: 'bg-primary/10 text-primary', badgeText: 'Table' },
  view: { bg: 'bg-card', border: 'border-2 border-dashed', badge: 'bg-blue-500/10 text-blue-500', badgeText: 'View' },
  index: { bg: 'bg-card', border: 'border-2', badge: 'bg-emerald-500/10 text-emerald-500', badgeText: 'Index' },
  model: { bg: 'bg-card', border: 'border-2', badge: 'bg-purple-500/10 text-purple-500', badgeText: 'Model' },
  udf: { bg: 'bg-card', border: 'border-2', badge: 'bg-amber-500/10 text-amber-500', badgeText: 'UDF' },
  output: { bg: 'bg-card', border: 'border-2', badge: 'bg-green-500/10 text-green-500', badgeText: 'Output' },
  external: { bg: 'bg-card', border: 'border-2 border-dashed', badge: 'bg-sky-500/10 text-sky-500', badgeText: 'External' },
}

// ── Custom Node Component ────────────────────────────────────────────────────

type SchemaNodeData = {
  schemaNode: SchemaNode
  isHighlighted: boolean
  isDimmed: boolean
}

function SchemaNodeComponent({ data }: NodeProps<Node<SchemaNodeData>>) {
  const { schemaNode, isHighlighted, isDimmed } = data
  const Icon = schemaNode.icon
  const style = TYPE_STYLES[schemaNode.type]

  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 transition-all duration-200 w-[140px]',
        style.bg,
        style.border,
        isHighlighted && 'ring-1 ring-offset-1 ring-offset-background shadow-md',
        isDimmed && 'opacity-20',
      )}
      style={{ borderColor: isHighlighted ? schemaNode.color : `${schemaNode.color}40` }}
      aria-label={schemaNode.label}
    >
      <Handle type="target" position={Position.Left} className="!w-1 !h-1 !border !bg-background" style={{ borderColor: schemaNode.color }} />
      <Handle type="source" position={Position.Right} className="!w-1 !h-1 !border !bg-background" style={{ borderColor: schemaNode.color }} />

      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color: schemaNode.color }} />
        <span className="text-[9px] font-medium text-foreground truncate leading-none">
          {schemaNode.label}
        </span>
      </div>
      <p className="text-[7px] text-muted-foreground/60 leading-tight line-clamp-1 mt-0.5">
        {schemaNode.description}
      </p>
    </div>
  )
}

const nodeTypes = {
  schemaNode: SchemaNodeComponent,
  laneLabel: LaneLabelComponent,
}

// ── Manual Grid Layout ───────────────────────────────────────────────────────
// Organized as horizontal swim lanes: data pipelines (top) → agent (center) →
// knowledge & config (bottom) → generation (bottom-most).

const GRID: Record<string, [number, number]> = {
  // ── Document Pipeline (y ≈ 50) ──
  documents:           [0,    50],
  chunks:              [185,  50],
  doc_embed:           [370,  50],
  extract_text:        [185,  125],
  gemini_summary:      [370,  125],
  csv_registry:        [555,  50],

  // ── Image Pipeline (y ≈ 195) ──
  images:              [0,    195],
  img_thumb:           [185,  195],
  img_embed:           [370,  195],

  // ── Video Pipeline (y ≈ 295–385) ──
  videos:              [0,    335],
  video_frames:        [185,  295],
  vid_frame_embed:     [370,  295],
  video_audio_chunks:  [185,  385],
  whisper_video:       [370,  385],
  video_sentences:     [555,  385],
  vid_text_embed:      [740,  385],

  // ── Audio Pipeline (y ≈ 480) ──
  audios:              [0,    480],
  audio_chunks:        [185,  480],
  whisper_audio:       [370,  480],
  audio_sentences:     [555,  480],
  audio_text_embed:    [740,  480],

  // ── Agent Pipeline (y ≈ 575, horizontal band) ──
  claude_tools:        [925,  575],
  assemble_context:    [1100, 575],
  assemble_messages:   [1275, 575],
  claude_answer:       [1450, 575],
  gemini_followup:     [1625, 575],
  answer:              [1800, 575],

  // ── Memory & Chat (y ≈ 680–760) ──
  memory:              [370,  680],
  memory_embed:        [555,  680],
  chat_history:        [370,  760],
  chat_embed:          [555,  760],

  // ── Config (y ≈ 850) ──
  personas:            [370,  850],
  ext_apis:            [555,  850],
  agent:               [740,  850],

  // ── Generation (y ≈ 960–1110) ──
  img_gen:             [0,    960],
  imagen:              [185,  960],
  vid_gen:             [0,    1035],
  veo:                 [185,  1035],
  speech_tasks:        [0,    1110],
  tts_model:           [185,  1110],

  // ── Prompt Lab (y ≈ 1185) ──
  prompt_experiments:  [0,    1185],
}

// Swim-lane labels rendered as non-interactive annotation nodes
interface LaneLabel {
  id: string
  label: string
  x: number
  y: number
  color: string
}

const LANE_LABELS: LaneLabel[] = [
  { id: 'lane-docs',   label: 'DOCUMENTS',   x: -100, y: 68,   color: '#7DA8EF' },
  { id: 'lane-imgs',   label: 'IMAGES',      x: -100, y: 207,  color: '#F1AE03' },
  { id: 'lane-video',  label: 'VIDEO',       x: -100, y: 340,  color: '#DC2404' },
  { id: 'lane-audio',  label: 'AUDIO',       x: -100, y: 490,  color: '#22c55e' },
  { id: 'lane-agent',  label: 'AGENT',       x: 840,  y: 548,  color: '#fb923c' },
  { id: 'lane-know',   label: 'KNOWLEDGE',   x: 280,  y: 710,  color: '#a78bfa' },
  { id: 'lane-config', label: 'CONFIG',      x: 280,  y: 862,  color: '#94a3b8' },
  { id: 'lane-gen',    label: 'GENERATION',  x: -100, y: 980,  color: '#f472b6' },
  { id: 'lane-lab',    label: 'PROMPT LAB', x: -100, y: 1197, color: '#e879f9' },
]

function LaneLabelComponent({ data }: NodeProps<Node<{ label: string; color: string }>>) {
  return (
    <div
      className="text-[8px] font-bold tracking-[0.15em] uppercase select-none pointer-events-none"
      style={{ color: `${data.color}50` }}
    >
      {data.label}
    </div>
  )
}

function layoutGraph(schemaNodes: SchemaNode[], schemaEdges: SchemaEdge[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = schemaNodes.map((sn) => {
    const pos = GRID[sn.id] ?? [0, 0]
    return {
      id: sn.id,
      type: 'schemaNode',
      position: { x: pos[0], y: pos[1] },
      data: { schemaNode: sn, isHighlighted: false, isDimmed: false },
    }
  })

  // Add lane label annotation nodes
  for (const lane of LANE_LABELS) {
    nodes.push({
      id: lane.id,
      type: 'laneLabel',
      position: { x: lane.x, y: lane.y },
      data: { label: lane.label, color: lane.color },
      selectable: false,
      draggable: false,
    })
  }

  const edges: Edge[] = schemaEdges.map((se, i) => {
    const sourceNode = schemaNodes.find((n) => n.id === se.source)
    return {
      id: `e-${i}`,
      source: se.source,
      target: se.target,
      label: se.label,
      animated: se.animated,
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      style: {
        stroke: sourceNode?.color ?? '#888',
        strokeWidth: se.excludeFromLayout ? 1 : 1.5,
        opacity: se.excludeFromLayout ? 0.3 : 0.5,
        strokeDasharray: se.excludeFromLayout ? '6 3' : undefined,
      },
      labelStyle: { fontSize: 8, fill: '#666' },
      labelBgStyle: { fill: 'transparent' },
    }
  })

  return { nodes, edges }
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { label: 'Table', cls: 'bg-primary' },
  { label: 'View', cls: 'bg-blue-500' },
  { label: 'Index', cls: 'bg-emerald-500' },
  { label: 'LLM', cls: 'bg-purple-500' },
  { label: 'UDF', cls: 'bg-amber-500' },
  { label: 'API', cls: 'bg-sky-500' },
]

// ── Main Component ───────────────────────────────────────────────────────────

export function ArchitecturePage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(SCHEMA_NODES, SCHEMA_EDGES),
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const clickedId = node.id
      const isDeselect = selectedNodeId === clickedId

      if (isDeselect) {
        setSelectedNodeId(null)
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, isHighlighted: false, isDimmed: false },
          })),
        )
        setEdges((eds) =>
          eds.map((e) => {
            const sourceNode = SCHEMA_NODES.find((sn) => sn.id === e.source)
            return {
              ...e,
              animated: false,
              style: { ...e.style, strokeWidth: 1.5, opacity: 0.5, stroke: sourceNode?.color ?? '#888' },
            }
          }),
        )
        return
      }

      setSelectedNodeId(clickedId)

      // Find connected node IDs
      const connectedEdges = SCHEMA_EDGES.filter(
        (se) => se.source === clickedId || se.target === clickedId,
      )
      const connectedIds = new Set<string>([clickedId])
      for (const ce of connectedEdges) {
        connectedIds.add(ce.source)
        connectedIds.add(ce.target)
      }

      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            isHighlighted: connectedIds.has(n.id),
            isDimmed: !connectedIds.has(n.id),
          },
        })),
      )

      const schemaNode = SCHEMA_NODES.find((sn) => sn.id === clickedId)
      setEdges((eds) =>
        eds.map((e) => {
          const isConnected =
            e.source === clickedId || e.target === clickedId
          return {
            ...e,
            animated: isConnected,
            style: {
              ...e.style,
              strokeWidth: isConnected ? 2.5 : 1,
              opacity: isConnected ? 1 : 0.15,
              stroke: isConnected ? (schemaNode?.color ?? '#F1AE03') : '#888',
            },
          }
        }),
      )
    },
    [selectedNodeId, setNodes, setEdges],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isHighlighted: false, isDimmed: false },
      })),
    )
    setEdges((eds) =>
      eds.map((e) => {
        const sourceNode = SCHEMA_NODES.find((sn) => sn.id === e.source)
        return {
          ...e,
          animated: false,
          style: { ...e.style, strokeWidth: 1.5, opacity: 0.5, stroke: sourceNode?.color ?? '#888' },
        }
      }),
    )
  }, [setNodes, setEdges])

  const selectedSchemaNode = selectedNodeId
    ? SCHEMA_NODES.find((sn) => sn.id === selectedNodeId)
    : null

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08, maxZoom: 0.7 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
        <Controls showInteractive={false} className="!border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground" />

        {/* Title */}
        <Panel position="top-left">
          <div className="rounded-md border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-2.5">
            <h2 className="text-[11px] font-semibold tracking-tight text-foreground">
              Pixeltable Architecture
            </h2>
            <div className="flex items-center gap-2.5 mt-1.5">
              {LEGEND_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className={cn('h-1.5 w-1.5 rounded-full', item.cls)} />
                  <span className="text-[8px] text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Detail Panel */}
        {selectedSchemaNode && (
          <Panel position="bottom-left">
            <div className="rounded-md border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-2.5 max-w-[260px]">
              <div className="flex items-center gap-1.5 mb-1">
                <selectedSchemaNode.icon className="h-3 w-3 shrink-0" style={{ color: selectedSchemaNode.color }} />
                <span className="text-[10px] font-medium text-foreground">{selectedSchemaNode.label}</span>
                <span className={cn('text-[7px] px-1 rounded', TYPE_STYLES[selectedSchemaNode.type].badge)}>
                  {TYPE_STYLES[selectedSchemaNode.type].badgeText}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-snug">{selectedSchemaNode.description}</p>
              {selectedSchemaNode.details && (
                <div className="flex flex-wrap gap-0.5 mt-1.5">
                  {selectedSchemaNode.details.map((d) => (
                    <span key={d} className="text-[8px] bg-muted/50 px-1 py-px rounded font-mono text-muted-foreground">
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Stats */}
        <Panel position="top-right">
          <div className="rounded-md border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-2">
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
              <span><span className="font-semibold text-foreground">{SCHEMA_NODES.length}</span> nodes</span>
              <span><span className="font-semibold text-foreground">{SCHEMA_EDGES.length}</span> edges</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}
