/**
 * One password policy for every place a password is set (change, reset, invite).
 * Returns a message when the password is not acceptable, or null when it is.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'password@123', 'passw0rd', 'welcome', 'welcome123',
  'welcome@123', 'welcome@2024', 'welcome@2025', 'welcome@2026', 'welcome@2027', 'admin123',
  'admin@123', 'qwerty123', 'qwertyuiop', '1234567890', '12345678', '123456789', 'letmein123',
  'iloveyou123', 'india@123', 'abcd@1234', 'abc@12345', 'test@1234', 'changeme123',
]);

export const PASSWORD_MIN_LENGTH = 10;

export function passwordPolicyError(password: unknown, user?: { email?: string; name?: string }): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  if (password.length > 128) return 'Password must be at most 128 characters long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number.';

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common. Please choose a stronger password.';

  const emailName = (user?.email || '').split('@')[0].toLowerCase();
  if (emailName.length >= 4 && lower.includes(emailName)) return 'Password must not contain your email address.';
  return null;
}
