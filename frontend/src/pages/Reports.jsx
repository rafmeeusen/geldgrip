import React, { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const S = {
  page: { padding: 28, overflowY: 'auto', height: '100%' },
  title: { fontSize: 15, fontWeight: 500, marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 12, fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 28 },
  card: { background: '#fff', border: '0.5px solid #e0dfd8', borderRadius: 10, padding: '14px 16px' },
  cardLabel: { fontSize: 11, color: '#888780', marginBottom: 4 },
  cardValue: { fontSize: 20, fontWeight: 500 },
  barList: { display: 'flex', flexDirection: 'column', gap: 10 },
  barRow: { display: 'flex', alignItems: 'center', gap: 12 },
  barLabel: { width: 130, fontSize: 13, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 },
  barTrack: { flex: 1, height: 8, background: '#f5f4f0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barAmount: { width: 90, textAlign: 'right', fontSize: 13, color: '#A32D2D', fontVariantNumeric: 'tabular-nums' },
  select: { padding: '7px 12px', borderRadius: 8, border: '0.5px solid #d3d1c7', fontSize: 13, background: '#fff', marginBottom: 20 },
}

function fmt(amount) {
  return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount)
}

export default function Reports() {
  const [txs, setTxs] = useState([])
  const [cats, setCats] = useState([])
  const [month, setMonth] = useState('')

  useEffect(() => {
    Promise.all([api.getTransactions({ limit: 1000 }), api.getCategories()])
      .then(([t, c]) => { setTxs(t); setCats(c) })
  }, [])

  const months = [...new Set(txs.map(t => t.date.slice(0, 7)))].sort().reverse()

  const filtered = month ? txs.filter(t => t.date.startsWith(month)) : txs

  // Expenses by category
  const byCat = {}
  for (const tx of filtered) {
    if (tx.amount >= 0) continue
    const catId = tx.category_id || tx.suggested_category_id
    const key = catId || 'uncategorized'
    byCat[key] = (byCat[key] || 0) + Math.abs(tx.amount)
  }

  const catMap = Object.fromEntries(cats.map(c => [c.id, c]))
  const sortedCats = Object.entries(byCat)
    .map(([k, v]) => ({ key: k, name: catMap[k]?.name || 'Uncategorized', color: catMap[k]?.color || '#888780', amount: v }))
    .sort((a, b) => b.amount - a.amount)

  const totalExpense = sortedCats.reduce((s, r) => s + r.amount, 0)
  const income = filtered.reduce((s, t) => t.amount > 0 ? s + t.amount : s, 0)

  return (
    <div style={S.page}>
      <div style={S.title}>Reports</div>

      <select style={S.select} value={month} onChange={e => setMonth(e.target.value)}>
        <option value="">All time</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <div style={S.grid}>
        <div style={S.card}>
          <div style={S.cardLabel}>Income</div>
          <div style={{ ...S.cardValue, color: '#0F6E56' }}>{fmt(income)}</div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Expenses</div>
          <div style={{ ...S.cardValue, color: '#A32D2D' }}>{fmt(totalExpense)}</div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Net</div>
          <div style={{ ...S.cardValue, color: income - totalExpense >= 0 ? '#0F6E56' : '#A32D2D' }}>
            {fmt(income - totalExpense)}
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cardLabel}>Transactions</div>
          <div style={S.cardValue}>{filtered.length}</div>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Expenses by category</div>
        {sortedCats.length === 0 && <div style={{ color: '#888780', fontSize: 13 }}>No expense data yet.</div>}
        <div style={S.barList}>
          {sortedCats.map(row => (
            <div key={row.key} style={S.barRow}>
              <div style={S.barLabel}>{row.name}</div>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, width: `${totalExpense > 0 ? (row.amount / totalExpense) * 100 : 0}%`, background: row.color }} />
              </div>
              <div style={S.barAmount}>{fmt(row.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
