import React, { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const PRESET_COLORS = [
  '#1D9E75', '#378ADD', '#D85A30', '#D4537E', '#7F77DD',
  '#639922', '#BA7517', '#E24B4A', '#888780', '#0F6E56',
]

const S = {
  page: { padding: '28px 28px', overflowY: 'auto', height: '100%' },
  header: { display: 'flex', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 15, fontWeight: 500, flex: 1 },
  addBtn: { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  card: { background: '#fff', border: '0.5px solid #e0dfd8', borderRadius: 12, padding: '16px 18px' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  dot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
  catName: { fontSize: 14, fontWeight: 500, flex: 1 },
  editBtn: { fontSize: 12, color: '#888780', cursor: 'pointer', border: 'none', background: 'none', padding: 0 },
  delBtn: { fontSize: 12, color: '#A32D2D', cursor: 'pointer', border: 'none', background: 'none', padding: '0 0 0 8px' },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modalBox: { background: '#fff', borderRadius: 14, padding: 28, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  modalTitle: { fontSize: 16, fontWeight: 500, marginBottom: 20 },
  label: { fontSize: 12, color: '#888780', marginBottom: 4, display: 'block' },
  input: { width: '100%', padding: '8px 12px', border: '0.5px solid #d3d1c7', borderRadius: 8, fontSize: 14, marginBottom: 16 },
  colorGrid: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  colorDot: { width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', border: '2px solid transparent' },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { padding: '8px 16px', border: '0.5px solid #d3d1c7', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' },
  saveBtn: { padding: '8px 16px', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null) // null | { id?, name, color }
  const [error, setError] = useState('')

  const load = () => api.getCategories().then(setCategories)

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing({ name: '', color: PRESET_COLORS[0] })
    setError('')
  }

  function openEdit(cat) {
    setEditing({ ...cat })
    setError('')
  }

  async function save() {
    if (!editing.name.trim()) { setError('Name is required'); return }
    try {
      if (editing.id) {
        await api.updateCategory(editing.id, { name: editing.name, color: editing.color, icon: editing.icon || 'tag' })
      } else {
        await api.createCategory({ name: editing.name, color: editing.color, icon: 'tag' })
      }
      setEditing(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(cat) {
    if (!confirm(`Delete "${cat.name}"? Transactions will become uncategorized.`)) return
    await api.deleteCategory(cat.id)
    load()
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>Categories</div>
        <button style={S.addBtn} onClick={openNew}>+ New category</button>
      </div>

      <div style={S.grid}>
        {categories.map(cat => (
          <div key={cat.id} style={S.card}>
            <div style={S.cardTop}>
              <div style={{ ...S.dot, background: cat.color }} />
              <div style={S.catName}>{cat.name}</div>
              <button style={S.editBtn} onClick={() => openEdit(cat)}>Edit</button>
              <button style={S.delBtn} onClick={() => del(cat)}>✕</button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div style={{ color: '#888780', fontSize: 13, gridColumn: '1/-1' }}>
            No categories yet. Create some to start categorizing transactions.
          </div>
        )}
      </div>

      {editing && (
        <div style={S.modal} onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div style={S.modalBox}>
            <div style={S.modalTitle}>{editing.id ? 'Edit category' : 'New category'}</div>
            <label style={S.label}>Name</label>
            <input
              style={S.input}
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Groceries"
              autoFocus
            />
            <label style={S.label}>Color</label>
            <div style={S.colorGrid}>
              {PRESET_COLORS.map(c => (
                <div
                  key={c}
                  style={{ ...S.colorDot, background: c, borderColor: editing.color === c ? '#1a1a18' : 'transparent' }}
                  onClick={() => setEditing({ ...editing, color: c })}
                />
              ))}
            </div>
            {error && <div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <div style={S.actions}>
              <button style={S.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={save}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
