'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Eye, EyeOff, LogIn, UserPlus, X } from 'lucide-react';
import { authErrorMessage, validateCredentials, type AuthMode } from '../lib/auth';

export function AuthDialog({ client, onClose }: { client: SupabaseClient | null; onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Passwords stay in component memory only and are discarded on close.
  useEffect(() => { setPassword(''); setConfirmation(''); setError(''); setMessage(''); setShowPassword(false); }, [mode]);
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
      <button className="modal-close" aria-label="닫기" onClick={onClose}><X size={19}/></button>
      <div className="auth-logo">{mode === 'login' ? <LogIn size={20}/> : <UserPlus size={20}/>}</div>
      <h2 id="auth-heading">{mode === 'login' ? 'LULPUP에 로그인' : 'LULPUP 시작하기'}</h2>
      <p>한 줄씩 연결하는 나만의 생각 공간.<br/>{mode === 'login' ? '아이디와 비밀번호로 작업을 이어가세요.' : '계정을 만들고 워크스페이스에 생각을 담아보세요.'}</p>
      <div className="auth-tabs" aria-label="인증 방식">
        <button type="button" aria-pressed={mode === 'login'} disabled={busy} onClick={() => setMode('login')}>로그인</button>
        <button type="button" aria-pressed={mode === 'signup'} disabled={busy} onClick={() => setMode('signup')}>회원가입</button>
      </div>
      {!client && <div className="auth-info">서버의 인증 연결이 아직 설정되지 않았습니다. 설정이 완료되면 로그인과 회원가입을 사용할 수 있습니다.</div>}
      <form onSubmit={async event => {
        event.preventDefault(); if (busy) return;
        const invalid = validateCredentials(mode, email, password, confirmation);
        if (invalid) { setError(invalid); return; }
        if (!client) { setError('인증 서버가 아직 연결되지 않았습니다.'); return; }
        setBusy(true); setError(''); setMessage('');
        try {
          const credentials = { email: email.trim().toLowerCase(), password };
          const result = mode === 'login'
            ? await client.auth.signInWithPassword(credentials)
            : await client.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } });
          if (result.error) { setError(authErrorMessage(result.error.code)); return; }
          setPassword(''); setConfirmation('');
          if (result.data.session) onClose();
          else setMessage('이메일 인증이 필요합니다. 받은 편지함의 인증 링크를 확인한 뒤 로그인해 주세요. 이미 가입했다면 로그인 탭을 이용해 주세요.');
        } catch { setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
        finally { setBusy(false); }
      }}>
        <label htmlFor="auth-email">아이디 (이메일)</label>
        <input id="auth-email" autoFocus type="email" autoComplete="username" required placeholder="you@example.com" disabled={busy} value={email} onChange={event => setEmail(event.target.value)}/>
        <label htmlFor="auth-password">비밀번호</label>
        <div className="password-field"><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} maxLength={128} placeholder={mode === 'signup' ? '8자 이상 입력' : '비밀번호 입력'} disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/><button type="button" title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>
        {mode === 'signup' && <><label htmlFor="auth-confirm">비밀번호 확인</label><input id="auth-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder="비밀번호를 다시 입력해 주세요" disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)}/></>}
        {error && <div className="field-error" role="alert">{error}</div>}
        {message && <div className="auth-info" role="status">{message}</div>}
        <button className="auth-submit" type="submit" disabled={!client || busy}>{busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}<ArrowRight size={15}/></button>
      </form>
      <small>로그인 후 워크스페이스와 마인드맵을 만들고 저장할 수 있습니다.</small>
    </section>
  </div>;
}
