import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import './index.css'
import { isConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { DataProvider } from './lib/data'
import { Layout, ShellSkeleton } from './components/Layout'
import { ToastHost } from './components/ui'
import { DialogHost } from './components/dialogs'
import { TooltipHost } from './components/Tooltip'
import { FileViewerHost } from './components/FileViewer'
import { PlanHost } from './components/Workspace'
import { Login, NewPassword, NotConfigured, Offline } from './pages/Login'
import { JoinInvite, Onboarding, WsPending } from './pages/Workspaces'
import { readInvite, saveInvite } from './lib/invite'
import { Dashboard } from './pages/Dashboard'
import { Bloggers } from './pages/Bloggers'
import { Integrations } from './pages/Integrations'
import { Campaigns } from './pages/Campaigns'
import { CampaignPage } from './pages/Campaign'
import { Tasks } from './pages/Tasks'
import { Calendar } from './pages/Calendar'
import { Documents } from './pages/Documents'
import { Finance } from './pages/Finance'
import { Team } from './pages/Team'
import { Share } from './pages/Share'
import { OfferGone } from './pages/Login'
import { Profile } from './pages/Profile'
import { Settings, SettingsModal } from './pages/Settings'
import { useSettingsBackground } from './lib/settingsNav'

/** /join/?t=… — запоминаем приглашение и идём на главную: там вход, регистрация или сразу кнопка «Присоединиться» */
function JoinRoute() {
  const [params] = useSearchParams()
  const t = params.get('t')
  // до перехода: главная сразу прочитает приглашение
  if (t) saveInvite(t)
  return <Navigate to="/" replace />
}

function Gate() {
  const { session, profile, profileError, loading, isAdmin, recovery, endRecovery, workspace } = useAuth()
  const [invite, setInvite] = useState(readInvite)
  const loc = useLocation()
  // настройки на компьютере - окном: под ним остаётся страница, с которой их открыли
  const bg = useSettingsBackground()
  // пока проверяем вход, показываем каркас кабинета, а не крутилку: страница не «прыгает», когда всё загрузится
  if (loading) return session ? <ShellSkeleton /> : null
  if (!session) return <Login />
  if (recovery) return <NewPassword onDone={endRecovery} />
  if (!profile && profileError) return <Offline reason={profileError} />
  if (!profile) return <Offline reason={profileError ?? 'Профиль не найден'} />
  if (invite) return <JoinInvite token={invite} onSkip={() => setInvite(null)} />
  if (!workspace) return <Onboarding />
  if (!profile.is_active) return <WsPending />
  return (
    <DataProvider>
      <Routes location={bg ?? loc}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="bloggers" element={<Bloggers />} />
          <Route path="bloggers/:id" element={<Bloggers />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/:id" element={<CampaignPage />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="tasks/:id" element={<Tasks />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="documents" element={<Documents />} />
          {isAdmin && <Route path="finance" element={<Finance />} />}
          <Route path="team" element={<Team />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:section" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {bg && <SettingsModal />}
    </DataProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          {/* страницы для клиента: без входа, по ссылке */}
          <Route path="/s/:token" element={<Share />} />
          <Route path="/o/:token" element={<OfferGone />} />
          <Route path="/s" element={<Share />} />
          <Route path="/o" element={<OfferGone />} />
          <Route path="/join" element={<JoinRoute />} />
          <Route
            path="*"
            element={
              <AuthProvider>
                <Gate />
              </AuthProvider>
            }
          />
        </Routes>
        <ToastHost />
        <DialogHost />
        <TooltipHost />
        <FileViewerHost />
        <PlanHost />
      </BrowserRouter>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
)
