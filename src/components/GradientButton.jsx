import React from 'react';
import { motion } from 'framer-motion';

const GradientButton = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  fullWidth = false,
  size = 'md',
  variant = 'primary',
  className = '',
  icon: Icon,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs font-medium rounded-lg',
    md: 'px-4.5 py-2.5 text-sm font-medium rounded-xl',
    lg: 'px-6 py-3 text-base font-semibold rounded-xl',
  };

  const variants = {
    primary:
      'bg-[#171717] hover:bg-[#252525] text-white shadow-sm hover:shadow-md border border-[#171717]',
    secondary:
      'bg-[#F4F2ED] text-[#171717] hover:bg-[#E7E4DE] hover:border-[#D8D4CC] border border-[#E7E4DE]',
    outline:
      'bg-white text-[#171717] border border-[#D8D4CC] hover:bg-[#FBFAF7] hover:border-[#171717] shadow-2xs hover:shadow-xs',
    ghost:
      'bg-transparent text-[#66645F] hover:text-[#171717] hover:bg-[#F4F2ED]',
    accent:
      'bg-[#C8F135] text-[#171717] hover:bg-[#b8e125] font-semibold shadow-2xs hover:shadow-xs border border-[#b8e125]',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 shadow-2xs',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.01, y: disabled ? 0 : -2 }}
      whileTap={{ scale: disabled ? 1 : 0.985 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]/20 disabled:opacity-50 disabled:cursor-not-allowed ${
        sizeClasses[size]
      } ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />}
      <span>{children}</span>
    </motion.button>
  );
};

export default GradientButton;
