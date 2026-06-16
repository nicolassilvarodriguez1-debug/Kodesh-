// KODESH Auth Module — Supabase integration
// Include this before the closing </body> tag in index.html

const SUPABASE_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a25icWRzZ3FkbXdpcnJnY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzU2NjYsImV4cCI6MjA5NjExMTY2Nn0.RqiuH5fafECN1yW5MjBP3zzHAdXLH4QD3gBL_WZ-hB0';

// Versión actual de los Términos y Condiciones. Si actualizas terminos.html,
// cambia esta fecha para que TODOS los usuarios deban re-aceptar la nueva versión.
const TERMS_VERSION = '2026-06-16';

let _supabase = null;
let currentUser = null;

function getSupabase() {
  if (!_supabase && window.supabase) {
    _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

/* ── INIT AUTH ── */
async function initAuth() {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    onUserLoggedIn(currentUser);
  } else {
    onUserLoggedOut();
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      onUserLoggedIn(currentUser);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      onUserLoggedOut();
    }
  });
}

let userProfile = null;

async function loadUserProfile(userId) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from('user_profiles')
      .select('display_name, study_goals, reading_goal_chapters, onboarding_completed, avatar_url')
      .eq('id', userId)
      .single();
    userProfile = data;
    return data;
  } catch(e) { return null; }
}

/* ── USER LOGGED IN ── */
async function onUserLoggedIn(user) {
  // Gate: must accept current Terms version before anything else loads.
  const accepted = await checkTermsAccepted(user.id);
  if (!accepted) {
    showTermsGateModal(user.id);
    return; // Stop here — rest of init resumes after acceptance, via acceptTermsAndContinue()
  }

  // Check if this is a different user than before
  const lastUserId = localStorage.getItem('kodesh_last_user');
  if (lastUserId && lastUserId !== user.id) {
    localStorage.removeItem('kodesh_read');
    localStorage.removeItem('kodesh_bookmarks');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('note:')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    state.readChapters = {};
    state.bookmarks = {};
  }
  localStorage.setItem('kodesh_last_user', user.id);

  // Load profile
  await loadUserProfile(user.id);
  await loadStreak();

  updateUserUI(user);
  await syncProgressFromCloud();
  await syncBookmarksFromCloud();
  await syncNotesFromCloud();
  updateProgress();
  updateBookList();
  renderBookmarkList();
  renderStreakBadge();
  renderDailyPlan();
  // Load usage/plan info
  if (typeof loadUsage === 'function') loadUsage();

  // Show daily promise card
  if (typeof showDailyPromise === 'function') setTimeout(() => showDailyPromise(), 500);

  // Check for pending Stripe session
  const pendingSession = localStorage.getItem('kodesh_pending_session');
  if (pendingSession) {
    localStorage.removeItem('kodesh_pending_session');
    try {
      const kapiF = (typeof kapiFetch !== 'undefined') ? kapiFetch : fetch;
      const res = await kapiF('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, sessionId: pendingSession })
      });
      const data = await res.json();
      if (data.plan === 'premium') {
        if (typeof showToast === 'function') showToast('🎉 ¡Bienvenido a KODESH Premium!');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch(e) { console.warn('Confirm error:', e.message); }
  }
}

/* ════════════════════════════════════
   TERMS & CONDITIONS ACCEPTANCE GATE
   Registro legal de aceptación — evidencia con fecha, versión, IP y user agent.
════════════════════════════════════ */

async function checkTermsAccepted(userId) {
  const sb = getSupabase();
  if (!sb) return true; // fail-open if Supabase unreachable, to avoid bricking the app
  try {
    const { data, error } = await sb
      .from('user_terms_acceptance')
      .select('id')
      .eq('user_id', userId)
      .eq('terms_version', TERMS_VERSION)
      .maybeSingle();
    if (error) { console.warn('Terms check error:', error.message); return true; }
    return !!data;
  } catch(e) {
    console.warn('Terms check exception:', e.message);
    return true;
  }
}

async function getClientIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip || null;
  } catch(e) { return null; }
}

async function recordTermsAcceptance(userId) {
  const sb = getSupabase();
  if (!sb) return false;
  const ip = await getClientIp();
  try {
    const { error } = await sb.from('user_terms_acceptance').insert({
      user_id: userId,
      terms_version: TERMS_VERSION,
      ip_address: ip,
      user_agent: navigator.userAgent,
    });
    if (error) throw error;
    return true;
  } catch(e) {
    console.error('Error saving terms acceptance:', e.message);
    return false;
  }
}

function showTermsGateModal(userId) {
  if (document.getElementById('termsGateOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'termsGateOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:9999;
    display:flex; align-items:center; justify-content:center; padding:20px;
    backdrop-filter: blur(4px);
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--bg2, #0a0a12); border:1px solid var(--gold-dim, #5a4820);
      border-radius:16px; max-width:480px; width:100%; padding:32px 28px;
      box-shadow:0 20px 60px rgba(0,0,0,0.5); text-align:center;
    ">
      <div style="font-size:2.2rem; margin-bottom:12px;">📜</div>
      <h2 style="font-family:'Cinzel',serif; font-size:1.15rem; color:var(--gold, #c9a84c); margin-bottom:14px; letter-spacing:0.5px;">
        Actualizamos nuestros Términos
      </h2>
      <p style="font-family:'Crimson Pro',serif; font-size:0.95rem; color:var(--text-mid, #a09880); line-height:1.6; margin-bottom:22px;">
        Para continuar usando KODESH, por favor revisa y acepta nuestros
        <a href="/terminos.html" target="_blank" style="color:var(--gold,#c9a84c); text-decoration:underline;">Términos y Condiciones</a>
        y nuestra
        <a href="/privacidad.html" target="_blank" style="color:var(--gold,#c9a84c); text-decoration:underline;">Política de Privacidad</a>.
      </p>
      <label style="display:flex; align-items:flex-start; gap:10px; text-align:left; margin-bottom:22px; cursor:pointer; font-size:0.85rem; color:var(--text,#ede5d5);">
        <input type="checkbox" id="termsGateCheckbox" style="margin-top:3px; width:16px; height:16px; flex-shrink:0; accent-color: var(--gold,#c9a84c);">
        <span>He leído y acepto los Términos y Condiciones y la Política de Privacidad de KODESH.</span>
      </label>
      <button id="termsGateAcceptBtn" disabled style="
        width:100%; font-family:'Cinzel',serif; font-size:0.75rem; letter-spacing:1px; text-transform:uppercase;
        background:var(--gold-dim,#5a4820); color:#fff; border:none; border-radius:8px;
        padding:14px; cursor:not-allowed; opacity:0.5; transition: all 0.2s;
      ">Aceptar y continuar</button>
      <p id="termsGateError" style="color:var(--red,#e05a5a); font-size:0.8rem; margin-top:10px; display:none;">
        Hubo un problema al guardar tu aceptación. Intenta de nuevo.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const checkbox = document.getElementById('termsGateCheckbox');
  const acceptBtn = document.getElementById('termsGateAcceptBtn');

  checkbox.addEventListener('change', () => {
    acceptBtn.disabled = !checkbox.checked;
    acceptBtn.style.opacity = checkbox.checked ? '1' : '0.5';
    acceptBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
    acceptBtn.style.background = checkbox.checked ? 'var(--gold, #c9a84c)' : 'var(--gold-dim, #5a4820)';
    acceptBtn.style.color = checkbox.checked ? 'var(--bg, #05050a)' : '#fff';
  });

  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'Guardando...';
    const errorEl = document.getElementById('termsGateError');
    const ok = await recordTermsAcceptance(userId);
    if (ok) {
      overlay.remove();
      document.body.style.overflow = '';
      // Resume the normal login flow now that terms are accepted.
      onUserLoggedIn(currentUser);
    } else {
      errorEl.style.display = 'block';
      acceptBtn.disabled = false;
      acceptBtn.textContent = 'Aceptar y continuar';
    }
  });
}

/* ── USER LOGGED OUT ── */
function onUserLoggedOut() {
  // Mandatory login — redirect to login page
  const isLoginPage = window.location.pathname.includes('login') ||
                      window.location.pathname.includes('onboarding');
  if (!isLoginPage) {
    window.location.href = '/login.html';
  }
  updateUserUI(null);
}

/* ── UPDATE TOPBAR UI ── */
function updateUserUI(user) {
  const userBtn = document.getElementById('userBtn');
  if (!userBtn) return;

  if (user) {
    const name = userProfile?.display_name
      || user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || user.email?.split('@')[0]
      || 'Usuario';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const avatarUrl = userProfile?.avatar_url || null;

    userBtn.innerHTML = `
      <div class="user-avatar" id="topbarAvatar">
        ${avatarUrl
          ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : initials}
      </div>
      <span class="user-name">${name.split(' ')[0]}</span>
    `;
    userBtn.onclick = openProfile;
  } else {
    userBtn.innerHTML = `<span style="font-family:'Cinzel',serif;font-size:0.6rem;letter-spacing:1px">Entrar</span>`;
    userBtn.onclick = () => window.location.href = 'login.html';
  }
}

/* ── USER MENU ── */
function showUserMenu() {
  const existing = document.getElementById('userMenu');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('userBtn');
  const rect = btn.getBoundingClientRect();
  const user = currentUser;

  const menu = document.createElement('div');
  menu.id = 'userMenu';
  menu.style.cssText = `
    position:fixed; top:${rect.bottom + 8}px; right:16px;
    background:var(--bg2); border:1px solid var(--gold-dim);
    border-radius:10px; padding:8px; z-index:500;
    min-width:200px; box-shadow:0 8px 30px rgba(0,0,0,0.6);
    animation: fadeUp 0.15s ease;
  `;

  const email = user?.email || '';
  const name = user?.user_metadata?.full_name || email.split('@')[0];

  menu.innerHTML = `
    <div style="padding:8px 10px 10px;border-bottom:1px solid var(--border);margin-bottom:6px;">
      <div style="font-family:'Cinzel',serif;font-size:0.75rem;color:var(--text)">${name}</div>
      <div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px">${email}</div>
    </div>
    <button onclick="signOut()" style="width:100%;background:none;border:none;color:var(--red);
      font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:1px;text-transform:uppercase;
      padding:8px 10px;text-align:left;cursor:pointer;border-radius:6px;transition:background 0.15s;"
      onmouseover="this.style.background='rgba(224,90,90,0.1)'"
      onmouseout="this.style.background='none'">
      Cerrar sesión
    </button>
  `;

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeUserMenu, { once: true }), 100);
}

function closeUserMenu(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) menu.remove();
}

async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  // Clear all local data on logout
  localStorage.removeItem('kodesh_last_user');
  localStorage.removeItem('kodesh_read');
  localStorage.removeItem('kodesh_bookmarks');
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('note:')) keysToRemove.push(key);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  document.getElementById('profileOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  window.location.href = 'login.html';
}

/* ── PROGRESS SYNC ── */
async function syncProgressFromCloud() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  try {
    const { data, error } = await sb
      .from('reading_progress')
      .select('book_id, chapter')
      .eq('user_id', currentUser.id);

    if (error) throw error;

    // Merge cloud into local
    (data || []).forEach(row => {
      const key = `${row.book_id}:${row.chapter}`;
      state.readChapters[key] = true;
    });
    localStorage.setItem('kodesh_read', JSON.stringify(state.readChapters));
  } catch (e) {
    console.warn('Sync error:', e.message);
  }
}

async function saveChapterToCloud(bookId, chapter) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  try {
    await sb.from('reading_progress').upsert({
      user_id: currentUser.id,
      book_id: bookId,
      chapter: chapter,
    }, { onConflict: 'user_id,book_id,chapter' });
  } catch (e) {
    console.warn('Save error:', e.message);
  }
}

async function removeChapterFromCloud(bookId, chapter) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  try {
    await sb.from('reading_progress')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('book_id', bookId)
      .eq('chapter', chapter);
  } catch (e) {
    console.warn('Remove error:', e.message);
  }
}

/* ════════════════════════════════════
   READING STREAK SYSTEM
════════════════════════════════════ */
let userStreak = {
  current: 0,
  longest: 0,
  lastReadDate: null,
  totalDays: 0,
};

async function loadStreak() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  try {
    const { data } = await sb
      .from('reading_streaks')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
    if (data) {
      userStreak = {
        current: data.current_streak || 0,
        longest: data.longest_streak || 0,
        lastReadDate: data.last_read_date,
        totalDays: data.total_days_read || 0,
      };
    }
  } catch(e) { /* no streak yet */ }
}

async function updateStreak() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  const today = getLocalDateStr();
  const last = userStreak.lastReadDate;

  if (last === today) return;

  // Calculate yesterday in local time
  const now = new Date();
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth()+1).padStart(2,'0')}-${String(yesterdayDate.getDate()).padStart(2,'0')}`;

  let newCurrent;
  if (last === yesterday) {
    newCurrent = userStreak.current + 1;
  } else if (!last || last < yesterday) {
    newCurrent = 1;
  } else {
    return;
  }

  const newLongest = Math.max(newCurrent, userStreak.longest);
  const newTotal = userStreak.totalDays + 1;

  userStreak = {
    current: newCurrent,
    longest: newLongest,
    lastReadDate: today,
    totalDays: newTotal,
  };

  try {
    await sb.from('reading_streaks').upsert({
      user_id: currentUser.id,
      current_streak: newCurrent,
      longest_streak: newLongest,
      last_read_date: today,
      total_days_read: newTotal,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Show streak toast
    if (newCurrent > 1) {
      showToast(`🔥 ¡${newCurrent} días seguidos leyendo!`);
    } else {
      showToast('✨ ¡Nuevo día de lectura!');
    }
    // Update streak display
    renderStreakBadge();
  } catch(e) { console.warn('Streak update error:', e); }
}

function renderStreakBadge() {
  const badge = document.getElementById('streakBadge');
  if (!badge) return;
  if (userStreak.current > 0) {
    badge.textContent = `🔥 ${userStreak.current}`;
    badge.style.display = 'flex';
  }
}

/* ════════════════════════════════════
   DAILY READING PLAN
════════════════════════════════════ */
const BIBLE_ORDER = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS',
  '1PE','2PE','1JN','2JN','3JN','JUD','REV'
];

const CHAPTER_COUNTS = {
  GEN:50,EXO:40,LEV:27,NUM:36,DEU:34,JOS:24,JDG:21,RUT:4,
  '1SA':31,'2SA':24,'1KI':22,'2KI':25,'1CH':29,'2CH':36,
  EZR:10,NEH:13,EST:10,JOB:42,PSA:150,PRO:31,ECC:12,SNG:8,
  ISA:66,JER:52,LAM:5,EZK:48,DAN:12,HOS:14,JOL:3,AMO:9,
  OBA:1,JON:4,MIC:7,NAM:3,HAB:3,ZEP:3,HAG:2,ZEC:14,MAL:4,
  MAT:28,MRK:16,LUK:24,JHN:21,ACT:28,ROM:16,'1CO':16,'2CO':13,
  GAL:6,EPH:6,PHP:4,COL:4,'1TH':5,'2TH':3,'1TI':6,'2TI':4,
  TIT:3,PHM:1,HEB:13,JAS:5,'1PE':5,'2PE':3,'1JN':5,'2JN':1,
  '3JN':1,JUD:1,REV:22
};

const BOOK_NAMES_MAP = {
  GEN:'Génesis',EXO:'Éxodo',LEV:'Levítico',NUM:'Números',DEU:'Deuteronomio',
  JOS:'Josué',JDG:'Jueces',RUT:'Rut','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Reyes','2KI':'2 Reyes','1CH':'1 Crónicas','2CH':'2 Crónicas',
  EZR:'Esdras',NEH:'Nehemías',EST:'Ester',JOB:'Job',PSA:'Salmos',
  PRO:'Proverbios',ECC:'Eclesiastés',SNG:'Cantares',ISA:'Isaías',
  JER:'Jeremías',LAM:'Lamentaciones',EZK:'Ezequiel',DAN:'Daniel',
  HOS:'Oseas',JOL:'Joel',AMO:'Amós',OBA:'Abdías',JON:'Jonás',
  MIC:'Miqueas',NAM:'Nahúm',HAB:'Habacuc',ZEP:'Sofonías',HAG:'Hageo',
  ZEC:'Zacarías',MAL:'Malaquías',MAT:'Mateo',MRK:'Marcos',LUK:'Lucas',
  JHN:'Juan',ACT:'Hechos',ROM:'Romanos','1CO':'1 Corintios','2CO':'2 Corintios',
  GAL:'Gálatas',EPH:'Efesios',PHP:'Filipenses',COL:'Colosenses',
  '1TH':'1 Tesalonicenses','2TH':'2 Tesalonicenses','1TI':'1 Timoteo',
  '2TI':'2 Timoteo',TIT:'Tito',PHM:'Filemón',HEB:'Hebreos',JAS:'Santiago',
  '1PE':'1 Pedro','2PE':'2 Pedro','1JN':'1 Juan','2JN':'2 Juan',
  '3JN':'3 Juan',JUD:'Judas',REV:'Apocalipsis'
};

function getNextChaptersToRead(count = 1) {
  // Find first unread chapters in Bible order
  const suggestions = [];
  for (const bookId of BIBLE_ORDER) {
    if (suggestions.length >= count) break;
    const total = CHAPTER_COUNTS[bookId];
    for (let ch = 1; ch <= total; ch++) {
      if (suggestions.length >= count) break;
      const key = `${bookId}:${ch}`;
      if (!state.readChapters[key]) {
        suggestions.push({ bookId, chapter: ch, bookName: BOOK_NAMES_MAP[bookId] });
      }
    }
  }
  return suggestions;
}

function getLocalDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayProgress() {
  const todayKey = 'kodesh_today_' + getLocalDateStr();
  const data = JSON.parse(localStorage.getItem(todayKey) || '{"count":0,"chapters":[]}');
  return typeof data === 'number' ? data : (data.count || 0);
}

function getDayData(dateStr) {
  const key = 'kodesh_today_' + dateStr;
  const raw = localStorage.getItem(key);
  if (!raw) return { count: 0, chapters: [] };
  try {
    const data = JSON.parse(raw);
    if (typeof data === 'number') return { count: data, chapters: [] };
    return data;
  } catch(e) { return { count: 0, chapters: [] }; }
}

function recordTodayChapter(bookId, bookName, chapter) {
  const todayKey = 'kodesh_today_' + getLocalDateStr();
  const data = getDayData(getLocalDateStr());
  const alreadyRecorded = data.chapters.some(c => c.bookId === bookId && c.chapter === chapter);
  if (!alreadyRecorded) {
    data.chapters.push({ bookId, bookName, chapter });
  }
  data.count = data.chapters.length;
  localStorage.setItem(todayKey, JSON.stringify(data));
  updateStreak();
  renderDailyPlan();
}
