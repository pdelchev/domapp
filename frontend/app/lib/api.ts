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