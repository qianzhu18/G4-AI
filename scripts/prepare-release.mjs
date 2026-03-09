import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const extensionRoot = path.join(repoRoot, 'AI-CrossTalk')
const manifestPath = path.join(extensionRoot, 'manifest.json')
const releaseRoot = path.join(repoRoot, 'release')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const version = manifest.version
const packageName = `g4-ai-extension-v${version}`
const packageDir = path.join(releaseRoot, packageName)

await rm(releaseRoot, { recursive: true, force: true })
await mkdir(releaseRoot, { recursive: true })

await cp(extensionRoot, packageDir, {
  recursive: true,
  filter: (source) => {
    const relativePath = path.relative(extensionRoot, source)

    if (!relativePath) {
      return true
    }

    const segments = relativePath.split(path.sep)
    if (segments[0] === '.claude') {
      return false
    }

    return !segments.includes('.DS_Store')
  },
})

const installGuide = [
  'G4 AI Extension Install',
  '',
  '1. Open chrome://extensions/ in Chrome or Edge.',
  '2. Turn on Developer mode.',
  '3. Click "Load unpacked".',
  `4. Select this folder: ${packageName}`,
  '',
  'Notes:',
  '- Do not select the parent release directory.',
  '- Open and log in to Claude / ChatGPT / Gemini / Grok first.',
  '- Then click the G4 AI extension icon to open the side panel.',
  '',
].join('\n')

await writeFile(path.join(packageDir, 'INSTALL.txt'), installGuide, 'utf8')

console.log(`Prepared release folder: ${path.relative(repoRoot, packageDir)}`)
console.log(`Version: ${version}`)
console.log(`Package name: ${packageName}`)
