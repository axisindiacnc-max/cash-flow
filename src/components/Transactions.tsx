import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Plus, Minus, Camera, Mic, Paperclip, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '../lib/utils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { sendWhatsAppNotification } from '../lib/whatsappService';
import { CheckCircle2, MessageSquare } from 'lucide-react';

export const Transactions: React.FC<{ initialTransaction?: any, onComplete?: () => void }> = ({ initialTransaction, onComplete }) => {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(!!initialTransaction);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'in' | 'out'>(initialTransaction?.type || 'in');
  const [successData, setSuccessData] = useState<{ url: string | null, type: 'in' | 'out', amount: number } | null>(null);
  
  const [formData, setFormData] = useState({
    customerId: initialTransaction?.customerId || '',
    amount: initialTransaction?.amount?.toString() || '',
    description: initialTransaction?.description || '',
    category: initialTransaction?.category || '',
    date: initialTransaction?.date || new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (initialTransaction) {
      setIsModalOpen(true);
      setType(initialTransaction.type || 'in');
      setFormData({
        customerId: initialTransaction.customerId || '',
        amount: initialTransaction.amount?.toString() || '',
        description: initialTransaction.description || '',
        category: initialTransaction.category || '',
        date: initialTransaction.date || new Date().toISOString().split('T')[0],
      });
    }
  }, [initialTransaction]);

  const [files, setFiles] = useState<File[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || !formData.amount) return;

    setLoading(true);
    try {
      const amountNum = Math.abs(parseFloat(formData.amount));
      
      // For simplicity in this demo, we handle edits by reversing the old transaction and applying the new one
      // In a real app, you'd calculate the diff.
      
      await runTransaction(db, async (transaction) => {
        // Handle Customer Balance Update
        const customerRef = doc(db, 'customers', formData.customerId);
        const customerSnap = await transaction.get(customerRef);

        if (!customerSnap.exists()) throw "Customer not found";
        const currentData = customerSnap.data();

        if (initialTransaction && initialTransaction.id) {
          // 1. Reverse OLD effects
          const oldAmount = initialTransaction.amount;
          const reverseBalance = initialTransaction.type === 'in' ? -oldAmount : oldAmount;
          
          let tempTotalIn = initialTransaction.type === 'in' ? currentData.totalIn - oldAmount : currentData.totalIn;
          let tempTotalOut = initialTransaction.type === 'out' ? currentData.totalOut - oldAmount : currentData.totalOut;
          let tempBalance = currentData.balance + reverseBalance;

          // 2. Apply NEW effects
          const newBalanceChange = type === 'in' ? amountNum : -amountNum;
          transaction.update(customerRef, {
            totalIn: type === 'in' ? tempTotalIn + amountNum : tempTotalIn,
            totalOut: type === 'out' ? tempTotalOut + amountNum : tempTotalOut,
            balance: tempBalance + newBalanceChange,
            updatedAt: serverTimestamp(),
          });

          // 3. Update Transaction Doc
          const txRef = doc(db, 'transactions', initialTransaction.id);
          transaction.update(txRef, {
            ...formData,
            amount: amountNum,
            type,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Standard creation
          const balanceChange = type === 'in' ? amountNum : -amountNum;
          transaction.update(customerRef, {
            totalIn: type === 'in' ? currentData.totalIn + amountNum : currentData.totalIn,
            totalOut: type === 'out' ? currentData.totalOut + amountNum : currentData.totalOut,
            balance: currentData.balance + balanceChange,
            updatedAt: serverTimestamp(),
          });

          const txRef = doc(collection(db, 'transactions'));
          const txData = {
            ...formData,
            amount: amountNum,
            type,
            attachments: [],
            staffId: profile.uid,
            staffName: profile.displayName || profile.email,
            timestamp: serverTimestamp(),
          };
          transaction.set(txRef, txData);
          
          // Generate notification link
          const customer = customers.find(c => c.id === formData.customerId);
          const url = await sendWhatsAppNotification(txData, customer?.name || 'Customer');
          setSuccessData({ url, type, amount: amountNum });
        }
      });

      // We stay in the modal if successData is present
      if (!initialTransaction) {
        setFormData({
          customerId: '',
          amount: '',
          description: '',
          category: '',
          date: new Date().toISOString().split('T')[0],
        });
      }
    } catch (error) {
      console.error("Transaction error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("p-4 space-y-4", !initialTransaction && "pb-24")}>
      {!initialTransaction && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Transactions</h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>New Entry</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { setType('in'); setIsModalOpen(true); }}
              className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 flex flex-col items-center gap-2 relative overflow-hidden"
            >
              <div className="absolute top-1 right-2 text-[8px] font-black opacity-40">ALT+I</div>
              <Plus className="w-8 h-8" />
              <span className="font-bold">Cash In</span>
            </button>
            <button 
              onClick={() => { setType('out'); setIsModalOpen(true); }}
              className="bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 flex flex-col items-center gap-2 relative overflow-hidden"
            >
              <div className="absolute top-1 right-2 text-[8px] font-black opacity-40">ALT+O</div>
              <Minus className="w-8 h-8" />
              <span className="font-bold">Cash Out</span>
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">
                  {initialTransaction ? (
                    initialTransaction.id ? 'Edit Transaction' : `Add Cash ${type === 'in' ? 'In' : 'Out'} for ${customers.find(c => c.id === initialTransaction.customerId)?.name || 'Customer'}`
                  ) : `Add Cash ${type === 'in' ? 'In' : 'Out'}`}
                </h3>
                <button onClick={() => { setIsModalOpen(false); setSuccessData(null); if(onComplete) onComplete(); }}>
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {successData ? (
                <div className="py-12 flex flex-col items-center text-center space-y-6">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"
                  >
                    <CheckCircle2 className="w-16 h-16" />
                  </motion.div>
                  
                  <div className="space-y-2">
                    <h4 className="text-2xl font-bold text-gray-900">Entry Saved!</h4>
                    <p className="text-gray-500">
                      Successfully recorded <span className={cn("font-bold", successData.type === 'in' ? "text-emerald-600" : "text-red-600")}>
                        {formatCurrency(successData.amount)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col w-full gap-3 pt-4">
                    {successData.url && (
                      <a 
                        href={successData.url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition"
                      >
                        <MessageSquare className="w-6 h-6" />
                        Send WhatsApp Alert
                      </a>
                    )}
                    <button 
                      onClick={() => { setIsModalOpen(false); setSuccessData(null); if(onComplete) onComplete(); }}
                      className="w-full bg-gray-100 text-gray-600 font-bold py-4 rounded-2xl hover:bg-gray-200 transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${type === 'in' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500'}`}
                  onClick={() => setType('in')}
                >
                  Cash In
                </button>
                <button 
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${type === 'out' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500'}`}
                  onClick={() => setType('out')}
                >
                  Cash Out
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Customer</label>
                  <select 
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.customerId}
                    onChange={e => setFormData({...formData, customerId: e.target.value})}
                  >
                    <option value="">Select Customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Amount</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Date</label>
                    <input 
                      required
                      type="date"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Category</label>
                  <input 
                    type="text"
                    placeholder="e.g. Sales, Service, Refund"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Description</label>
                  <textarea 
                    placeholder="Short note..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                {!initialTransaction && (
                  <div className="flex gap-4">
                    <label className="flex-1 flex flex-col items-center gap-2 p-4 bg-gray-50 border border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 transition">
                      <Camera className="w-6 h-6 text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500">Camera</span>
                      <input type="file" accept="image/*" capture="environment" hidden onChange={e => e.target.files && setFiles(prev => [...prev, e.target.files![0]])} />
                    </label>
                    <button type="button" className="flex-1 flex flex-col items-center gap-2 p-4 bg-gray-50 border border-dashed border-gray-200 rounded-2xl hover:bg-gray-100 transition">
                      <Mic className="w-6 h-6 text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500">Voice</span>
                    </button>
                    <label className="flex-1 flex flex-col items-center gap-2 p-4 bg-gray-50 border border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 transition">
                      <Paperclip className="w-6 h-6 text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-500">Docs</span>
                      <input type="file" multiple hidden onChange={e => e.target.files && setFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                    </label>
                  </div>
                )}

                <button 
                  disabled={loading}
                  className={cn(
                    "w-full py-4 rounded-xl text-white font-bold shadow-lg transition flex items-center justify-center gap-2",
                    loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                  )}
                >
                  {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                  {loading ? 'Saving...' : initialTransaction ? 'Update Entry' : 'Add Transaction'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
</div>
);
};

