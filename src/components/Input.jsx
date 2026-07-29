import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

export const Input = ({
  label,
  error,
  icon: Icon,
  type = 'text',
  className = '',
  id,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wider text-[#171717]"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {Icon && (
          <Icon className="w-4 h-4 text-[#8A8882] absolute left-3.5 pointer-events-none transition-colors" />
        )}

        <input
          id={id}
          type={inputType}
          className={`w-full ${
            Icon ? 'pl-10' : 'pl-4'
          } ${isPassword ? 'pr-10' : 'pr-4'} py-2.5 rounded-xl editorial-input text-sm text-[#171717] placeholder:text-[#8A8882] transition-all ${
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''
          } ${className}`}
          {...props}
        />

        {isPassword && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 p-1 rounded-lg text-[#8A8882] hover:text-[#171717] transition-colors cursor-pointer"
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </motion.button>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-rose-600 mt-1">{error}</p>}
    </div>
  );
};
