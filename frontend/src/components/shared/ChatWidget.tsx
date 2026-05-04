import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, ExternalLink } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
  playerLink?: string
}

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'
const VOIR_JOUEUR_RE = /\[VOIR_JOUEUR:([^\]]+)\]/

function parseMessage(content: string): { text: string; playerLink?: string } {
  const match = content.match(VOIR_JOUEUR_RE)
  if (!match) return { text: content }
  return { text: content.replace(VOIR_JOUEUR_RE, '').trim(), playerLink: match[1].trim() }
}

export default function ChatWidget() {
  const { selectedSport, selectedChecklistIds, masterKey, setActiveView, setTargetPlayer } = useAppStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [open, messages])

  function navigateToPlayer(player: string) {
    setTargetPlayer(player)
    setActiveView('🔍 Analyse Joueur')
    setOpen(false)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setMessages([...newMessages, { role: 'assistant', content: '' }])

    try {
      const res = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          sport_key: selectedSport,
          checklist_ids: selectedChecklistIds,
          master_key: masterKey,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const { text: parsed, playerLink } = parseMessage(accumulated)
        setMessages([...newMessages, { role: 'assistant', content: parsed, playerLink }])
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: "Erreur de connexion à l'assistant." }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-80 h-[480px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">Assistant Cartes</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <p className="text-gray-500 text-center mt-8">
                Pose-moi une question sur tes checklists, les breaks, ou les joueurs.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'
                }`}>
                  {msg.content}
                  {msg.role === 'assistant' && loading && i === messages.length - 1 && msg.content === '' && (
                    <Loader2 className="w-3 h-3 animate-spin inline" />
                  )}
                </div>
                {msg.playerLink && !loading && (
                  <button
                    onClick={() => navigateToPlayer(msg.playerLink!)}
                    className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Voir {msg.playerLink}
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-gray-700 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Message..."
              className="flex-1 resize-none bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none border border-gray-600 focus:border-blue-500 placeholder-gray-500"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg flex items-center justify-center text-white"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
      </button>
    </div>
  )
}
