import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RoleSelectPage } from './pages/RoleSelectPage';
import { ControlRoomShell } from './components/layout/ControlRoomShell';
import { FieldAppShell } from './components/layout/FieldAppShell';
import { ControlRoomDashboardPage } from './pages/ControlRoomDashboardPage';
import { ImpactReportPage } from './pages/ImpactReportPage';
import { DataSourcesSettingsPage } from './pages/DataSourcesSettingsPage';
import { FieldDriverPage } from './pages/FieldDriverPage';
import { RouteDetailPage } from './pages/RouteDetailPage';
import { AuthPage } from './pages/AuthPage';
import { CommunityReportPage } from './pages/CommunityReportPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RoleSelectPage />,
  },
  {
    path: '/login',
    element: <AuthPage />,
  },
  {
    path: '/community-report',
    element: <CommunityReportPage />,
  },
  {
    path: '/',
    element: <ControlRoomShell />,
    children: [
      {
        path: 'control-room',
        element: <ControlRoomDashboardPage />,
      },
      {
        path: 'impact',
        element: <ImpactReportPage />,
      },
      {
        path: 'data-sources',
        element: <DataSourcesSettingsPage />,
      },
      {
        path: 'route-detail',
        element: <RouteDetailPage />,
      },
    ],
  },
  {
    path: '/drivers',
    element: <FieldAppShell />,
    children: [
      {
        index: true,
        element: <FieldDriverPage />,
      }
    ],
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
