import React from 'react';

const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-[#FBFAF7]">
      {/* Subtle warm ambient top glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-[#F4F2ED]/80 via-[#F4F2ED]/30 to-transparent blur-3xl" />
    </div>
  );
};

export default AnimatedBackground;
