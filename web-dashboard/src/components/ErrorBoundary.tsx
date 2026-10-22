import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PhoneDrive Web Dashboard Uncaught Error:', error, errorInfo)
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  public handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0a0d14] text-[#f1f5f9] flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-md w-full bg-[#131926]/90 backdrop-blur-xl border border-rose-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-white">Something went wrong</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                PhoneDrive encountered an unexpected interface error. Your files and media remain completely safe on your device.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-left">
                <p className="text-[11px] font-mono text-rose-300 break-all line-clamp-3">
                  {this.state.error.message || 'Unknown runtime error'}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-sky-500/20 active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-semibold text-xs transition active:scale-95"
              >
                <Home className="w-4 h-4" />
                Return to Files
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
