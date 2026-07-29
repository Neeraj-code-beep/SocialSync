import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-[#E7E4DE] py-5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left flex items-center justify-between gap-4 font-semibold text-[#171717] hover:text-[#000000] text-base"
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#8A8882] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-[#171717]' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pt-3 text-sm text-[#66645F] leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FAQ = () => {
  const faqs = [
    {
      q: 'How does CaptionAI generate captions from photos?',
      a: 'CaptionAI uses vision AI models to analyze visual objects, composition, aesthetic mood, and context, transforming visual details into ready-to-post social copy.',
    },
    {
      q: 'Can I copy or export the generated captions?',
      a: 'Yes, every generated caption features 1-click clipboard copying and direct TXT download capabilities for your publishing workflow.',
    },
    {
      q: 'What image file formats are supported?',
      a: 'We support JPG, PNG, and WEBP images up to 10MB.',
    },
    {
      q: 'Why is an account required to generate captions?',
      a: 'Creating an account ensures secure API usage and allows you to keep track of your generated caption session history.',
    },
  ];

  return (
    <section id="faq" className="px-6 py-16 max-w-3xl mx-auto w-full">
      <div className="mb-10 text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold text-[#171717] tracking-tight">
          Frequently Asked Questions
        </h2>
        <p className="text-sm text-[#66645F] mt-2">
          Everything you need to know about our caption generator.
        </p>
      </div>

      <div className="divide-y divide-[#E7E4DE]">
        {faqs.map((faq, idx) => (
          <FAQItem key={idx} question={faq.q} answer={faq.a} />
        ))}
      </div>
    </section>
  );
};

export default FAQ;
