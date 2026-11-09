// Builds the updater manifest (latest.json) once, after every platform's
// build job has uploaded its signed bundle to the draft release.
//
//   node --experimental-strip-types scripts/gen-updater-json.ts <sig-dir> <out-file>
//
// tauri-action can write latest.json itself, but each matrix job then does a
// read-modify-write of the same release asset in parallel, and the losers'
// platform entries silently disappear (v0.23.1 shipped a draft whose
// latest.json listed Linux only). Generating it in one place removes the race.
//
// Env: GITHUB_REPOSITORY, GITHUB_REF_NAME (set by Actions), RELEASE_BODY.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PlatformEntry {
  signature: string;
  url: string;
}

const [sigDir, outFile] = process.argv.slice(2);
if (!sigDir || !outFile) {
  console.error("usage: gen-updater-json.ts <sig-dir> <out-file>");
  process.exit(2);
}

const repo = requireEnv("GITHUB_REPOSITORY");
const tag = requireEnv("GITHUB_REF_NAME");

const confPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8")) as { productName: string; version: string };
const name = conf.productName;
const version = conf.version;
if (tag !== `v${version}`) {
  fail(`tag ${tag} does not match tauri.conf.json version ${version}`);
}

// Bundle file name -> the updater platform keys it serves. Mirrors the keys
// tauri-action emits (bare key = the default bundle for that OS/arch).
const BUNDLES: Record<string, string[]> = {
  [`${name}_${version}_x64-setup.exe`]: ["windows-x86_64", "windows-x86_64-nsis"],
  [`${name}_x64.app.tar.gz`]: ["darwin-x86_64", "darwin-x86_64-app"],
  [`${name}_aarch64.app.tar.gz`]: ["darwin-aarch64", "darwin-aarch64-app"],
  [`${name}_${version}_amd64.AppImage`]: ["linux-x86_64", "linux-x86_64-appimage"],
  [`${name}_${version}_amd64.deb`]: ["linux-x86_64-deb"],
  [`${name}-${version}-1.x86_64.rpm`]: ["linux-x86_64-rpm"],
};

const baseUrl = `https://github.com/${repo}/releases/download/${tag}/`;
const platforms: Record<string, PlatformEntry> = {};
const missing: string[] = [];
for (const [file, keys] of Object.entries(BUNDLES)) {
  const sigPath = join(sigDir, `${file}.sig`);
  if (!existsSync(sigPath)) {
    missing.push(`${file}.sig`);
    continue;
  }
  const signature = readFileSync(sigPath, "utf8").trim();
  for (const key of keys) platforms[key] = { signature, url: baseUrl + file };
}
// A partial manifest is worse than none: platforms left out would never be
// offered this update, with nothing on screen to say so.
if (missing.length > 0) fail(`missing signatures: ${missing.join(", ")}`);

const manifest = {
  version,
  notes: process.env.RELEASE_BODY ?? "",
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${outFile}: ${Object.keys(platforms).length} platform entries`);

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) fail(`${key} is not set`);
  return value;
}

function fail(message: string): never {
  console.error(`gen-updater-json: ${message}`);
  process.exit(1);
}
