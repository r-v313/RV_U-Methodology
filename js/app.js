'use strict';
/* ===== RV_U Methodology - app.js ===== */

// ==================== Utilities ====================
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ==================== Domain / Target Input System ====================
const targetInput   = document.getElementById('target-input');
const targetTypeSel = document.getElementById('target-type-select');
const targetTagsCont= document.getElementById('target-tags');
const fileUpload    = document.getElementById('file-upload');
let targets = [];

function detectType(v) {
  v = v.trim();
  if (/^https?:\/\//i.test(v)) return 'url';
  if (v.startsWith('*.')) return 'wildcard';
  if (/^\d{1,3}(\.\d{1,3}){3}\/\d+$/.test(v)) return 'iprange';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return 'ip';
  const parts = v.split('.');
  if (parts.length > 2) return 'subdomain';
  if (parts.length === 2 && parts[1].length > 1) return 'domain';
  return 'domain';
}

function extractValue(v) {
  v = v.trim();
  if (/^https?:\/\//i.test(v)) { try { return new URL(v).hostname; } catch(e){} }
  return v;
}

function addTarget(raw) {
  const value = extractValue(raw.trim());
  if (!value) return;
  const sel  = targetTypeSel.value;
  const type = (sel === 'auto') ? detectType(value) : sel;
  if (targets.find(t => t.value === value)) return;
  targets.push({ value, type });
  renderTags();
}

function removeTarget(val) {
  targets = targets.filter(t => t.value !== val);
  renderTags();
}

function renderTags() {
  targetTagsCont.innerHTML = '';
  targets.forEach(t => {
    const tag = document.createElement('span');
    tag.className = `target-tag tag-${t.type}`;
    tag.innerHTML = `<span class="tag-type-badge">${escapeHtml(t.type.toUpperCase())}</span>${escapeHtml(t.value)}<span class="tag-remove" data-val="${escapeHtml(t.value)}" title="Remove">×</span>`;
    targetTagsCont.appendChild(tag);
  });
  targetTagsCont.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => removeTarget(btn.dataset.val));
  });
}

function addTargetsFromText(text) {
  text.split(/[\n,]+/).forEach(l => { if (l.trim()) addTarget(l.trim()); });
}

document.getElementById('add-target-btn').addEventListener('click', () => {
  const v = targetInput.value.trim();
  if (v) { addTargetsFromText(v); targetInput.value = ''; }
});
targetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const v = targetInput.value.trim(); if (v) { addTargetsFromText(v); targetInput.value = ''; } }
});
document.getElementById('clear-targets-btn').addEventListener('click', () => { targets = []; renderTags(); });

fileUpload.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => addTargetsFromText(ev.target.result);
  r.readAsText(f);
  e.target.value = '';
});

document.getElementById('start-methodology').addEventListener('click', () => {
  const hasWildcard = targets.some(t => t.type === 'wildcard');
  scrollToSection(hasWildcard || targets.length === 0 ? 'sec-1' : 'sec-3');
  showToast('🚀 Methodology started! Happy hunting!');
});

// ==================== Sidebar Navigation ====================
const sidebar      = document.getElementById('sidebar');
const mainContent  = document.getElementById('main-content');
const overlay      = document.getElementById('sidebar-overlay');
let sidebarOpen = true;

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible');
  } else {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('collapsed', !sidebarOpen);
    mainContent.classList.toggle('expanded', !sidebarOpen);
  }
});

overlay.addEventListener('click', () => {
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('visible');
});

function scrollToSection(id) {
  const el = document.getElementById(id); if (!el) return;
  const body = el.querySelector('.section-body');
  const hdr  = el.querySelector('.section-header');
  if (body && body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (hdr) hdr.classList.remove('collapsed');
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-target="${id}"]`);
  if (link) link.classList.add('active');
  if (window.innerWidth <= 768) { sidebar.classList.remove('mobile-open'); overlay.classList.remove('visible'); }
}

document.querySelectorAll('.nav-link[data-target]').forEach(link => {
  link.addEventListener('click', () => scrollToSection(link.dataset.target));
});

// ==================== Section Collapse/Expand ====================
document.querySelectorAll('.section-header').forEach(hdr => {
  hdr.addEventListener('click', e => {
    if (e.target.classList.contains('section-complete-btn')) return;
    const body = hdr.nextElementSibling;
    if (body && body.classList.contains('section-body')) {
      body.classList.toggle('collapsed');
      hdr.classList.toggle('collapsed');
    }
  });
});

document.querySelectorAll('.section-complete-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    btn.classList.toggle('done');
    btn.textContent = btn.classList.contains('done') ? '✓ Done' : 'Mark Done';
    const sec = btn.closest('.methodology-section');
    const navLink = document.querySelector(`.nav-link[data-target="${sec.id}"]`);
    if (navLink) navLink.classList.toggle('completed', btn.classList.contains('done'));
    updateProgress();
  });
});

function updateProgress() {
  const total = document.querySelectorAll('.section-complete-btn').length;
  const done  = document.querySelectorAll('.section-complete-btn.done').length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  const lbl = document.getElementById('progress-label-text');
  if (lbl) lbl.textContent = `${done}/${total} sections completed (${pct}%)`;
}

// ==================== Copy Buttons ====================
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.innerHTML = '📋 Copy';
    btn.addEventListener('click', () => {
      const pre = btn.closest('.code-block-wrapper')?.querySelector('pre');
      if (!pre) return;
      const text = pre.innerText || pre.textContent;
      const done = () => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.innerHTML = '📋 Copy'; btn.classList.remove('copied'); }, 2000);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else { fallbackCopy(text, done); }
    });
  });
}
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta); cb();
}

// ==================== Global Search ====================
const globalSearch  = document.getElementById('global-search');
const sidebarSearch = document.getElementById('sidebar-search');
const searchCount   = document.getElementById('search-results-count');
let searchTimeout;

function performSearch(query) {
  document.querySelectorAll('.search-highlight').forEach(el => {
    el.replaceWith(document.createTextNode(el.textContent));
  });
  document.getElementById('content').normalize();
  if (!query || query.length < 2) { if (searchCount) searchCount.textContent = ''; return; }

  const regex = new RegExp(escapeRegex(query), 'gi');
  let count = 0; let firstMatch = null;

  walkTextNodes(document.getElementById('content'), node => {
    if (!regex.test(node.textContent)) return;
    regex.lastIndex = 0;
    const par = node.parentNode;
    if (!par || ['SCRIPT','STYLE','BUTTON'].includes(par.tagName)) return;
    const parts = node.textContent.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
    const frag  = document.createDocumentFragment();
    parts.forEach(part => {
      if (part.toLowerCase() === query.toLowerCase()) {
        const mark = document.createElement('mark');
        mark.className = 'search-highlight'; mark.textContent = part;
        frag.appendChild(mark); count++;
        if (!firstMatch) firstMatch = mark;
      } else { frag.appendChild(document.createTextNode(part)); }
    });
    par.replaceChild(frag, node);
  });

  if (searchCount) searchCount.textContent = count ? `${count} match${count > 1 ? 'es' : ''}` : 'No matches';
  if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });

  document.querySelectorAll('.search-highlight').forEach(m => {
    const sec = m.closest('.methodology-section');
    if (!sec) return;
    const body = sec.querySelector('.section-body');
    const hdr  = sec.querySelector('.section-header');
    if (body && body.classList.contains('collapsed')) {
      body.classList.remove('collapsed');
      if (hdr) hdr.classList.remove('collapsed');
    }
  });
}

function walkTextNodes(node, cb) {
  if (node.nodeType === Node.TEXT_NODE) { cb(node); return; }
  if (['SCRIPT','STYLE'].includes(node.nodeName)) return;
  Array.from(node.childNodes).forEach(child => walkTextNodes(child, cb));
}

globalSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => performSearch(globalSearch.value.trim()), 300);
  if (sidebarSearch) sidebarSearch.value = globalSearch.value;
});
if (sidebarSearch) {
  sidebarSearch.addEventListener('input', () => {
    globalSearch.value = sidebarSearch.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(sidebarSearch.value.trim()), 300);
  });
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); globalSearch.focus(); globalSearch.select(); }
});

// ==================== Scroll Events ====================
window.addEventListener('scroll', () => {
  const btt = document.getElementById('back-to-top');
  btt.classList.toggle('visible', window.scrollY > 400);

  let current = '';
  document.querySelectorAll('.methodology-section').forEach(sec => {
    if (sec.getBoundingClientRect().top <= 100) current = sec.id;
  });
  document.querySelectorAll('.nav-link[data-target]').forEach(l => {
    l.classList.toggle('active', l.dataset.target === current);
  });
}, { passive: true });

document.getElementById('back-to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ==================== Checklist ====================
document.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    const li = cb.closest('li');
    if (li) li.classList.toggle('checked', cb.checked);
  });
});

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  updateProgress();
});
