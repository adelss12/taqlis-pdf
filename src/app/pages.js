import { PDFDocument, degrees } from 'pdf-lib';
import { esc, ico, toast, formatSize, baseName, dropZone, isPdf, pdfBlob, shareOrDownload, download, zipFiles, loadErrorText } from './util.js';

/* pdf.js لرسم الصور المصغّرة فقط؛ يُحمّل عند الحاجة، وبدونه تظهر أرقام الصفحات.
   الإصدار 3.11 يعمل على أجهزة الآيفون الأقدم أيضاً. */
export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
export const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = PDFJS_URL;
      s.onerror = () => reject(new Error('pdfjs'));
      s.onload = () => {
        let n = 0;
        (function wait() {
          if (window.pdfjsLib) return resolve(window.pdfjsLib);
          if (++n > 50) return reject(new Error('pdfjs'));
          setTimeout(wait, 100);
        })();
      };
      document.head.appendChild(s);
    }).then((lib) => { lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return lib; })
      .catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

const state = { file: null, bytes: null, pages: [], busy: false };
// pages: [{ index, baseRot, rot, del, sel }]
let root, observer, viewer = null;

export function mountPages(el) {
  root = el;
  root.innerHTML = `
    <section class="card">
      <h2>تنظيم الصفحات</h2>
      <p class="sub">دوّر الصفحات أو احذفها أو غيّر ترتيبها، أو استخرج صفحات معينة، أو قسّم الملف.</p>
      <div class="drop" id="pDrop">${ico('upload')}<b>اختر ملف PDF</b><small>ملف واحد</small></div>
      <div id="pBody"></div>
    </section>`;
  dropZone(root.querySelector('#pDrop'), { accept: 'application/pdf,.pdf', multiple: false, onFiles: (f) => openFile(f[0]) });
  if (state.file) paint();
}
export function pagesAcceptsDrop(files) { const f = files.find(isPdf); if (f) openFile(f); }

async function openFile(file) {
  if (!isPdf(file)) { toast('اختر ملف PDF', true); return; }
  const body = root.querySelector('#pBody');
  body.innerHTML = `<div class="busy"><i class="spin"></i><span>جارٍ فتح الملف…</span></div>`;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    state.file = file; state.bytes = bytes;
    state.pages = doc.getPages().map((p, i) => ({ index: i, baseRot: p.getRotation().angle || 0, rot: 0, del: false, sel: false }));
    viewer = null;
    paint();
  } catch (e) {
    body.innerHTML = `<div class="note">${esc(loadErrorText(e))}</div>`;
  }
}

function counts() {
  const kept = state.pages.filter((p) => !p.del), sel = state.pages.filter((p) => p.sel && !p.del);
  return { kept, sel };
}
function paint() {
  const body = root.querySelector('#pBody');
  const { kept, sel } = counts();
  const changed = state.pages.some((p, i) => p.del || p.rot || p.index !== i);
  body.innerHTML = `
    <div class="file" style="margin-top:12px"><div class="fi">PDF</div><div class="fm"><b>${esc(state.file.name)}</b><small>${state.pages.length} صفحة · ${formatSize(state.file.size)}</small></div></div>
    <div class="sel-bar">
      <span>${sel.length ? `محدد ${sel.length} من ${kept.length}` : 'اضغط على الصفحات لتحديدها'}</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-line btn-sm" data-a="all">${sel.length === kept.length && kept.length ? 'إلغاء التحديد' : 'تحديد الكل'}</button>
        <button type="button" class="btn btn-line btn-sm" data-a="rotsel" ${sel.length ? '' : 'disabled'}>${ico('rotate')}تدوير المحدد</button>
        <button type="button" class="btn btn-line btn-sm" data-a="delsel" ${sel.length ? '' : 'disabled'}>${ico('trash')}حذف المحدد</button>
      </span>
    </div>
    <div class="pages" id="pGrid">${state.pages.map((p, i) => `
      <div class="page ${p.sel ? 'sel' : ''} ${p.del ? 'del' : ''}" data-i="${i}">
        <span class="check">${ico('check')}</span>
        <button type="button" class="thumb" data-sel="${i}" aria-label="تحديد الصفحة ${p.index + 1}" style="border:0;background:none;padding:0;cursor:pointer">
          ${viewer ? `<canvas data-c="${p.index}" style="transform:rotate(${p.rot}deg)"></canvas>` : `<span class="ph" style="transform:rotate(${p.rot}deg)">${p.index + 1}</span>`}
        </button>
        <span class="pn">
          <button type="button" class="mv" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="تقديم الصفحة">${ico('right')}</button>
          <span>${p.del ? 'ستُحذف' : `صفحة ${p.index + 1}`}</span>
          <button type="button" class="mv" data-mv="${i}" data-d="1" ${i === state.pages.length - 1 ? 'disabled' : ''} aria-label="تأخير الصفحة">${ico('left')}</button>
        </span>
        <span class="pa">
          <button type="button" class="icon-btn" data-rot="${i}" aria-label="تدوير">${ico('rotate')}</button>
          <button type="button" class="icon-btn" data-del="${i}" aria-label="${p.del ? 'استرجاع' : 'حذف'}">${p.del ? ico('check') : ico('trash')}</button>
        </span>
      </div>`).join('')}</div>
    <div class="row">
      <button type="button" class="btn btn-primary" data-a="save" ${changed && kept.length ? '' : 'disabled'}>${ico('download')}حفظ الملف بعد التعديل</button>
      <button type="button" class="btn btn-soft" data-a="extract" ${sel.length ? '' : 'disabled'}>استخراج المحدد (${sel.length})</button>
      <button type="button" class="btn btn-soft" data-a="split" ${kept.length > 1 ? '' : 'disabled'}>تقسيم: كل صفحة في ملف</button>
    </div>
    <div id="pOut"></div>`;
  body.onclick = onClick;
  drawThumbs();
}

async function drawThumbs() {
  try {
    if (!viewer) {
      const pdfjs = await loadPdfjs();
      viewer = await pdfjs.getDocument({ data: state.bytes.slice() }).promise;
      paint();
      return;
    }
  } catch (e) { return; } // بدون صور مصغّرة
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      observer.unobserve(en.target);
      renderThumb(en.target);
    }
  }, { rootMargin: '200px' });
  root.querySelectorAll('canvas[data-c]').forEach((c) => observer.observe(c));
}
const thumbCache = new Map();
async function renderThumb(cv) {
  const idx = +cv.dataset.c;
  try {
    const key = state.file.name + state.file.size + ':' + idx;
    let bmp = thumbCache.get(key);
    if (!bmp) {
      const page = await viewer.getPage(idx + 1);
      const vp0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 220 / Math.max(vp0.width, vp0.height) });
      const off = document.createElement('canvas');
      off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height);
      await page.render({ canvasContext: off.getContext('2d'), canvas: off, viewport: vp }).promise;
      bmp = off;
      thumbCache.set(key, bmp);
    }
    cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext('2d').drawImage(bmp, 0, 0);
  } catch (e) { /* تبقى الصفحة بدون صورة */ }
}

function onClick(e) {
  const P = state.pages;
  const t = (sel) => e.target.closest(sel);
  let b;
  if ((b = t('[data-sel]'))) { const p = P[+b.dataset.sel]; if (!p.del) p.sel = !p.sel; return paint(); }
  if ((b = t('[data-rot]'))) { const p = P[+b.dataset.rot]; p.rot = (p.rot + 90) % 360; return paint(); }
  if ((b = t('[data-del]'))) { const p = P[+b.dataset.del]; p.del = !p.del; p.sel = false; return paint(); }
  if ((b = t('[data-mv]'))) { const i = +b.dataset.mv, j = i + +b.dataset.d; [P[i], P[j]] = [P[j], P[i]]; return paint(); }
  const a = t('[data-a]')?.dataset.a;
  const { kept, sel } = counts();
  if (a === 'all') { const on = !(sel.length === kept.length); P.forEach((p) => { if (!p.del) p.sel = on; }); paint(); }
  if (a === 'rotsel') { sel.forEach((p) => p.rot = (p.rot + 90) % 360); paint(); }
  if (a === 'delsel') { if (sel.length === kept.length) { toast('لا يمكن حذف كل الصفحات', true); return; } sel.forEach((p) => { p.del = true; p.sel = false; }); paint(); }
  if (a === 'save') exportPages(kept, `${baseName(state.file.name)} - معدّل.pdf`);
  if (a === 'extract') exportPages(sel, `${baseName(state.file.name)} - صفحات ${sel.map((p) => p.index + 1).join('،')}.pdf`.slice(0, 120));
  if (a === 'split') splitAll(kept);
}

async function build(list) {
  const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true, updateMetadata: false });
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, list.map((p) => p.index));
  copied.forEach((pg, k) => {
    const p = list[k];
    if (p.rot) pg.setRotation(degrees((p.baseRot + p.rot) % 360));
    doc.addPage(pg);
  });
  return doc.save();
}
function busy(on, text = '') {
  state.busy = on;
  root.querySelectorAll('#pBody .row .btn').forEach((b) => b.toggleAttribute('data-wait', on));
  root.querySelector('#pOut').innerHTML = on ? `<div class="busy"><i class="spin"></i><span>${text}</span></div>` : '';
}
async function exportPages(list, name) {
  if (state.busy || !list.length) return;
  busy(true, 'جارٍ إنشاء الملف…');
  try {
    const bytes = await build(list);
    const blob = pdfBlob(bytes);
    busy(false);
    showResult([{ blob, name }], `${list.length} صفحة · ${formatSize(bytes.length)}`);
  } catch (e) { busy(false); root.querySelector('#pOut').innerHTML = `<div class="note">${esc(loadErrorText(e))}</div>`; }
}
async function splitAll(list) {
  if (state.busy) return;
  busy(true, 'جارٍ تقسيم الملف…');
  try {
    const files = [];
    for (const p of list) {
      root.querySelector('#pOut span').textContent = `جارٍ تجهيز الصفحة ${files.length + 1} من ${list.length}…`;
      files.push({ blob: pdfBlob(await build([p])), name: `${baseName(state.file.name)} - صفحة ${p.index + 1}.pdf` });
    }
    busy(false);
    showResult(files, `${files.length} ملفات منفصلة`, true);
  } catch (e) { busy(false); root.querySelector('#pOut').innerHTML = `<div class="note">${esc(loadErrorText(e))}</div>`; }
}
function showResult(files, label, many = false) {
  const out = root.querySelector('#pOut');
  out.innerHTML = `<div class="summary"><span>${esc(label)}</span></div>
    <div class="row"><button type="button" class="btn btn-primary" data-r="share">${ico('share')}مشاركة</button>
    <button type="button" class="btn btn-soft" data-r="dl">${ico('download')}${many ? 'تنزيل (ZIP)' : 'تنزيل'}</button></div>`;
  out.onclick = async (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (r === 'share') shareOrDownload(files);
    if (r === 'dl') { if (many) download(await zipFiles(files), `${baseName(state.file.name)} - صفحات.zip`); else download(files[0].blob, files[0].name); }
  };
  toast('جاهز');
}
