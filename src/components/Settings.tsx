import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  User, 
  Shield, 
  Moon, 
  Bell, 
  Database, 
  LogOut, 
  HelpCircle,
  Smartphone,
  ChevronRight,
  Sun,
  MessageCircle,
  Save,
  Loader2,
  Clock,
  Share2,
  FileText,
  UserPlus,
  Users as UsersIcon,
  Trash2,
  Download,
  Copy,
  Check,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc, query, orderBy } from 'firebase/firestore';
import { reminderService } from '../lib/ReminderService';
import { handleFirestoreError } from '../lib/firebaseErrors';

import { PinModal } from './PinModal';

export const Settings: React.FC = () => {
  const { profile, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [pinLock, setPinLock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [authorizedUsers, setAuthorizedUsers] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [actionToExecute, setActionToExecute] = useState<(() => void) | null>(null);
  
  const [waConfig, setWaConfig] = useState({
    enabled: false,
    number: '',
    senderName: profile?.displayName || 'CashFlow App'
  });

  const [reminderConfig, setReminderConfig] = useState({
    enabled: false,
    time: '08:00',
    message: 'Time to record your daily cash flow entries!'
  });

  const [reportConfig, setReportConfig] = useState({
    autoEnabled: false,
    waNumber1: '',
    waNumber2: '',
    waNumber3: '',
    drivePath1: 'select1',
    drivePath2: 'select2',
    drivePath3: 'select3',
  });

  const [configLoading, setConfigLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [securityConfig, setSecurityConfig] = useState({
    pin: '1313',
    pinEnabled: true
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setGoogleConnected(true);
        setSaveSuccess("Google Drive connected!");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const resConn = await fetch('/api/auth/google/status');
        if (resConn.ok) {
          const { connected } = await resConn.json();
          setGoogleConnected(connected);
        }

        const waSnap = await getDoc(doc(db, 'settings', 'notifications'));
        if (waSnap.exists()) {
          //@ts-ignore
          setWaConfig(waSnap.data());
        }

        const reminderSnap = await getDoc(doc(db, 'settings', 'reminder'));
        if (reminderSnap.exists()) {
          //@ts-ignore
          setReminderConfig(reminderSnap.data());
        }

        const reportSnap = await getDoc(doc(db, 'settings', 'automated_reports'));
        if (reportSnap.exists()) {
          //@ts-ignore
          setReportConfig(reportSnap.data());
        }

        const securitySnap = await getDoc(doc(db, 'settings', 'security'));
        if (securitySnap.exists()) {
          //@ts-ignore
          setSecurityConfig(securitySnap.data());
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setConfigLoading(false);
      }
    };
    fetchSettings();

    const unsubUsers = onSnapshot(collection(db, 'authorized_users'), (snapshot) => {
      setAuthorizedUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubUsers();
  }, []);

  const saveWaSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'notifications'), waConfig);
      setSaveSuccess("WhatsApp settings saved!");
    } catch (error) {
      handleFirestoreError(error, 'write', 'settings/notifications');
    } finally {
      setSaving(false);
    }
  };

  const saveReminderSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'reminder'), reminderConfig);
      setSaveSuccess("Alarm settings saved!");
    } catch (error) {
      handleFirestoreError(error, 'write', 'settings/reminder');
    } finally {
      setSaving(false);
    }
  };

  const saveReportSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'automated_reports'), reportConfig);
      setSaveSuccess("Report settings saved!");
    } catch (error) {
      handleFirestoreError(error, 'write', 'settings/automated_reports');
    } finally {
      setSaving(false);
    }
  };

  const saveSecuritySettings = async () => {
    if (securityConfig.pin.length !== 4) {
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'security'), securityConfig);
      setSaveSuccess("PIN updated successfully!");
    } catch (error) {
      handleFirestoreError(error, 'write', 'settings/security');
    } finally {
      setSaving(false);
    }
  };

  const addAuthorizedUser = async () => {
    if (!newEmail || !newEmail.includes('@')) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'authorized_users', newEmail.toLowerCase().trim()), {
        email: newEmail.toLowerCase().trim(),
        role: 'staff',
        addedAt: new Date().toISOString(),
        addedBy: profile?.email
      });
      setNewEmail('');
      setSaveSuccess("New user authorized!");
    } catch (error) {
      handleFirestoreError(error, 'write', `authorized_users/${newEmail}`);
    } finally {
      setSaving(false);
    }
  };
  const removeUser = async (email: string) => {
    setActionToExecute(() => async () => {
      try {
        await deleteDoc(doc(db, 'authorized_users', email));
        setSaveSuccess("User access revoked.");
      } catch (error) {
        console.error("Remove user error:", error);
      }
    });
    setShowPinModal(true);
  };

  const handleConnectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      
      if (!response.ok) {
        alert(`${data.error}: ${data.details}\n\n1. Go to Google Cloud Console\n2. Create an OAuth 2.0 Client ID (Web Application)\n3. Add your App URL to 'Authorized JavaScript origins'\n4. Add your App URL + '/auth/callback' to 'Authorized redirect URIs'\n5. Copy the Client ID & Secret to App Secrets.`);
        return;
      }
      
      const authWindow = window.open(data.url, 'google_auth', 'width=600,height=700');
      if (!authWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site to connect Google Drive.");
      }
    } catch (error) {
      console.error("Auth URL error:", error);
      alert("Failed to connect to authentication server. Please check your internet connection.");
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <AnimatePresence>
        {saveSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-[100] max-w-sm mx-auto"
          >
            <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-bold">{saveSuccess}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Settings</h2>
      </div>

      {/* Profile Header */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-lg shadow-blue-200">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-bold border border-white/30">
            {profile?.displayName?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-xl font-bold">{profile?.displayName || 'Business User'}</h3>
            <p className="text-blue-100 text-sm opacity-80 uppercase tracking-tighter font-bold">{profile?.role || 'Staff'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Section: Install App Shortcut */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-blue-50/20">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">Install App Shortcut</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-gray-500">Add FlowManager to your mobile home screen for quick access, just like a regular app.</p>
            
            <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-bold text-gray-400">Your App Link</label>
                <div className="flex gap-2">
                  <input 
                    readOnly
                    type="text" 
                    value={window.location.origin}
                    className="flex-1 bg-white border border-gray-100 p-3 rounded-xl text-xs font-mono truncate"
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition flex items-center gap-2"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 pt-2">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-gray-900 border-b border-gray-100 pb-1">For iPhone (Safari)</p>
                  <ol className="text-[11px] text-gray-600 space-y-1 ml-4 list-decimal font-medium">
                    <li>Tap the <span className="text-blue-600 font-bold">Share</span> icon (square with arrow)</li>
                    <li>Scroll down and tap <span className="text-blue-600 font-bold">Add to Home Screen</span></li>
                  </ol>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-gray-900 border-b border-gray-100 pb-1">For Android (Chrome)</p>
                  <ol className="text-[11px] text-gray-600 space-y-1 ml-4 list-decimal font-medium">
                    <li>Tap the <span className="text-blue-600 font-bold">Menu</span> icon (3 dots ⋮)</li>
                    <li>Tap <span className="text-blue-600 font-bold">Install app</span> or <span className="text-blue-600 font-bold">Add to Home screen</span></li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Notifications */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-gray-900">WhatsApp Alert</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Enable Alert</span>
              <button 
                onClick={() => setWaConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-12 h-6 rounded-full transition relative ${waConfig.enabled ? 'bg-emerald-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${waConfig.enabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-gray-400">WhatsApp Number</label>
              <input 
                type="tel" 
                placeholder="e.g. 919876543210 (Country Code first)"
                value={waConfig.number}
                onChange={(e) => setWaConfig(prev => ({ ...prev, number: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button 
              onClick={saveWaSettings}
              disabled={saving}
              className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:bg-gray-200"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save WhatsApp Settings
            </button>
          </div>
        </div>

        {/* Section: Automated Reports */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-blue-50/30">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">Automated Daily Reports</span>
            </div>
          </div>
          <div className="p-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-Delivery</p>
                <p className="text-[10px] text-gray-500 italic">Sends PDF/Excel daily at 8:00 PM</p>
              </div>
              <button 
                onClick={() => setReportConfig(prev => ({ ...prev, autoEnabled: !prev.autoEnabled }))}
                className={`w-12 h-6 rounded-full transition relative ${reportConfig.autoEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${reportConfig.autoEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> WhatsApp Numbers (3)
                </label>
                <div className="space-y-2">
                  <input 
                    type="tel" 
                    placeholder="WhatsApp Number 1"
                    value={reportConfig.waNumber1}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, waNumber1: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    type="tel" 
                    placeholder="WhatsApp Number 2"
                    value={reportConfig.waNumber2}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, waNumber2: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    type="tel" 
                    placeholder="WhatsApp Number 3"
                    value={reportConfig.waNumber3}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, waNumber3: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Google Drive Paths (3)
                </label>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="Drive Path 1 (e.g. select1)"
                    value={reportConfig.drivePath1}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, drivePath1: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    type="text" 
                    placeholder="Drive Path 2 (e.g. select2)"
                    value={reportConfig.drivePath2}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, drivePath2: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <input 
                    type="text" 
                    placeholder="Drive Path 3 (e.g. select3)"
                    value={reportConfig.drivePath3}
                    onChange={(e) => setReportConfig(prev => ({ ...prev, drivePath3: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={saveReportSettings}
              disabled={saving}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition disabled:bg-gray-200"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Automation Settings
            </button>
          </div>
        </div>

        {/* Section: Daily Alarm / Reminder */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-orange-50/20">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-orange-500" />
              <span className="font-semibold text-gray-900">Daily Alarm Reminder</span>
            </div>
          </div>
          <div className="p-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Enable Daily Alarm</p>
                <p className="text-[10px] text-gray-500 italic">Rings at your set time every day</p>
              </div>
              <button 
                onClick={() => setReminderConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-12 h-6 rounded-full transition relative ${reminderConfig.enabled ? 'bg-orange-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${reminderConfig.enabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-gray-400">Reminder Time</label>
                <div className="flex gap-2">
                  <input 
                    type="time" 
                    value={reminderConfig.time}
                    onChange={(e) => setReminderConfig(prev => ({ ...prev, time: e.target.value }))}
                    className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <button 
                    onClick={() => reminderService.testSound()}
                    className="bg-orange-50 text-orange-600 px-4 rounded-xl border border-orange-100 font-bold text-xs hover:bg-orange-100 transition"
                  >
                    Test Ringtone
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-gray-400">Alarm Message</label>
                <textarea 
                  placeholder="e.g. Please check today's accounts..."
                  value={reminderConfig.message}
                  onChange={(e) => setReminderConfig(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none min-h-[80px]"
                />
              </div>
            </div>

            <button 
              onClick={saveReminderSettings}
              disabled={saving}
              className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 transition disabled:bg-gray-200"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
              Save Alarm Settings
            </button>
          </div>
        </div>

        {/* Section: Team Management */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-emerald-50/20">
            <div className="flex items-center gap-3">
              <UsersIcon className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-gray-900">Team Management</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-gray-500">Only emails added here can access the application.</p>
            
            <div className="flex gap-2">
              <input 
                type="email" 
                placeholder="User email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button 
                onClick={addAuthorizedUser}
                disabled={saving || !newEmail}
                className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition disabled:bg-gray-200"
              >
                <UserPlus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 mt-4">
              <label className="text-[10px] uppercase font-bold text-gray-400">Authorized Users ({authorizedUsers.length})</label>
              <div className="divide-y divide-gray-50 bg-gray-50/50 rounded-2xl border border-gray-50 overflow-hidden">
                {authorizedUsers.map((user) => (
                  <div key={user.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900 leading-none">{user.email}</p>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-widest">{user.role}</p>
                    </div>
                    {user.email !== profile?.email && (
                      <button 
                        onClick={() => removeUser(user.email)}
                        className="p-2 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {authorizedUsers.length === 0 && (
                  <div className="p-8 text-center text-gray-400 italic text-sm">
                    No other users authorized yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section: Account */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">Security & PIN</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Master PIN Lock</p>
                <p className="text-[10px] text-gray-500 italic">Require 4-digit PIN to open app</p>
              </div>
              <button 
                onClick={() => setSecurityConfig(prev => ({ ...prev, pinEnabled: !prev.pinEnabled }))}
                className={`w-12 h-6 rounded-full transition relative ${securityConfig.pinEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${securityConfig.pinEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-gray-400">Set 4-Digit PIN</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  maxLength={4}
                  placeholder="e.g. 0000"
                  value={securityConfig.pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 4) {
                      setSecurityConfig(prev => ({ ...prev, pin: val }));
                    }
                  }}
                  className="flex-1 bg-gray-50 border border-gray-100 p-3 rounded-xl text-lg font-mono tracking-[1em] text-center focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <p className="text-[10px] text-gray-400">Enter exactly 4 numbers. Default is 1313.</p>
            </div>

            <button 
              onClick={saveSecuritySettings}
              disabled={saving || securityConfig.pin.length !== 4}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition disabled:bg-gray-200"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Update PIN Code
            </button>
          </div>
        </div>

        {/* Section: App Preferences */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-gray-900">App Preferences</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {darkMode ? <Moon className="w-4 h-4 text-gray-600" /> : <Sun className="w-4 h-4 text-orange-500" />}
                <span className="text-sm text-gray-600">Dark Mode</span>
              </div>
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`w-12 h-6 rounded-full transition relative ${darkMode ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-600">Push Notifications</span>
              </div>
              <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                <div className="absolute top-1 left-7 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
          </div>
        </div>

        {/* Section: Backup */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-emerald-600" />
              <span className="font-semibold text-gray-900">Backup & Sync</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="p-4 flex items-center justify-between text-xs font-bold">
              <span className={googleConnected ? "text-emerald-600" : "text-gray-400"}>
                {googleConnected ? "Google Drive Connected" : "Google Drive Disconnected"}
              </span>
              <span className="text-gray-400">Last Sync: {googleConnected ? "Just now" : "Never"}</span>
            </div>
            <button 
              onClick={handleConnectGoogle}
              className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2">
                <img src="https://www.gstatic.com/images/branding/product/1x/drive_48dp.png" className="w-4 h-4" alt="Drive" />
                <span className="text-sm text-gray-600 font-medium">
                  {googleConnected ? "Reconnect Google Drive" : "Connect Google Drive"}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Logout */}
        <button 
          onClick={logout}
          className="w-full bg-red-50 text-red-600 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition"
        >
          <LogOut className="w-5 h-5" />
          Log Out
        </button>

        <div className="text-center py-4">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">CashFlow Manager v1.0.0</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <HelpCircle className="w-4 h-4 text-gray-300" />
            <span className="text-xs text-gray-400 underline cursor-pointer">Support</span>
          </div>
        </div>
      </div>

      <PinModal 
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setActionToExecute(null);
        }}
        onSuccess={() => {
          if (actionToExecute) actionToExecute();
        }}
        title="Admin Authentication"
        description="Enter PIN to modify authorized users list"
      />
    </div>
  );
};
