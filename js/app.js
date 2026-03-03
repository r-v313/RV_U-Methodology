'use strict';
/* ===== RV_U Methodology - app.js ===== */

// ==================== Utilities ====================
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

// ==================== Active Target & Dynamic Commands ====================
let activeTarget = null;        // { value, type }
let uploadedFileName = '';      // tracks last uploaded filename
const originalCodeContents = new Map(); // stores original innerHTML per <code> element

function storeOriginalCode() {
  document.querySelectorAll('pre code').forEach(code => {
    if (!originalCodeContents.has(code)) {
      originalCodeContents.set(code, code.textContent);
    }
  });
}

function applyTargetToCommands(targetValue, targetType) {
  const isBulk = (targetType === 'iprange' || targetType === 'file');
  originalCodeContents.forEach((original, codeEl) => {
    let text = original;
    // Replace domain/host placeholders with targetValue
    text = text.replace(/example\.com/gi, targetValue);
    text = text.replace(/site\.com/gi, targetValue);
    text = text.replace(/Target\.com/gi, targetValue);

    if (isBulk) {
      // Transform single-target flags to list-based flags
      // -d (domain) -> -dL (domain list), but not -dL already and not --dbs etc.
      text = text.replace(/(?<=\s)-d(?=\s)/g, '-dL');
      // standalone -u -> -l
      text = text.replace(/(?<=\s)-u(?=\s)/g, '-l');
      // standalone -i -> -I (but not -iL, -ip, etc.)
      text = text.replace(/(?<=\s)-i(?=\s)/g, '-I');

      // Replace common list filenames with uploaded filename if available
      if (uploadedFileName) {
        text = text.replace(/\bdomains\.txt\b/g, uploadedFileName);
        text = text.replace(/\bsubs\.txt\b/g, uploadedFileName);
      }
    }

    codeEl.textContent = text;
  });
}

function setActiveTarget(value, type) {
  activeTarget = { value, type };
  try { localStorage.setItem('rvu_active_target', JSON.stringify(activeTarget)); } catch(e) {}
  // Update tag UI
  document.querySelectorAll('.target-tag').forEach(tag => tag.classList.remove('active-tag'));
  const tags = document.querySelectorAll('.target-tag');
  tags.forEach(tag => {
    // Match by text content (the tag contains badge + value + remove button)
    if (tag.textContent.includes(value)) {
      tag.classList.add('active-tag');
    }
  });
  applyTargetToCommands(value, type);
  showToast('🎯 Active target: ' + value);
}

function clearActiveTarget() {
  activeTarget = null;
  try { localStorage.removeItem('rvu_active_target'); } catch(e) {}
  // Restore original code
  originalCodeContents.forEach((original, codeEl) => {
    codeEl.textContent = original;
  });
}

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
  if (/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/(?:[0-9]|[12]\d|3[0-2])$/.test(v)) return 'iprange';
  if (/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(v)) return 'ip';
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
  if (activeTarget && activeTarget.value === val) {
    clearActiveTarget();
  }
  renderTags();
}

function saveTargets() {
  try { localStorage.setItem('rvu_targets', JSON.stringify(targets)); } catch(e) {}
}

function renderTags() {
  targetTagsCont.innerHTML = '';
  targets.forEach(t => {
    const tag = document.createElement('span');
    tag.className = `target-tag tag-${t.type}`;
    if (activeTarget && activeTarget.value === t.value) {
      tag.classList.add('active-tag');
    }

    const badge = document.createElement('span');
    badge.className = 'tag-type-badge';
    badge.textContent = t.type.toUpperCase();
    tag.appendChild(badge);

    tag.appendChild(document.createTextNode(t.value));

    const remove = document.createElement('span');
    remove.className = 'tag-remove';
    remove.title = 'Remove';
    remove.textContent = '\u00d7';
    remove.addEventListener('click', e => { e.stopPropagation(); removeTarget(t.value); });
    tag.appendChild(remove);

    tag.addEventListener('click', () => setActiveTarget(t.value, t.type));

    targetTagsCont.appendChild(tag);
  });
  saveTargets();
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
document.getElementById('clear-targets-btn').addEventListener('click', () => { targets = []; clearActiveTarget(); renderTags(); });

fileUpload.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { showToast('⚠️ File too large (max 5 MB)'); e.target.value = ''; return; }
  if (!f.name.endsWith('.txt') && f.type !== 'text/plain') { showToast('⚠️ Only .txt files are supported'); e.target.value = ''; return; }
  uploadedFileName = f.name;
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
  const link = document.querySelector(`.nav-link[data-target="${CSS.escape(id)}"]`);
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

function saveCompleted() {
  const ids = [];
  document.querySelectorAll('.section-complete-btn.done').forEach(btn => {
    const sec = btn.closest('.methodology-section');
    if (sec) ids.push(sec.id);
  });
  try { localStorage.setItem('rvu_completed', JSON.stringify(ids)); } catch(e) {}
}

document.querySelectorAll('.section-complete-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    btn.classList.toggle('done');
    btn.textContent = btn.classList.contains('done') ? '✓ Done' : 'Mark Done';
    const sec = btn.closest('.methodology-section');
    const navLink = document.querySelector(`.nav-link[data-target="${CSS.escape(sec.id)}"]`);
    if (navLink) navLink.classList.toggle('completed', btn.classList.contains('done'));
    updateProgress();
    saveCompleted();
    showToast('💾 Progress saved!');
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
function saveCheckboxes() {
  const state = {};
  document.querySelectorAll('.checklist input[type="checkbox"]').forEach((cb, i) => {
    state[i] = cb.checked;
  });
  try { localStorage.setItem('rvu_checkboxes', JSON.stringify(state)); } catch(e) {}
}

document.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', () => {
    const li = cb.closest('li');
    if (li) li.classList.toggle('checked', cb.checked);
    saveCheckboxes();
  });
});

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();

  // --- Store original code contents before any transformation ---
  storeOriginalCode();

  // --- Load targets from localStorage ---
  try {
    const saved = localStorage.getItem('rvu_targets');
    if (saved) { targets = JSON.parse(saved); renderTags(); }
  } catch(e) {}

  // --- Load active target from localStorage ---
  try {
    const savedActive = localStorage.getItem('rvu_active_target');
    if (savedActive) {
      const parsed = JSON.parse(savedActive);
      if (parsed && parsed.value && targets.find(t => t.value === parsed.value)) {
        setActiveTarget(parsed.value, parsed.type);
      }
    }
  } catch(e) {}

  // --- Load completed sections ---
  try {
    const done = JSON.parse(localStorage.getItem('rvu_completed') || '[]');
    done.forEach(id => {
      const sec = document.getElementById(id);
      if (!sec) return;
      const btn = sec.querySelector('.section-complete-btn');
      if (btn) { btn.classList.add('done'); btn.textContent = '✓ Done'; }
      const navLink = document.querySelector(`.nav-link[data-target="${CSS.escape(id)}"]`);
      if (navLink) navLink.classList.add('completed');
    });
  } catch(e) {}

  // --- Load checkbox states ---
  try {
    const cbState = JSON.parse(localStorage.getItem('rvu_checkboxes') || '{}');
    document.querySelectorAll('.checklist input[type="checkbox"]').forEach((cb, i) => {
      if (cbState[i]) {
        cb.checked = true;
        const li = cb.closest('li');
        if (li) li.classList.add('checked');
      }
    });
  } catch(e) {}

  updateProgress();

  // --- Inject section notes into every .section-body ---
  let notesDebounce;
  const notes = {};
  try { Object.assign(notes, JSON.parse(localStorage.getItem('rvu_notes') || '{}')); } catch(e) {}

  document.querySelectorAll('.section-body').forEach(body => {
    const sec = body.closest('.methodology-section');
    if (!sec) return;
    const secId = sec.id;

    const wrapper = document.createElement('div');
    wrapper.className = 'section-notes';

    const ta = document.createElement('textarea');
    ta.placeholder = '📝 Add your payloads or target-specific notes here...';
    if (notes[secId]) ta.value = notes[secId];
    ta.addEventListener('input', () => {
      notes[secId] = ta.value;
      clearTimeout(notesDebounce);
      notesDebounce = setTimeout(() => {
        try { localStorage.setItem('rvu_notes', JSON.stringify(notes)); } catch(e) {}
      }, 400);
    });

    wrapper.appendChild(ta);
    body.appendChild(wrapper);
  });

  // --- Inject Export & Clear Workspace Buttons ---
  const container = document.getElementById('domain-input-system');
  if (container) {
    const btnRow = document.createElement('div');
    btnRow.className = 'workspace-actions';

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-cyan';
    exportBtn.textContent = '💾 Export Report';
    exportBtn.addEventListener('click', () => {
      const report = {
        targets: targets,
        completed: [],
        notes: {}
      };
      try { report.completed = JSON.parse(localStorage.getItem('rvu_completed') || '[]'); } catch(e) {}
      try { report.notes = JSON.parse(localStorage.getItem('rvu_notes') || '{}'); } catch(e) {}
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rvu-workspace-report.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('📦 Workspace exported!');
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-red';
    clearBtn.textContent = '🗑️ Clear Workspace';
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('rvu_targets');
      localStorage.removeItem('rvu_completed');
      localStorage.removeItem('rvu_checkboxes');
      localStorage.removeItem('rvu_notes');
      localStorage.removeItem('rvu_active_target');
      targets = [];
      clearActiveTarget();
      renderTags();
      document.querySelectorAll('.section-complete-btn.done').forEach(btn => {
        btn.classList.remove('done');
        btn.textContent = 'Mark Done';
      });
      document.querySelectorAll('.nav-link.completed').forEach(l => l.classList.remove('completed'));
      document.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        const li = cb.closest('li');
        if (li) li.classList.remove('checked');
      });
      document.querySelectorAll('.section-notes textarea').forEach(ta => { ta.value = ''; });
      updateProgress();
      showToast('🗑️ Workspace cleared!');
    });

    btnRow.appendChild(exportBtn);
    btnRow.appendChild(clearBtn);
    container.appendChild(btnRow);
  }
});
