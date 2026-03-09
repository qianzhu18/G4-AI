import { AI_TYPES } from './constants'

export type AiType = typeof AI_TYPES[number]

export type Mode = 'normal' | 'discussion'

export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
}

export type Conversations = Record<AiType, Message[]>

export interface AiStatus {
  connected: boolean
}

export type AiStatuses = Record<AiType, boolean>

export type AiTabCounts = Record<AiType, number>

export interface LogEntry {
  id: string
  timestamp: Date
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

export interface BridgeRequest {
  kind: 'REQ'
  id: string
  type: 'SEND_MESSAGE' | 'GET_RESPONSE' | 'GET_STATUS' | 'NEW_CONVERSATION' | 'GET_PAIR_CODE' | 'PAIR_CONFIRM' | 'AUTO_PAIR'
  payload?: unknown
  token?: string
}

export interface BridgeResponse {
  kind: 'RES'
  id: string
  ok: boolean
  data?: unknown
  error?: string
}

export interface BridgeEvent {
  kind: 'EVT'
  type: 'TAB_STATUS_UPDATE' | 'RESPONSE_CAPTURED' | 'SEND_RESULT' | 'NEW_CONVERSATION_RESULTS'
  data: unknown
}

export type BridgeMessage = BridgeResponse | BridgeEvent

export interface DiscussionState {
  active: boolean
  topic: string
  participants: AiType[] | null
  currentRound: number
  history: DiscussionEntry[]
  pendingResponses: Set<AiType>
  roundType: 'initial' | 'cross-eval' | 'counter' | null
}

export interface DiscussionEntry {
  round: number
  ai: AiType
  type: 'initial' | 'evaluation' | 'response'
  content: string
}
