import { createContext } from 'react'

// True while CopilotKit's HadafiChatInput reports inProgress (LLM is streaming).
// Provided by EmbeddedDashboardAssistant and consumed by card components that
// need to disable CTAs during streaming.
export const ChatLoadingContext = createContext(false)
