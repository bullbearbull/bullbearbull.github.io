/*!
 * Margin notes (우측 여백 주석) controller for CRESC. (bullbearbull.github.io)
 * - Desktop (>= 1200px): mounts .mn-note cards into Chirpy's #panel-wrapper right margin,
 *   aligned with their inline .mn-ref anchors while avoiding .access, sticky #toc-wrapper,
 *   and adjacent notes.
 * - Tablet/Mobile (< 1200px): keeps .mn-note inline right beneath its parent paragraph as
 *   an expandable disclosure note; clicking inline .mn-ref opens and focuses it.
 */
(function () {
  'use strict';

  var DESKTOP_MQ = '(min-width: 1200px)';

  function boot() {
    var content = document.querySelector('article .content');
    if (!content) return;

    var noteEls = Array.prototype.slice.call(content.querySelectorAll('.mn-note[data-mn-for]'));
    if (!noteEls.length) return;

    var panel = document.getElementById('panel-wrapper');
    var mq = window.matchMedia ? window.matchMedia(DESKTOP_MQ) : null;
    var rail = null;
    var items = [];
    var rafId = 0;

    noteEls.forEach(function (noteEl) {
      var id = noteEl.getAttribute('data-mn-for');
      var refEl = content.querySelector('.mn-ref[data-mn="' + id + '"]');
      var toggleEl = noteEl.querySelector('.mn-toggle');
      var bodyEl = noteEl.querySelector('.mn-body');
      if (!id || !refEl) return;

      var slot = document.createElement('span');
      slot.className = 'mn-slot';
      slot.hidden = true;
      noteEl.parentNode.insertBefore(slot, noteEl);

      var blockEl = refEl.closest('p, li, blockquote, td') || refEl;
      items.push({
        id: id,
        noteEl: noteEl,
        refEl: refEl,
        blockEl: blockEl,
        toggleEl: toggleEl,
        bodyEl: bodyEl,
        slot: slot
      });
    });

    if (!items.length) return;

    function setActive(item, active) {
      item.refEl.classList.toggle('is-active', active);
      item.noteEl.classList.toggle('is-active', active);
    }

    function clearActivesExcept(keepId) {
      items.forEach(function (it) {
        if (it.id !== keepId) setActive(it, false);
      });
    }

    function typesetMathIfNeeded(el) {
      if (!el || !window.MathJax || typeof window.MathJax.typesetPromise !== 'function') return;
      if (el.textContent && el.textContent.indexOf('$') !== -1) {
        window.MathJax.typesetPromise([el]).catch(function () {});
      }
    }

    function setMobileOpen(item, open) {
      item.noteEl.classList.toggle('is-open', open);
      if (item.toggleEl) item.toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      item.refEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && item.bodyEl) {
        typesetMathIfNeeded(item.bodyEl);
      }
    }

    items.forEach(function (item) {
      item.refEl.addEventListener('mouseenter', function () {
        if (isDesktop()) setActive(item, true);
      });
      item.refEl.addEventListener('mouseleave', function () {
        if (isDesktop()) setActive(item, false);
      });
      item.noteEl.addEventListener('mouseenter', function () {
        if (isDesktop()) setActive(item, true);
      });
      item.noteEl.addEventListener('mouseleave', function () {
        if (isDesktop()) setActive(item, false);
      });

      item.refEl.addEventListener('click', function () {
        if (isDesktop()) {
          clearActivesExcept(item.id);
          setActive(item, true);
          item.noteEl.classList.remove('is-pulse');
          void item.noteEl.offsetWidth;
          item.noteEl.classList.add('is-pulse');
        } else {
          var willOpen = !item.noteEl.classList.contains('is-open');
          setMobileOpen(item, willOpen);
          if (willOpen) {
            var rect = item.noteEl.getBoundingClientRect();
            if (rect.top < 56 || rect.bottom > window.innerHeight - 24) {
              item.noteEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        }
      });

      if (item.toggleEl) {
        item.toggleEl.addEventListener('click', function () {
          if (isDesktop()) return;
          var willOpen = !item.noteEl.classList.contains('is-open');
          setMobileOpen(item, willOpen);
        });
      }
    });

    function isDesktop() {
      return Boolean(panel && (!mq || mq.matches));
    }

    function ensureDesktopMode() {
      if (!panel) return false;
      if (isDesktop()) {
        panel.classList.add('has-margin-notes');
        if (!rail) {
          rail = document.createElement('div');
          rail.className = 'mn-rail';
          rail.setAttribute('aria-label', '여백 주석');
          panel.appendChild(rail);
        }
        var moved = false;
        items.forEach(function (it) {
          if (it.noteEl.parentNode !== rail) {
            rail.appendChild(it.noteEl);
            moved = true;
          }
          it.refEl.setAttribute('aria-expanded', 'true');
        });
        if (moved) typesetMathIfNeeded(rail);
        return true;
      } else {
        panel.classList.remove('has-margin-notes');
        items.forEach(function (it) {
          if (it.noteEl.parentNode !== it.slot.parentNode) {
            it.slot.parentNode.insertBefore(it.noteEl, it.slot.nextSibling);
          }
          it.noteEl.style.top = '';
          it.noteEl.style.opacity = '';
          it.noteEl.style.pointerEvents = '';
          it.refEl.setAttribute('aria-expanded', it.noteEl.classList.contains('is-open') ? 'true' : 'false');
        });
        return false;
      }
    }

    function positionNotes() {
      if (!ensureDesktopMode()) return;

      var panelRect = panel.getBoundingClientRect();
      var accessEl = panel.querySelector('.access');
      var tocEl = panel.querySelector('#toc-wrapper');

      var accessBottom = accessEl ? accessEl.getBoundingClientRect().bottom - panelRect.top : 0;
      var tocBottom = 0;
      if (tocEl && tocEl.offsetHeight > 0 && !tocEl.classList.contains('invisible')) {
        tocBottom = Math.max(0, tocEl.getBoundingClientRect().bottom - panelRect.top);
      }
      var safeFloor = Math.max(accessBottom + 20, tocBottom > 0 ? tocBottom + 16 : 0);
      var maxPanelHeight = panel.clientHeight;

      // Batch DOM reads first to prevent layout thrashing
      var metrics = items.map(function (it) {
        var refRect = it.refEl.getBoundingClientRect();
        var blockRect = it.blockEl.getBoundingClientRect();
        var h = it.noteEl.offsetHeight;
        var naturalTop = refRect.top - panelRect.top - 4;
        var blockBottom = blockRect.bottom - panelRect.top;
        // Dwell slightly beneath sticky TOC while the paragraph is still near the reading zone,
        // then allow it to release upward smoothly behind opaque #toc-wrapper as user scrolls past.
        var releaseCeiling = Math.max(naturalTop, blockBottom + 100);
        return {
          el: it.noteEl,
          h: h,
          naturalTop: naturalTop,
          releaseCeiling: releaseCeiling
        };
      });

      var cursor = accessBottom + 20;
      var tops = metrics.map(function (m) {
        var clamped = Math.min(Math.max(m.naturalTop, safeFloor), m.releaseCeiling);
        var y = Math.max(clamped, cursor);
        var bottomLimit = Math.max(cursor, maxPanelHeight - m.h - 16);
        if (y > bottomLimit) y = bottomLimit;
        cursor = y + m.h + 14;
        return y;
      });

      // Batch DOM writes
      for (var i = 0; i < metrics.length; i++) {
        var topPx = Math.round(tops[i]);
        metrics[i].el.style.top = topPx + 'px';
        if (tocBottom > 0) {
          var overlapPx = safeFloor - topPx;
          if (overlapPx > 12) {
            var fade = Math.max(0, 1 - (overlapPx - 12) / 36);
            metrics[i].el.style.opacity = fade.toFixed(2);
            metrics[i].el.style.pointerEvents = fade < 0.15 ? 'none' : 'auto';
          } else {
            metrics[i].el.style.opacity = '';
            metrics[i].el.style.pointerEvents = '';
          }
        } else {
          metrics[i].el.style.opacity = '';
          metrics[i].el.style.pointerEvents = '';
        }
      }
    }

    function schedule() {
      if (rafId) return;
      rafId = requestAnimationFrame(function () {
        rafId = 0;
        positionNotes();
      });
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('load', schedule);
    if (mq && mq.addEventListener) mq.addEventListener('change', schedule);

    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(schedule);
      ro.observe(content);
      if (panel) ro.observe(panel);
    }

    var tocWrapper = document.getElementById('toc-wrapper');
    if (tocWrapper && typeof MutationObserver === 'function') {
      new MutationObserver(schedule).observe(tocWrapper, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }

    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
      window.MathJax.startup.promise.then(function () {
        typesetMathIfNeeded(rail);
        schedule();
      });
    }

    positionNotes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
