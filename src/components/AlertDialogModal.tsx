import React from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ShieldAlert, 
  X, 
  HelpCircle
} from 'lucide-react';

export interface AlertDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onClose: () => void;
}

export const AlertDialogModal: React.FC<AlertDialogConfig> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const isConfirm = type === 'confirm' || !!onConfirm;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <div className="h-11 w-11 rounded-lg bg-[#EDF5EF] text-[#5A9A6B] flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 stroke-[2]" />
          </div>
        );
      case 'warning':
        return (
          <div className="h-11 w-11 rounded-lg bg-[#FFF8EB] text-[#D4870E] flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 stroke-[2]" />
          </div>
        );
      case 'error':
        return (
          <div className="h-11 w-11 rounded-lg bg-[#FDF0EC] text-[#C9553D] flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 stroke-[2]" />
          </div>
        );
      case 'confirm':
        return (
          <div className="h-11 w-11 rounded-lg bg-[#FDF0EC] text-[#E8694A] flex items-center justify-center">
            <HelpCircle className="h-6 w-6 stroke-[2]" />
          </div>
        );
      default:
        return (
          <div className="h-11 w-11 rounded-lg bg-[#EDF4FA] text-[#8FB8DE] flex items-center justify-center">
            <Info className="h-6 w-6 stroke-[2]" />
          </div>
        );
    }
  };

  const handleConfirmAction = () => {
    if (onConfirm) {
      onConfirm();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-sm w-full p-6 text-[#2D2D2D] shadow-xl relative my-8 space-y-4 text-center">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon Header */}
        <div className="flex justify-center pt-2">
          {getIcon()}
        </div>

        {/* Text Details */}
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-[#2D2D2D] tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-[#6B6B6B] leading-relaxed max-w-xs mx-auto">
            {message}
          </p>
        </div>

        {/* Action Buttons */}
        <div className={`pt-2 flex gap-2 justify-center ${isConfirm ? 'grid grid-cols-2' : ''}`}>
          {isConfirm && (
            <button
              onClick={onClose}
              className="py-2 px-4 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#2D2D2D] text-xs font-medium border border-[#E0DAD1] transition"
            >
              {cancelText}
            </button>
          )}

          <button
            onClick={handleConfirmAction}
            className={`py-2 px-4 rounded-full text-xs font-medium transition shadow-xs ${
              type === 'error' || type === 'warning'
                ? 'bg-[#C9553D] hover:bg-[#B5462F] text-white'
                : 'bg-[#E8694A] hover:bg-[#D45A3D] text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>

      </div>
    </div>
  );
};
