import React, { useState, useRef } from 'react'
import { api } from '../api/client.js'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  box: { background: '#fff', borderRadius: 14, padding: 32, width: 420 },
  title: { fontSize: 16, fontWeight: 500, marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#888780', marginBottom: 24 },
  dropzone: {
    border: '1.5px dashed #d3d1c7', borderRadius: 10, padding: '40px 20px',
    textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
  },
  dropzoneActive: { borderColor: '#1D9E75', background: '#E1F5EE44' },
  icon: { fontSize: 28, marginBottom: 10 },
  hint: { fontSize: 13, color: '#888780' },
  fileName: { fontSize: 13, color: '#1D9E75', fontWeight: 500, marginTop: 10 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 },
  cancelBtn: { padding: '8px 16px', border: '0.5px solid #d3d1c7', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' },
  uploadBtn: { padding: '8px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  disabledBtn: { opacity: 0.5, cursor: 'not-allowed' },
  error: { color: '#A32D2D', fontSize: 12, marginTop: 12 },
  progress: { fontSize: 13, color: '#888780', textAlign: 'center', marginTop: 12 },
}

export default function Upload({ onClose, onUploaded, onError }) {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  function pick(f) {
    if (!f) return
    if (!f.name.endsWith('.csv')) { setError('Please select a CSV file'); return }
    setFile(f)
    setError('')
  }

  async function upload() {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const result = await api.uploadCSV(file)
      onUploaded(result)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.box}>
        <div style={S.title}>Upload KBC CSV</div>
        <div style={S.subtitle}>Export your transactions from KBC Online Banking and upload the CSV file here.</div>

        <div
          style={{ ...S.dropzone, ...(dragging ? S.dropzoneActive : {}) }}
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
        >
          <div style={S.icon}>📄</div>
          <div style={S.hint}>Drop your CSV here, or click to browse</div>
          {file && <div style={S.fileName}>{file.name}</div>}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={e => pick(e.target.files[0])}
          />
        </div>

        {error && <div style={S.error}>{error}</div>}
        {loading && <div style={S.progress}>Uploading and categorizing…</div>}

        <div style={S.actions}>
          <button style={S.cancelBtn} onClick={onClose} disabled={loading}>Cancel</button>
          <button
            style={{ ...S.uploadBtn, ...(!file || loading ? S.disabledBtn : {}) }}
            onClick={upload}
            disabled={!file || loading}
          >
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}
