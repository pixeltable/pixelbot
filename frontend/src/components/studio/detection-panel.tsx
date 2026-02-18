import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ScanSearch,
  Loader2,
  ChevronDown,
  Eye,
  EyeOff,
  Tag,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import * as api from '@/lib/api'
import type {
  DetectionModel,
  DetectionResponse,
  DetectionItem,
  ClassificationItem,
  SegmentItem,
} from '@/types'

// Colors for bounding box labels (cycles through)
const BOX_COLORS = [
  '#facc15', // yellow
  '#f97316', // orange
  '#ef4444', // red
  '#22d3ee', // cyan
  '#a78bfa', // purple
  '#34d399', // green
  '#f472b6', // pink
  '#60a5fa', // blue
]

function getColor(idx: number): string {
  return BOX_COLORS[idx % BOX_COLORS.length]
}

interface DetectionPanelProps {
  imageUuid: string
  source: 'image' | 'video_frame'
  frameIdx?: number | null
  imageSrc: string
  imageWidth: number
  imageHeight: number
}

export function DetectionPanel({
  imageUuid,
  source,
  frameIdx,
  imageSrc,
  imageWidth,
  imageHeight,
}: DetectionPanelProps) {
  const [models, setModels] = useState<DetectionModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('detr-resnet-50')
  const [threshold, setThreshold] = useState(0.5)
  const [isDetecting, setIsDetecting] = useState(false)
  const [result, setResult] = useState<DetectionResponse | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load available models
  useEffect(() => {
    api.getDetectionModels().then(setModels).catch(() => {})
  }, [])

  const currentModelType = useMemo(() => {
    return models.find((m) => m.key === selectedModel)?.type ?? 'detection'
  }, [models, selectedModel])

  const handleDetect = useCallback(async () => {
    setIsDetecting(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.detectObjects({
        uuid: imageUuid,
        source,
        frame_idx: frameIdx,
        model: selectedModel,
        threshold,
        top_k: 5,
      })
      setResult(res)
      setShowOverlay(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed')
    } finally {
      setIsDetecting(false)
    }
  }, [imageUuid, source, frameIdx, selectedModel, threshold])

  // Reset result when switching models
  useEffect(() => {
    setResult(null)
  }, [selectedModel])

  const detections = result?.detections ?? []
  const classifications = result?.classifications ?? []
  const segments = result?.segments ?? []

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Model selector */}
        <div className="relative">
          <select
            className="appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-k-yellow/40"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>

        {/* Threshold slider (detection + segmentation) */}
        {(currentModelType === 'detection' || currentModelType === 'segmentation') && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Threshold</span>
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-16 h-1 accent-k-yellow"
            />
            <span className="text-[10px] font-mono text-muted-foreground w-6">{threshold.toFixed(2)}</span>
          </div>
        )}

        {/* Run button */}
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
            'bg-k-yellow text-black hover:bg-k-yellow-hover',
            isDetecting && 'opacity-70 pointer-events-none',
          )}
          onClick={handleDetect}
          disabled={isDetecting}
        >
          {isDetecting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ScanSearch className="h-3 w-3" />
          )}
          {isDetecting ? 'Analyzing...' : 'Detect'}
        </button>

        {/* Toggle overlay */}
        {result && (result.type === 'detection' || result.type === 'segmentation') && (
          <button
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
            onClick={() => setShowOverlay(!showOverlay)}
            title={showOverlay ? 'Hide boxes' : 'Show boxes'}
          >
            {showOverlay ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Image with detection overlay */}
      {result?.type === 'detection' && detections.length > 0 && (
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted/30">
          <img src={imageSrc} alt="Detection" className="w-full h-auto block" />
          {showOverlay && (
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${result.image_width} ${result.image_height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {detections.map((det, idx) => (
                <DetectionBox
                  key={idx}
                  detection={det}
                  color={getColor(idx)}
                  isHovered={hoveredIdx === idx}
                  onHover={() => setHoveredIdx(idx)}
                  onLeave={() => setHoveredIdx(null)}
                />
              ))}
            </svg>
          )}
        </div>
      )}

      {/* Detection labels list */}
      {result?.type === 'detection' && detections.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {detections.length} object{detections.length !== 1 ? 's' : ''} detected
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detections.map((det, idx) => (
              <button
                key={idx}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border',
                  hoveredIdx === idx
                    ? 'bg-foreground/10 border-foreground/20'
                    : 'bg-card border-border hover:bg-accent',
                )}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: getColor(idx) }}
                />
                <span className="text-foreground">{det.label}</span>
                <span className="text-muted-foreground">{(det.score * 100).toFixed(0)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Segmentation overlay */}
      {result?.type === 'segmentation' && segments.length > 0 && (
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted/30">
          <img src={imageSrc} alt="Segmentation" className="w-full h-auto block" />
          {showOverlay && (
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${result.image_width} ${result.image_height}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {segments.map((seg, idx) => (
                <g
                  key={seg.id}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer"
                  style={{ pointerEvents: 'all' }}
                >
                  <rect
                    x={seg.box.x1}
                    y={seg.box.y1}
                    width={seg.box.x2 - seg.box.x1}
                    height={seg.box.y2 - seg.box.y1}
                    fill={getColor(idx)}
                    fillOpacity={hoveredIdx === idx ? 0.35 : 0.2}
                    stroke={getColor(idx)}
                    strokeWidth={hoveredIdx === idx ? 2.5 : 1.5}
                    strokeOpacity={hoveredIdx === idx ? 1 : 0.7}
                    rx={3}
                  />
                  <rect
                    x={seg.box.x1}
                    y={seg.box.y1 - 16}
                    width={seg.label.length * 7 + 40}
                    height={16}
                    fill={getColor(idx)}
                    fillOpacity={hoveredIdx === idx ? 0.95 : 0.8}
                    rx={2}
                  />
                  <text
                    x={seg.box.x1 + 3}
                    y={seg.box.y1 - 4}
                    fontSize={10}
                    fill="#000"
                    fontWeight="600"
                    fontFamily="system-ui, sans-serif"
                  >
                    {seg.label} {(seg.score * 100).toFixed(0)}%
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      )}

      {/* Segmentation labels list */}
      {result?.type === 'segmentation' && segments.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {segments.length} segment{segments.length !== 1 ? 's' : ''} found
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {segments.map((seg, idx) => (
              <button
                key={seg.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border',
                  hoveredIdx === idx
                    ? 'bg-foreground/10 border-foreground/20'
                    : 'bg-card border-border hover:bg-accent',
                )}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: getColor(idx) }}
                />
                <span className="text-foreground">{seg.label}</span>
                <span className="text-muted-foreground">{(seg.score * 100).toFixed(0)}%</span>
                {!seg.is_thing && (
                  <span className="text-[9px] text-muted-foreground/50">stuff</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Classification results */}
      {result?.type === 'classification' && classifications.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3 w-3 text-violet-400" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Classification Results
            </span>
          </div>
          {classifications.map((cls, idx) => (
            <ClassificationBar key={idx} item={cls} rank={idx} />
          ))}
        </div>
      )}

      {/* Empty state after detection */}
      {result && detections.length === 0 && classifications.length === 0 && segments.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            No {result.type === 'detection' ? 'objects detected' : result.type === 'segmentation' ? 'segments found' : 'classifications'} at this
            threshold. Try lowering the threshold.
          </p>
        </div>
      )}
    </div>
  )
}

// SVG bounding box for a single detection
function DetectionBox({
  detection,
  color,
  isHovered,
  onHover,
  onLeave,
}: {
  detection: DetectionItem
  color: string
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
}) {
  const { box, label, score } = detection
  const w = box.x2 - box.x1
  const h = box.y2 - box.y1
  const fontSize = Math.max(10, Math.min(14, w * 0.08))

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="cursor-pointer"
      style={{ pointerEvents: 'all' }}
    >
      {/* Bounding box */}
      <rect
        x={box.x1}
        y={box.y1}
        width={w}
        height={h}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? 3 : 2}
        strokeOpacity={isHovered ? 1 : 0.8}
        rx={2}
      />

      {/* Label background */}
      <rect
        x={box.x1}
        y={box.y1 - fontSize - 6}
        width={label.length * fontSize * 0.65 + 40}
        height={fontSize + 6}
        fill={color}
        fillOpacity={isHovered ? 0.95 : 0.85}
        rx={2}
      />

      {/* Label text */}
      <text
        x={box.x1 + 4}
        y={box.y1 - 4}
        fontSize={fontSize}
        fill="#000"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
      >
        {label} {(score * 100).toFixed(0)}%
      </text>
    </g>
  )
}

// Horizontal bar for classification confidence
function ClassificationBar({ item, rank }: { item: ClassificationItem; rank: number }) {
  const pct = item.score * 100
  const isTop = rank === 0

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'text-xs',
            isTop ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {item.label}
        </span>
        <span className={cn('text-[10px] font-mono', isTop ? 'text-violet-400' : 'text-muted-foreground')}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isTop
              ? 'bg-k-yellow'
              : 'bg-muted-foreground/30',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
