import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Dashboard } from './components/Dashboard';
import { Customers } from './components/Customers';
import { Transactions } from './components/Transactions';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { RecycleBin } from './components/RecycleBin';
import { AIAssistant } from './components/AIAssistant';
import { LayoutDashboard, Users, ArrowRightLeft, BarChart3, Settings as SettingsIcon, Fingerprint, Wallet, Loader2, Lock, Trash2, Bell, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { PinLock } from './components/PinLock';
import { reminderService } from './lib/ReminderService';

import { doc, getDoc } from 'firebase/firestore';
import { db } from './lib/firebase';

const MainApp = () => {
  const { user, profile, loading, error, signIn } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isUnlocked, setIsUnlocked] = useState(() => sessionStorage.getItem('app_unlocked') === 'true');
  const [alarmMessage, setAlarmMessage] = useState<string | null>(null);
  const [appPin, setAppPin] = useState('1313');
  const [configLoading, setConfigLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [shortcutEntry, setShortcutEntry] = useState<{ type: 'in' | 'out' } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ALT + I for Payment In
      if (e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShortcutEntry({ type: 'in' });
      }
      // ALT + O for Payment Out
      if (e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setShortcutEntry({ type: 'out' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handlePinSuccess = () => {
    setIsUnlocked(true);
    sessionStorage.setItem('app_unlocked', 'true');
  };

  useEffect(() => {
    const fetchSecurityConfig = async () => {
      if (user) {
        try {
          const secSnap = await getDoc(doc(db, 'settings', 'security'));
          if (secSnap.exists()) {
            const data = secSnap.data();
            if (data.pin) setAppPin(data.pin);
          }
        } catch (err) {
          console.error("Error fetching PIN config:", err);
        } finally {
          setConfigLoading(false);
        }
      } else {
        setConfigLoading(false);
      }
    };
    fetchSecurityConfig();
  }, [user]);

  useEffect(() => {
    if (user && isUnlocked) {
      reminderService.init();
      return reminderService.onAlarm((msg) => setAlarmMessage(msg));
    }
    return () => reminderService.stop();
  }, [user, isUnlocked]);

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-red-50 p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-red-100 max-w-sm space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <Fingerprint className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
          <p className="text-sm text-gray-500">
            {error.includes("insufficient permissions") 
              ? "Your account needs verification. Please ensure your email is verified and try again."
              : "An unexpected database error occurred."}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition"
          >
            Retry Login
          </button>
        </div>
      </div>
    );
  }

  if (loading || configLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-blue-100 rounded-full animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-blue-600 animate-bounce" />
          </div>
        </div>
        <p className="mt-4 text-gray-500 font-bold uppercase tracking-widest text-xs">CashFlow Manager</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen bg-gray-50 flex flex-col p-8 items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-8 text-center"
        >
          <div className="w-24 h-24 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-200 rotate-6 transform hover:rotate-0 transition-transform">
            <Wallet className="w-12 h-12 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">CashFlow</h1>
            <p className="text-gray-500 font-medium mt-2">Professional ledger management for your business team.</p>
          </div>
          
          <div className="pt-10">
            <button 
              onClick={signIn}
              className="w-full bg-white border border-gray-200 rounded-2xl py-4 flex items-center justify-center gap-3 shadow-xl hover:bg-gray-50 transition font-bold"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              Sign in with Google
            </button>
            <p className="text-[10px] text-gray-400 mt-6 uppercase tracking-wider font-bold">Secure employee login enabled</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!isUnlocked) {
    return <PinLock correctPin={appPin} onSuccess={handlePinSuccess} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'customers': return <Customers />;
      case 'transactions': return <Transactions />;
      case 'reports': return <Reports />;
      case 'bin': return <RecycleBin />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dash' },
    { id: 'customers', icon: Users, label: 'People' },
    { id: 'transactions', icon: ArrowRightLeft, label: 'Cash' },
    { id: 'reports', icon: BarChart3, label: 'Report' },
    { id: 'bin', icon: Trash2, label: 'Bin' },
    { id: 'settings', icon: SettingsIcon, label: 'Setup' },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden max-w-lg mx-auto border-x border-gray-100">
      {/* Top Header */}
      <header className="bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-100">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 tracking-tight">CashFlow</span>
        </div>
        <div className="flex items-center gap-3">
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="p-2 bg-blue-50 text-blue-600 rounded-lg animate-pulse flex items-center gap-1"
            >
              <Download className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Install</span>
            </button>
          )}
          <div className="text-right flex flex-col items-end">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter leading-none">Status</p>
            <div className="flex items-center gap-1">
              <div className={cn("w-1 h-1 rounded-full animate-pulse", isOnline ? "bg-emerald-500" : "bg-red-500")} />
              <p className={cn("text-[10px] font-black uppercase", isOnline ? "text-emerald-500" : "text-red-500")}>
                {isOnline ? 'Live Sync' : 'Offline Mode'}
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden border border-gray-200">
            {profile?.photoURL ? (
              <img referrerPolicy="no-referrer" src={profile.photoURL} alt="Avatar" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">
                {profile?.displayName?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* AI Assistant Button */}
      <AIAssistant />

      {/* Bottom Navigation */}
      <nav className="bg-white/90 backdrop-blur-lg border-t border-gray-100 flex items-center justify-around py-3 px-4 pb-8 sm:pb-4 sticky bottom-0 z-40">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 relative",
              activeTab === item.id ? "text-blue-600 scale-110" : "text-gray-400"
            )}
          >
            <item.icon className={cn(
              "w-6 h-6",
              activeTab === item.id ? "fill-blue-50 stroke-blue-600" : ""
            )} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="nav-indicator"
                className="absolute -top-1 w-1 h-1 bg-blue-600 rounded-full"
              />
            )}
          </button>
        ))}
      </nav>

      {/* Alarm Modal */}
      <AnimatePresence>
        {shortcutEntry && (
          <Transactions 
            initialTransaction={shortcutEntry}
            onComplete={() => setShortcutEntry(null)}
          />
        )}
        {alarmMessage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-8 text-center space-y-6 shadow-2xl border border-orange-100"
            >
              <div className="w-20 h-20 bg-orange-100 mx-auto rounded-full flex items-center justify-center text-orange-600 animate-bounce">
                <Bell className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">ALARM REMINDER</h3>
                <p className="text-gray-500 font-medium leading-relaxed">
                  {alarmMessage}
                </p>
              </div>
              <button 
                onClick={() => setAlarmMessage(null)}
                className="w-full bg-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-700 transition active:scale-95"
              >
                Okay, I'm on it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
