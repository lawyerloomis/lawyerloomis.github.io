/* The Loomis Firm — site script
   - mobile menu
   - header stitch on scroll
   - home page: a gold thread that sews down the page as you scroll,
     revealing each section when it reaches that section's knot */

(function () {
  var doc = document.documentElement;
  doc.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Menu ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('is-open');
      }
    });
  }

  /* ---------- Header ---------- */
  var header = document.querySelector('.site-header');
  function onHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onHeader, { passive: true });
  onHeader();

  /* ---------- Photos: fall back gracefully until real photos are added ---------- */
  document.querySelectorAll('.folio-mat img').forEach(function (img) {
    function bad() { img.parentNode.classList.add('is-empty'); }
    if (img.complete && !img.naturalWidth) bad();
    else img.addEventListener('error', bad);
  });
  document.querySelectorAll('.medallion img').forEach(function (img) {
    function ok() { img.closest('.medallion').classList.add('has-photo'); }
    function bad() { img.remove(); }
    if (img.complete) { img.naturalWidth ? ok() : bad(); }
    else { img.addEventListener('load', ok); img.addEventListener('error', bad); }
  });

  /* ---------- Poster: the metallic title rises in as you scroll ---------- */
  var poster = document.querySelector('.poster');
  if (poster) {
    var stage = poster.querySelector('.poster-stage');
    var card = poster.querySelector('.poster-card');
    var wide = window.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 1/1)');
    var smooth = function (t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    var posterTick = false;

    var paintPoster = function () {
      posterTick = false;
      if (!wide.matches) return;
      var p = 1, e = 1;
      if (!reduceMotion) {
        var top = parseFloat(getComputedStyle(stage).top) || 0;
        var span = poster.offsetHeight - stage.offsetHeight;
        p = span > 0 ? Math.min(1, Math.max(0, (top - poster.getBoundingClientRect().top) / span)) : 1;
        e = smooth((p - 0.03) / 0.45);
      }
      poster.style.setProperty('--p', p.toFixed(4));
      poster.style.setProperty('--e', e.toFixed(4));
      card.classList.toggle('is-shown', e > 0.6);
    };
    var askPoster = function () { if (!posterTick) { posterTick = true; requestAnimationFrame(paintPoster); } };
    window.addEventListener('scroll', askPoster, { passive: true });
    window.addEventListener('resize', askPoster);
    paintPoster();

    // phones: reveal the title banner when it comes into view
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !wide.matches) { card.classList.add('is-shown'); obs.disconnect(); }
        });
      }, { threshold: 0.2 }).observe(card);
    } else {
      card.classList.add('is-shown');
    }
  }

  /* ---------- The thread ---------- */
  var story = document.querySelector('.story');
  if (!story) return;

  var NS = 'http://www.w3.org/2000/svg';
  var svg = story.querySelector('.thread');
  var guide = svg.querySelector('.thread-guide');
  var line = svg.querySelector('.thread-line');
  var maskPath = svg.querySelector('.thread-mask');
  var maskEl = svg.querySelector('mask');
  var needle = svg.querySelector('.needle');
  var chapters = Array.prototype.slice.call(story.querySelectorAll('.chapter'));
  var tie = story.querySelector('.tie .knot');

  var total = 0, lut = [], knots = [], ticking = false;

  function offsetIn(el) {
    var r = el.getBoundingClientRect(), s = story.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, top: r.top - s.top, bottom: r.bottom - s.top };
  }

  function build() {
    var W = story.clientWidth, H = story.scrollHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.style.height = H + 'px';
    maskEl.setAttribute('width', W);
    maskEl.setAttribute('height', H);

    // waypoints: start centred, then each chapter's knot and the bottom of its column, then the tie-off
    var pts = [{ x: W / 2, y: 0 }];
    knots = [];
    chapters.forEach(function (ch) {
      var k = ch.querySelector('.knot');
      var kp = offsetIn(k);
      var cp = offsetIn(ch);
      pts.push({ x: kp.x, y: kp.y });
      knots.push({ el: k, chapter: ch, y: kp.y });
      pts.push({ x: kp.x, y: cp.bottom - 24 });
    });
    if (tie) {
      var tp = offsetIn(tie);
      pts.push({ x: tp.x, y: tp.y });
      knots.push({ el: tie, chapter: null, y: tp.y });
    }

    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (Math.abs(a.x - b.x) < 1) {
        d += ' L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
      } else {
        var my = (a.y + b.y) / 2;
        d += ' C' + a.x.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
      }
    }
    guide.setAttribute('d', d);
    line.setAttribute('d', d);
    maskPath.setAttribute('d', d);

    total = line.getTotalLength();
    maskPath.style.strokeDasharray = total + ' ' + total;

    // length -> y lookup (path only ever moves downward)
    lut = [];
    var steps = Math.max(200, Math.ceil(total / 6));
    for (var s = 0; s <= steps; s++) {
      var L = (total * s) / steps;
      lut.push({ L: L, y: line.getPointAtLength(L).y });
    }
    update();
  }

  function lengthAtY(y) {
    if (y <= lut[0].y) return 0;
    if (y >= lut[lut.length - 1].y) return total;
    var lo = 0, hi = lut.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (lut[mid].y < y) lo = mid; else hi = mid;
    }
    var a = lut[lo], b = lut[hi];
    var t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    return a.L + (b.L - a.L) * t;
  }

  function update() {
    ticking = false;
    var storyTop = story.getBoundingClientRect().top;
    var targetY = reduceMotion ? Infinity : (window.innerHeight * 0.68 - storyTop);
    var L = reduceMotion ? total : lengthAtY(targetY);

    maskPath.style.strokeDashoffset = String(total - L);

    knots.forEach(function (k) {
      var reached = reduceMotion || targetY >= k.y;
      k.el.classList.toggle('is-tied', reached);
      if (reached && k.chapter) k.chapter.classList.add('is-in');
    });

    if (needle) {
      var done = L >= total - 1;
      needle.style.opacity = (L < 2 || done) ? '0' : '1';
      var p = line.getPointAtLength(L);
      var q = line.getPointAtLength(Math.min(total, L + 3));
      var ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      if (L + 3 > total) ang = 90;
      needle.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
    }
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  var rebuild = (function () {
    var t;
    return function () { clearTimeout(t); t = setTimeout(build, 120); };
  })();
  window.addEventListener('resize', rebuild);
  if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(story);
  window.addEventListener('load', build);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  build();
})();
