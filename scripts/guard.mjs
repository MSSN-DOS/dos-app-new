#!/usr/bin/env node
/**
 * PolinRider project guard.
 *
 * Scans the CURRENT project for known PolinRider / TasksJacker malware IOCs.
 * Wired into package.json lifecycle hooks (preinstall/predev/prelint/pretest/
 * prebuild) and the Husky pre-commit hook.
 *
 * Zero dependencies on purpose: `preinstall` runs before node_modules exists.
 * Exits 1 on any finding, 0 when clean.
 */
import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";

const ROOT = process.cwd();
const SELF = join("scripts", "guard.mjs");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vercel",
  ".cache",
  ".pnpm-store",
]);

const PROPAGATION_ARTIFACTS = [
  "branch_structure.json",
  "temp_auto_push.bat",
  "temp_interactive_push.bat",
  "config.bat",
  "spellright.dict",
];

const CONFIG_GLOBS = [
  /^postcss\.config\./,
  /^tailwind\.config\./,
  /^eslint\.config\./,
  /^next\.config\./,
  /^vite\.config\./,
  /^webpack\.config\./,
  /^babel\.config\./,
  /^gridsome\.config\./,
  /^vue\.config\./,
  /^truffle\.config\./,
];

const MARKERS =
  /rmcej%otb%|_\$_1e42|_\$_1e4|Cot%3t=shtP|MDy[^A-Za-z0-9+/=]|2857687|2667686|ThZG\+0jfXE6VAGOJ|RPC_ENDPOINTS|global\.i\s*=\s*"A10|global\[['"]!['"]\]\s*=\s*['"]8-|global\[['"]_V['"]\]/;
const WHITESPACE = / {200,}/;
const EXEC = /eval\(atob\(|Function\(atob\(|new\s+Function\(|curl[^|\n]*\|\s*(sh|bash)|base64\s+-d/;
const CREATE_REQUIRE = /createRequire/;
const SPAWN = /spawn|child_process|\beval\(/;
const C2 =
  /260120\.vercel\.app|default-configuration\.vercel\.app|vscode-settings-bootstrap\.vercel\.app|vscode-settings-config\.vercel\.app|vscode-bootstrapper\.vercel\.app|vscode-load-config\.vercel\.app|166\.88\.54\.158|lianxinxiao\.com|e9b53a7c-2342-4b15-b02d-bd8b8f6a03f9/;

const FONT_MAGIC = {
  woff2: ["774f4632"],
  woff: ["774f4646"],
  ttf: ["00010000", "00020000", "74727565", "74797031"],
  otf: ["4f54544f"],
  ttc: ["74746366"],
};

const EVIL_PKGS = [
  "tailwindcss-style-animate",
  "tailwind-mainanimation",
  "tailwind-autoanimation",
  "tailwind-automanimation",
  "tailwind-animationbased",
  "tailwindcss-typography-style",
  "tailwindcss-style-modify",
  "tailwindcss-animate-style",
];

const TAILWIND_ALLOW = [
  /^tailwindcss$/,
  /^tailwindcss-animate$/,
  /^@tailwindcss\/.+$/,
  /^tailwind-merge$/,
  /^tailwindcss-intellisense$/,
  /^prettier-plugin-tailwindcss$/,
];

const findings = [];
function flag(file, reason) {
  findings.push(`${file}  ->  ${reason}`);
}
const rel = (p) => relative(ROOT, p) || ".";

function readMagic(path) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(4);
    const n = readSync(fd, buf, 0, 4, 0);
    return buf.subarray(0, n).toString("hex");
  } finally {
    closeSync(fd);
  }
}

function scanFont(path) {
  const ext = extname(path).slice(1).toLowerCase();
  const magic = readMagic(path);
  if (ext === "eot") {
    const size = statSync(path).size;
    const le = Buffer.alloc(4);
    le.writeUInt32LE(size >>> 0);
    if (magic !== le.toString("hex")) {
      flag(
        rel(path),
        `fake .eot font (magic 0x${magic}; size prefix does not match ${size} bytes)`,
      );
    }
    return;
  }
  const allowed = FONT_MAGIC[ext];
  if (allowed && !allowed.includes(magic)) {
    flag(
      rel(path),
      `fake .${ext} font (magic 0x${magic}; not a real font - likely a JS payload)`,
    );
  }
}

function scanTasksJson(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  if (/folderOpen|runOn/.test(text)) {
    flag(rel(path), "tasks.json auto-runs on folder open (TasksJacker stager)");
  } else if (/\.(woff2?|ttf|otf|eot)/i.test(text)) {
    flag(rel(path), "tasks.json stages a font file via node (TasksJacker stager)");
  }
}

function scanConfig(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  if (text.length > 2 * 1024 * 1024) text = text.slice(0, 2 * 1024 * 1024);
  if (MARKERS.test(text)) flag(rel(path), "contains a known PolinRider payload marker");
  if (WHITESPACE.test(text))
    flag(rel(path), "contains 200+ char whitespace padding (payload concealment)");
  if (EXEC.test(text))
    flag(rel(path), "contains packed-payload / pipe-to-shell exec pattern");
  if (CREATE_REQUIRE.test(text) && SPAWN.test(text))
    flag(rel(path), "createRequire + spawn/eval (payload loader)");
  if (C2.test(text)) flag(rel(path), "references a known PolinRider C2 host / template UUID");
}

function scanPackageJson(path) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const name of Object.keys(deps)) {
    if (EVIL_PKGS.includes(name)) {
      flag(rel(path), `known malicious package "${name}" in dependencies`);
      continue;
    }
    if (/tailwind/i.test(name) && !TAILWIND_ALLOW.some((re) => re.test(name))) {
      flag(rel(path), `unknown tailwind-family package "${name}" - verify it is legitimate`);
    }
  }
}

const isConfig = (name) => CONFIG_GLOBS.some((re) => re.test(name));
const isGithub = (relPath) => relPath.startsWith(`.github${sep}`);

let fileCount = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name === ".vscode" || entry.name === "_vscode") {
        flag(rel(full), "banned .vscode/_vscode folder (TasksJacker auto-run vector)");
        continue;
      }
      walk(full);
      continue;
    }

    if (!entry.isFile()) continue;
    fileCount++;

    const relPath = rel(full);
    const name = entry.name;
    if (relPath === SELF) continue;

    if (PROPAGATION_ARTIFACTS.includes(name) || /^temp.*push.*\.bat$/i.test(name)) {
      flag(relPath, "known malware propagation artifact");
    }
    if (name === "tasks.json") scanTasksJson(full);

    const ext = extname(name).slice(1).toLowerCase();
    if (["woff2", "woff", "ttf", "otf", "ttc", "eot"].includes(ext)) scanFont(full);

    if (isConfig(name) && !isGithub(relPath)) scanConfig(full);
    if (name === "package.json") scanPackageJson(full);
  }
}

walk(ROOT);

if (findings.length > 0) {
  console.error("");
  console.error("  [X] PolinRider guard FAILED - this project looks compromised:");
  console.error("");
  for (const f of findings) console.error(`   - ${f}`);
  console.error("");
  console.error("  Do NOT run install/dev/build. Rotate exposed credentials.");
  console.error("  Clean the listed files, then re-run: node scripts/guard.mjs");
  console.error("");
  process.exit(1);
}

console.log(`  [OK] PolinRider guard passed - ${fileCount} files scanned, no IOCs found.`);
process.exit(0);
