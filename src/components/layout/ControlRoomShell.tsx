import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Map, BarChart2, Database, Settings, House, Monitor, Smartphone } from 'lucide-react';
import { BrandLockup, BrandMark } from '../shared/Brand';
import { useDocumentTitle } from '../../utils/useDocumentTitle';

export const ControlRoomShell: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/control-room', icon: <Map size={20} />, label: 'Dashboard' },
    { path: '/impact', icon: <BarChart2 size={20} />, label: 'Impact Report' },
    { path: '/data-sources', icon: <Database size={20} />, label: 'Data Sources' },
  ];

  // /route-detail is opened from the fleet list, so it belongs to the Dashboard section.
  const isItemActive = (path: string) =>
    location.pathname === path || (path === '/control-room' && location.pathname === '/route-detail');

  const currentLabel =
    navItems.find((item) => location.pathname === item.path)?.label ??
    (location.pathname === '/route-detail' ? 'Route Investigation' : 'Control Room');

  useDocumentTitle(`${currentLabel} · Control Room`);

  return (
    <div className="flex h-dvh bg-monsoon-950 text-monsoon-50 overflow-hidden scheme-dark">
      {/* Sidebar: icon rail on small screens, labelled on wide screens */}
      <aside className="w-14 sm:w-16 xl:w-56 bg-monsoon-900 border-r border-monsoon-800 flex flex-col shrink-0">
        <div className="h-14 shrink-0 flex items-center justify-center xl:justify-start xl:px-4 border-b border-monsoon-800">
          <Link
            to="/"
            aria-label="TERRALYTICS home"
            title="TERRALYTICS home"
            className="rounded-md hover:opacity-90 transition-opacity"
          >
            <span className="xl:hidden">
              <BrandMark size={30} />
            </span>
            <span className="hidden xl:inline-flex">
              <BrandLockup size={30} />
            </span>
          </Link>
        </div>

        <nav aria-label="Control room sections" className="flex flex-col gap-1 p-2 xl:p-3">
          {navItems.map((item) => {
            const isActive = isItemActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center justify-center xl:justify-start gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-monsoon-800 text-white shadow-[inset_2px_0_0_var(--color-moss-400)]'
                    : 'text-monsoon-300 hover:bg-monsoon-800/60 hover:text-white'
                }`}
                title={item.label}
              >
                <span className={isActive ? 'text-moss-400' : ''}>{item.icon}</span>
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-2 xl:p-3 border-t border-monsoon-800">
          {/* Settings has no destination in the current app, so it is shown as unavailable rather than as a dead button. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full flex items-center justify-center xl:justify-start gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium text-monsoon-500 cursor-not-allowed"
            title="Settings (not available yet)"
          >
            <Settings size={20} />
            <span className="hidden xl:inline">Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-14 bg-monsoon-900 border-b border-monsoon-800 flex items-center justify-between gap-3 px-3 sm:px-6 shrink-0 z-10">
          <h1 className="font-heading text-base font-semibold tracking-tight min-w-0 truncate">
            <span className="hidden sm:inline text-monsoon-400 font-normal">NER Control Room</span>
            <span className="hidden sm:inline mx-2 text-monsoon-600" aria-hidden="true">/</span>
            <span>{currentLabel}</span>
          </h1>

          <nav aria-label="Switch view" className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-md border border-monsoon-700 bg-monsoon-900 px-2.5 py-1.5 text-sm font-medium text-monsoon-200 hover:bg-monsoon-800 hover:text-white transition-colors"
              aria-label="Home"
              title="Back to the TERRALYTICS home page"
            >
              <House size={16} />
              <span className="hidden sm:inline">Home</span>
            </Link>

            <div className="flex items-center rounded-md border border-monsoon-700 bg-monsoon-950 p-0.5 text-sm font-medium">
              <span
                aria-current="page"
                className="flex items-center gap-2 rounded px-2.5 py-1 bg-monsoon-800 text-white"
                title="You are in the Control Room view"
              >
                <Monitor size={16} className="text-moss-400" />
                <span className="hidden md:inline">Control Room</span>
                <span className="sr-only md:hidden">Control Room (current view)</span>
              </span>
              <Link
                to="/drivers"
                className="flex items-center gap-2 rounded px-2.5 py-1 text-monsoon-300 hover:text-white hover:bg-monsoon-800/60 transition-colors"
                aria-label="Switch to Driver view"
                title="Switch to Driver view"
              >
                <Smartphone size={16} />
                <span className="hidden md:inline">Driver View</span>
              </Link>
            </div>
          </nav>
        </header>
        <div className="flex-1 overflow-auto bg-monsoon-950 custom-scrollbar">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
