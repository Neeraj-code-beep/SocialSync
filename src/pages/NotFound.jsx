import React from 'react';
import { motion } from 'framer-motion';
import { Camera, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import GradientButton from '../components/GradientButton';
import { usePageTitle } from '../hooks/usePageTitle';

const NotFound = () => {
  usePageTitle('Page Not Found — CaptionAI');
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 text-center bg-[#FBFAF7]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="editorial-card p-10 rounded-3xl max-w-md bg-white border border-[#E7E4DE] shadow-sm"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#171717] text-white flex items-center justify-center mx-auto mb-6">
          <Camera className="w-7 h-7 text-[#C8F135]" />
        </div>
        <h1 className="text-6xl font-bold text-[#171717] font-sans tracking-tight">
          404
        </h1>
        <h2 className="text-xl font-semibold text-[#171717] mt-2">Page Not Found</h2>
        <p className="text-sm text-[#66645F] mt-2 mb-8 leading-relaxed">
          The requested page does not exist or has been moved to another route in the studio.
        </p>

        <Link to="/">
          <GradientButton fullWidth variant="primary" icon={ArrowLeft}>
            Back to Home Page
          </GradientButton>
        </Link>
      </motion.div>
    </div>
  );
};

export default NotFound;
