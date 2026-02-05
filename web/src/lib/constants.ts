export const AI_BRAND_COLORS = {
  chatgpt: '#000000',
  claude: '#D97757',
  gemini: '#3186FF',
  grok: '#111111',
  chatglm: '#4268FA',
  kimi: '#000000',
  deepseek: '#4D6BFE',
  doubao: '#1E37FC',
} as const

export const AI_GROUPS = {
  'US-AI': ['claude', 'chatgpt', 'gemini', 'grok'] as const,
  'CN-AI': ['deepseek', 'kimi', 'doubao', 'chatglm'] as const,
}

export const AI_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  grok: 'Grok',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  doubao: 'Doubao',
  chatglm: 'ChatGLM',
}

export const AI_TYPES = [
  'claude',
  'chatgpt',
  'gemini',
  'grok',
  'deepseek',
  'kimi',
  'doubao',
  'chatglm',
] as const

export const AI_URLS: Record<string, string> = {
  claude: 'https://claude.ai',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://gemini.google.com',
  grok: 'https://grok.com',
  deepseek: 'https://chat.deepseek.com',
  kimi: 'https://kimi.com',
  doubao: 'https://www.doubao.com/chat/',
  chatglm: 'https://chatglm.cn',
}

export const EXTENSION_ID_KEY = 'ai-roundtable-extension-id'
export const PAIRING_TOKEN_KEY = 'ai-roundtable-pairing-token'
