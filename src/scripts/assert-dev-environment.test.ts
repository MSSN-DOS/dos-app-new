/**
 * The production guard is only as good as its parsing, and `tsx` never sets `NODE_ENV`, so the
 * old `NODE_ENV === "production"` check was false on every run. These tests pin the replacement's
 * decisions rather than its prose: the dangerous case must be a *refusal*, and it must refuse for
 * a reason that cannot be satisfied by leaving an environment variable unset.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  assertDevEnvironment,
  describeDatabaseTarget,
  evaluateGuard,
  loadEnvironmentFiles,
  type GuardInput,
} from "./assert-dev-environment";

const originalEnv = { ...process.env };

// `@types/node` types `process.env` as a map of read-only properties, so `delete env.KEY` and
// `env.KEY = …` are compile errors through it. These tests exist precisely to assert on the
// *absent* case (`"NODE_ENV" in process.env` being false), so going through a writable alias is
// the point rather than a workaround — `process.env` itself is untouched, which is what the
// alias is for.
const env = process.env as Record<string, string | undefined>;

// Restores keys *into* `env` rather than replacing `process.env`. Reassigning `process.env` would
// leave the alias above pointing at the discarded object, so the tests would mutate a copy that
// the module under test never reads — and every assertion would then fail for the wrong reason.
afterEach(() => {
  for (const key of Object.keys(env)) {
    if (!(key in originalEnv)) delete env[key];
  }
  Object.assign(env, originalEnv);
});

/** The shape of a connection string, with a placeholder credential. */
const conn = (user: string, host: string) =>
  `postgresql://${user}:pw@${host}:5432/postgres`;

/** The dev project this repository actually runs against. */
const DEV_REF = "rkmuitqrasbiwijjmqbp";
const PROD_REF = "abcdefghijklmnopqrst";

describe("describeDatabaseTarget", () => {
  it("treats localhost as local", () => {
    expect(describeDatabaseTarget(conn("postgres", "localhost"))).toEqual({
      kind: "local",
      host: "localhost",
    });
    expect(describeDatabaseTarget(conn("postgres", "127.0.0.1")).kind).toBe("local");
  });

  it("reads the project ref out of a pooled Supabase username", () => {
    // The pooler host is shared by every project in the region, so the ref can only come from
    // the username. This is the exact shape of this repo's dev DATABASE_URL.
    expect(
      describeDatabaseTarget(
        conn(`postgres.${DEV_REF}`, "aws-1-eu-west-1.pooler.supabase.com"),
      ),
    ).toEqual({
      kind: "supabase",
      host: "aws-1-eu-west-1.pooler.supabase.com",
      projectRef: DEV_REF,
    });
  });

  it("reads the project ref out of a direct-connect host", () => {
    expect(describeDatabaseTarget(conn("postgres", `db.${DEV_REF}.supabase.co`))).toEqual(
      {
        kind: "supabase",
        host: `db.${DEV_REF}.supabase.co`,
        projectRef: DEV_REF,
      },
    );
  });

  it("refuses to classify a remote host it cannot identify", () => {
    // Default-deny. If this ever returned something permitted, an attacker-controlled or
    // simply unexpected host string would be treated as dev.
    expect(describeDatabaseTarget(conn("postgres", "db.internal.example.com"))).toEqual({
      kind: "unrecognised",
      host: "db.internal.example.com",
    });
  });

  it("does not mistake a wrong-length token for a project ref", () => {
    expect(describeDatabaseTarget(conn("postgres.shorto", "db.example.com")).kind).toBe(
      "unrecognised",
    );
  });

  it("throws rather than guessing on an unparseable URL", () => {
    expect(() => describeDatabaseTarget("not-a-url")).toThrow(/parseable/);
  });
});

// These call `evaluateGuard` with plain values rather than mutating `process.env`. The guard's
// decisions are a pure function of its four inputs, and driving it that way keeps the assertions
// about *this* code's logic instead of about whatever the repo's own `.env.local` happens to
// contain — which is exactly how the previous version of this file broke: `assertDevEnvironment`
// loads the env files itself, so `.env.local`'s `DOS_DEV_PROJECT_REFS` refilled the variable these
// tests had just deleted.
describe("evaluateGuard", () => {
  const guard = (over: Partial<GuardInput> = {}) =>
    evaluateGuard({
      scriptName: "test-script",
      databaseUrl: conn("postgres", "localhost"),
      nodeEnv: undefined,
      allowlist: "",
      ...over,
    });

  it("allows a local database with nothing else configured", () => {
    expect(() => guard()).not.toThrow();
  });

  it("allows a Supabase database whose ref is allowlisted", () => {
    expect(() =>
      guard({
        databaseUrl: conn(
          `postgres.${DEV_REF}`,
          "aws-1-eu-west-1.pooler.supabase.com",
        ),
        allowlist: `  ${DEV_REF} , someone-elses-ref `,
      }),
    ).not.toThrow();
  });

  it("refuses a production Supabase database on the SAME shared host as dev", () => {
    // This is the assertion the whole module exists for. Dev and prod share the pooler hostname,
    // so a host-based guard passes both; only the ref distinguishes them.
    expect(() =>
      guard({
        databaseUrl: conn(
          `postgres.${PROD_REF}`,
          "aws-1-eu-west-1.pooler.supabase.com",
        ),
        allowlist: DEV_REF,
      }),
    ).toThrow(new RegExp(PROD_REF));
  });

  it("cannot be satisfied by leaving NODE_ENV unset", () => {
    // The regression: the old guard ran as `undefined === "production"`, so an unset NODE_ENV —
    // which is what tsx gives you, every time — passed.
    expect(() =>
      guard({
        databaseUrl: conn(
          `postgres.${PROD_REF}`,
          "aws-1-eu-west-1.pooler.supabase.com",
        ),
        allowlist: DEV_REF,
      }),
    ).toThrow(/refusing to run/);
  });

  it("refuses a remote host that yields no project ref, allowlist or not", () => {
    // Default-deny on unidentifiable hosts. Without this, a host the guard cannot classify would
    // have no branch and could fall through to allowed.
    expect(() =>
      guard({
        databaseUrl: conn("postgres", "db.internal.example.com"),
        allowlist: DEV_REF,
      }),
    ).toThrow(/cannot tell whether/);
  });

  it("identifies by project ref even on a non-Supabase host", () => {
    // Deliberate: the ref is the identity that matters, and a self-hosted Postgres carrying the
    // allowlisted dev ref in its username is the dev database. Accidental misdirection copies a
    // prod DATABASE_URL wholesale, which changes the ref — not the host.
    expect(() =>
      guard({
        databaseUrl: conn(`postgres.${DEV_REF}`, "db.internal.example.com"),
        allowlist: DEV_REF,
      }),
    ).not.toThrow();
  });

  it("refuses when no allowlist is set at all", () => {
    expect(() =>
      guard({
        databaseUrl: conn(`postgres.${DEV_REF}`, "aws-1-eu-west-1.pooler.supabase.com"),
      }),
    ).toThrow(/not allowlisted/);
  });

  it("names the script in the failure so the message is actionable", () => {
    expect(() =>
      guard({ scriptName: "flush-dev", databaseUrl: "" }),
    ).toThrow(/flush-dev/);
  });

  it("still honours NODE_ENV=production as an extra layer", () => {
    expect(() =>
      guard({
        nodeEnv: "production",
        databaseUrl: "postgresql://postgres:pw@localhost:5432/postgres",
      }),
    ).toThrow(/NODE_ENV=production/);
  });
});

// The wrapper's only job is env loading, so these two exist to pin that job and nothing else — the
// decisions themselves are `evaluateGuard`'s business and are covered above.
describe("assertDevEnvironment", () => {
  it("decides on the environment as it stands at call time", () => {
    // Three scripts in a row got this order wrong — asserting before loading meant the guard fired
    // on "DATABASE_URL is not set" against a working dev database. This is the regression.
    //
    // The variables are supplied explicitly rather than deleted and left to ambient `.env.local`.
    // The earlier version cleared them and relied on the developer's gitignored env file to put
    // them back, reasoning that "loading can only make this less likely to throw". That reasoning
    // is false on a clean machine: CI has no `.env.local` (`.gitignore` ignores `.env.*`), so the
    // guard correctly refused and this test failed there while passing locally. A test that
    // depends on untracked local state is the same defect class as the `toBeDefined()` and
    // `T00:00:00Z` tests from the original review.
    //
    // Nothing here asserts *what* the guard decides with a missing or foreign URL — those cases
    // are the `evaluateGuard` tests above, which take plain values and cannot drift. This is only
    // about the wrapper: it loads, then delegates, and passes when the environment says dev.
    delete env.NODE_ENV;
    env.DATABASE_URL = conn(`postgres.${DEV_REF}`, "aws-1-eu-west-1.pooler.supabase.com");
    env.DOS_DEV_PROJECT_REFS = DEV_REF;
    expect(() => assertDevEnvironment("test-script")).not.toThrow();
  });

  it("loadEnvironmentFiles is best-effort and never throws", () => {
    // Its contract, and the part that matters when no env file exists at all: skip quietly
    // rather than take the process down. This is safe to assert on any machine because the
    // function does not care which files are present.
    expect(() => loadEnvironmentFiles()).not.toThrow();
    expect(() => loadEnvironmentFiles()).not.toThrow();
  });

  it("still refuses a production ref after loading", () => {
    delete env.NODE_ENV;
    env.DATABASE_URL = conn(
      `postgres.${PROD_REF}`,
      "aws-1-eu-west-1.pooler.supabase.com",
    );
    env.DOS_DEV_PROJECT_REFS = DEV_REF;
    expect(() => assertDevEnvironment("test-script")).toThrow(new RegExp(PROD_REF));
  });
});
