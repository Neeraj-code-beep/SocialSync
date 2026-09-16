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
  Linkedin,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Edit3,
  X,
  RotateCcw,
  BarChart2,
  Eye,
  Users,
  ThumbsUp,
  Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { captionService, socialService, postService } from '../services/api';
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
  usePageTitle('Workspace — SocialSync');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [currentPostId, setCurrentPostId] = useState(null);

  // Connected Social Accounts State
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isConnectingLinkedIn, setIsConnectingLinkedIn] = useState(false);

  // Publishing State Management
  const [publishingPostId, setPublishingPostId] = useState(null);
  const [publicationsMap, setPublicationsMap] = useState({}); // { [postId]: Publication[] }
  const [syncingPubId, setSyncingPubId] = useState(null);
  const [deletingPubId, setDeletingPubId] = useState(null);

  // Edit Commentary Modal State
  const [editingModal, setEditingModal] = useState(null); // { postId, publicationId, commentary, isSaving }
  // Delete Confirmation Modal State
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(null); // { postId, publicationId, postTitle }
  // Analytics Modal State
  const [analyticsModal, setAnalyticsModal] = useState(null); // { postId, publicationId, platformPostId, isLoading, error, errorCode, metrics, capturedAt, aggregation }

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

  const fetchSocialAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await socialService.getAccounts();
      if (res.success) {
        setSocialAccounts(res.accounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch connected social accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  const loadPublicationsForPosts = useCallback(async (postList) => {
    if (!postList || postList.length === 0) return;
    try {
      const entries = await Promise.all(
        postList.map(async (p) => {
          try {
            const res = await postService.getPublications(p._id);
            return [p._id, res.publications || []];
          } catch {
            return [p._id, []];
          }
        })
      );
      setPublicationsMap((prev) => {
        const next = { ...prev };
        entries.forEach(([postId, pubs]) => {
          next[postId] = pubs;
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to fetch publications for posts:', err);
    }
  }, []);

  const fetchPosts = useCallback(async (page = 1) => {
    setIsLoadingPosts(true);
    setPostsError(null);
    try {
      const res = await captionService.getPosts(page, 9);
      if (res.success) {
        const loadedPosts = res.posts || [];
        setPosts(loadedPosts);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        loadPublicationsForPosts(loadedPosts);
      }
    } catch (error) {
      console.error('Failed to fetch user posts:', error);
      setPostsError('Failed to load post history. Please try again.');
    } finally {
      setIsLoadingPosts(false);
    }
  }, [loadPublicationsForPosts]);

  // Handle OAuth redirect query parameters (success / failure feedback)
  useEffect(() => {
    fetchSocialAccounts();

    const searchParams = new URLSearchParams(window.location.search);
    const connectionStatus = searchParams.get('connection');
    const accountName = searchParams.get('account');
    const reason = searchParams.get('reason');

    if (connectionStatus === 'linkedin_success') {
      toast.success(
        accountName ? `LinkedIn connected as ${accountName}!` : 'LinkedIn account connected successfully!'
      );
      fetchSocialAccounts();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (connectionStatus === 'linkedin_error') {
      toast.error(reason || 'Failed to connect LinkedIn. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchSocialAccounts]);

  useEffect(() => {
    fetchPosts(currentPage);
  }, [currentPage, fetchPosts]);

  const handleConnectLinkedIn = async () => {
    setIsConnectingLinkedIn(true);
    try {
      const res = await socialService.getLinkedInConnectUrl();
      if (res.success && res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        toast.error('Could not initiate LinkedIn connection.');
        setIsConnectingLinkedIn(false);
      }
    } catch (err) {
      console.error('LinkedIn connect initiation error:', err);
      const msg = err.response?.data?.message || 'Failed to start LinkedIn connection.';
      toast.error(msg);
      setIsConnectingLinkedIn(false);
    }
  };

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
      if (res.post?._id) {
        setCurrentPostId(res.post._id);
      }
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

  const handlePublishToLinkedIn = async (postId) => {
    if (!postId) return;
    const linkedinAccount = socialAccounts.find(
      (a) => a.platform === 'linkedin' && a.connectionStatus === 'connected'
    );

    if (!linkedinAccount) {
      toast.error('Please connect your LinkedIn account first.');
      handleConnectLinkedIn();
      return;
    }

    setPublishingPostId(postId);
    try {
      const res = await postService.publishToLinkedIn(postId, linkedinAccount._id);
      if (res.success) {
        toast.success('Post published to LinkedIn successfully!');
        // Update publication map
        if (res.publication) {
          setPublicationsMap((prev) => ({
            ...prev,
            [postId]: [res.publication, ...(prev[postId] || []).filter((p) => p._id !== res.publication._id)],
          }));
        }
      }
    } catch (err) {
      console.error('LinkedIn publishing error:', err);
      if (err.response?.status === 409) {
        toast('Post is already published to LinkedIn.', { icon: 'ℹ️' });
        if (err.response.data?.publication) {
          setPublicationsMap((prev) => ({
            ...prev,
            [postId]: [err.response.data.publication, ...(prev[postId] || [])],
          }));
        }
      } else {
        const msg =
          err.response?.data?.message || err.message || 'Failed to publish post to LinkedIn.';
        toast.error(msg);
      }
    } finally {
      setPublishingPostId(null);
    }
  };

  const handleSyncPublication = async (postId, publicationId) => {
    if (!postId || !publicationId) return;
    setSyncingPubId(publicationId);
    try {
      const res = await postService.syncPublication(postId, publicationId);
      if (res.success && res.publication) {
        toast.success(res.message || 'Publication synced with LinkedIn!');
        setPublicationsMap((prev) => ({
          ...prev,
          [postId]: (prev[postId] || []).map((pub) =>
            pub._id === publicationId ? { ...pub, ...res.publication } : pub
          ),
        }));
      }
    } catch (err) {
      console.error('Sync publication error:', err);
      const msg = err.response?.data?.message || 'Failed to synchronize with LinkedIn.';
      toast.error(msg);
    } finally {
      setSyncingPubId(null);
    }
  };

  const handleOpenEditModal = (postId, publication, currentCaption) => {
    setEditingModal({
      postId,
      publicationId: publication._id,
      commentary: currentCaption || '',
      isSaving: false,
    });
  };

  const handleSaveCommentary = async () => {
    if (!editingModal) return;
    const { postId, publicationId, commentary } = editingModal;
    if (!commentary || !commentary.trim()) {
      toast.error('Commentary cannot be empty.');
      return;
    }

    setEditingModal((prev) => ({ ...prev, isSaving: true }));
    try {
      const res = await postService.updatePublicationCommentary(postId, publicationId, commentary.trim());
      if (res.success) {
        toast.success('LinkedIn commentary updated successfully!');
        // Update local post state
        setPosts((prev) =>
          prev.map((p) => (p._id === postId ? { ...p, caption: commentary.trim() } : p))
        );
        // Update publications map
        if (res.publication) {
          setPublicationsMap((prev) => ({
            ...prev,
            [postId]: (prev[postId] || []).map((pub) =>
              pub._id === publicationId ? { ...pub, ...res.publication } : pub
            ),
          }));
        }
        setEditingModal(null);
      }
    } catch (err) {
      console.error('Update commentary error:', err);
      const msg = err.response?.data?.message || 'Failed to update commentary on LinkedIn.';
      toast.error(msg);
      setEditingModal((prev) => ({ ...prev, isSaving: false }));
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteModal) return;
    const { postId, publicationId } = confirmDeleteModal;

    setDeletingPubId(publicationId);
    try {
      const res = await postService.deletePublication(postId, publicationId);
      if (res.success) {
        toast.success('Publication deleted from LinkedIn.');
        setPublicationsMap((prev) => ({
          ...prev,
          [postId]: (prev[postId] || []).map((pub) =>
            pub._id === publicationId ? { ...pub, status: 'deleted', deletedAt: new Date() } : pub
          ),
        }));
      }
    } catch (err) {
      console.error('Delete publication error:', err);
      const msg = err.response?.data?.message || 'Failed to delete publication from LinkedIn.';
      toast.error(msg);
    } finally {
      setDeletingPubId(null);
      setConfirmDeleteModal(null);
    }
  };

  const handleOpenAnalyticsModal = async (postId, publication) => {
    if (!postId || !publication) return;

    setAnalyticsModal({
      postId,
      publicationId: publication._id,
      platformPostId: publication.platformPostId,
      isLoading: true,
      error: null,
      errorCode: null,
      metrics: null,
      capturedAt: null,
      aggregation: 'TOTAL',
      isRefreshing: false,
    });

    try {
      const res = await postService.getPublicationAnalytics(postId, publication._id, {
        aggregation: 'TOTAL',
      });

      if (res.success) {
        setAnalyticsModal((prev) =>
          prev && prev.publicationId === publication._id
            ? {
                ...prev,
                isLoading: false,
                metrics: res.metrics,
                capturedAt: res.capturedAt,
                aggregation: res.aggregation,
                error: null,
                errorCode: null,
              }
            : prev
        );
      }
    } catch (err) {
      console.error('Fetch post analytics error:', err);
      const msg =
        err.response?.data?.message || err.message || 'Failed to load post analytics from LinkedIn.';
      const code = err.response?.data?.errorCode || (err.response?.status === 403 ? 'ANALYTICS_FORBIDDEN' : 'ANALYTICS_ERROR');
      setAnalyticsModal((prev) =>
        prev && prev.publicationId === publication._id
          ? {
              ...prev,
              isLoading: false,
              error: msg,
              errorCode: code,
            }
          : prev
      );
    }
  };

  const handleRefreshAnalytics = async () => {
    if (!analyticsModal) return;
    const { postId, publicationId, aggregation } = analyticsModal;

    setAnalyticsModal((prev) => ({ ...prev, isRefreshing: true, error: null }));
    try {
      const res = await postService.getPublicationAnalytics(postId, publicationId, {
        aggregation: aggregation || 'TOTAL',
      });

      if (res.success) {
        toast.success('Analytics refreshed!');
        setAnalyticsModal((prev) =>
          prev
            ? {
                ...prev,
                isRefreshing: false,
                metrics: res.metrics,
                capturedAt: res.capturedAt,
                aggregation: res.aggregation,
                error: null,
                errorCode: null,
              }
            : prev
        );
      }
    } catch (err) {
      console.error('Refresh post analytics error:', err);
      const msg =
        err.response?.data?.message || err.message || 'Failed to refresh post analytics from LinkedIn.';
      const code = err.response?.data?.errorCode || (err.response?.status === 403 ? 'ANALYTICS_FORBIDDEN' : 'ANALYTICS_ERROR');
      toast.error(msg);
      setAnalyticsModal((prev) =>
        prev
          ? {
              ...prev,
              isRefreshing: false,
              error: msg,
              errorCode: code,
            }
          : prev
      );
    }
  };

  const handleCopyPostCaption = (caption, postId) => {
    if (!caption) return;
    navigator.clipboard.writeText(caption);
    setCopiedPostId(postId);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedPostId(null), 2000);
  };

  const getLinkedInPostUrl = (platformPostId) => {
    if (!platformPostId || typeof platformPostId !== 'string') return null;
    return `https://www.linkedin.com/feed/update/${encodeURIComponent(platformPostId)}`;
  };

  return (
    <div className="min-h-screen flex flex-col pt-20 bg-[#FBFAF7] text-[#171717]">
      <Navbar />

      {isGenerating && <LoadingOverlay text="Analyzing photo & writing caption..." />}

      {/* Edit Commentary Modal */}
      <AnimatePresence>
        {editingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl border border-[#E7E4DE] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#E7E4DE] pb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[#0077B5]" />
                  <h3 className="text-sm font-semibold text-[#171717]">Edit LinkedIn Commentary</h3>
                </div>
                <button
                  onClick={() => setEditingModal(null)}
                  className="p-1 rounded-lg hover:bg-[#F4F2ED] text-[#66645F] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <textarea
                  value={editingModal.commentary}
                  onChange={(e) =>
                    setEditingModal((prev) => ({ ...prev, commentary: e.target.value }))
                  }
                  rows={5}
                  maxLength={3000}
                  className="w-full text-xs font-sans leading-relaxed p-3 rounded-xl border border-[#E7E4DE] focus:border-[#171717] focus:ring-1 focus:ring-[#171717] outline-hidden bg-[#FBFAF7] resize-none"
                  placeholder="Enter updated post commentary..."
                />
                <div className="flex justify-between text-[11px] text-[#66645F]">
                  <span>LinkedIn Posts REST API (Partial Update)</span>
                  <span>{editingModal.commentary.length} / 3000</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E4DE]">
                <button
                  onClick={() => setEditingModal(null)}
                  disabled={editingModal.isSaving}
                  className="px-3.5 py-1.5 rounded-xl border border-[#E7E4DE] text-xs font-semibold hover:bg-[#F4F2ED] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCommentary}
                  disabled={editingModal.isSaving || !editingModal.commentary.trim()}
                  className="px-4 py-1.5 rounded-xl bg-[#0077B5] hover:bg-[#006097] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {editingModal.isSaving ? 'Saving to LinkedIn...' : 'Save commentary'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-[#E7E4DE] space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 flex-shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#171717]">Delete from LinkedIn?</h3>
                  <p className="text-xs text-[#66645F] mt-0.5">
                    This will delete the publication from your LinkedIn profile. Your local draft history will remain intact.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E4DE]">
                <button
                  onClick={() => setConfirmDeleteModal(null)}
                  disabled={deletingPubId === confirmDeleteModal.publicationId}
                  className="px-3.5 py-1.5 rounded-xl border border-[#E7E4DE] text-xs font-semibold hover:bg-[#F4F2ED] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deletingPubId === confirmDeleteModal.publicationId}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {deletingPubId === confirmDeleteModal.publicationId ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Analytics Modal */}
      <AnimatePresence>
        {analyticsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl border border-[#E7E4DE] space-y-4"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#E7E4DE] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0077B5]/10 text-[#0077B5] flex items-center justify-center">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#171717]">LinkedIn Post Analytics</h3>
                    <p className="text-[11px] text-[#66645F]">
                      Official Member Creator Statistics API (202608)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleRefreshAnalytics}
                    disabled={analyticsModal.isLoading || analyticsModal.isRefreshing}
                    className="p-1.5 rounded-lg hover:bg-[#F4F2ED] text-[#66645F] transition-colors cursor-pointer disabled:opacity-50"
                    title="Refresh analytics data"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${analyticsModal.isRefreshing ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => setAnalyticsModal(null)}
                    className="p-1.5 rounded-lg hover:bg-[#F4F2ED] text-[#66645F] transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              {analyticsModal.isLoading ? (
                <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0077B5]" />
                  <p className="text-xs font-semibold text-[#171717]">
                    Fetching post analytics from LinkedIn...
                  </p>
                  <p className="text-[11px] text-[#66645F]">
                    Querying Member Creator Statistics endpoint
                  </p>
                </div>
              ) : analyticsModal.error ? (
                <div className="space-y-4 py-2">
                  {analyticsModal.errorCode === 'ANALYTICS_FORBIDDEN' ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-semibold text-amber-900">
                            LinkedIn Permission Update Required
                          </h4>
                          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                            LinkedIn requires the <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-[10px]">r_member_postAnalytics</code> permission to view post performance. Please reconnect your account to grant analytics access.
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            setAnalyticsModal(null);
                            handleConnectLinkedIn();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0077B5] hover:bg-[#006097] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Linkedin className="w-3.5 h-3.5 fill-current" />
                          <span>Reconnect LinkedIn</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-semibold text-rose-900">Analytics Error</h4>
                          <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                            {analyticsModal.error}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={handleRefreshAnalytics}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171717] hover:bg-[#2b2b2b] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Try Again</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : analyticsModal.metrics ? (
                <div className="space-y-4 py-1">
                  {/* Metrics Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* Impressions */}
                    <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#66645F] text-[11px] font-medium">
                        <Eye className="w-3.5 h-3.5 text-[#0077B5]" />
                        <span>Impressions</span>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">
                        {analyticsModal.metrics.impressions !== null
                          ? analyticsModal.metrics.impressions.toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>

                    {/* Members Reached */}
                    <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#66645F] text-[11px] font-medium">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Unique Reach</span>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">
                        {analyticsModal.metrics.membersReached !== null
                          ? analyticsModal.metrics.membersReached.toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>

                    {/* Reactions */}
                    <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#66645F] text-[11px] font-medium">
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Reactions</span>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">
                        {analyticsModal.metrics.reactions !== null
                          ? analyticsModal.metrics.reactions.toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>

                    {/* Comments */}
                    <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#66645F] text-[11px] font-medium">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                        <span>Comments</span>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">
                        {analyticsModal.metrics.comments !== null
                          ? analyticsModal.metrics.comments.toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>

                    {/* Reshares */}
                    <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#66645F] text-[11px] font-medium">
                        <Share2 className="w-3.5 h-3.5 text-purple-600" />
                        <span>Reshares</span>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">
                        {analyticsModal.metrics.reshares !== null
                          ? analyticsModal.metrics.reshares.toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Modal Footer info */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#E7E4DE] text-[11px] text-[#66645F]">
                    <span>
                      {analyticsModal.capturedAt
                        ? `Captured: ${new Date(analyticsModal.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Snapshot saved'}
                    </span>
                    <span className="font-semibold uppercase tracking-wider text-[10px] bg-[#F4F2ED] px-2 py-0.5 rounded border border-[#E7E4DE]">
                      {analyticsModal.aggregation || 'TOTAL'} AGGREGATION
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Close Button */}
              <div className="flex items-center justify-end pt-2 border-t border-[#E7E4DE]">
                <button
                  onClick={() => setAnalyticsModal(null)}
                  className="px-4 py-1.5 rounded-xl border border-[#E7E4DE] text-xs font-semibold hover:bg-[#F4F2ED] transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 w-full py-8">
        {/* Workspace Title Header */}
        <div className="mb-8 border-b border-[#E7E4DE] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645F] mb-1">
              <span className="w-2 h-2 rounded-full bg-[#C8F135]" />
              <span>CREATE & SYNC</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[#171717] font-sans">
              Give your photo the right words
            </h1>
            <p className="text-sm text-[#66645F] mt-1">
              Upload an image to generate engagement-focused captions and manage your LinkedIn publications.
            </p>
          </div>

          {/* Social Platform Quick Status */}
          <div className="flex items-center gap-3">
            {isLoadingAccounts ? (
              <div className="h-10 w-44 bg-white border border-[#E7E4DE] rounded-xl animate-pulse" />
            ) : (() => {
              const linkedinAccount = socialAccounts.find((a) => a.platform === 'linkedin');
              if (linkedinAccount) {
                return (
                  <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white border border-[#E7E4DE] shadow-2xs">
                    {linkedinAccount.profileImageUrl ? (
                      <img
                        src={linkedinAccount.profileImageUrl}
                        alt={linkedinAccount.displayName}
                        className="w-7 h-7 rounded-full object-cover border border-[#E7E4DE]"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[#0077B5]/10 text-[#0077B5] flex items-center justify-center font-bold text-xs">
                        in
                      </div>
                    )}
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#171717]">
                          {linkedinAccount.displayName}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Connected
                        </span>
                      </div>
                      <span className="text-[10px] text-[#66645F]">LinkedIn Profile</span>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  onClick={handleConnectLinkedIn}
                  disabled={isConnectingLinkedIn}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0077B5] hover:bg-[#006097] text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Linkedin className="w-3.5 h-3.5 fill-current" />
                  <span>{isConnectingLinkedIn ? 'Connecting...' : 'Connect LinkedIn'}</span>
                </button>
              );
            })()}
          </div>
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
                    <div className="flex items-center gap-2">
                      {currentPostId && (() => {
                        const postPubs = publicationsMap[currentPostId] || [];
                        const activePub = postPubs.find((p) => p.status === 'published');
                        if (activePub) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Published to LinkedIn</span>
                            </span>
                          );
                        }
                        return (
                          <button
                            onClick={() => handlePublishToLinkedIn(currentPostId)}
                            disabled={publishingPostId === currentPostId}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0077B5] hover:bg-[#006097] text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                          >
                            <Linkedin className="w-3 h-3 fill-current" />
                            <span>
                              {publishingPostId === currentPostId ? 'Publishing image...' : 'Publish to LinkedIn'}
                            </span>
                          </button>
                        );
                      })()}
                      <span className="text-xs font-semibold text-[#171717] bg-[#C8F135] px-2.5 py-1 rounded-full">
                        Ready to post
                      </span>
                    </div>
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
                <span>SAVED HISTORY & PUBLICATIONS</span>
              </div>
              <h2 className="text-xl font-semibold text-[#171717]">Previous Captions & LinkedIn Posts</h2>
              <p className="text-xs text-[#66645F] mt-0.5">
                {pagination.totalPosts > 0
                  ? `Showing ${posts.length} of ${pagination.totalPosts} saved post${pagination.totalPosts === 1 ? '' : 's'}`
                  : 'All your previously generated captions and publications are persistently stored in your account'}
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
              {posts.map((post) => {
                const postPubs = publicationsMap[post._id] || [];
                const latestPub = postPubs[0] || null;

                return (
                  <GlassCard
                    key={post._id}
                    hover={false}
                    className="bg-white border-[#E7E4DE] shadow-2xs p-5 flex flex-col justify-between"
                  >
                    <div>
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

                      {/* Publication Status & Management Actions */}
                      {latestPub && (
                        <div className="mt-4 p-2.5 rounded-xl bg-[#FBFAF7] border border-[#E7E4DE] space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Linkedin className="w-3.5 h-3.5 text-[#0077B5]" />
                              {latestPub.status === 'published' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Published
                                </span>
                              )}
                              {latestPub.status === 'deleted' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  Deleted
                                </span>
                              )}
                              {latestPub.status === 'failed' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  Failed
                                </span>
                              )}
                              {latestPub.status === 'publishing' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                                  Publishing
                                </span>
                              )}
                            </div>

                            {/* View on LinkedIn Link */}
                            {latestPub.status === 'published' && latestPub.platformPostId && (
                              <a
                                href={getLinkedInPostUrl(latestPub.platformPostId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0077B5] hover:underline"
                                title="View live post on LinkedIn"
                              >
                                <span>View</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>

                          {/* Action Toolbar for Published Post */}
                          {latestPub.status === 'published' && (
                            <div className="flex items-center justify-between border-t border-[#E7E4DE] pt-2">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleSyncPublication(post._id, latestPub._id)}
                                  disabled={syncingPubId === latestPub._id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-[#F4F2ED] text-[11px] font-semibold text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer disabled:opacity-50"
                                  title="Sync status with LinkedIn"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 ${
                                      syncingPubId === latestPub._id ? 'animate-spin' : ''
                                    }`}
                                  />
                                  <span>Sync</span>
                                </button>

                                <button
                                  onClick={() => handleOpenAnalyticsModal(post._id, latestPub)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-[#F4F2ED] text-[11px] font-semibold text-[#0077B5] border border-[#E7E4DE] transition-colors cursor-pointer"
                                  title="View post analytics"
                                >
                                  <BarChart2 className="w-3 h-3 text-[#0077B5]" />
                                  <span>Analytics</span>
                                </button>

                                <button
                                  onClick={() => handleOpenEditModal(post._id, latestPub, post.caption)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-[#F4F2ED] text-[11px] font-semibold text-[#171717] border border-[#E7E4DE] transition-colors cursor-pointer"
                                  title="Edit post commentary"
                                >
                                  <Edit3 className="w-3 h-3 text-[#66645F]" />
                                  <span>Edit</span>
                                </button>
                              </div>

                              <button
                                onClick={() =>
                                  setConfirmDeleteModal({
                                    postId: post._id,
                                    publicationId: latestPub._id,
                                  })
                                }
                                disabled={deletingPubId === latestPub._id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-rose-50 text-[11px] font-semibold text-rose-600 border border-[#E7E4DE] transition-colors cursor-pointer disabled:opacity-50"
                                title="Delete post from LinkedIn"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}

                          {/* Retry for Failed Post */}
                          {latestPub.status === 'failed' && (
                            <div className="flex items-center justify-end border-t border-[#E7E4DE] pt-2">
                              <button
                                onClick={() => handlePublishToLinkedIn(post._id)}
                                disabled={publishingPostId === post._id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0077B5] hover:bg-[#006097] text-[11px] font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retry Publish</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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

                      <div className="flex items-center gap-2">
                        {/* If not published or previously deleted, show Publish button */}
                        {(!latestPub || latestPub.status === 'deleted') && (
                          <button
                            onClick={() => handlePublishToLinkedIn(post._id)}
                            disabled={publishingPostId === post._id}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0077B5] hover:bg-[#006097] text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            title="Publish to LinkedIn"
                          >
                            <Linkedin className="w-3 h-3 fill-current" />
                            <span>
                              {publishingPostId === post._id ? 'Publishing...' : 'Publish'}
                            </span>
                          </button>
                        )}

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
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
