// KODESH Auth Module — Supabase integration
// Include this before the closing </body> tag in index.html

const SUPABASE_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2a25icWRzZ3FkbXdpcnJnY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzU2NjYsImV4cCI6MjA5NjExMTY2Nn0.RqiuH5fafECN1yW5MjBP3zzHAdXLH4QD3gBL_WZ-hB0';

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
      .select('display_name, study_goals, reading_goal_chapters, onboarding_completed')
      .eq('id', userId)
      .single();
    userProfile = data;
    return data;
  } catch(e) { return null; }
}

/* ── USER LOGGED IN ── */
async function onUserLoggedIn(user) {
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

  updateUserUI(user);
  await syncProgressFromCloud();
  await syncBookmarksFromCloud();
  await syncNotesFromCloud();
  updateProgress();
  updateBookList();
  renderBookmarkList();
}

/* ── USER LOGGED OUT ── */
function onUserLoggedOut() {
  updateUserUI(null);
}

/* ── UPDATE TOPBAR UI ── */
function updateUserUI(user) {
  const userBtn = document.getElementById('userBtn');
  if (!userBtn) return;

  if (user) {
    // Use display_name from profile if available
    const name = userProfile?.display_name
      || user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || user.email?.split('@')[0]
      || 'Usuario';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    userBtn.innerHTML = `
      <div class="user-avatar">${initials}</div>
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
