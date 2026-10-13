import './app.css';
import { $ } from './util.js';
import { mountCompress, compressAcceptsDrop } from './compress.js';
import { mountMerge, mergeAcceptsDrop } from './merge.js';
import { mountPages, pagesAcceptsDrop } from './pages.js';
import { mountImages, imagesAcceptsDrop } from './images.js';

const TOOLS = {
  compress: { mount: mountCompress, drop: compressAcceptsDrop },
  merge: { mount: mountMerge, drop: mergeAcceptsDrop },
  pages: { mount: mountPages, drop: pagesAcceptsDrop },
  images: { mount: mountImages, drop: imagesAcceptsDrop },
};
let current = 'compress';

function show(tool) {
  if (!TOOLS[tool]) tool = 'compress';
  current = tool;
  document.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('on', b.dataset.tool === tool);
    b.setAttribute('aria-pressed', b.dataset.tool === tool);
  });
  TOOLS[tool].mount($('view'));
  if (location.hash.slice(1) !== tool) history.replaceState(null, '', '#' + tool);
}

$('tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (b) show(b.dataset.tool);
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// إفلات الملفات في أي مكان من الصفحة
let depth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { depth++; $('dropHint').hidden = false; } });
window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('dropHint').hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0; $('dropHint').hidden = true;
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) TOOLS[current].drop(files);
});

show(location.hash.slice(1) || 'compress');
