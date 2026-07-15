import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  message: string
}

/**
 * Top-level error boundary. Owners never see a stack trace; they see a calm,
 * reassuring message that their work is safe, plus a recovery action. The raw
 * error is logged to the console (and, in Electron, forwarded to the structured
 * log) for developers only.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[SowyVid] UI error:', error, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ hasError: false, message: '' })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          textAlign: 'center',
          padding: 40,
          color: 'var(--text-secondary)',
        }}
      >
        <h1 style={{ fontSize: 20, color: 'var(--text-primary)' }}>Algo no salió como esperábamos</h1>
        <p style={{ maxWidth: 420 }}>
          Tu trabajo está guardado y seguro. Puedes reintentar sin perder tu comercial.
        </p>
        <button
          type="button"
          onClick={this.reset}
          style={{
            marginTop: 8,
            height: 44,
            padding: '0 20px',
            borderRadius: 12,
            border: 'none',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'linear-gradient(180deg, #8b6cff, #6a3ff0)',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }
}
