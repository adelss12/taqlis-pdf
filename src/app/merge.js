import { PDFDocument } from 'pdf-lib';
import { esc, ico, toast, formatSize, dropZone, isPdf, isImage, pdfBlob, shareOrDownload, download, loadErrorText } from './util.js';
import { imageToJpeg, addImagePage, QUALITY } from './images.js';

const state = { items: [], busy: false };
let root;
export function mountMerge(el) {
  root = el;
  root.innerHTML = `
    <section class="card">
      <h2>دمج عدة ملفات في ملف واحد</h2>
      <p class="sub">أضف ملفات PDF (ويمكن إضافة صور أيضاً)، ورتّبها بالأسهم، ثم ادمجها.</p>
      <div class="drop" id="mDrop">${ico('upload')}<b>أضف الملفات</b><small>PDF أو صور، ويمكن إضافة المزيد لاحقاً</small></div>
      <div class="files" id="mList"></div>
      <div class="row" id="mRow" hidden>
        <button type="button" class="btn btn-primary" id="mGo">دمج الملفات</button>
      </div>
      <div id="mOut"></div>
    </section>`;
  dropZone(root.querySelector('#mDrop'), { accept: 'application/pdf,.pdf,image/*', onFiles: addFiles });
  root.querySelector('#mList').addEventListener('click', onList);
  root.querySelector('#mGo').addEventListener('click', merge);
  paint();
}
export function mergeAcceptsDrop(files) { addFiles(files); }

async function addFiles(files) {
  const ok = files.filter((f) => isPdf(f) || isImage(f));
  if (ok.length < files.length) toast('تم تجاهل ملفات غير مدعومة', true);
  for (const f of ok) {
    const x = { id: Math.random().toString(36).slice(2), file: f, kind: isPdf(f) ? 'pdf' : 'img', pages: null };
    if (x.kind === 'img') x.url = URL.createObjectURL(f);
    state.items.push(x);
    if (x.kind === 'pdf') {
      f.arrayBuffer().then((b) => PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false }))
        .then((d) => { x.pages = d.getPageCount(); paint(); })
        .catch((e) => { x.error = loadErrorText(e); paint(); });
    }
  }
  root.querySelector('#mOut').innerHTML = '';
  paint();
}
function paint() {
  const L = state.items;
  root.querySelector('#mRow').hidden = L.length < 2;
  const go = root.querySelector('#mGo');
  go.disabled = state.busy || L.length < 2 || L.some((x) => x.error);
  go.textContent = state.busy ? 'جارٍ الدمج…' : `دمج ${L.length} ملفات`;
  root.querySelector('#mList').innerHTML = L.map((x, i) => `
    <div class="file"><div class="fi">${x.kind === 'img' ? `<img src="${x.url}" alt="">` : 'PDF'}</div>
      <div class="fm"><b>${esc(x.file.name)}</b><small class="${x.error ? 'warn' : ''}">${x.error ? esc(x.error) : `${i + 1}. ${x.kind === 'img' ? 'صورة' : (x.pages ? `${x.pages} صفحة` : '…')} · ${formatSize(x.file.size)}`}</small></div>
      <div class="fa">
        <button type="button" class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="تقديم">${ico('up')}</button>
        <button type="button" class="icon-btn" data-dn="${i}" ${i === L.length - 1 ? 'disabled' : ''} aria-label="تأخير">${ico('down')}</button>
        <button type="button" class="icon-btn" data-rm="${i}" aria-label="إزالة">${ico('x')}</button>
      </div></div>`).join('');
}
function onList(e) {
  const up = e.target.closest('[data-up]'), dn = e.target.closest('[data-dn]'), rm = e.target.closest('[data-rm]');
  const L = state.items;
  if (up) { const i = +up.dataset.up; [L[i - 1], L[i]] = [L[i], L[i - 1]]; }
  if (dn) { const i = +dn.dataset.dn; [L[i + 1], L[i]] = [L[i], L[i + 1]]; }
  if (rm) { const [x] = L.splice(+rm.dataset.rm, 1); if (x.url) URL.revokeObjectURL(x.url); }
  if (up || dn || rm) { root.querySelector('#mOut').innerHTML = ''; paint(); }
}
async function merge() {
  if (state.busy) return;
  state.busy = true; paint();
  const out = root.querySelector('#mOut');
  out.innerHTML = `<div class="busy"><i class="spin"></i><span>جارٍ الدمج…</span></div>`;
  try {
    const doc = await PDFDocument.create();
    let n = 0;
    for (const x of state.items) {
      out.querySelector('span').textContent = `جارٍ إضافة الملف ${++n} من ${state.items.length}…`;
      if (x.kind === 'pdf') {
        const src = await PDFDocument.load(await x.file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
      } else {
        await addImagePage(doc, await imageToJpeg(x.file, QUALITY.medium), { page: 'a4', margin: 'small' });
      }
    }
    const bytes = await doc.save();
    const blob = pdfBlob(bytes), name = 'ملف-مدموج.pdf';
    out.innerHTML = `<div class="summary"><span>${doc.getPageCount()} صفحة · ${formatSize(bytes.length)}</span></div>
      <div class="row"><button type="button" class="btn btn-primary" data-share>${ico('share')}مشاركة</button><button type="button" class="btn btn-soft" data-dl>${ico('download')}تنزيل</button></div>`;
    out.querySelector('[data-share]').onclick = () => shareOrDownload([{ blob, name }]);
    out.querySelector('[data-dl]').onclick = () => download(blob, name);
    toast('تم الدمج');
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div class="note">${esc(loadErrorText(e))}</div>`;
  }
  state.busy = false; paint();
}
