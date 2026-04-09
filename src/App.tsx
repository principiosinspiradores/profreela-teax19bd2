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

import ClientDashboard from './pages/client/Dashboard'
import ClientRequest from './pages/client/RequestService'
import ClientHistory from './pages/client/History'

import AdminDashboard from './pages/admin/Dashboard'

// Simple route guard component
function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: string[]
  children: JSX.Element
}) {
  const { role, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />
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

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
)

const App = () => (
  <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
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
