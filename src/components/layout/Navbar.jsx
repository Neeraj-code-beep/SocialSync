import React, { useState, useEffect } from 'react';
import { ArrowRight, LayoutDashboard, LogOut, User, Menu, X, Camera } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import GradientButton from '../GradientButton';

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navLinks = [
    { name: 'How it works', href: location.pathname === '/' ? '#how-it-works' : '/#how-it-works' },
    { name: 'Examples', href: location.pathname === '/' ? '#examples' : '/#examples' },
    { name: 'Features', href: location.pathname === '/' ? '#features' : '/#features' },
    { name: 'FAQ', href: location.pathname === '/' ? '#faq' : '/#faq' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#FBFAF7]/95 backdrop-blur-md border-b border-[#E7E4DE] shadow-xs'
          : 'bg-[#FBFAF7]/80 backdrop-blur-sm border-b border-[#E7E4DE]/60'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* Editorial Brand Wordmark */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <motion.img
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            src="/apple-touch-icon.png"
            alt="CaptionAI"
            className="w-8 h-8 rounded-lg object-contain shrink-0 shadow-2xs"
          />
          <span className="text-xl font-bold tracking-tight text-[#171717] font-sans">
            Caption<span className="text-[#66645F] font-normal">AI</span>
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#66645F]">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="relative py-1 hover:text-[#171717] transition-colors group"
            >
              <span>{link.name}</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-[#171717] transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              {location.pathname !== '/dashboard' && (
                <Link to="/dashboard">
                  <GradientButton size="sm" variant="outline" icon={LayoutDashboard}>
                    Workspace
                  </GradientButton>
                </Link>
              )}
              
              <div className="flex items-center gap-2 pl-3 border-l border-[#E7E4DE]">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F4F2ED] border border-[#E7E4DE] text-xs font-semibold text-[#171717]">
                  <User className="w-3.5 h-3.5 text-[#171717]" />
                  <span>{user?.username || 'Creator'}</span>
                </div>

                <button
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                  className="p-2 rounded-lg text-[#66645F] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm font-medium text-[#66645F] hover:text-[#171717] px-3 py-2 transition-colors">
                Log in
              </Link>
              <Link to="/signup">
                <GradientButton size="sm" variant="primary" icon={ArrowRight}>
                  Get started
                </GradientButton>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Trigger */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-[#171717] hover:bg-[#F4F2ED] transition-colors cursor-pointer"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </motion.button>
      </nav>

      {/* Animated Mobile Drawer Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden overflow-hidden border-b border-[#E7E4DE] bg-[#FBFAF7] px-6 py-6 shadow-lg"
          >
            <div className="flex flex-col space-y-3 text-sm font-medium text-[#66645F] mb-4">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#171717] py-1.5 border-b border-[#E7E4DE]/40"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <div className="pt-2 flex flex-col gap-3">
              {isAuthenticated ? (
                <>
                  <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <GradientButton fullWidth icon={LayoutDashboard}>
                      Open Workspace
                    </GradientButton>
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                      navigate('/');
                    }}
                    className="w-full text-center py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    Log out ({user?.username})
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="w-full">
                    <GradientButton variant="outline" fullWidth>
                      Log in
                    </GradientButton>
                  </Link>
                  <Link to="/signup" onClick={() => setMobileMenuOpen(false)} className="w-full">
                    <GradientButton fullWidth variant="primary" icon={ArrowRight}>
                      Get started
                    </GradientButton>
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
