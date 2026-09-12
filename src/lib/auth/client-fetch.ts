// Client-side API helper. Every component MUST call the API through this wrapper — never hand-roll
// a fetch() with the auth header inline (AGENTS.md §1). It reads the JWT from localStorage, attaches
// the Authorization header, points at the app's own /api base, and throws a typed ApiError on
// non-2xx so callers don't each re-implement error parsing.

import { toast } from "sonner";

export const TOKEN_KEY = "dos_token";
export const USER_KEY = "dos_user";

let sessionExpiredNotified = false;

function handleSessionExpired() {
  if (typeof window === "undefined") return;
  // Avoid loop on auth pages
  if (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/register")) return;
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  clearToken();
  toast.error("Session expired — please log in again.");
  // Let toast render briefly before navigating
  window.setTimeout(() => {
    window.location.href = "/login";
  }, 300);
  // Reset dedupe after navigation window
  window.setTimeout(() => {
    sessionExpiredNotified = false;
  }, 5000);
}

export type RoleName = "admin" | "teacher" | "student" | "aspirant";

export interface AuthUser {
  id: number;
  roleId: number;
  role?: RoleName;
  identifierType?: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  // Let the browser set Content-Type for multipart bodies (it must include the boundary).
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch (err) {
    // Network failure (offline, DNS, CORS) — surface as ApiError(0) so UI can show offline state
    if (err instanceof TypeError) throw err;
    throw new TypeError((err as Error).message ?? "Network error");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON responses fall through to the error below
  }

  if (!res.ok) {
    if (res.status === 401) {
      handleSessionExpired();
    }
    const envelope = body as { error?: { message?: string; code?: string; details?: unknown } };
    const fallback =
      res.status === 401
        ? "Session expired. Please log in again."
        : res.status === 403
          ? "You do not have permission to do that."
          : res.status === 404
            ? "Not found."
            : res.status === 429
              ? "Too many requests. Try again shortly."
              : res.status >= 500
                ? "Service temporarily unavailable."
                : "Request failed";
    throw new ApiError(
      envelope?.error?.message ?? fallback,
      res.status,
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }

  return body as T;
}
