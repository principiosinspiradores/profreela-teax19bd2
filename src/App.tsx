import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import { AuthProvider, useAuth } from '@/hooks/use-auth'
import Layout from './components/Layout'
import Index from './pages/Index'
import NotFound from './pages/NotFound'

import ProDashboard from './pages/pro/Dashboard'
import ProEarnings from './pages/pro/Earnings'
import ProActiveJob from './pages/pro/ActiveJob'
import ProSettings from './pages/pro/Settings'

import ClientDashboard from './pages/client/Dashboard'
import ClientRequest from './pages/client/RequestService'
import ClientHistory from './pages/client/History'
import ClientLocations from './pages/client/Locations'

import AdminDashboard from './pages/admin/Dashboard'
import AdminSettings from './pages/admin/Settings'
import AdminUsers from './pages/admin/Users'
import AdminDocuments from './pages/admin/Documents'
import AdminPricing from './pages/admin/Pricing'
import AdminReviews from './pages/admin/Reviews'
import Chat from './pages/Chat'
import TermsOfService from './pages/legal/TermsOfService'
import PrivacyPolicy from './pages/legal/PrivacyPolicy'

/**
 * Route guard: only allows authenticated users with one of `allowedRoles`.
 * Visitors (guests) are sent to the landing page; authenticated users with a
 * different role are redirected to their own dashboard. This enforces role-based
 * access to /admin, /pro and /client at the routing layer.
 */
function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: string[]
  children: ReactNode
}) {
  const { role, loading } = useAuth()
  if (loading) return <div className="p-8 text-muted-foreground">Carregando...</div>
  if (role === 'guest') return <Navigate to="/" replace />
  if (!allowedRoles.includes(role)) {
    if (role === 'client') return <Navigate to="/client" replace />
    if (role === 'pro') return <Navigate to="/pro" replace />
    if (role === 'admin') return <Navigate to="/admin" replace />
    return <Navigate to="/" replace />
  }
  return children
}

const AppRoutes = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<Index />} />

      {/* Pro Routes */}
      <Route
        path="/pro"
        element={
          <ProtectedRoute allowedRoles={['pro']}>
            <ProDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pro/earnings"
        element={
          <ProtectedRoute allowedRoles={['pro']}>
            <ProEarnings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pro/job/:id"
        element={
          <ProtectedRoute allowedRoles={['pro']}>
            <ProActiveJob />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pro/settings"
        element={
          <ProtectedRoute allowedRoles={['pro']}>
            <ProSettings />
          </ProtectedRoute>
        }
      />

      {/* Client Routes */}
      <Route
        path="/client"
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/request"
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientRequest />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/history"
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/client/locations"
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientLocations />
          </ProtectedRoute>
        }
      />

      {/* Chat Route */}
      <Route
        path="/chat/:jobId"
        element={
          <ProtectedRoute allowedRoles={['client', 'pro']}>
            <Chat />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/documentos"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDocuments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/pricing"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminPricing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reviews"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminReviews />
          </ProtectedRoute>
        }
      />
    </Route>

    {/* Public legal pages — no auth required, self-contained layout */}
    <Route path="/termos" element={<TermsOfService />} />
    <Route path="/privacidade" element={<PrivacyPolicy />} />

    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
