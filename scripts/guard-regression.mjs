import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url));
function scan(files) {
  const root = mkdtempSync(join(tmpdir(), "dos-guard-test-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = join(root, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return spawnSync(process.execPath, [guard], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const directory of [".vscode", "_vscode", "nested/.vscode", "nested/_vscode"]) {
  test(`rejects ${directory} even without tasks`, () => {
    assert.equal(scan({ [`${directory}/settings.json`]: "{}" }).status, 1);
  });
}
for (const extension of ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "jsonc", "json5", ""]) {
  for (const quote of ["'", '"']) {
    test(`rejects hidden marker in arbitrary ${extension || "extensionless"} file (${quote})`, () => {
      const marker = "global" + ".i = " + quote + "A10-test" + quote;
      const filename = `nested/innocent${extension ? `.${extension}` : ""}`;
      assert.equal(scan({ [filename]: marker }).status, 1);
    });
  }
}
test("rejects lifecycle loader invocation", () => {
  const content = JSON.stringify({ scripts: { build: "node " + "init && next build" } });
  assert.equal(scan({ "package.json": content }).status, 1);
});
test("rejects root loader even when empty", () => {
  assert.equal(scan({ init: "" }).status, 1);
});
test("accepts ordinary JS, TS and JSON", () => {
  assert.equal(scan({ "module.js": "export const value = 1;", "module.ts": "export const value: number = 1;", "settings.json": '{"enabled":true}' }).status, 0);
});

test("scans JavaScript inside GitHub automation folders", () => {
  const marker = "global" + ".i = 'A10-test'";
  assert.equal(scan({ ".github/helpers/check.js": marker }).status, 1);
});
test("scans payloads beyond the former two-megabyte limit", () => {
  const marker = "global" + ".i = 'A10-test'";
  assert.equal(scan({ "large.json": "\n".repeat(2 * 1024 * 1024 + 1) + marker }).status, 1);
});
