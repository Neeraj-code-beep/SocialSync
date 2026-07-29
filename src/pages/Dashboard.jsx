import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WandSparkles, Image as ImageIcon, MessageSquare, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { captionService } from '../services/api';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import GlassCard from '../components/GlassCard';
import GradientButton from '../components/GradientButton';
import FileUpload from '../components/FileUpload';
import ImagePreview from '../components/ImagePreview';
import CaptionCard from '../components/CaptionCard';
import { LoadingOverlay } from '../components/LoadingSpinner';
import { usePageTitle } from '../hooks/usePageTitle';

const Dashboard = () => {
  usePageTitle('Workspace — CaptionAI');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [recentCaptions, setRecentCaptions] = useState([]);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setGeneratedCaption('');
  };

  const handleRemoveImage = () => {
    setSelectedFile(null);
    setGeneratedCaption('');
  };

  const handleGenerateCaption = async () => {
    if (!selectedFile) {
      toast.error('Please select an image first.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await captionService.generateCaption(selectedFile);
      setGeneratedCaption(res.caption);
      toast.success('Caption generated!');

      setRecentCaptions((prev) => [
        {
          id: Date.now(),
          text: res.caption,
          fileUrl: URL.createObjectURL(selectedFile),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ]);
    } catch (error) {
      console.error('Caption error:', error);
      const msg = error.response?.data?.message || error.message || 'Generation failed. Please try again.';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pt-20 bg-[#FBFAF7] text-[#171717]">
      <Navbar />

      {isGenerating && <LoadingOverlay text="Analyzing photo & writing caption..." />}

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 w-full py-8">
        {/* Workspace Title Header */}
        <div className="mb-8 border-b border-[#E7E4DE] pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645F] mb-1">
            <span className="w-2 h-2 rounded-full bg-[#C8F135]" />
            <span>CREATE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#171717] font-sans">Give your photo the right words</h1>
          <p className="text-sm text-[#66645F] mt-1">
            Upload an image to generate engagement-focused social media captions.
          </p>
        </div>

        {/* Studio Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Image Upload */}
          <div className="lg:col-span-5 space-y-6">
            <GlassCard hover={false} className="bg-white border-[#E7E4DE] shadow-2xs p-6">
              <h2 className="text-sm font-semibold text-[#171717] mb-4 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#171717]" />
                <span>Select image</span>
              </h2>

              {!selectedFile ? (
                <FileUpload onFileSelect={handleFileSelect} disabled={isGenerating} />
              ) : (
                <div className="space-y-4">
                  <ImagePreview
                    file={selectedFile}
                    onRemove={handleRemoveImage}
                    disabled={isGenerating}
                  />

                  <GradientButton
                    onClick={handleGenerateCaption}
                    disabled={isGenerating}
                    fullWidth
                    size="lg"
                    variant="primary"
                    icon={WandSparkles}
                  >
                    {isGenerating ? 'Writing...' : 'Generate caption'}
                  </GradientButton>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Right Column: AI Response Card */}
          <div className="lg:col-span-7 space-y-6">
            <GlassCard hover={false} className="bg-white border-[#E7E4DE] shadow-2xs min-h-[380px] flex flex-col justify-between p-6">
              <div>
                <h2 className="text-sm font-semibold text-[#171717] mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#171717]" />
                    <span>Generated caption</span>
                  </span>
                  {generatedCaption && (
                    <span className="text-xs font-semibold text-[#171717] bg-[#C8F135] px-2.5 py-1 rounded-full">
                      Ready to post
                    </span>
                  )}
                </h2>

                <AnimatePresence mode="wait">
                  {generatedCaption ? (
                    <CaptionCard
                      caption={generatedCaption}
                      onRegenerate={handleGenerateCaption}
                      isGenerating={isGenerating}
                    />
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-16 text-center flex flex-col items-center justify-center border border-dashed border-[#E7E4DE] rounded-2xl bg-[#FBFAF7]"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white border border-[#E7E4DE] flex items-center justify-center text-[#171717] mb-3 shadow-2xs">
                        <WandSparkles className="w-5 h-5 text-[#66645F]" />
                      </div>
                      <p className="text-sm font-semibold text-[#171717]">Your caption will appear here</p>
                      <p className="text-xs text-[#66645F] mt-1 max-w-xs">
                        Upload an image on the left and click 'Generate caption'.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>

            {/* Session History Feed */}
            {recentCaptions.length > 0 && (
              <GlassCard hover={false} className="bg-white border-[#E7E4DE] shadow-2xs p-6">
                <h3 className="text-xs font-semibold text-[#66645F] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-[#8A8882]" />
                  <span>Session History</span>
                </h3>

                <div className="space-y-2">
                  {recentCaptions.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#F4F2ED] border border-[#E7E4DE] flex items-center justify-between text-xs text-[#171717]"
                    >
                      <p className="truncate max-w-[80%] font-mono">{item.text}</p>
                      <span className="text-[#8A8882] font-medium">{item.time}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
