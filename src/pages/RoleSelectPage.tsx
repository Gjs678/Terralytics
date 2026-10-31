import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Monitor, Smartphone, Users } from 'lucide-react';
import { BrandLockup } from '../components/shared/Brand';
import { useDocumentTitle } from '../utils/useDocumentTitle';

const cardClass =
  'group flex flex-col rounded-lg border border-monsoon-800 bg-monsoon-900 p-6 transition-colors hover:border-moss-500/70 hover:bg-monsoon-800/70';

export const RoleSelectPage: React.FC = () => {
  useDocumentTitle();

  return (
    <div className="min-h-dvh flex flex-col bg-monsoon-950 bg-survey-grid text-monsoon-50 scheme-dark">
      <header className="border-b border-monsoon-800">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
          <BrandLockup size={34} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14 md:py-20 animate-fade-in">
        <section className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss-400">
            Disaster-response GIS platform
          </p>
          <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight md:text-5xl">TERRALYTICS</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-monsoon-300">
            A scalable AI-based software platform integrated with GIS and real-time analytics, featuring an AI-powered route prediction and optimization engine.
          </p>
        </section>

        <section aria-labelledby="workspace-heading" className="mt-14">
          <h2 id="workspace-heading" className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-monsoon-400">
            Choose your workspace
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link to="/login?role=control-room" className={cardClass}>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-monsoon-700 bg-monsoon-950 text-moss-400">
                  <Monitor size={22} />
                </span>
                <ArrowRight size={18} className="text-monsoon-500 transition group-hover:translate-x-0.5 group-hover:text-moss-400" />
              </div>
              <h3 className="mt-5 font-heading text-lg font-semibold">Control Room</h3>
              <p className="mt-2 text-sm leading-relaxed text-monsoon-300">
                Monitor the NER road network, fleet status, and active risk zones from the dispatcher view.
              </p>
            </Link>

            <Link to="/login?role=drivers" className={cardClass}>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-monsoon-700 bg-monsoon-950 text-moss-400">
                  <Smartphone size={22} />
                </span>
                <ArrowRight size={18} className="text-monsoon-500 transition group-hover:translate-x-0.5 group-hover:text-moss-400" />
              </div>
              <h3 className="mt-5 font-heading text-lg font-semibold">Drivers</h3>
              <p className="mt-2 text-sm leading-relaxed text-monsoon-300">
                Offline-aware mobile interface for drivers receiving dynamic routes and alerts.
              </p>
            </Link>

            <Link to="/community-report" className={cardClass}>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-monsoon-700 bg-monsoon-950 text-moss-400">
                  <Users size={22} />
                </span>
                <ArrowRight size={18} className="text-monsoon-500 transition group-hover:translate-x-0.5 group-hover:text-moss-400" />
              </div>
              <h3 className="mt-5 font-heading text-lg font-semibold">Locals</h3>
              <p className="mt-2 text-sm leading-relaxed text-monsoon-300">
                Report nearby disasters to alert drivers and control room immediately without logging in.
              </p>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-monsoon-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 text-xs text-monsoon-400">
          <span>TERRALYTICS</span>
          <span>Safe · Connected · Resilient</span>
        </div>
      </footer>
    </div>
  );
};
