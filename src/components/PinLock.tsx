import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowRight, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface PinLockProps {
  onSuccess: () => void;
  correctPin: string;
}

export const PinLock: React.FC<PinLockProps> = ({ onSuccess, correctPin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleNumber = (num: string) => {
    if (pin.length < 4) {
      setError(false);
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === correctPin) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 800);
      } else {
        setError(true);
        setTimeout(() => setPin(''), 1000);
      }
    }
  }, [pin, correctPin, onSuccess]);

  const numpad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'];

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-between p-8 sm:p-12 max-w-lg mx-auto border-x border-gray-100">
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 w-full">
        {/* Branding */}
        <div className="flex flex-col items-center space-y-4">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-100">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">CashFlow Manager</h2>
            <p className="text-sm text-gray-500 font-medium">Please enter your 4-digit PIN</p>
          </div>
        </div>

        {/* Pin Dots */}
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                scale: pin.length > i ? 1.2 : 1,
                backgroundColor: pin.length > i ? (success ? '#10b981' : (error ? '#ef4444' : '#2563eb')) : '#f3f4f6',
                borderColor: pin.length > i ? 'transparent' : '#e5e7eb'
              }}
              className="w-4 h-4 rounded-full border-2 transition-colors duration-200"
            />
          ))}
        </div>

        {/* Status Message */}
        <div className="h-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-red-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" /> Invalid PIN
              </motion.p>
            )}
            {success && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-emerald-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Unlocked
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-6 w-full max-w-xs mb-12">
        {numpad.map((val, idx) => {
          if (val === '') return <div key={idx} />;
          if (val === 'delete') {
            return (
              <button
                key={idx}
                onClick={handleDelete}
                className="w-16 h-16 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition active:scale-90"
              >
                <Delete className="w-6 h-6" />
              </button>
            );
          }
          return (
            <button
              key={idx}
              onClick={() => handleNumber(val)}
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-gray-700 hover:bg-gray-50 border border-gray-100 transition active:scale-95 active:bg-blue-50 active:text-blue-600 active:border-blue-100"
            >
              {val}
            </button>
          );
        })}
      </div>

      <div className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] pb-4">
        Secure Encryption Enabled
      </div>
    </div>
  );
};
