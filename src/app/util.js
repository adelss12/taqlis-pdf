export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ico = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;

export function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} م.ب`;
}

export const baseName = (name) => String(name || 'ملف').replace(/\.[^.]+$/, '');

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

export const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });

/** مشاركة على الجوال إن أمكن، وإلا تنزيل */
export async function shareOrDownload(files) {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/pdf' }));
  if (navigator.canShare && navigator.canShare({ files: list })) {
    try {
      await navigator.share({ files: list });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancel';
    }
  }
  for (const f of files) download(f.blob, f.name);
  return 'downloaded';
}

/** تجميع عدة ملفات في ZIP */
export async function zipFiles(files) {
  const { zipSync } = await import('fflate');
  const entries = {};
  const used = new Set();
  for (const f of files) {
    let n = f.name, i = 2;
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)$/, ` (${i++})$1`);
    used.add(n);
    entries[n] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

/** منطقة اختيار وإفلات ملفات */
export function dropZone(el, { accept, multiple = true, onFiles }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.hidden = true;
  el.appendChild(input);
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; if (f.length) onFiles(f); });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('over');
    const f = [...e.dataTransfer.files];
    if (f.length) onFiles(f);
  });
  return input;
}

export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/i.test(f.name);

export function loadErrorText(err) {
  const m = String(err?.message || err || '').toLowerCase();
  if (m.includes('encrypt') || m.includes('password')) return 'الملف محمي بكلمة مرور. افتح الحماية أولاً ثم أعد المحاولة.';
  if (m.includes('invalid') || m.includes('header') || m.includes('parse')) return 'هذا الملف ليس PDF صالحاً أو أنه تالف.';
  return 'تعذرت معالجة الملف.';
}
