import { FileText, ImageIcon, Film, Music, FileAudio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SearchResult } from '@/types'

const TYPE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  video_transcript: Film,
  audio_transcript: Music,
}

const TYPE_COLORS: Record<string, string> = {
  document: 'text-k-blue-light bg-k-blue-light/10',
  image: 'text-k-yellow bg-k-yellow/10',
  video: 'text-k-red bg-k-red/10',
  video_transcript: 'text-k-red bg-k-red/10',
  audio_transcript: 'text-green-500 bg-green-500/10',
}

const TYPE_LABELS: Record<string, string> = {
  document: 'Document',
  image: 'Image',
  video: 'Video',
  video_transcript: 'Video Transcript',
  audio_transcript: 'Audio Transcript',
}

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  onSelectResult: (result: SearchResult) => void
}

export function SearchResults({ results, query, onSelectResult }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileAudio className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">
          No results for &ldquo;<span className="font-medium text-foreground">{query}</span>&rdquo;
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Try a broader query or different terms
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className="text-[10px]">
          {results.length} results
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          for &ldquo;{query}&rdquo;
        </span>
      </div>

      {results.map((result, i) => {
        const Icon = TYPE_ICONS[result.type] ?? FileText
        const colorClasses = TYPE_COLORS[result.type] ?? 'text-muted-foreground bg-muted'

        return (
          <button
            key={`${result.type}-${result.uuid}-${i}`}
            className="flex items-start gap-3 w-full rounded-lg border border-border p-3 bg-card/50 hover:bg-card transition-colors text-left group"
            onClick={() => onSelectResult(result)}
          >
            {/* Thumbnail or icon */}
            {result.thumbnail ? (
              <img
                src={result.thumbnail}
                alt=""
                className="h-12 w-12 rounded-md object-cover shrink-0 border border-border/50"
              />
            ) : (
              <div
                className={cn(
                  'h-12 w-12 rounded-md flex items-center justify-center shrink-0',
                  colorClasses,
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="secondary"
                  className={cn('text-[9px] px-1.5 py-0', colorClasses)}
                >
                  {TYPE_LABELS[result.type] ?? result.type}
                </Badge>
                <span className="text-[10px] font-mono text-muted-foreground/60">
                  {result.uuid.slice(0, 8)}
                </span>
              </div>

              {result.text && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {result.text}
                </p>
              )}

              {result.metadata?.heading != null && (
                <p className="text-[10px] text-k-blue-light mt-0.5 truncate">
                  {String(result.metadata.heading)}
                </p>
              )}
            </div>

            {/* Similarity score */}
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div
                className={cn(
                  'text-xs font-mono font-semibold tabular-nums',
                  result.similarity > 0.7
                    ? 'text-green-400'
                    : result.similarity > 0.4
                      ? 'text-k-yellow'
                      : 'text-muted-foreground',
                )}
              >
                {(result.similarity * 100).toFixed(0)}%
              </div>
              <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    result.similarity > 0.7
                      ? 'bg-green-400'
                      : result.similarity > 0.4
                        ? 'bg-k-yellow'
                        : 'bg-muted-foreground',
                  )}
                  style={{ width: `${result.similarity * 100}%` }}
                />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
