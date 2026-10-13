import { PDFDocument } from 'pdf-lib';
import { esc, ico, toast, formatSize, dropZone, isImage, pdfBlob, shareOrDownload, download } from './util.js';

const A4 = [595.28, 841.89];
export const QUALITY = {
  small: { label: 'حجم صغير', maxDim: 1600, q: 0.7 },
  medium: { label: 'متوسط', maxDim: 2400, q: 0.82 },
  high: { label: 'جودة عالية', maxDim: 3400, q: 0.9 },
};

/** يحوّل أي صورة يفهمها المتصفح (ومنها صور الآيفون) إلى JPEG مع تصغيرها */
export async function imageToJpeg(file, { maxDim = 2400, q = 0.82 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = url; });
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // خلفية بيضاء للصور الشفافة
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', q));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
  } finally { URL.revokeObjectURL(url); }
}

/** يضيف صورة كصفحة: إما بمقاس A4 مع هامش، أو بمقاس الصورة نفسها */
export async function addImagePage(doc, jpeg, { page = 'a4', margin = 'small' } = {}) {
  const img = await doc.embedJpg(jpeg.bytes);
  if (page === 'fit') {
    // 72 نقطة لكل بوصة؛ نفترض 150 نقطة في البوصة للصورة
    const w = jpeg.width * 72 / 150, h = jpeg.height * 72 / 150;
    const p = doc.addPage([w, h]);
    p.drawImage(img, { x: 0, y: 0, width: w, height: h });
    return;
  }
  const landscape = jpeg.width > jpeg.height;
  const [W, H] = landscape ? [A4[1], A4[0]] : A4;
  const m = margin === 'none' ? 0 : margin === 'small' ? 18 : 36;
  const s = Math.min((W - 2 * m) / jpeg.width, (H - 2 * m) / jpeg.height);
  const w = jpeg.width * s, h = jpeg.height * s;
  const p = doc.addPage([W, H]);
  p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
}

const state = { items: [], page: 'a4', margin: 'small', quality: 'medium', busy: false };
let root;
export function mountImages(el) {
  root = el;
  root.innerHTML = `
    <section class="card">
      <h2>تحويل الصور إلى PDF</h2>
      <p class="sub">اختر صوراً من جوالك أو جهازك، رتّبها، ثم أنشئ ملف PDF واحداً.</p>
      <div class="drop" id="iDrop">${ico('image')}<b>اختر الصور</b><small>JPG أو PNG أو صور الآيفون</small></div>
      <div class="files" id="iList"></div>
    </section>
    <section class="card" id="iOpts" hidden>
      <h2>إعدادات الصفحة</h2>
      <div class="opts">
        <div class="opt"><span>مقاس الصفحة</span><div class="seg" data-k="page"><button type="button" data-v="a4">A4</button><button type="button" data-v="fit">مثل الصورة</button></div></div>
        <div class="opt" id="iMarginRow"><span>الهامش</span><div class="seg" data-k="margin"><button type="button" data-v="none">بدون</button><button type="button" data-v="small">صغير</button><button type="button" data-v="large">كبير</button></div></div>
        <div class="opt"><span>جودة الصور</span><div class="seg" data-k="quality">${Object.entries(QUALITY).map(([k, v]) => `<button type="button" data-v="${k}">${v.label}</button>`).join('')}</div></div>
      </div>
      <div class="row">
        <button type="button" class="btn btn-primary" id="iGo">إنشاء ملف PDF</button>
      </div>
      <div id="iOut"></div>
    </section>`;
  dropZone(root.querySelector('#iDrop'), { accept: 'image/*', onFiles: addFiles });
  root.querySelector('#iOpts').addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    state[b.parentElement.dataset.k] = b.dataset.v; paintOpts();
  });
  root.querySelector('#iList').addEventListener('click', onList);
  root.querySelector('#iGo').addEventListener('click', build);
  paint();
}
export function imagesAcceptsDrop(files) { addFiles(files); }

function addFiles(files) {
  const imgs = files.filter(isImage);
  if (imgs.length < files.length) toast('تم تجاهل ملفات ليست صوراً', true);
  for (const f of imgs) state.items.push({ id: Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f) });
  root.querySelector('#iOut').innerHTML = '';
  paint();
}
function paintOpts() {
  root.querySelectorAll('#iOpts .seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', state[s.dataset.k] === b.dataset.v)));
  root.querySelector('#iMarginRow').hidden = state.page !== 'a4';
}
function paint() {
  root.querySelector('#iOpts').hidden = !state.items.length;
  root.querySelector('#iList').innerHTML = state.items.map((x, i) => `
    <div class="file"><div class="fi"><img src="${x.url}" alt=""></div>
      <div class="fm"><b>${esc(x.file.name)}</b><small>صفحة ${i + 1} · ${formatSize(x.file.size)}</small></div>
      <div class="fa">
        <button type="button" class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="تقديم">${ico('up')}</button>
        <button type="button" class="icon-btn" data-dn="${i}" ${i === state.items.length - 1 ? 'disabled' : ''} aria-label="تأخير">${ico('down')}</button>
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="إزالة">${ico('x')}</button>
      </div></div>`).join('');
  paintOpts();
  const go = root.querySelector('#iGo');
  go.disabled = state.busy || !state.items.length;
  go.textContent = state.busy ? 'جارٍ الإنشاء…' : `إنشاء ملف PDF (${state.items.length} ${state.items.length === 1 ? 'صفحة' : 'صفحات'})`;
}
function onList(e) {
  const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-dn]'), rm = e.target.closest('[data-rm]');
  const L = state.items;
  if (up) { const i = +up.dataset.up; [L[i - 1], L[i]] = [L[i], L[i - 1]]; }
  if (dn) { const i = +dn.dataset.dn; [L[i + 1], L[i]] = [L[i], L[i + 1]]; }
  if (rm) { const [x] = L.splice(+rm.dataset.rm, 1); URL.revokeObjectURL(x.url); }
  if (up || dn || rm) { root.querySelector('#iOut').innerHTML = ''; paint(); }
}
async function build() {
  if (state.busy || !state.items.length) return;
  state.busy = true; paint();
  const out = root.querySelector('#iOut');
  out.innerHTML = `<div class="busy"><i class="spin"></i><span>جارٍ تجهيز الصفحات…</span></div>`;
  try {
    const doc = await PDFDocument.create();
    let i = 0, failed = 0;
    for (const x of state.items) {
      out.querySelector('span').textContent = `جارٍ تجهيز الصفحة ${++i} من ${state.items.length}…`;
      try { await addImagePage(doc, await imageToJpeg(x.file, QUALITY[state.quality]), state); }
      catch (e) { failed++; }
    }
    if (!doc.getPageCount()) throw new Error('none');
    const bytes = await doc.save();
    const blob = pdfBlob(bytes), name = 'صور.pdf';
    out.innerHTML = `<div class="summary"><span>${doc.getPageCount()} صفحات · ${formatSize(bytes.length)}</span></div>
      ${failed ? `<div class="note">تعذرت قراءة ${failed} من الصور وتم تخطيها.</div>` : ''}
      <div class="row"><button type="button" class="btn btn-primary" data-share>${ico('share')}مشاركة</button><button type="button" class="btn btn-soft" data-dl>${ico('download')}تنزيل</button></div>`;
    out.querySelector('[data-share]').onclick = () => shareOrDownload([{ blob, name }]);
    out.querySelector('[data-dl]').onclick = () => download(blob, name);
    toast('أُنشئ ملف PDF');
  } catch (e) {
    out.innerHTML = `<div class="note">تعذر إنشاء الملف. جرّب صوراً بصيغة JPG أو PNG.</div>`;
  }
  state.busy = false; paint();
}
