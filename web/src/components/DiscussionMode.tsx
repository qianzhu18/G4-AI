import { useState, useCallback } from 'react'
import { clsx } from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AiLogo } from './AiLogo'
import { AI_DISPLAY_NAMES, AI_TYPES, AI_BRAND_COLORS } from '../lib/constants'
import type { AiType, AiStatuses, DiscussionState } from '../lib/types'

interface DiscussionModeProps {
  statuses: AiStatuses
  isPaired: boolean
  sendMessage: (aiType: AiType, message: string) => Promise<{ success: boolean; error?: string }>
  getResponse: (aiType: AiType) => Promise<string | null>
  addLog: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void
  onResponseCaptured?: (aiType: AiType, content: string) => void
}

const initialState: DiscussionState = {
  active: false,
  topic: '',
  participants: null,
  currentRound: 0,
  history: [],
  pendingResponses: new Set(),
  roundType: null,
  responses: AI_TYPES.reduce((acc, ai) => ({ ...acc, [ai]: '' }), {}) as Record<AiType, string>,
}

const RESPONSE_SETTLE_MS = 3500
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function DiscussionMode({
  statuses,
  isPaired,
  sendMessage,
  getResponse,
  addLog,
  onResponseCaptured,
}: DiscussionModeProps) {
  const [state, setState] = useState<DiscussionState>(initialState)
  const [topic, setTopic] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<Set<AiType>>(new Set())
  const [interjectMessage, setInterjectMessage] = useState('')

  const allAis = [...AI_TYPES]
  const connectedAis = allAis.filter(ai => statuses[ai])

  const collectResponses = useCallback(async (participants: AiType[]): Promise<Partial<Record<AiType, string>>> => {
    const fetched = await Promise.all(
      participants.map(async (ai) => {
        try {
          return { ai, response: await getResponse(ai) }
        } catch {
          return { ai, response: null }
        }
      })
    )

    const updates = fetched.filter(
      (item): item is { ai: AiType; response: string } => Boolean(item.response)
    )

    if (updates.length > 0) {
      setState(prev => {
        const merged = { ...prev.responses }
        for (const { ai, response } of updates) {
          merged[ai] = response
        }
        return { ...prev, responses: merged }
      })

      for (const { ai, response } of updates) {
        onResponseCaptured?.(ai, response)
      }
    }

    return updates.reduce((acc, { ai, response }) => {
      acc[ai] = response
      return acc
    }, {} as Partial<Record<AiType, string>>)
  }, [getResponse, onResponseCaptured])

  const toggleParticipant = useCallback((ai: AiType) => {
    setSelectedParticipants(prev => {
      const next = new Set(prev)
      if (next.has(ai)) {
        next.delete(ai)
      } else if (next.size < 4) {
        next.add(ai)
      }
      return next
    })
  }, [])

  const startDiscussion = useCallback(async () => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      return
    }

    if (selectedParticipants.size < 2 || selectedParticipants.size > 4) {
      addLog('请选择 2-4 位参与者', 'error')
      return
    }

    if (!topic.trim()) {
      addLog('请输入讨论主题', 'error')
      return
    }

    const participants = Array.from(selectedParticipants)

    setState({
      active: true,
      topic: topic.trim(),
      participants,
      currentRound: 1,
      history: [],
      pendingResponses: new Set(participants),
      roundType: 'initial',
      responses: AI_TYPES.reduce((acc, ai) => ({ ...acc, [ai]: '' }), {}) as Record<AiType, string>,
    })

    addLog(`开始讨论: ${participants.map(p => AI_DISPLAY_NAMES[p]).join(' vs ')}`, 'info')

    const initialPrompt = `请就以下主题发表你的观点：\n\n${topic.trim()}\n\n要求：\n1. 清晰阐述你的立场\n2. 提供支持你观点的论据\n3. 保持开放态度，准备与对方进行深入讨论`

    await Promise.allSettled(participants.map(ai => sendMessage(ai, initialPrompt)))

    // Wait for initial responses and capture them
    await sleep(RESPONSE_SETTLE_MS)
    await collectResponses(participants)
  }, [isPaired, selectedParticipants, topic, sendMessage, addLog, collectResponses])

  const handleTopicKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      startDiscussion()
    }
  }, [startDiscussion])

  const nextRound = useCallback(async () => {
    if (!state.active || !state.participants || state.participants.length < 2) return

    const newRound = state.currentRound + 1

    setState(prev => ({
      ...prev,
      currentRound: newRound,
      pendingResponses: new Set(prev.participants!),
      roundType: 'cross-eval',
    }))

    addLog(`进入第 ${newRound} 轮`, 'info')

    const responses = await collectResponses(state.participants)
    const roundTasks: Promise<unknown>[] = []

    // For 2 participants: cross-evaluate each other
    if (state.participants.length === 2) {
      const [ai1, ai2] = state.participants
      if (responses[ai1]) {
        const evalPrompt = `【${AI_DISPLAY_NAMES[ai1]} 的观点】\n${responses[ai1]}\n\n请评价上述观点，指出你认同和不认同的地方，并进一步阐述你的立场。`
        roundTasks.push(sendMessage(ai2, evalPrompt))
      }
      if (responses[ai2]) {
        const evalPrompt = `【${AI_DISPLAY_NAMES[ai2]} 的观点】\n${responses[ai2]}\n\n请评价上述观点，指出你认同和不认同的地方，并进一步阐述你的立场。`
        roundTasks.push(sendMessage(ai1, evalPrompt))
      }
    } else {
      // For 3-4 participants: cross-evaluate with others
      for (let i = 0; i < state.participants.length; i++) {
        for (let j = i + 1; j < state.participants.length; j++) {
          const ai1 = state.participants[i]
          const ai2 = state.participants[j]
          if (responses[ai1]) {
            const evalPrompt = `【${AI_DISPLAY_NAMES[ai1]} 的观点】\n${responses[ai1]}\n\n请评价上述观点，并阐述你的立场。`
            roundTasks.push(sendMessage(ai2, evalPrompt))
          }
          if (responses[ai2]) {
            const evalPrompt = `【${AI_DISPLAY_NAMES[ai2]} 的观点】\n${responses[ai2]}\n\n请评价上述观点，并阐述你的立场。`
            roundTasks.push(sendMessage(ai1, evalPrompt))
          }
        }
      }
    }

    await Promise.allSettled(roundTasks)

    // Wait for cross-evaluation responses and capture them
    await sleep(RESPONSE_SETTLE_MS)
    await collectResponses(state.participants)
  }, [state, sendMessage, addLog, collectResponses])

  const sendInterject = useCallback(async () => {
    if (!state.active || !state.participants || !interjectMessage.trim()) return

    addLog('发送插话给所有参与者', 'info')

    await Promise.allSettled(
      state.participants.map(ai => sendMessage(ai, interjectMessage.trim()))
    )

    setInterjectMessage('')

    // Wait for interjection responses and capture them
    await sleep(RESPONSE_SETTLE_MS)
    await collectResponses(state.participants)
  }, [state, interjectMessage, sendMessage, addLog, collectResponses])

  const handleInterjectKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      sendInterject()
    }
  }, [sendInterject])

  const generateSummary = useCallback(async () => {
    if (!state.active || !state.participants || state.participants.length < 2) return

    const responses = await collectResponses(state.participants)

    // Find a third-party AI (connected but not participating)
    const participantSet = new Set(state.participants)
    const thirdPartyAis = allAis.filter(ai => statuses[ai] && !participantSet.has(ai))

    // Select summarizer: prefer third-party, fallback to first participant
    let summarizer: AiType
    let useThirdParty = true

    if (thirdPartyAis.length > 0) {
      // Randomly select a third-party AI for fairness
      summarizer = thirdPartyAis[Math.floor(Math.random() * thirdPartyAis.length)]
      addLog(`使用第三方 ${AI_DISPLAY_NAMES[summarizer]} 生成总结`, 'info')
    } else {
      // Fallback: use first participant
      summarizer = state.participants[0]
      useThirdParty = false
      addLog(`使用参与者 ${AI_DISPLAY_NAMES[summarizer]} 生成总结（可能存在偏见）`, 'warning')
    }

    // Build summary prompt with all participants
    let summaryPrompt = useThirdParty
      ? `你作为第三方观察者，请客观总结以下 AI 讨论的观点：\n\n主题：${state.topic}\n\n`
      : `请总结以下讨论（包括你自己的观点）：\n\n主题：${state.topic}\n\n`

    for (const ai of state.participants) {
      summaryPrompt += `【${AI_DISPLAY_NAMES[ai]} 的观点】\n${responses[ai] || '无'}\n\n`
    }

    if (useThirdParty) {
      summaryPrompt += `请提供：\n1. 各方的主要观点\n2. 共识点\n3. 分歧点\n4. 你的综合评价（作为客观的第三方）`
    } else {
      summaryPrompt += `请提供：\n1. 各方的主要观点\n2. 共识点\n3. 分歧点\n4. 综合评价（注：由于你是参与者，请尽量保持客观）`
    }

    addLog('生成讨论总结', 'info')
    await sendMessage(summarizer, summaryPrompt)
  }, [state, sendMessage, addLog, statuses, allAis, collectResponses])

  const refreshResponses = useCallback(async () => {
    if (!state.active || !state.participants) return

    addLog('刷新回答...', 'info')

    await collectResponses(state.participants)

    addLog('回答已刷新', 'success')
  }, [state, addLog, collectResponses])

  const endDiscussion = useCallback(() => {
    setState(initialState)
    setTopic('')
    setSelectedParticipants(new Set())
    addLog('讨论已结束', 'info')
  }, [addLog])

  if (!state.active) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">开始讨论</h2>
            <p className="text-sm text-slate-500">选择 2-4 位 AI 参与者，让他们就同一主题进行深度讨论。</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              选择参与者（2-4 位）
            </label>
            <div className="grid grid-cols-4 gap-2">
              {connectedAis.map(ai => (
                <button
                  key={ai}
                  onClick={() => toggleParticipant(ai)}
                  disabled={!selectedParticipants.has(ai) && selectedParticipants.size >= 4}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                    selectedParticipants.has(ai)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <AiLogo aiType={ai} size={18} />
                  <span className="text-sm">{AI_DISPLAY_NAMES[ai]}</span>
                </button>
              ))}
            </div>
            {connectedAis.length < 2 && (
              <p className="mt-2 text-sm text-red-500">需要至少 2 个已连接的 AI</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              讨论主题
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={handleTopicKeyDown}
              placeholder="例如：人工智能会取代人类的工作吗？ (Enter 开始讨论, Shift+Enter 换行)"
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>

          <button
            onClick={startDiscussion}
            disabled={!isPaired || selectedParticipants.size < 2 || selectedParticipants.size > 4 || !topic.trim()}
            className="w-full py-2.5 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            开始讨论
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 bg-slate-100 rounded text-sm font-medium text-slate-700">
              第 {state.currentRound} 轮
            </span>
            <span className="text-sm text-slate-500">
              {state.participants?.map(p => AI_DISPLAY_NAMES[p]).join(' vs ')}
            </span>
          </div>
          <button
            onClick={endDiscussion}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            结束
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600 line-clamp-2">{state.topic}</p>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {/* AI回答显示区域 - 使用网格布局，占满中间区域 */}
        <div className={clsx(
          "grid gap-4 h-full min-h-0",
          state.participants?.length === 2 ? "grid-cols-2" : "",
          state.participants?.length === 3 ? "grid-cols-3" : "",
          state.participants?.length === 4 ? "grid-cols-2 grid-rows-2" : ""
        )}>
          {state.participants?.map(ai => {
            const brandColor = AI_BRAND_COLORS[ai]
            const isFourParticipants = state.participants?.length === 4

            return (
              <div
                key={ai}
                className={clsx(
                  "flex flex-col rounded-lg bg-white border border-slate-200 overflow-hidden",
                  isFourParticipants ? "h-1/2" : "h-full"
                )}
                style={{
                  boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
                }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b border-slate-100"
                  style={{ borderBottomColor: `${brandColor}20` }}
                >
                  <AiLogo aiType={ai} size={20} />
                  <span className="font-medium text-slate-900 text-sm">{AI_DISPLAY_NAMES[ai]}</span>
                  <span className={clsx(
                    "ml-auto w-2 h-2 rounded-full",
                    statuses[ai] ? "bg-green-500" : "bg-slate-300"
                  )} />
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                  {!state.responses[ai] ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-400 italic">
                      {statuses[ai] ? '等待回答...' : '未连接'}
                    </div>
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {state.responses[ai]}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-3">
        {/* 插话区域 */}
        <div className="p-3 bg-slate-50 rounded-lg">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            插话（同步发送给所有参与者）
          </label>
          <textarea
            value={interjectMessage}
            onChange={(e) => setInterjectMessage(e.target.value)}
            onKeyDown={handleInterjectKeyDown}
            placeholder="输入你想对双方说的话... (Enter 发送, Shift+Enter 换行)"
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={sendInterject}
              disabled={!interjectMessage.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-slate-900 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              发送给所有参与者
            </button>
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex justify-center gap-3">
          <button
            onClick={nextRound}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            下一轮
          </button>
          <button
            onClick={refreshResponses}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="重新获取所有参与者的最新回答"
          >
            刷新回答
          </button>
          <button
            onClick={generateSummary}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            生成总结
          </button>
        </div>
      </div>
    </div>
  )
}
