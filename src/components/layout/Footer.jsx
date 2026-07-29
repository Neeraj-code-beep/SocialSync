import React from 'react';
import { Camera, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="w-full border-t border-[#E7E4DE] bg-[#FBFAF7] mt-20">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <img src="/apple-touch-icon.png" alt="CaptionAI" className="w-7 h-7 rounded-lg object-contain shrink-0" />
          <span className="text-sm font-semibold text-[#171717]">
            CaptionAI &copy; {new Date().getFullYear()} — Social Media AI Vision Engine
          </span>
        </div>

        <div className="flex items-center gap-6 text-xs font-medium text-[#66645F]">
          <Link to="/" className="hover:text-[#171717] transition-colors">Privacy</Link>
          <Link to="/" className="hover:text-[#171717] transition-colors">Terms</Link>
          <Link to="/" className="hover:text-[#171717] transition-colors">API Docs</Link>
          <span className="flex items-center gap-1 text-[#8A8882]">
            Made with <Heart className="w-3 h-3 text-rose-500 fill-rose-500" /> for Creators
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
