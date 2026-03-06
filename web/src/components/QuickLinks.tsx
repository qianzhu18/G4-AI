import { useState } from 'react'
import { AiLogo } from './AiLogo'
import { AI_GROUPS, AI_URLS, AI_DISPLAY_NAMES, AI_BRAND_COLORS } from '../lib/constants'
import type { AiType, AiStatuses, AiTabCounts } from '../lib/types'

interface QuickLinksProps {
  statuses: AiStatuses
  tabCounts: AiTabCounts
}

export function QuickLinks({ statuses, tabCounts }: QuickLinksProps) {
  const [copiedAi, setCopiedAi] = useState<string | null>(null)

  const handleOpen = (ai: string, e: React.MouseEvent) => {
    if (statuses[ai as AiType]) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Let default link behavior handle Ctrl/Cmd+click for background tab
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
      return
    }
    // Regular click: prevent default and open in new tab
    e.preventDefault()
    window.open(AI_URLS[ai], '_blank', 'noopener')
  }

  const handleCopy = async (ai: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    await navigator.clipboard.writeText(AI_URLS[ai])
    setCopiedAi(ai)
    setTimeout(() => setCopiedAi(null), 1500)
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          快速打开
        </h3>
        <span className="text-[10px] text-slate-400" title="Ctrl/Cmd+点击可在后台打开">
          Ctrl+点击后台打开
        </span>
      </div>

      <section className="mb-4">
        <h4 className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2 px-1">
          US-AI
        </h4>
        <div className="space-y-1">
          {AI_GROUPS['US-AI'].map((ai) => (
            <QuickLinkItem
              key={ai}
              aiType={ai}
              connected={statuses[ai]}
              tabCount={tabCounts[ai]}
              onOpen={(e) => handleOpen(ai, e)}
              onCopy={(e) => handleCopy(ai, e)}
              copied={copiedAi === ai}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

interface QuickLinkItemProps {
  aiType: AiType
  connected: boolean
  tabCount: number
  onOpen: (e: React.MouseEvent) => void
  onCopy: (e: React.MouseEvent) => void
  copied: boolean
}

function QuickLinkItem({ aiType, connected, tabCount, onOpen, onCopy, copied }: QuickLinkItemProps) {
  const brandColor = AI_BRAND_COLORS[aiType]
  const displayName = AI_DISPLAY_NAMES[aiType] || aiType
  const disabled = connected

  if (disabled) {
    return (
      <div
        className={`group w-full flex items-center gap-2 px-2 py-2 rounded-md transition-all cursor-not-allowed opacity-60`}
        style={{
          backgroundColor: `${brandColor}10`,
          border: `1px solid ${brandColor}25`,
        }}
        title="已连接，无需再打开"
      >
        <AiLogo aiType={aiType} size={18} />
        <span
          className="text-sm font-medium flex-1 text-left"
          style={{ color: brandColor }}
        >
          {displayName}
        </span>
        <span className="text-[10px] text-green-600 font-medium">已连接</span>
        {tabCount > 1 && (
          <span className="text-[10px] text-amber-600 font-medium">{tabCount}个</span>
        )}
        <button
          onClick={onCopy}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/50 transition-opacity"
          title="复制链接"
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    )
  }

  return (
    <a
      href={AI_URLS[aiType]}
      onClick={onOpen}
      target="_blank"
      rel="noopener noreferrer"
      className={`group w-full flex items-center gap-2 px-2 py-2 rounded-md transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]`}
      style={{
        backgroundColor: `${brandColor}10`,
        border: `1px solid ${brandColor}25`,
      }}
      title={`打开 ${displayName}`}
    >
      <AiLogo aiType={aiType} size={18} />
      <span
        className="text-sm font-medium flex-1 text-left"
        style={{ color: brandColor }}
      >
        {displayName}
      </span>
      {tabCount > 1 && (
        <span className="text-[10px] text-amber-600 font-medium">{tabCount}个</span>
      )}
      <button
        onClick={onCopy}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/50 transition-opacity"
        title="复制链接"
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
      <svg
        className="w-3.5 h-3.5 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  )
}
