import { clsx } from 'clsx'
import { AiLogo } from './AiLogo'
import { AI_GROUPS, AI_DISPLAY_NAMES } from '../lib/constants'
import type { AiType, AiStatuses } from '../lib/types'

interface SidebarProps {
  statuses: AiStatuses
  selectedAis: Set<AiType>
  onToggleAi: (ai: AiType) => void
  isConnected: boolean
  isPaired: boolean
  onNewConversation?: () => void
}

export function Sidebar({ statuses, selectedAis, onToggleAi, isConnected, isPaired, onNewConversation }: SidebarProps) {
  return (
    <aside className="w-56 border-r border-cyan-100 bg-white/85 backdrop-blur flex flex-col shadow-[18px_0_42px_rgba(15,23,42,0.05)]">
      <div className="p-4 border-b border-cyan-100">
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              'w-2 h-2 rounded-full',
              isPaired ? 'bg-green-500' : isConnected ? 'bg-yellow-500' : 'bg-slate-300'
            )}
          />
          <span className="text-sm text-slate-600">
            {isPaired ? '已配对' : isConnected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      {onNewConversation && (
        <div className="p-3 border-b border-cyan-100">
          <button
            onClick={onNewConversation}
            className="w-full px-3 py-2 bg-gradient-to-r from-cyan-900 to-teal-700 text-white rounded-xl font-medium hover:from-cyan-800 hover:to-teal-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新对话
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <section className="mb-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            US-AI
          </h3>
          <div className="space-y-1">
            {AI_GROUPS['US-AI'].map((ai) => (
              <SidebarItem
                key={ai}
                aiType={ai}
                connected={statuses[ai]}
                selected={selectedAis.has(ai)}
                onToggle={() => onToggleAi(ai)}
              />
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}

interface SidebarItemProps {
  aiType: AiType
  connected: boolean
  selected: boolean
  onToggle: () => void
}

function SidebarItem({ aiType, connected, selected, onToggle }: SidebarItemProps) {
  const displayName = AI_DISPLAY_NAMES[aiType] || aiType

  return (
    <label
      className={clsx(
        'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
        connected
          ? 'cursor-pointer hover:bg-cyan-50'
          : 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={!connected}
        className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
      />
      <AiLogo aiType={aiType} size={18} />
      <span className="text-sm text-slate-700 flex-1">{displayName}</span>
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-green-500' : 'bg-slate-300'
        )}
      />
    </label>
  )
}
