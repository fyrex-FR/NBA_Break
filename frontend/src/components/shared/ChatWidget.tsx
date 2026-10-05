import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, ExternalLink, Sparkles } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
  playerLink?: string
}

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api'
const SUGGESTIONS = [
  'Quels joueurs ont le plus d’autos ?',
  'Quelle équipe vaut le coup en break ?',
]

const VOIR_JOUEUR_RE = /\[VOIR_JOUEUR:([^\]]+)\]/

function parseMessage(content: string): { text: string; playerLink?: string } {
  const match = content.match(VOIR_JOUEUR_RE)
  if (!match) return { text: content }
  return { text: content.replace(VOIR_JOUEUR_RE, '').trim(), playerLink: match[1].trim() }
}

export default function ChatWidget() {
  const { selectedSport, selectedChecklistIds, masterKey, setActiveView, setTargetPlayer } = useAppStore()
  const open = useAppStore((s) => s.chatOpen)
  const setOpen = useAppStore((s) => s.setChatOpen)
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
    <div className="fixed bottom-[76px] inset-x-2 md:inset-x-auto md:bottom-5 md:right-5 z-40 flex flex-col items-end gap-2 pointer-events-none [&>*]:pointer-events-auto">
      {open && (
        <div
          className="w-full md:w-[360px] h-[min(560px,calc(100dvh-140px))] md:h-[min(520px,calc(100dvh-9rem))] rounded-2xl flex flex-col overflow-hidden"
          style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-pop)', animation: 'popIn 0.16s ease-out' }}
        >
          <div className="flex items-center gap-2.5 px-4 h-12" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>Assistant</span>
            <button onClick={() => setOpen(false)} className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon" aria-label="Fermer l'assistant">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="mt-6 px-2 text-center">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Pose une question sur ta sélection, un joueur ou un break.
                </p>
                <div className="mt-4 flex flex-col gap-1.5">
                  {SUGGESTIONS.map((q) => (
                    <button key={q} onClick={() => setInput(q)} className="ui-chip justify-center !h-auto py-1.5 !whitespace-normal">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap text-[13px] leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderBottomRightRadius: 6 }
                    : { background: 'var(--bg-surface)', color: 'var(--text-primary)', borderBottomLeftRadius: 6 }}
                >
                  {msg.content}
                  {msg.role === 'assistant' && loading && i === messages.length - 1 && msg.content === '' && (
                    <Loader2 className="w-3 h-3 animate-spin inline" />
                  )}
                </div>
                {msg.playerLink && !loading && (
                  <button
                    onClick={() => navigateToPlayer(msg.playerLink!)}
                    className="mt-1 flex items-center gap-1 text-xs hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Voir la fiche de {msg.playerLink}
                  </button>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-2.5 flex gap-2 items-end" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Écris ta question…"
              className="ui-input flex-1 resize-none !h-auto min-h-[36px] py-2"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="ui-btn ui-btn-primary ui-btn-icon !h-9 !w-9"
              aria-label="Envoyer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="hidden md:flex w-11 h-11 rounded-full items-center justify-center transition-transform hover:scale-105"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-pop)' }}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        title="Assistant"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" style={{ color: 'var(--accent)' }} />}
      </button>
    </div>
  )
}
