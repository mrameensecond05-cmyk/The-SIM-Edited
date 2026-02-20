
import React, { useState, useEffect } from 'react';
import { AppTab, SMSAlert, MonitoredNumber, AuthState } from './types';
import { Dashboard } from './components/Dashboard';
import { AlertsView } from './components/AlertsView';
import { ForensicsView } from './components/ForensicsView';
import { SettingsView } from './components/SettingsView';
import { ProfileView } from './components/ProfileView';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { UserManagementView } from './components/admin/UserManagementView';
import { IncidentLogView } from './components/admin/IncidentLogView';
import { GlobalAlertsView } from './components/admin/GlobalAlertsView';
import { UserService } from './services/userService';

const INITIAL_SIMS: MonitoredNumber[] = [
  {
    id: 'primary',
    phoneNumber: '+91 98765 43210',
    isVerified: true,
    isAadhaarVerified: true,
    aadhaarLastFour: '4582',
    carrier: 'Airtel Digital',
    status: 'active',
    simType: 'PRIMARY'
  }
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [alerts, setAlerts] = useState<SMSAlert[]>([]);
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    view: 'LOGIN',
    user: undefined
  });
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch alerts when logged in
  useEffect(() => {
    if (auth.isAuthenticated) {
      UserService.getAlerts()
        .then(data => setAlerts(data))
        .catch(() => { });
    }
  }, [auth.isAuthenticated]);

  const switchView = (view: 'LOGIN' | 'REGISTER') => {
    setAuth({ ...auth, view });
    setErrorMsg(null);
    setSuccessMsg(null);
    setFormData({ name: '', email: '', phone: '', password: '' });
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (auth.view === 'LOGIN') {
        const data = await UserService.login({ email: formData.email, password: formData.password });
        if (data.success && data.user) {
          setAuth({
            isAuthenticated: true,
            view: 'LOGIN',
            user: { ...data.user, role: data.user.role || 'USER', monitoredNumbers: INITIAL_SIMS }
          });
        }
      } else {
        if (!formData.name) throw new Error('Name is required');
        if (formData.password.length < 6) throw new Error('Password must be at least 6 characters');
        await UserService.register({ name: formData.name, email: formData.email, phone: formData.phone, password: formData.password });
        setSuccessMsg('Registration successful! Please login.');
        switchView('LOGIN');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNumber = (newNumber: MonitoredNumber) => {
    if (auth.user) {
      setAuth({ ...auth, user: { ...auth.user, monitoredNumbers: [...auth.user.monitoredNumbers, newNumber] } });
    }
  };

  const handleLogout = () => {
    setAuth({ isAuthenticated: false, view: 'LOGIN', user: undefined });
    setFormData({ name: '', email: '', phone: '', password: '' });
  };

  // --- LOGIN / REGISTER SCREEN ---
  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f3edf7] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="text-center">
            <div className="w-16 h-16 bg-[#6750a4] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#1d1b20]">SIMtinel</h1>
            <p className="text-gray-500 text-sm mt-1">SIM Fraud Detection System</p>
          </div>

          {/* Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-5 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => switchView('LOGIN')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${auth.view === 'LOGIN' ? 'bg-white text-[#6750a4] shadow-sm' : 'text-gray-500'}`}
              >
                Login
              </button>
              <button
                onClick={() => switchView('REGISTER')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${auth.view === 'REGISTER' ? 'bg-white text-[#6750a4] shadow-sm' : 'text-gray-500'}`}
              >
                Register
              </button>
            </div>

            {/* Messages */}
            {successMsg && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-xl text-sm text-center">{successMsg}</div>}
            {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm text-center">{errorMsg}</div>}

            {/* Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {auth.view === 'REGISTER' && (
                <>
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-[#6750a4] text-sm"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number (optional)"
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-[#6750a4] text-sm"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </>
              )}
              <input
                type="email"
                placeholder="Email Address"
                required
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-[#6750a4] text-sm"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
              <input
                type="password"
                placeholder="Password"
                required
                className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-[#6750a4] text-sm"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
              <button
                disabled={loading}
                className="w-full py-3 bg-[#6750a4] text-white rounded-xl font-semibold shadow active:scale-95 transition-transform disabled:opacity-60 mt-1"
              >
                {loading ? 'Please wait...' : auth.view === 'LOGIN' ? 'Login' : 'Create Account'}
              </button>
            </form>

            {/* APK Download */}
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <a href="/api/download/simtinel.apk" download className="text-xs text-[#6750a4] font-medium flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download Android App
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  const renderContent = () => {
    if (!auth.user) return null;

    if (auth.user.role === 'ADMIN') {
      switch (activeTab) {
        case 'dashboard': return <AdminDashboard />;
        case 'users': return <UserManagementView />;
        case 'alerts': return <GlobalAlertsView />;
        case 'incidents': return <IncidentLogView />;
        case 'profile': return <ProfileView user={auth.user} onAddNumber={handleAddNumber} onLogout={handleLogout} />;
        default: return <AdminDashboard />;
      }
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'alerts': return <AlertsView alerts={alerts} />;
      case 'forensics': return <ForensicsView />;
      case 'settings': return <SettingsView />;
      case 'profile': return <ProfileView user={auth.user} onAddNumber={handleAddNumber} onLogout={handleLogout} />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f9fc]">
      <main className="flex-1 overflow-y-auto pb-20">
        {renderContent()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around px-2 z-40">
        {auth.user?.role === 'ADMIN' ? (
          <>
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Admin" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>} />
            <NavButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} label="Users" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>} />
            <NavButton active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} label="Feed" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>} />
            <NavButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} label="Logs" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>} />
            <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label="Profile" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>} />
          </>
        ) : (
          <>
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} label="Home" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>} />
            <NavButton active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} label="Alerts" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>} />
            <NavButton active={activeTab === 'forensics'} onClick={() => setActiveTab('forensics')} label="SIM" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-8L4 8v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 16H7v-2h10v2zm0-4H7v-2h10v2zm-4-4H7V8h6v2z" /></svg>} />
            <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label="Profile" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>} />
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Guard" icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>} />
          </>
        )}
      </nav>
    </div>
  );
};

interface NavBtnProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}

const NavButton: React.FC<NavBtnProps> = ({ active, onClick, label, icon }) => (
  <button onClick={onClick} className="flex flex-col items-center justify-center gap-0.5 group px-2">
    <div className={`p-1.5 rounded-full transition-all ${active ? 'bg-[#e8def8] text-[#6750a4]' : 'text-gray-400'}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-semibold uppercase tracking-wide ${active ? 'text-[#6750a4]' : 'text-gray-400'}`}>
      {label}
    </span>
  </button>
);

export default App;
