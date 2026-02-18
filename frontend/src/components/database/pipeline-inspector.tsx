import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type EdgeProps,
  Position,
  Handle,
  useNodesState,
  useEdgesState,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Loader2,
  Table2,
  Eye,
  AlertTriangle,
  Rows3,
  Database,
  GitBranch,
  ChevronDown,
  X,
  Zap,
  Search as SearchIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/lib/api'
import type { PipelineNode, PipelineColumn, PipelineResponse } from '@/types'

// ── Domain grouping ──────────────────────────────────────────────────────────

interface DomainGroup {
  id: string
  label: string
  color: string
  borderColor: string
  match: (name: string) => boolean
}

const DOMAINS: DomainGroup[] = [
  {
    id: 'agent',
    label: 'Agent Pipeline',
    color: 'from-blue-500/8 to-blue-600/3',
    borderColor: 'border-blue-500/20',
    match: (n) => ['tools', 'chat_history'].includes(n),
  },
  {
    id: 'documents',
    label: 'Document Pipeline',
    color: 'from-amber-500/8 to-amber-600/3',
    borderColor: 'border-amber-500/20',
    match: (n) => ['collection', 'chunks'].includes(n),
  },
  {
    id: 'video',
    label: 'Video Pipeline',
    color: 'from-rose-500/8 to-rose-600/3',
    borderColor: 'border-rose-500/20',
    match: (n) => n.startsWith('video'),
  },
  {
    id: 'audio',
    label: 'Audio Pipeline',
    color: 'from-orange-500/8 to-orange-600/3',
    borderColor: 'border-orange-500/20',
    match: (n) => n.startsWith('audio'),
  },
  {
    id: 'images',
    label: 'Image Pipeline',
    color: 'from-emerald-500/8 to-emerald-600/3',
    borderColor: 'border-emerald-500/20',
    match: (n) => ['images', 'image_generation_tasks'].includes(n),
  },
  {
    id: 'generation',
    label: 'Generation',
    color: 'from-pink-500/8 to-pink-600/3',
    borderColor: 'border-pink-500/20',
    match: (n) => n.includes('generation') || n === 'speech_tasks',
  },
  {
    id: 'memory',
    label: 'Memory & Config',
    color: 'from-purple-500/8 to-purple-600/3',
    borderColor: 'border-purple-500/20',
    match: (n) => ['memory_bank', 'user_personas'].includes(n),
  },
]

function getDomain(name: string): DomainGroup | null {
  return DOMAINS.find((d) => d.match(name)) ?? null
}

// ── Colors ───────────────────────────────────────────────────────────────────

const ITERATOR_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  FrameIterator: { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
  AudioSplitter: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
  DocumentSplitter: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  StringSplitter: { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' },
  view: { bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
}

const FUNC_TYPE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  builtin: { bg: 'bg-sky-500/10', text: 'text-sky-300', border: 'border-sky-500/20', label: 'built-in' },
  custom_udf: { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/20', label: 'UDF' },
  query: { bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/20', label: 'query' },
  unknown: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', label: 'fn' },
}

const QUERY_EDGE_COLORS: Record<string, string> = {
  search_documents: '#f59e0b',
  search_images: '#10b981',
  search_video_frames: '#f43f5e',
  search_memory: '#a855f7',
  search_chat_history: '#3b82f6',
  get_recent_chat_history: '#3b82f6',
}

// ── Custom Edge ──────────────────────────────────────────────────────────────

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  })

  const edgeData = data as { label?: string; edgeType?: string } | undefined
  const label = edgeData?.label
  const isQuery = edgeData?.edgeType === 'query'
  const colors = isQuery
    ? { bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/30' }
    : (ITERATOR_COLORS[label ?? ''] ?? ITERATOR_COLORS.view)

  const strokeColor = isQuery
    ? (QUERY_EDGE_COLORS[label ?? ''] ?? '#14b8a6')
    : '#555'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: isQuery ? 1 : 1.5,
          strokeDasharray: isQuery ? '6 3' : undefined,
          opacity: isQuery ? 0.6 : 1,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={cn(
              'absolute pointer-events-all px-1.5 py-0.5 rounded-md border text-[8px] font-mono font-medium',
              colors.bg,
              colors.text,
              colors.border,
            )}
          >
            {isQuery ? `@query ${label}` : label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { labeled: LabeledEdge }

// ── Custom Node ──────────────────────────────────────────────────────────────

function TableNode({ data }: { data: PipelineNode & { isSelected: boolean; onSelect: (path: string) => void } }) {
  const hasErrors = data.total_errors > 0
  const domain = getDomain(data.name)

  const borderColor = hasErrors
    ? 'border-red-500/50'
    : data.is_view
      ? 'border-blue-400/30'
      : 'border-emerald-400/30'

  const computedCols = data.columns.filter((c) => c.is_computed)
  const insertableCols = data.columns.filter((c) => !c.is_computed)

  return (
    <div
      className={cn(
        'rounded-xl border bg-card/95 backdrop-blur-sm shadow-lg min-w-[200px] max-w-[240px] cursor-pointer transition-all hover:shadow-xl',
        borderColor,
        data.isSelected && 'ring-2 ring-k-yellow/50 shadow-k-yellow/10 scale-[1.02]',
      )}
      onClick={() => data.onSelect(data.path)}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/40 !w-2 !h-2 !-top-1" />

      {/* Header */}
      <div className={cn(
        'px-3 py-2.5 rounded-t-xl border-b border-border/30',
        domain ? `bg-gradient-to-r ${domain.color}` : '',
      )}>
        <div className="flex items-center gap-1.5">
          {data.is_view ? (
            <Eye className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          ) : (
            <Table2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="text-[11px] font-bold text-foreground truncate">{data.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[9px] text-muted-foreground/70 tabular-nums">{data.row_count.toLocaleString()} rows</span>
          <span className="text-[9px] text-muted-foreground/50">v{data.version}</span>
          {data.indices.length > 0 && (
            <span className="text-[9px] text-blue-400/80 flex items-center gap-0.5">
              <SearchIcon className="h-2 w-2" />{data.indices.length}
            </span>
          )}
          {hasErrors && (
            <span className="text-[9px] text-red-400 flex items-center gap-0.5">
              <AlertTriangle className="h-2 w-2" />{data.total_errors}
            </span>
          )}
          {data.iterator_type && (
            <span className={cn(
              'text-[8px] px-1 rounded border font-mono',
              ITERATOR_COLORS[data.iterator_type]?.bg ?? 'bg-muted',
              ITERATOR_COLORS[data.iterator_type]?.text ?? 'text-muted-foreground',
              ITERATOR_COLORS[data.iterator_type]?.border ?? 'border-border',
            )}>
              {data.iterator_type}
            </span>
          )}
        </div>
      </div>

      {/* Columns - compact pipeline view */}
      <div className="px-2.5 py-2 space-y-0.5">
        {/* Insertable cols (dimmed) */}
        {insertableCols.slice(0, 4).map((col) => (
          <div key={col.name} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 shrink-0" />
            <span className="text-[9px] text-muted-foreground/50 truncate">{col.name}</span>
            <span className="text-[7px] text-muted-foreground/25 ml-auto shrink-0">
              {col.type.replace('Required[', '').replace(']', '').slice(0, 8)}
            </span>
          </div>
        ))}
        {insertableCols.length > 4 && (
          <div className="text-[8px] text-muted-foreground/30 pl-3">+{insertableCols.length - 4} more</div>
        )}

        {/* Computed cols (highlighted) */}
        {computedCols.length > 0 && (
          <>
            {insertableCols.length > 0 && (
              <div className="border-t border-amber-500/10 my-1" />
            )}
            {computedCols.slice(0, 5).map((col) => {
              const funcStyle = col.func_type ? FUNC_TYPE_STYLES[col.func_type] : null
              return (
                <div key={col.name} className="flex items-center gap-1">
                  <Zap className={cn('h-2 w-2 shrink-0', col.error_count > 0 ? 'text-red-400' : 'text-amber-400/70')} />
                  <span className={cn(
                    'text-[9px] truncate font-medium',
                    col.error_count > 0 ? 'text-red-300/80' : 'text-amber-300/80',
                  )}>
                    {col.name}
                  </span>
                  {funcStyle && (
                    <span className={cn(
                      'text-[7px] px-0.5 rounded border shrink-0',
                      funcStyle.bg, funcStyle.text, funcStyle.border,
                    )}>
                      {col.func_name}
                    </span>
                  )}
                </div>
              )
            })}
            {computedCols.length > 5 && (
              <div className="text-[8px] text-amber-400/30 pl-3">+{computedCols.length - 5} more computed</div>
            )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/40 !w-2 !h-2 !-bottom-1" />
    </div>
  )
}

const nodeTypes = { tableNode: TableNode }

// ── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  onClose,
}: {
  node: PipelineNode
  onClose: () => void
}) {
  const [showVersions, setShowVersions] = useState(false)

  const computed = node.columns.filter((c) => c.is_computed)
  const insertable = node.columns.filter((c) => !c.is_computed)
  const domain = getDomain(node.name)

  return (
    <div className="w-[360px] border-l border-border/60 bg-card/60 backdrop-blur-sm overflow-y-auto">
      {/* Header */}
      <div className={cn(
        'px-4 py-3 border-b border-border/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm',
        domain ? `bg-gradient-to-r ${domain.color}` : 'bg-card/90',
      )}>
        <div>
          <div className="flex items-center gap-1.5">
            {node.is_view ? (
              <Eye className="h-3.5 w-3.5 text-blue-400" />
            ) : (
              <Table2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span className="text-[13px] font-semibold">{node.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground/60 font-mono">{node.path}</span>
            {node.iterator_type && (
              <span className={cn(
                'text-[9px] px-1 rounded border font-mono',
                ITERATOR_COLORS[node.iterator_type]?.bg ?? 'bg-muted',
                ITERATOR_COLORS[node.iterator_type]?.text ?? 'text-muted-foreground',
                ITERATOR_COLORS[node.iterator_type]?.border ?? 'border-border',
              )}>
                {node.iterator_type}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-border/30">
        {[
          { label: 'Rows', value: node.row_count.toLocaleString(), color: 'text-foreground' },
          { label: 'Version', value: `v${node.version}`, color: 'text-foreground' },
          { label: 'Computed', value: node.computed_count, color: 'text-amber-400' },
          { label: 'Errors', value: node.total_errors, color: node.total_errors > 0 ? 'text-red-400' : 'text-green-400' },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className={cn('text-[13px] font-semibold', s.color)}>{s.value}</div>
            <div className="text-[9px] text-muted-foreground/50">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Base table lineage */}
      {node.base && (
        <div className="px-4 py-2 border-b border-border/30 flex items-center gap-2">
          <GitBranch className="h-3 w-3 text-blue-400" />
          <span className="text-[10px] text-muted-foreground/60">Derived from</span>
          <span className="text-[10px] text-foreground font-mono">{node.base}</span>
        </div>
      )}

      {/* Indices */}
      {node.indices.length > 0 && (
        <div className="px-4 py-2 border-b border-border/30">
          <div className="text-[10px] font-medium text-blue-400/60 uppercase tracking-wider mb-1.5">
            Embedding Indices
          </div>
          {node.indices.map((idx) => (
            <div key={idx.name} className="flex items-start gap-1.5 mb-1">
              <SearchIcon className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-foreground">{idx.columns.join(', ')}</span>
                <p className="text-[9px] text-muted-foreground/50 break-all">{idx.embedding}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insertable columns */}
      {insertable.length > 0 && (
        <div className="px-4 py-2 border-b border-border/30">
          <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
            Insertable Columns ({insertable.length})
          </div>
          <div className="space-y-1">
            {insertable.map((col) => (
              <div key={col.name} className="flex items-center gap-2 text-[10px]">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <span className="text-foreground/80">{col.name}</span>
                {col.defined_in && !col.defined_in_self && (
                  <span className="text-[8px] text-blue-400/50 italic">from {col.defined_in}</span>
                )}
                <span className="text-muted-foreground/40 ml-auto text-[9px]">{col.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Computed columns (the pipeline) */}
      {computed.length > 0 && (
        <div className="px-4 py-2 border-b border-border/30">
          <div className="text-[10px] font-medium text-amber-400/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" /> Computed Pipeline ({computed.length})
          </div>
          <div className="space-y-1.5">
            {computed.map((col, i) => (
              <ComputedColumnRow key={col.name} col={col} step={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Version History */}
      {node.versions.length > 0 && (
        <div className="px-4 py-2">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5 hover:text-foreground"
          >
            <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', showVersions && 'rotate-180')} />
            Version History ({node.versions.length})
          </button>
          {showVersions && (
            <div className="space-y-1">
              {node.versions.map((v) => (
                <div key={v.version} className="flex items-center gap-2 text-[9px]">
                  <span className="text-muted-foreground/50 w-6 text-right">v{v.version}</span>
                  <span className={cn(
                    'px-1 rounded text-[8px]',
                    v.change_type === 'schema' ? 'bg-purple-500/20 text-purple-300' : 'bg-muted text-muted-foreground',
                  )}>
                    {v.change_type}
                  </span>
                  <span className="text-green-400/70">+{v.inserts}</span>
                  {v.updates > 0 && <span className="text-blue-400/70">~{v.updates}</span>}
                  {v.deletes > 0 && <span className="text-red-400/70">-{v.deletes}</span>}
                  {v.errors > 0 && <span className="text-red-400">err:{v.errors}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ComputedColumnRow({ col, step }: { col: PipelineColumn; step: number }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const funcStyle = col.func_type ? FUNC_TYPE_STYLES[col.func_type] : null

  return (
    <div className="rounded-md border border-border/30 bg-amber-500/5 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-amber-500/10 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-[9px] text-amber-400/60 w-4 shrink-0">#{step}</span>
        <span className={cn('text-[10px] truncate', col.error_count > 0 ? 'text-red-400' : 'text-amber-300/90')}>
          {col.name}
        </span>
        {col.error_count > 0 && (
          <AlertTriangle className="h-2.5 w-2.5 text-red-400 shrink-0" />
        )}
        {funcStyle && (
          <span className={cn(
            'text-[7px] px-1 rounded border shrink-0',
            funcStyle.bg, funcStyle.text, funcStyle.border,
          )}>
            {funcStyle.label}
          </span>
        )}
        <ChevronDown className={cn('h-2.5 w-2.5 text-muted-foreground/40 transition-transform shrink-0 ml-auto', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* Function info */}
          {col.func_name && (
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'text-[9px] font-mono font-medium',
                funcStyle?.text ?? 'text-muted-foreground',
              )}>
                {col.func_name}()
              </span>
              {funcStyle && (
                <span className="text-[8px] text-muted-foreground/40">
                  {col.func_type === 'builtin' ? 'pixeltable built-in' : col.func_type === 'custom_udf' ? 'custom @pxt.udf' : col.func_type === 'query' ? '@pxt.query' : ''}
                </span>
              )}
            </div>
          )}
          {col.computed_with && (
            <p className="text-[9px] text-muted-foreground/50 break-all font-mono leading-relaxed bg-black/20 rounded px-1.5 py-1">
              {col.computed_with}
            </p>
          )}
          {col.depends_on && col.depends_on.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <GitBranch className="h-2.5 w-2.5 text-muted-foreground/40" />
              {col.depends_on.map((d) => (
                <span key={d} className="text-[8px] bg-muted/50 text-muted-foreground/70 px-1 rounded">{d}</span>
              ))}
            </div>
          )}
          {col.error_count > 0 && (
            <div className="text-[9px] text-red-400/80 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" />
              {col.error_count} errors in sampled rows
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Hierarchical Layout ──────────────────────────────────────────────────────

function buildLayout(
  pipelineNodes: PipelineNode[],
  pipelineEdges: PipelineResponse['edges'],
): Node[] {
  const childrenMap = new Map<string, string[]>()
  const parentMap = new Map<string, string>()

  // Only use view edges for tree hierarchy; query edges are cross-references
  for (const e of pipelineEdges) {
    if (e.type !== 'view') continue
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
    childrenMap.get(e.source)!.push(e.target)
    parentMap.set(e.target, e.source)
  }

  const nodeMap = new Map(pipelineNodes.map((n) => [n.path, n]))

  // Separate connected trees from standalone nodes
  const roots = pipelineNodes.filter((n) => !parentMap.has(n.path) && (childrenMap.has(n.path) || false))
  const standalone = pipelineNodes.filter(
    (n) => !parentMap.has(n.path) && !childrenMap.has(n.path),
  )

  const NODE_W = 240
  const NODE_H_BASE = 100
  const H_GAP = 40
  const V_GAP = 100

  const positions = new Map<string, { x: number; y: number }>()
  let globalX = 0

  function getNodeHeight(path: string): number {
    const n = nodeMap.get(path)
    if (!n) return NODE_H_BASE
    const colCount = Math.min(n.columns.length, 10)
    return NODE_H_BASE + colCount * 14
  }

  function getTreeWidth(path: string): number {
    const children = childrenMap.get(path) || []
    if (children.length === 0) return NODE_W
    const childWidths = children.map(getTreeWidth)
    return Math.max(NODE_W, childWidths.reduce((sum, w) => sum + w + H_GAP, -H_GAP))
  }

  function layoutTree(path: string, x: number, y: number) {
    positions.set(path, { x, y })
    const children = childrenMap.get(path) || []
    if (children.length === 0) return

    const treeWidth = getTreeWidth(path)
    let childX = x - treeWidth / 2 + NODE_W / 2

    for (const child of children) {
      const childTreeW = getTreeWidth(child)
      const childCenterX = childX + childTreeW / 2 - NODE_W / 2
      layoutTree(child, childCenterX, y + getNodeHeight(path) + V_GAP)
      childX += childTreeW + H_GAP
    }
  }

  // Layout connected trees
  for (const root of roots) {
    const treeW = getTreeWidth(root.path)
    layoutTree(root.path, globalX + treeW / 2 - NODE_W / 2, 0)
    globalX += treeW + H_GAP * 2
  }

  // Layout standalone nodes in a row below
  const standaloneY = 0
  for (const node of standalone) {
    positions.set(node.path, { x: globalX, y: standaloneY })
    globalX += NODE_W + H_GAP
  }

  return pipelineNodes.map((n) => {
    const pos = positions.get(n.path) || { x: 0, y: 0 }
    return {
      id: n.path,
      type: 'tableNode',
      position: pos,
      data: n,
    }
  })
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PipelineInspector() {
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    api
      .getPipeline()
      .then((data) => {
        setPipeline(data)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline')
        setIsLoading(false)
      })
  }, [])

  const handleSelect = useCallback((path: string) => {
    setSelectedPath((prev) => (prev === path ? null : path))
  }, [])

  useEffect(() => {
    if (!pipeline) return

    const nodesWithCallbacks = pipeline.nodes.map((n) => ({
      ...n,
      isSelected: n.path === selectedPath,
      onSelect: handleSelect,
    }))

    const flowNodes = buildLayout(pipeline.nodes, pipeline.edges).map((n) => ({
      ...n,
      data: {
        ...nodesWithCallbacks.find((pn) => pn.path === n.id)!,
      },
    }))

    const flowEdges: Edge[] = pipeline.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      type: 'labeled',
      animated: e.type === 'view',
      data: { label: e.label, edgeType: e.type },
      style: { strokeWidth: e.type === 'query' ? 1 : 1.5 },
    }))

    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [pipeline, selectedPath, handleSelect, setNodes, setEdges])

  const selectedNode = useMemo(
    () => pipeline?.nodes.find((n) => n.path === selectedPath) ?? null,
    [pipeline, selectedPath],
  )

  const stats = useMemo(() => {
    if (!pipeline) return null
    const tables = pipeline.nodes.filter((n) => !n.is_view).length
    const views = pipeline.nodes.filter((n) => n.is_view).length
    const totalRows = pipeline.nodes.reduce((s, n) => s + n.row_count, 0)
    const totalComputed = pipeline.nodes.reduce((s, n) => s + n.computed_count, 0)
    const totalErrors = pipeline.nodes.reduce((s, n) => s + n.total_errors, 0)
    const totalIndices = pipeline.nodes.reduce((s, n) => s + n.indices.length, 0)
    return { tables, views, totalRows, totalComputed, totalErrors, totalIndices }
  }, [pipeline])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-k-yellow" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/40 bg-card/30 shrink-0">
          {[
            { icon: Database, label: `${stats.tables} tables`, color: 'text-emerald-400' },
            { icon: Eye, label: `${stats.views} views`, color: 'text-blue-400' },
            { icon: Rows3, label: `${stats.totalRows.toLocaleString()} rows`, color: 'text-muted-foreground' },
            { icon: Zap, label: `${stats.totalComputed} computed`, color: 'text-amber-400' },
            { icon: SearchIcon, label: `${stats.totalIndices} indices`, color: 'text-blue-400' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
              <s.icon className={cn('h-3 w-3', s.color)} />
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
          {stats.totalErrors > 0 && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-red-400">{stats.totalErrors} errors</span>
            </div>
          )}

          {/* Legend */}
          <div className="ml-auto flex items-center gap-3 text-[9px] text-muted-foreground/50">
            <span className="flex items-center gap-1"><Table2 className="h-2.5 w-2.5 text-emerald-400" /> Table</span>
            <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5 text-blue-400" /> View</span>
            <span className="flex items-center gap-1 px-0.5 rounded border border-sky-500/20 text-sky-300 bg-sky-500/10">built-in</span>
            <span className="flex items-center gap-1 px-0.5 rounded border border-violet-500/20 text-violet-300 bg-violet-500/10">UDF</span>
            <span className="flex items-center gap-1 px-0.5 rounded border border-teal-500/20 text-teal-300 bg-teal-500/10">query</span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-px bg-muted-foreground/50" /> view
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-px border-t border-dashed border-teal-400/60" /> query
            </span>
          </div>
        </div>
      )}

      {/* Flow + Detail */}
      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={24} size={1} />
            <Controls
              className="!bg-card !border-border/60 !rounded-lg !shadow-lg [&>button]:!bg-card [&>button]:!border-border/40 [&>button]:!text-muted-foreground [&>button:hover]:!bg-accent"
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <DetailPanel node={selectedNode} onClose={() => setSelectedPath(null)} />
        )}
      </div>
    </div>
  )
}
