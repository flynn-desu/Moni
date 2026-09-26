import React from 'react'
import {createRoot} from 'react-dom/client'
import './styles/glass.css'
import App from './App'

// 错误边界：渲染异常时给出可见提示，而不是整窗黑屏
class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          UI 异常：{String(this.state.err && this.state.err.stack ? this.state.err.stack : this.state.err)}
        </div>
      )
    }
    return this.props.children
  }
}

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <Boundary>
        <App/>
    </Boundary>
)
