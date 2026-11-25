/* The Loomis Firm: data layer shared by the public site and the admin portal.

   Firebase mode: Firestore + Firebase Auth (free Spark plan; photos are stored in Firestore, so no Cloud Storage or card is needed).
   Demo mode:     everything lives in this browser's localStorage, so the portal can be tried before Firebase is set up.
   Off:           no Firebase config and no demo flag. The public site shows only its built-in content.

   Collections
     site/content     { [textKey]: html }            text Bonnie changed with the page editor
     site/motd        { on, text, linkText, link, style, until, everywhere, updatedAt }
     posts/{id}       { title, body, style, places[], images[{id,w,h,alt}], date, pinned, status, createdAt, updatedAt }
     media/{id}       { thumb, w, h, createdAt }      small copy of a photo (cards, lists)
     mediaFull/{id}   { data }                        full-size copy (features, galleries, post pages)
     messages/{id}    { name, phone, email, topic, message, read, createdAt }
     admins/{uid}     { email }                       who may use the admin portal (added by hand in the console)
*/
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

function demoWanted() {
  if (window.LOOMIS_DEMO) return true;
  try { return localStorage.getItem('loomis-demo') === '1'; } catch (e) { return false; }
}

export const mode = firebaseConfig ? 'firebase' : (demoWanted() ? 'demo' : 'off');

export function enableDemo(on) {
  try { on ? localStorage.setItem('loomis-demo', '1') : localStorage.removeItem('loomis-demo'); } catch (e) { /* storage blocked */ }
}

const nowISO = () => new Date().toISOString();
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------------------------------------ */
/* Firebase                                                            */
/* ------------------------------------------------------------------ */

let fb = null;          // { app, db, fs, lite }
let fbAuth = null;      // { auth, au }

async function firebase({ full = false } = {}) {
  if (fb && (fb.full || !full)) return fb;
  const appMod = await import(SDK + 'firebase-app.js');
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  const fs = await import(SDK + (full ? 'firebase-firestore.js' : 'firebase-firestore-lite.js'));
  fb = { app, fs, db: fs.getFirestore(app), full };
  return fb;
}

async function auth() {
  if (fbAuth) return fbAuth;
  const { app } = await firebase({ full: true });
  const au = await import(SDK + 'firebase-auth.js');
  fbAuth = { au, auth: au.getAuth(app) };
  return fbAuth;
}

const tsToISO = (v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : (v || null);

function fromDoc(snap) {
  const d = snap.data() || {};
  const out = { id: snap.id, ...d };
  ['createdAt', 'updatedAt'].forEach((k) => { if (k in out) out[k] = tsToISO(out[k]); });
  return out;
}

/* ------------------------------------------------------------------ */
/* Demo storage                                                        */
/* ------------------------------------------------------------------ */

const DEMO_KEY = 'loomis-demo-data';
let memoryDemo = null;

function seed() {
  return {
    content: {},
    motd: {
      on: true,
      text: 'Our office is closed Thursday and Friday for Thanksgiving. Happy holidays from all of us.',
      linkText: 'Book a consultation',
      link: 'contact/',
      style: 'ribbon',
      until: '',
      everywhere: false,
      updatedAt: nowISO()
    },
    posts: [
      {
        id: 'sample-welcome',
        title: 'Welcome to our new website',
        body: '<p>We built this site to make it easier to understand your options and to reach us. You&rsquo;ll find updates from the office here, along with plain-language articles about South Carolina family law.</p><p>If you have a question that isn&rsquo;t answered here, call us at (843) 299-0400. Your first consultation is free.</p>',
        style: 'feature',
        places: ['home', 'blog'],
        images: [{ id: 'sample-photo', w: 2000, h: 1333, alt: 'Bonnie and Chris Loomis' }],
        date: todayISO(),
        pinned: true,
        status: 'published',
        createdAt: nowISO(), updatedAt: nowISO()
      },
      {
        id: 'sample-mediation',
        title: 'What to expect at your first mediation',
        body: '<p>Mediation is a private meeting where you and your spouse work toward an agreement with the help of a neutral mediator. Most sessions take a few hours.</p><h3>Before the day</h3><ul><li>Gather recent pay stubs, tax returns and account statements.</li><li>Write down what matters most to you, especially about the children.</li></ul><p>We&rsquo;ll prepare with you beforehand, so nothing about the day is a surprise.</p>',
        style: 'card',
        places: ['home', 'blog'],
        images: [],
        date: todayISO(),
        pinned: false,
        status: 'published',
        createdAt: nowISO(), updatedAt: nowISO()
      },
      {
        id: 'sample-holiday',
        title: 'Holiday parenting schedules',
        body: '<p>The holidays can be the hardest part of a new parenting plan. A clear, written holiday schedule prevents most arguments before they start.</p>',
        style: 'note',
        places: ['blog', 'about'],
        images: [],
        date: todayISO(),
        pinned: false,
        status: 'draft',
        createdAt: nowISO(), updatedAt: nowISO()
      }
    ],
    media: {
      'sample-photo': { thumb: 'URL:images/bonnie-chris.jpg', full: 'URL:images/bonnie-chris.jpg', w: 2000, h: 1333 }
    },
    messages: [
      { id: 'sample-msg-1', name: 'Sample: Jordan Avery', phone: '(843) 555-0142', email: 'jordan@example.com', topic: 'Child custody or visitation', message: 'This is a sample message so you can see how the inbox works. Real messages from the contact form will appear here.', read: false, createdAt: nowISO() },
      { id: 'sample-msg-2', name: 'Sample: Casey Morgan', phone: '(843) 555-0187', email: '', topic: 'Mediation', message: 'Another sample. Mark messages as read, or delete them once you have called the person back.', read: true, createdAt: new Date(Date.now() - 86400000).toISOString() }
    ]
  };
}

function demoLoad() {
  if (memoryDemo) return memoryDemo;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    memoryDemo = raw ? JSON.parse(raw) : seed();
  } catch (e) {
    memoryDemo = seed();
  }
  return memoryDemo;
}

function demoSave() {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(memoryDemo));
  } catch (e) {
    throw new Error('This browser is out of space for demo photos. Remove a photo or reset the demo.');
  }
}

export function resetDemo() {
  memoryDemo = seed();
  try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* ignore */ }
}

const demoListeners = new Set();
function demoNotify() { demoListeners.forEach((fn) => fn(demoLoad().messages.slice())); }

/* ------------------------------------------------------------------ */
/* Site text and message of the day                                    */
/* ------------------------------------------------------------------ */

export async function getSite() {
  if (mode === 'demo') {
    const d = demoLoad();
    return { content: { ...d.content }, motd: d.motd ? { ...d.motd } : null };
  }
  if (mode !== 'firebase') return { content: {}, motd: null };
  const { fs, db } = await firebase();
  const [c, m] = await Promise.all([
    fs.getDoc(fs.doc(db, 'site', 'content')),
    fs.getDoc(fs.doc(db, 'site', 'motd'))
  ]);
  return { content: c.exists() ? c.data() : {}, motd: m.exists() ? fromDoc(m) : null };
}

/* patch: { key: html } to set, { key: null } to restore the original text */
export async function saveContent(patch) {
  if (mode === 'demo') {
    const d = demoLoad();
    Object.entries(patch).forEach(([k, v]) => { if (v === null) delete d.content[k]; else d.content[k] = v; });
    demoSave();
    return;
  }
  const { fs, db } = await firebase();
  const data = {};
  Object.entries(patch).forEach(([k, v]) => { data[k] = v === null ? fs.deleteField() : v; });
  const ref = fs.doc(db, 'site', 'content');
  const snap = await fs.getDoc(ref);
  if (snap.exists()) await fs.updateDoc(ref, data);
  else await fs.setDoc(ref, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)));
}

export async function clearContent() {
  if (mode === 'demo') { demoLoad().content = {}; demoSave(); return; }
  const { fs, db } = await firebase();
  await fs.setDoc(fs.doc(db, 'site', 'content'), {});
}

export async function saveMotd(motd) {
  const clean = {
    on: !!motd.on,
    text: String(motd.text || '').slice(0, 280),
    linkText: String(motd.linkText || '').slice(0, 60),
    link: String(motd.link || '').slice(0, 300),
    style: ['ribbon', 'leather', 'quiet'].includes(motd.style) ? motd.style : 'ribbon',
    until: motd.until || '',
    everywhere: !!motd.everywhere
  };
  if (mode === 'demo') { demoLoad().motd = { ...clean, updatedAt: nowISO() }; demoSave(); return; }
  const { fs, db } = await firebase();
  await fs.setDoc(fs.doc(db, 'site', 'motd'), { ...clean, updatedAt: fs.serverTimestamp() });
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

export function sortPosts(list) {
  return list.slice().sort((a, b) =>
    (b.pinned === true) - (a.pinned === true) ||
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function listPublishedPosts() {
  if (mode === 'demo') return sortPosts(demoLoad().posts.filter((p) => p.status === 'published'));
  if (mode !== 'firebase') return [];
  const { fs, db } = await firebase();
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'posts'), fs.where('status', '==', 'published')));
  return sortPosts(snap.docs.map(fromDoc));
}

export async function listAllPosts() {
  if (mode === 'demo') return sortPosts(demoLoad().posts);
  const { fs, db } = await firebase({ full: true });
  const snap = await fs.getDocs(fs.collection(db, 'posts'));
  return sortPosts(snap.docs.map(fromDoc));
}

export async function getPost(id) {
  if (!id) return null;
  if (mode === 'demo') return demoLoad().posts.find((p) => p.id === id) || null;
  if (mode !== 'firebase') return null;
  const { fs, db } = await firebase();
  const snap = await fs.getDoc(fs.doc(db, 'posts', id));
  return snap.exists() ? fromDoc(snap) : null;
}

export async function savePost(post) {
  const data = {
    title: String(post.title || '').slice(0, 200),
    body: String(post.body || ''),
    style: ['card', 'feature', 'note', 'gallery'].includes(post.style) ? post.style : 'card',
    places: (post.places || []).filter((p) => ['home', 'blog', 'about', 'contact'].includes(p)),
    images: (post.images || []).map((i) => ({ id: i.id, w: i.w || 0, h: i.h || 0, alt: String(i.alt || '').slice(0, 200) })),
    date: post.date || todayISO(),
    pinned: !!post.pinned,
    status: post.status === 'published' ? 'published' : 'draft'
  };
  if (mode === 'demo') {
    const d = demoLoad();
    if (post.id) {
      const i = d.posts.findIndex((p) => p.id === post.id);
      if (i > -1) d.posts[i] = { ...d.posts[i], ...data, updatedAt: nowISO() };
      demoSave();
      return post.id;
    }
    const id = 'post-' + uid();
    d.posts.push({ id, ...data, createdAt: nowISO(), updatedAt: nowISO() });
    demoSave();
    return id;
  }
  const { fs, db } = await firebase({ full: true });
  if (post.id) {
    await fs.updateDoc(fs.doc(db, 'posts', post.id), { ...data, updatedAt: fs.serverTimestamp() });
    return post.id;
  }
  const ref = await fs.addDoc(fs.collection(db, 'posts'), { ...data, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
  return ref.id;
}

export async function deletePost(post) {
  for (const img of post.images || []) await deleteMedia(img.id).catch(() => {});
  if (mode === 'demo') {
    const d = demoLoad();
    d.posts = d.posts.filter((p) => p.id !== post.id);
    demoSave();
    return;
  }
  const { fs, db } = await firebase({ full: true });
  await fs.deleteDoc(fs.doc(db, 'posts', post.id));
}

/* ------------------------------------------------------------------ */
/* Photos (stored in Firestore as compressed JPEG data URLs)           */
/* ------------------------------------------------------------------ */

const mediaCache = new Map();

export async function saveMedia({ thumb, full, w, h }) {
  if (mode === 'demo') {
    const d = demoLoad();
    const id = 'img-' + uid();
    d.media[id] = { thumb, full, w, h };
    try { demoSave(); } catch (e) { delete d.media[id]; throw e; }
    return id;
  }
  const { fs, db } = await firebase({ full: true });
  const ref = fs.doc(fs.collection(db, 'media'));
  await fs.setDoc(fs.doc(db, 'mediaFull', ref.id), { data: full });
  await fs.setDoc(ref, { thumb, w, h, createdAt: fs.serverTimestamp() });
  return ref.id;
}

/* size: 'thumb' or 'full'. Returns a URL usable as <img src>, or null. */
export async function getMedia(id, size = 'thumb') {
  const key = id + ':' + size;
  if (mediaCache.has(key)) return mediaCache.get(key);
  let url = null;
  if (mode === 'demo') {
    const m = demoLoad().media[id];
    if (m) url = size === 'full' ? m.full : m.thumb;
    if (url && url.startsWith('URL:')) url = new URL(url.slice(4), new URL('../', import.meta.url)).href;
  } else if (mode === 'firebase') {
    const { fs, db } = await firebase();
    const snap = await fs.getDoc(fs.doc(db, size === 'full' ? 'mediaFull' : 'media', id));
    if (snap.exists()) url = size === 'full' ? snap.data().data : snap.data().thumb;
  }
  mediaCache.set(key, url);
  return url;
}

export async function deleteMedia(id) {
  mediaCache.delete(id + ':thumb'); mediaCache.delete(id + ':full');
  if (mode === 'demo') {
    const d = demoLoad();
    if (!String(id).startsWith('sample-')) delete d.media[id];
    demoSave();
    return;
  }
  const { fs, db } = await firebase({ full: true });
  await fs.deleteDoc(fs.doc(db, 'media', id));
  await fs.deleteDoc(fs.doc(db, 'mediaFull', id));
}

/* ------------------------------------------------------------------ */
/* Contact messages                                                    */
/* ------------------------------------------------------------------ */

export async function sendMessage(msg) {
  const data = {
    name: String(msg.name || '').trim().slice(0, 119),
    phone: String(msg.phone || '').trim().slice(0, 39),
    email: String(msg.email || '').trim().slice(0, 199),
    topic: String(msg.topic || '').trim().slice(0, 99),
    message: String(msg.message || '').trim().slice(0, 4999),
    read: false
  };
  if (mode === 'demo') {
    demoLoad().messages.unshift({ id: 'msg-' + uid(), ...data, createdAt: nowISO() });
    demoSave();
    demoNotify();
    return;
  }
  if (mode !== 'firebase') throw new Error('not-configured');
  const { fs, db } = await firebase();
  await fs.addDoc(fs.collection(db, 'messages'), { ...data, createdAt: fs.serverTimestamp() });
}

/* Calls back with the full list, newest first, whenever it changes. Returns an unsubscribe function. */
export function watchMessages(cb, onError) {
  if (mode === 'demo') {
    const fn = (list) => cb(list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    demoListeners.add(fn);
    fn(demoLoad().messages);
    return () => demoListeners.delete(fn);
  }
  let stop = () => {};
  let cancelled = false;
  firebase({ full: true }).then(({ fs, db }) => {
    if (cancelled) return;
    stop = fs.onSnapshot(
      fs.query(fs.collection(db, 'messages'), fs.orderBy('createdAt', 'desc')),
      (snap) => cb(snap.docs.map(fromDoc)),
      (err) => onError && onError(err)
    );
  });
  return () => { cancelled = true; stop(); };
}

export async function updateMessage(id, patch) {
  if (mode === 'demo') {
    const m = demoLoad().messages.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    demoSave();
    demoNotify();
    return;
  }
  const { fs, db } = await firebase({ full: true });
  await fs.updateDoc(fs.doc(db, 'messages', id), patch);
}

export async function deleteMessage(id) {
  if (mode === 'demo') {
    const d = demoLoad();
    d.messages = d.messages.filter((m) => m.id !== id);
    demoSave();
    demoNotify();
    return;
  }
  const { fs, db } = await firebase({ full: true });
  await fs.deleteDoc(fs.doc(db, 'messages', id));
}

/* ------------------------------------------------------------------ */
/* Sign-in                                                             */
/* ------------------------------------------------------------------ */

/* cb(user, isAdmin). user is { email, uid } or null. */
export function onAuth(cb) {
  if (mode === 'demo') {
    let email = null;
    try { email = localStorage.getItem('loomis-demo-user'); } catch (e) { /* ignore */ }
    setTimeout(() => cb(email ? { email, uid: 'demo' } : null, !!email), 0);
    demoAuthListeners.add(cb);
    return () => demoAuthListeners.delete(cb);
  }
  if (mode !== 'firebase') { setTimeout(() => cb(null, false), 0); return () => {}; }
  let stop = () => {};
  auth().then(async ({ au, auth: a }) => {
    stop = au.onAuthStateChanged(a, async (u) => {
      if (!u) return cb(null, false);
      let admin = false;
      try {
        const { fs, db } = await firebase({ full: true });
        admin = (await fs.getDoc(fs.doc(db, 'admins', u.uid))).exists();
      } catch (e) { admin = false; }
      cb({ email: u.email, uid: u.uid }, admin);
    });
  });
  return () => stop();
}

const demoAuthListeners = new Set();

export async function signIn(email, password) {
  if (mode === 'demo') {
    try { localStorage.setItem('loomis-demo-user', email || 'demo@lawyerloomis.com'); } catch (e) { /* ignore */ }
    demoAuthListeners.forEach((cb) => cb({ email: email || 'demo@lawyerloomis.com', uid: 'demo' }, true));
    return;
  }
  const { au, auth: a } = await auth();
  await au.signInWithEmailAndPassword(a, email, password);
}

export async function signOut() {
  if (mode === 'demo') {
    try { localStorage.removeItem('loomis-demo-user'); } catch (e) { /* ignore */ }
    demoAuthListeners.forEach((cb) => cb(null, false));
    return;
  }
  const { au, auth: a } = await auth();
  await au.signOut(a);
}

export async function resetPassword(email) {
  if (mode === 'demo') return;
  const { au, auth: a } = await auth();
  await au.sendPasswordResetEmail(a, email);
}

export async function changePassword(current, next) {
  if (mode === 'demo') return;
  const { au, auth: a } = await auth();
  const u = a.currentUser;
  const cred = au.EmailAuthProvider.credential(u.email, current);
  await au.reauthenticateWithCredential(u, cred);
  await au.updatePassword(u, next);
}

/* Friendly wording for Firebase errors */
export function explain(err) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-credential': 'That email and password don’t match. Check them and try again, or reset your password.',
    'auth/wrong-password': 'That password isn’t right. Try again, or reset your password.',
    'auth/user-not-found': 'There’s no account with that email.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
    'auth/network-request-failed': 'You appear to be offline. Check your connection and try again.',
    'auth/weak-password': 'Choose a longer password: at least 8 characters.',
    'permission-denied': 'This account doesn’t have permission to do that. Ask whoever manages the website to add it as an admin.',
    'unavailable': 'The database can’t be reached right now. Check your connection and try again.'
  };
  return map[code] || (err && err.message) || 'Something went wrong. Try again.';
}
