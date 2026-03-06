export const AI_BRAND_COLORS = {
  chatgpt: '#000000',
  claude: '#D97757',
  gemini: '#3186FF',
  grok: '#111111',
} as const

export const AI_GROUPS = {
  'US-AI': ['claude', 'chatgpt', 'gemini', 'grok'] as const,
}

export const AI_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  grok: 'Grok',
}

export const AI_TYPES = [
  'claude',
  'chatgpt',
  'gemini',
  'grok',
] as const

export const AI_URLS: Record<string, string> = {
  claude: 'https://claude.ai',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  grok: 'https://grok.com',
}

export const EXTENSION_ID_KEY = 'g4-ai-extension-id'
export const PAIRING_TOKEN_KEY = 'g4-ai-pairing-token'
export const LEGACY_EXTENSION_ID_KEY = 'crosswise-extension-id'
export const LEGACY_PAIRING_TOKEN_KEY = 'crosswise-pairing-token'
