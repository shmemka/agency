import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { isConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { DataProvider } from './lib/data'
import { ToastHost } from './lib/toast'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { Login, NotConfigured, Pending } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Bloggers } from './pages/Bloggers'
import { Integrations } from './pages/Integrations'
import { Campaigns } from './pages/Campaigns'
import { Documents } from './pages/Documents'
import { Team } from './pages/Team'

function Gate() {
  const { session, profile, loading } = useAuth()
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
          <Route path="documents" element={<Documents />} />
          <Route path="team" element={<Team />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <Gate />
          <ToastHost />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
)
