# Release Install TODO

Date: 2026-03-09
Goal: verify the GitHub Release package can be downloaded by a non-developer, unpacked, and loaded into a browser without running build commands.
Target release: `v1.0.1`
Target asset: `g4-ai-extension-v1.0.1.zip`
Status: core path validated, release page wording fixed, one native UI stretch check still pending

## Scope

This test is intentionally stricter than a local developer check.

The release only counts as "usable" if a tester can:

1. Download the zip from GitHub Releases
2. Unpack it without reading source code
3. Identify the correct folder to import
4. Load it as an unpacked extension
5. Confirm the extension actually boots

## Environment

- Host OS: macOS
- Workspace: `/Users/mac/Downloads/code/CrossWise/AI-CrossTalk`
- GitHub repo under test: `qianzhu18/G4-AI`
- Browser automation target: virtual browser experiment via Playwright / Chromium-family browser

## Release Packaging Checklist

- [x] Confirm release `v1.0.1` exists on GitHub
- [x] Confirm asset `g4-ai-extension-v1.0.1.zip` exists on GitHub
- [x] Download the release asset from GitHub, not from local filesystem
- [x] Verify downloaded file name matches expected asset name
- [x] Unzip into a clean temp directory
- [x] Confirm unzipped top-level folder is obvious to a non-developer
- [x] Confirm `manifest.json` exists at the first level of the folder to import
- [x] Confirm package does not require `npm install`
- [x] Confirm package does not require `npm run build`
- [x] Confirm package contains `INSTALL.txt`

## Browser Loading Checklist

- [x] Launch a clean browser profile for testing
- [x] Load the unzipped extension directory into the browser
- [x] Confirm the extension is accepted by the browser
- [x] Confirm the extension service worker starts
- [x] Capture the resolved extension ID
- [x] Open at least one extension page via `chrome-extension://<id>/...`
- [x] Confirm the side panel page renders
- [x] Confirm the dashboard page renders

## Usability Checklist

- [x] Confirm the import path is not ambiguous
- [x] Confirm the package name is understandable to a non-developer
- [x] Confirm the release page wording is sufficient
- [x] Confirm README points users to Release assets instead of source code zips
- [x] Confirm fallback behavior is documented if a user downloads the wrong zip

## Stretch Checks

- [ ] Attempt a stricter simulation of `Load unpacked` flow in a browser UI
- [ ] Verify the downloaded package can be reopened after browser restart
- [x] Verify the release process is repeatable for the next version

## Execution Log

### 1. Release existence check

- Verified GitHub release `v1.0.1` exists.
- Verified asset `g4-ai-extension-v1.0.1.zip` exists on the release page.
- Verified release URL: `https://github.com/qianzhu18/G4-AI/releases/tag/v1.0.1`

### 2. Real download test

- Downloaded the asset from GitHub Releases with `gh release download`, not from the local `release/` directory.
- Downloaded file name matched expected asset name: `g4-ai-extension-v1.0.1.zip`
- Download location used for test: `/tmp/g4ai-release-test.ynjlnV/download`

### 3. Unpack inspection

- Unzipped into a clean temp directory.
- Observed one obvious top-level folder: `g4-ai-extension-v1.0.1`
- Confirmed the folder to import contains `manifest.json` at first level.
- Confirmed `INSTALL.txt` exists in the same folder.
- Confirmed the package structure is user-facing and does not expose source-build steps.

### 4. Virtual browser loading experiment

- Added repeatable script: `scripts/test-release-install.mjs`
- Ran the script against the unzipped release directory.
- Launched a clean persistent browser profile.
- Loaded the downloaded extension directory successfully.
- Observed service worker URL:
  - `chrome-extension://ackdagjcdgnaogealbmdmakekgaoadoj/background.js`
- Captured resolved extension ID:
  - `ackdagjcdgnaogealbmdmakekgaoadoj`
- Opened and rendered both:
  - `chrome-extension://ackdagjcdgnaogealbmdmakekgaoadoj/sidepanel/panel.html`
  - `chrome-extension://ackdagjcdgnaogealbmdmakekgaoadoj/web/index.html`
- Captured screenshots:
  - `test-artifacts/release-install/sidepanel.png`
  - `test-artifacts/release-install/dashboard.png`

### 5. Release-page wording check

- Initial auto-generated release notes were not sufficient for end users.
- The page originally did not explicitly tell users which asset to download.
- The page also did not warn users away from `Source code (zip)`.
- Fixed by generating explicit release notes and updating the live `v1.0.1` release body.

## Findings

### Confirmed passes

- The GitHub Release asset can be downloaded as a normal user artifact.
- The asset unzips into one clear import directory.
- The import directory contains `manifest.json` at the correct level.
- The downloaded package can be accepted by a Chromium-family browser as an unpacked extension.
- The extension service worker boots successfully.
- The side panel and dashboard pages both render from the downloaded package.

### Confirmed weakness found during test

- The first published `v1.0.1` release body was developer-oriented and too vague for a non-technical installer.
- That wording gap was real: a user could still choose the wrong download and blame the product flow.
- This was corrected by replacing the release body with install-focused notes.

### Remaining gap

- This test proved package validity and runtime boot, but did not fully automate the native `Load unpacked` directory-picker UI itself.
- That gap matters less than package validity, but it is still worth a later stretch pass.

## Retrospective

### What was wrong before testing

- We had a valid package and a valid workflow, but we had not yet proved the published asset worked when downloaded from GitHub.
- We also had not audited the release page itself from a normal user's perspective.
- The release existed, but the page copy still behaved like maintainer notes instead of install instructions.

### What changed because of this test

- We moved from "should work" to "downloaded asset actually boots in a browser."
- We added a repeatable browser validation script instead of relying on memory.
- We fixed the live release notes so the page now explicitly points to the correct zip.
- We now have screenshots and a written checklist for regression control.

### Why this matters

- The real product requirement is not "can developers build it."
- The real product requirement is "can a non-developer download it and get started without running commands."
- This test directly measured that requirement and improved both the package and the release page around it.

## Next Actions

- [x] Run GitHub Release download test
- [x] Run virtual browser loading experiment
- [x] Update this file with pass/fail for each checklist item
- [x] Decide whether additional packaging changes are needed
- [ ] Run one clean-machine manual test using the public release page only
- [ ] Attempt one stricter native `Load unpacked` UI simulation if needed
