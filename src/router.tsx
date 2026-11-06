import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ControlRoomShell } from './components/layout/ControlRoomShell';
import { FieldAppShell } from './components/layout/FieldAppShell';

const RoleSelectPage = lazy(() => import('./pages/RoleSelectPage').then((m) => ({ default: m.RoleSelectPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const CommunityReportPage = lazy(() => import('./pages/CommunityReportPage').then((m) => ({ default: m.CommunityReportPage })));
const ControlRoomDashboardPage = lazy(() => import('./pages/ControlRoomDashboardPage').then((m) => ({ default: m.ControlRoomDashboardPage })));
const ImpactReportPage = lazy(() => import('./pages/ImpactReportPage').then((m) => ({ default: m.ImpactReportPage })));
const DataSourcesSettingsPage = lazy(() => import('./pages/DataSourcesSettingsPage').then((m) => ({ default: m.DataSourcesSettingsPage })));
const FieldDriverPage = lazy(() => import('./pages/FieldDriverPage').then((m) => ({ default: m.FieldDriverPage })));
const RouteDetailPage = lazy(() => import('./pages/RouteDetailPage').then((m) => ({ default: m.RouteDetailPage })));

const RouteLoadingFallback = () => (
  <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-monsoon-950 text-monsoon-300">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-monsoon-700 border-t-moss-400" />
  </div>
);

const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<RouteLoadingFallback />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(RoleSelectPage),
  },
  {
    path: '/login',
    element: withSuspense(AuthPage),
  },
  {
    path: '/community-report',
    element: withSuspense(CommunityReportPage),
  },
  {
    path: '/',
    element: <ControlRoomShell />,
    children: [
      {
        path: 'control-room',
        element: withSuspense(ControlRoomDashboardPage),
      },
      {
        path: 'impact',
        element: withSuspense(ImpactReportPage),
      },
      {
        path: 'data-sources',
        element: withSuspense(DataSourcesSettingsPage),
      },
      {
        path: 'route-detail',
        element: withSuspense(RouteDetailPage),
      },
    ],
  },
  {
    path: '/drivers',
    element: <FieldAppShell />,
    children: [
      {
        index: true,
        element: withSuspense(FieldDriverPage),
      }
    ],
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
