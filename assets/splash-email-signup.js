/**
 * Splash homepage email signup — stays on page (no navigation to /challenge).
 */
(function () {
  'use strict';

  var STRINGS = { error: 'Please enter a valid email address.', captcha: 'Complete verification, then tap Continue.' };
  var el = document.querySelector('[data-splash-streams-strings]');
  if (el) {
    try {
      var parsed = JSON.parse(el.textContent || '{}');
      if (parsed.emailError) STRINGS.error = parsed.emailError;
      if (parsed.emailCaptcha) STRINGS.captcha = parsed.emailCaptcha;
    } catch (e) {
      /* use defaults */
    }
  }

  function qs(root, sel) {
    return root.querySelector(sel);
  }

  function showError(errorEl, msg) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  function hideError(errorEl) {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function hideOverlay(root) {
    var overlay = qs(root, '[data-splash-email-challenge-overlay]');
    var frame = qs(root, '[data-splash-email-challenge-frame]');
    if (overlay) overlay.hidden = true;
    if (frame) frame.removeAttribute('src');
    document.documentElement.classList.remove('splash-streams--challenge-open');
  }

  function showOverlay(root, form) {
    var overlay = qs(root, '[data-splash-email-challenge-overlay]');
    var frame = qs(root, '[data-splash-email-challenge-frame]');
    if (!overlay || !frame) return;
    var formId = form.id || 'contact_form';
    overlay.hidden = false;
    document.documentElement.classList.add('splash-streams--challenge-open');
    frame.src = '/challenge#' + encodeURIComponent(formId);
  }

  function showSuccess(root) {
    var formPanel = qs(root, '[data-splash-email-form-panel]');
    var successPanel = qs(root, '[data-splash-email-success-panel]');
    var status = successPanel && successPanel.querySelector('[role="status"]');
    hideOverlay(root);
    hideError(qs(root, '[data-splash-email-error]'));
    if (formPanel) formPanel.hidden = true;
    if (successPanel) {
      successPanel.hidden = false;
      if (status) status.focus({ preventScroll: true });
    }
  }

  function isSuccessHtml(html, blockId) {
    if (!html) return false;
    if (html.indexOf('data-splash-email-just-success') !== -1) return true;
    if (blockId && html.indexOf('SplashEmailSuccess-' + blockId) !== -1) return true;
    if (html.indexOf('newsletter-form__message--success') !== -1) return true;
    if (html.indexOf('splash-streams__email-message--success') !== -1) return true;
    return false;
  }

  function isChallengeHtml(html, url) {
    if (url && url.indexOf('/challenge') !== -1) return true;
    if (!html) return false;
    return html.indexOf('shopify-challenge') !== -1 || html.indexOf('challenge__container') !== -1;
  }

  function postForm(form) {
    return fetch(form.getAttribute('action') || '/contact', {
      method: 'POST',
      body: new FormData(form),
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }).then(function (res) {
      return res.text().then(function (html) {
        return { status: res.status, ok: res.ok, html: html, url: res.url || '' };
      });
    });
  }

  function afterPost(result, root, form, blockId, errorEl, submitBtn) {
    if (submitBtn) submitBtn.disabled = false;

    if (isChallengeHtml(result.html, result.url) || result.status === 400) {
      showOverlay(root, form);
      showError(errorEl, STRINGS.captcha);
      return;
    }

    if (isSuccessHtml(result.html, blockId) || (result.ok && !isChallengeHtml(result.html, result.url))) {
      showSuccess(root);
      return;
    }

    if (result.status === 422 || (result.html && result.html.indexOf('email-message--error') !== -1)) {
      showError(errorEl, STRINGS.error);
      return;
    }

    showError(errorEl, STRINGS.error);
  }

  function submit(root, form, blockId, errorEl, submitBtn) {
    function run() {
      postForm(form)
        .then(function (result) {
          afterPost(result, root, form, blockId, errorEl, submitBtn);
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = false;
          showError(errorEl, STRINGS.error);
        });
    }

    if (window.Shopify && window.Shopify.captcha && typeof window.Shopify.captcha.protect === 'function') {
      window.Shopify.captcha.protect(form, run);
    } else {
      run();
    }
  }

  function bindRoot(root) {
    var form = qs(root, 'form.splash-streams__email-form');
    if (!form || form.dataset.splashEmailBound === '1') return;
    form.dataset.splashEmailBound = '1';

    var blockId = root.getAttribute('data-splash-email-block-id');
    var errorEl = qs(root, '[data-splash-email-error]');
    var submitBtn = form.querySelector('[type="submit"]');

    if (window.Shopify && window.Shopify.captcha && typeof window.Shopify.captcha.protect === 'function') {
      window.Shopify.captcha.protect(form, function () {});
    }

    var closeBtn = qs(root, '[data-splash-email-challenge-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        hideOverlay(root);
        hideError(errorEl);
        if (submitBtn) {
          submitBtn.disabled = true;
          submit(root, form, blockId, errorEl, submitBtn);
        }
      });
    }

    if (root.hasAttribute('data-splash-email-just-success')) {
      showSuccess(root);
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      hideError(errorEl);
      if (submitBtn) submitBtn.disabled = true;
      submit(root, form, blockId, errorEl, submitBtn);
    });
  }

  function init(scope) {
    (scope || document).querySelectorAll('[data-splash-email-root]').forEach(bindRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
    });
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function (ev) {
    init(ev.target);
  });
})();
