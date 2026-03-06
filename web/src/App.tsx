import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Sidebar } from './components/Sidebar'
import { AiGrid } from './components/AiGrid'
import { InputBar } from './components/InputBar'
import { LogPanel } from './components/LogPanel'
import { PairingDialog } from './components/PairingDialog'
import { DiscussionMode } from './components/DiscussionMode'
import { QuickLinks } from './components/QuickLinks'
import { HelpDialog, HelpButton } from './components/HelpDialog'
import { useBridge } from './hooks/useBridge'
import { useAiStatus } from './hooks/useAiStatus'
import { AI_TYPES, AI_DISPLAY_NAMES } from './lib/constants'
import { normalizeAiName } from './lib/utils'
import type { LogEntry, AiType, Mode, Conversations, Message } from './lib/types'

const createEmptyConversations = (): Conversations => {
  const convs: Partial<Conversations> = {}
  for (const ai of AI_TYPES) {
    convs[ai] = []
  }
  return convs as Conversations
}

function App() {
  const [mode, setMode] = useState<Mode>('normal')
  const [selectedAis, setSelectedAis] = useState<Set<AiType>>(new Set(['claude', 'chatgpt']))
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [conversations, setConversations] = useState<Conversations>(createEmptyConversations())
  const conversationsRef = useRef(conversations)

  // 保持 ref 同步以便在回调中访问最新状态
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])
  const [showHelp, setShowHelp] = useState(false)
  const [showPairing, setShowPairing] = useState(false)
  const [showNewConversationConfirm, setShowNewConversationConfirm] = useState(false)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      message,
      type,
    }
    setLogs(prev => [entry, ...prev].slice(0, 100))
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const addUserMessage = useCallback((aiType: AiType, content: string) => {
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    setConversations(prev => ({
      ...prev,
      [aiType]: [...prev[aiType], msg],
    }))
  }, [])

  const clearConversations = useCallback((aiTypes: AiType[]) => {
    setConversations(prev => {
      const next = { ...prev }
      for (const ai of aiTypes) {
        next[ai] = []
      }
      return next
    })
  }, [])

  const {
    isConnected,
    isPaired,
    pairingCode,
    connect,
    disconnect,
    requestPairingCode,
    confirmPairing,
    sendMessage,
    getResponse,
    getStatus,
    newConversation,
  } = useBridge({
    onStatusUpdate: (aiType, connected) => {
      updateStatus(aiType, connected)
      addLog(`${aiType}: ${connected ? '已连接' : '已断开'}`, connected ? 'success' : 'info')
    },
    onResponseCaptured: (aiType, content) => {
      setConversations(prev => {
        const msgs = prev[aiType] || []
        const lastMsg = msgs[msgs.length - 1]

        // 原子检查：如果最后一条是 assistant 且在 60 秒内，则更新
        if (lastMsg?.role === 'assistant' &&
          (Date.now() - new Date(lastMsg.timestamp).getTime() < 60000)) {
          // 如果内容未变，不触发更新
          if (lastMsg.content === content) return prev

          const newMsgs = [...msgs]
          newMsgs[newMsgs.length - 1] = {
            ...lastMsg,
            content
          }
          return {
            ...prev,
            [aiType]: newMsgs
          }
        }

        // 否则添加新消息
        const newMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: new Date()
        }

        // 仅在添加新消息时记录日志（避免刷屏）
        // 注意：这里是副作用，但在 state updater 中执行副作用不推荐，但为了简便且仅是 UI log，尚可接受
        // 或者移到外部，但外部拿不到准确的判断结果
        // 暂且移除 "收到回复" 的高频日志，只在连接/发送时记录

        return {
          ...prev,
          [aiType]: [...msgs, newMsg]
        }
      })
    },
    onSendResult: (aiType, success, error) => {
      if (success) {
        addLog(`${aiType}: 消息已发送`, 'success')
      } else {
        addLog(`${aiType}: 发送失败 - ${error}`, 'error')
      }
    },
    onError: (error) => {
      addLog(`连接错误: ${error}`, 'error')
    },
  })

  const { statuses, tabCounts, updateStatus, replaceStatuses } = useAiStatus()

  useEffect(() => {
    if (!isPaired) {
      setShowPairing(true)
      return
    }

    let active = true

    const syncStatuses = async () => {
      const connected = isConnected || await connect()
      if (!connected) {
        return
      }
      const result = await getStatus()
      if (active && result) {
        replaceStatuses(result.statuses, result.tabCounts)
      }
    }

    syncStatuses()
    setShowPairing(false)

    return () => {
      active = false
    }
  }, [isPaired, isConnected, connect, getStatus, replaceStatuses])

  const handleSend = useCallback(async (message: string, mentionedAis?: AiType[]) => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      setShowPairing(true)
      return
    }

    let targets: AiType[] = []

    if (mentionedAis && mentionedAis.length > 0) {
      targets = mentionedAis.filter(ai => statuses[ai])
      if (targets.length === 0) {
        addLog('@ 提及的 AI 都未连接', 'error')
        return
      }
    } else {
      targets = Array.from(selectedAis).filter(ai => statuses[ai])
      if (targets.length === 0) {
        addLog('没有可用的目标 AI', 'error')
        return
      }
    }

    addLog(`发送消息到: ${targets.join(', ')}`, 'info')

    // Context Injection Logic
    let finalMessage = message

    // 1. Identify references (mentions that are NOT targets)
    // Actually simplicity: checking mentions in the message body that are valid AI names
    const allMentions = (message.match(/@(\w+)/gi) || [])
      .map(m => normalizeAiName(m.slice(1)))
      .filter(name => AI_TYPES.includes(name as AiType))

    const references = [...new Set(allMentions.filter(ai => !targets.includes(ai as AiType)))] as AiType[]

    if (references.length > 0) {
      addLog(`检测到引用: ${references.join(', ')}`, 'info')
      const contextParts: string[] = []

      for (const refAi of references) {
        const refMsgs = conversationsRef.current[refAi] || []
        // Find last assistant message
        const lastResponse = [...refMsgs].reverse().find(m => m.role === 'assistant')

        if (lastResponse) {
          contextParts.push(`【@${AI_DISPLAY_NAMES[refAi] || refAi} 的回复】\n${lastResponse.content}`)
        } else {
          // Optionally try to fetch via bridge if not in history? 
          // But conversations should be up to date.
          const resp = await getResponse(refAi)
          if (resp) {
            contextParts.push(`【@${AI_DISPLAY_NAMES[refAi] || refAi} 的回复】\n${resp}`)
          }
        }
      }

      if (contextParts.length > 0) {
        finalMessage = `${contextParts.join('\n\n')}\n\n${message}`
      }
    }

    for (const ai of targets) {
      addUserMessage(ai, message)
    }

    await Promise.allSettled(
      targets.map(ai => sendMessage(ai, finalMessage))
    )
  }, [isPaired, selectedAis, statuses, sendMessage, addLog, addUserMessage, getResponse])

  const handleMutual = useCallback(async (prompt?: string) => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      setShowPairing(true)
      return
    }

    const targets = Array.from(selectedAis).filter(ai => statuses[ai])
    if (targets.length < 2) {
      addLog('互评需要至少 2 个已连接的 AI', 'error')
      return
    }

    addLog(`开始互评: ${targets.join(' vs ')}`, 'info')

    const currentResponses: Record<string, string> = {}
    for (const ai of targets) {
      const resp = await getResponse(ai)
      if (resp) {
        currentResponses[ai] = resp
      }
    }

    for (const targetAi of targets) {
      const othersContent = targets
        .filter(ai => ai !== targetAi && currentResponses[ai])
        .map(ai => `【${ai.toUpperCase()} 的回复】\n${currentResponses[ai]}`)
        .join('\n\n')

      if (othersContent) {
        const mutualPrompt = prompt
          ? `请${prompt}：\n\n${othersContent}`
          : `请评价以下其他 AI 的回复：\n\n${othersContent}`
        addUserMessage(targetAi, mutualPrompt)
        await sendMessage(targetAi, mutualPrompt)
      }
    }
  }, [isPaired, selectedAis, statuses, getResponse, sendMessage, addLog, addUserMessage])

  const handleCross = useCallback(async (targetAis: AiType[], sourceAi: AiType, prompt: string) => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      setShowPairing(true)
      return
    }

    const sourceResponse = await getResponse(sourceAi)
    if (!sourceResponse) {
      addLog(`无法获取 ${sourceAi} 的回复`, 'error')
      return
    }

    const crossPrompt = `【${sourceAi.toUpperCase()} 的回复】\n${sourceResponse}\n\n${prompt}`

    for (const target of targetAis) {
      if (statuses[target]) {
        addUserMessage(target, crossPrompt)
        await sendMessage(target, crossPrompt)
      }
    }
  }, [isPaired, statuses, getResponse, sendMessage, addLog, addUserMessage])

  const handleNewConversation = useCallback(async () => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      setShowPairing(true)
      return
    }

    const targets = Array.from(selectedAis).filter(ai => statuses[ai])
    if (targets.length === 0) {
      addLog('没有可用的目标 AI', 'error')
      return
    }

    addLog(`为 ${targets.join(', ')} 开启新对话`, 'info')
    clearConversations(targets)
    await newConversation(targets)
  }, [isPaired, selectedAis, statuses, newConversation, addLog, clearConversations])

  const handleRefreshConversations = useCallback(async () => {
    if (!isPaired) {
      addLog('请先完成配对', 'error')
      return
    }

    const targets = Array.from(selectedAis).filter(ai => statuses[ai])
    if (targets.length === 0) {
      addLog('没有可用的目标 AI', 'error')
      return
    }

    addLog('刷新对话...', 'info')

    for (const ai of targets) {
      try {
        const response = await getResponse(ai)
        if (response) {
          // Check if this response is different from the last one
          const msgs = conversations[ai] || []
          const lastMsg = msgs[msgs.length - 1]

          if (lastMsg?.role === 'assistant' && lastMsg.content === response) {
            // Same content, skip
            continue
          }

          // Add as a new assistant message
          const newMsg: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response,
            timestamp: new Date()
          }

          setConversations(prev => ({
            ...prev,
            [ai]: [...prev[ai], newMsg]
          }))
        }
      } catch (err) {
        console.error(`Failed to refresh ${ai}:`, err)
      }
    }

    addLog('对话已刷新', 'success')
  }, [isPaired, selectedAis, statuses, getResponse, conversations, addLog])

  const handleToggleAi = useCallback((ai: AiType) => {
    setSelectedAis(prev => {
      const next = new Set(prev)
      if (next.has(ai)) {
        next.delete(ai)
      } else {
        next.add(ai)
      }
      return next
    })
  }, [])

  const handleSidebarNewConversation = useCallback(() => {
    // Show confirmation dialog
    setShowNewConversationConfirm(true)
  }, [])

  const handleConfirmNewConversation = useCallback(async () => {
    setShowNewConversationConfirm(false)

    // Clear all conversations
    const allAis = [...AI_TYPES] as AiType[]
    clearConversations(allAis)
    await newConversation(allAis)

    // Reset mode to normal
    setMode('normal')
    addLog('已清除所有对话', 'info')
  }, [addLog, clearConversations, newConversation])

  const duplicateTabAis = useMemo(() => {
    return Object.entries(tabCounts)
      .filter(([, count]) => count > 1)
      .map(([ai, count]) => ({ ai: ai as AiType, count }))
  }, [tabCounts])

  return (
    <div className="flex h-screen bg-[radial-gradient(circle_at_top_left,_#dcfce7,_#eff6ff_38%,_#f8fafc_72%)]">
      <Sidebar
        statuses={statuses}
        selectedAis={selectedAis}
        onToggleAi={handleToggleAi}
        isConnected={isConnected}
        isPaired={isPaired}
        onNewConversation={handleSidebarNewConversation}
      />

      <main className="flex-1 flex flex-col min-w-0 p-4 gap-4">
        {duplicateTabAis.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">检测到多个标签页</p>
              <p className="text-xs text-amber-700 mt-1">
                {duplicateTabAis.map(({ ai, count }) => (
                  <span key={ai} className="inline-flex items-center gap-1 mr-3">
                    <strong>{AI_DISPLAY_NAMES[ai]}</strong> 打开了 {count} 个标签页
                  </span>
                ))}
              </p>
              <p className="text-xs text-amber-600 mt-1">请只保留一个标签页，否则可能导致消息发送异常</p>
            </div>
          </div>
        )}

        <header className="flex items-center justify-between rounded-2xl border border-cyan-100/80 bg-white/80 px-5 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-2">
            <img src="./icons/icon128.png" alt="G4 AI" className="w-9 h-9 rounded-xl shadow-sm" />
            <div className="mr-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">G4 AI</h1>
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700">Gather the smartest, skip the rest</p>
            </div>
            <a
              href="https://github.com/qianzhu18/CrossWise"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-slate-700 transition-colors"
              title="GitHub Repository"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPairing(true)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${isPaired
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isPaired ? 'bg-green-500' : 'bg-amber-500'}`} />
              {isPaired ? '已配对' : '连接扩展'}
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={() => setMode('normal')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'normal'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              普通
            </button>
            <button
              onClick={() => setMode('discussion')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'discussion'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              讨论
            </button>
          </div>
        </header>

        {mode === 'normal' ? (
          <>
            <AiGrid
              statuses={statuses}
              selectedAis={selectedAis}
              conversations={conversations}
            />
            <InputBar
              onSend={handleSend}
              onMutual={handleMutual}
              onCross={handleCross}
              onNewConversation={handleNewConversation}
              onRefresh={handleRefreshConversations}
              selectedAis={selectedAis}
              statuses={statuses}
              disabled={!isPaired}
            />
          </>
        ) : (
          <DiscussionMode
            statuses={statuses}
            isPaired={isPaired}
            sendMessage={sendMessage}
            getResponse={getResponse}
            addLog={addLog}
            onResponseCaptured={(aiType, content) => {
              setConversations(prev => {
                const msgs = prev[aiType] || []
                const lastMsg = msgs[msgs.length - 1]

                // 原子检查：如果最后一条是 assistant 且在 60 秒内，则更新
                if (lastMsg?.role === 'assistant' &&
                  (Date.now() - new Date(lastMsg.timestamp).getTime() < 60000)) {
                  // 如果内容未变，不触发更新
                  if (lastMsg.content === content) return prev

                  const newMsgs = [...msgs]
                  newMsgs[newMsgs.length - 1] = {
                    ...lastMsg,
                    content
                  }
                  return {
                    ...prev,
                    [aiType]: newMsgs
                  }
                }

                // 否则添加新消息
                const newMsg: Message = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content,
                  timestamp: new Date()
                }

                return {
                  ...prev,
                  [aiType]: [...msgs, newMsg]
                }
              })
            }}
          />
        )}
      </main>

      <aside className="w-64 border-l border-slate-200 bg-white flex flex-col">
        <QuickLinks statuses={statuses} tabCounts={tabCounts} />
        <LogPanel logs={logs} onClear={clearLogs} />
      </aside>

      {
        showPairing && (
          <PairingDialog
            isConnected={isConnected}
            pairingCode={pairingCode}
            onConnect={connect}
            onDisconnect={disconnect}
            onRequestCode={requestPairingCode}
            onConfirm={confirmPairing}
            onClose={() => setShowPairing(false)}
            isPaired={isPaired}
          />
        )
      }

      <HelpDialog isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* New Conversation Confirmation Dialog */}
      {showNewConversationConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">确认新对话</h2>
            <p className="text-sm text-slate-600 mb-6">
              这将清除所有AI的对话历史并退出讨论模式，确定要继续吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewConversationConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmNewConversation}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  )
}

export default App
