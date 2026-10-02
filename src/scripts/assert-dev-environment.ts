/**
 * A guard that destructive dev scripts cannot be talked out of by an unset environment variable.
 *
 * WHY THE OLD CHECK WAS NOT ONE
 * -----------------------------
 * Both `flush-dev.ts` and `verify-video-exemption.ts` used to refuse only when
 * `process.env.NODE_ENV === "production"`. Neither script is run through Next.js, and **tsx never
 * sets `NODE_ENV`** — so the condition is `undefined === "production"`, i.e. false, on every
 * invocation including one pointed at production. A guard that an unset variable satisfies is not a
 * guard. `flush-dev.ts` deletes nearly every row in the database; `verify-video-exemption.ts`
 * inserts content and rewrites the global `semester_settings` row.
 *
 * WHY A HOSTNAME CHECK IS NOT ENOUGH EITHER
 * -----------------------------------------
 * Supabase routes every project through shared pooler hosts
 * (`aws-0-<region>.pooler.supabase.com`) and shared API hosts (`<ref>.supabase.co`). A production
 * `DATABASE_URL` and this dev one have the *same hostname*. Matching on host alone would reject
 * every real Supabase database, including the dev one, or — worse — pass both.
 *
 * The only thing that separates a dev Supabase project from a production one is the 20-character
 * **project ref**, which appears in the connection username (`postgres.<ref>`) and in the API
 * hostname. So the guard is: local hosts are fine, Supabase hosts must name a ref that is
 * explicitly allowlisted, and anything it cannot positively identify is refused.
 */

import fs from "node:fs";
import process from "node:process";

/** Hosts that are unambiguously not a shared remote environment. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** A Supabase project ref: exactly 20 lowercase alphanumerics. */
const PROJECT_REF = String.raw`[a-z0-9]{20}`;

/** Connection username Supabase issues for a project: `postgres.<ref>`. */
const USERNAME_WITH_REF = new RegExp(String.raw`^postgres\.(${PROJECT_REF})$`);

/** Direct-connect host (`db.<ref>.supabase.co`) or API host (`<ref>.supabase.co`). */
const HOST_WITH_REF = new RegExp(String.raw`^(?:db\.)?(${PROJECT_REF})\.supabase\.co$`);

/** Comma-separated allowlist of refs these scripts are permitted to write to. */
const ALLOWLIST_ENV = "DOS_DEV_PROJECT_REFS";

export type DatabaseTarget =
  | { kind: "local"; host: string }
  | { kind: "supabase"; host: string; projectRef: string }
  | { kind: "unrecognised"; host: string };

/**
 * Classify a `DATABASE_URL` into a target kind and, for Supabase, its project ref.
 *
 * Exported separately from the assertion so the parsing can be unit-tested without a database.
 * Throws only on a URL Node cannot parse at all, which is itself a refusal.
 */
export function describeDatabaseTarget(databaseUrl: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing to run: DATABASE_URL is not a parseable URL.");
  }

  const host = parsed.hostname.toLowerCase();

  if (LOCAL_HOSTS.has(host)) return { kind: "local", host };

  const projectRef =
    USERNAME_WITH_REF.exec(decodeURIComponent(parsed.username))?.[1] ??
    HOST_WITH_REF.exec(host)?.[1];

  if (projectRef) return { kind: "supabase", host, projectRef };

  // A remote host we cannot positively identify as dev. Refused, rather than assumed safe.
  return { kind: "unrecognised", host };
}

/** The refs the operator has declared safe to write to. Split and normalised; empties dropped. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Load `.env.local` then `.env`, without clobbering variables already in the environment.
 * Safe to call more than once.
 */
export function loadEnvironmentFiles(): void {
  for (const file of [".env.local", ".env"]) {
    if (fs.existsSync(file)) process.loadEnvFile?.(file);
  }
}

/** The inputs the guard decides on, so the decision can be tested without the filesystem. */
export interface GuardInput {
  scriptName: string;
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  allowlist: string;
}

/**
 * The decision, with every input passed in. Throws unless the database may be written to.
 *
 * Kept separate from `assertDevEnvironment` on purpose: that function loads `.env.local`, and a test
 * that wants to assert "refuses when no allowlist is set" cannot unset a variable that the loader
 * will immediately refill from the repo's own `.env.local`. Both halves matter — the decision is
 * pinned here, and the loading is pinned by a couple of tests that exercise the wrapper.
 */
export function evaluateGuard({ scriptName, databaseUrl, nodeEnv, allowlist }: GuardInput): void {
  if (!databaseUrl) {
    throw new Error(
      `${scriptName}: refusing to run — DATABASE_URL is not set (checked .env.local and .env).`,
    );
  }

  // Kept as an additional layer even though it is not load-bearing: `NODE_ENV` is commonly set
  // by CI and hosting runtimes, so honouring it costs nothing and catches the obvious case early.
  if (nodeEnv === "production") {
    throw new Error(`${scriptName}: refusing to run — NODE_ENV=production.`);
  }

  const target = describeDatabaseTarget(databaseUrl);

  if (target.kind === "local") return;

  if (target.kind === "unrecognised") {
    throw new Error(
      `${scriptName}: refusing to run — cannot tell whether ${target.host} is a dev database. ` +
        `This guard only recognises local hosts and Supabase project refs. If this really is a ` +
        `safe database, add its host to LOCAL_HOSTS in assert-dev-environment.ts deliberately.`,
    );
  }

  const allowed = parseAllowlist(allowlist);
  if (allowed.has(target.projectRef)) return;

  throw new Error(
    `${scriptName}: refusing to run — ${target.host} is Supabase project ${target.projectRef}, ` +
      `which is not allowlisted for writing.\n` +
      `  This script modifies real rows. Only run it against a dev project whose ref is listed in ` +
      `${ALLOWLIST_ENV}.\n` +
      `  Currently allowed: ${allowed.size > 0 ? [...allowed].join(", ") : "(none set)"}.`,
  );
}

/**
 * Throw unless the process is pointed at a database these scripts may write to.
 *
 * `scriptName` appears in every message, so the failure tells you which script refused and why
 * rather than leaving a bare "undefined is not production" to interpret.
 */
export function assertDevEnvironment(scriptName: string): void {
  // Load the env files *here* rather than leaving it to the caller. Two scripts already got this
  // order wrong — asserting before loading meant the guard fired on "DATABASE_URL is not set"
  // against a perfectly good dev database, which is how a guard starts looking like noise and
  // gets removed. `process.loadEnvFile` does not overwrite variables that are already set, so a
  // caller (or a test) that set them deliberately still wins.
  loadEnvironmentFiles();

  evaluateGuard({
    scriptName,
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    allowlist: process.env[ALLOWLIST_ENV] ?? "",
  });
}