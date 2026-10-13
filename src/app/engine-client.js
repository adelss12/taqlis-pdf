/** تشغيل محرك الضغط (src/worker.js) في عامل منفصل */
export function createEngineWorker() {
  return new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
}

export function runOptimize(bytes, options, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = createEngineWorker();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.progress, m.pass);
      else if (m.type === 'result') { worker.terminate(); resolve({ bytes: new Uint8Array(m.result), stats: m.stats }); }
      else if (m.type === 'error') { worker.terminate(); reject(new Error(m.error)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'worker')); };
    // ننسخ البيانات حتى نستطيع إعادة المحاولة بإعدادات أخرى
    const copy = bytes.slice().buffer;
    worker.postMessage({ type: 'optimize', buffer: copy, options: { ...options, debug: false } }, [copy]);
  });
}

/* نفس إعدادات الواجهة الكلاسيكية */
export const LEVELS = {
  lossless: { label: 'جودة كاملة', hint: 'تنظيف وضغط دون أي فقد في الجودة', opts: { lossy: false, imageQuality: 0.85, unembedStandardFonts: true, subsetFonts: false } },
  web: { label: 'متوازن', hint: 'مناسب للإرسال والعرض على الشاشة', opts: { lossy: true, imageQuality: 0.75, unembedStandardFonts: true, subsetFonts: false, maxImageDpi: 150 } },
  print: { label: 'للطباعة', hint: 'جودة عالية للصور مع تقليص معقول', opts: { lossy: true, imageQuality: 0.92, unembedStandardFonts: true, subsetFonts: false, maxImageDpi: 300 } },
  supercompress: { label: 'أقصى تقليص', hint: 'أصغر حجم ممكن، والصور أقل وضوحاً', opts: { lossy: true, imageQuality: 0.5, unembedStandardFonts: true, subsetFonts: false, maxImageDpi: 72 } },
};

/* سلّم المحاولات للوصول إلى حجم محدد: من الأعلى جودة إلى الأقل */
export const TARGET_LADDER = [
  LEVELS.lossless.opts,
  { lossy: true, imageQuality: 0.85, maxImageDpi: 220, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.75, maxImageDpi: 150, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.65, maxImageDpi: 120, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.55, maxImageDpi: 100, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.45, maxImageDpi: 85, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.35, maxImageDpi: 72, unembedStandardFonts: true, subsetFonts: false },
  { lossy: true, imageQuality: 0.25, maxImageDpi: 60, unembedStandardFonts: true, subsetFonts: false },
];

/**
 * يجرّب درجات الضغط بالترتيب حتى يصبح الملف أصغر من الحجم المطلوب.
 * يعيد أفضل نتيجة تحقق الهدف، أو أصغر نتيجة ممكنة إن تعذر الوصول إليه.
 */
export async function optimizeToTarget(bytes, targetBytes, onStep) {
  let best = null;
  let prevSize = null;
  let sameCount = 0;
  for (let i = 0; i < TARGET_LADDER.length; i++) {
    onStep?.(i + 1, TARGET_LADDER.length);
    const r = await runOptimize(bytes, TARGET_LADDER[i]);
    const size = Math.min(r.bytes.length, bytes.length);
    const out = r.bytes.length < bytes.length ? r.bytes : bytes;
    if (!best || size < best.size) best = { bytes: out, size, step: i };
    if (size <= targetBytes) return { ...best, reached: true };
    // إن لم يتغير الحجم في محاولتين متتاليتين فالملف بلا صور تقريباً
    if (prevSize !== null && Math.abs(prevSize - size) < 1024) { if (++sameCount >= 2) break; } else sameCount = 0;
    prevSize = size;
  }
  return { ...best, reached: false };
}
