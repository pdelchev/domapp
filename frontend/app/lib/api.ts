// Use relative URLs — Next.js rewrites proxy /api/* to Django backend.
// This eliminates CORS issues in Codespaces and production.
const API_URL = '';

// --- Token helpers ---
export function getTokens() {
  if (typeof window === 'undefined') return { access: null, refresh: null };
  return {
    access: localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token'),
  };
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

// --- Core fetch wrapper with auto-refresh ---
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { access, refresh } = getTokens();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Don't set Content-Type for FormData (file uploads)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (access) {
    headers['Authorization'] = `Bearer ${access}`;
  }

  let response = await fetch(`${API_URL}${url}`, { ...options, headers });

  // If 401, try refreshing the token
  if (response.status === 401 && refresh) {
    const refreshResponse = await fetch(`${API_URL}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });

    if (refreshResponse.ok) {
      const data = await refreshResponse.json();
      setTokens(data.access, data.refresh || refresh);
      headers['Authorization'] = `Bearer ${data.access}`;
      response = await fetch(`${API_URL}${url}`, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
    }
  }

  return response;
}

// --- Auth ---
export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const data = await res.json();
  setTokens(data.access, data.refresh);
  return data;
}

export async function register(username: string, email: string, password: string, full_name: string) {
  const res = await fetch(`${API_URL}/api/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, full_name }),
  });
  if (!res.ok) throw new Error('Registration failed');
  const data = await res.json();
  setTokens(data.tokens.access, data.tokens.refresh);
  return data;
}

export async function getMe() {
  const res = await apiFetch('/api/auth/me/');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}

export async function updateProfile(data: Record<string, unknown>) {
  const res = await apiFetch('/api/auth/me/', { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

// --- Sub-accounts ---
export async function getSubAccounts() {
  const res = await apiFetch('/api/auth/sub-accounts/');
  if (!res.ok) throw new Error('Failed to fetch sub-accounts');
  return res.json();
}

export async function createSubAccount(data: Record<string, unknown>) {
  const res = await apiFetch('/api/auth/sub-accounts/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create sub-account');
  return res.json();
}

export async function updateSubAccount(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/auth/sub-accounts/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update sub-account');
  return res.json();
}

export async function deleteSubAccount(id: number) {
  const res = await apiFetch(`/api/auth/sub-accounts/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete sub-account');
}

export async function logout() {
  const { refresh } = getTokens();
  await apiFetch('/api/auth/logout/', {
    method: 'POST',
    body: JSON.stringify({ refresh }),
  });
  clearTokens();
}

// --- Property Owners ---
export async function getOwners() {
  const res = await apiFetch('/api/owners/');
  if (!res.ok) throw new Error('Failed to fetch owners');
  return res.json();
}

export async function getOwner(id: number) {
  const res = await apiFetch(`/api/owners/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch owner');
  return res.json();
}

export async function createOwner(data: Record<string, unknown>) {
  const res = await apiFetch('/api/owners/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create owner');
  return res.json();
}

export async function updateOwner(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/owners/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update owner');
  return res.json();
}

export async function deleteOwner(id: number) {
  const res = await apiFetch(`/api/owners/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete owner');
}

// --- Properties ---
export async function getProperties(ownerId?: number) {
  const query = ownerId ? `?owner=${ownerId}` : '';
  const res = await apiFetch(`/api/properties/${query}`);
  if (!res.ok) throw new Error('Failed to fetch properties');
  return res.json();
}

export async function getProperty(id: number) {
  const res = await apiFetch(`/api/properties/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch property');
  return res.json();
}

export async function createProperty(data: Record<string, unknown>) {
  const res = await apiFetch('/api/properties/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create property');
  return res.json();
}

export async function updateProperty(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/properties/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update property');
  return res.json();
}

export async function deleteProperty(id: number) {
  const res = await apiFetch(`/api/properties/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete property');
}

export async function parseNotaryDeed(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/api/properties/parse-notary-deed/', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to parse notary deed');
  return res.json();
}

// --- Units ---
export async function getUnits(propertyId?: number) {
  const query = propertyId ? `?property=${propertyId}` : '';
  const res = await apiFetch(`/api/units/${query}`);
  if (!res.ok) throw new Error('Failed to fetch units');
  return res.json();
}

export async function createUnit(data: Record<string, unknown>) {
  const res = await apiFetch('/api/units/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create unit');
  return res.json();
}

export async function updateUnit(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/units/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update unit');
  return res.json();
}

export async function deleteUnit(id: number) {
  const res = await apiFetch(`/api/units/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete unit');
}

// --- Tenants ---
export async function getTenants(propertyId?: number) {
  const query = propertyId ? `?property=${propertyId}` : '';
  const res = await apiFetch(`/api/tenants/${query}`);
  if (!res.ok) throw new Error('Failed to fetch tenants');
  return res.json();
}

export async function getTenant(id: number) {
  const res = await apiFetch(`/api/tenants/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch tenant');
  return res.json();
}

export async function createTenant(data: Record<string, unknown>) {
  const res = await apiFetch('/api/tenants/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create tenant');
  return res.json();
}

export async function updateTenant(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/tenants/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update tenant');
  return res.json();
}

export async function deleteTenant(id: number) {
  const res = await apiFetch(`/api/tenants/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete tenant');
}

// --- Leases ---
export async function getLeases(propertyId?: number, status?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set('property', String(propertyId));
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/leases/${query}`);
  if (!res.ok) throw new Error('Failed to fetch leases');
  return res.json();
}

export async function getLease(id: number) {
  const res = await apiFetch(`/api/leases/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch lease');
  return res.json();
}

export async function createLease(data: Record<string, unknown>) {
  const res = await apiFetch('/api/leases/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create lease');
  return res.json();
}

export async function updateLease(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/leases/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update lease');
  return res.json();
}

export async function deleteLease(id: number) {
  const res = await apiFetch(`/api/leases/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete lease');
}

export async function generateLeasePayments(id: number) {
  const res = await apiFetch(`/api/leases/${id}/generate_payments/`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to generate payments');
  return res.json();
}

// --- Rent Payments ---
export async function getRentPayments(leaseId?: number, status?: string) {
  const params = new URLSearchParams();
  if (leaseId) params.set('lease', String(leaseId));
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/rent-payments/${query}`);
  if (!res.ok) throw new Error('Failed to fetch rent payments');
  return res.json();
}

export async function createRentPayment(data: Record<string, unknown>) {
  const res = await apiFetch('/api/rent-payments/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create rent payment');
  return res.json();
}

export async function updateRentPayment(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/rent-payments/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update rent payment');
  return res.json();
}

export async function batchMarkPaid(paymentIds: number[], method: string, paymentDate: string) {
  const res = await apiFetch('/api/rent-payments/batch-mark-paid/', {
    method: 'POST',
    body: JSON.stringify({ payment_ids: paymentIds, method, payment_date: paymentDate }),
  });
  if (!res.ok) throw new Error('Failed to batch mark paid');
  return res.json();
}

// --- Expenses ---
export async function getExpenses(propertyId?: number, category?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set('property', String(propertyId));
  if (category) params.set('category', category);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/expenses/${query}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

export async function getExpense(id: number) {
  const res = await apiFetch(`/api/expenses/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch expense');
  return res.json();
}

export async function createExpense(data: Record<string, unknown>) {
  const res = await apiFetch('/api/expenses/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create expense');
  return res.json();
}

export async function updateExpense(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/expenses/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update expense');
  return res.json();
}

export async function deleteExpense(id: number) {
  const res = await apiFetch(`/api/expenses/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete expense');
}

// --- Documents ---
export async function getDocuments(propertyId?: number, type?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set('property', String(propertyId));
  if (type) params.set('type', type);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/documents/${query}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function uploadDocument(formData: FormData) {
  const res = await apiFetch('/api/documents/', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload document');
  return res.json();
}

export async function deleteDocument(id: number) {
  const res = await apiFetch(`/api/documents/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete document');
}

export async function getSmartFolders(propertyId: number) {
  const res = await apiFetch(`/api/documents/smart-folders/${propertyId}/`);
  if (!res.ok) throw new Error('Failed to fetch smart folders');
  return res.json();
}

export async function getComplianceSummary() {
  const res = await apiFetch('/api/documents/compliance/');
  if (!res.ok) throw new Error('Failed to fetch compliance summary');
  return res.json();
}

// --- Notifications ---
export async function getNotifications(type?: string, read?: string) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (read) params.set('read', read);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/notifications/${query}`);
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function markNotificationRead(id: number) {
  const res = await apiFetch(`/api/notifications/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ read_status: true }),
  });
  if (!res.ok) throw new Error('Failed to mark notification');
  return res.json();
}

export async function getUnreadCount() {
  const res = await apiFetch('/api/notifications/unread-count/');
  if (!res.ok) throw new Error('Failed to fetch unread count');
  return res.json();
}

export async function markAllNotificationsRead() {
  const res = await apiFetch('/api/notifications/mark-all-read/', {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to mark all read');
  return res.json();
}

export async function dismissNotification(id: number) {
  const res = await apiFetch(`/api/notifications/${id}/dismiss/`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to dismiss notification');
}

// --- Dashboard ---
export async function getDashboardSummary() {
  const res = await apiFetch('/api/dashboard/summary/');
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}

// --- Finance Summary ---
export async function getFinanceSummary() {
  const res = await apiFetch('/api/finance/summary/');
  if (!res.ok) throw new Error('Failed to fetch finance summary');
  return res.json();
}

// --- Problems ---
export async function getProblems(propertyId?: number, status?: string, priority?: string, category?: string) {
  const params = new URLSearchParams();
  if (propertyId) params.set('property', String(propertyId));
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (category) params.set('category', category);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/problems/${query}`);
  if (!res.ok) throw new Error('Failed to fetch problems');
  return res.json();
}

export async function getProblem(id: number) {
  const res = await apiFetch(`/api/problems/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch problem');
  return res.json();
}

export async function createProblem(data: Record<string, unknown>) {
  const res = await apiFetch('/api/problems/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create problem');
  return res.json();
}

export async function updateProblem(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/problems/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update problem');
  return res.json();
}

export async function deleteProblem(id: number) {
  const res = await apiFetch(`/api/problems/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete problem');
}

export async function getProblemsSummary() {
  const res = await apiFetch('/api/problems/summary/');
  if (!res.ok) throw new Error('Failed to fetch problems summary');
  return res.json();
}

// --- Investments: Portfolios ---
export async function getPortfolios() {
  const res = await apiFetch('/api/portfolios/');
  if (!res.ok) throw new Error('Failed to fetch portfolios');
  return res.json();
}
export async function getPortfolio(id: number) {
  const res = await apiFetch(`/api/portfolios/${id}/`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function createPortfolio(data: Record<string, unknown>) {
  const res = await apiFetch('/api/portfolios/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function updatePortfolio(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/portfolios/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deletePortfolio(id: number) {
  const res = await apiFetch(`/api/portfolios/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}
export async function getPortfolioSummary(id: number) {
  const res = await apiFetch(`/api/portfolios/${id}/summary/`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// --- Investments: Holdings ---
export async function getHoldings(portfolioId?: number, assetType?: string, search?: string) {
  const params = new URLSearchParams();
  if (portfolioId) params.set('portfolio', String(portfolioId));
  if (assetType) params.set('asset_type', assetType);
  if (search) params.set('search', search);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/holdings/${query}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function getHolding(id: number) {
  const res = await apiFetch(`/api/holdings/${id}/`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function createHolding(data: Record<string, unknown>) {
  const res = await apiFetch('/api/holdings/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function updateHolding(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/holdings/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deleteHolding(id: number) {
  const res = await apiFetch(`/api/holdings/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}
export async function bulkUploadHoldings(data: Record<string, unknown>) {
  const res = await apiFetch('/api/holdings/bulk_upload/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// --- Investments: Transactions ---
export async function getTransactions(holdingId?: number, type?: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (holdingId) params.set('holding', String(holdingId));
  if (type) params.set('type', type);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/transactions/${query}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function createTransaction(data: Record<string, unknown>) {
  const res = await apiFetch('/api/transactions/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deleteTransaction(id: number) {
  const res = await apiFetch(`/api/transactions/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}
export async function getDividendSummary() {
  const res = await apiFetch('/api/transactions/dividends/');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// --- Investments: Watchlist ---
export async function getWatchlist() {
  const res = await apiFetch('/api/watchlist/');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function createWatchlistItem(data: Record<string, unknown>) {
  const res = await apiFetch('/api/watchlist/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deleteWatchlistItem(id: number) {
  const res = await apiFetch(`/api/watchlist/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}

// --- Investments: Price Alerts ---
export async function getPriceAlerts() {
  const res = await apiFetch('/api/price-alerts/');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function createPriceAlert(data: Record<string, unknown>) {
  const res = await apiFetch('/api/price-alerts/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deletePriceAlert(id: number) {
  const res = await apiFetch(`/api/price-alerts/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}

// --- Investments: Dashboard & Reports ---
export async function getInvestmentDashboard() {
  const res = await apiFetch('/api/investment-dashboard/');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function getTaxReport(year: number, portfolioId?: number) {
  const params = new URLSearchParams({ year: String(year) });
  if (portfolioId) params.set('portfolio', String(portfolioId));
  const res = await apiFetch(`/api/tax-report/?${params}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// --- Deal Analyzer ---
export async function getMarketData() {
  const res = await apiFetch('/api/market-data/');
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function analyzeProperty(data: Record<string, unknown>) {
  const res = await apiFetch('/api/analyze-property/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function getPropertyAnalyses(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {});
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/property-analyses/${query}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function reanalyzeProperty(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/analyze-property/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}
export async function deletePropertyAnalysis(id: number) {
  const res = await apiFetch(`/api/property-analyses/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed');
}

// --- Music: Songs ---
export async function getSongs(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/songs/${query}`);
  if (!res.ok) throw new Error('Failed to fetch songs');
  return res.json();
}

export async function uploadSong(formData: FormData) {
  const res = await apiFetch('/api/songs/', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload song');
  return res.json();
}

export async function updateSong(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/songs/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update song');
  return res.json();
}

export async function deleteSong(id: number) {
  const res = await apiFetch(`/api/songs/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete song');
}

// --- Music: Playlists ---
export async function getPlaylists() {
  const res = await apiFetch('/api/playlists/');
  if (!res.ok) throw new Error('Failed to fetch playlists');
  return res.json();
}

export async function getPlaylist(id: number) {
  const res = await apiFetch(`/api/playlists/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch playlist');
  return res.json();
}

export async function createPlaylist(data: Record<string, unknown>) {
  const res = await apiFetch('/api/playlists/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create playlist');
  return res.json();
}

export async function updatePlaylist(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/playlists/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update playlist');
  return res.json();
}

export async function deletePlaylist(id: number) {
  const res = await apiFetch(`/api/playlists/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete playlist');
}

export async function addSongToPlaylist(playlistId: number, songId: number) {
  const res = await apiFetch(`/api/playlists/${playlistId}/add-song/`, {
    method: 'POST',
    body: JSON.stringify({ song_id: songId }),
  });
  if (!res.ok) throw new Error('Failed to add song to playlist');
  return res.json();
}

export async function removeSongFromPlaylist(playlistId: number, songId: number) {
  const res = await apiFetch(`/api/playlists/${playlistId}/remove-song/`, {
    method: 'POST',
    body: JSON.stringify({ song_id: songId }),
  });
  if (!res.ok) throw new Error('Failed to remove song from playlist');
  return res.json();
}

// --- Music: Engagement (favorites, play tracking, recently played) ---
export async function toggleSongFavorite(id: number) {
  const res = await apiFetch(`/api/songs/${id}/favorite/`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle favorite');
  return res.json();
}

export async function recordSongPlay(id: number) {
  const res = await apiFetch(`/api/songs/${id}/play/`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to record play');
  return res.json();
}

export async function getRecentlyPlayed() {
  const res = await apiFetch('/api/songs/recently-played/');
  if (!res.ok) throw new Error('Failed to fetch recently played');
  return res.json();
}

export async function getMusicStats() {
  const res = await apiFetch('/api/songs/stats/');
  if (!res.ok) throw new Error('Failed to fetch music stats');
  return res.json();
}

// --- Notes: Folders ---
export async function getNoteFolders() {
  const res = await apiFetch('/api/notes/folders/');
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function createNoteFolder(data: Record<string, unknown>) {
  const res = await apiFetch('/api/notes/folders/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create folder');
  return res.json();
}

export async function updateNoteFolder(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/notes/folders/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update folder');
  return res.json();
}

export async function deleteNoteFolder(id: number) {
  const res = await apiFetch(`/api/notes/folders/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete folder');
}

// --- Notes: Tags ---
export async function getNoteTags() {
  const res = await apiFetch('/api/notes/tags/');
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

export async function createNoteTag(data: Record<string, unknown>) {
  const res = await apiFetch('/api/notes/tags/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create tag');
  return res.json();
}

export async function updateNoteTag(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/notes/tags/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update tag');
  return res.json();
}

export async function deleteNoteTag(id: number) {
  const res = await apiFetch(`/api/notes/tags/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete tag');
}

// --- Notes: CRUD ---
export async function getNotes(filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {});
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/notes/${query}`);
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function getNote(id: number) {
  const res = await apiFetch(`/api/notes/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch note');
  return res.json();
}

export async function createNote(data: Record<string, unknown>) {
  const res = await apiFetch('/api/notes/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create note');
  return res.json();
}

export async function updateNote(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/notes/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update note');
  return res.json();
}

export async function deleteNote(id: number) {
  const res = await apiFetch(`/api/notes/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete note');
}

export async function duplicateNote(id: number) {
  const res = await apiFetch(`/api/notes/${id}/duplicate/`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to duplicate note');
  return res.json();
}

export async function quickCaptureNote(data: Record<string, unknown>) {
  const res = await apiFetch('/api/notes/quick-capture/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create quick note');
  return res.json();
}

export async function getNoteSummary() {
  const res = await apiFetch('/api/notes/summary/');
  if (!res.ok) throw new Error('Failed to fetch note summary');
  return res.json();
}

// --- Health Tracker ---

export async function getHealthDashboard(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/dashboard/${query}`);
  if (!res.ok) throw new Error('Failed to fetch health dashboard');
  return res.json();
}

export async function getTestPanel(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/test-panel/${query}`);
  if (!res.ok) throw new Error('Failed to fetch test panel');
  return res.json();
}

export async function getHealthProfiles() {
  const res = await apiFetch('/api/health/profiles/');
  if (!res.ok) throw new Error('Failed to fetch health profiles');
  return res.json();
}

export async function createHealthProfile(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/profiles/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create profile');
  return res.json();
}

export async function updateHealthProfile(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/profiles/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function deleteHealthProfile(id: number) {
  const res = await apiFetch(`/api/health/profiles/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete profile');
}

export async function getBloodReports(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/reports/${query}`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  return res.json();
}

export async function getBloodReport(id: number) {
  const res = await apiFetch(`/api/health/reports/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function createBloodReport(formData: FormData) {
  const res = await apiFetch('/api/health/reports/', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Failed to create report');
  return res.json();
}

export async function deleteBloodReport(id: number) {
  const res = await apiFetch(`/api/health/reports/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete report');
}

export async function bulkUploadReports(formData: FormData) {
  const res = await apiFetch('/api/health/reports/bulk-upload/', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Failed to bulk upload');
  return res.json();
}

export async function saveManualResults(reportId: number, results: Array<{biomarker: number; value: number; unit?: string}>) {
  const res = await apiFetch(`/api/health/reports/${reportId}/results/`, {
    method: 'POST', body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error('Failed to save results');
  return res.json();
}

export async function getBiomarkers(category?: string) {
  const query = category ? `?category=${category}` : '';
  const res = await apiFetch(`/api/health/biomarkers/${query}`);
  if (!res.ok) throw new Error('Failed to fetch biomarkers');
  return res.json();
}

export async function getBiomarkerHistory(biomarkerId: number, profileId: number) {
  const res = await apiFetch(`/api/health/biomarker-history/${biomarkerId}/?profile=${profileId}`);
  if (!res.ok) throw new Error('Failed to fetch biomarker history');
  return res.json();
}

export async function compareReports(reportAId: number, reportBId: number) {
  const res = await apiFetch(`/api/health/compare/?report_a=${reportAId}&report_b=${reportBId}`);
  if (!res.ok) throw new Error('Failed to compare reports');
  return res.json();
}

// --- Blood Pressure ---
export async function getBPDashboard(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/bp/dashboard/${query}`);
  if (!res.ok) throw new Error('Failed to fetch BP dashboard');
  return res.json();
}

export async function getBPReadings(filters?: string) {
  const res = await apiFetch(`/api/health/bp/readings/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch BP readings');
  return res.json();
}

export async function createBPReading(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/bp/readings/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create BP reading');
  return res.json();
}

export async function deleteBPReading(id: number) {
  const res = await apiFetch(`/api/health/bp/readings/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete BP reading');
}

export async function getBPSessions(filters?: string) {
  const res = await apiFetch(`/api/health/bp/sessions/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch BP sessions');
  return res.json();
}

export async function createBPSession(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/bp/sessions/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create BP session');
  return res.json();
}

export async function getBPStatistics(profileId: number, days?: number) {
  const params = [`profile=${profileId}`];
  if (days) params.push(`days=${days}`);
  const res = await apiFetch(`/api/health/bp/statistics/?${params.join('&')}`);
  if (!res.ok) throw new Error('Failed to fetch BP statistics');
  return res.json();
}

export async function getCardiovascularRisk(profileId: number) {
  const res = await apiFetch(`/api/health/bp/cardiovascular-risk/?profile=${profileId}`);
  if (!res.ok) throw new Error('Failed to fetch cardiovascular risk');
  return res.json();
}

export async function getBPMedications(filters?: string) {
  const res = await apiFetch(`/api/health/bp/medications/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch BP medications');
  return res.json();
}

export async function createBPMedication(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/bp/medications/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create BP medication');
  return res.json();
}

export async function updateBPMedication(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/bp/medications/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update BP medication');
  return res.json();
}

export async function deleteBPMedication(id: number) {
  const res = await apiFetch(`/api/health/bp/medications/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete BP medication');
}

export async function createBPMedLog(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/bp/med-logs/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create med log');
  return res.json();
}

export async function getBPMedLogs(filters?: string) {
  const res = await apiFetch(`/api/health/bp/med-logs/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch med logs');
  return res.json();
}

export async function getBPAlerts(filters?: string) {
  const res = await apiFetch(`/api/health/bp/alerts/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch BP alerts');
  return res.json();
}

export async function markBPAlertRead(id: number) {
  const res = await apiFetch(`/api/health/bp/alerts/${id}/mark_read/`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to mark alert as read');
  return res.json();
}

export async function markAllBPAlertsRead(profileId?: number) {
  const res = await apiFetch('/api/health/bp/alerts/mark_all_read/', {
    method: 'POST',
    body: JSON.stringify(profileId ? { profile: profileId } : {}),
  });
  if (!res.ok) throw new Error('Failed to mark all alerts as read');
  return res.json();
}

export async function getMedicationEffectiveness(medicationId: number) {
  const res = await apiFetch(`/api/health/bp/medication-effectiveness/?medication=${medicationId}`);
  if (!res.ok) throw new Error('Failed to fetch medication effectiveness');
  return res.json();
}

// --- Vehicles ---
export async function getVehicles(filters?: string) {
  const res = await apiFetch(`/api/vehicles/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch vehicles');
  return res.json();
}

export async function getVehicle(id: number) {
  const res = await apiFetch(`/api/vehicles/${id}/`);
  if (!res.ok) throw new Error('Failed to fetch vehicle');
  return res.json();
}

export async function createVehicle(data: Record<string, unknown>) {
  const res = await apiFetch('/api/vehicles/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create vehicle');
  return res.json();
}

export async function updateVehicle(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/vehicles/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update vehicle');
  return res.json();
}

export async function deleteVehicle(id: number) {
  const res = await apiFetch(`/api/vehicles/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete vehicle');
}

export async function getVehicleSummary() {
  const res = await apiFetch('/api/vehicles/summary/');
  if (!res.ok) throw new Error('Failed to fetch vehicle summary');
  return res.json();
}

export async function getVehicleCostReport(year?: number) {
  const res = await apiFetch(`/api/vehicles/cost-report/${year ? '?year=' + year : ''}`);
  if (!res.ok) throw new Error('Failed to fetch cost report');
  return res.json();
}

export async function getVehicleObligations(vehicleId: number, filters?: string) {
  const res = await apiFetch(`/api/vehicles/${vehicleId}/obligations/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch obligations');
  return res.json();
}

export async function createObligation(vehicleId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/vehicles/${vehicleId}/obligations/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create obligation');
  return res.json();
}

export async function updateObligation(obligationId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/vehicles/obligations/${obligationId}/`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update obligation');
  return res.json();
}

export async function deleteObligation(obligationId: number) {
  const res = await apiFetch(`/api/vehicles/obligations/${obligationId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete obligation');
}

export async function renewObligation(obligationId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/vehicles/obligations/${obligationId}/renew/`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to renew obligation');
  return res.json();
}

export async function createVehiclePresets(vehicleId: number) {
  const res = await apiFetch(`/api/vehicles/${vehicleId}/presets/`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create presets');
  return res.json();
}

export async function uploadObligationFile(obligationId: number, file: File, label?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (label) formData.append('label', label);
  const res = await apiFetch(`/api/vehicles/obligations/${obligationId}/files/`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
}

export async function deleteObligationFile(fileId: number) {
  const res = await apiFetch(`/api/vehicles/obligations/files/${fileId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete file');
}

// --- WHOOP Recovery ---
export async function getWhoopStatus() {
  const res = await apiFetch('/api/health/whoop/status/');
  if (!res.ok) throw new Error('Failed to fetch WHOOP status');
  return res.json();
}

export async function getWhoopConnectUrl() {
  const res = await apiFetch('/api/health/whoop/connect/');
  if (!res.ok) throw new Error('Failed to get WHOOP connect URL');
  return res.json();
}

export async function whoopCallback(code: string) {
  const res = await apiFetch('/api/health/whoop/callback/', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `WHOOP callback failed (${res.status})`);
  }
  return res.json();
}

export async function whoopSync() {
  const res = await apiFetch('/api/health/whoop/sync/', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sync WHOOP data');
  return res.json();
}

export async function whoopDisconnect() {
  const res = await apiFetch('/api/health/whoop/disconnect/', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to disconnect WHOOP');
  return res.json();
}

export async function getWhoopDashboard() {
  const res = await apiFetch('/api/health/whoop/dashboard/');
  if (!res.ok) throw new Error('Failed to fetch WHOOP dashboard');
  return res.json();
}

export async function getWhoopRecoveryHistory(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/recoveries/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch recovery history');
  return res.json();
}

export async function getWhoopSleepHistory(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/sleeps/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch sleep history');
  return res.json();
}

export async function getWhoopWorkouts(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/workouts/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch workouts');
  return res.json();
}

export async function getWhoopRecoveryStats(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/recovery-stats/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch recovery stats');
  return res.json();
}

// Combined stats for the stats page — fetches all 3 endpoints, merges into flat structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWhoopStats(filters?: string): Promise<any> {
  const qs = filters ? '?' + filters : '';
  const [recovery, sleep, strain] = await Promise.all([
    apiFetch(`/api/health/whoop/recovery-stats/${qs}`).then(r => r.ok ? r.json() : {}),
    apiFetch(`/api/health/whoop/sleep-stats/${qs}`).then(r => r.ok ? r.json() : {}),
    apiFetch(`/api/health/whoop/strain-stats/${qs}`).then(r => r.ok ? r.json() : {}),
  ]);
  // Merge into the flat shape the stats page expects
  return { ...recovery, ...sleep, ...strain };
}

export async function getWhoopSleepStats(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/sleep-stats/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch sleep stats');
  return res.json();
}

export async function getWhoopStrainStats(filters?: string) {
  const res = await apiFetch(`/api/health/whoop/strain-stats/${filters ? '?' + filters : ''}`);
  if (!res.ok) throw new Error('Failed to fetch strain stats');
  return res.json();
}

export async function getWhoopCVFitness() {
  const res = await apiFetch('/api/health/whoop/cardiovascular-fitness/');
  if (!res.ok) throw new Error('Failed to fetch CV fitness');
  return res.json();
}

export async function getWhoopTrainingRecommendation() {
  const res = await apiFetch('/api/health/whoop/training-recommendation/');
  if (!res.ok) throw new Error('Failed to fetch training recommendation');
  return res.json();
}

// --- Life (unified HealthScore + Interventions) ---

export async function getLifeSummary(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/life-summary/${query}`);
  if (!res.ok) throw new Error('Failed to fetch life summary');
  return res.json();
}

export async function getInterventions(params?: { category?: string; active?: boolean; profile?: number }) {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.active !== undefined) qs.set('active', String(params.active));
  if (params?.profile) qs.set('profile', String(params.profile));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiFetch(`/api/health/interventions/${query}`);
  if (!res.ok) throw new Error('Failed to fetch interventions');
  return res.json();
}

export async function createIntervention(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/interventions/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create intervention');
  return res.json();
}

export async function updateIntervention(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/interventions/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update intervention');
  return res.json();
}

export async function deleteIntervention(id: number) {
  const res = await apiFetch(`/api/health/interventions/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete intervention');
}

export async function getInterventionLogs(date?: string) {
  const q = date ? `?date=${date}` : '';
  const res = await apiFetch(`/api/health/interventions/logs/${q}`);
  if (!res.ok) throw new Error('Failed to fetch intervention logs');
  return res.json();
}

export async function saveInterventionLogs(date: string, logs: { intervention: number; taken: boolean; notes?: string }[]) {
  const res = await apiFetch(`/api/health/interventions/logs/`, {
    method: 'POST', body: JSON.stringify({ date, logs }),
  });
  if (!res.ok) throw new Error('Failed to save intervention logs');
  return res.json();
}

export async function getLabOrder(profileId?: number) {
  const query = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/lab-order/${query}`);
  if (!res.ok) throw new Error('Failed to fetch lab order');
  return res.json();
}

// ─── Weight + Vitals (unified weight + BP module) ─────────────────────
// §NAV: backend at backend/health/weight_views.py
// §V1:  readings CRUD, goals, vitals dashboard, bp-per-kg slope,
//       cardiometabolic age, stage regression forecast.

export async function getWeightReadings(params?: {
  profile?: number; days?: number; source?: string;
}) {
  const q = new URLSearchParams();
  if (params?.profile) q.set('profile', String(params.profile));
  if (params?.days) q.set('days', String(params.days));
  if (params?.source) q.set('source', params.source);
  const res = await apiFetch(`/api/health/weight/readings/?${q}`);
  if (!res.ok) throw new Error('Failed to fetch weight readings');
  return res.json();
}

export async function createWeightReading(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/weight/readings/', {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.weight_kg?.[0] || 'Failed to create reading');
  }
  return res.json();
}

export async function updateWeightReading(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/weight/readings/${id}/`, {
    method: 'PATCH', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update reading');
  return res.json();
}

export async function deleteWeightReading(id: number) {
  const res = await apiFetch(`/api/health/weight/readings/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete reading');
  return true;
}

export async function getWeightDashboard(profileId: number) {
  const res = await apiFetch(`/api/health/weight/dashboard/?profile=${profileId}`);
  if (!res.ok) throw new Error('Failed to fetch weight dashboard');
  return res.json();
}

export async function getWeightGoals(params?: { profile?: number; active?: boolean }) {
  const q = new URLSearchParams();
  if (params?.profile) q.set('profile', String(params.profile));
  if (params?.active !== undefined) q.set('active', String(params.active));
  const res = await apiFetch(`/api/health/weight/goals/?${q}`);
  if (!res.ok) throw new Error('Failed to fetch goals');
  return res.json();
}

export async function createWeightGoal(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/weight/goals/', {
    method: 'POST', body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.weekly_rate_kg?.[0] || err.detail || 'Failed to create goal');
  }
  return res.json();
}

export async function updateWeightGoal(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/weight/goals/${id}/`, {
    method: 'PATCH', body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update goal');
  return res.json();
}

export async function deleteWeightGoal(id: number) {
  const res = await apiFetch(`/api/health/weight/goals/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete goal');
  return true;
}

export async function createVitalsSession(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/vitals/sessions/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create vitals session');
  return res.json();
}

export async function finalizeVitalsSession(id: number) {
  const res = await apiFetch(`/api/health/vitals/sessions/${id}/finalize/`, { method: 'POST', body: '{}' });
  if (!res.ok) throw new Error('Failed to finalize vitals session');
  return res.json();
}

export async function getVitalsDashboard(profileId: number) {
  const res = await apiFetch(`/api/health/vitals/dashboard/?profile=${profileId}`);
  if (!res.ok) throw new Error('Failed to fetch vitals dashboard');
  return res.json();
}

export async function getBPPerKgSlope(profileId: number, days = 90) {
  const res = await apiFetch(`/api/health/vitals/bp-per-kg-slope/?profile=${profileId}&days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch slope');
  return res.json();
}

export async function getCardiometabolicAge(profileId: number) {
  const res = await apiFetch(`/api/health/vitals/cardiometabolic-age/?profile=${profileId}`);
  if (!res.ok) throw new Error('Failed to fetch cardiometabolic age');
  return res.json();
}

export async function getStageRegressionForecast(profileId: number, targetSystolic = 120) {
  const res = await apiFetch(
    `/api/health/vitals/stage-regression-forecast/?profile=${profileId}&target_systolic=${targetSystolic}`
  );
  if (!res.ok) throw new Error('Failed to fetch forecast');
  return res.json();
}

export async function importWeightCSV(profileId: number, file: File) {
  const form = new FormData();
  form.append('profile', String(profileId));
  form.append('file', file);
  const res = await apiFetch('/api/health/weight/import/csv/', {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error('CSV import failed');
  return res.json();
}

// ═══ PROPERTY TAXES ═══

export async function getPropertyTaxes(propertyId: number, current?: boolean) {
  const params = current ? '?current=true' : '';
  const res = await apiFetch(`/api/properties/${propertyId}/taxes/${params}`);
  if (!res.ok) throw new Error('Failed to fetch taxes');
  return res.json();
}

export async function createPropertyTax(propertyId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/properties/${propertyId}/taxes/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create tax');
  return res.json();
}

export async function updatePropertyTax(taxId: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/taxes/${taxId}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update tax');
  return res.json();
}

export async function deletePropertyTax(taxId: number) {
  const res = await apiFetch(`/api/taxes/${taxId}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete tax');
}

export async function markTaxPaid(taxId: number, paidUntil?: string) {
  const res = await apiFetch(`/api/taxes/${taxId}/mark-paid/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paid_until: paidUntil }),
  });
  if (!res.ok) throw new Error('Failed to mark tax paid');
  return res.json();
}

export async function createTaxPresets(propertyId: number) {
  const res = await apiFetch(`/api/properties/${propertyId}/taxes/presets/`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create presets');
  return res.json();
}

export async function getCountryTaxInfo(country: string) {
  const res = await apiFetch(`/api/taxes/country-info/?country=${encodeURIComponent(country)}`);
  if (!res.ok) throw new Error('Failed to fetch country info');
  return res.json();
}

export async function getTaxSummary() {
  const res = await apiFetch('/api/taxes/summary/');
  if (!res.ok) throw new Error('Failed to fetch tax summary');
  return res.json();
}

// ═══ GOUT & JOINT HEALTH ═══

export async function getGoutDashboard(profileId?: number) {
  const params = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/gout/dashboard/${params}`);
  if (!res.ok) throw new Error('Failed to fetch gout dashboard');
  return res.json();
}

export async function getGoutAttacks(profileId?: number, joint?: string) {
  const params = new URLSearchParams();
  if (profileId) params.set('profile', String(profileId));
  if (joint) params.set('joint', joint);
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/health/gout/attacks/${q}`);
  if (!res.ok) throw new Error('Failed to fetch attacks');
  return res.json();
}

export async function createGoutAttack(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/gout/attacks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create attack');
  return res.json();
}

export async function updateGoutAttack(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/gout/attacks/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update attack');
  return res.json();
}

export async function deleteGoutAttack(id: number) {
  const res = await apiFetch(`/api/health/gout/attacks/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete attack');
}

export async function getUricAcidReadings(profileId?: number) {
  const params = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/gout/uric-acid/${params}`);
  if (!res.ok) throw new Error('Failed to fetch readings');
  return res.json();
}

export async function createUricAcidReading(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/gout/uric-acid/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create reading');
  return res.json();
}

export async function getGoutProcedures(profileId?: number) {
  const params = profileId ? `?profile=${profileId}` : '';
  const res = await apiFetch(`/api/health/gout/procedures/${params}`);
  if (!res.ok) throw new Error('Failed to fetch procedures');
  return res.json();
}

export async function createGoutProcedure(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/gout/procedures/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create procedure');
  return res.json();
}

export async function getGoutStatistics(profileId?: number, days?: number) {
  const params = new URLSearchParams();
  if (profileId) params.set('profile', String(profileId));
  if (days) params.set('days', String(days));
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/health/gout/statistics/${q}`);
  if (!res.ok) throw new Error('Failed to fetch statistics');
  return res.json();
}

// ═══ DAILY RITUAL / HEALTH PROTOCOL ═══

export async function getRitualDashboard(date?: string) {
  const params = date ? `?date=${date}` : '';
  const res = await apiFetch(`/api/health/ritual/dashboard/${params}`);
  if (!res.ok) throw new Error('Failed to fetch ritual');
  return res.json();
}

export async function toggleRitualItem(itemId: number, date?: string) {
  const res = await apiFetch(`/api/health/ritual/toggle/${itemId}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) throw new Error('Failed to toggle');
  return res.json();
}

export async function seedRitualProtocol(profileId?: number) {
  const res = await apiFetch('/api/health/ritual/seed/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: profileId }),
  });
  if (!res.ok) throw new Error('Failed to seed');
  return res.json();
}

export async function getRitualAdherence(days?: number) {
  const params = days ? `?days=${days}` : '';
  const res = await apiFetch(`/api/health/ritual/adherence/${params}`);
  if (!res.ok) throw new Error('Failed to fetch adherence');
  return res.json();
}

export async function createRitualItem(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/ritual/items/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create item');
  return res.json();
}

export async function updateRitualItem(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/health/ritual/items/${id}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update');
  return res.json();
}

export async function deleteRitualItem(id: number) {
  const res = await apiFetch(`/api/health/ritual/items/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

export async function uploadRxImage(itemId: number, file: File) {
  const form = new FormData();
  form.append('image', file);
  const res = await apiFetch(`/api/health/ritual/upload-rx/${itemId}/`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to upload');
  return res.json();
}

export async function getBodyMeasurements(site?: string) {
  const params = site ? `?site=${site}` : '';
  const res = await apiFetch(`/api/health/ritual/measurements/${params}`);
  if (!res.ok) throw new Error('Failed to fetch measurements');
  return res.json();
}

export async function createBodyMeasurement(data: Record<string, unknown>) {
  const res = await apiFetch('/api/health/ritual/measurements/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create measurement');
  return res.json();
}

// --- Mobile Health: Measurements (simple tracking) ---
export async function getMeasurements(type?: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/measurements/${query}`);
  if (!res.ok) throw new Error('Failed to fetch measurements');
  return res.json();
}

export async function createMeasurement(data: Record<string, unknown>) {
  const res = await apiFetch('/api/measurements/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create measurement');
  return res.json();
}

export async function deleteMeasurement(id: number) {
  const res = await apiFetch(`/api/measurements/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete measurement');
}

// --- Mobile Health: Food Entries ---
export async function getFoodEntries(date?: string, meal?: string) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (meal) params.set('meal', meal);
  const query = params.toString() ? `?${params}` : '';
  const res = await apiFetch(`/api/food-entries/${query}`);
  if (!res.ok) throw new Error('Failed to fetch food entries');
  return res.json();
}

export async function createFoodEntry(data: Record<string, unknown>) {
  const res = await apiFetch('/api/food-entries/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create food entry');
  return res.json();
}

export async function deleteFoodEntry(id: number) {
  const res = await apiFetch(`/api/food-entries/${id}/`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete food entry');
}

// --- Mobile Health: Daily Rituals ---
export async function getDailyRituals(date?: string) {
  const query = date ? `?date=${date}` : '';
  const res = await apiFetch(`/api/daily-rituals/${query}`);
  if (!res.ok) throw new Error('Failed to fetch daily rituals');
  return res.json();
}

export async function createDailyRitual(data: Record<string, unknown>) {
  const res = await apiFetch('/api/daily-rituals/', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create daily ritual');
  return res.json();
}

export async function updateDailyRitual(id: number, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/daily-rituals/${id}/`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update daily ritual');
  return res.json();
}

// --- Mobile Health: Summary ---
export async function getHealthSummary() {
  const res = await apiFetch('/api/health/summary/');
  if (!res.ok) throw new Error('Failed to fetch health summary');
  return res.json();
}
