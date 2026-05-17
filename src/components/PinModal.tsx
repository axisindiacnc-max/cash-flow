import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export const PinModal: React.FC<PinModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  title = "Authentication Required",
  description = "Enter PIN to perform this action" 
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '3950') {
      onSuccess();
      setPin('');
      setError(false);
      onClose();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 1000);
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  // Auto-submit when 4 digits are entered
  React.useEffect(() => {
    if (pin.length === 4) {
      if (pin === '3950') {
        onSuccess();
        setPin('');
        setError(false);
        onClose();
      } else {
        setError(true);
        const timer = setTimeout(() => {
            setPin('');
            setError(false);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [pin, onSuccess, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden"
          >
            <div className="p-6 text-center">
              <div className="flex justify-center mb-4">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  error ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                )}>
                  <Lock className="w-6 h-6" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
              <p className="text-gray-500 text-xs mt-1">{description}</p>

              <div className="flex justify-center gap-3 my-8">
                {[1, 2, 3, 4].map((i) => (
                  <div 
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-all duration-200",
                      pin.length >= i 
                        ? "bg-blue-600 border-blue-600 scale-110" 
                        : "border-gray-200",
                      error && pin.length >= i && "bg-red-500 border-red-500"
                    )}
                  />
                ))}
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-1 text-red-600 text-[10px] font-bold mb-4"
                >
                  <AlertCircle className="w-3 h-3" />
                  Incorrect PIN
                </motion.div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleDigit(num.toString())}
                    className="h-14 bg-gray-50 rounded-2xl text-xl font-bold text-gray-800 active:bg-gray-200 transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handleDigit('0')}
                  className="h-14 bg-gray-50 rounded-2xl text-xl font-bold text-gray-800 active:bg-gray-200 transition-colors"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-14 flex items-center justify-center text-gray-400 active:text-gray-600"
                >
                   <X className="w-6 h-6" />
                </button>
              </div>

              <button
                onClick={onClose}
                className="mt-6 text-gray-400 text-xs font-medium hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
