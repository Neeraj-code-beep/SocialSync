import React from 'react';
import { Toaster } from 'react-hot-toast';

const ToastProvider = () => {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'rgba(18, 18, 24, 0.95)',
          color: '#F8FAFC',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
          borderRadius: '12px',
          fontSize: '14px',
        },
        success: {
          iconTheme: {
            primary: '#22C55E',
            secondary: '#09090B',
          },
        },
        error: {
          iconTheme: {
            primary: '#EF4444',
            secondary: '#09090B',
          },
        },
      }}
    />
  );
};

export default ToastProvider;
