import {
  EXTENSION_ID_KEY,
  PAIRING_TOKEN_KEY,
  LEGACY_EXTENSION_ID_KEY,
  LEGACY_PAIRING_TOKEN_KEY,
  AI_TYPES
} from './constants'
import type { AiType, BridgeRequest, BridgeMessage } from './types'

type StatusUpdateHandler = (aiType: AiType, connected: boolean) => void
type ResponseCapturedHandler = (aiType: AiType, content: string) => void
type SendResultHandler = (aiType: AiType, success: boolean, error?: string) => void
type ErrorHandler = (error: string) => void

interface BridgeCallbacks {
  onStatusUpdate?: StatusUpdateHandler
  onResponseCaptured?: ResponseCapturedHandler
  onSendResult?: SendResultHandler
  onError?: ErrorHandler
}

const REQUEST_TIMEOUT_MS = 20_000

class ExtensionBridge {
  private port: chrome.runtime.Port | null = null
  private extensionId: string | null = null
  private token: string | null = null
  private pendingRequests = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>()
  private callbacks: BridgeCallbacks = {}

  constructor() {
    this.extensionId =
      localStorage.getItem(EXTENSION_ID_KEY) ||
      localStorage.getItem(LEGACY_EXTENSION_ID_KEY)
    this.token =
      localStorage.getItem(PAIRING_TOKEN_KEY) ||
      localStorage.getItem(LEGACY_PAIRING_TOKEN_KEY)

    if (this.extensionId) {
      localStorage.setItem(EXTENSION_ID_KEY, this.extensionId)
      localStorage.removeItem(LEGACY_EXTENSION_ID_KEY)
    }

    if (this.token) {
      localStorage.setItem(PAIRING_TOKEN_KEY, this.token)
      localStorage.removeItem(LEGACY_PAIRING_TOKEN_KEY)
    }

    this.autoDetectExtensionId()

    console.log('[Bridge] Initialized', { extensionId: this.extensionId, hasToken: !!this.token })
  }

  private autoDetectExtensionId() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      const detectedId = chrome.runtime.id
      if (detectedId && this.extensionId !== detectedId) {
        console.log('[Bridge] Auto-detected Extension ID:', detectedId)
        this.setExtensionId(detectedId)
      }
    }
  }

  setCallbacks(callbacks: BridgeCallbacks) {
    this.callbacks = callbacks
  }

  get isConnected(): boolean {
    return this.port !== null
  }

  get isPaired(): boolean {
    return this.isInternalApp || this.token !== null
  }

  get currentPairingCode(): string | null {
    return null
  }

  get isInternalApp(): boolean {
    return window.location.protocol === 'chrome-extension:'
  }

  async ping(): Promise<boolean> {
    const port = this.port
    if (!port) {
      return false
    }

    try {
      const id = crypto.randomUUID()
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(false)
        }, 1000)

        const oneTimeListener = (msg: BridgeMessage) => {
          if (msg.kind === 'RES' && (msg as any).id === id) {
            clearTimeout(timeout)
            port.onMessage.removeListener(oneTimeListener)
            resolve(true)
          }
        }

        port.onMessage.addListener(oneTimeListener)
        port.postMessage({
          kind: 'REQ',
          id,
          type: 'GET_STATUS',
          token: this.token
        })
      })
    } catch (err) {
      console.error('[Bridge] Ping error:', err)
      return false
    }
  }

  setExtensionId(id: string) {
    this.extensionId = id
    localStorage.setItem(EXTENSION_ID_KEY, id)
    console.log('[Bridge] Extension ID set:', id)
  }

  async connect(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.error('[Bridge] Chrome runtime not available')
      this.callbacks.onError?.('请在 Chrome 浏览器中使用，并确保页面运行在 localhost')
      return false
    }

    // For internal pages, we don't need extension ID
    if (!this.isInternalApp && !this.extensionId) {
      console.error('[Bridge] No Extension ID')
      this.callbacks.onError?.('请先设置 Extension ID')
      return false
    }

    // Disconnect existing port if any
    if (this.port) {
      this.port.disconnect()
      this.port = null
    }

    return new Promise((resolve) => {
      try {
        // Internal pages use chrome.runtime.connect() without specifying extension ID
        // External pages (localhost) use chrome.runtime.connect(extensionId)
        if (this.isInternalApp) {
          console.log('[Bridge] Connecting as internal extension page')
          this.port = chrome.runtime.connect({ name: 'g4-ai-web-internal' })
        } else {
          console.log('[Bridge] Connecting to extension:', this.extensionId)
          this.port = chrome.runtime.connect(this.extensionId!, { name: 'g4-ai-web' })
        }

        let resolved = false

        this.port.onMessage.addListener((msg: BridgeMessage) => {
          console.log('[Bridge] Received message:', msg)

          if (msg.kind === 'RES' && !resolved) {
            resolved = true
            console.log('[Bridge] Connection verified via message')
          }

          this.handleMessage(msg)
        })

        this.port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError
          console.log('[Bridge] Disconnected', error?.message || '')
          this.port = null
          if (!resolved) {
            resolved = true
            if (error) {
              this.callbacks.onError?.(`连接失败: ${error.message}`)
            } else {
              this.callbacks.onError?.('无法连接到扩展，请确认 Extension ID 正确')
            }
            resolve(false)
          } else {
            this.callbacks.onError?.('与扩展的连接已断开')
          }
        })

        // Give time for onDisconnect to fire if extension doesn't exist
        // Chrome fires onDisconnect synchronously if extension ID is invalid
        setTimeout(async () => {
          if (!resolved && this.port) {
            resolved = true
            console.log('[Bridge] Port created successfully (no immediate disconnect)')

            // Verify connection is actually working before auto-pair
            const pingSuccess = await this.ping()
            if (!pingSuccess) {
              console.error('[Bridge] Port ping failed')
              resolve(false)
              return
            }

            console.log('[Bridge] Port ping successful')

            // Auto-pair if running inside extension and not yet paired
            if (this.isInternalApp && !this.token) {
              console.log('[Bridge] Running inside extension, attempting auto-pair...')
              const paired = await this.autoPair()
              if (!paired) {
                console.error('[Bridge] Auto-pair failed, user can still pair manually')
              }
            }

            resolve(true)
          }
        }, 200)
      } catch (err) {
        console.error('[Bridge] Connect error:', err)
        this.callbacks.onError?.(`连接失败: ${err instanceof Error ? err.message : String(err)}`)
        resolve(false)
      }
    })
  }

  private async autoPair(): Promise<boolean> {
    if (!this.port) {
      return false
    }

    try {
      const result = await this.sendRequest<{ token: string }>('AUTO_PAIR')
      if (result.token) {
        this.token = result.token
        localStorage.setItem(PAIRING_TOKEN_KEY, result.token)
        console.log('[Bridge] Auto-pair successful')
        return true
      }
      return false
    } catch (err) {
      console.error('[Bridge] Auto-pair error:', err)
      return false
    }
  }

  disconnect() {
    if (this.port) {
      this.port.disconnect()
      this.port = null
    }
  }

  private handleMessage(msg: BridgeMessage) {
    if (msg.kind === 'RES') {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.data)
        } else {
          // 检测 token 失效，自动清除并通知用户重新配对
          if (msg.error === 'Unauthorized' || msg.error === 'Token expired') {
            console.log('[Bridge] Token invalid, clearing pairing state')
            this.clearPairing()
            this.callbacks.onError?.('配对已失效，请重新配对')
          }
          pending.reject(new Error(msg.error || 'Unknown error'))
        }
      }
    } else if (msg.kind === 'EVT') {
      this.handleEvent(msg.type, msg.data)
    }
  }

  private handleEvent(type: string, data: unknown) {
    switch (type) {
      case 'TAB_STATUS_UPDATE': {
        const { aiType, connected } = data as { aiType: AiType; connected: boolean }
        this.callbacks.onStatusUpdate?.(aiType, connected)
        break
      }
      case 'RESPONSE_CAPTURED': {
        const { aiType, content } = data as { aiType: AiType; content: string }
        this.callbacks.onResponseCaptured?.(aiType, content)
        break
      }
      case 'SEND_RESULT': {
        const { aiType, success, error } = data as { aiType: AiType; success: boolean; error?: string }
        this.callbacks.onSendResult?.(aiType, success, error)
        break
      }
    }
  }

  private async sendRequest<T>(type: BridgeRequest['type'], payload?: unknown): Promise<T> {
    if (!this.port) {
      throw new Error('未连接到扩展')
    }

    const id = crypto.randomUUID()
    const request: BridgeRequest = {
      kind: 'REQ',
      id,
      type,
      payload,
      token: this.token || undefined,
    }

    console.log('[Bridge] Sending request:', type, payload)

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (data: unknown) => void, reject })

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`请求超时（${REQUEST_TIMEOUT_MS / 1000}s）`))
        }
      }, REQUEST_TIMEOUT_MS)

      this.port!.postMessage(request)
    })
  }

  async requestPairingCode(): Promise<string> {
    const result = await this.sendRequest<{ code: string }>('GET_PAIR_CODE')
    return result.code
  }

  async confirmPairing(code: string): Promise<boolean> {
    console.log('[Bridge] Confirming pairing with code:', code)
    const result = await this.sendRequest<{ token: string }>('PAIR_CONFIRM', { code })
    console.log('[Bridge] Pairing result:', result)
    if (result.token) {
      this.token = result.token
      localStorage.setItem(PAIRING_TOKEN_KEY, result.token)
      return true
    }
    return false
  }

  clearPairing() {
    this.token = null
    localStorage.removeItem(PAIRING_TOKEN_KEY)
  }

  async sendMessage(aiType: AiType, message: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest('SEND_MESSAGE', { aiType, message })
  }

  async getResponse(aiType: AiType): Promise<string | null> {
    const result = await this.sendRequest<{ content: string | null }>('GET_RESPONSE', { aiType })
    return result.content
  }

  async getStatus(): Promise<{ statuses: Record<AiType, boolean>; tabCounts: Record<AiType, number> }> {
    const result = await this.sendRequest<{ statuses: Record<AiType, boolean>; tabCounts: Record<AiType, number> }>('GET_STATUS')
    const defaultStatuses = AI_TYPES.reduce((acc, ai) => ({ ...acc, [ai]: false }), {} as Record<AiType, boolean>)
    const defaultTabCounts = AI_TYPES.reduce((acc, ai) => ({ ...acc, [ai]: 0 }), {} as Record<AiType, number>)
    return {
      statuses: result.statuses || defaultStatuses,
      tabCounts: result.tabCounts || defaultTabCounts
    }
  }

  async newConversation(aiTypes: AiType[]): Promise<Record<AiType, { success: boolean; error?: string }>> {
    const result = await this.sendRequest<{ results: Record<AiType, { success: boolean; error?: string }> }>('NEW_CONVERSATION', { aiTypes })
    return result.results
  }
}

export const bridge = new ExtensionBridge()
