import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const extensionPath = process.argv[2]

if (!extensionPath) {
  console.error('Usage: node scripts/test-discussion-mode.mjs /path/to/extension-root')
  process.exit(1)
}

const resolvedExtensionPath = path.resolve(extensionPath)
const manifestPath = path.join(resolvedExtensionPath, 'manifest.json')

await fs.access(manifestPath).catch(() => {
  console.error(`manifest.json not found in: ${resolvedExtensionPath}`)
  process.exit(1)
})

const artifactRoot = path.join(process.cwd(), 'test-artifacts', 'discussion-mode')
await fs.rm(artifactRoot, { recursive: true, force: true })
await fs.mkdir(artifactRoot, { recursive: true })

const userDataDir = path.join(artifactRoot, 'profile')
await fs.mkdir(userDataDir, { recursive: true })

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  viewport: { width: 1600, height: 1200 },
  args: [
    `--disable-extensions-except=${resolvedExtensionPath}`,
    `--load-extension=${resolvedExtensionPath}`,
  ],
})

let serviceWorker = context.serviceWorkers()[0]
if (!serviceWorker) {
  serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 })
}

const extensionId = new URL(serviceWorker.url()).host
const page = await context.newPage()
await page.goto(`chrome-extension://${extensionId}/web/index.html?fixture=discussion`, {
  waitUntil: 'domcontentloaded',
})

const participants = ['claude', 'chatgpt', 'gemini', 'grok']

for (const ai of participants) {
  await page.getByTestId(`discussion-participant-${ai}`).click()
}

await page.getByTestId('discussion-topic-input').fill('测试讨论主题：验证讨论模式能否把上一轮信息传入下一轮，并让四张卡片铺满主要工作区。')
await page.getByTestId('discussion-start-button').click()

await page.getByTestId('discussion-grid').waitFor()
await page.waitForTimeout(4200)

const roundOneTexts = {}
for (const ai of participants) {
  roundOneTexts[ai] = await page.getByTestId(`discussion-card-${ai}`).innerText()
}

await page.screenshot({
  path: path.join(artifactRoot, 'discussion-round-1.png'),
  fullPage: true,
})

await page.getByTestId('discussion-next-round').click()
await page.waitForTimeout(4200)

const roundTwoTexts = {}
for (const ai of participants) {
  roundTwoTexts[ai] = await page.getByTestId(`discussion-card-${ai}`).innerText()
}

const gridBox = await page.getByTestId('discussion-grid').boundingBox()
const cardBoxes = []
for (const ai of participants) {
  const box = await page.getByTestId(`discussion-card-${ai}`).boundingBox()
  if (box) {
    cardBoxes.push({ ai, ...box })
  }
}

await page.screenshot({
  path: path.join(artifactRoot, 'discussion-round-2.png'),
  fullPage: true,
})

const totalCardArea = cardBoxes.reduce((sum, box) => sum + (box.width * box.height), 0)
const gridArea = gridBox ? gridBox.width * gridBox.height : 0
const fillRatio = gridArea > 0 ? totalCardArea / gridArea : 0
const minCardHeight = cardBoxes.length > 0 ? Math.min(...cardBoxes.map(box => box.height)) : 0

const allCardsHaveFixtureReply = Object.values(roundOneTexts).every(text => text.includes('讨论测试回复'))
const allCardsShowRoundContext = Object.values(roundTwoTexts).every(text => text.includes('上一轮观点'))

const result = {
  extensionId,
  fixtureUrl: page.url(),
  roundOne: {
    allCardsHaveFixtureReply,
    texts: roundOneTexts,
  },
  roundTwo: {
    allCardsShowRoundContext,
    texts: roundTwoTexts,
  },
  layout: {
    fillRatio,
    minCardHeight,
    gridBox,
    cardBoxes,
  },
  artifacts: {
    roundOneScreenshot: path.join(artifactRoot, 'discussion-round-1.png'),
    roundTwoScreenshot: path.join(artifactRoot, 'discussion-round-2.png'),
  },
}

console.log(JSON.stringify(result, null, 2))

await context.close()
