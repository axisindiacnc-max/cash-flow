import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, sum } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { TrendingUp, TrendingDown, Wallet, Clock, User as UserIcon, PlusCircle, MinusCircle, Edit2, Trash2, AlertCircle, Smartphone, Smartphone as MobileIcon, ArrowRight, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc, doc, runTransaction } from 'firebase/firestore';

import { Transactions } from './Transactions';
import { PinModal } from './PinModal';

export const Dashboard: React.FC = () => {
  // ... existing states
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, balance: 0 });
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [addingType, setAddingType] = useState<'in' | 'out'>('in');
  const [isStandalone, setIsStandalone] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [actionToExecute, setActionToExecute] = useState<(() => void) | null>(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
  }, []);

  useEffect(() => {
    const qCust = query(collection(db, 'customers'));
    const unsubscribeCust = onSnapshot(qCust, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentTransactions(txs);
    });

    const qAll = query(collection(db, 'transactions'));
    const unsubscribeAll = onSnapshot(qAll, (snapshot) => {
      let tin = 0;
      let tout = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'in') tin += data.amount;
        else tout += data.amount;
      });
      setStats({ totalIn: tin, totalOut: tout, balance: tin - tout });
    });

    return () => {
      unsubscribeCust();
      unsubscribe();
      unsubscribeAll();
    };
  }, []);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Unknown User';

  const handleDelete = async (tx: any) => {
    try {
      await runTransaction(db, async (transaction) => {
        const customerRef = doc(db, 'customers', tx.customerId);
        const customerSnap = await transaction.get(customerRef);
        
        if (customerSnap.exists()) {
          const currentData = customerSnap.data();
          const amountNum = tx.amount;
          const balanceChange = tx.type === 'in' ? -amountNum : amountNum;
          
          transaction.update(customerRef, {
            totalIn: tx.type === 'in' ? currentData.totalIn - amountNum : currentData.totalIn,
            totalOut: tx.type === 'out' ? currentData.totalOut - amountNum : currentData.totalOut,
            balance: currentData.balance + balanceChange,
          });
        }
        
        // Move to Recycle Bin
        const binRef = doc(collection(db, 'recycle_bin'));
        transaction.set(binRef, {
          originalId: tx.id,
          originalCollection: 'transactions',
          originalData: tx,
          deletedAt: new Date().toISOString(),
          deletedBy: user?.uid,
          deletedByEmail: user?.email
        });

        transaction.delete(doc(db, 'transactions', tx.id));
      });
      setDeletingId(null);
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* PWA Installation Banner */}
      {!isStandalone && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-lg overflow-hidden relative"
        >
          <div className="relative z-10 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <MobileIcon className="w-5 h-5 text-white" />
              </div>
              <h4 className="font-bold text-sm">Add Shortcut to Home Screen</h4>
            </div>
            <p className="text-[10px] text-blue-50 leading-relaxed font-medium">
              Install FlowManager for quick access! Open this page in Safari (iPhone) or Chrome (Android) and select 
              <span className="font-bold border-b border-blue-200 ml-1">"Add to Home Screen"</span>.
            </p>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Share className="w-20 h-20 rotate-12" />
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => { setAddingType('in'); setIsAddingTransaction(true); }}
          className="bg-emerald-50 text-emerald-700 p-6 rounded-2xl border border-emerald-100 flex flex-col items-center gap-3 active:scale-95 transition-all shadow-sm"
        >
          <div className="p-3 bg-emerald-100 rounded-full">
            <PlusCircle className="w-8 h-8" />
          </div>
          <span className="font-bold text-sm uppercase tracking-wider">Cash In</span>
        </button>
        <button 
          onClick={() => { setAddingType('out'); setIsAddingTransaction(true); }}
          className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 flex flex-col items-center gap-3 active:scale-95 transition-all shadow-sm"
        >
          <div className="p-3 bg-red-100 rounded-full">
            <MinusCircle className="w-8 h-8" />
          </div>
          <span className="font-bold text-sm uppercase tracking-wider">Cash Out</span>
        </button>
      </div>

      {/* Recent Transactions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
          <Clock className="w-5 h-5 text-gray-400" />
        </div>
        <div className="space-y-3">
          {recentTransactions.map((tx) => (
            <motion.div 
              key={tx.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm group hover:border-blue-100 transition-colors"
            >
                <div 
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setEditingTransaction(tx)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-xl flex items-center justify-center",
                      tx.type === 'in' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                    )}>
                      {tx.type === 'in' ? <PlusCircle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-gray-900 leading-none">{getCustomerName(tx.customerId)}</p>
                        <div className="flex gap-1 items-center">
                          {tx.category && (
                            <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-black uppercase tracking-widest leading-none">
                              {tx.category}
                            </span>
                          )}
                          <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest leading-none">
                            Entry BY {tx.staffName || 'Staff'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(tx.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end justify-between self-stretch">
                    <p className={cn(
                      "font-black text-sm",
                      tx.type === 'in' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {tx.type === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium max-w-[100px] truncate text-right">
                      {tx.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-50">
                  <button 
                    onClick={() => setEditingTransaction(tx)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-2xl text-xs font-black transition-all active:scale-95"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button 
                    onClick={() => {
                      setActionToExecute(() => () => handleDelete(tx));
                      setShowPinModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-black transition-all active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </motion.div>
            ))}
          {recentTransactions.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No transactions yet</p>
          )}
        </div>
      </div>

      {/* Edit/Add Form Modal */}
      {(editingTransaction || isAddingTransaction) && (
        <Transactions 
          initialTransaction={editingTransaction || { type: addingType }} 
          onComplete={() => {
            setEditingTransaction(null);
            setIsAddingTransaction(false);
          }} 
        />
      )}

      <PinModal 
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setActionToExecute(null);
        }}
        onSuccess={() => {
          if (actionToExecute) actionToExecute();
        }}
        title="Confirm Deletion"
        description="Enter PIN to move this transaction to Recycle Bin"
      />
    </div>
  );
};
