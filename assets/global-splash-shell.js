(function () {
  const root = document.querySelector('[data-global-splash-root]');
  if (!root) return;

  const stateEl = document.body;
  const iframe = root.querySelector('[data-global-iframe]');
  const selfieVideo = root.querySelector('[data-global-selfie]');
  const cameraPrompt = document.querySelector('[data-global-camera-prompt]');
  const dataEl = root.querySelector('[data-global-splash-streams]');
  const logoToggle = document.querySelector('[data-global-logo-toggle]');
  const navEl = document.querySelector('[data-global-nav]');
  const backdrop = document.querySelector('[data-global-nav-backdrop]');
  if (!iframe || !dataEl || !selfieVideo) return;

  const labelOpen = root.dataset.i18nOpenMenu || 'Menu';
  const labelClose = root.dataset.i18nCloseMenu || 'Close menu';

  let streams = [];
  try {
    streams = JSON.parse(dataEl.innerHTML || '[]');
  } catch (e) {
    streams = [];
  }
  streams = (streams || []).filter(function (s) {
    return s && typeof s.url === 'string' && s.url.trim().length > 0;
  });

  const mobileMql = window.matchMedia
    ? window.matchMedia('(max-width: 749px)')
    : { matches: false, addEventListener: function () {}, addListener: function () {} };
  function isMobile() {
    return mobileMql.matches;
  }

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function parseYouTubeId(inputUrl) {
    const raw = (inputUrl || '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.hostname === 'youtu.be') {
        return (url.pathname || '').replace('/', '') || null;
      }
      if (url.hostname.endsWith('youtube.com') || url.hostname.endsWith('youtube-nocookie.com')) {
        const v = url.searchParams.get('v');
        if (v) return v;
        const match = (url.pathname || '').match(/\/(live|embed|shorts)\/([^/?#]+)/i);
        if (match && match[2]) return match[2];
      }
    } catch (e) {
      // ignore
    }
    const fallbackMatch = raw.match(/[?&]v=([^&]+)/);
    if (fallbackMatch && fallbackMatch[1]) return fallbackMatch[1];
    return null;
  }

  function buildEmbedUrl(videoId) {
    const id = String(videoId).trim();
    const q = [
      'autoplay=1',
      'mute=1',
      'loop=1',
      'playlist=' + encodeURIComponent(id),
      'controls=0',
      'showinfo=0',
      'rel=0',
      'iv_load_policy=3',
      'modestbranding=1',
      'playsinline=1',
      'fs=0',
      'disablekb=1',
    ].join('&');
    return 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?' + q;
  }

  const ids = streams
    .map(function (s) {
      return parseYouTubeId(s.url);
    })
    .filter(Boolean);
  const hasYoutube = ids.length > 0;

  let index = 0;

  function closeNav() {
    stateEl.classList.remove('splash-global--nav-open');
    if (backdrop) {
      backdrop.setAttribute('hidden', '');
    }
    if (navEl) {
      navEl.setAttribute('hidden', '');
    }
    if (logoToggle) {
      logoToggle.setAttribute('aria-expanded', 'false');
      logoToggle.setAttribute('aria-label', labelOpen);
    }
  }

  function openNav() {
    stateEl.classList.add('splash-global--nav-open');
    if (backdrop) {
      backdrop.removeAttribute('hidden');
    }
    if (navEl) {
      navEl.removeAttribute('hidden');
    }
    if (logoToggle) {
      logoToggle.setAttribute('aria-expanded', 'true');
      logoToggle.setAttribute('aria-label', labelClose);
    }
  }

  function toggleNav() {
    if (stateEl.classList.contains('splash-global--nav-open')) {
      closeNav();
    } else {
      openNav();
    }
  }

  function stopSelfie() {
    stateEl.classList.remove('splash-global--camera-live');
    try {
      const ms = selfieVideo.srcObject;
      if (ms && ms.getTracks) {
        ms.getTracks().forEach(function (t) {
          t.stop();
        });
      }
      selfieVideo.srcObject = null;
    } catch (e) {
      // ignore
    }
  }

  function switchTo(nextIndex) {
    if (!hasYoutube) return;
    if (isMobile() && !stateEl.classList.contains('splash-global--selfie-fallback')) return;
    index = (nextIndex + ids.length) % ids.length;
    const videoId = ids[index];
    const url = buildEmbedUrl(videoId);
    iframe.src = 'about:blank';
    setTimeout(function () {
      iframe.src = url;
    }, 30);
  }

  function showCameraPrompt() {
    if (!cameraPrompt || !isMobile()) return;
    cameraPrompt.hidden = false;
    cameraPrompt.removeAttribute('hidden');
  }

  function hideCameraPrompt() {
    if (!cameraPrompt) return;
    cameraPrompt.hidden = true;
    cameraPrompt.setAttribute('hidden', '');
  }

  function startSelfie() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(false);
    }
    stopSelfie();
    return navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })
      .then(function (stream) {
        selfieVideo.srcObject = stream;
        return selfieVideo.play().then(function () {
          stateEl.classList.remove('splash-global--selfie-fallback');
          iframe.src = 'about:blank';
          hideCameraPrompt();
          if (isMobile()) {
            stateEl.classList.add('splash-global--camera-live');
          }
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function useYoutubeOnMobile() {
    stateEl.classList.add('splash-global--selfie-fallback');
    hideCameraPrompt();
    stopSelfie();
    if (hasYoutube) {
      switchTo(index);
    }
  }

  function syncLayout() {
    if (isMobile()) {
      closeNav();
      stopSelfie();
      stateEl.classList.remove('splash-global--selfie-fallback');
      startSelfie().then(function (ok) {
        if (!ok) {
          if (cameraPrompt) {
            showCameraPrompt();
          } else {
            useYoutubeOnMobile();
          }
        }
      });
    } else {
      closeNav();
      hideCameraPrompt();
      stopSelfie();
      stateEl.classList.remove('splash-global--selfie-fallback');
      if (hasYoutube) {
        switchTo(index);
      } else {
        iframe.src = 'about:blank';
      }
    }
  }

  function onKeyDown(e) {
    if (!e) return;
    if (e.key === 'Escape' && stateEl.classList.contains('splash-global--nav-open')) {
      e.preventDefault();
      closeNav();
      return;
    }
    if (!hasYoutube) return;
    if (isMobile() && !stateEl.classList.contains('splash-global--selfie-fallback')) return;
    const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
    const editable =
      tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
    if (editable) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      switchTo(index - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      switchTo(index + 1);
    }
  }

  document.addEventListener('keydown', onKeyDown);

  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeStartAt = 0;
  let swipeArmed = false;

  function shouldIgnoreTouchTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest('button,a,input,textarea,select,label,[role="button"],[role="link"]')
    );
  }

  function touchInBottomZone(clientY) {
    return clientY > window.innerHeight * 0.65;
  }

  function loadYoutubeIndex(nextIndex) {
    if (!hasYoutube) return;
    closeNav();
    stateEl.classList.add('splash-global--selfie-fallback');
    stopSelfie();

    index = ((nextIndex % ids.length) + ids.length) % ids.length;
    const videoId = ids[index];
    const url = buildEmbedUrl(videoId);
    iframe.src = 'about:blank';
    setTimeout(function () {
      iframe.src = url;
    }, 30);
  }

  document.addEventListener(
    'touchstart',
    function (e) {
      if (!isMobile() || !hasYoutube) return;
      if (stateEl.classList.contains('splash-global--nav-open')) return;
      if (!e.changedTouches || !e.changedTouches.length) return;
      const t = e.changedTouches[0];
      if (!touchInBottomZone(t.clientY)) return;
      if (shouldIgnoreTouchTarget(e.target)) return;

      swipeStartX = t.clientX;
      swipeStartY = t.clientY;
      swipeStartAt = Date.now();
      swipeArmed = true;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    function (e) {
      if (!isMobile() || !hasYoutube) return;
      if (!swipeArmed) return;
      swipeArmed = false;
      if (!e.changedTouches || !e.changedTouches.length) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStartX;
      const dy = t.clientY - swipeStartY;
      const dt = Date.now() - swipeStartAt;

      if (dt > 900) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.1) return;

      const dir = dx < 0 ? 1 : -1;
      loadYoutubeIndex(index + dir);
      e.preventDefault();
    },
    { passive: false }
  );

  if (prefersReducedMotion) {
    closeNav();
    if (hasYoutube) {
      switchTo(0);
    }
    return;
  }

  if (logoToggle) {
    logoToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleNav();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', function () {
      closeNav();
    });
  }

  if (navEl) {
    navEl.addEventListener('click', function (e) {
      const anchor = e.target.closest('a[href]');
      if (anchor && navEl.contains(anchor)) {
        closeNav();
      }
    });
  }

  if (cameraPrompt) {
    cameraPrompt.addEventListener('click', function () {
      startSelfie().then(function (ok) {
        if (!ok) {
          useYoutubeOnMobile();
        }
      });
    });
  }

  if (mobileMql.addEventListener) {
    mobileMql.addEventListener('change', syncLayout);
  } else if (mobileMql.addListener) {
    mobileMql.addListener(syncLayout);
  }

  syncLayout();
})();
