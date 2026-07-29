import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10;

const FileUpload = ({ onFileSelect, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const validateAndPassFile = (file) => {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Unsupported image format. Please upload JPG, PNG or WEBP.');
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Image is too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }

    onFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPassFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: disabled ? 1 : 1.002 }}
      whileTap={{ scale: disabled ? 1 : 0.995 }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 group ${
        isDragging
          ? 'border-[#C8F135] bg-[#ECFFC1]/30 scale-[1.005]'
          : 'border-[#D8D4CC] hover:border-[#171717] bg-[#FBFAF7] hover:bg-[#F4F2ED]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && validateAndPassFile(e.target.files[0])}
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        disabled={disabled}
      />

      <div className="flex flex-col items-center justify-center gap-3">
        <motion.div
          whileHover={{ y: -3 }}
          className="w-14 h-14 rounded-2xl bg-white border border-[#E7E4DE] flex items-center justify-center text-[#171717] shadow-2xs group-hover:border-[#171717] transition-colors"
        >
          <UploadCloud className="w-7 h-7 group-hover:-translate-y-0.5 transition-transform" />
        </motion.div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#171717]">
            Drag and drop your photo here, or{' '}
            <span className="underline decoration-[#171717] underline-offset-2">choose a file</span>
          </p>
          <p className="text-xs text-[#66645F]">
            Supports JPG, PNG, WEBP up to {MAX_SIZE_MB}MB
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#66645F] bg-white px-3 py-1 rounded-full border border-[#E7E4DE] mt-1 shadow-2xs">
          <ImageIcon className="w-3.5 h-3.5 text-[#171717]" />
          <span>Multimodal visual analysis</span>
        </div>
      </div>
    </motion.div>
  );
};

export default FileUpload;
