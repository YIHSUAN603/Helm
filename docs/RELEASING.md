# Releasing

Releases are built by `.github/workflows/release.yml`: pushing a `v*` tag
packages the app for Windows (.msi/.exe), macOS (.dmg, arm64 + x64), and
Linux (.deb/.AppImage/.rpm), and publishes them as a **draft** GitHub Release.

## Checklist

1. Bump the version in all three places, keeping them identical:
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `[package] version`
2. Refresh lockfiles:
   - `npm install` (updates `package-lock.json`)
   - `cargo check` inside `src-tauri/` (updates `Cargo.lock`)
3. Commit and push, e.g. `git commit -am "chore: release v0.2.0"`, then wait
   for CI to go green.
4. Tag and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. When the Release workflow finishes (~15–25 min; macOS jobs are slowest),
   review the draft release on GitHub, edit the notes, and publish.

## Notes

- Artifacts are **unsigned**: macOS builds are not notarized (users must
  right-click → Open, or run `xattr -cr`), and Windows installers will show a
  SmartScreen warning. Code signing is future work.
- Draft releases are invisible to the public, so a test tag is safe to push;
  delete the draft and the tag afterwards
  (`git push origin :refs/tags/v0.1.0`).
- Future options (not needed yet): a `scripts/bump-version.mjs` to rewrite all
  three versions at once, or release-please/changesets for automated bumps.
