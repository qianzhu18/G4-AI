import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const extensionPath = process.argv[2]

if (!extensionPath) {
  console.error('Usage: node scripts/test-release-install.mjs /path/to/unpacked-extension')
  process.exit(1)
}

const resolvedExtensionPath = path.resolve(extensionPath)
const stats = await fs.stat(resolvedExtensionPath).catch(() => null)

if (!stats?.isDirectory()) {
  console.error(`Extension directory not found: ${resolvedExtensionPath}`)
  process.exit(1)
}

const manifestPath = path.join(resolvedExtensionPath, 'manifest.json')
await fs.access(manifestPath).catch(() => {
  console.error(`manifest.json not found in: ${resolvedExtensionPath}`)
  process.exit(1)
})

const artifactRoot = path.join(process.cwd(), 'test-artifacts', 'release-install')
await fs.rm(artifactRoot, { recursive: true, force: true })
await fs.mkdir(artifactRoot, { recursive: true })

const userDataDir = path.join(artifactRoot, 'profile')
await fs.mkdir(userDataDir, { recursive: true })

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  args: [
    `--disable-extensions-except=${resolvedExtensionPath}`,
    `--load-extension=${resolvedExtensionPath}`,
  ],
})

let serviceWorker = context.serviceWorkers()[0]
if (!serviceWorker) {
  serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 })
}

const serviceWorkerUrl = serviceWorker.url()
const extensionId = new URL(serviceWorkerUrl).host

const sidePanelPage = await context.newPage()
await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel/panel.html`, {
  waitUntil: 'domcontentloaded',
})
await sidePanelPage.waitForSelector('h1')
await sidePanelPage.screenshot({
  path: path.join(artifactRoot, 'sidepanel.png'),
  fullPage: true,
})

const dashboardPage = await context.newPage()
await dashboardPage.goto(`chrome-extension://${extensionId}/web/index.html`, {
  waitUntil: 'domcontentloaded',
})
await dashboardPage.waitForSelector('h1')
await dashboardPage.screenshot({
  path: path.join(artifactRoot, 'dashboard.png'),
  fullPage: true,
})

const result = {
  extensionPath: resolvedExtensionPath,
  extensionId,
  serviceWorkerUrl,
  sidePanelUrl: sidePanelPage.url(),
  dashboardUrl: dashboardPage.url(),
  artifacts: {
    sidePanelScreenshot: path.join(artifactRoot, 'sidepanel.png'),
    dashboardScreenshot: path.join(artifactRoot, 'dashboard.png'),
  },
}

console.log(JSON.stringify(result, null, 2))

await context.close()
