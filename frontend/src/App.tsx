import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/toast'
import { AppLayout } from '@/components/app-layout'
import { ChatPage } from '@/components/chat/chat-page'
import { StudioPage } from '@/components/studio/studio-page'
import { HistoryPage } from '@/components/history/history-page'
import { ImagesPage } from '@/components/images/images-page'
import { MemoryPage } from '@/components/memory/memory-page'
import { SettingsPage } from '@/components/settings/settings-page'
import { ArchitecturePage } from '@/components/architecture/architecture-page'
import { DatabasePage } from '@/components/database/database-page'
import { ExperimentsPage } from '@/components/experiments/experiments-page'
import { DeveloperPage } from '@/components/developer/developer-page'

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<ChatPage />} />
            <Route path="studio" element={<StudioPage />} />
            <Route path="architecture" element={<ArchitecturePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="images" element={<ImagesPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="database" element={<DatabasePage />} />
            <Route path="experiments" element={<ExperimentsPage />} />
            <Route path="developer" element={<DeveloperPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
