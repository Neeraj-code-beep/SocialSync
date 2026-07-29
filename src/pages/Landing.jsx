import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, WandSparkles, Zap, Smartphone, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import GradientButton from '../components/GradientButton';
import CaptionExamples from '../components/CaptionExamples';
import FAQ from '../components/FAQ';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import { staggerContainer, staggerItem, fadeUp, cardHoverProps } from '../lib/motion';
import { usePageTitle } from '../hooks/usePageTitle';

const Landing = () => {
  usePageTitle('CaptionAI — AI Social Media Caption Generator');
  return (
    <div className="min-h-screen flex flex-col pt-20 bg-[#FBFAF7] text-[#171717] overflow-x-hidden">
      <Navbar />

      {/* Editorial Hero Section */}
      <section className="relative px-6 pt-12 pb-16 max-w-7xl mx-auto w-full">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
        >
          {/* Left Column: Asymmetric Editorial Copy */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <motion.div variants={staggerItem}>
              <motion.div
                whileHover={{ y: -2, borderColor: '#D8D4CC' }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F2ED] border border-[#E7E4DE] text-xs font-semibold text-[#171717] transition-colors cursor-pointer group"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#171717] group-hover:rotate-12 group-hover:scale-110 transition-transform" />
                <span>Captions, without the overthinking</span>
              </motion.div>
            </motion.div>

            <motion.h1
              variants={staggerItem}
              className="text-4xl sm:text-6xl font-bold tracking-tight text-[#171717] font-sans leading-[1.08]"
            >
              Turn a photo into{' '}
              <span className="bg-[#C8F135] text-[#171717] px-2 py-0.5 rounded-md inline-block max-w-full box-decoration-clone">
                something worth saying.
              </span>
            </motion.h1>

            <motion.p
              variants={staggerItem}
              className="text-lg text-[#66645F] max-w-xl leading-relaxed font-normal"
            >
              Upload an image and get a ready-to-post social media caption in seconds. Made for creators, photographers, and brands.
            </motion.p>

            <motion.div
              variants={staggerItem}
              className="pt-2 flex flex-col sm:flex-row items-center gap-3"
            >
              <Link to="/signup" className="w-full sm:w-auto">
                <GradientButton size="lg" variant="primary" fullWidth icon={ArrowRight}>
                  Generate a caption
                </GradientButton>
              </Link>
              <a href="#examples" className="w-full sm:w-auto">
                <GradientButton size="lg" variant="outline" fullWidth>
                  See examples
                </GradientButton>
              </a>
            </motion.div>
          </div>

          {/* Right Column: Floating Product Visual */}
          <motion.div
            variants={staggerItem}
            className="lg:col-span-5 relative"
          >
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
              className="editorial-card rounded-3xl p-6 bg-white border border-[#E7E4DE] shadow-md space-y-4"
            >
              {/* Photo Input Card */}
              <div className="p-4 rounded-2xl bg-[#F4F2ED] border border-[#E7E4DE] flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-amber-200/80 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                  📸
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#66645F] uppercase tracking-wider">Your Photo</span>
                  <p className="text-sm font-semibold text-[#171717] mt-0.5">Golden hour photography.jpeg</p>
                </div>
              </div>

              {/* AI Processing Arrow */}
              <div className="flex items-center justify-center py-1">
                <div className="w-8 h-8 rounded-full bg-[#171717] text-white flex items-center justify-center shadow-xs">
                  <WandSparkles className="w-4 h-4 text-[#C8F135]" />
                </div>
              </div>

              {/* Generated Result Output */}
              <div className="p-5 rounded-2xl bg-white border border-[#E7E4DE] shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#171717] bg-[#C8F135] px-2 py-0.5 rounded">Caption ready</span>
                  <span className="text-xs text-[#8A8882]">1-click copy</span>
                </div>
                <p className="text-sm text-[#171717] font-medium leading-relaxed italic pt-1">
                  "Golden hour did most of the work. I just showed up. ✨ #sunset #goldenhour"
                </p>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="px-6 py-20 max-w-7xl mx-auto w-full scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
          className="mb-14 text-center"
        >
          <h2 className="text-3xl font-semibold text-[#171717] tracking-tight">
            Three steps to your next post
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="editorial-card p-6 rounded-2xl bg-white border border-[#E7E4DE] cursor-pointer group"
          >
            <span className="text-4xl font-bold text-[#171717] block mb-4 group-hover:text-[#C8F135] transition-colors">01</span>
            <h3 className="text-lg font-semibold text-[#171717] mb-2">Drop in a photo</h3>
            <p className="text-sm text-[#66645F] leading-relaxed">Drag and drop any JPEG, PNG, or WEBP image directly into your workspace.</p>
          </motion.div>

          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="editorial-card p-6 rounded-2xl bg-white border border-[#E7E4DE] cursor-pointer group"
          >
            <span className="text-4xl font-bold text-[#171717] block mb-4 group-hover:text-[#C8F135] transition-colors">02</span>
            <h3 className="text-lg font-semibold text-[#171717] mb-2">Let AI read the moment</h3>
            <p className="text-sm text-[#66645F] leading-relaxed">Our visual AI analyzes composition, mood, and context to craft relevant copy.</p>
          </motion.div>

          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="editorial-card p-6 rounded-2xl bg-white border border-[#E7E4DE] cursor-pointer group"
          >
            <span className="text-4xl font-bold text-[#171717] block mb-4 group-hover:text-[#C8F135] transition-colors">03</span>
            <h3 className="text-lg font-semibold text-[#171717] mb-2">Take the caption</h3>
            <p className="text-sm text-[#66645F] leading-relaxed">Copy to your clipboard with one click or export directly as a TXT file.</p>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="px-6 py-16 max-w-7xl mx-auto w-full scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={fadeUp}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-semibold text-[#171717] tracking-tight">
            Designed for social media workflow
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="md:col-span-2 editorial-card p-8 rounded-2xl bg-white border border-[#E7E4DE] flex flex-col justify-between cursor-pointer group"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#F4F2ED] group-hover:bg-[#C8F135] transition-colors flex items-center justify-center text-[#171717] mb-4">
                <WandSparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </div>
              <h3 className="text-xl font-semibold text-[#171717] mb-2">Multimodal Visual Recognition</h3>
              <p className="text-sm text-[#66645F] leading-relaxed max-w-md">
                Our vision AI reads lighting, subject emotion, and background context to write authentic copy instead of generic AI buzzwords.
              </p>
            </div>
          </motion.div>

          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="editorial-card p-8 rounded-2xl bg-white border border-[#E7E4DE] cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F4F2ED] group-hover:bg-[#C8F135] transition-colors flex items-center justify-center text-[#171717] mb-4">
              <Zap className="w-5 h-5 text-[#171717]" />
            </div>
            <h3 className="text-lg font-semibold text-[#171717] mb-2">Instant Output</h3>
            <p className="text-sm text-[#66645F] leading-relaxed">
              Generate ready-to-publish captions in under 2 seconds.
            </p>
          </motion.div>

          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="editorial-card p-8 rounded-2xl bg-white border border-[#E7E4DE] cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F4F2ED] group-hover:bg-[#C8F135] transition-colors flex items-center justify-center text-[#171717] mb-4">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-[#171717] mb-2">Social-Ready Formatting</h3>
            <p className="text-sm text-[#66645F] leading-relaxed">
              Includes natural line breaks, emoji accents, and targeted hashtag suggestions.
            </p>
          </motion.div>

          <motion.div
            variants={staggerItem}
            {...cardHoverProps}
            className="md:col-span-2 editorial-card p-8 rounded-2xl bg-white border border-[#E7E4DE] flex flex-col justify-between cursor-pointer group"
          >
            <div>
              <h3 className="text-xl font-semibold text-[#171717] mb-2">Copy & Publish Instantly</h3>
              <p className="text-sm text-[#66645F] leading-relaxed max-w-md">
                One-click copying directly to your clipboard or TXT download for your content calendar scheduler.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Caption Transformation Examples */}
      <CaptionExamples />

      {/* FAQ Accordion */}
      <FAQ />

      {/* Final CTA Banner */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeUp}
        className="px-6 py-20 max-w-5xl mx-auto w-full text-center"
      >
        <motion.div
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.3 }}
          className="editorial-card p-12 rounded-3xl bg-[#171717] text-white shadow-xl"
        >
          <h2 className="text-3xl font-semibold text-white tracking-tight">
            Stop staring at a blank caption box.
          </h2>
          <p className="text-zinc-400 mt-3 text-sm max-w-md mx-auto">
            Upload your photo now and get a caption worth posting in seconds.
          </p>
          <div className="mt-8">
            <Link to="/signup">
              <GradientButton size="lg" variant="accent" icon={ArrowRight}>
                Try it free
              </GradientButton>
            </Link>
          </div>
        </motion.div>
      </motion.section>

      <Footer />
    </div>
  );
};

export default Landing;
