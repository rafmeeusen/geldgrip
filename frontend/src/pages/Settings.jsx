import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api/client.js'
import Categories from './Categories.jsx'

const CONFIRM_PHRASE = 'DELETE'
const LAST_EXPORT_KEY = 'geldgrip_last_export'

const S = {
  page: { padding: 28, overflowY: 'auto', height: '100%' },
  title: { fontSize: 15, fontWeight: 500, marginBottom: 24 },
  section: { marginBottom: 36, maxWidth: 560 },
  sectionTitle: { fontSize: 12, fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
  card: { background: '#fff', border: '0.5px solid #e0dfd8', borderRadius: 12, padding: '18px 20px' },
  desc: { fontSize: 13, color: '#5c5b56', marginBottom: 14, lineHeight: 1.5 },
  hint: { fontSize: 12, color: '#888780', marginTop: 10 },
  row: { display: 'flex', gap: 10, alignItems: 'center' },
  btn: { padding: '8px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  dangerBtn: { padding: '8px 16px', background: '#A32D2D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  input: { padding: '8px 12px', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 13, flex: 1 },
  fileInput: { fontSize: 13 },
  error: { color: '#A32D2D', fontSize: 12, marginTop: 10 },
  success: { color: '#0F6E56', fontSize: 12, marginTop: 10 },
  divider: { height: 1, background: '#e0dfd8', margin: '28px 0' },
}

export default function Settings() {
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(null)
  const [lastExport, setLastExport] = useState(localStorage.getItem(LAST_EXPORT_KEY))
  const [confirmText, setConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'error'|'success', text }
  const fileRef = useRef()

  const load = async () => {
    const [cats, stats] = await Promise.all([api.getCategories(), api.getStats()])
    setCategories(cats)
    setTotal(stats.total)
  }

  useEffect(() => { load() }, [])

  const isEmpty = total === 0 && categories.length === 0

  async function handleExport() {
    setExporting(true)
    setMsg(null)
    try {
      await api.downloadBackup()
      const now = new Date().toISOString()
      localStorage.setItem(LAST_EXPORT_KEY, now)
      setLastExport(now)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setExporting(false)
    }
  }

  async function handleRestoreFile(file) {
    if (!file) return
    setRestoring(true)
    setMsg(null)
    try {
      await api.restoreBackup(file)
      setMsg({ type: 'success', text: 'Backup restored.' })
      await load()
      window.dispatchEvent(new Event('refresh-transactions'))
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setRestoring(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleClear() {
    if (confirmText !== CONFIRM_PHRASE) return
    setClearing(true)
    setMsg(null)
    try {
      await api.clearAll()
      setConfirmText('')
      await load()
      window.dispatchEvent(new Event('refresh-transactions'))
      setMsg({ type: 'success', text: 'All data cleared.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setClearing(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.title}>Settings</div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Export</div>
        <div style={S.card}>
          <div style={S.desc}>Download a full backup of your categories and transactions as a JSON file.</div>
          <button
            style={{ ...S.btn, ...(exporting ? S.btnDisabled : {}) }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export backup'}
          </button>
          {lastExport && (
            <div style={S.hint}>Last exported {new Date(lastExport).toLocaleString('nl-BE')}</div>
          )}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Restore</div>
        <div style={S.card}>
          <div style={S.desc}>
            {isEmpty
              ? 'Upload a backup file to load it in.'
              : 'Restore is only available once the app has been fully cleared — clear all data first.'}
          </div>
          <input
            ref={fileRef}
            style={S.fileInput}
            type="file"
            accept=".json,application/json"
            disabled={!isEmpty || restoring}
            onChange={e => handleRestoreFile(e.target.files[0])}
          />
          {restoring && <div style={S.hint}>Restoring…</div>}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Clear all data</div>
        <div style={S.card}>
          <div style={S.desc}>
            Permanently deletes every category and transaction. This cannot be undone
            {lastExport ? ` (last export: ${new Date(lastExport).toLocaleString('nl-BE')})` : ' — consider exporting a backup first'}.
          </div>
          <div style={S.row}>
            <input
              style={S.input}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={`Type "${CONFIRM_PHRASE}" to confirm`}
            />
            <button
              style={{ ...S.dangerBtn, ...(confirmText !== CONFIRM_PHRASE || clearing ? S.btnDisabled : {}) }}
              onClick={handleClear}
              disabled={confirmText !== CONFIRM_PHRASE || clearing}
            >
              {clearing ? 'Clearing…' : 'Clear all data'}
            </button>
          </div>
        </div>
      </div>

      {msg && <div style={msg.type === 'error' ? S.error : S.success}>{msg.text}</div>}

      <div style={S.divider} />

      <Categories />
    </div>
  )
}
