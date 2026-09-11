import React from 'react'
import ReactDOM from 'react-dom/client'
import { SHEETS_API_URL } from './config'
import ATDevelopmentJournal from './ATDevelopmentJournal'

window.__AT_API_URL__ = SHEETS_API_URL;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ATDevelopmentJournal />
  </React.StrictMode>
)
