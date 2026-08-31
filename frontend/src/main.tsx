import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DbtkPollPage } from './components/polls/DbtkPollPage.tsx'

const isDbtkPoll = window.location.pathname.replace(/\/$/, '').toLowerCase() === '/sondagedbtk'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDbtkPoll ? <DbtkPollPage /> : <App />}
  </StrictMode>,
)
