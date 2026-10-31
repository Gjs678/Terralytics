import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, User, Monitor, Smartphone } from 'lucide-react';
import { BrandMark } from '../components/shared/Brand';
import { useDocumentTitle } from '../utils/useDocumentTitle';

const inputClass =
  'w-full pl-11 pr-4 py-3 bg-monsoon-950 border border-monsoon-700 rounded-md focus:ring-2 focus:ring-moss-400/60 focus:border-moss-400 text-monsoon-50 placeholder-monsoon-500 transition-colors outline-none';
const labelClass = 'block text-sm font-medium text-monsoon-200 mb-1.5';

export const AuthPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = searchParams.get('role'); // 'control-room' or 'drivers'
  const [isLogin, setIsLogin] = useState(true);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const isControlRoom = role === 'control-room';
  const roleTitle = isControlRoom ? 'Control Room' : 'Drivers';
  const RoleIcon = isControlRoom ? Monitor : Smartphone;
  const destinationRoute = isControlRoom ? '/control-room' : '/drivers';

  useDocumentTitle(isLogin ? `Sign in · ${roleTitle}` : `Register · ${roleTitle}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate auth success
    navigate(destinationRoute);
  };

  return (
    <div className="min-h-dvh bg-monsoon-950 bg-survey-grid flex flex-col text-monsoon-50 scheme-dark">
      <header className="border-b border-monsoon-800">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
          <Link
            to="/"
            className="flex items-center text-sm font-medium text-monsoon-300 hover:text-white transition-colors group"
          >
            <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <BrandMark size={48} />
            </div>
            <h1 className="font-heading text-2xl font-semibold uppercase tracking-[0.16em] mb-2">TERRALYTICS</h1>
            <p className="text-monsoon-300 flex items-center justify-center gap-2 text-sm">
              <RoleIcon size={16} className="text-moss-400" />
              {roleTitle} Portal
            </p>
          </div>

          <div className="bg-monsoon-900 border border-monsoon-800 rounded-lg p-6 sm:p-8">
            <div className="flex mb-6 bg-monsoon-950 rounded-md p-1 border border-monsoon-800">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                aria-pressed={isLogin}
                className={`flex-1 py-2 text-sm font-semibold rounded transition-colors ${isLogin ? 'bg-monsoon-800 text-white' : 'text-monsoon-400 hover:text-monsoon-200'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                aria-pressed={!isLogin}
                className={`flex-1 py-2 text-sm font-semibold rounded transition-colors ${!isLogin ? 'bg-monsoon-800 text-white' : 'text-monsoon-400 hover:text-monsoon-200'}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div>
                  <label htmlFor="auth-name" className={labelClass}>Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User size={18} className="text-monsoon-400" />
                    </div>
                    <input
                      id="auth-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className={labelClass}>Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail size={18} className="text-monsoon-400" />
                  </div>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className={labelClass}>Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock size={18} className="text-monsoon-400" />
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button type="button" className="text-sm text-moss-400 hover:text-moss-300 transition-colors">
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-moss-600 hover:bg-moss-500 text-white font-semibold py-3 rounded-md transition-colors mt-2"
              >
                {isLogin ? 'Sign In to Dashboard' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
