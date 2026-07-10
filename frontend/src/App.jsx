import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import Transactions from './pages/Transactions.jsx'
import Settings from './pages/Settings.jsx'
import Reports from './pages/Reports.jsx'
import Upload from './components/Upload.jsx'
import { api } from './api/client.js'

const S = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden' },
  sidebar: {
    width: 220, background: '#fff', borderRight: '0.5px solid #e0dfd8',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  logo: {
    padding: '20px 20px 16px', fontSize: 17, fontWeight: 600,
    borderBottom: '0.5px solid #e0dfd8', color: '#1a1a18', letterSpacing: '-0.3px',
  },
  nav: { padding: '8px 0', flex: 1 },
  navLink: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
    fontSize: 14, color: '#888780', textDecoration: 'none',
    borderLeft: '2px solid transparent', transition: 'all 0.1s',
  },
  navActive: { color: '#1a1a18', background: '#f5f4f0', borderLeftColor: '#1D9E75' },
  dot: { width: 7, height: 7, borderRadius: '50%' },
  footer: { padding: '14px 20px', borderTop: '0.5px solid #e0dfd8' },
  uploadBtn: {
    width: '100%', padding: '9px 0', background: '#1D9E75', color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  toast: {
    position: 'fixed', bottom: 24, right: 24, background: '#1a1a18', color: '#fff',
    padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
}

function Dot({ color }) {
  return <span style={{ ...S.dot, background: color }} />
}

function AppInner() {
  const [showUpload, setShowUpload] = useState(false)
  const [toast, setToast] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [uploadResult, setUploadResult] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getStats().then(s => setPendingCount(s.pending)).catch(() => {})
  }, [])

  function showToast(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }

  function handleUploaded(result) {
    setShowUpload(false)
    showToast(`Imported ${result.added} transactions (${result.skipped} duplicates skipped)`)
    setUploadResult(result)
    navigate('/transactions')
    window.dispatchEvent(new Event('refresh-transactions'))
  }

  return (
    <div style={S.app}>
      <aside style={S.sidebar}>
        <div style={S.logo}>budget<span style={{ color: '#1D9E75' }}>.</span></div>
        <nav style={S.nav}>
          <NavLink to="/" end style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navActive : {}) })}>
            <Dot color="#D85A30" /> Reports
          </NavLink>
          <NavLink to="/transactions" style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navActive : {}) })}>
            <Dot color="#1D9E75" /> Transactions
            {pendingCount > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '1px 7px', borderRadius: 10, fontWeight: 500 }}>
                {pendingCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/settings" style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navActive : {}) })}>
            <Dot color="#378ADD" /> Settings
          </NavLink>
        </nav>
        <div style={S.footer}>
          <button style={S.uploadBtn} onClick={() => setShowUpload(true)}>+ Upload CSV</button>
        </div>
      </aside>

      <main style={S.main}>
        <Routes>
          <Route path="/" element={<Reports />} />
          <Route
            path="/transactions"
            element={
              <Transactions
                onPendingChange={setPendingCount}
                uploadResult={uploadResult}
                onDismissUploadResult={() => setUploadResult(null)}
              />
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {showUpload && (
        <Upload
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
          onError={(msg) => showToast(msg)}
        />
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
