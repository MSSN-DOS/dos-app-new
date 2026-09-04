// Client-side API helper. Every component MUST call the API through this wrapper — never hand-roll
// a fetch() with the auth header inline (AGENTS.md §1). It reads the JWT from localStorage, attaches
// the Authorization header, points at the app's own /api base, and throws a typed ApiError on
// non-2xx so callers don't each re-implement error parsing.

export const TOKEN_KEY = "dos_token";
export const USER_KEY = "dos_user";

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

  const res = await fetch(`/api${path}`, { ...options, headers });

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
    const envelope = body as { error?: { message?: string; code?: string; details?: unknown } };
    throw new ApiError(
      envelope?.error?.message ?? "Request failed",
      res.status,
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }

  return body as T;
}
