import { esc, ico, toast, formatSize, baseName, pdfBlob, dropZone, isPdf, shareOrDownload, zipFiles, download, loadErrorText } from './util.js';
import { LEVELS, runOptimize, optimizeToTarget } from './engine-client.js';

const state = { level: 'web', targetMB: 2, items: [], busy: false };
const LS_KEY = 'taqlis_simple_v1';
try { Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); state.items = []; state.busy = false; } catch (e) {}
const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({ level: state.level, targetMB: state.targetMB })); } catch (e) {} };

let root;
export function mountCompress(el) {
  root = el;
  root.innerHTML = `
    <section class="card">
      <h2>تقليص حجم PDF</h2>
      <p class="sub">اختر ملفاً أو أكثر، ثم درجة التقليص.</p>
      <div class="drop" id="cDrop">${ico('upload')}<b>اختر ملفات PDF</b><small>أو اسحبها وأفلتها هنا</small></div>
    </section>
    <section class="card">
      <h2>درجة التقليص</h2>
      <div class="levels" id="cLevels" role="radiogroup" aria-label="درجة التقليص"></div>
      <div id="cTarget" hidden>
        <div class="target">
          <label for="cMB">الحد الأقصى</label>
          <input id="cMB" type="number" inputmode="decimal" min="0.1" step="0.1" aria-label="الحجم المطلوب بالميجابايت">
          <span>ميجابايت</span>
        </div>
        <div class="target" id="cChips"></div>
        <p class="sub" style="margin:10px 0 0">مفيد للبوابات الحكومية والجامعات التي تشترط حجماً معيناً. سنجرّب درجات متتالية حتى يصغر الملف عن الحد.</p>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="cGo" style="margin-top:14px" disabled>ابدأ التقليص</button>
    </section>
    <section class="card" id="cResults" hidden>
      <h2>النتائج</h2>
      <div class="files" id="cList"></div>
      <div id="cSummary"></div>
      <div class="row" id="cAll" hidden>
        <button type="button" class="btn btn-primary" id="cShareAll">${ico('share')}مشاركة الكل</button>
        <button type="button" class="btn btn-soft" id="cZip">${ico('download')}تنزيل الكل (ZIP)</button>
      </div>
    </section>`;
  dropZone(root.querySelector('#cDrop'), { accept: 'application/pdf,.pdf', onFiles: addFiles });
  paintLevels();
  root.querySelector('#cLevels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]'); if (!b) return;
    state.level = b.dataset.level; save(); paintLevels();
  });
  const mb = root.querySelector('#cMB');
  mb.value = state.targetMB;
  mb.addEventListener('input', () => { const v = parseFloat(mb.value); if (v > 0) { state.targetMB = v; save(); paintChips(); } });
  root.querySelector('#cChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-mb]'); if (!c) return;
    state.targetMB = +c.dataset.mb; mb.value = state.targetMB; save(); paintChips();
  });
  root.querySelector('#cGo').addEventListener('click', run);
  root.querySelector('#cList').addEventListener('click', onListClick);
  root.querySelector('#cShareAll').addEventListener('click', () => shareOrDownload(doneFiles()));
  root.querySelector('#cZip').addEventListener('click', async () => download(await zipFiles(doneFiles()), 'ملفات-مقلّصة.zip'));
  paintChips();
  paintList();
}
export function compressAcceptsDrop(files) { addFiles(files); }

function paintLevels() {
  const L = { ...Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, v])), target: { label: 'حجم محدد', hint: 'اكتب الحجم الأقصى المطلوب للملف' } };
  root.querySelector('#cLevels').innerHTML = Object.entries(L).map(([k, v]) =>
    `<button type="button" role="radio" aria-checked="${state.level === k}" class="level ${state.level === k ? 'on' : ''} ${k === 'target' ? 'wide' : ''}" data-level="${k}"><b>${v.label}</b><small>${v.hint}</small></button>`).join('');
  root.querySelector('#cTarget').hidden = state.level !== 'target';
}
function paintChips() {
  root.querySelector('#cChips').innerHTML = [0.5, 1, 2, 5, 10].map((v) => `<button type="button" class="chip ${state.targetMB === v ? 'on' : ''}" data-mb="${v}">${v < 1 ? '500 ك.ب' : v + ' م.ب'}</button>`).join('');
}

function addFiles(files) {
  const pdfs = files.filter(isPdf);
  if (pdfs.length < files.length) toast('تم تجاهل ملفات ليست PDF', true);
  if (!pdfs.length) return;
  // ملفات جديدة تستبدل النتائج المنتهية
  if (state.items.length && state.items.every((x) => x.status !== 'wait')) state.items = [];
  for (const f of pdfs) state.items.push({ id: Math.random().toString(36).slice(2), file: f, status: 'wait', progress: 0 });
  paintList();
  root.querySelector('#cResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function paintList() {
  const box = root.querySelector('#cList');
  root.querySelector('#cResults').hidden = !state.items.length;
  root.querySelector('#cGo').disabled = state.busy || !state.items.some((x) => x.status === 'wait');
  root.querySelector('#cGo').textContent = state.busy ? 'جارٍ التقليص…' : (state.items.some((x) => x.status === 'wait') ? `ابدأ التقليص (${state.items.filter((x) => x.status === 'wait').length})` : 'ابدأ التقليص');
  box.innerHTML = state.items.map((x) => {
    let meta = formatSize(x.file.size), cls = '';
    if (x.status === 'run') meta = x.step || 'جارٍ المعالجة…';
    if (x.status === 'done') {
      const pct = Math.round((1 - x.outSize / x.file.size) * 100);
      if (x.outSize >= x.file.size) { meta = `${formatSize(x.file.size)} · الملف مضغوط مسبقاً ولا يمكن تقليصه أكثر`; cls = 'warn'; }
      else { meta = `${formatSize(x.file.size)} ← ${formatSize(x.outSize)} <span class="saved">وفّرنا ${pct}٪</span>`; cls = 'ok'; }
      if (x.targetMissed) { meta += `<br>تعذر الوصول إلى ${state.targetMB} م.ب؛ هذا أصغر حجم ممكن دون إتلاف الملف.`; cls = 'warn'; }
    }
    if (x.status === 'err') { meta = esc(x.error); cls = 'warn'; }
    const actions = x.status === 'done'
      ? `<button type="button" class="icon-btn" data-share="${x.id}" aria-label="مشاركة">${ico('share')}</button><button type="button" class="icon-btn" data-dl="${x.id}" aria-label="تنزيل">${ico('download')}</button>`
      : (x.status === 'wait' ? `<button type="button" class="icon-btn" data-rm="${x.id}" aria-label="إزالة">${ico('x')}</button>` : '');
    return `<div class="file"><div class="fi">PDF</div>
      <div class="fm"><b>${esc(x.file.name)}</b><small class="${cls}">${meta}</small>
        ${x.status === 'run' ? `<div class="bar"><i style="width:${Math.round(x.progress * 100)}%"></i></div>` : ''}</div>
      <div class="fa">${actions}</div></div>`;
  }).join('');
  const done = state.items.filter((x) => x.status === 'done');
  root.querySelector('#cAll').hidden = done.length < 2;
  const before = done.reduce((a, x) => a + x.file.size, 0), after = done.reduce((a, x) => a + Math.min(x.outSize, x.file.size), 0);
  root.querySelector('#cSummary').innerHTML = done.length > 1 && before > after
    ? `<div class="summary"><span>المجموع: ${formatSize(before)} ← ${formatSize(after)}</span><span>وفّرنا ${Math.round((1 - after / before) * 100)}٪</span></div>` : '';
}

function outName(x) { return `${baseName(x.file.name)} - مقلّص.pdf`; }
function doneFiles() { return state.items.filter((x) => x.status === 'done').map((x) => ({ blob: pdfBlob(x.out), name: outName(x) })); }
function onListClick(e) {
  const rm = e.target.closest('[data-rm]'), dl = e.target.closest('[data-dl]'), sh = e.target.closest('[data-share]');
  if (rm) { state.items = state.items.filter((x) => x.id !== rm.dataset.rm); paintList(); }
  const x = state.items.find((i) => i.id === (dl || sh)?.dataset[dl ? 'dl' : 'share']);
  if (dl && x) download(pdfBlob(x.out), outName(x));
  if (sh && x) shareOrDownload([{ blob: pdfBlob(x.out), name: outName(x) }]);
}

async function run() {
  if (state.busy) return;
  if (state.level === 'target' && !(state.targetMB > 0)) { toast('اكتب الحجم المطلوب', true); return; }
  state.busy = true;
  for (const x of state.items.filter((i) => i.status === 'wait')) {
    x.status = 'run'; x.progress = 0; paintList();
    try {
      const bytes = new Uint8Array(await x.file.arrayBuffer());
      if (state.level === 'target') {
        const target = state.targetMB * 1024 * 1024;
        const r = await optimizeToTarget(bytes, target, (i, n) => { x.step = `المحاولة ${i} من ${n}…`; x.progress = i / n; paintList(); });
        x.out = r.bytes; x.outSize = r.size; x.targetMissed = !r.reached;
      } else {
        const r = await runOptimize(bytes, LEVELS[state.level].opts, (p) => { x.progress = p; paintList(); });
        x.out = r.bytes.length < bytes.length ? r.bytes : bytes; x.outSize = x.out.length;
      }
      x.status = 'done';
    } catch (err) {
      console.error(err);
      x.status = 'err'; x.error = loadErrorText(err);
    }
    paintList();
  }
  state.busy = false;
  paintList();
  const ok = state.items.filter((x) => x.status === 'done');
  if (ok.length) toast(ok.length === 1 ? 'انتهى التقليص' : `انتهى تقليص ${ok.length} ملفات`);
}
