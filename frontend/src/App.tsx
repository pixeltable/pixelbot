import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/toast'
import { AppLayout } from '@/components/app-layout'

const ChatPage = lazy(() => import('@/components/chat/chat-page').then((module) => ({ default: module.ChatPage })))
const StudioPage = lazy(() => import('@/components/studio/studio-page').then((module) => ({ default: module.StudioPage })))
const HistoryPage = lazy(() => import('@/components/history/history-page').then((module) => ({ default: module.HistoryPage })))
const ImagesPage = lazy(() => import('@/components/images/images-page').then((module) => ({ default: module.ImagesPage })))
const MemoryPage = lazy(() => import('@/components/memory/memory-page').then((module) => ({ default: module.MemoryPage })))
const SettingsPage = lazy(() => import('@/components/settings/settings-page').then((module) => ({ default: module.SettingsPage })))
const ArchitecturePage = lazy(() => import('@/components/architecture/architecture-page').then((module) => ({ default: module.ArchitecturePage })))
const DatabasePage = lazy(() => import('@/components/database/database-page').then((module) => ({ default: module.DatabasePage })))
const ExperimentsPage = lazy(() => import('@/components/experiments/experiments-page').then((module) => ({ default: module.ExperimentsPage })))
const DeveloperPage = lazy(() => import('@/components/developer/developer-page').then((module) => ({ default: module.DeveloperPage })))
const IntegrationsPage = lazy(() => import('@/components/integrations/integrations-page').then((module) => ({ default: module.IntegrationsPage })))

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
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
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  )
}
