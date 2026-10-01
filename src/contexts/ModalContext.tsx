import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Item, User, Pool } from '../types';
import { LegalTabType } from '../components/LegalModal';
import { AlertDialogModal } from '../components/AlertDialogModal';

export type ModalType =
  | 'legal'
  | 'kiosk'
  | 'receipt'
  | 'deposit'
  | 'shopping'
  | 'itemForm'
  | 'createPool'
  | 'managePool'
  | 'sharePool'
  | 'polls'
  | 'qrScanner'
  | 'poster'
  | 'nfc'
  | 'notifications'
  | 'webhooks'
  | 'userProfile'
  | 'settleUp'
  | 'savings'
  | 'helpGuide'
  | 'admin'
  | 'createOrg'
  | 'onboarding'
  | 'auth';

export interface ModalPayloads {
  legal?: { tab?: LegalTabType };
  itemForm?: { item?: Item | null };
  deposit?: { targetUser?: User | null };
  settleUp?: { targetUser?: User | null };
  receipt?: { preselectedItemId?: string };
  auth?: { mode?: 'login' | 'register'; intent?: any };
  onboarding?: { initialTier?: string; initialBillingCycle?: 'monthly' | 'yearly' };
  createOrg?: { initialTier?: 'standard' | 'plus'; initialBillingCycle?: 'monthly' | 'yearly' };
  helpGuide?: { initialTab?: 'members' | 'managers' | 'faq' };
}

export interface AlertDialogOptions {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onClose?: () => void;
}

export interface ModalContextType {
  activeModal: ModalType | null;
  modalPayload: any;
  isOpen: (modal: ModalType) => boolean;
  openModal: <T extends ModalType>(modal: T, payload?: ModalPayloads[T & keyof ModalPayloads]) => void;
  closeModal: (modal?: ModalType) => void;
  closeAllModals: () => void;
  
  // Alert dialog single source of truth
  alertDialog: AlertDialogOptions | null;
  showAlert: (options: Omit<AlertDialogOptions, 'isOpen'>) => void;
  closeAlert: () => void;

  // Active pool reference for automatic pre-flight checking
  activePool: Pool | undefined;
  setActivePoolRef: (pool: Pool | undefined) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [modalPayload, setModalPayload] = useState<any>(null);
  const [alertDialog, setAlertDialog] = useState<AlertDialogOptions | null>(null);
  const [activePool, setActivePool] = useState<Pool | undefined>(undefined);

  const setActivePoolRef = useCallback((pool: Pool | undefined) => {
    setActivePool(pool);
  }, []);

  const showAlert = useCallback((options: Omit<AlertDialogOptions, 'isOpen'>) => {
    setAlertDialog({
      ...options,
      isOpen: true,
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertDialog(null);
  }, []);

  const openModal = useCallback(<T extends ModalType>(modal: T, payload?: ModalPayloads[T & keyof ModalPayloads]) => {
    // List of actions that strictly require an active pantry pool
    const poolRequiredModals: ModalType[] = [
      'kiosk',
      'receipt',
      'deposit',
      'shopping',
      'itemForm',
      'managePool',
      'sharePool',
      'polls',
      'qrScanner',
      'poster',
      'nfc',
      'settleUp',
      'savings',
    ];

    if (poolRequiredModals.includes(modal) && !activePool) {
      showAlert({
        title: 'No Active Pantry',
        message: `Please create or join a pantry pool before opening ${modal}.`,
        type: 'info',
        confirmText: 'Create Pool',
        onConfirm: () => {
          setModalPayload(null);
          setActiveModal('createPool');
        },
      });
      return;
    }

    setModalPayload(payload || null);
    setActiveModal(modal);
  }, [activePool, showAlert]);

  const closeModal = useCallback((modal?: ModalType) => {
    setActiveModal((current) => {
      if (!modal || current === modal) {
        setModalPayload(null);
        return null;
      }
      return current;
    });
  }, []);

  const closeAllModals = useCallback(() => {
    setActiveModal(null);
    setModalPayload(null);
  }, []);

  const isOpen = useCallback((modal: ModalType) => {
    return activeModal === modal;
  }, [activeModal]);

  const value = useMemo<ModalContextType>(() => ({
    activeModal,
    modalPayload,
    isOpen,
    openModal,
    closeModal,
    closeAllModals,
    alertDialog,
    showAlert,
    closeAlert,
    activePool,
    setActivePoolRef,
  }), [
    activeModal,
    modalPayload,
    isOpen,
    openModal,
    closeModal,
    closeAllModals,
    alertDialog,
    showAlert,
    closeAlert,
    activePool,
    setActivePoolRef,
  ]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      {alertDialog && (
        <AlertDialogModal
          isOpen={alertDialog.isOpen}
          title={alertDialog.title}
          message={alertDialog.message}
          type={alertDialog.type}
          confirmText={alertDialog.confirmText}
          cancelText={alertDialog.cancelText}
          onConfirm={() => {
            const cb = alertDialog.onConfirm;
            setAlertDialog(null);
            if (cb) cb();
          }}
          onClose={() => {
            const cb = alertDialog.onClose;
            setAlertDialog(null);
            if (cb) cb();
          }}
        />
      )}
    </ModalContext.Provider>
  );
};

export const useModals = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    // Graceful fallback for components rendered outside of ModalProvider (e.g. isolated unit tests)
    return {
      activeModal: null,
      modalPayload: null,
      isOpen: () => false,
      openModal: () => {},
      closeModal: () => {},
      closeAllModals: () => {},
      alertDialog: null,
      showAlert: () => {},
      closeAlert: () => {},
      activePool: undefined,
      setActivePoolRef: () => {},
    };
  }
  return context;
};
