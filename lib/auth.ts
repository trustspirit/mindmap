export type AuthMode = 'login' | 'signup';
export function validateCredentials(mode: AuthMode, email: string, password: string, confirmation: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return '아이디는 이메일 주소로 입력해 주세요.';
  if (!password) return '비밀번호를 입력해 주세요.';
  if (mode === 'signup' && password.length < 8) return '비밀번호는 8자 이상으로 입력해 주세요.';
  if (password.length > 128) return '비밀번호는 128자 이하로 입력해 주세요.';
  if (mode === 'signup' && password !== confirmation) return '비밀번호가 일치하지 않습니다.';
  return '';
}
export function authErrorMessage(code?: string) {
  if (code === 'invalid_credentials') return '아이디 또는 비밀번호를 확인해 주세요.';
  if (code === 'email_not_confirmed') return '이메일 인증을 완료한 뒤 로그인해 주세요.';
  if (code === 'user_already_exists') return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (code === 'weak_password') return '비밀번호가 너무 간단합니다. 더 강한 비밀번호를 사용해 주세요.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  return '요청을 처리하지 못했습니다. 입력 정보와 연결 상태를 확인하고 다시 시도해 주세요.';
}
