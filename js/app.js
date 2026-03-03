'use strict';
/* ===== RV_U Methodology - Smart Command & Workspace Generator ===== */

// ==================== Utilities ====================
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

// ==================== Active Target & Dynamic Commands ====================
let activeTarget = null;        // { value, type }
const originalCodeContents = new Map(); // stores original textContent per <code> element

function storeOriginalCode() {
  document.querySelectorAll('pre code').forEach(code => {
    if (!originalCodeContents.has(code)) {
      originalCodeContents.set(code, code.textContent);
    }
  });
}

function applyTargetToCommands(targetValue, targetType) {
  const isBulk = (targetType === 'wildcard');
  // Tools whose flags should be transformed in wildcard/list mode
  const transformTools = ['subfinder','amass','nuclei','assetfinder','ffuf','httpx','subjack','subzy'];
  // System utilities whose flags must NEVER be touched
  const excludedTools = ['sort','uniq','grep','sed','awk','cat','jq','prips','dig','masscan'];

  originalCodeContents.forEach((original, codeEl) => {
    let text = original;
    // Replace domain/host placeholders with targetValue
    text = text.replace(/\b(?:example|site|Target)\.com\b/gi, targetValue);

    if (isBulk) {
      // Process line by line for context-aware flag transformation
      text = text.split('\n').map(line => {
        // Detect the primary tool in each line/pipe segment
        const segments = line.split('|');
        return segments.map(seg => {
          const trimmed = seg.trim();

          // Check if this segment starts with or contains an excluded tool
          const segTool = trimmed.split(/\s+/)[0];
          if (excludedTools.some(ex => segTool === ex || segTool.endsWith('/' + ex))) {
            return seg; // Do not touch excluded tools at all
          }

          // Handle special case: echo "target" | subfinder → subfinder -dL target_file
          if (/echo\s+.*\|\s*subfinder/.test(line)) {
            return seg;  // Will be handled at the full-line level below
          }

          // Only transform flags if the segment uses a known transformable tool
          const usesTransformTool = transformTools.some(t =>
            segTool === t || segTool.endsWith('/' + t) || trimmed.includes(t)
          );

          if (usesTransformTool) {
            seg = seg.replace(/(^|\s)-d(?=\s|$)/gm, '$1-dL');
            seg = seg.replace(/(^|\s)-u(?=\s|$)/gm, '$1-l');
            seg = seg.replace(/(^|\s)-i(?=\s|$)/gm, '$1-I');
          }

          return seg;
        }).join('|');
      }).join('\n');

      // Special subfinder pipe pattern: echo "target" | subfinder → subfinder -dL target_file
      text = text.replace(/echo\s+["']?[^"'\n|]+["']?\s*\|\s*subfinder\b/g, 'subfinder -dL target_file');
    }

    codeEl.textContent = text;
  });
}

function setActiveTarget(value, type) {
  activeTarget = { value, type };
  try { localStorage.setItem('rvu_active_target', JSON.stringify(activeTarget)); } catch(e) {}
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

// ==================== Single Section View ====================
let activeSectionId = null;

function showSection(id) {
  const el = document.getElementById(id);
  if (!el) return;

  activeSectionId = id;
  try { localStorage.setItem('rvu_active_section', id); } catch(e) {}

  // Hide all sections, show only the selected one
  document.querySelectorAll('.methodology-section').forEach(sec => {
    sec.style.display = (sec.id === id) ? '' : 'none';
  });

  // Ensure section body is expanded
  const body = el.querySelector('.section-body');
  const hdr  = el.querySelector('.section-header');
  if (body && body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (hdr) hdr.classList.remove('collapsed');
  }

  // Update active sidebar link
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-target="${CSS.escape(id)}"]`);
  if (link) link.classList.add('active');

  // Scroll to top of content area
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Close mobile sidebar if open
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }
}

function showAllSections() {
  document.querySelectorAll('.methodology-section').forEach(sec => {
    sec.style.display = '';
  });
  activeSectionId = null;
  try { localStorage.removeItem('rvu_active_section'); } catch(e) {}
}

// ==================== Domain / Target Input System ====================
const targetInput   = document.getElementById('target-input');
const targetTypeSel = document.getElementById('target-type-select');
const targetTagsCont= document.getElementById('target-tags');

function applyFromInput() {
  const value = targetInput.value.trim();
  const type  = targetTypeSel.value;
  if (!value) {
    clearActiveTarget();
    return;
  }
  setActiveTarget(value, type);
}

// Listen for input changes on target-input (smart variable injection)
targetInput.addEventListener('input', () => {
  applyFromInput();
});

// Listen for type change
targetTypeSel.addEventListener('change', () => {
  applyFromInput();
  try { localStorage.setItem('rvu_target_type', targetTypeSel.value); } catch(e) {}
});

document.getElementById('add-target-btn').addEventListener('click', () => {
  applyFromInput();
});
targetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { applyFromInput(); }
});

document.getElementById('clear-targets-btn').addEventListener('click', () => {
  targetInput.value = '';
  clearActiveTarget();
  try {
    localStorage.removeItem('rvu_active_target');
    localStorage.removeItem('rvu_target_value');
  } catch(e) {}
  showToast('🗑️ Target cleared!');
});

document.getElementById('start-methodology').addEventListener('click', () => {
  const type = targetTypeSel.value;
  showSection(type === 'wildcard' ? 'sec-1' : 'sec-3');
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

// Sidebar nav-link click => Single Section View
document.querySelectorAll('.nav-link[data-target]').forEach(link => {
  link.addEventListener('click', () => showSection(link.dataset.target));
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

// ==================== Sidebar Search (with Single View integration) ====================
const sidebarSearch = document.getElementById('sidebar-search');
const searchCount   = document.getElementById('search-results-count');
let searchTimeout;

function performSearch(query) {
  // Clear previous highlights
  document.querySelectorAll('.search-highlight').forEach(el => {
    el.replaceWith(document.createTextNode(el.textContent));
  });
  document.getElementById('content').normalize();
  if (!query || query.length < 2) { if (searchCount) searchCount.textContent = ''; return; }

  // Temporarily show all sections so we can search them
  document.querySelectorAll('.methodology-section').forEach(sec => {
    sec.style.display = '';
  });

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

  // If matches found, show the section of the first match (Single View integration)
  if (firstMatch) {
    const sec = firstMatch.closest('.methodology-section');
    if (sec) {
      showSection(sec.id);
      // Expand collapsed body
      const body = sec.querySelector('.section-body');
      const hdr  = sec.querySelector('.section-header');
      if (body && body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        if (hdr) hdr.classList.remove('collapsed');
      }
    }
    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Expand any collapsed section bodies that contain matches
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

if (sidebarSearch) {
  sidebarSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(sidebarSearch.value.trim()), 300);
  });
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (sidebarSearch) { sidebarSearch.focus(); sidebarSearch.select(); }
  }
});

// ==================== Scroll Events ====================
window.addEventListener('scroll', () => {
  const btt = document.getElementById('back-to-top');
  btt.classList.toggle('visible', window.scrollY > 400);
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

// ==================== UI Cleanup (dynamic) ====================
function cleanupUI() {
  // 1. Remove topbar global search input and its result count
  const globalSearch = document.getElementById('global-search');
  if (globalSearch) globalSearch.remove();
  const searchResultsCount = document.getElementById('search-results-count');
  if (searchResultsCount) searchResultsCount.remove();

  // 2. Remove the topbar hint
  const topbarHint = document.querySelector('.topbar-hint');
  if (topbarHint) topbarHint.remove();

  // 3. Remove file upload label and input
  const fileUploadLabel = document.getElementById('file-upload-label');
  if (fileUploadLabel) fileUploadLabel.remove();
  const fileUpload = document.getElementById('file-upload');
  if (fileUpload) fileUpload.remove();

  // 4. Simplify target-type-select to only Domain and Wildcard
  const sel = document.getElementById('target-type-select');
  if (sel) {
    sel.innerHTML = '';
    const optDomain = document.createElement('option');
    optDomain.value = 'domain';
    optDomain.textContent = '🏠 Domain';
    const optWildcard = document.createElement('option');
    optWildcard.value = 'wildcard';
    optWildcard.textContent = '🌐 Wildcard';
    sel.appendChild(optDomain);
    sel.appendChild(optWildcard);
  }

  // 5. Branding: Replace "r-v313" with "Ramez Medhat" in the footer
  const footer = document.querySelector('footer');
  if (footer) {
    footer.textContent = '';
    footer.innerHTML = 'RV_U Methodology \u2014 Created by <span>Ramez Medhat</span> | 64 Sections of Professional Bug Bounty Techniques | Happy Hunting! \uD83C\uDFAF';
  }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  // --- UI Cleanup: remove global search, file upload, simplify select ---
  cleanupUI();

  initCopyButtons();

  // --- Store original code contents before any transformation ---
  storeOriginalCode();

  // --- Load persisted target type ---
  try {
    const savedType = localStorage.getItem('rvu_target_type');
    if (savedType && targetTypeSel) {
      targetTypeSel.value = savedType;
    }
  } catch(e) {}

  // --- Load persisted active target ---
  try {
    const savedActive = localStorage.getItem('rvu_active_target');
    if (savedActive) {
      const parsed = JSON.parse(savedActive);
      if (parsed && parsed.value) {
        targetInput.value = parsed.value;
        if (parsed.type && targetTypeSel) {
          targetTypeSel.value = parsed.type;
        }
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

  // --- Restore active section (Single View persistence) ---
  const firstSection = document.querySelector('.methodology-section');
  const defaultSectionId = firstSection ? firstSection.id : null;
  try {
    const savedSection = localStorage.getItem('rvu_active_section');
    if (savedSection && document.getElementById(savedSection)) {
      showSection(savedSection);
    } else if (defaultSectionId) {
      showSection(defaultSectionId);
    }
  } catch(e) {
    if (defaultSectionId) showSection(defaultSectionId);
  }

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

  // --- Inject Clear Workspace Button (only) ---
  const container = document.getElementById('domain-input-system');
  if (container) {
    const btnRow = document.createElement('div');
    btnRow.className = 'workspace-actions';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-red';
    clearBtn.textContent = '🗑️ Clear Workspace';
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('rvu_completed');
      localStorage.removeItem('rvu_checkboxes');
      localStorage.removeItem('rvu_notes');
      localStorage.removeItem('rvu_active_target');
      localStorage.removeItem('rvu_active_section');
      localStorage.removeItem('rvu_target_type');
      targetInput.value = '';
      clearActiveTarget();
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
      const resetSection = document.querySelector('.methodology-section');
      if (resetSection) showSection(resetSection.id);
      showToast('🗑️ Workspace cleared!');
    });

    btnRow.appendChild(clearBtn);
    container.appendChild(btnRow);
  }
});
