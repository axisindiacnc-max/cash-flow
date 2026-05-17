import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, serverTimestamp, where, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Search, UserPlus, Phone, MapPin, ChevronRight, X, Edit2, Trash2, ArrowLeft, PlusCircle, MinusCircle, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { Transactions } from './Transactions';

import { PinModal } from './PinModal';

export const Customers: React.FC = () => {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', email: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [addingTransaction, setAddingTransaction] = useState<{ customerId: string, type: 'in' | 'out' } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [actionToExecute, setActionToExecute] = useState<(() => void) | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'), 
      where('customerId', '==', selectedCustomer.id),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomerTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [selectedCustomer]);

  const handleDeleteTransaction = async (tx: any) => {
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
        
        // Move to Recycle Bin instead of deleting
        const binRef = doc(collection(db, 'recycle_bin'));
        transaction.set(binRef, {
          originalId: tx.id,
          originalCollection: 'transactions',
          originalData: tx,
          deletedAt: new Date().toISOString(),
          deletedBy: profile?.uid,
          deletedByEmail: profile?.email
        });

        transaction.delete(doc(db, 'transactions', tx.id));
      });
      setDeletingId(null);
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        totalIn: 0,
        totalOut: 0,
        balance: 0,
        createdAt: serverTimestamp(),
      });
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', phone: '', address: '', email: '' });
    } catch (error) {
      console.error("Error adding customer:", error);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const activeCustomer = selectedCustomer 
    ? customers.find(c => c.id === selectedCustomer.id) || selectedCustomer
    : null;

  const stats = customerTransactions.reduce((acc, tx) => {
    const amt = Math.abs(Number(tx.amount) || 0);
    if (tx.type === 'in') {
      acc.totalIn += amt;
      acc.balance += amt;
    } else {
      acc.totalOut += amt;
      acc.balance -= amt;
    }
    return acc;
  }, { totalIn: 0, totalOut: 0, balance: 0 });

  const handleFixCalculation = async () => {
    if (!activeCustomer) return;
    try {
      await updateDoc(doc(db, 'customers', activeCustomer.id), {
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        balance: stats.balance,
        updatedAt: serverTimestamp()
      });
      alert("Ledger calculation fixed successfully!");
    } catch (error) {
      console.error("Fix error:", error);
    }
  };

  if (activeCustomer) {
    return (
      <div className="flex flex-col h-full bg-gray-50 pb-24">
        {/* Customer Detail Header */}
        <div className="bg-white p-6 border-b border-gray-100 shadow-sm sticky top-0 z-20">
          <button 
            onClick={() => setSelectedCustomer(null)}
            className="flex items-center gap-2 text-gray-500 mb-4 font-medium hover:text-blue-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Customers</span>
          </button>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-xl font-bold uppercase shadow-lg shadow-blue-100">
                {activeCustomer.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{activeCustomer.name}</h2>
                <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {activeCustomer.phone || '--'}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {activeCustomer.address || '--'}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => {
                setActionToExecute(() => async () => {
                  try {
                    const binRef = doc(collection(db, 'recycle_bin'));
                    await setDoc(binRef, {
                      originalId: activeCustomer.id,
                      originalCollection: 'customers',
                      originalData: activeCustomer,
                      deletedAt: new Date().toISOString(),
                      deletedBy: profile?.uid,
                      deletedByEmail: profile?.email
                    });
                    await deleteDoc(doc(db, 'customers', activeCustomer.id));
                    setSelectedCustomer(null);
                  } catch (e) {
                    console.error(e);
                    alert("Failed to delete customer.");
                  }
                });
                setShowPinModal(true);
              }}
              className="p-3 text-gray-300 hover:text-red-500 transition-colors"
              title="Delete Customer"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-8">
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
              <p className="text-[10px] uppercase font-bold text-emerald-600">Total In</p>
              <p className="text-sm font-bold text-emerald-700">{formatCurrency(stats.totalIn)}</p>
            </div>
            <div className="bg-red-50 p-3 rounded-xl border border-red-100">
              <p className="text-[10px] uppercase font-bold text-red-600">Total Out</p>
              <p className="text-sm font-bold text-red-700">{formatCurrency(stats.totalOut)}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
              <p className="text-[10px] uppercase font-bold text-blue-600">Balance</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(stats.balance)}</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button 
              onClick={() => setAddingTransaction({ customerId: activeCustomer.id, type: 'in' })}
              className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95 transition-all text-sm uppercase tracking-wider relative group"
            >
              <PlusCircle className="w-5 h-5" />
              Cash In
              <span className="absolute top-1 right-2 text-[8px] opacity-70">ALT+I</span>
            </button>
            <button 
              onClick={() => setAddingTransaction({ customerId: activeCustomer.id, type: 'out' })}
              className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-100 flex items-center justify-center gap-2 active:scale-95 transition-all text-sm uppercase tracking-wider relative group"
            >
              <MinusCircle className="w-5 h-5" />
              Cash Out
              <span className="absolute top-1 right-2 text-[8px] opacity-70">ALT+O</span>
            </button>
          </div>
        </div>

        {/* Ledger Transactions */}
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Ledger History</h3>
            <button 
              onClick={handleFixCalculation}
              className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 active:scale-95 transition-all"
            >
              Verify & Fix
            </button>
          </div>

          <div className="space-y-3">
            {customerTransactions.map((tx) => (
              <motion.div 
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm group hover:border-blue-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      tx.type === 'in' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                    )}>
                      {tx.type === 'in' ? <PlusCircle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-gray-900 text-sm leading-none">{tx.category || 'Transaction'}</p>
                        <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest leading-none">
                          Entry BY {tx.staffName || 'Staff'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 font-medium">{formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold",
                      tx.type === 'in' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {tx.type === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate max-w-[100px]">{tx.description}</p>
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
                      setActionToExecute(() => () => handleDeleteTransaction(tx));
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
            {customerTransactions.length === 0 && (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm font-medium">No ledger entries found</p>
              </div>
            )}
          </div>
        </div>

        {/* Global Transaction Editor (for edits or quick additions) */}
        {(editingTransaction || addingTransaction) && (
          <Transactions 
            initialTransaction={editingTransaction || addingTransaction} 
            onComplete={() => {
              setEditingTransaction(null);
              setAddingTransaction(null);
            }} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Search & Actions */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Search customers..."
            className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>

      {/* Customer List */}
      <div className="grid grid-cols-1 gap-3">
        {filteredCustomers.map((customer) => (
          <motion.div 
            key={customer.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setSelectedCustomer(customer)}
            className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold uppercase shrink-0">
                {customer.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-gray-900 truncate leading-none mb-1">{customer.name}</h4>
                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                  <Phone className="w-3 h-3" />
                  <span>{customer.phone || 'No phone'}</span>
                </div>
              </div>
            </div>

            <div className="text-right flex flex-col items-end shrink-0 min-w-[120px]">
              <div className="flex flex-col items-end gap-1">
                <p className="text-[9px] uppercase font-black text-gray-400 tracking-widest leading-none">Net Balance</p>
                <p className={cn(
                  "font-black text-base leading-none",
                  customer.balance >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {customer.balance >= 0 ? '+' : ''}{formatCurrency(customer.balance)}
                </p>
                <div className="flex gap-2 text-[10px] font-bold">
                  <span className="text-emerald-500/80">In: {formatCurrency(Math.abs(customer.totalIn || 0))}</span>
                  <span className="text-red-500/80">Out: {formatCurrency(Math.abs(customer.totalOut || 0))}</span>
                </div>
              </div>
              <div className="text-gray-300 group-hover:text-blue-600 transition-colors mt-2">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">New Customer</h3>
                <button onClick={() => setIsAddModalOpen(false)}>
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleAddCustomer} className="space-y-4">
                <input 
                  required
                  type="text"
                  placeholder="Full Name"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                />
                <input 
                  type="tel"
                  placeholder="Phone Number"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                />
                <input 
                  type="email"
                  placeholder="Email Address"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                />
                <textarea 
                  placeholder="Address"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newCustomer.address}
                  onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                />
                <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition">
                  Create Customer
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PinModal 
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setActionToExecute(null);
        }}
        onSuccess={() => {
          if (actionToExecute) actionToExecute();
        }}
        title="Authentication Required"
        description="Enter PIN to complete this action"
      />
    </div>
  );
};

