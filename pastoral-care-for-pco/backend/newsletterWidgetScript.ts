/**
 * Serves the standalone, embeddable JavaScript widget bundle for newsletter signups.
 * Supports both Inline Embed and Floating Bubble / Modal triggers with Shadow DOM CSS isolation.
 */
export function serveNewsletterWidgetScript(req: any, res: any) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache

  const script = `
(function() {
  var currentScript = document.currentScript;
  var scriptUrl = currentScript ? new URL(currentScript.src, window.location.href) : new URL(window.location.href);
  var baseUrl = scriptUrl.origin;

  var churchId = (currentScript && currentScript.getAttribute('data-church-id')) || scriptUrl.searchParams.get('churchId');
  var widgetId = (currentScript && currentScript.getAttribute('data-widget-id')) || scriptUrl.searchParams.get('widgetId') || 'default';

  if (!churchId) {
    console.error('[PCO Newsletter Widget] Missing data-church-id attribute on script tag.');
    return;
  }

  // Fetch widget configuration from API
  fetch(baseUrl + '/api/public/newsletter-widget/' + encodeURIComponent(churchId) + '/' + encodeURIComponent(widgetId))
    .then(function(r) { return r.json(); })
    .then(function(widget) {
      if (!widget || widget.error) {
        console.warn('[PCO Newsletter Widget] Could not load widget configuration:', widget ? widget.error : 'empty');
        return;
      }
      initWidget(widget);
    })
    .catch(function(err) {
      console.error('[PCO Newsletter Widget] Network error fetching config:', err);
    });

  function initWidget(config) {
    var theme = config.theme || {};
    var primaryColor = theme.primaryColor || '#4F46E5';
    var bgColor = theme.backgroundColor || '#FFFFFF';
    var textColor = theme.textColor || '#1E293B';
    var radius = (theme.borderRadius !== undefined ? theme.borderRadius : 12) + 'px';
    var fontFamily = theme.fontFamily || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    var headline = theme.headline || 'Subscribe to our Newsletter';
    var description = theme.description || 'Get our latest updates and announcements directly to your inbox.';
    var buttonText = theme.buttonText || 'Subscribe';
    var successMsg = theme.successMessage || 'Thank you for subscribing! Check your inbox.';
    var fields = config.fields || [{ id: 'email', label: 'Email Address', type: 'email', required: true }];
    var displayType = config.displayType || 'both';
    var bubble = config.bubbleConfig || { enabled: true, buttonText: '💌 Subscribe', position: 'right' };

    // Shared CSS styles for inside the Shadow DOM
    var css = [
      ':host { display: block; font-family: ' + fontFamily + '; color: ' + textColor + '; }',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      '.pco-card { background: ' + bgColor + '; border-radius: ' + radius + '; padding: 28px 24px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.08), 0 2px 6px -1px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.06); max-width: 480px; margin: 0 auto; }',
      '.pco-header { margin-bottom: 20px; text-align: center; }',
      '.pco-title { font-size: 20px; font-weight: 700; line-height: 1.3; color: ' + textColor + '; margin-bottom: 8px; }',
      '.pco-desc { font-size: 14px; line-height: 1.5; color: #64748B; }',
      '.pco-form-group { margin-bottom: 14px; text-align: left; }',
      '.pco-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: ' + textColor + '; }',
      '.pco-required { color: #EF4444; margin-left: 2px; }',
      '.pco-input, .pco-select { width: 100%; padding: 10px 14px; font-size: 14px; border: 1.5px solid #CBD5E1; border-radius: 8px; background: #FFF; color: #1E293B; outline: none; transition: border-color 0.2s, box-shadow 0.2s; font-family: inherit; }',
      '.pco-input:focus, .pco-select:focus { border-color: ' + primaryColor + '; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15); }',
      '.pco-btn { width: 100%; padding: 12px 20px; background: ' + primaryColor + '; color: #FFF; font-weight: 600; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; transition: filter 0.2s, transform 0.1s; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; }',
      '.pco-btn:hover { filter: brightness(1.08); }',
      '.pco-btn:active { transform: scale(0.99); }',
      '.pco-btn:disabled { opacity: 0.65; cursor: not-allowed; }',
      '.pco-error { background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; display: none; }',
      '.pco-success { text-align: center; padding: 24px 12px; }',
      '.pco-success-icon { width: 52px; height: 52px; background: #ECFDF5; color: #10B981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 26px; }',
      '.pco-success-title { font-size: 18px; font-weight: 700; color: #065F46; margin-bottom: 6px; }',
      '.pco-success-desc { font-size: 14px; color: #047857; line-height: 1.5; }',
      '.pco-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: pcoSpin 0.7s linear infinite; }',
      '@keyframes pcoSpin { to { transform: rotate(360deg); } }'
    ].join('\\n');

    // Build the form HTML
    function buildFormHtml() {
      var inputsHtml = fields.map(function(f) {
        var req = f.required ? '<span class="pco-required">*</span>' : '';
        var inputType = f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text';
        var placeholder = f.placeholder || f.label;

        if (f.type === 'select' && Array.isArray(f.options) && f.options.length > 0) {
          var opts = '<option value="">Select an option...</option>' + f.options.map(function(o) {
            return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>';
          }).join('');
          return '<div class="pco-form-group">' +
                 '<label class="pco-label">' + escapeHtml(f.label) + req + '</label>' +
                 '<select class="pco-select" name="' + escapeHtml(f.id) + '" ' + (f.required ? 'required' : '') + '>' + opts + '</select>' +
                 '</div>';
        }

        return '<div class="pco-form-group">' +
               '<label class="pco-label">' + escapeHtml(f.label) + req + '</label>' +
               '<input class="pco-input" type="' + inputType + '" name="' + escapeHtml(f.id) + '" placeholder="' + escapeHtml(placeholder) + '" ' + (f.required ? 'required' : '') + ' />' +
               '</div>';
      }).join('');

      return '<div class="pco-card">' +
        '<div class="pco-header">' +
          '<h3 class="pco-title">' + escapeHtml(headline) + '</h3>' +
          '<p class="pco-desc">' + escapeHtml(description) + '</p>' +
        '</div>' +
        '<div class="pco-error"></div>' +
        '<form class="pco-form">' +
          '<div style="display:none !important;"><input type="text" name="honeypot" tabindex="-1" autocomplete="off" /></div>' +
          inputsHtml +
          '<button type="submit" class="pco-btn"><span>' + escapeHtml(buttonText) + '</span></button>' +
        '</form>' +
        '<div class="pco-success" style="display:none;">' +
          '<div class="pco-success-icon">✓</div>' +
          '<h4 class="pco-success-title">Subscribed!</h4>' +
          '<p class="pco-success-desc">' + escapeHtml(successMsg) + '</p>' +
        '</div>' +
      '</div>';
    }

    // Attach form submission listener to a shadow root
    function bindFormEvents(shadow, source) {
      var form = shadow.querySelector('.pco-form');
      var btn = shadow.querySelector('.pco-btn');
      var errBox = shadow.querySelector('.pco-error');
      var successBox = shadow.querySelector('.pco-success');
      var headerBox = shadow.querySelector('.pco-header');

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        errBox.style.display = 'none';

        var formData = new FormData(form);
        var payload = {
          widgetId: config.id,
          source: source || 'widget'
        };

        formData.forEach(function(val, key) {
          payload[key] = val;
        });

        // Basic client validation
        if (!payload.email || payload.email.indexOf('@') === -1) {
          errBox.textContent = 'Please enter a valid email address.';
          errBox.style.display = 'block';
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="pco-spinner"></span> Subscribing...';

        fetch(baseUrl + '/api/public/newsletter-widget/' + encodeURIComponent(churchId) + '/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(result) {
          if (!result.ok) {
            throw new Error(result.data.error || 'Failed to subscribe. Please try again.');
          }
          // Success
          form.style.display = 'none';
          if (headerBox) headerBox.style.display = 'none';
          successBox.style.display = 'block';

          if (result.data.redirectUrl) {
            setTimeout(function() {
              window.location.href = result.data.redirectUrl;
            }, 1800);
          }
        })
        .catch(function(err) {
          errBox.textContent = err.message || 'Subscription failed. Please try again.';
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.innerHTML = '<span>' + escapeHtml(buttonText) + '</span>';
        });
      });
    }

    // ─── 1. Inline Render ───────────────────────────────────────────────────
    if (displayType === 'inline' || displayType === 'both') {
      var inlineContainers = document.querySelectorAll('#pco-newsletter-widget, [data-pco-newsletter]');
      if (inlineContainers.length === 0 && currentScript && currentScript.parentNode) {
        // If no explicit container was placed, insert an inline container right before or after script
        var autoContainer = document.createElement('div');
        autoContainer.id = 'pco-newsletter-widget';
        currentScript.parentNode.insertBefore(autoContainer, currentScript.nextSibling);
        inlineContainers = [autoContainer];
      }

      inlineContainers.forEach(function(container) {
        if (container.shadowRoot) return; // avoid double mount
        var shadow = container.attachShadow({ mode: 'open' });
        var styleEl = document.createElement('style');
        styleEl.textContent = css;
        shadow.appendChild(styleEl);

        var wrapper = document.createElement('div');
        wrapper.innerHTML = buildFormHtml();
        shadow.appendChild(wrapper);

        bindFormEvents(shadow, 'inline_widget');
      });
    }

    // ─── 2. Floating Bubble & Modal Render ──────────────────────────────────
    if (displayType === 'popup_bubble' || displayType === 'both') {
      if (document.getElementById('pco-bubble-host')) return;

      var host = document.createElement('div');
      host.id = 'pco-bubble-host';
      document.body.appendChild(host);
      var shadow = host.attachShadow({ mode: 'open' });

      var bubblePos = (bubble.position === 'left') ? 'left: 24px;' : 'right: 24px;';
      var bubbleCss = css + [
        '.pco-bubble-trigger { position: fixed; bottom: 24px; ' + bubblePos + ' background: ' + primaryColor + '; color: white; border: none; border-radius: 999px; padding: 13px 22px; font-size: 15px; font-weight: 700; box-shadow: 0 10px 25px -4px rgba(0,0,0,0.25); cursor: pointer; z-index: 999998; display: flex; align-items: center; gap: 8px; font-family: ' + fontFamily + '; transition: transform 0.2s, box-shadow 0.2s; }',
        '.pco-bubble-trigger:hover { transform: scale(1.05); box-shadow: 0 16px 30px -4px rgba(0,0,0,0.3); }',
        '.pco-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 16px; opacity: 0; pointer-events: none; transition: opacity 0.25s ease; }',
        '.pco-modal-backdrop.pco-active { opacity: 1; pointer-events: auto; }',
        '.pco-modal-card { position: relative; width: 100%; max-width: 480px; transform: translateY(20px) scale(0.97); transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }',
        '.pco-modal-backdrop.pco-active .pco-modal-card { transform: translateY(0) scale(1); }',
        '.pco-modal-close { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; background: #F1F5F9; border: none; font-size: 16px; color: #64748B; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.15s, color 0.15s; }',
        '.pco-modal-close:hover { background: #E2E8F0; color: #1E293B; }'
      ].join('\\n');

      var styleEl = document.createElement('style');
      styleEl.textContent = bubbleCss;
      shadow.appendChild(styleEl);

      var modalHtml = [
        '<button class="pco-bubble-trigger" type="button">',
          (bubble.buttonIcon ? '<span>' + escapeHtml(bubble.buttonIcon) + '</span> ' : ''),
          '<span>' + escapeHtml(bubble.buttonText || 'Subscribe') + '</span>',
        '</button>',
        '<div class="pco-modal-backdrop">',
          '<div class="pco-modal-card">',
            '<button class="pco-modal-close" type="button" aria-label="Close">✕</button>',
            buildFormHtml(),
          '</div>',
        '</div>'
      ].join('');

      var wrapper = document.createElement('div');
      wrapper.innerHTML = modalHtml;
      shadow.appendChild(wrapper);

      var triggerBtn = shadow.querySelector('.pco-bubble-trigger');
      var backdrop = shadow.querySelector('.pco-modal-backdrop');
      var closeBtn = shadow.querySelector('.pco-modal-close');

      function openModal() {
        backdrop.classList.add('pco-active');
      }

      function closeModal() {
        backdrop.classList.remove('pco-active');
      }

      triggerBtn.addEventListener('click', openModal);
      closeBtn.addEventListener('click', closeModal);
      backdrop.addEventListener('click', function(e) {
        if (e.target === backdrop) closeModal();
      });

      // Timed or scroll depth triggers
      if (bubble.triggerMode === 'timed' && bubble.delaySeconds) {
        setTimeout(openModal, bubble.delaySeconds * 1000);
      } else if (bubble.triggerMode === 'scroll' && bubble.scrollPercent) {
        var onScroll = function() {
          var scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
          if (scrolled >= bubble.scrollPercent) {
            openModal();
            window.removeEventListener('scroll', onScroll);
          }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
      }

      bindFormEvents(shadow, 'modal_popup');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
  `;

  res.send(script);
}
