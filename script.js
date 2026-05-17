/* ============================================================
   K1 — site interactions
   - Footer year
   - Sticky-header shadow on scroll
   - Mobile nav toggle
   - Smooth in-page anchors with header offset
   - Active-section nav highlight
   - Video player (.vp) — click to play, swap poster->video
   - Scroll reveal observer
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Footer year ---------- */
  var yrEl = document.getElementById('yr');
  if (yrEl) yrEl.textContent = String(new Date().getFullYear());

  /* ---------- Header: sticky shadow + active section ---------- */
  var header = document.querySelector('.site-header');
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.primary-nav a[href^="#"]')
  );
  var sections = navLinks
    .map(function (a) {
      var id = a.getAttribute('href').slice(1);
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-scrolled', y > 12);

    // Active section
    if (!sections.length) return;
    var probe = y + 140;
    var current = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= probe) current = sections[i];
    }
    var id = current.id;
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav toggle ---------- */
  var navToggle = document.querySelector('.nav-toggle');
  var primaryNav = document.querySelector('.primary-nav');
  if (navToggle && primaryNav && header) {
    navToggle.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    primaryNav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        header.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Smooth scroll with header offset ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#' || href.length < 2) return;
    var target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    var headerH = header ? header.offsetHeight : 0;
    var top = target.getBoundingClientRect().top + window.scrollY - headerH + 1;
    window.scrollTo({ top: top, behavior: 'smooth' });
    history.replaceState(null, '', href);
  });

  /* ---------- Video player (.vp) — click to play ---------- */
  var players = Array.prototype.slice.call(document.querySelectorAll('.vp[data-src]'));
  players.forEach(function (vp) {
    var play = vp.querySelector('.vp-play');
    if (!play) return;

    function load() {
      if (vp.dataset.loaded === '1') return;
      var src = vp.dataset.src;
      var v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.setAttribute('controlsList', 'nodownload');
      // Pause others on play
      v.addEventListener('play', function () {
        document.querySelectorAll('.vp.playing video').forEach(function (other) {
          if (other !== v) {
            other.pause();
            var parent = other.closest('.vp');
            if (parent) parent.classList.remove('playing');
          }
        });
        vp.classList.add('playing');
      });
      v.addEventListener('pause', function () {
        // keep playing class so controls stay visible — only remove on ended
      });
      v.addEventListener('ended', function () {
        vp.classList.remove('playing');
        v.currentTime = 0;
      });
      vp.appendChild(v);
      vp.dataset.loaded = '1';
      return v;
    }

    play.addEventListener('click', function () {
      var v = vp.querySelector('video') || load();
      if (!v) return;
      vp.classList.add('playing');
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay blocked — user can use controls */ });
    });
  });

  /* ---------- Scroll reveal ---------- */
  if ('IntersectionObserver' in window) {
    var revealEls = document.querySelectorAll(
      '.section h2, .section .lede, .section .eyebrow, .card, .pilot-block, .walk-card, .walk-feature, .compat-list, .compat-text'
    );
    revealEls.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }
})();
