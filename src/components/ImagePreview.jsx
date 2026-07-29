import React from 'react';
import { X, FileImage } from 'lucide-react';
import { motion } from 'framer-motion';

const ImagePreview = ({ file, previewUrl, onRemove, disabled = false }) => {
  if (!file && !previewUrl) return null;

  const url = previewUrl || (file ? URL.createObjectURL(file) : null);
  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(2) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative rounded-2xl overflow-hidden border border-[#E7E4DE] bg-[#F4F2ED] p-3"
    >
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-white flex items-center justify-center border border-[#E7E4DE]">
        <img
          src={url}
          alt="Uploaded content preview"
          className="w-full h-full object-contain"
        />
        
        {!disabled && (
          <button
            onClick={onRemove}
            className="absolute top-3 right-3 p-2 rounded-full bg-[#171717]/80 text-white hover:bg-rose-600 transition-colors shadow-sm cursor-pointer"
            title="Remove image"
            aria-label="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {file && (
        <div className="flex items-center justify-between mt-3 px-2 text-xs text-[#66645F]">
          <div className="flex items-center gap-2 truncate max-w-[70%]">
            <FileImage className="w-3.5 h-3.5 text-[#171717] shrink-0" />
            <span className="truncate font-medium">{file.name}</span>
          </div>
          <span className="font-mono text-[#8A8882]">{fileSizeMB} MB</span>
        </div>
      )}
    </motion.div>
  );
};

export default ImagePreview;
