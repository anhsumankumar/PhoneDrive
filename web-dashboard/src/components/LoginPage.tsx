import React, { useState, useEffect } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck, QrCode, AlertCircle, ArrowRight, Sun, Moon } from 'lucide-react'
import { api } from '../api/client'

interface LoginPageProps {
  onLoginSuccess: () => void
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairToken, setPairToken] = useState<string | null>(null)

  useEffect(() => {
    // Check if opened via QR pairing query param: ?pair=<token>
    const urlParams = new URLSearchParams(window.location.search)
    const token = urlParams.get('pair')
    if (token) {
      setPairToken(token)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('Please enter your PhoneDrive password')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await api.login(password)
      onLoginSuccess()
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your password.')
    } finally {
      setLoading(false)
    }
  }

  const handlePairing = async () => {
    if (!pairToken) return
    setLoading(true)
    setError(null)

    try {
      await api.pair(pairToken)
      // Clean query params
      window.history.replaceState({}, document.title, window.location.pathname)
      onLoginSuccess()
    } catch (err: any) {
      setError(err.message || 'QR Pairing token has expired or is invalid.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-primary)] p-4 relative overflow-hidden transition-colors duration-200">
      {/* Theme toggle in top right */}
      {onToggleTheme && (
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
          className="absolute top-5 right-5 p-2.5 rounded-2xl bg-[var(--input-bg)] border border-[var(--border-subtle)] hover:border-sky-500/40 text-[var(--text-secondary)] hover:text-sky-400 transition flex items-center justify-center shadow-sm z-20"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-5 h-5 text-sky-600 hover:-rotate-12 transition-transform" />
          )}
        </button>
      )}

      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[110px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="glass-panel p-8 rounded-3xl shadow-2xl border border-[var(--border-subtle)] backdrop-blur-xl">
          {/* Brand & Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <img
              src="/icon.png"
              alt="PhoneDrive"
              className="w-20 h-20 mb-3 object-contain drop-shadow-2xl"
            />
            <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">PhoneDrive</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 font-medium">Your Phone. Your Files. Your Personal Drive.</p>
          </div>

          {/* QR Pairing Detected Flow */}
          {pairToken ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-start space-x-3">
                <QrCode className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs text-sky-200 leading-relaxed">
                  <span className="font-semibold block text-white text-sm mb-0.5">Device Pairing Request</span>
                  This browser was opened via QR code pairing from your phone. Click below to authorize this session directly without entering a password.
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handlePairing}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.99] transition shadow-lg shadow-sky-500/25 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Authorize This Device</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setPairToken(null)}
                className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] py-1 transition"
              >
                Or sign in with master password
              </button>
            </div>
          ) : (
            /* Master Password Login Flow */
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Master Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter phone drive password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.99] transition shadow-lg shadow-sky-500/25 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Unlock PhoneDrive</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Privacy & Security Note */}
          <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] flex items-center justify-center space-x-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>End-to-end Local Wi-Fi Connection</span>
          </div>
        </div>
      </div>
    </div>
  )
}
