
import React, { useState } from 'react';
import { MonitoredNumber } from '../types';
import { UserService } from '../services/userService';

interface Props {
  user: {
    name: string;
    email: string;
    monitoredNumbers: MonitoredNumber[];
  };
  onAddNumber: (newNumber: MonitoredNumber) => void;
  onLogout: () => void;
}

export const ProfileView: React.FC<Props> = ({ user, onAddNumber, onLogout }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const primaryPhone = user.monitoredNumbers.find(n => n.simType === 'PRIMARY');

  const resetFlow = () => {
    setIsProcessing(false);
    setIsAdding(false);
    setPhone('');
  };

  return (
    <div className="p-6 space-y-8 pb-32 bg-[#f8f9fa]">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Profile</h1>
          <p className="text-gray-500 font-medium">Identity & SIM Management</p>
        </div>
        <button
          onClick={onLogout}
          className="p-3 text-red-500 bg-red-50 rounded-2xl active:scale-90 transition-transform"
          title="Sign Out"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        </button>
      </header>

      {/* Identity Trust Card */}
      <div className="bg-[#1c1b1f] rounded-[32px] p-6 shadow-xl relative overflow-hidden text-white">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{user.name}</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Identity Secured</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/5">
          <div className="text-[9px] font-black text-gray-500 uppercase mb-1">Primary Number</div>
          <div className="text-sm font-bold">{primaryPhone?.phoneNumber || 'Not Set'}</div>
        </div>
      </div>

      {/* Primary SIM Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-end px-2">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Your SIM</h3>
            <p className="text-xs text-gray-400">{primaryPhone ? 'Your primary number is active' : 'Add your primary number to get started'}</p>
          </div>
          {!primaryPhone && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-[#6750a4] text-white px-5 py-2.5 rounded-full text-xs font-bold active:scale-95 transition-transform shadow-lg shadow-indigo-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              SET NUMBER
            </button>
          )}
        </div>

        {primaryPhone ? (
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div className="font-black text-gray-900 text-lg leading-tight">{primaryPhone.phoneNumber}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-indigo-100 text-indigo-700">
                      PRIMARY
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Active</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Monitoring</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-[32px] border-2 border-dashed border-gray-200 text-center">
            <div className="text-gray-300 mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 font-medium">No primary number set</p>
            <p className="text-xs text-gray-300 mt-1">Add your phone number to enable fraud alerts</p>
          </div>
        )}
      </section>

      {/* Add Phone Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-0">
          <div className="bg-white rounded-t-[44px] w-full max-w-md p-8 shadow-2xl">
            <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mb-8"></div>

            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Set Primary Number</h2>
                <p className="text-xs text-gray-400 font-medium mt-0.5">This number will receive fraud alerts via SMS</p>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 p-5 rounded-[28px] border-2 border-transparent focus-within:border-[#6750a4] transition-all group">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-focus-within:text-[#6750a4]">Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="XXXXX XXXXX"
                    className="w-full bg-transparent outline-none font-black text-2xl mt-2 tracking-tight"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                </div>

                <button
                  disabled={!phone || isProcessing}
                  onClick={() => {
                    setIsProcessing(true);
                    const newSIM: MonitoredNumber = {
                      id: Math.random().toString(36).substr(2, 9),
                      phoneNumber: phone,
                      isVerified: true,
                      isAadhaarVerified: false,
                      aadhaarLastFour: 'XXXX',
                      carrier: 'Unknown',
                      status: 'active',
                      simType: 'PRIMARY'
                    };
                    // Always persist as primary
                    UserService.setPrimaryPhone({
                      userId: (user as any).id || (user as any).profileId,
                      phone: phone
                    }).then(() => {
                      onAddNumber(newSIM);
                      resetFlow();
                    }).catch((err) => {
                      console.error('Failed to set primary phone:', err);
                      // Still add locally even if server fails
                      onAddNumber(newSIM);
                      resetFlow();
                    });
                  }}
                  className="w-full py-4 bg-[#6750a4] text-white rounded-full font-bold shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95 transition-transform flex items-center justify-center gap-3"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Setting up...</span>
                    </>
                  ) : 'Set Primary Number'}
                </button>
              </div>

              <button
                onClick={resetFlow}
                className="w-full py-2 text-gray-400 font-bold text-xs uppercase tracking-widest active:opacity-50 transition-opacity"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
