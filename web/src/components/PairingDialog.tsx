import { useState } from 'react'
import { EXTENSION_ID_KEY } from '../lib/constants'

interface PairingDialogProps {
  isConnected: boolean
  pairingCode: string | null
  onConnect: (extensionId?: string) => Promise<boolean>
  onDisconnect: () => void
  onRequestCode: () => Promise<string | null>
  onConfirm: (code: string) => Promise<boolean>
  onClose?: () => void
  isPaired?: boolean
}

export function PairingDialog({
  isConnected,
  pairingCode: _pairingCode,
  onConnect,
  onDisconnect: _onDisconnect,
  onRequestCode: _onRequestCode,
  onConfirm,
  onClose,
  isPaired,
}: PairingDialogProps) {
  const [extensionId, setExtensionId] = useState(
    () => localStorage.getItem(EXTENSION_ID_KEY) || ''
  )
  const [inputCode, setInputCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (!extensionId.trim()) {
      setError('请先输入 Extension ID')
      return
    }

    if (!inputCode.trim()) {
      setError('请输入配对码')
      return
    }

    if (inputCode.trim().length !== 6) {
      setError('配对码应为 6 位')
      return
    }

    setError(null)
    setLoading(true)

    try {
      if (!isConnected) {
        const connectSuccess = await onConnect(extensionId.trim())
        if (!connectSuccess) {
          setError('连接失败，请检查 Extension ID 是否正确')
          setLoading(false)
          return
        }
      }

      const success = await onConfirm(inputCode.trim())
      if (!success) {
        setError('配对失败，请检查配对码是否正确')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          {isPaired ? '配对成功' : '连接 G4 AI 扩展'}
        </h2>

        {isPaired ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-600 mb-4">已成功连接到 G4 AI 扩展</p>
            <p className="text-sm text-slate-400 mb-6">现在可以开始使用多 AI 对话功能了</p>
            {onClose && (
              <button
                onClick={onClose}
                className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
              >
                开始使用
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">配对步骤：</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>在 Chrome 中安装 G4 AI 扩展</li>
                <li>打开 <code className="bg-blue-100 px-1 rounded">chrome://extensions</code> 复制扩展 ID</li>
                <li>点击扩展图标打开侧边栏，复制 6 位配对码</li>
                <li>在下方输入两项信息完成配对</li>
              </ol>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Extension ID
                </label>
                <input
                  type="text"
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value.trim())}
                  placeholder="从 chrome://extensions 复制"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent font-mono"
                />
                {isConnected && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    已连接
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  配对码
                </label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="6 位配对码"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent text-center font-mono text-2xl tracking-[0.3em] uppercase"
                />
              </div>

              <button
                onClick={handleConfirm}
                disabled={loading || !extensionId.trim() || inputCode.length !== 6}
                className="w-full py-3 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '连接中...' : '确认配对'}
              </button>
            </div>

            <p className="mt-6 text-xs text-slate-400 text-center">
              首次使用？请先
              <a
                href="https://github.com/qianzhu18/CrossWise"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:underline ml-1"
              >
                安装 G4 AI 扩展
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
