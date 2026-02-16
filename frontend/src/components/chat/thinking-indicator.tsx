import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Sparkles,
  Search,
  FileText,
  ImageIcon,
  Film,
  Brain,
  MessageSquare,
  Zap,
  Cpu,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PipelineStage {
  id: string
  label: string
  icon: typeof Sparkles
  color: string
  delay: number
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'understand', label: 'Understanding your question', icon: Lightbulb, color: 'text-k-yellow', delay: 0 },
  { id: 'tools', label: 'Selecting tools', icon: Zap, color: 'text-orange-400', delay: 2000 },
  { id: 'docs', label: 'Searching documents', icon: FileText, color: 'text-blue-400', delay: 4000 },
  { id: 'media', label: 'Analyzing images & media', icon: ImageIcon, color: 'text-emerald-400', delay: 6500 },
  { id: 'memory', label: 'Retrieving memory & history', icon: Brain, color: 'text-purple-400', delay: 8500 },
  { id: 'context', label: 'Assembling context', icon: Cpu, color: 'text-cyan-400', delay: 10500 },
  { id: 'generate', label: 'Generating answer', icon: MessageSquare, color: 'text-sky-400', delay: 13000 },
  { id: 'followup', label: 'Preparing follow-ups', icon: Sparkles, color: 'text-rose-400', delay: 18000 },
]

export function ThinkingIndicator() {
  const [activeStageIdx, setActiveStageIdx] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTime = useRef(Date.now())

  // Elapsed time ticker (every 100ms for smooth display)
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime.current)
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Advance stages based on elapsed time
  useEffect(() => {
    const nextIdx = PIPELINE_STAGES.findIndex((s) => s.delay > elapsedMs)
    const current = nextIdx === -1 ? PIPELINE_STAGES.length - 1 : Math.max(0, nextIdx - 1)
    setActiveStageIdx(current)
  }, [elapsedMs])

  const activeStage = PIPELINE_STAGES[activeStageIdx]
  const ActiveIcon = activeStage.icon
  const elapsedSec = (elapsedMs / 1000).toFixed(1)

  // Completed stages (before current)
  const completedStages = useMemo(
    () => PIPELINE_STAGES.slice(0, activeStageIdx),
    [activeStageIdx],
  )

  return (
    <div className="flex gap-3 py-4 animate-fade-in">
      {/* Animated avatar */}
      <div className="flex-shrink-0 mt-0.5">
        <div className="relative h-7 w-7">
          {/* Spinning ring */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-k-yellow/60 animate-spin" />
          {/* Inner dot */}
          <div className="absolute inset-0.5 rounded-full bg-k-yellow/10 border border-k-yellow/20 flex items-center justify-center">
            <Sparkles className="h-2.5 w-2.5 text-k-yellow" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Current stage - prominent */}
        <div className="flex items-center gap-2.5">
          <div className={cn('transition-colors duration-300', activeStage.color)}>
            <ActiveIcon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-foreground/80 animate-pulse-subtle">
            {activeStage.label}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums ml-auto">
            {elapsedSec}s
          </span>
        </div>

        {/* Progress track */}
        <div className="flex gap-0.5 h-0.5 rounded-full overflow-hidden">
          {PIPELINE_STAGES.map((stage, idx) => (
            <div
              key={stage.id}
              className={cn(
                'flex-1 rounded-full transition-all duration-500',
                idx < activeStageIdx
                  ? 'bg-k-yellow/40'
                  : idx === activeStageIdx
                    ? 'bg-k-yellow animate-pulse-subtle'
                    : 'bg-border/30',
              )}
            />
          ))}
        </div>

        {/* Completed stages trail */}
        {completedStages.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
            {completedStages.map((stage) => {
              const Icon = stage.icon
              return (
                <span
                  key={stage.id}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40"
                >
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500/50" />
                  {stage.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
