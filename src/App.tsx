import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { LoginScreen } from './screens/LoginScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { CasesScreen } from './screens/CasesScreen'
import { IntimationsScreen } from './screens/IntimationsScreen'
import { ComplianceScreen } from './screens/ComplianceScreen'
import { seedMockData } from './mocks/data'

function App() {
  useEffect(() => {
    // Seed mock data in development mode
    if (import.meta.env.DEV) {
      const enableMockData = localStorage.getItem('ENABLE_MOCK_DATA') !== 'false'
      if (enableMockData) {
        seedMockData()
      }
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <WebSocketProvider>
            <Routes>
              <Route path="/login" element={<LoginScreen />} />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardScreen />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/cases"
                element={
                  <ProtectedRoute>
                    <CasesScreen />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/intimations"
                element={
                  <ProtectedRoute>
                    <IntimationsScreen />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/compliance"
                element={
                  <ProtectedRoute>
                    <ComplianceScreen />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </WebSocketProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
