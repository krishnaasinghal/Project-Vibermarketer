const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthFieldErrors = {
  email?: string;
  password?: string;
  confirm?: string;
};

export function validateEmail(email: string): string | undefined {
  const v = email.trim().toLowerCase();
  if (!v) return "Email is required.";
  if (v.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email.";
  return undefined;
}

/** Client + server password policy (Supabase enforces its own floor too). */
export function validatePassword(password: string): string | undefined {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Password is too long.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use letters and at least one number.";
  }
  return undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
