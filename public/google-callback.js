// public/google-callback.js
// Standalone Google OAuth Redirect Handler (CSP 'self' compliant, zero inline script)
(function() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  const idToken = hashParams.get('id_token') || queryParams.get('id_token');
  const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
  const error = hashParams.get('error') || queryParams.get('error');
  const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
  const stateStr = hashParams.get('state') || queryParams.get('state');

  let returnUrl = '/';
  if (stateStr) {
    try {
      const raw = stateStr.startsWith('%') ? decodeURIComponent(stateStr) : stateStr;
      const parsed = JSON.parse(raw);
      if (parsed.returnTo && typeof parsed.returnTo === 'string') {
        const u = new URL(parsed.returnTo, window.location.origin);
        if (u.origin === window.location.origin) {
          returnUrl = u.pathname + u.search + u.hash;
        }
      }
    } catch (e) {
      try {
        const parsed = JSON.parse(decodeURIComponent(stateStr));
        if (parsed.returnTo && typeof parsed.returnTo === 'string') {
          const u = new URL(parsed.returnTo, window.location.origin);
          if (u.origin === window.location.origin) {
            returnUrl = u.pathname + u.search + u.hash;
          }
        }
      } catch (e2) {}
    }
  }

  const statusEl = document.getElementById('status');

  function showError(msg) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = '#e11d48';
    }
    const existingBtn = document.getElementById('return-btn');
    if (!existingBtn) {
      const btn = document.createElement('button');
      btn.id = 'return-btn';
      btn.textContent = 'Return to PantryPool';
      btn.style.cssText = 'margin-top: 16px; padding: 10px 20px; background: #E8694A; color: #fff; border: none; border-radius: 9999px; font-weight: 600; font-size: 13px; cursor: pointer;';
      btn.onclick = function() { window.location.replace(returnUrl); };
      document.body.appendChild(btn);
    }
  }

  // Safety watchdog: surface a retry affordance if verification stalls.
  const watchdog = setTimeout(function() {
    showError('Sign-in verification is taking longer than expected. Please tap below to retry.');
  }, 8000);

  if (error) {
    clearTimeout(watchdog);
    showError('Google sign-in cancelled or failed: ' + (errorDesc || error));
    return;
  }

  if (!idToken && !accessToken) {
    clearTimeout(watchdog);
    showError('No authorization token received from Google.');
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Verifying account with PantryPool...';
  }

  async function completeAuth() {
    let profileInfo = {};
    if (accessToken) {
      try {
        const ures = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + accessToken }
        });
        if (ures.ok) {
          profileInfo = await ures.json();
        }
      } catch (e) {
        console.warn('[Google OAuth Callback] Userinfo fetch note:', e);
      }
    }

    const payload = {
      credential: idToken || undefined,
      accessToken: accessToken || undefined,
      email: profileInfo.email,
      googleId: profileInfo.sub,
      name: profileInfo.name,
      avatarUrl: profileInfo.picture
    };

    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    clearTimeout(watchdog);

    if (data.success && data.token) {
      try {
        localStorage.setItem('pantrypool_token', data.token);
        localStorage.setItem('pantrypool_auth_token', data.token);
        if (data.user) {
          localStorage.setItem('pantrypool_cached_auth_user_v1', JSON.stringify(data.user));
          localStorage.setItem('pantrypool_active_user_id_v1', data.user.id);
        }
      } catch (e) {}

      const sep = returnUrl.includes('?') ? '&' : '?';
      window.location.replace(returnUrl + sep + 'auth_token=' + encodeURIComponent(data.token));
    } else {
      showError(data.error || 'Authentication verification failed.');
    }
  }

  completeAuth().catch(function(err) {
    clearTimeout(watchdog);
    showError('Connection error during sign-in: ' + (err?.message || 'Network request failed'));
  });
})();
