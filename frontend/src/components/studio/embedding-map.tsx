import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Loader2, Layers, Type, Image as ImageIcon, X, Eye, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import * as api from '@/lib/api'
import type { EmbeddingPoint, EmbeddingResponse } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  document: '#60a5fa',
  image: '#eab308',
  video_frame: '#ef4444',
  video_transcript: '#f97316',
  audio_transcript: '#22c55e',
}

const TYPE_LABELS: Record<string, string> = {
  document: 'Documents',
  image: 'Images',
  video_frame: 'Frames',
  video_transcript: 'Video Text',
  audio_transcript: 'Audio Text',
}

const PADDING = 40
const DOT_RADIUS = 5
const DOT_HOVER_RADIUS = 8

export function EmbeddingMap() {
  const { addToast } = useToast()
  const [space, setSpace] = useState<'text' | 'visual'>('text')
  const [data, setData] = useState<EmbeddingResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<EmbeddingPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<EmbeddingPoint | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({
          width: Math.max(400, width),
          height: Math.max(300, height - 44),
        })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const loadEmbeddings = useCallback(
    async (selectedSpace: 'text' | 'visual') => {
      setSpace(selectedSpace)
      setIsLoading(true)
      setHoveredPoint(null)
      setSelectedPoint(null)
      try {
        const result = await api.getEmbeddings(selectedSpace, 200)
        setData(result)
        if (result.count === 0) {
          addToast(`No ${selectedSpace} embeddings available yet`, 'info')
        }
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load embeddings', 'error')
      } finally {
        setIsLoading(false)
      }
    },
    [addToast],
  )

  useEffect(() => {
    loadEmbeddings('text')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const typeCounts = useMemo(() => {
    if (!data) return {}
    const counts: Record<string, number> = {}
    for (const point of data.points) {
      counts[point.type] = (counts[point.type] ?? 0) + 1
    }
    return counts
  }, [data])

  const visiblePoints = useMemo(() => {
    if (!data) return []
    if (hiddenTypes.size === 0) return data.points
    return data.points.filter((pt) => !hiddenTypes.has(pt.type))
  }, [data, hiddenTypes])

  const plotWidth = selectedPoint ? dimensions.width - 260 : dimensions.width
  const plotHeight = dimensions.height

  const toSvg = useCallback(
    (nx: number, ny: number): [number, number] => [
      PADDING + nx * (plotWidth - 2 * PADDING),
      PADDING + (1 - ny) * (plotHeight - 2 * PADDING),
    ],
    [plotWidth, plotHeight],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      let closest: EmbeddingPoint | null = null
      let closestDist = Infinity
      for (const pt of visiblePoints) {
        const [px, py] = toSvg(pt.x, pt.y)
        const dist = Math.hypot(mx - px, my - py)
        if (dist < DOT_HOVER_RADIUS * 2.5 && dist < closestDist) {
          closest = pt
          closestDist = dist
        }
      }
      setHoveredPoint(closest)
      if (closest) {
        setTooltipPos({ x: e.clientX, y: e.clientY })
      }
    },
    [data, visiblePoints, toSvg],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      let closest: EmbeddingPoint | null = null
      let closestDist = Infinity
      for (const pt of visiblePoints) {
        const [px, py] = toSvg(pt.x, pt.y)
        const dist = Math.hypot(mx - px, my - py)
        if (dist < DOT_HOVER_RADIUS * 3 && dist < closestDist) {
          closest = pt
          closestDist = dist
        }
      }
      setSelectedPoint((prev) => (prev === closest ? null : closest))
    },
    [data, visiblePoints, toSvg],
  )

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex gap-1">
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
              space === 'text'
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => loadEmbeddings('text')}
            disabled={isLoading}
          >
            <Type className="h-3 w-3" />
            Text
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
              space === 'visual'
                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => loadEmbeddings('visual')}
            disabled={isLoading}
          >
            <ImageIcon className="h-3 w-3" />
            Visual
          </button>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Legend with toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(typeCounts).map(([type, count]) => {
            const isHidden = hiddenTypes.has(type)
            return (
              <button
                key={type}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] transition-all border',
                  isHidden
                    ? 'border-border/50 text-muted-foreground/40'
                    : 'border-transparent text-muted-foreground hover:bg-accent',
                )}
                onClick={() => toggleType(type)}
                title={isHidden ? `Show ${TYPE_LABELS[type]}` : `Hide ${TYPE_LABELS[type]}`}
              >
                {isHidden ? (
                  <EyeOff className="h-2.5 w-2.5 opacity-40" />
                ) : (
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[type] ?? '#888' }}
                  />
                )}
                <span className={isHidden ? 'line-through opacity-40' : ''}>
                  {TYPE_LABELS[type] ?? type}
                </span>
                <span className="font-mono opacity-60">({count})</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {data && (
          <Badge variant="secondary" className="text-[10px]">
            {visiblePoints.length}/{data.count} visible
          </Badge>
        )}
      </div>

      {/* Main content: scatter plot + optional detail panel */}
      <div className="flex-1 flex gap-0 rounded-xl border border-border bg-card/30 overflow-hidden relative">
        {/* Scatter plot area */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-k-yellow" />
              <p className="text-xs text-muted-foreground">
                Computing {space} embeddings with UMAP...
              </p>
            </div>
          ) : !data || data.points.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Layers className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground">
                No embeddings to visualize. Upload files first.
              </p>
            </div>
          ) : (
            <>
              <svg
                ref={svgRef}
                width={plotWidth}
                height={plotHeight}
                className="cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredPoint(null)}
                onClick={handleClick}
              >
                {/* Subtle grid */}
                {[0.25, 0.5, 0.75].map((v) => {
                  const [x] = toSvg(v, 0)
                  const [, y] = toSvg(0, v)
                  return (
                    <g key={v}>
                      <line
                        x1={x}
                        y1={PADDING}
                        x2={x}
                        y2={plotHeight - PADDING}
                        className="stroke-border/40"
                        strokeWidth={0.5}
                        strokeDasharray="2 6"
                      />
                      <line
                        x1={PADDING}
                        y1={y}
                        x2={plotWidth - PADDING}
                        y2={y}
                        className="stroke-border/40"
                        strokeWidth={0.5}
                        strokeDasharray="2 6"
                      />
                    </g>
                  )
                })}

                {/* Data points */}
                {visiblePoints.map((pt, i) => {
                  const [cx, cy] = toSvg(pt.x, pt.y)
                  const isHovered = hoveredPoint === pt
                  const isSelected = selectedPoint === pt
                  const isDimmed = selectedPoint && !isSelected && !isHovered
                  const color = TYPE_COLORS[pt.type] ?? '#888'
                  return (
                    <circle
                      key={`${pt.type}-${pt.uuid}-${i}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? DOT_HOVER_RADIUS + 1 : isHovered ? DOT_HOVER_RADIUS : DOT_RADIUS}
                      fill={color}
                      fillOpacity={isDimmed ? 0.15 : isSelected ? 1 : isHovered ? 0.95 : 0.65}
                      stroke={isSelected ? '#fff' : isHovered ? '#fff' : 'transparent'}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 0}
                      className="transition-all duration-150 cursor-pointer"
                    />
                  )
                })}

                {/* Highlight ring for selected */}
                {selectedPoint && (() => {
                  const [cx, cy] = toSvg(selectedPoint.x, selectedPoint.y)
                  const color = TYPE_COLORS[selectedPoint.type] ?? '#888'
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={DOT_HOVER_RADIUS + 5}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeOpacity={0.4}
                      strokeDasharray="3 3"
                      className="animate-pulse"
                    />
                  )
                })()}
              </svg>

              {/* Hover tooltip */}
              {hoveredPoint && hoveredPoint !== selectedPoint && (
                <div
                  className="fixed z-50 pointer-events-none"
                  style={{
                    left: tooltipPos.x + 14,
                    top: tooltipPos.y - 8,
                  }}
                >
                  <div className="bg-popover border border-border rounded-lg shadow-lg px-2.5 py-1.5 max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[hoveredPoint.type] ?? '#888' }}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {TYPE_LABELS[hoveredPoint.type] ?? hoveredPoint.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground leading-snug line-clamp-2 mt-0.5">
                      {hoveredPoint.label}
                    </p>
                  </div>
                </div>
              )}

              {/* Axis labels */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/30 font-medium tracking-wider">
                UMAP-1
              </div>
              <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-muted-foreground/30 font-medium tracking-wider">
                UMAP-2
              </div>
            </>
          )}
        </div>

        {/* Detail panel (slides in when a point is selected) */}
        {selectedPoint && (
          <div className="w-[256px] border-l border-border bg-card/60 p-4 overflow-y-auto animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: TYPE_COLORS[selectedPoint.type] ?? '#888' }}
                />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {TYPE_LABELS[selectedPoint.type] ?? selectedPoint.type}
                </span>
              </div>
              <button
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-accent transition-colors"
                onClick={() => setSelectedPoint(null)}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>

            {selectedPoint.thumbnail && (
              <img
                src={selectedPoint.thumbnail}
                alt=""
                className="w-full rounded-lg object-cover mb-3 border border-border"
              />
            )}

            <p className="text-xs text-foreground leading-relaxed mb-3">
              {selectedPoint.label}
            </p>

            <div className="space-y-2">
              <div>
                <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  ID
                </span>
                <p className="text-[10px] font-mono text-muted-foreground break-all">
                  {selectedPoint.uuid}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Position
                </span>
                <p className="text-[10px] font-mono text-muted-foreground">
                  ({selectedPoint.x.toFixed(4)}, {selectedPoint.y.toFixed(4)})
                </p>
              </div>
            </div>

            {/* Nearby points */}
            <NearbyPoints
              selected={selectedPoint}
              allPoints={visiblePoints}
              onSelect={setSelectedPoint}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function NearbyPoints({
  selected,
  allPoints,
  onSelect,
}: {
  selected: EmbeddingPoint
  allPoints: EmbeddingPoint[]
  onSelect: (pt: EmbeddingPoint) => void
}) {
  const nearby = useMemo(() => {
    return allPoints
      .filter((pt) => pt !== selected)
      .map((pt) => ({
        point: pt,
        dist: Math.hypot(pt.x - selected.x, pt.y - selected.y),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
  }, [selected, allPoints])

  if (nearby.length === 0) return null

  return (
    <div className="mt-4 pt-3 border-t border-border">
      <span className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">
        Nearest neighbors
      </span>
      <div className="mt-1.5 space-y-1">
        {nearby.map(({ point, dist }) => (
          <button
            key={point.uuid}
            className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors group"
            onClick={() => onSelect(point)}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[point.type] ?? '#888' }}
              />
              <span className="text-[10px] text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                {point.label}
              </span>
            </div>
            <span className="text-[9px] font-mono text-muted-foreground/40 ml-3">
              d={dist.toFixed(3)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
