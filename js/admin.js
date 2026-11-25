/* Loomis Firm admin portal */
import * as store from './store.js';
import { sanitize, renderPost, renderPostFull, renderMotd, h, formatDate, textOf, pageUrl, motdActive } from './render.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const ctx = { getMedia: store.getMedia, postUrl: (id) => pageUrl('blog/post/#' + id) };
const PLACE_NAMES = { home: 'Home page', blog: 'Blog', about: 'About page', contact: 'Contact page' };

let user = null;
let started = false;

/* =========================================================
   Sign in
   ========================================================= */

const views = { loading: $('#loading'), login: $('#login'), app: $('#app') };
const show = (name) => Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });

if (store.mode === 'off') {
  show('login');
  $('#login-form').hidden = true;
  $('#login-note').hidden = true;
  $('#setup-note').hidden = false;
  // no demo on the live domain
  if (/(^|\.)lawyerloomis\.com$/.test(location.hostname)) {
    $('#try-demo').hidden = true;
    $$('#setup-note p')[1].hidden = true;
  }
} else {
  if (store.mode === 'demo') {
    $('#login-note').textContent = 'Demo mode: sign in with any email and password.';
    $('#l-pass').required = false;
    $('#demo-banner').hidden = false;
  }
  store.onAuth((u, admin) => {
    if (!u) { user = null; show('login'); return; }
    if (!admin) {
      show('login');
      $('#login-status').textContent = `You’re signed in as ${u.email}, but that account isn’t an admin yet. Ask whoever manages the website to add it.`;
      return;
    }
    user = u;
    startApp();
  });
}

$('#try-demo').addEventListener('click', () => { store.enableDemo(true); location.reload(); });
$('#leave-demo').addEventListener('click', async () => { await store.signOut(); store.enableDemo(false); location.reload(); });
$('#reset-demo').addEventListener('click', () => { store.resetDemo(); location.reload(); });

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('#login-status');
  status.textContent = 'Signing in…';
  try {
    await store.signIn($('#l-email').value.trim(), $('#l-pass').value);
    status.textContent = '';
  } catch (err) {
    status.textContent = store.explain(err);
  }
});

$('#forgot').addEventListener('click', async () => {
  const email = $('#l-email').value.trim();
  const status = $('#login-status');
  if (!email) { status.textContent = 'Type your email above first, then tap “Forgot your password?” again.'; $('#l-email').focus(); return; }
  if (store.mode === 'demo') { status.textContent = 'In demo mode no email is sent.'; return; }
  try {
    await store.resetPassword(email);
    status.textContent = `We sent a link to ${email} to set a new password. Check your inbox and spam folder.`;
  } catch (err) {
    status.textContent = store.explain(err);
  }
});

$('#sign-out').addEventListener('click', async () => {
  if (editorDirty() && !confirmTwice($('#sign-out'), 'Sign out without saving')) return;
  await store.signOut();
  location.reload();
});

/* Two-tap confirm: first tap changes the label, second tap within 5 seconds goes ahead */
function confirmTwice(btn, label) {
  if (btn.dataset.armed === '1') { delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed === '1') { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 5000);
  return false;
}

/* =========================================================
   App shell and tabs
   ========================================================= */

function startApp() {
  show('app');
  $('#who').textContent = user.email;
  if (started) return;
  started = true;
  const first = (location.hash || '').replace('#', '');
  selectTab(['messages', 'posts', 'motd', 'text', 'account'].includes(first) ? first : 'messages');
  watchInbox();
  loadPosts();
  loadSite();
}

$$('.admin-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.tab !== 'posts' && !$('#editor').hidden && editorDirty()) {
    edStatus('You have unsaved changes to this post. Save it, or tap “All posts” to leave it.');
    selectTab('posts');
    return;
  }
  selectTab(b.dataset.tab);
}));

function selectTab(name) {
  $$('.admin-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  history.replaceState(null, '', '#' + name);
  window.scrollTo(0, 0);
}

/* =========================================================
   Messages
   ========================================================= */

let messages = [];
let msgFilter = 'all';
const openMsgs = new Set();

function watchInbox() {
  store.watchMessages((list) => { messages = list; renderMessages(); }, (err) => {
    $('#msg-list').replaceChildren(h('div', { class: 'empty' }, h('strong', { text: 'Messages couldn’t load.' }), store.explain(err)));
  });
}

$$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
  msgFilter = b.dataset.filter;
  $$('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderMessages();
}));

function whenShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const whenLong = (iso) => iso ? new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');

function renderMessages() {
  const unread = messages.filter((m) => !m.read).length;
  const badge = $('#unread-badge');
  badge.hidden = !unread;
  badge.textContent = unread;
  $('[data-filter="unread"]').textContent = unread ? `Unread (${unread})` : 'Unread';

  const list = msgFilter === 'unread' ? messages.filter((m) => !m.read) : messages;
  const box = $('#msg-list');
  if (!list.length) {
    box.replaceChildren(h('div', { class: 'empty' },
      h('strong', { text: msgFilter === 'unread' ? 'You’re all caught up.' : 'No messages yet.' }),
      msgFilter === 'unread' ? 'There are no unread messages.' : 'When someone fills out the contact form on the website, their message shows up here.'));
    return;
  }
  box.replaceChildren(...list.map(messageEl));
}

function messageEl(m) {
  const open = openMsgs.has(m.id);
  const art = h('article', { class: 'msg' + (m.read ? '' : ' unread') });
  const head = h('button', { class: 'msg-head', type: 'button', 'aria-expanded': String(open) },
    h('span', { class: 'dot', 'aria-label': m.read ? null : 'Unread' }),
    h('span', { class: 'msg-who' }, h('span', { class: 'msg-name', text: m.name || 'No name given' }), h('span', { class: 'msg-topic', text: m.topic || '' })),
    h('span', { class: 'msg-date', text: whenShort(m.createdAt) }));
  const meta = h('dl', { class: 'msg-meta' },
    m.phone ? [h('dt', { text: 'Phone' }), h('dd', {}, h('a', { href: telHref(m.phone), text: m.phone }))] : null,
    m.email ? [h('dt', { text: 'Email' }), h('dd', {}, h('a', { href: 'mailto:' + m.email, text: m.email }))] : null,
    [h('dt', { text: 'Sent' }), h('dd', { text: whenLong(m.createdAt) })]);
  const readBtn = h('button', { class: 'text-btn', type: 'button', text: m.read ? 'Mark as unread' : 'Mark as read' });
  const delBtn = h('button', { class: 'text-btn danger', type: 'button', text: 'Delete' });
  const body = h('div', { class: 'msg-body', hidden: !open },
    meta,
    h('p', { class: 'msg-text', text: m.message || '(No message)' }),
    h('div', { class: 'msg-actions' },
      m.phone ? h('a', { class: 'btn btn-leather leather stitched', href: telHref(m.phone), text: 'Call back' }) : null,
      m.email ? h('a', { class: 'btn-outline', href: 'mailto:' + m.email + '?subject=' + encodeURIComponent('Your message to The Loomis Firm'), text: 'Reply by email' }) : null,
      readBtn, delBtn));
  head.addEventListener('click', () => {
    const now = !openMsgs.has(m.id);
    now ? openMsgs.add(m.id) : openMsgs.delete(m.id);
    head.setAttribute('aria-expanded', String(now));
    body.hidden = !now;
    if (now && !m.read) store.updateMessage(m.id, { read: true }).catch((err) => alertInline(body, store.explain(err)));
  });
  readBtn.addEventListener('click', () => store.updateMessage(m.id, { read: !m.read }).catch((err) => alertInline(body, store.explain(err))));
  delBtn.addEventListener('click', () => {
    if (!confirmTwice(delBtn, 'Tap again to delete')) return;
    openMsgs.delete(m.id);
    store.deleteMessage(m.id).catch((err) => alertInline(body, store.explain(err)));
  });
  art.append(head, body);
  return art;
}

function alertInline(container, text) {
  container.querySelector('.inline-error')?.remove();
  container.append(h('p', { class: 'form-status inline-error', role: 'alert', text }));
}

/* =========================================================
   Posts: list
   ========================================================= */

let posts = [];

async function loadPosts() {
  try { posts = await store.listAllPosts(); renderPostRows(); }
  catch (err) { $('#post-rows').replaceChildren(h('div', { class: 'empty' }, h('strong', { text: 'Posts couldn’t load.' }), store.explain(err))); }
}

function renderPostRows() {
  const box = $('#post-rows');
  if (!posts.length) {
    box.replaceChildren(h('div', { class: 'empty' }, h('strong', { text: 'No posts yet.' }), 'Tap “New post” to write your first update.'));
    return;
  }
  box.replaceChildren(...posts.map((p) => {
    const thumb = h('span', { class: 'post-thumb', 'aria-hidden': 'true' });
    if (p.images && p.images[0]) store.getMedia(p.images[0].id, 'thumb').then((u) => { if (u) thumb.replaceChildren(h('img', { src: u, alt: '' })); });
    else thumb.textContent = (p.title || '?').trim().charAt(0).toUpperCase();
    const where = (p.places || []).map((x) => PLACE_NAMES[x]).join(', ') || 'Not placed anywhere yet';
    const row = h('button', { class: 'post-row', type: 'button' },
      thumb,
      h('span', {}, h('span', { class: 'post-row-title', text: p.title || 'Untitled' }), h('span', { class: 'post-row-meta', text: `${formatDate(p.date)} · ${where}` })),
      h('span', { class: 'pills' }, h('span', { class: 'pill ' + p.status, text: p.status === 'published' ? 'Published' : 'Draft' }), p.pinned ? h('span', { class: 'pill pinned', text: 'Pinned' }) : null));
    row.addEventListener('click', () => openEditor(p));
    return row;
  }));
}

$('#new-post').addEventListener('click', () => openEditor(null));

/* =========================================================
   Posts: editor
   ========================================================= */

let draft = null;          // working copy
let savedJSON = '';        // to detect unsaved changes
let addedMedia = [];       // photos uploaded during this edit (removed again if discarded)
let removedMedia = [];     // photos taken off a saved post (deleted after it saves)
let busyPhotos = 0;
let previewAs = 'list';

const ed = {
  title: $('#ed-title'), body: $('#ed-body'), photos: $('#ed-photos'), file: $('#ed-file'),
  date: $('#ed-date'), pinned: $('#ed-pinned'), preview: $('#ed-preview'), status: $('#ed-status'),
  publish: $('#ed-publish'), draftBtn: $('#ed-draft'), del: $('#ed-delete'), pill: $('#ed-pill')
};

function snapshot() {
  return JSON.stringify({ t: ed.title.value, b: sanitize(ed.body.innerHTML), s: styleVal(), p: placesVal(), i: draft.images, d: ed.date.value, n: ed.pinned.checked });
}
const editorDirty = () => !!draft && !$('#editor').hidden && snapshot() !== savedJSON;
const styleVal = () => ($('input[name="ed-style"]:checked') || {}).value || 'card';
const placesVal = () => $$('input[name="ed-place"]:checked').map((x) => x.value);
const edStatus = (t, html) => { ed.status.textContent = ''; if (html) ed.status.append(html); else ed.status.textContent = t; };

function openEditor(post) {
  draft = post ? JSON.parse(JSON.stringify(post)) : { title: '', body: '', style: 'card', places: ['home', 'blog'], images: [], date: store.todayISO(), pinned: false, status: 'draft' };
  addedMedia = []; removedMedia = [];
  ed.title.value = draft.title || '';
  ed.body.innerHTML = sanitize(draft.body || '');
  $$('input[name="ed-style"]').forEach((r) => { r.checked = r.value === (draft.style || 'card'); });
  $$('input[name="ed-place"]').forEach((c) => { c.checked = (draft.places || []).includes(c.value); });
  ed.date.value = draft.date || store.todayISO();
  ed.pinned.checked = !!draft.pinned;
  edStatus('');
  delete ed.del.dataset.armed;
  ed.del.textContent = 'Delete this post';
  ed.del.hidden = !draft.id;
  updateButtons();
  renderPhotos();
  savedJSON = snapshot();
  $('#post-index').hidden = true;
  $('#editor').hidden = false;
  window.scrollTo(0, 0);
  renderPreview();
  if (!draft.id) ed.title.focus();
}

function updateButtons() {
  const live = draft.status === 'published';
  ed.publish.textContent = live ? 'Update' : 'Publish';
  ed.draftBtn.textContent = live ? 'Unpublish' : 'Save as draft';
  ed.pill.className = 'pill ' + (draft.id ? draft.status : 'draft');
  ed.pill.textContent = !draft.id ? 'New post' : live ? 'Published' : 'Draft';
}

$('#ed-back').addEventListener('click', async () => {
  if (editorDirty() && !confirmTwice($('#ed-back'), 'Leave without saving')) {
    edStatus('You have unsaved changes. Save them, or tap “Leave without saving”.');
    return;
  }
  for (const id of addedMedia) await store.deleteMedia(id).catch(() => {});
  closeEditor();
});

function closeEditor() {
  draft = null;
  $('#editor').hidden = true;
  $('#post-index').hidden = false;
  window.scrollTo(0, 0);
}

window.addEventListener('beforeunload', (e) => { if (editorDirty()) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- preview ---------- */

let previewTimer = null;
function renderPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (!draft) return;
    const p = { ...draft, images: draft.images.filter((i) => !i.pending), id: draft.id || 'preview', title: ed.title.value || 'Your title', body: sanitize(ed.body.innerHTML) || '<p>Your text appears here.</p>', style: styleVal(), date: ed.date.value };
    const el = previewAs === 'full'
      ? renderPostFull(p, ctx)
      : h('div', { class: 'post-list' }, renderPost(p, ctx));
    ed.preview.replaceChildren(el);
  }, 120);
}
['input', 'change'].forEach((t) => $('#editor').addEventListener(t, renderPreview));
$$('[data-preview]').forEach((b) => b.addEventListener('click', () => {
  previewAs = b.dataset.preview;
  $$('[data-preview]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderPreview();
}));

/* ---------- rich text ---------- */

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }
let savedRange = null;
const keepRange = () => { const s = getSelection(); if (s.rangeCount && ed.body.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
const restoreRange = () => { if (!savedRange) return; const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); };

$$('.rte-bar button').forEach((b) => {
  b.addEventListener('mousedown', (e) => e.preventDefault());   // keep the text selected
  b.addEventListener('click', () => {
    const cmd = b.dataset.cmd;
    ed.body.focus();
    restoreRange();
    if (cmd === 'link') {
      keepRange();
      $('#rte-link').hidden = false;
      $('#rte-url').value = '';
      $('#rte-url').focus();
      return;
    }
    if (cmd === 'h2' || cmd === 'h3' || cmd === 'blockquote') {
      const cur = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
      document.execCommand('formatBlock', false, cur === cmd ? 'p' : cmd);
    } else if (cmd === 'clear') {
      document.execCommand('removeFormat');
      document.execCommand('unlink');
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand(cmd);
    }
    toolbarState();
    renderPreview();
  });
});

$('#rte-link-ok').addEventListener('click', () => {
  let url = $('#rte-url').value.trim();
  if (url && !/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
  ed.body.focus();
  restoreRange();
  if (url) {
    const sel = getSelection();
    if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
    else document.execCommand('createLink', false, url);
  }
  $('#rte-link').hidden = true;
  renderPreview();
});
$('#rte-link-cancel').addEventListener('click', () => { $('#rte-link').hidden = true; ed.body.focus(); restoreRange(); });
$('#rte-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#rte-link-ok').click(); } });

ed.body.addEventListener('paste', (e) => {
  e.preventDefault();
  const cd = e.clipboardData || window.clipboardData;
  const html = cd.getData('text/html');
  if (html) document.execCommand('insertHTML', false, sanitize(html));
  else {
    const text = cd.getData('text/plain');
    const paras = text.split(/\n{2,}/).map((t) => '<p>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>').join('');
    document.execCommand('insertHTML', false, paras);
  }
});

function toolbarState() {
  const block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
  $$('.rte-bar button').forEach((b) => {
    const c = b.dataset.cmd;
    let on = false;
    try {
      if (['bold', 'italic', 'insertUnorderedList', 'insertOrderedList'].includes(c)) on = document.queryCommandState(c);
      else if (['h2', 'h3', 'blockquote'].includes(c)) on = block === c;
    } catch (e) { on = false; }
    b.setAttribute('aria-pressed', String(on));
  });
}
document.addEventListener('selectionchange', () => { if (document.activeElement === ed.body) { keepRange(); toolbarState(); } });

/* ---------- photos ---------- */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo this browser can open. Try a JPEG or PNG.')); };
    img.src = url;
  });
}

function encode(img, maxSide, maxChars, quality) {
  let scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  for (let tries = 0; tries < 8; tries++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = hgt;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, hgt);
    g.drawImage(img, 0, 0, w, hgt);
    let q = quality;
    let data = c.toDataURL('image/jpeg', q);
    while (data.length > maxChars && q > 0.5) { q -= 0.08; data = c.toDataURL('image/jpeg', q); }
    if (data.length <= maxChars) return { data, w, h: hgt };
    scale *= 0.8;
  }
  throw new Error('That photo is too large to use. Try a smaller one.');
}

ed.file.addEventListener('change', async () => {
  const files = Array.from(ed.file.files || []);
  ed.file.value = '';
  for (const file of files) {
    const temp = { id: 'tmp-' + Math.random().toString(36).slice(2), w: 0, h: 0, alt: '', pending: true };
    draft.images.push(temp);
    busyPhotos++;
    renderPhotos();
    try {
      const { img, url } = await loadImage(file);
      const full = encode(img, 1800, 900000, 0.84);
      const thumb = encode(img, 720, 160000, 0.8);
      URL.revokeObjectURL(url);
      const id = await store.saveMedia({ thumb: thumb.data, full: full.data, w: full.w, h: full.h });
      addedMedia.push(id);
      Object.assign(temp, { id, w: full.w, h: full.h });
      delete temp.pending;
    } catch (err) {
      draft.images = draft.images.filter((x) => x !== temp);
      edStatus(store.explain(err));
    } finally {
      busyPhotos--;
      renderPhotos();
      renderPreview();
    }
  }
});

function renderPhotos() {
  ed.photos.replaceChildren(...draft.images.map((img, i) => {
    const ph = h('div', { class: 'ph' }, i === 0 ? h('span', { class: 'main-tag', text: 'Main photo' }) : null, img.pending ? 'Preparing photo…' : null);
    if (!img.pending) store.getMedia(img.id, 'thumb').then((u) => { if (u) ph.append(h('img', { src: u, alt: '' })); });
    const alt = h('input', { type: 'text', value: img.alt || '', placeholder: 'Describe this photo', 'aria-label': `Description for photo ${i + 1}`, maxlength: '200' });
    alt.addEventListener('input', () => { img.alt = alt.value; });
    const left = h('button', { type: 'button', 'aria-label': 'Move earlier', text: '←', disabled: i === 0 || img.pending });
    const right = h('button', { type: 'button', 'aria-label': 'Move later', text: '→', disabled: i === draft.images.length - 1 || img.pending });
    const remove = h('button', { class: 'remove', type: 'button', text: 'Remove', disabled: !!img.pending });
    left.addEventListener('click', () => { move(i, -1); });
    right.addEventListener('click', () => { move(i, 1); });
    remove.addEventListener('click', () => {
      draft.images.splice(i, 1);
      if (addedMedia.includes(img.id)) { addedMedia = addedMedia.filter((x) => x !== img.id); store.deleteMedia(img.id).catch(() => {}); }
      else removedMedia.push(img.id);
      renderPhotos(); renderPreview();
    });
    return h('div', { class: 'photo-tile' }, ph, alt, h('div', { class: 'tile-actions' }, left, remove, right));
  }));
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= draft.images.length) return;
  [draft.images[i], draft.images[j]] = [draft.images[j], draft.images[i]];
  renderPhotos(); renderPreview();
}

/* ---------- save ---------- */

async function save(status) {
  if (busyPhotos) { edStatus('Wait for the photos to finish preparing, then try again.'); return; }
  const title = ed.title.value.trim();
  if (!title) { edStatus('Give the post a title first.'); ed.title.focus(); return; }
  const places = placesVal();
  if (status === 'published' && !places.length) { edStatus('Choose at least one place for the post to appear, then publish.'); return; }
  const post = {
    id: draft.id, title, body: sanitize(ed.body.innerHTML), style: styleVal(), places,
    images: draft.images.filter((i) => !i.pending), date: ed.date.value || store.todayISO(), pinned: ed.pinned.checked, status
  };
  ed.publish.disabled = ed.draftBtn.disabled = true;
  edStatus('Saving…');
  try {
    const id = await store.savePost(post);
    for (const mid of removedMedia) await store.deleteMedia(mid).catch(() => {});
    Object.assign(draft, post, { id });
    addedMedia = []; removedMedia = [];
    savedJSON = snapshot();
    ed.del.hidden = false;
    updateButtons();
    await loadPosts();
    if (status === 'published') {
      const where = places.map((p) => PLACE_NAMES[p]).join(', ');
      edStatus('', h('span', {}, `Published. It’s live on: ${where}. `, h('a', { href: ctx.postUrl(id), target: '_blank', rel: 'noopener', text: 'View it' })));
    } else {
      edStatus('Saved as a draft. It isn’t on the website.');
    }
  } catch (err) {
    edStatus(store.explain(err));
  } finally {
    ed.publish.disabled = ed.draftBtn.disabled = false;
  }
}
ed.publish.addEventListener('click', () => save('published'));
ed.draftBtn.addEventListener('click', () => save('draft'));
ed.del.addEventListener('click', async () => {
  if (!confirmTwice(ed.del, 'Tap again to delete for good')) return;
  try {
    await store.deletePost({ ...draft, images: [...draft.images, ...removedMedia.map((id) => ({ id }))] });
    await loadPosts();
    closeEditor();
  } catch (err) { edStatus(store.explain(err)); }
});

/* =========================================================
   Message of the day
   ========================================================= */

const m = {
  form: $('#motd-form'), on: $('#m-on'), text: $('#m-text'), count: $('#m-count'), link: $('#m-link'), linkText: $('#m-linktext'),
  customWrap: $('#m-custom-wrap'), custom: $('#m-custom'), until: $('#m-until'), status: $('#m-status'), preview: $('#m-preview')
};
let siteContent = {};

async function loadSite() {
  try {
    const site = await store.getSite();
    siteContent = site.content || {};
    fillMotd(site.motd || { on: false, text: '', style: 'ribbon' });
    renderTextPanel();
  } catch (err) {
    m.status.textContent = store.explain(err);
  }
}

function fillMotd(d) {
  m.on.checked = !!d.on;
  m.text.value = d.text || '';
  const known = Array.from(m.link.options).some((o) => o.value === (d.link || ''));
  m.link.value = known ? (d.link || '') : 'custom';
  m.custom.value = known ? '' : (d.link || '');
  m.linkText.value = d.linkText || '';
  $$('input[name="m-style"]').forEach((r) => { r.checked = r.value === (d.style || 'ribbon'); });
  $$('input[name="m-where"]').forEach((r) => { r.checked = r.value === (d.everywhere ? 'all' : 'home'); });
  m.until.value = d.until || '';
  motdChanged();
}

function motdValue() {
  let link = m.link.value === 'custom' ? m.custom.value.trim() : m.link.value;
  if (link && m.link.value === 'custom' && !/^(https?:|mailto:|tel:)/i.test(link)) link = 'https://' + link;
  return {
    on: m.on.checked, text: m.text.value.trim(), link, linkText: link ? (m.linkText.value.trim() || 'Learn more') : '',
    style: ($('input[name="m-style"]:checked') || {}).value || 'ribbon',
    everywhere: (($('input[name="m-where"]:checked') || {}).value === 'all'), until: m.until.value
  };
}

function motdChanged() {
  m.count.textContent = `${m.text.value.length} of 280 characters`;
  m.customWrap.hidden = m.link.value !== 'custom';
  m.linkText.disabled = !m.link.value;
  const v = motdValue();
  if (!v.text) { m.preview.replaceChildren(h('div', { class: 'empty' }, 'Type a message to see how it will look.')); return; }
  const banner = renderMotd(v, pageUrl);
  m.preview.replaceChildren(banner);
  if (!v.on) m.preview.append(h('p', { class: 'hint', style: 'padding: 10px 16px; margin: 0', text: 'The message is turned off, so it isn’t showing on the website.' }));
  else if (!motdActive(v, store.todayISO())) m.preview.append(h('p', { class: 'hint', style: 'padding: 10px 16px; margin: 0', text: 'The “stop showing” date has passed, so it isn’t showing on the website.' }));
}
['input', 'change'].forEach((t) => m.form.addEventListener(t, motdChanged));

m.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = motdValue();
  if (v.on && !v.text) { m.status.textContent = 'Type a message first, or turn it off.'; m.text.focus(); return; }
  m.status.textContent = 'Saving…';
  try {
    await store.saveMotd(v);
    m.status.textContent = v.on ? 'Saved. The message is on the website now.' : 'Saved. The message is turned off.';
  } catch (err) { m.status.textContent = store.explain(err); }
});

/* =========================================================
   Page text
   ========================================================= */

const PAGES = [['Home', ''], ['About', 'about/'], ['Services', 'services/'], ['Blog', 'blog/'], ['Contact', 'contact/']];
$('#page-links').replaceChildren(...PAGES.map(([name, path]) =>
  h('a', { class: 'page-link', href: pageUrl(path + '#edit'), target: '_blank', rel: 'noopener' }, name, h('span', { text: 'Edit text' }))));

function renderTextPanel() {
  const n = Object.keys(siteContent).length;
  $('#text-count').textContent = n
    ? `You’ve changed ${n} piece${n === 1 ? '' : 's'} of text across the website. To undo one, open that page and use “Use the original text here”.`
    : 'Nothing changed yet. The website is showing its original wording.';
  $('#restore-all').hidden = !n;
}
$('#restore-all').addEventListener('click', async () => {
  const btn = $('#restore-all');
  if (!confirmTwice(btn, 'Tap again to put every page back')) return;
  try {
    await store.clearContent();
    siteContent = {};
    renderTextPanel();
    $('#text-status').textContent = 'Done. Every page is back to its original wording.';
  } catch (err) { $('#text-status').textContent = store.explain(err); }
});
window.addEventListener('focus', () => { if (started) store.getSite().then((s) => { siteContent = s.content || {}; renderTextPanel(); }).catch(() => {}); });

/* =========================================================
   Account
   ========================================================= */

$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const st = $('#pw-status');
  const next = $('#pw-new').value;
  if (next !== $('#pw-again').value) { st.textContent = 'The two new passwords don’t match.'; return; }
  if (store.mode === 'demo') { st.textContent = 'In demo mode passwords aren’t changed.'; return; }
  st.textContent = 'Changing…';
  try {
    await store.changePassword($('#pw-now').value, next);
    e.target.reset();
    st.textContent = 'Password changed.';
  } catch (err) { st.textContent = store.explain(err); }
});

/* Keep text from being lost if something unexpected happens */
window.addEventListener('unhandledrejection', (e) => { console.warn(e.reason); });
void textOf;
