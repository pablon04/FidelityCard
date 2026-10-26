import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'

// Code splitting por ruta (ADR-003): la landing /c/:slug no arrastra el panel ni supabase-js.
const LandingPage = lazy(() => import('../features/landing/LandingPage.jsx'))
const EnrollPage = lazy(() => import('../features/enroll/EnrollPage.jsx'))
const PrivacyPage = lazy(() => import('../features/enroll/PrivacyPage.jsx'))
const PassPage = lazy(() => import('../features/pass/PassPage.jsx'))
const CardActionPage = lazy(() => import('../features/pass/CardActionPage.jsx'))
const AppRoot = lazy(() => import('../features/auth/AppRoot.jsx'))
const LoginPage = lazy(() => import('../features/auth/LoginPage.jsx'))
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage.jsx'))
const RequireAuth = lazy(() => import('../features/auth/RequireAuth.jsx'))
const DashboardPage = lazy(() => import('../features/panel/DashboardPage.jsx'))
const AccountPage = lazy(() => import('../features/account/AccountPage.jsx'))
const CardsPage = lazy(() => import('../features/card-config/CardsPage.jsx'))
const PanelLayout = lazy(() => import('../features/panel/PanelLayout.jsx'))
const OnboardingPage = lazy(() => import('../features/merchant/OnboardingPage.jsx'))
const CardConfigPage = lazy(() => import('../features/card-config/CardConfigPage.jsx'))
const ClientsPage = lazy(() => import('../features/clients/ClientsPage.jsx'))
const CustomerDetailPage = lazy(() => import('../features/clients/CustomerDetailPage.jsx'))
const PromotePage = lazy(() => import('../features/promote/PromotePage.jsx'))
const RequireAdmin = lazy(() => import('../features/admin/RequireAdmin.jsx'))
const AdminLayout = lazy(() => import('../features/admin/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard.jsx'))
const AdminMerchants = lazy(() => import('../features/admin/AdminMerchants.jsx'))
const AdminMerchantDetail = lazy(() => import('../features/admin/AdminMerchantDetail.jsx'))
const AdminRequests = lazy(() => import('../features/admin/AdminRequests.jsx'))
const SharePage = lazy(() => import('../features/share/SharePage.jsx'))

const lz = (el) => <Suspense fallback={null}>{el}</Suspense>

export const router = createBrowserRouter([
  { path: '/', element: lz(<LandingPage />) },
  { path: '/c/:slug', element: lz(<EnrollPage />) },
  { path: '/c/:slug/privacidad', element: lz(<PrivacyPage />) },
  { path: '/p/:token', element: lz(<PassPage />) },
  { path: '/v/:slug', element: lz(<CardActionPage />) },
  {
    path: '/app',
    element: lz(<AppRoot />),
    children: [
      { path: 'login', element: lz(<LoginPage />) },
      { path: 'recuperar', element: lz(<ForgotPasswordPage />) },
      {
        element: lz(<RequireAuth />),
        children: [
          { path: 'onboarding', element: lz(<OnboardingPage />) },
          {
            element: lz(<PanelLayout />),
            children: [
              { index: true, element: lz(<DashboardPage />) },
              { path: 'tarjetas', element: lz(<CardsPage />) },
              { path: 'cuenta', element: lz(<AccountPage />) },
              { path: 'tarjetas/nueva', element: lz(<CardConfigPage key="new" />) },
              { path: 'tarjetas/:id', element: lz(<CardConfigPage />) },
              { path: 'card', element: <Navigate to="/app/tarjetas" replace /> },
              { path: 'share', element: lz(<SharePage />) },
              { path: 'clientes', element: lz(<ClientsPage />) },
              { path: 'promocionar', element: lz(<PromotePage />) },
              { path: 'clientes/:id', element: lz(<CustomerDetailPage />) },
            ],
          },
        ],
      },
    ],
  },
  {
    // Solo equipo (platform_admins, SQL 0013). Comparte login y sesion con /app.
    path: '/admin',
    element: lz(<AppRoot />),
    children: [
      {
        element: lz(<RequireAdmin />),
        children: [
          {
            element: lz(<AdminLayout />),
            children: [
              { index: true, element: lz(<AdminDashboard />) },
              { path: 'comercios', element: lz(<AdminMerchants />) },
              { path: 'comercios/:id', element: lz(<AdminMerchantDetail />) },
              { path: 'solicitudes', element: lz(<AdminRequests />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/app/login" replace /> },
])
