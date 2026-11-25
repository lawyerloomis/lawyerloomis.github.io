/* Public pages: pulls Bonnie's edits, posts and message of the day from the database,
   sends the contact form, and runs the click-to-edit mode (open any page with #edit while signed in). */
import * as store from './store.js';
import { sanitize, INLINE, renderMotd, renderPost, renderPostFull, motdActive, h, pageUrl } from './render.js';

const page = document.body.dataset.page || '';
const postUrl = (id) => pageUrl('blog/post/#' + id);
const ctx = { getMedia: store.getMedia, postUrl };

const editables = Array.from(document.querySelectorAll('[data-edit]'));
const originals = new Map(editables.map((el) => [el.dataset.edit, el.innerHTML]));

function applyContent(content) {
  editables.forEach((el) => {
    const v = content[el.dataset.edit];
    if (typeof v === 'string') el.innerHTML = sanitize(v, INLINE);
  });
}

/* ---------- Message of the day ---------- */

function showMotd(motd) {
  const slot = document.getElementById('motd');
  if (!slot || !motdActive(motd, store.todayISO())) return;
  if (!motd.everywhere && page !== 'home') return;
  const key = 'loomis-motd-hidden:' + (motd.updatedAt || motd.text);
  try { if (sessionStorage.getItem(key)) return; } catch (e) { /* ignore */ }
  const box = renderMotd(motd, pageUrl);
  box.querySelector('.motd-close')?.addEventListener('click', () => {
    slot.hidden = true;
    try { sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
  });
  slot.replaceChildren(box);
  slot.hidden = false;
}

/* ---------- Posts ---------- */

async function renderSlots() {
  const slots = Array.from(document.querySelectorAll('[data-slot]'));
  const postBox = document.querySelector('[data-post]');
  if (!slots.length && !postBox) return;

  if (postBox) return renderPostPage(postBox);

  let posts = [];
  try { posts = await store.listPublishedPosts(); } catch (e) { console.warn('Posts could not load', e); }
  slots.forEach((slot) => {
    const place = slot.dataset.slot;
    const list = slot.querySelector('[data-posts]');
    const mine = posts.filter((p) => (p.places || []).includes(place));
    const limit = Number(slot.dataset.limit || 0);
    const shown = limit ? mine.slice(0, limit) : mine;
    if (!shown.length) {
      if (slot.dataset.empty !== undefined) { slot.hidden = false; slot.querySelector('[data-empty-note]')?.removeAttribute('hidden'); }
      return;
    }
    list.replaceChildren(...shown.map((p) => renderPost(p, ctx)));
    const all = slot.querySelector('[data-all]');
    if (all && posts.some((p) => (p.places || []).includes('blog'))) { all.href = pageUrl('blog/'); all.hidden = false; }
    slot.hidden = false;
  });
}

async function renderPostPage(box) {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  let post = null;
  try { post = await store.getPost(id); } catch (e) { post = null; }
  if (!post || (post.status !== 'published' && store.mode !== 'demo')) {
    box.replaceChildren(
      h('h1', { text: 'That post isn’t available.' }),
      h('p', { class: 'lede' }, 'It may have been taken down. ', h('a', { class: 'link-gold', href: pageUrl('blog/'), text: 'See all posts' }), '.')
    );
    return;
  }
  document.title = post.title + ' | The Loomis Firm';
  box.replaceChildren(renderPostFull(post, ctx));
}

window.addEventListener('hashchange', () => {
  const box = document.querySelector('[data-post]');
  if (box) renderPostPage(box);
  if (location.hash === '#edit') startEditMode();
});

/* ---------- Contact form ---------- */

function setupContactForm() {
  const form = document.querySelector('form[data-form]');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.elements.company && form.elements.company.value) { form.reset(); status.textContent = 'Message sent.'; return; }
    if (store.mode === 'off') {
      status.textContent = 'Online messages aren’t connected yet. Please call (843) 299-0400 and we’ll set up your consultation.';
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      await store.sendMessage(data);
      form.reset();
      status.textContent = 'Message sent. We’ll be in touch soon to schedule your consultation.';
    } catch (err) {
      console.warn(err);
      status.textContent = 'Your message didn’t send. Please call (843) 299-0400.';
    } finally {
      button.disabled = false;
    }
  });
}

/* ---------- Click-to-edit page text ---------- */

let editing = false;

async function startEditMode() {
  if (editing || !editables.length) return;
  if (store.mode === 'off') return;
  const ok = await new Promise((resolve) => {
    let stop = () => {};
    stop = store.onAuth((user, admin) => { resolve(!!(user && admin)); setTimeout(() => stop(), 0); });
  });
  if (!ok) {
    const bar = editBar();
    bar.querySelector('.edit-msg').textContent = 'Sign in on the admin page first, then come back to edit this page.';
    bar.querySelector('.edit-actions').replaceChildren(h('a', { class: 'btn btn-brass', href: pageUrl('admin/'), text: 'Go to sign in' }));
    return;
  }
  editing = true;
  document.documentElement.classList.add('is-editing');
  const changed = new Set();
  const bar = editBar();
  const msg = bar.querySelector('.edit-msg');
  const actions = bar.querySelector('.edit-actions');
  const saveBtn = h('button', { class: 'btn btn-brass', type: 'button', text: 'Save changes', disabled: true });
  const resetBtn = h('button', { class: 'edit-link', type: 'button', text: 'Use the original text here', hidden: true });
  const doneBtn = h('button', { class: 'edit-link', type: 'button', text: 'Done' });
  actions.replaceChildren(resetBtn, saveBtn, doneBtn);
  let current = null;
  const intro = 'Editing this page. Tap any outlined text to change it.';
  const refresh = () => {
    saveBtn.disabled = !changed.size;
    saveBtn.textContent = changed.size ? `Save ${changed.size} change${changed.size > 1 ? 's' : ''}` : 'Save changes';
    msg.textContent = changed.size ? 'You have unsaved changes.' : intro;
  };
  refresh();

  editables.forEach((el) => {
    const single = /^(H1|H2|H3|LI|FIGCAPTION|TD|STRONG|SPAN)$/.test(el.tagName) || el.classList.contains('role');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.addEventListener('input', () => { changed.add(el.dataset.edit); refresh(); });
    el.addEventListener('focus', () => {
      current = el;
      resetBtn.hidden = el.innerHTML === originals.get(el.dataset.edit);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!single) document.execCommand('insertLineBreak');
    });
    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
    });
  });

  resetBtn.addEventListener('click', () => {
    if (!current) return;
    current.innerHTML = originals.get(current.dataset.edit);
    changed.add(current.dataset.edit);
    resetBtn.hidden = true;
    refresh();
  });

  saveBtn.addEventListener('click', async () => {
    const patch = {};
    changed.forEach((key) => {
      const el = editables.find((x) => x.dataset.edit === key);
      const html = sanitize(el.innerHTML, INLINE);
      patch[key] = html === sanitize(originals.get(key), INLINE) ? null : html;
    });
    saveBtn.disabled = true;
    msg.textContent = 'Saving…';
    try {
      await store.saveContent(patch);
      changed.clear();
      refresh();
      msg.textContent = 'Saved. Your changes are live.';
    } catch (err) {
      msg.textContent = store.explain(err);
      saveBtn.disabled = false;
    }
  });

  doneBtn.addEventListener('click', () => {
    if (changed.size && !doneBtn.dataset.confirm) {
      doneBtn.dataset.confirm = '1';
      doneBtn.textContent = 'Leave without saving';
      msg.textContent = 'You have unsaved changes. Save them first, or tap again to leave without saving.';
      return;
    }
    if (changed.size) location.reload();
    stopEditMode(bar);
  });
}

function stopEditMode(bar) {
  editing = false;
  document.documentElement.classList.remove('is-editing');
  editables.forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
  bar.remove();
  history.replaceState(null, '', location.pathname + location.search);
}

function editBar() {
  document.querySelector('.edit-bar')?.remove();
  const bar = h('div', { class: 'edit-bar', role: 'region', 'aria-label': 'Page editor' },
    h('div', { class: 'wrap edit-bar-inner' }, h('p', { class: 'edit-msg', 'aria-live': 'polite' }), h('div', { class: 'edit-actions' })));
  document.body.append(bar);
  return bar;
}

/* ---------- Start ---------- */

async function init() {
  setupContactForm();
  if (store.mode === 'off') {
    document.querySelectorAll('[data-slot][data-empty]').forEach((s) => { s.hidden = false; s.querySelector('[data-empty-note]')?.removeAttribute('hidden'); });
    if (document.querySelector('[data-post]')) renderPostPage(document.querySelector('[data-post]'));
    return;
  }
  let site = { content: {}, motd: null };
  try { site = await store.getSite(); } catch (e) { console.warn('Site text could not load', e); }
  applyContent(site.content);
  showMotd(site.motd);
  await renderSlots();
  if (location.hash === '#edit') startEditMode();
}

init();
