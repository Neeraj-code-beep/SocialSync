import React, { useState, useEffect } from 'react';
import { Copy, Check, Download, RefreshCw, WandSparkles, Hash, Share2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import GradientButton from './GradientButton';

const CaptionCard = ({ caption, onRegenerate, isGenerating }) => {
  const [copied, setCopied] = useState(false);
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!caption) {
      setDisplayedText('');
      return;
    }
    let index = 0;
    setDisplayedText('');
    const timer = setInterval(() => {
      if (index < caption.length) {
        setDisplayedText((prev) => prev + caption.charAt(index));
        index++;
      } else {
        clearInterval(timer);
      }
    }, 12);

    return () => clearInterval(timer);
  }, [caption]);

  const handleCopy = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    if (!caption) return;
    const element = document.createElement('a');
    const file = new Blob([caption], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `caption-ai-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Downloaded as TXT file');
  };

  const handleShare = async () => {
    if (!caption) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AI Caption', text: caption });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  if (!caption) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="editorial-card rounded-2xl p-6 bg-white border border-[#E7E4DE] shadow-2xs relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E7E4DE] pb-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#171717] text-white">
            <WandSparkles className="w-4 h-4 text-[#C8F135]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#171717]">Generated Caption</h3>
            <p className="text-xs text-[#66645F]">Ready to post across Instagram, LinkedIn & Twitter</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F2ED] hover:bg-[#E7E4DE] text-xs font-semibold text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4F2ED] hover:bg-[#E7E4DE] text-xs font-semibold text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer"
            title="Download TXT"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">TXT</span>
          </button>

          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg bg-[#F4F2ED] hover:bg-[#E7E4DE] text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer"
            title="Share"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Text Content */}
      <div className="min-h-[100px] max-h-[280px] overflow-y-auto pr-2 text-[#171717] text-sm leading-relaxed whitespace-pre-wrap font-sans">
        {displayedText}
        {displayedText.length < caption.length && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-[#171717] animate-pulse" />
        )}
      </div>

      {/* Footer Meta */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#E7E4DE] pt-4 mt-4 text-xs text-[#66645F]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 font-medium">
            <Hash className="w-3.5 h-3.5 text-[#171717]" />
            <span>{caption.length} characters</span>
          </span>
          <span>•</span>
          <span className="font-medium">{caption.split(/\s+/).filter(Boolean).length} words</span>
        </div>

        <GradientButton
          onClick={onRegenerate}
          disabled={isGenerating}
          size="sm"
          variant="outline"
          icon={RefreshCw}
        >
          {isGenerating ? 'Writing...' : 'Regenerate'}
        </GradientButton>
      </div>
    </motion.div>
  );
};

export default CaptionCard;
