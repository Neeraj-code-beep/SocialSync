import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WandSparkles,
  Image as ImageIcon,
  MessageSquare,
  History,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
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

  // Persistent Post History States
  const [posts, setPosts] = useState([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalPosts: 0,
    limit: 9,
    hasMore: false,
  });
  const [copiedPostId, setCopiedPostId] = useState(null);

  const fetchPosts = useCallback(async (page = 1) => {
    setIsLoadingPosts(true);
    setPostsError(null);
    try {
      const res = await captionService.getPosts(page, 9);
      if (res.success) {
        setPosts(res.posts || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user posts:', error);
      setPostsError('Failed to load post history. Please try again.');
    } finally {
      setIsLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(currentPage);
  }, [currentPage, fetchPosts]);

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

      // Prepend newly persisted post to the list if on first page
      if (res.post) {
        setPosts((prev) => {
          const exists = prev.some((p) => p._id === res.post._id);
          return exists ? prev : [res.post, ...prev];
        });
        setPagination((prev) => ({
          ...prev,
          totalPosts: (prev.totalPosts || 0) + 1,
        }));
      }
    } catch (error) {
      console.error('Caption error:', error);
      const msg =
        error.response?.data?.message || error.message || 'Generation failed. Please try again.';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPostCaption = (caption, postId) => {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    setCopiedPostId(postId);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedPostId(null), 2000);
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
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#171717] font-sans">
            Give your photo the right words
          </h1>
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
            <GlassCard
              hover={false}
              className="bg-white border-[#E7E4DE] shadow-2xs min-h-[380px] flex flex-col justify-between p-6"
            >
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
                      <p className="text-sm font-semibold text-[#171717]">
                        Your caption will appear here
                      </p>
                      <p className="text-xs text-[#66645F] mt-1 max-w-xs">
                        Upload an image on the left and click 'Generate caption'.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Persistent Post History Section */}
        <div className="mt-12 border-t border-[#E7E4DE] pt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645F] mb-1">
                <History className="w-3.5 h-3.5 text-[#8A8882]" />
                <span>SAVED HISTORY</span>
              </div>
              <h2 className="text-xl font-semibold text-[#171717]">Previous Captions & Posts</h2>
              <p className="text-xs text-[#66645F] mt-0.5">
                {pagination.totalPosts > 0
                  ? `Showing ${posts.length} of ${pagination.totalPosts} saved post${pagination.totalPosts === 1 ? '' : 's'}`
                  : 'All your previously generated captions are persistently stored in your account'}
              </p>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isLoadingPosts}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F4F2ED] text-xs font-semibold text-[#171717] border border-[#E7E4DE] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="text-xs font-medium text-[#66645F] px-2">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={!pagination.hasMore || isLoadingPosts}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F4F2ED] text-xs font-semibold text-[#171717] border border-[#E7E4DE] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
                  aria-label="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Posts Content Container */}
          {isLoadingPosts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl p-5 border border-[#E7E4DE] animate-pulse"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-xl bg-[#E7E4DE] flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 bg-[#E7E4DE] rounded w-3/4" />
                      <div className="h-3 bg-[#E7E4DE] rounded w-full" />
                      <div className="h-2 bg-[#E7E4DE] rounded w-1/2 mt-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : postsError ? (
            <div className="p-8 rounded-2xl bg-white border border-rose-200 text-center flex flex-col items-center justify-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
              <p className="text-sm font-semibold text-[#171717]">{postsError}</p>
              <button
                onClick={() => fetchPosts(currentPage)}
                className="mt-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-[#2b2b2b] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try again</span>
              </button>
            </div>
          ) : posts.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center border border-dashed border-[#E7E4DE] rounded-2xl bg-white">
              <div className="w-12 h-12 rounded-xl bg-[#F4F2ED] border border-[#E7E4DE] flex items-center justify-center text-[#8A8882] mb-3">
                <History className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-[#171717]">No saved posts yet</p>
              <p className="text-xs text-[#66645F] mt-1 max-w-sm">
                Upload an image above and generate your first caption to see your persistent history here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map((post) => (
                <GlassCard
                  key={post._id}
                  hover={false}
                  className="bg-white border-[#E7E4DE] shadow-2xs p-5 flex flex-col justify-between"
                >
                  <div className="flex gap-4 items-start">
                    {post.image ? (
                      <img
                        src={post.image}
                        alt="Post thumbnail"
                        className="w-20 h-20 rounded-xl object-cover border border-[#E7E4DE] bg-[#F4F2ED] flex-shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-[#F4F2ED] border border-[#E7E4DE] flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-6 h-6 text-[#8A8882]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#171717] font-sans leading-relaxed line-clamp-4 whitespace-pre-wrap">
                        {post.caption}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#E7E4DE] pt-3 mt-4 text-[11px] text-[#66645F]">
                    <span>
                      {post.createdAt
                        ? new Date(post.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Recent'}
                    </span>

                    <button
                      onClick={() => handleCopyPostCaption(post.caption, post._id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F4F2ED] hover:bg-[#E7E4DE] text-xs font-semibold text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer"
                      title="Copy caption"
                    >
                      {copiedPostId === post._id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-[11px]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#66645F]" />
                          <span className="text-[11px]">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
