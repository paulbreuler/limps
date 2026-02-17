#!/usr/bin/env node
/**
 * Test runner that expands globs for Node 20 compatibility.
 * Node 20 doesn't support glob patterns in `node --test`.
 */
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

function findTestFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.endsWith(".test.js")) {
      results.push(full);
    }
  }
  return results;
}

const testDir = "dist/tests";
let files;
try {
  files = findTestFiles(testDir);
} catch {
  console.log("No dist/tests directory found — skipping tests.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

console.log(`Running ${files.length} test file(s)...`);
execFileSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
