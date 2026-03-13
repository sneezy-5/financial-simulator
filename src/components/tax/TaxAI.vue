<script setup>
import { ref } from 'vue'

const props = defineProps({ resultats: Object, projections: Array, contexte: Object })

const question = ref('')
const messages = ref([])
const loading = ref(false)
const analyseChargee = ref(false)

async function lancerAnalyse() {
  if (analyseChargee.value) return
  loading.value = true
  try {
    const proj = props.projections?.[1]?.annees?.slice(0, 3) || []
    const res = await fetch('/api/ai/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entreprise: props.contexte, resultats: props.resultats, projections: proj })
    })
    const data = await res.json()
    messages.value.push(data.success
      ? { role: 'assistant', content: data.analyse, ts: now() }
      : { role: 'error', content: data.error || 'Erreur lors de l\'analyse', ts: now() })
    if (data.success) analyseChargee.value = true
  } catch {
    messages.value.push({ role: 'error', content: 'Impossible de joindre le serveur. Vérifiez que le backend est démarré.', ts: now() })
  } finally {
    loading.value = false
    scrollDown()
  }
}

async function envoyerQuestion() {
  const q = question.value.trim()
  if (!q || loading.value) return
  messages.value.push({ role: 'user', content: q, ts: now() })
  question.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, contexte: props.contexte })
    })
    const data = await res.json()
    messages.value.push(data.success
      ? { role: 'assistant', content: data.reponse, ts: now() }
      : { role: 'error', content: data.error || 'Erreur IA', ts: now() })
  } catch {
    messages.value.push({ role: 'error', content: 'Impossible de contacter l\'IA.', ts: now() })
  } finally {
    loading.value = false
    scrollDown()
  }
}

function onKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyerQuestion() } }
function scrollDown() { setTimeout(() => { const el = document.getElementById('ai-msgs'); if (el) el.scrollTop = el.scrollHeight }, 100) }
function now() { return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }

const FAQ = [
  'Comment réduire mon impôt ?',
  'Dois-je adhérer à un CGA ?',
  'Que se passe-t-il si je dépasse mon régime ?',
  'Comment améliorer ma marge nette ?',
  'Quand dois-je payer mes impôts ?',
]

function faqClick(q) { question.value = q; envoyerQuestion() }

function formatMsg(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}
</script>

<template>
  <div class="ai-card">
    <div class="ai-head">
      <div class="ai-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"/>
        </svg>
      </div>
      <div>
        <div class="ai-title">Conseiller IA</div>
        <div class="ai-sub">Questions en langage simple — réponses claires</div>
      </div>
    </div>

    <!-- Lancer analyse -->
    <div v-if="!analyseChargee && messages.length === 0" class="ai-start">
      <p>Votre simulation est prête. L'IA peut analyser votre situation et vous donner des conseils personnalisés.</p>
      <button class="btn-analyse" @click="lancerAnalyse" :disabled="loading">
        <svg v-if="!loading" xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
        <span class="spinner" v-else></span>
        {{ loading ? 'Analyse en cours...' : 'Analyser ma situation' }}
      </button>
    </div>

    <!-- Messages -->
    <div v-if="messages.length > 0" id="ai-msgs" class="ai-msgs">
      <div v-for="(msg, i) in messages" :key="i" class="msg" :class="msg.role">
        <div v-if="msg.role === 'assistant'" class="msg-av assistant-av">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
        </div>
        <div v-if="msg.role === 'user'" class="msg-av user-av">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
        </div>
        <div class="msg-bubble" :class="msg.role">
          <div v-if="msg.role === 'error'" class="err-msg">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
            {{ msg.content }}
          </div>
          <p v-else v-html="formatMsg(msg.content)" class="msg-text"></p>
          <div class="msg-time">{{ msg.ts }}</div>
        </div>
      </div>
      <div v-if="loading" class="msg assistant">
        <div class="msg-av assistant-av">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
        </div>
        <div class="msg-bubble assistant typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>

    <!-- FAQ -->
    <div v-if="messages.length === 0" class="faq-area">
      <div class="faq-label">Questions fréquentes</div>
      <div class="faq-list">
        <button v-for="q in FAQ" :key="q" class="faq-btn" @click="faqClick(q)" :disabled="loading">{{ q }}</button>
      </div>
    </div>

    <!-- Saisie -->
    <div class="input-area">
      <textarea v-model="question" @keydown="onKey" placeholder="Posez votre question..." rows="2" :disabled="loading"></textarea>
      <button class="btn-send" @click="envoyerQuestion" :disabled="loading || !question.trim()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/></svg>
      </button>
    </div>
    <!-- <div class="ai-footer">Alimenté par OpenRouter — Vos données restent sur votre serveur</div> -->
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.ai-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; font-family: 'Inter', system-ui, sans-serif; }

.ai-head { display: flex; align-items: center; gap: 0.75rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #f1f5f9; }
.ai-icon { width: 36px; height: 36px; background: #f5f3ff; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #7c3aed; flex-shrink: 0; }
.ai-title { font-size: 0.9rem; font-weight: 700; color: #0f172a; }
.ai-sub { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }

.ai-start { padding: 1.5rem; text-align: center; background: #fafafa; }
.ai-start p { font-size: 0.875rem; color: #6b7280; margin: 0 0 1rem; }
.btn-analyse {
  display: inline-flex; align-items: center; gap: 0.5rem;
  background: #1d4ed8; color: white; border: none;
  border-radius: 8px; padding: 0.625rem 1.25rem;
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.btn-analyse:hover:not(:disabled) { background: #1e40af; box-shadow: 0 4px 12px rgba(29,78,216,0.25); }
.btn-analyse:disabled { opacity: 0.55; cursor: not-allowed; }

/* Messages */
.ai-msgs { max-height: 360px; overflow-y: auto; padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 0.875rem; border-bottom: 1px solid #f1f5f9; }
.msg { display: flex; gap: 0.5rem; }
.msg.user { flex-direction: row-reverse; }
.msg-av { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; align-self: flex-end; }
.assistant-av { background: #f5f3ff; color: #7c3aed; }
.user-av { background: #eff6ff; color: #1d4ed8; }

.msg-bubble { max-width: 78%; padding: 0.75rem 0.875rem; border-radius: 10px; font-size: 0.85rem; line-height: 1.6; }
.msg-bubble.assistant { background: #f8fafc; border: 1px solid #e2e8f0; }
.msg-bubble.user { background: #1d4ed8; color: white; }
.msg-bubble.error { background: #fef2f2; border: 1px solid #fecaca; }
.err-msg { display: flex; align-items: center; gap: 0.375rem; color: #b91c1c; font-size: 0.82rem; }
.msg-text { margin: 0; }
.msg-text :deep(p) { margin: 0.35rem 0; }
.msg-text :deep(strong) { font-weight: 700; }
.msg-time { font-size: 0.62rem; opacity: 0.45; margin-top: 0.25rem; text-align: right; }
.msg.user .msg-time { color: rgba(255,255,255,0.7); }

.typing { display: flex; align-items: center; gap: 4px; height: 36px; padding: 0.625rem !important; }
.typing span { width: 6px; height: 6px; background: #94a3b8; border-radius: 50%; animation: blink 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%,80%,100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

/* FAQ */
.faq-area { padding: 0.875rem 1.5rem; border-bottom: 1px solid #f1f5f9; }
.faq-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 0.5rem; }
.faq-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.faq-btn { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 0.3rem 0.75rem; font-size: 0.78rem; color: #374151; cursor: pointer; transition: all 0.15s; }
.faq-btn:hover:not(:disabled) { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.faq-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Input */
.input-area { display: flex; gap: 0.5rem; padding: 0.875rem 1.5rem; }
.input-area textarea { flex: 1; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.625rem; font-size: 0.85rem; font-family: inherit; resize: none; transition: border-color 0.15s; }
.input-area textarea:focus { outline: none; border-color: #1d4ed8; box-shadow: 0 0 0 3px rgba(29,78,216,0.1); }
.input-area textarea:disabled { background: #f9fafb; }
.btn-send { width: 42px; height: 42px; background: #1d4ed8; color: white; border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0; align-self: flex-end; }
.btn-send:hover:not(:disabled) { background: #1e40af; }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

.ai-footer { text-align: center; padding: 0.5rem 1.5rem 0.875rem; font-size: 0.7rem; color: #9ca3af; }

.spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
