import React from 'react';

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3',
  };

  return (
    <div
      className={`inline-block animate-spin rounded-full border-solid border-[#171717] border-t-transparent ${sizes[size]} ${className}`}
      role="status"
      aria-label="Loading..."
    />
  );
};

export const LoadingOverlay = ({ text = 'Generating social AI caption...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FBFAF7]/80 backdrop-blur-sm">
      <div className="bg-white p-6 rounded-2xl border border-[#E7E4DE] shadow-xl flex flex-col items-center max-w-xs text-center">
        <LoadingSpinner size="lg" className="mb-4" />
        <p className="text-sm font-semibold text-[#171717] animate-pulse">{text}</p>
        <p className="text-xs text-[#66645F] mt-1">Scanning image composition & context...</p>
      </div>
    </div>
  );
};
