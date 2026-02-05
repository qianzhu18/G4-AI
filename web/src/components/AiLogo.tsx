import type { AiType } from '../lib/types'

interface AiLogoProps {
  aiType: AiType
  size?: number
  className?: string
}

const AI_ICON_MAP: Record<AiType, string> = {
  claude: './icons/claude-color.svg',
  chatgpt: './icons/chatgpt-color.svg',
  gemini: './icons/gemini-color.svg',
  grok: './icons/grok-color.svg',
  deepseek: './icons/deepseek-color.svg',
  kimi: './icons/kimi-color.svg',
  doubao: './icons/doubao-color.svg',
  chatglm: './icons/chatglm-color.svg',
}

export function AiLogo({ aiType, size = 20, className = '' }: AiLogoProps) {
  const iconPath = AI_ICON_MAP[aiType]

  return (
    <img
      src={iconPath}
      alt={aiType}
      className={`object-contain ${className}`}
      style={{
        width: size,
        height: size,
      }}
    />
  )
}
