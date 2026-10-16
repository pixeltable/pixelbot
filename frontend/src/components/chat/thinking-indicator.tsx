import { useState } from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'
import { Loader2 } from 'lucide-react'

const LABELS = {
  chat: 'Running the Pixeltable pipeline',
  image: 'Generating your image',
  flux: 'Generating your FLUX image',
  video: 'Generating your video',
  voice: 'Generating your speech',
}

export function ThinkingIndicator({ mode = 'chat' }: { mode?: keyof typeof LABELS }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useMountEffect(() => {
    const started = Date.now()
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(interval)
  })

  return (
    <div role="status" className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-k-yellow" />
      <span>{LABELS[mode]}…</span>
      <span aria-hidden="true" className="ml-auto font-mono text-xs tabular-nums">{elapsedSeconds}s</span>
    </div>
  )
}
