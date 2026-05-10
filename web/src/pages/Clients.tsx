import { Routes, Route } from 'react-router-dom'
import { Component, type ReactNode } from 'react'
import ClientsList from './clients/ClientsList'
import ClientDetail from './clients/ClientDetail'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message + '\n' + e.stack } }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-2xl">
          <p className="font-bold text-red-600 mb-2">Render xatoligi:</p>
          <pre className="text-xs text-red-500 whitespace-pre-wrap break-all">{this.state.error}</pre>
          <button onClick={() => this.setState({ error: null })} className="mt-4 btn btn-secondary">
            Orqaga
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function Clients() {
  return (
    <Routes>
      <Route index element={<ClientsList />} />
      <Route path=":id" element={<ErrorBoundary><ClientDetail /></ErrorBoundary>} />
    </Routes>
  )
}
