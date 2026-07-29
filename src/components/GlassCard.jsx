import React from 'react';
import { motion } from 'framer-motion';

const GlassCard = ({ children, className = '', hover = true, ...props }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`editorial-card rounded-2xl p-6 ${
        hover ? 'editorial-card-hover' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
