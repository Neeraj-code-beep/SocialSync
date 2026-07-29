import React from 'react';

const FeatureCard = ({ icon: Icon, title, description, badge }) => {
  return (
    <div className="editorial-card editorial-card-hover rounded-2xl p-6 relative overflow-hidden group bg-white border border-[#E7E4DE]">
      {badge && (
        <span className="inline-block px-2.5 py-1 rounded-full bg-[#C8F135] text-[#171717] text-xs font-semibold mb-4">
          {badge}
        </span>
      )}

      <div className="w-12 h-12 rounded-xl bg-[#F4F2ED] border border-[#E7E4DE] flex items-center justify-center text-[#171717] mb-4 group-hover:scale-105 transition-transform">
        <Icon className="w-6 h-6 text-[#171717]" />
      </div>

      <h3 className="text-lg font-bold text-[#171717] mb-2 font-sans">{title}</h3>
      <p className="text-sm text-[#66645F] leading-relaxed">{description}</p>
    </div>
  );
};

export default FeatureCard;
