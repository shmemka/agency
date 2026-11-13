import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { isConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { DataProvider } from './lib/data'
import { Layout } from './components/Layout'
import { Spinner, ToastHost } from './components/ui'
import { DialogHost } from './components/dialogs'
import { TooltipHost } from './components/Tooltip'
import { Login, NotConfigured, Pending } from './pages/Login'
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
import { OfferPage } from './pages/Offer'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'

function Gate() {
  const { session, profile, loading, isAdmin } = useAuth()
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  if (!session) return <Login />
  if (!profile?.is_active) return <Pending />
  return (
    <DataProvider>
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
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
          <Route path="/o/:token" element={<OfferPage />} />
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
      </BrowserRouter>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
)
