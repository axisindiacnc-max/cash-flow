import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, runTransaction, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Trash2, RotateCcw, Search, Edit2, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatDate, cn } from '../lib/utils';

import { PinModal } from './PinModal';

export const RecycleBin: React.FC = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [actionToExecute, setActionToExecute] = useState<(() => void) | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

  useEffect(() => {
    if (editingItem) {
      setEditFormData({ ...editingItem.originalData });
    } else {
      setEditFormData(null);
    }
  }, [editingItem]);

  useEffect(() => {
    const q = query(collection(db, 'recycle_bin'), orderBy('deletedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleRestore = async (item: any) => {
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const { originalData, originalCollection, originalId } = item;
        
        // Restore to original collection
        const originalRef = doc(db, originalCollection, originalId);
        
        // Special logic for Transactions (update customer totals)
        if (originalCollection === 'transactions') {
          const customerRef = doc(db, 'customers', originalData.customerId);
          const customerSnap = await transaction.get(customerRef);
          
          if (customerSnap.exists()) {
            const currentData = customerSnap.data();
            const amount = originalData.amount;
            const balanceChange = originalData.type === 'in' ? amount : -amount;
            
            transaction.update(customerRef, {
              totalIn: originalData.type === 'in' ? currentData.totalIn + amount : currentData.totalIn,
              totalOut: originalData.type === 'out' ? currentData.totalOut + amount : currentData.totalOut,
              balance: currentData.balance + balanceChange,
            });
          } else {
            throw new Error("Customer missing. Restore the customer first.");
          }
        }

        // Put back the original doc
        transaction.set(originalRef, originalData);
        
        // Delete from bin
        transaction.delete(doc(db, 'recycle_bin', item.id));
      });
    } catch (error: any) {
      console.error("Restore error:", error);
      alert(error.message || "Error restoring item.");
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editFormData) return;
    setLoading(true);
    try {
      const itemRef = doc(db, 'recycle_bin', editingItem.id);
      await updateDoc(itemRef, {
        originalData: editFormData,
        updatedInBinAt: new Date().toISOString()
      });
      setEditingItem(null);
    } catch (error) {
      console.error("Edit save error:", error);
      alert("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  const emptyBin = () => {
    setActionToExecute(() => async () => {
      setLoading(true);
      try {
        for (const item of items) {
          await deleteDoc(doc(db, 'recycle_bin', item.id));
        }
      } catch (error) {
        console.error("Empty bin error:", error);
        alert("Failed to empty bin.");
      } finally {
        setLoading(false);
      }
    });
    setShowPinModal(true);
  };

  const filteredItems = items.filter(i => 
    i.originalData?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.originalData?.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.originalData?.staffName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            Recycle Bin
          </h2>
          <p className="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">Restore deleted entries</p>
        </div>
        {items.length > 0 && (
          <button 
            onClick={emptyBin}
            className="text-[10px] font-black text-red-600 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition-all uppercase tracking-wider"
          >
            Empty Bin
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input 
          type="text"
          placeholder="Search deleted items..."
          className="w-full bg-white border border-gray-100 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filteredItems.map((item) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-red-400" />
            
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full font-bold uppercase text-gray-500">
                    {item.originalCollection === 'transactions' ? 'Entry' : 'Data'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">Deleted on {formatDate(item.deletedAt)}</span>
                </div>
                
                <h4 className="font-bold text-gray-900">
                  {item.originalCollection === 'customers' 
                    ? item.originalData.name 
                    : (item.originalData?.category || 'Deleted Entry')}
                </h4>
                
                {item.originalCollection === 'transactions' && (
                  <p className={cn(
                    "text-sm font-bold mt-1",
                    item.originalData.type === 'in' ? 'text-emerald-600' : 'text-red-600'
                  )}>
                    {item.originalData.type === 'in' ? '+' : '-'}{formatCurrency(item.originalData.amount)}
                  </p>
                )}

                {item.originalCollection === 'customers' && (
                  <p className="text-sm font-bold mt-1 text-blue-600">
                    Balance: {formatCurrency(item.originalData.balance)}
                  </p>
                )}
                
                <p className="text-xs text-gray-500 mt-2 line-clamp-1 italic">
                  {item.originalCollection === 'customers' 
                    ? `Phone: ${item.originalData.phone || 'N/A'}`
                    : (item.originalData?.description || 'No notes')}
                </p>

              </div>

              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setEditingItem(item)}
                  disabled={loading}
                  className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center"
                  title="Edit in Bin"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleRestore(item)}
                  disabled={loading}
                  className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center"
                  title="Restore"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => {
                    setActionToExecute(() => async () => {
                      setLoading(true);
                      try {
                        await deleteDoc(doc(db, 'recycle_bin', item.id));
                      } catch (error) {
                        console.error("Delete error:", error);
                        alert("Failed to delete item.");
                      } finally {
                        setLoading(false);
                      }
                    });
                    setShowPinModal(true);
                  }}
                  disabled={loading}
                  className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center"
                  title="Permanent Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-20 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
            <Trash2 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Bin is empty</p>
            <p className="text-[10px] text-gray-300 uppercase font-bold tracking-widest mt-1">Deleted entries will appear here</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingItem && editFormData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-emerald-50">
                <h3 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
                  <Edit2 className="w-5 h-5" />
                  Edit Deleted Entry
                </h3>
                <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-emerald-600" />
                </button>
              </div>

              <form onSubmit={handleEditSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {editingItem.originalCollection === 'transactions' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Category</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editFormData.category || ''}
                        onChange={e => setEditFormData({ ...editFormData, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Amount</label>
                      <input 
                        type="number"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editFormData.amount || ''}
                        onChange={e => setEditFormData({ ...editFormData, amount: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Description</label>
                      <textarea 
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editFormData.description || ''}
                        onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Customer Name</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editFormData.name || ''}
                        onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Phone</label>
                      <input 
                        type="tel"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editFormData.phone || ''}
                        onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                      />
                    </div>
                  </>
                )}
                
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
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
        title="Security Required"
        description="Enter PIN 3950 to permanently delete data"
      />
    </div>
  );
};
