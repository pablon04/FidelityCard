import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

// Code splitting por ruta (ADR-003): la landing /c/:slug no arrastra el panel ni supabase-js.
const EnrollPage = lazy(() => import('../features/enroll/EnrollPage.jsx'))
const PrivacyPage = lazy(() => import('../features/enroll/PrivacyPage.jsx'))
const PassPage = lazy(() => import('../features/pass/PassPage.jsx'))
const CardActionPage = lazy(() => import('../features/pass/CardActionPage.jsx'))
const AppRoot = lazy(() => import('../features/auth/AppRoot.jsx'))
const LoginPage = lazy(() => import('../features/auth/LoginPage.jsx'))
const RequireAuth = lazy(() => import('../features/auth/RequireAuth.jsx'))
const PanelHome = lazy(() => import('../features/panel/PanelHome.jsx'))
const PanelLayout = lazy(() => import('../features/panel/PanelLayout.jsx'))
const OnboardingPage = lazy(() => import('../features/merchant/OnboardingPage.jsx'))
const CardConfigPage = lazy(() => import('../features/card-config/CardConfigPage.jsx'))
const ClientsPage = lazy(() => import('../features/clients/ClientsPage.jsx'))
const CustomerDetailPage = lazy(() => import('../features/clients/CustomerDetailPage.jsx'))
const SharePage = lazy(() => import('../features/share/SharePage.jsx'))

const lz = (el) => <Suspense fallback={null}>{el}</Suspense>

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app/login" replace /> },
  { path: '/c/:slug', element: lz(<EnrollPage />) },
  { path: '/c/:slug/privacidad', element: lz(<PrivacyPage />) },
  { path: '/p/:token', element: lz(<PassPage />) },
  { path: '/v/:slug', element: lz(<CardActionPage />) },
  {
    path: '/app',
    element: lz(<AppRoot />),
    children: [
      { path: 'login', element: lz(<LoginPage />) },
      {
        element: lz(<RequireAuth />),
        children: [
          { index: true, element: lz(<PanelHome />) },
          { path: 'onboarding', element: lz(<OnboardingPage />) },
          {
            element: lz(<PanelLayout />),
            children: [
              { path: 'card', element: lz(<CardConfigPage />) },
              { path: 'share', element: lz(<SharePage />) },
              { path: 'clientes', element: lz(<ClientsPage />) },
              { path: 'clientes/:id', element: lz(<CustomerDetailPage />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/app/login" replace /> },
])
