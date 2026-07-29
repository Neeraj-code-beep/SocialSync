import React from 'react';
import { motion } from 'framer-motion';

const CaptionExamples = () => {
  const examples = [
    {
      category: 'Travel & Lifestyle',
      tag: 'Sunset View',
      caption: 'Golden hour did most of the work. I just showed up.',
      photoBg: 'bg-amber-100/70 border-amber-200',
    },
    {
      category: 'Food & Culinary',
      tag: 'Artisan Coffee',
      caption: 'Espresso first, adulting second ☕️',
      photoBg: 'bg-stone-200/70 border-stone-300',
    },
    {
      category: 'Everyday Moments',
      tag: 'City Architecture',
      caption: 'Finding poetry in the ordinary corners of the city.',
      photoBg: 'bg-emerald-100/70 border-emerald-200',
    },
  ];

  return (
    <section id="examples" className="px-6 py-20 max-w-7xl mx-auto w-full">
      <div className="text-center mb-12">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#66645F] bg-[#F4F2ED] px-3 py-1 rounded-full border border-[#E7E4DE]">
          Real Examples
        </span>
        <h2 className="text-3xl sm:text-4xl font-semibold text-[#171717] tracking-tight mt-3 font-sans">
          Captions generated for real photos
        </h2>
        <p className="text-[#66645F] mt-2 text-sm max-w-md mx-auto">
          See how visual AI turns raw moments into engaging social posts.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {examples.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="editorial-card rounded-2xl p-5 bg-white border border-[#E7E4DE] flex flex-col justify-between"
          >
            <div>
              <div className={`w-full aspect-video rounded-xl ${item.photoBg} border flex items-center justify-center mb-4 p-4 text-center`}>
                <span className="text-xs font-semibold text-[#171717] bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-black/5 shadow-2xs">
                  📷 {item.tag}
                </span>
              </div>
              <span className="text-xs font-medium text-[#66645F] uppercase tracking-wider">
                {item.category}
              </span>
              <p className="text-sm text-[#171717] font-medium leading-relaxed mt-2 italic">
                "{item.caption}"
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default CaptionExamples;
