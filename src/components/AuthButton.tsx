/**
 * AuthButton — React Island
 *
 * Shows the Google Sign-In button when unauthenticated,
 * or the user avatar + name + logout when authenticated.
 *
 * Security:
 *  - Uses framework-native React JSX (no dangerouslySetInnerHTML)
 *  - Never logs user data to console
 *  - Logout is a POST request to clear the HttpOnly session cookie
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';

// Google "G" logo SVG — using DOMParser approach would be overkill for a static icon
// This SVG is hardcoded (not from user input), so it is safe to embed directly
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function AuthButton() {
  const { isLoading, isAuthenticated, user, login, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (isLoading) {
    return (
      <div style={{ width: 120, height: 36, background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', animation: 'pulse 1.5s infinite' }} aria-label="Loading authentication…" />
    );
  }

  if (!isAuthenticated) {
    return (
      <button
        id="btn-google-signin"
        className="btn btn-google"
        onClick={login}
        aria-label="Sign in with Google to sync your calendar"
      >
        <GoogleIcon />
        Sign in with Google
      </button>
    );
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setShowMenu(false);
    await logout();
  };

  return (
    <div className="auth-user" style={{ position: 'relative' }}>
      <span className="auth-name" title={user?.name ?? ''}>{user?.name}</span>
      <button
        id="btn-user-menu"
        onClick={() => setShowMenu(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '50%' }}
        aria-label="User menu"
        aria-expanded={showMenu}
        aria-haspopup="true"
      >
        {user?.picture ? (
          <img
            className="auth-avatar"
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            width={32}
            height={32}
          />
        ) : (
          <div className="auth-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700 }}>
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}
      </button>

      {showMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            onClick={() => setShowMenu(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-label="User menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-hover)',
              borderRadius: 'var(--radius-lg)',
              padding: '8px',
              minWidth: 200,
              zIndex: 20,
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideDown 0.15s ease',
            }}
          >
            <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user?.email}</div>
            </div>
            <button
              id="btn-logout"
              role="menuitem"
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--error)',
                marginTop: 4,
                transition: 'background 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {isLoggingOut ? (
                <><div className="spinner" />Signing out…</>
              ) : (
                <><span aria-hidden="true">↩</span> Sign out</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
