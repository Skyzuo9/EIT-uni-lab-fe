import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@unilab/design-system/theme.css'
import './styles/global.css'
import './styles/pascal.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
