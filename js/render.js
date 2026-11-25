/* Shared rendering for posts and the message of the day.
   Used by the public pages and by the admin portal's live preview, so both always match. */

const ROOT = new URL('../', import.meta.url);

/* 'contact/' -> full address on whatever domain the site is on (works on github.io and lawyerloomis.com) */
export function pageUrl(path) {
  if (/^(https?:|mailto:|tel:)/i.test(path || '')) return path;
  const [base, hash] = String(path || '').replace(/^\/+/, '').split('#');
  let b = base;
  if (window.LOOMIS_PREVIEW && (b === '' || b.endsWith('/'))) b += 'index.html';
  return new URL(b, ROOT).href + (hash !== undefined ? '#' + hash : '');
}

const BLOCK = { P: [], BR: [], STRONG: [], B: [], EM: [], I: [], U: [], H2: [], H3: [], UL: [], OL: [], LI: [], BLOCKQUOTE: [], A: ['href'] };
export const INLINE = { BR: [], STRONG: [], B: [], EM: [], I: [], U: [] };
const DROP = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LINK', 'META'];

const safeHref = (h) => !!h && !/^\s*(javascript|data|vbscript):/i.test(h) && /^(https?:\/\/|mailto:|tel:|\/|#|\.{0,2}\/?[\w-])/i.test(h.trim());

/* Keep only simple formatting. Anything else is unwrapped (its text kept) or dropped. */
export function sanitize(html, allowed = BLOCK) {
  const doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
  const root = doc.body.firstElementChild;
  const walk = (node) => {
    Array.from(node.childNodes).forEach((ch) => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      let el = ch;
      const tag = el.tagName;
      if (DROP.includes(tag)) { el.remove(); return; }
      if (tag === 'DIV' && 'P' in allowed) {           // editors make <div> lines; treat them as paragraphs
        const p = doc.createElement('p');
        while (el.firstChild) p.appendChild(el.firstChild);
        el.replaceWith(p);
        el = p;
      } else if (!(tag in allowed)) {
        walk(el);
        const kids = Array.from(el.childNodes);
        if (tag === 'DIV' || tag === 'P') kids.push(doc.createElement('br'));
        el.replaceWith(...kids);
        return;
      }
      Array.from(el.attributes).forEach((a) => { if (!allowed[el.tagName].includes(a.name)) el.removeAttribute(a.name); });
      if (el.tagName === 'A') {
        const h = el.getAttribute('href') || '';
        if (!safeHref(h)) { el.removeAttribute('href'); }
        else if (/^https?:\/\//i.test(h)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      }
      walk(el);
    });
  };
  walk(root);
  if ('P' in allowed) {                               // loose text at the top level becomes a paragraph
    const INLINE_TAGS = ['STRONG', 'B', 'EM', 'I', 'U', 'A', 'BR'];
    let run = null;
    Array.from(root.childNodes).forEach((n) => {
      const inline = n.nodeType === 3 || (n.nodeType === 1 && INLINE_TAGS.includes(n.tagName));
      if (inline) {
        if (n.nodeType === 3 && !n.textContent.trim() && !run) { n.remove(); return; }
        if (n.nodeType === 1 && n.tagName === 'BR' && !run) { n.remove(); return; }
        if (!run) { run = doc.createElement('p'); n.before(run); }
        run.appendChild(n);
      } else {
        run = null;
      }
    });
    root.querySelectorAll('p').forEach((p) => { if (!p.textContent.trim() && !p.querySelector('br')) p.remove(); });
  }
  return root.innerHTML.replace(/(<br>)+$/, '').replace(/<br><\/p>/g, '</p>').trim();
}

export function textOf(html) {
  const d = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
  d.querySelectorAll('p,li,h2,h3,blockquote,br').forEach((n) => n.after(' '));
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function excerpt(html, n = 180) {
  const t = textOf(html);
  if (t.length <= n) return { text: t, cut: false };
  const cut = t.slice(0, n);
  return { text: cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : n).replace(/[,;:.\s]+$/, '') + '…', cut: true };
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat().forEach((c) => { if (c) el.append(c); });
  return el;
};
export { h };

/* An <img> that fills in when its photo arrives from the database */
function photo(img, size, getMedia, cls) {
  const el = h('img', { class: cls || null, alt: img.alt || '', width: img.w || null, height: img.h || null, loading: 'lazy', decoding: 'async' });
  getMedia(img.id, size).then((url) => { if (url) el.src = url; else el.closest('figure')?.remove(); }).catch(() => el.closest('figure')?.remove());
  return el;
}

const dateEl = (post) => post.date ? h('p', { class: 'post-date' }, h('time', { datetime: post.date, text: formatDate(post.date) })) : null;

/* ctx: { getMedia(id, size) -> Promise<url>, postUrl(id) -> href, linkPost: bool } */
export function renderPost(post, ctx) {
  const style = post.style || 'card';
  const imgs = post.images || [];
  const art = h('article', { class: 'post post--' + style });
  const body = sanitize(post.body);
  const linkPost = ctx.linkPost !== false && !!post.id;
  const titleEl = h('h3', { class: 'post-title' },
    linkPost ? h('a', { href: ctx.postUrl(post.id), text: post.title || 'Untitled' }) : (post.title || 'Untitled'));
  const more = (label) => linkPost ? h('p', { class: 'post-more' }, h('a', { class: 'link-gold', href: ctx.postUrl(post.id), text: label })) : null;

  if (style === 'feature') {
    const ex = excerpt(body, 320);
    art.append(
      imgs[0] ? h('figure', { class: 'post-media' }, h('div', { class: 'folio wide leather stitched' }, photo(imgs[0], 'full', ctx.getMedia))) : null,
      h('div', { class: 'post-text' }, dateEl(post), titleEl, h('p', { class: 'post-excerpt', text: ex.text }), ex.cut ? more('Read the full post') : null)
    );
    if (!imgs[0]) art.classList.add('no-media');
  } else if (style === 'note') {
    art.classList.add('stitched');
    art.append(dateEl(post), titleEl, h('div', { class: 'post-body', html: body }));
  } else if (style === 'gallery') {
    const ex = excerpt(body, 200);
    art.append(dateEl(post), titleEl,
      ex.text ? h('p', { class: 'post-excerpt', text: ex.text }) : null,
      imgs.length ? h('div', { class: 'post-gallery' }, imgs.slice(0, 6).map((i) => h('figure', {}, photo(i, 'thumb', ctx.getMedia)))) : null,
      (ex.cut || imgs.length > 6) ? more('See the whole post') : null);
  } else {
    const ex = excerpt(body, 170);
    art.append(
      imgs[0] ? h('figure', { class: 'post-media' }, photo(imgs[0], 'thumb', ctx.getMedia)) : null,
      h('div', { class: 'post-text' }, dateEl(post), titleEl, h('p', { class: 'post-excerpt', text: ex.text }), ex.cut ? more('Read more') : null)
    );
  }
  return art;
}

/* The full article on the post page */
export function renderPostFull(post, ctx) {
  const imgs = post.images || [];
  const style = post.style || 'card';
  const wrap = h('article', { class: 'post-full post-full--' + style });
  wrap.append(h('p', { class: 'post-date' }, h('time', { datetime: post.date || '', text: formatDate(post.date) })), h('h1', { text: post.title || 'Untitled' }));
  if (imgs.length && style !== 'gallery') {
    wrap.append(h('figure', { class: 'post-hero' }, h('div', { class: 'folio wide leather stitched' }, photo(imgs[0], 'full', ctx.getMedia)), imgs[0].alt ? h('figcaption', { text: imgs[0].alt }) : null));
  }
  wrap.append(h('div', { class: 'post-body', html: sanitize(post.body) }));
  const rest = style === 'gallery' ? imgs : imgs.slice(1);
  if (rest.length) {
    wrap.append(h('div', { class: 'post-gallery post-gallery--full' }, rest.map((i) => h('figure', {}, photo(i, 'full', ctx.getMedia), i.alt ? h('figcaption', { text: i.alt }) : null))));
  }
  return wrap;
}

export function motdActive(motd, today) {
  if (!motd || !motd.on || !String(motd.text || '').trim()) return false;
  if (motd.until && motd.until < today) return false;
  return true;
}

/* resolveLink(link) turns 'contact/' into a full address */
export function renderMotd(motd, resolveLink, { dismissible = true } = {}) {
  const style = ['ribbon', 'leather', 'quiet'].includes(motd.style) ? motd.style : 'ribbon';
  const box = h('div', { class: 'motd motd--' + style + (style === 'leather' ? ' leather stitched' : ''), role: 'region', 'aria-label': 'Message from the firm' });
  const inner = h('div', { class: 'wrap motd-inner' },
    h('p', { class: 'motd-text', text: motd.text }),
    motd.link && motd.linkText ? h('a', { class: 'motd-link', href: resolveLink(motd.link), text: motd.linkText }) : null,
    dismissible ? h('button', { class: 'motd-close', type: 'button', 'aria-label': 'Hide this message', html: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' }) : null
  );
  box.append(inner);
  return box;
}
