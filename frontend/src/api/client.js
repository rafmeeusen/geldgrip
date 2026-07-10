const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Transactions
  getTransactions: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return req(`/transactions${q ? '?' + q : ''}`)
  },
  getStats: (month) => req(`/transactions/stats${month ? '?month=' + month : ''}`),
  updateTransaction: (id, data) =>
    req(`/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  acceptSuggestion: (id) =>
    req(`/transactions/${id}/approve`, { method: 'POST' }),
  bulkCategorize: (ids, categoryId) =>
    req('/transactions/bulk-categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, category_id: categoryId }),
    }),
  commitReviewed: () =>
    req('/transactions/commit-reviewed', { method: 'POST' }),

  // Upload
  uploadCSV: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/upload', { method: 'POST', body: fd })
  },

  // Categories
  getCategories: () => req('/categories'),
  createCategory: (data) =>
    req('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateCategory: (id, data) =>
    req(`/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteCategory: (id) => req(`/categories/${id}`, { method: 'DELETE' }),

  // Admin: backup / restore / clear
  downloadBackup: async () => {
    const res = await fetch(`${BASE}/backup`)
    if (!res.ok) throw new Error('Backup download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'geldgrip-backup.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  restoreBackup: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/admin/restore', { method: 'POST', body: fd })
  },
  clearAll: () => req('/admin/clear', { method: 'POST' }),
}
