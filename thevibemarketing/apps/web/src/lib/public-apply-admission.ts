import { checkRateLimit, clientKeyFromHeaders } from "@/lib/auth/rate-limit";

export const PUBLIC_APPLY_LIMIT = 6;
export const PUBLIC_APPLY_WINDOW_MS = 10 * 60_000;

export function checkPublicApplyAdmission(headers: Headers) {
  return checkRateLimit(
    clientKeyFromHeaders(headers, "public-apply"),
    PUBLIC_APPLY_LIMIT,
    PUBLIC_APPLY_WINDOW_MS,
  );
}
