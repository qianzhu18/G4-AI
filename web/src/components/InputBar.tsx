import { useState, useCallback, useRef, useEffect } from 'react'
import { AI_DISPLAY_NAMES, AI_TYPES } from '../lib/constants'
import { normalizeAiName } from '../lib/utils'
import type { AiType, AiStatuses } from '../lib/types'

interface InputBarProps {
  onSend: (message: string, mentionedAis?: AiType[]) => void
  onMutual: (prompt?: string) => void
  onCross: (targets: AiType[], source: AiType, prompt: string) => void
  onNewConversation: () => void
  onRefresh?: () => void
  selectedAis: Set<AiType>
  statuses: AiStatuses
  disabled?: boolean
}

export function InputBar({
  onSend,
  onMutual,
  onCross,
  onNewConversation,
  onRefresh,
  selectedAis,
  statuses,
  disabled = false,
}: InputBarProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSend = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return

    if (trimmed.startsWith('/mutual')) {
      const prompt = trimmed.replace(/^\/mutual\s*/, '').trim()
      onMutual(prompt || undefined)
      setMessage('')
      return
    }

    // Flexible cross command regex: Allow spaces, optional prompt
    const crossMatch = trimmed.match(/^\/cross\s+(@\w+(?:\s+@\w+)*)\s*<-\s*(@\w+)\s*(.*)$/i)
    if (crossMatch) {
      const [, targetsStr, sourceStr, prompt] = crossMatch
      const targetMentions = targetsStr.match(/@(\w+)/gi) || []
      const targets = targetMentions
        .map(m => normalizeAiName(m.slice(1)))
        .filter((ai): ai is AiType => AI_TYPES.includes(ai as AiType))

      const sourceMatch = sourceStr.match(/@(\w+)/)
      const source = sourceMatch ? normalizeAiName(sourceMatch[1]) as AiType : null

      if (targets.length > 0 && source && AI_TYPES.includes(source)) {
        onCross(targets, source, prompt ? prompt.trim() : '')
        setMessage('')
        return
      }
    }

    // Normal message parsing
    // 1. Extract TARGETS from the START of the message
    // e.g. "@Claude @Gemini help me" -> targets=[claude, gemini], cleanMsg="help me"
    const startMentionsRegex = /^(@\w+\s*)+/
    const startMatch = trimmed.match(startMentionsRegex)

    let targets: AiType[] = []
    let cleanMessage = trimmed

    if (startMatch) {
      const mentions = startMatch[0].match(/@(\w+)/gi) || []
      targets = mentions
        .map(m => normalizeAiName(m.slice(1)))
        .filter((ai): ai is AiType => AI_TYPES.includes(ai as AiType))

      // Remove the start mentions from the message
      cleanMessage = trimmed.slice(startMatch[0].length).trim()
    }

    // If no explicit targets at start, send to selected AIs (handled by parent if targets undefined/empty)
    // But here we want to pass specific targets if found.
    // If targets found, we pass them.
    // If NOT found, we pass undefined, and App.tsx uses selectedAis.

    onSend(cleanMessage, targets.length > 0 ? targets : undefined)
    setMessage('')
  }, [message, onSend, onMutual, onCross])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const insertText = useCallback((text: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = message.slice(0, start)
    const after = message.slice(end)

    const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')
    const insert = (needsSpace ? ' ' : '') + text + ' '

    setMessage(before + insert + after)

    setTimeout(() => {
      textarea.focus()
      const newPos = start + insert.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }, [message])

  const connectedCount = Array.from(selectedAis).filter(ai => statuses[ai]).length
  const connectedAis = AI_TYPES.filter(ai => statuses[ai])

  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border-b border-slate-200 flex-wrap">
          <button
            onClick={() => insertText('/mutual')}
            className="px-3 py-1.5 text-base font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 transition-colors"
          >
            /mutual
          </button>
          <button
            onClick={() => insertText('/cross')}
            className="px-3 py-1.5 text-base font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 transition-colors"
          >
            /cross
          </button>
          <button
            onClick={() => insertText('<-')}
            className="px-3 py-1.5 text-base font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 transition-colors"
          >
            &larr;
          </button>
          <span className="text-slate-300 mx-1">|</span>
          {connectedAis.map(ai => (
            <button
              key={ai}
              onClick={() => insertText(`@${AI_DISPLAY_NAMES[ai]}`)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-200 transition-colors"
            >
              @<img src={`./icons/${ai}-color.svg`} alt={ai} className="w-4 h-4 object-contain" />
              {AI_DISPLAY_NAMES[ai]}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? '请先完成配对...' : '输入消息... (Enter 发送, Shift+Enter 换行)'}
          disabled={disabled}
          rows={3}
          className="w-full px-3 py-3 text-[15px] resize-none focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-sm text-slate-500">
          已选择 {connectedCount} 个可用 AI
        </span>
        <div className="flex gap-2">
          <button
            onClick={onNewConversation}
            disabled={disabled || connectedCount === 0}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            新对话
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={disabled || connectedCount === 0}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="重新获取所有选中 AI 的最新回答"
            >
              刷新对话
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={disabled || !message.trim() || connectedCount === 0}
            className="px-5 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

