function normalizeApiBase(url: string) {
  const normalized = url.replace(/\/+$/, '');
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
}

import type {
  CreatePOSTransactionDto,
  CreatePOSTransactionResponse,
  POSCustomerSearchQuery,
  POSCustomerSearchResponse,
  POSMotorcycleSearchQuery,
  POSActiveReservationsQuery,
  ValidatePOSTransactionDto,
  ValidatePOSTransactionResponse,
  QueueOfflineOperationDto,
} from '../../../packages/shared-types/src/pos';

const configuredApiUrl = import.meta.env.VITE_API_URL || 'https://api-production-2c752.up.railway.app/api/v1';
const API_BASE = normalizeApiBase(configuredApiUrl);

export function getApiErrorMessage(reason: unknown, fallback = 'Request failed') {
  if (reason instanceof Error && reason.message) {
    if (reason.name === 'TypeError' && /fetch|network|failed/i.test(reason.message)) return 'Network unavailable. Check the connection and try again.';
    return reason.message;
  }
  return fallback;
}

let authToken: string | null = localStorage.getItem('pos_token');

export interface DesktopUser {
  id: string;
  name: string;
  email: string;
  role: {
    id: string;
    name: string;
    permissions: Array<{ resource: string; action: string }>;
  };
  branchId?: string | null;
  branch?: { id: string; nameAr: string; nameEn: string } | null;
  whatsappSenderNumber?: string | null;
  lang: 'ar' | 'en';
}

export interface BranchSummary {
  id: string;
  nameAr: string;
  nameEn: string;
  isActive?: boolean;
  address?: string | null;
  phone?: string | null;
}

export interface RoleSummary {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  whatsappSenderNumber?: string | null;
  role: { id: string; name: string };
  branch?: BranchSummary | null;
  isActive: boolean;
  salary?: number | null;
  lang?: 'ar' | 'en';
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roleId: string;
  branchId?: string;
  whatsappSenderNumber?: string;
}

export interface SelfUpdateUserInput {
  name?: string;
  phone?: string;
  whatsappSenderNumber?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  phone?: string;
  whatsappSenderNumber?: string;
  roleId?: string;
  branchId?: string | null;
  lang?: 'ar' | 'en';
  isActive?: boolean;
  salary?: number | null;
}

export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('pos_token', token);
}

export function getToken() { return authToken; }
export function clearToken() { authToken = null; localStorage.removeItem('pos_token'); }
export function setUser(user: DesktopUser) { localStorage.setItem('pos_user', JSON.stringify(user)); }
export function getUser(): DesktopUser | null {
  const stored = localStorage.getItem('pos_user');
  if (!stored) return null;
  try { return JSON.parse(stored) as DesktopUser; } catch { return null; }
}
export function clearUser() { localStorage.removeItem('pos_user'); }

let refreshPromise: Promise<void> | null = null;

function refreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Session refresh failed');
      const json = await response.json();
      const token = json.data?.accessToken;
      if (!token) throw new Error('Session refresh returned no access token');
      setToken(token);
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function apiFetch<T>(path: string, options: RequestInit = {}, canRefresh = true): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  } catch (reason) {
    throw new Error(getApiErrorMessage(reason, 'Network unavailable. Check the connection and try again.'));
  }
  let json: Record<string, any> = {};
  try { json = await res.json() as Record<string, any>; } catch { /* Empty responses are valid for some requests. */ }
  if (res.status === 401 && canRefresh && path !== '/auth/login' && path !== '/auth/refresh') {
    try {
      await refreshAccessToken();
      return apiFetch<T>(path, options, false);
    } catch {
      clearToken();
      window.dispatchEvent(new Event('pos-auth-expired'));
    }
  }
  if (!res.ok) {
    const errorBody = json.error && typeof json.error === 'object' ? json.error : json;
    const err = new Error(errorBody.message ?? 'Request failed') as Error & { code?: string; status?: number; details?: unknown };
    err.code = errorBody.code;
    err.status = res.status;
    err.details = errorBody.details;
    throw err;
  }
  if (Array.isArray(json.data) && json.meta) {
    return { items: json.data, ...json.meta } as T;
  }
  if (Array.isArray(json.items) && json.meta) {
    return { items: json.items, ...json.meta } as T;
  }
  return (Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json) as T;
}

async function apiFetchBlob(path: string, canRefresh = true): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      credentials: 'include',
    });
  } catch (reason) {
    throw new Error(getApiErrorMessage(reason, 'Network unavailable. Check the connection and try again.'));
  }

  if (response.status === 401 && canRefresh) {
    try {
      await refreshAccessToken();
    } catch {
      clearToken();
      window.dispatchEvent(new Event('pos-auth-expired'));
      throw new Error('Session expired. Please sign in again.');
    }
    return apiFetchBlob(path, false);
  }

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const body = await response.json() as { error?: { message?: string }; message?: string };
      message = body.error?.message ?? body.message ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.blob();
}

// ─── Auth ────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string; user: DesktopUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiFetch<DesktopUser>('/auth/me'),
  logout: () => apiFetch<null>('/auth/logout', { method: 'POST' }),
};

export const branches = {
  list: (all?: boolean) => apiFetch<{ items: BranchSummary[]; total: number }>(`/branches?limit=100${all ? '' : '&isActive=true'}`),
  create: (data: Partial<BranchSummary>) => apiFetch<BranchSummary>('/branches', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<BranchSummary>) => apiFetch<BranchSummary>(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch<void>(`/branches/${id}`, { method: 'DELETE' }),
};

export const roles = {
  list: () => apiFetch<RoleSummary[]>('/roles'),
};

export const users = {
  list: () => apiFetch<{ items: UserListItem[]; total: number }>('/users?limit=100'),
  create: (data: CreateUserInput) => apiFetch<UserListItem>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateUserInput) => apiFetch<UserListItem>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
  me: () => apiFetch<UserListItem>('/users/me'),
  updateMe: (data: SelfUpdateUserInput) => apiFetch<UserListItem>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Types ───────────────────────────────────────────────
export type PurchaseStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseItem {
  id: string;
  model: string;
  vin?: string;
  quantity: number;
  unitCost: number | string;
  motorcycleId?: string;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplier?: { id: string; name: string; phone?: string };
  branchId: string;
  branch?: { nameEn: string; nameAr: string };
  status: PurchaseStatus;
  totalAmount: string;
  orderedAt?: string;
  receivedAt?: string;
  createdAt: string;
  items: PurchaseItem[];
}

export interface ReceiveItemInput { purchaseItemId: string; vin: string; engineNumber: string; fuelType: MotorcycleFuelType; }

export interface PurchaseCreateInput {
  supplierId: string;
  branchId: string;
  notes?: string;
  items: Array<{ model: string; vin?: string; quantity: number; unitCost: number }>;
}

// ─── Purchases API ───────────────────────────────────────
export const purchases = {
  list: (params?: { page?: number; limit?: number; status?: string; branchId?: string; supplierId?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.supplierId) q.set('supplierId', params.supplierId);
    if (params?.search) q.set('search', params.search);
    return apiFetch<{ items: Purchase[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(`/purchases?${q}`);
  },
  listPending: () =>
    apiFetch<{ items: Purchase[]; total: number }>('/purchases?status=ordered&limit=50')
      .then(async (res) => {
        const partial = await apiFetch<{ items: Purchase[]; total: number }>('/purchases?status=partially_received&limit=50');
        return { items: [...res.items, ...partial.items], total: res.total + partial.total };
      }),
  get: (id: string) => apiFetch<Purchase>(`/purchases/${id}`),
  create: (data: PurchaseCreateInput) =>
    apiFetch<Purchase>('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<PurchaseCreateInput>) =>
    apiFetch<Purchase>(`/purchases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  order: (id: string) => apiFetch<Purchase>(`/purchases/${id}/order`, { method: 'POST' }),
  cancel: (id: string) => apiFetch<Purchase>(`/purchases/${id}/cancel`, { method: 'POST' }),
  remove: (id: string) => apiFetch<void>(`/purchases/${id}`, { method: 'DELETE' }),
  receive: (id: string, items: ReceiveItemInput[]) =>
    apiFetch<Purchase>(`/purchases/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
};

// ─── Customers API (POS) ─────────────────────────────────
export interface CustomerSearchResult {
  id: string;
  customerCode?: string | null;
  name: string;
  phone: string;
  email?: string;
  nationalId?: string;
  defaultAddress?: {
    id?: string;
    addressLine: string;
    city?: string;
  } | null;
  recentOrderCount?: number;
  activeReservationCount?: number;
  lastTransactionDate?: string;
  isActive?: boolean;
}

export interface CustomerDetail {
  id: string;
  customerCode?: string | null;
  name: string;
  phone: string;
  email?: string;
  nationalId?: string;
  occupationAddress?: string | null;
  notes?: string;
  isActive: boolean;
  addresses: Array<{
    id: string;
    label: string;
    addressLine: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country: string;
    isDefault: boolean;
  }>;
  createdAt: string;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  nationalId?: string;
  occupationAddress?: string;
  notes?: string;
}

export const customers = {
  list: (params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) => {
    const q = new URLSearchParams();
    q.set('page', String(params?.page ?? 1));
    q.set('limit', String(params?.limit ?? 10));
    if (params?.search) q.set('search', params.search);
    if (params?.isActive !== undefined) q.set('isActive', String(params.isActive));
    return apiFetch<{ items: CustomerSearchResult[]; total: number; page: number; limit: number; totalPages: number }>(`/customers?${q}`);
  },
  search: (params: { q: string; limit?: number }) => {
    const q = new URLSearchParams();
    q.set('q', params.q);
    if (params.limit) q.set('limit', String(params.limit));
    return apiFetch<CustomerSearchResult[]>(`/customers/search?${q}`);
  },
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`),
  create: (data: CustomerInput) =>
    apiFetch<CustomerDetail>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CustomerInput>) =>
    apiFetch<CustomerDetail>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivate: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}/deactivate`, { method: 'POST' }),
  reactivate: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}/reactivate`, { method: 'POST' }),
};

export interface CustomerInquiry {
  id: string;
  customerId: string;
  customer: { id: string; customerCode?: string | null; name: string; phone: string };
  address: string;
  phone: string;
  occupation: string;
  occupationAddress: string;
  idCardFrontImage: string;
  idCardBackImage: string;
  createdBy: string;
  createdAt: string;
}

export interface CustomerInquiryInput {
  customerId: string;
  address: string;
  phone: string;
  occupation: string;
  occupationAddress: string;
  idCardFrontImage: File;
  idCardBackImage: File;
}

export const customerInquiries = {
  list: () => apiFetch<CustomerInquiry[]>('/customer-inquiries'),
  get: (id: string) => apiFetch<CustomerInquiry>(`/customer-inquiries/${id}`),
  create: (input: CustomerInquiryInput) => {
    const form = new FormData();
    form.set('customerId', input.customerId);
    form.set('address', input.address);
    form.set('phone', input.phone);
    form.set('occupation', input.occupation);
    form.set('occupationAddress', input.occupationAddress);
    form.set('idCardFrontImage', input.idCardFrontImage);
    form.set('idCardBackImage', input.idCardBackImage);
    return apiFetch<CustomerInquiry>('/customer-inquiries', { method: 'POST', body: form });
  },
  sendWhatsApp: (id: string) => apiFetch<{ phone: string; message: string }>(`/customer-inquiries/${id}/send-whatsapp`, { method: 'POST' }),
};

// ─── Motorcycles API (POS) ───────────────────────────────
export type MotorcycleFuelType = 'PETROL' | 'ELECTRIC';
export type MotorcycleCondition = 'NEW' | 'USED' | 'IMPORTED';

export interface MotorcycleSearchResult {
  id: string;
  vin: string;
  engineNumber?: string | null;
  engineSize?: string | null;
  fuelType?: MotorcycleFuelType | null;
  model: string;
  year: number;
  color?: string | null;
  price: number;
  costPrice?: number | null;
  condition?: MotorcycleCondition;
  status: string;
  brand: { id: string; nameEn: string; nameAr: string };
  branch: { id: string; nameEn: string; nameAr: string };
  category?: { id?: string; nameEn: string; nameAr: string };
  images?: string[];
}

export interface BrandSummary {
  id: string;
  nameEn: string;
  nameAr: string;
  isActive?: boolean;
}

export interface BrandRecord extends BrandSummary {
  logo?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { motorcycles: number };
}

export interface BrandInput {
  nameAr: string;
  nameEn: string;
  sortOrder?: number;
}

export interface BrandUpdateInput {
  nameAr?: string;
  nameEn?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface CategorySummary {
  id: string;
  nameEn: string;
  nameAr: string;
  parentId?: string | null;
  isActive?: boolean;
  depth?: number;
  path?: string;
}

export const brands = {
  list: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    return apiFetch<BrandSummary[]>(`/brands?${query}`);
  },
  listAll: async () => {
    const [active, inactive] = await Promise.all([
      apiFetch<BrandRecord[]>('/brands?isActive=true'),
      apiFetch<BrandRecord[]>('/brands?isActive=false'),
    ]);
    return [...active, ...inactive].sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  },
  create: (data: BrandInput) =>
    apiFetch<BrandRecord>('/brands', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: BrandUpdateInput) =>
    apiFetch<BrandRecord>(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    apiFetch<void>(`/brands/${id}`, { method: 'DELETE' }),
};

export const categories = {
  list: (params?: { isActive?: boolean; flat?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    if (params?.flat !== undefined) query.set('flat', String(params.flat));
    return apiFetch<CategorySummary[]>(`/categories?${query}`);
  },
};

export interface MotorcycleInput {
  vin?: string;
  engineNumber?: string;
  engineSize?: string;
  fuelType?: MotorcycleFuelType;
  model: string;
  year: number;
  color?: string;
  price?: number;
  costPrice?: number;
  condition?: MotorcycleCondition;
  brandId?: string;
  categoryId?: string;
  branchId?: string;
  images?: string[];
}

type MotorcycleCreatePayload = Required<Pick<MotorcycleInput, 'vin' | 'engineNumber' | 'fuelType' | 'model' | 'year' | 'price' | 'costPrice' | 'brandId' | 'categoryId' | 'branchId'>> & Pick<MotorcycleInput, 'color' | 'engineSize' | 'condition' | 'images'>;

export const motorcycles = {
  search: (params: { search?: string; branchId?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.branchId) q.set('branchId', params.branchId);
    if (params.status) q.set('status', params.status);
    if (params.limit) q.set('limit', String(params.limit));
    return apiFetch<{ items: MotorcycleSearchResult[]; total: number }>(`/motorcycles?${q}`);
  },
  get: (id: string) => apiFetch<MotorcycleSearchResult>(`/motorcycles/${id}`),
  create: (data: MotorcycleCreatePayload) => apiFetch<MotorcycleSearchResult>('/motorcycles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: MotorcycleInput) => apiFetch<MotorcycleSearchResult>(`/motorcycles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateColor: (id: string, color: string) => apiFetch<MotorcycleSearchResult>(`/motorcycles/${id}`, { method: 'PATCH', body: JSON.stringify({ color }) }),
  updateStatus: (id: string, status: string, reason?: string) => apiFetch<MotorcycleSearchResult>(`/motorcycles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  remove: (id: string) => apiFetch<void>(`/motorcycles/${id}`, { method: 'DELETE' }),
};

export const upload = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch<{ url: string; filename: string; size: number; mimeType: string }>('/upload', {
      method: 'POST',
      body: formData,
    });
  },
};

// ─── Transfers API ──────────────────────────────────────
export type TransferStatus = 'initiated' | 'in_transit' | 'received' | 'cancelled';
export interface TransferListItem { id: string; transferNumber: string; fromBranch: BranchSummary; toBranch: BranchSummary; motorcycleCount: number; status: TransferStatus; createdAt: string; completedAt?: string | null; }
export interface TransferDetail extends TransferListItem { notes?: string | null; motorcycles: Array<{ id: string; vin: string; model: string; brand: { nameEn: string; nameAr: string }; currentStatus: string; currentBranchId: string; }>; }
export interface CreateTransferInput { fromBranchId?: string; toBranchId: string; motorcycleIds: string[]; notes?: string; }
export const transfers = {
  list: (params?: { status?: TransferStatus; search?: string; fromBranchId?: string; toBranchId?: string; limit?: number }) => { const query = new URLSearchParams({ page: '1', limit: String(params?.limit ?? 50) }); if (params?.status) query.set('status', params.status); if (params?.search) query.set('search', params.search); if (params?.fromBranchId) query.set('fromBranchId', params.fromBranchId); if (params?.toBranchId) query.set('toBranchId', params.toBranchId); return apiFetch<{ items: TransferListItem[]; total: number; page: number; limit: number; totalPages: number }>(`/transfers?${query}`); },
  get: (id: string) => apiFetch<TransferDetail>(`/transfers/${id}`),
  create: (data: CreateTransferInput) => apiFetch<TransferDetail>('/transfers', { method: 'POST', body: JSON.stringify(data) }),
  ship: (id: string) => apiFetch<TransferListItem>(`/transfers/${id}/ship`, { method: 'POST' }),
  receive: (id: string) => apiFetch<TransferListItem>(`/transfers/${id}/receive`, { method: 'POST' }),
  cancel: (id: string) => apiFetch<TransferListItem>(`/transfers/${id}/cancel`, { method: 'POST' }),
};

// ─── Orders API (POS) ────────────────────────────────────
export type OrderStatus = 'draft' | 'confirmed' | 'processing' | 'awaiting_delivery' | 'completed' | 'cancelled' | 'refunded';
export type DesktopOrderPaymentType = 'CASH' | 'INSTALLMENT';

export interface OrderItem {
  id: string;
  motorcycleId: string;
  unitPrice: number;
  discount: number;
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    year: number;
    color?: string;
    fuelType?: MotorcycleFuelType | null;
    brand: { nameEn: string; nameAr: string };
    currentStatus: string;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  branchId: string;
  status: OrderStatus;
  paymentType: DesktopOrderPaymentType;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paidAmount?: number | null;
  remainingBalance?: number | null;
  buyerNationalId?: string | null;
  address?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  customer: { id: string; customerCode?: string | null; name: string; phone: string };
  branch: { id: string; nameEn: string; nameAr: string };
  status: OrderStatus;
  paymentType: DesktopOrderPaymentType;
  itemCount: number;
  totalAmount: number;
  discount: number;
  netAmount: number;
  createdAt: string;
}

export interface OrderDetail extends Order {
  customerIdImage?: string | null;
  customerIdImageBack?: string | null;
  customer: {
    id: string;
    customerCode?: string | null;
    name: string;
    phone: string;
    email?: string;
    defaultAddress?: { addressLine: string; city?: string };
  };
  branch: { id: string; nameEn: string; nameAr: string };
  user: { id: string; name: string };
  items: OrderItem[];
}

export interface CreateOrderInput {
  customerId: string;
  motorcycleIds: string[];
  discount?: number;
  address?: string;
  notes?: string;
  isDraft?: boolean;
}

export const orders = {
  list: (params?: { search?: string; customerId?: string; status?: OrderStatus; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.customerId) q.set('customerId', params.customerId);
    if (params?.status) q.set('status', params.status);
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<{ items: OrderListItem[]; total: number; page: number; limit: number; totalPages: number }>(`/orders?${q}`);
  },
  get: (id: string) => apiFetch<OrderDetail>(`/orders/${id}`),
  create: (data: CreateOrderInput) =>
    apiFetch<OrderDetail>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  confirm: (id: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/confirm`, { method: 'POST' }),
  updateStatus: (id: string, status: OrderStatus) =>
    apiFetch<OrderDetail>(`/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  cancel: (id: string, reason?: string) =>
    apiFetch<OrderDetail>(`/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getCustomerOrders: (customerId: string, params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<{ items: OrderListItem[]; total: number }>(`/customers/${customerId}/orders?${q}`);
  },
};

// ─── Reservations API (POS) ──────────────────────────────
export type ReservationStatus = 'active' | 'expired' | 'cancelled' | 'converted';
export type ReservationSource = 'ecommerce' | 'pos';

export interface ReservationListItem {
  id: string;
  reservationNumber: string;
  customer: { id: string; customerCode?: string | null; name: string; phone: string };
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    fuelType?: MotorcycleFuelType | null;
    year: number;
    color?: string;
    brand: { nameEn: string; nameAr: string };
  };
  branch: { id: string; nameEn: string; nameAr: string };
  status: ReservationStatus;
  source: ReservationSource;
  totalPrice: number;
  depositAmount: number;
  remainingAmount: number;
  expiresAt?: string;
  daysUntilExpiry?: number;
  createdAt: string;
}

export interface ReservationDetail extends Omit<ReservationListItem, 'customer'> {
  customerIdImage?: string | null;
  customer: {
    id: string;
    customerCode?: string | null;
    name: string;
    phone: string;
    email?: string;
    defaultAddress?: {
      addressLine: string;
      city?: string;
    };
  };
  user: { id: string; name: string };
  address?: string | null;
  notes?: string;
  cancelReason?: string;
  convertedOrder?: { id: string; orderNumber: string; status: string };
  pricingSnapshot: {
    basePrice: number;
    vat: number;
    discount: number;
    totalPrice: number;
  };
}

export interface CreateReservationInput {
  customerId: string;
  motorcycleId: string;
  paidAmount: number;
  address?: string;
  notes?: string;
}

export const reservations = {
  list: (params?: { search?: string; customerId?: string; status?: ReservationStatus; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.customerId) q.set('customerId', params.customerId);
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<{ items: ReservationListItem[]; total: number; page: number; limit: number }>(`/reservations?${q}`);
  },
  get: (id: string) => apiFetch<ReservationDetail>(`/reservations/${id}`),
  sendWhatsApp: (id: string) => apiFetch<{ phone: string; message: string }>(`/reservations/${id}/send-whatsapp`, { method: 'POST' }),
  create: (data: CreateReservationInput) =>
    apiFetch<ReservationDetail>('/reservations', { method: 'POST', body: JSON.stringify(data) }),
  convert: (id: string, notes?: string, idempotencyKey?: string) =>
    apiFetch<{ reservation: ReservationDetail; order: { id: string; orderNumber: string } }>(`/reservations/${id}/convert`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ notes }),
    }),
  cancel: (id: string, reason: string) =>
    apiFetch<ReservationDetail>(`/reservations/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  update: (id: string, data: { expiresAt?: string; notes?: string }) =>
    apiFetch<ReservationDetail>(`/reservations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  extend: (id: string, expiresAt: string, reason?: string) =>
    apiFetch<ReservationDetail>(`/reservations/${id}/extend`, { method: 'POST', body: JSON.stringify({ expiresAt, reason }) }),
  getCustomerReservations: (customerId: string, params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<{ items: ReservationListItem[]; total: number }>(`/customers/${customerId}/reservations?${q}`);
  },
};

// ─── Payments API (POS) ──────────────────────────────────
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'cheque';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';

export interface CreatePaymentInput {
  idempotencyKey: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  cashDetails?: {
    amountReceived: number;
    change: number;
  };
  notes?: string;
}

export interface PaymentResult {
  id: string;
  paymentReference: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  cashAmountReceived?: number;
  cashChange?: number;
  createdAt: string;
}

export const payments = {
  create: (data: CreatePaymentInput) =>
    apiFetch<PaymentResult>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: string) => apiFetch<PaymentResult>(`/payments/${id}`),
};

// ─── Invoices API (POS) ──────────────────────────────────
export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  orderId?: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
}

export interface CreateInvoiceInput {
  customerId: string;
  orderId?: string;
  reservationId?: string;
  branchId?: string;
  totalAmount: number;
  items: Array<{
    motorcycleId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
  notes?: string;
}

export const invoices = {
  create: (data: CreateInvoiceInput) => apiFetch<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  issue: (id: string) => apiFetch<Invoice>(`/invoices/${id}/issue`, { method: 'POST' }),
  getByOrder: (orderId: string) => apiFetch<Invoice>(`/invoices?orderId=${orderId}`).then((res: any) => res.items?.[0]),
  get: (id: string) => apiFetch<Invoice>(`/invoices/${id}`),
};

// ─── POS API ─────────────────────────────────────────────

export interface POSDashboard {
  currentUser: {
    id: string;
    name: string;
    role: string;
    branch: {
      id: string;
      nameAr: string;
      nameEn: string;
    } | null;
    permissions: {
      canApplyDiscount: boolean;
      maxDiscountPercent: number;
      maxDiscountAmount: number;
      canCreateCustomer: boolean;
      canSwitchBranch: boolean;
    };
  };
  todayStats: {
    ordersCreated: number;
    reservationsCreated: number;
    totalSales: number;
    availableMotorcycles: number;
  };
  recentTransactions: Array<{
    id: string;
    type: 'order' | 'reservation';
    number: string;
    customerName: string;
    motorcycleModel: string;
    amount: number;
    createdAt: string;
  }>;
}

export interface POSSyncStatus {
  isOnline: boolean;
  lastSyncAt?: string;
  queuedOperations: number;
  syncInProgress: boolean;
  conflicts: Array<{
    operationId: string;
    type: string;
    reason: string;
    resolution: string;
  }>;
}

export interface POSReservation {
  id: string;
  reservationNumber: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  motorcycle: {
    id: string;
    vin: string;
    model: string;
    fuelType?: MotorcycleFuelType | null;
    brand: string;
  };
  depositAmount: number;
  totalAmount: number;
  remainingAmount: number;
  expiresAt: string;
  expiresInDays: number;
  daysUntilExpiry?: number;
  isExpiringSoon: boolean;
  createdAt: string;
}

export const pos = {
  getDashboard: () => apiFetch<POSDashboard>('/pos/dashboard'),
  
  searchCustomers: (q: string, limit = 10, page = 1) =>
    apiFetch<POSCustomerSearchResponse>(`/pos/customers/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`),
  lookupCashSaleCustomer: (phone: string) =>
    apiFetch<{
      id: string;
      name: string;
      phone: string;
      nationalId: string | null;
      address: string | null;
      customerIdImage: string | null;
      customerIdImageBack: string | null;
    } | null>(`/pos/customers/lookup?phone=${encodeURIComponent(phone)}`),
  
  searchMotorcycles: (q?: string, branchId?: string, limit = 20) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (branchId) params.append('branchId', branchId);
    params.append('limit', limit.toString());
    return apiFetch<MotorcycleSearchResult[]>(`/pos/motorcycles/search?${params}`);
  },
  
  validateTransaction: (data: ValidatePOSTransactionDto) =>
    apiFetch<ValidatePOSTransactionResponse>('/pos/validate-transaction', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  createTransaction: (data: CreatePOSTransactionDto) =>
    apiFetch<CreatePOSTransactionResponse>('/pos/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createCashSale: (input: SaleInput) => {
    const form = new FormData();
    form.set('motorcycleId', input.motorcycleId);
    form.set('customerName', input.customerName);
    form.set('customerPhone', input.customerPhone);
    form.set('salePrice', String(input.salePrice));
    form.set('amountPaid', String(input.amountPaid));
    form.set('paymentMethod', input.paymentMethod);
    if (input.customerIdImage) form.set('customerIdImage', input.customerIdImage);
    if (input.customerIdImageBack) form.set('customerIdImageBack', input.customerIdImageBack);
    if (input.buyerNationalId) form.set('buyerNationalId', input.buyerNationalId);
    if (input.address) form.set('address', input.address);
    return apiFetch<SaleRecord>('/pos/cash-sales', { method: 'POST', body: form });
  },
  listOrders: (params?: { search?: string; status?: OrderStatus; paymentType?: DesktopOrderPaymentType; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.paymentType) query.set('paymentType', params.paymentType);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return apiFetch<{ items: OrderListItem[]; total: number; page: number; limit: number; totalPages: number }>(`/pos/orders?${query}`);
  },
  createOrder: (data: CreateOrderInput) => apiFetch<OrderDetail>('/pos/orders', { method: 'POST', body: JSON.stringify(data) }),
  createReservation: (input: { customerName: string; customerPhone: string; motorcycleId: string; holdAmount: number; customerIdImage?: File | string }) => {
    if (input.customerIdImage instanceof File) {
      const form = new FormData();
      form.set('customerName', input.customerName);
      form.set('customerPhone', input.customerPhone);
      form.set('motorcycleId', input.motorcycleId);
      form.set('holdAmount', String(input.holdAmount));
      form.set('customerIdImage', input.customerIdImage);
      return apiFetch<CreatePOSTransactionResponse>('/pos/reservations/direct', { method: 'POST', body: form });
    }
    return apiFetch<CreatePOSTransactionResponse>('/pos/reservations/direct', { method: 'POST', body: JSON.stringify(input) });
  },
  getOrder: (id: string) => apiFetch<OrderDetail>(`/pos/orders/${id}`),
  updateOrderStatus: (id: string, status: OrderStatus) => apiFetch<OrderDetail>(`/pos/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  cancelOrder: (id: string) => apiFetch<OrderDetail>(`/pos/orders/${id}/cancel`, { method: 'POST' }),
  listReservations: (params?: { status?: ReservationStatus; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return apiFetch<{ items: ReservationListItem[]; total: number; page: number; limit: number; totalPages: number }>(`/pos/reservations?${query}`);
  },
  getReservation: (id: string) => apiFetch<ReservationDetail>(`/pos/reservations/${id}`),
  cancelReservation: (id: string, reason?: string) => apiFetch<ReservationDetail>(`/pos/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateReservation: (id: string, data: { expiresAt?: string; notes?: string }) => apiFetch<ReservationDetail>(`/pos/reservations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  
  getActiveReservations: (branchId?: string, customerId?: string) => {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (customerId) params.append('customerId', customerId);
    return apiFetch<POSReservation[]>(`/pos/reservations/active?${params}`);
  },
  listActiveReservations: (params?: { branchId?: string; customerId?: string; expiringInDays?: number }) => {
    const query = new URLSearchParams();
    if (params?.branchId) query.set('branchId', params.branchId);
    if (params?.customerId) query.set('customerId', params.customerId);
    if (params?.expiringInDays !== undefined) query.set('expiringInDays', String(params.expiringInDays));
    return apiFetch<POSReservation[]>(`/pos/reservations/active?${query}`);
  },
  convertReservation: (id: string, notes?: string, idempotencyKey?: string) =>
    apiFetch<CreatePOSTransactionResponse>(`/pos/reservations/${id}/convert`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ notes }),
    }),
  
  getSyncStatus: () => apiFetch<POSSyncStatus>('/pos/offline/sync-status'),
  
  queueOperation: (data: QueueOfflineOperationDto) =>
    apiFetch('/pos/offline/queue', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getQueuedOperations: () => apiFetch<Array<{ id: string; type: string; data: unknown; status: string; createdAt: string; expiresAt: string }>>('/pos/offline/queue'),
};

// ─── Financing & Installments ────────────────────────────
export type FinancingStatus = 'active' | 'completed' | 'defaulted' | 'cancelled';
export type InstallmentStatus = 'upcoming' | 'due' | 'paid' | 'overdue';
export type InstallmentFrequency = 'monthly' | 'quarterly';

export interface FinancingContractRecord {
  id: string;
  contractNumber: string;
  customerId: string;
  orderId: string;
  totalAmount: number;
  downPayment: number;
  financingAmount: number;
  numberOfInstallments: number;
  installmentFrequency: InstallmentFrequency;
  interestRate: number;
  startDate: string;
  status: FinancingStatus;
  customer?: { id: string; name: string; phone: string };
  order?: { id: string; orderNumber: string };
  installments?: InstallmentRecord[];
}

export interface InstallmentRecord {
  id: string;
  contractId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remainingAmount?: number;
  status: InstallmentStatus;
  paidAt?: string | null;
  contract?: FinancingContractRecord;
  customer?: { id: string; name: string; phone: string };
  invoice?: { id: string; invoiceNumber: string };
}

export const financing = {
  list: (params?: { page?: number; limit?: number; status?: FinancingStatus; customerId?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    if (params?.customerId) q.set('customerId', params.customerId);
    return apiFetch<{ items: FinancingContractRecord[]; total: number; page: number; limit: number; totalPages: number }>(`/financing-contracts?${q}`);
  },
  get: (id: string) => apiFetch<FinancingContractRecord>(`/financing-contracts/${id}`),
  approve: (id: string, notes?: string) => apiFetch<FinancingContractRecord>(`/financing-contracts/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  updateStatus: (id: string, status: FinancingStatus, notes?: string) => apiFetch<FinancingContractRecord>(`/financing-contracts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }),
};

export const installments = {
  get: (id: string) => apiFetch<InstallmentRecord>(`/installments/${id}`),
  byContract: (contractId: string) => apiFetch<InstallmentRecord[]>(`/installments/contract/${contractId}`),
  pay: (id: string, data: { amount: number; method: PaymentMethod; reference?: string; idempotencyKey: string; notes?: string }) => apiFetch<PaymentResult>(`/installments/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  updateStatuses: () => apiFetch<{ updated: number }>('/installments/status-update', { method: 'POST' }),
};

// ─── Reports ─────────────────────────────────────────────
export type ReportPreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom';
export interface ReportFilters { preset?: ReportPreset; startDate?: string; endDate?: string; branches?: string; }
const reportQuery = (filters?: ReportFilters) => {
  const q = new URLSearchParams();
  if (filters?.preset) q.set('preset', filters.preset);
  if (filters?.startDate) q.set('startDate', filters.startDate);
  if (filters?.endDate) q.set('endDate', filters.endDate);
  if (filters?.branches) q.set('branches', filters.branches);
  return q;
};

export const reports = {
  executive: (filters?: ReportFilters) => apiFetch<any>(`/reports/dashboard/executive?${reportQuery(filters)}`),
  operational: (filters?: ReportFilters) => apiFetch<any>(`/reports/dashboard/operational?${reportQuery(filters)}`),
  sales: (filters?: ReportFilters) => apiFetch<any>(`/reports/sales/summary?${reportQuery(filters)}`),
  inventory: (filters?: ReportFilters) => apiFetch<any>(`/reports/inventory/current-status?${reportQuery(filters)}`),
  installments: (filters?: ReportFilters) => apiFetch<any>(`/reports/installments/portfolio?${reportQuery(filters)}`),
  overdue: (filters?: ReportFilters) => apiFetch<any>(`/reports/installments/overdue?${reportQuery(filters)}`),
  suppliers: (filters?: ReportFilters) => apiFetch<any>(`/reports/suppliers/performance?${reportQuery(filters)}`),
};

// ─── Suppliers ───────────────────────────────────────────
export interface SupplierRecord {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput { name: string; contactPerson?: string; phone?: string; email?: string; address?: string; notes?: string; isActive?: boolean; }
export const suppliers = {
  list: (params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.search) q.set('search', params.search);
    if (params?.isActive !== undefined) q.set('isActive', String(params.isActive));
    return apiFetch<{ items: SupplierRecord[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(`/suppliers?${q}`);
  },
  get: (id: string) => apiFetch<SupplierRecord>(`/suppliers/${id}`),
  create: (data: SupplierInput) => apiFetch<SupplierRecord>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SupplierInput>) => apiFetch<SupplierRecord>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<void>(`/suppliers/${id}`, { method: 'DELETE' }),
};


// ─── Configuration (SPEC-013 TASK-015) ───────────────────
export const configuration = {
  // Get resolved configuration for current user/branch
  getResolvedConfig: (keys?: string[]) => {
    const q = new URLSearchParams();
    if (keys) keys.forEach(k => q.append('keys', k));
    return apiFetch<Record<string, any>>(`/config/resolved?${q}`);
  },
  
  // Get specific configuration value
  getValue: (key: string) =>
    apiFetch<{
      value: any;
      source: 'system' | 'company' | 'branch';
      lastModified: string;
    }>(`/config/value/${key}`),
  
  // Check feature flag status
  checkFeature: (flagKey: string) =>
    apiFetch<{ flagKey: string; isEnabled: boolean }>(`/config/feature/${flagKey}/status`),
};

// ─── Financing Companies ──────────────────────────────────
export interface FinancingCompanyRecord {
  id: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  whatsappNumber: string;
  annualInterestRate: number;
  administrativeFeesPercentage: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancingCompanyInput {
  name: string;
  whatsappNumber: string;
  annualInterestRate: number;
  administrativeFeesPercentage: number;
  isActive?: boolean;
  sortOrder?: number;
}

/** Public list (active only) — usable in POS dropdowns, Sales page, etc. */
export const financingCompanies = {
  list: () => apiFetch<FinancingCompanyRecord[]>('/financing-companies'),
  listAll: () => apiFetch<FinancingCompanyRecord[]>('/admin/financing-companies'),
  create: (data: FinancingCompanyInput) =>
    apiFetch<FinancingCompanyRecord>('/admin/financing-companies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<FinancingCompanyInput>) =>
    apiFetch<FinancingCompanyRecord>(`/admin/financing-companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<{ id: string }>(`/admin/financing-companies/${id}`, { method: 'DELETE' }),
};

// ─── New Inquiries (POS) ──────────────────────────────────
export type InquiryDocumentType = 'EMPLOYEE' | 'PENSION' | 'COMMERCIAL_REGISTRY' | 'NEITHER';

export interface InquiryMotorcycleOption {
  brandId: string;
  brandNameAr: string;
  brandNameEn: string;
  categoryId: string;
  categoryNameAr: string;
  categoryNameEn: string;
  model: string;
}

export interface InquiryMotorcycleSelection {
  brandId: string;
  categoryId: string;
  model: string;
}

export interface InquiryRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  documentType: InquiryDocumentType;
  address?: string | null;
  occupation?: string | null;
  occupationAddress?: string | null;
  firstGuarantorName?: string | null;
  firstGuarantorPhone?: string | null;
  firstGuarantorAddress?: string | null;
  firstGuarantorOccupation?: string | null;
  firstGuarantorOccupationAddress?: string | null;
  secondGuarantorName?: string | null;
  secondGuarantorPhone?: string | null;
  secondGuarantorAddress?: string | null;
  secondGuarantorOccupation?: string | null;
  secondGuarantorOccupationAddress?: string | null;
  documentImage?: string;
  idCardFrontImage?: string;
  idCardBackImage?: string;
  guarantorIdFrontImage?: string;
  guarantorIdBackImage?: string;
  guarantor2IdFrontImage?: string;
  guarantor2IdBackImage?: string;
  guarantorSignatureImage?: string;
  electricityLetterUploaded: boolean;
  downPayment?: number;
  motorcyclePrice?: number | null;
  annualInterestRate?: number | null;
  administrativeFeesPercentage?: number | null;
  financedAmount?: number | null;
  totalInterest?: number | null;
  administrativeFeesAmount?: number | null;
  totalAmountDue?: number | null;
  monthlyInstallment?: number | null;
  financingBreakdown?: {
    motorcyclePrice: number;
    downPayment: number;
    annualInterestRate: number;
    administrativeFeesPercentage: number;
    durationMonths: number;
    financedAmount: number;
    totalInterest: number;
    administrativeFeesAmount: number;
    totalAmountDue: number;
    monthlyInstallment: number;
  } | null;
  motorcycleId?: string;
  financingCompanyId?: string;
  installmentDurationId?: string;
  financingCompany?: {
    name: string;
    annualInterestRate: number;
    administrativeFeesPercentage: number;
  } | null;
  installmentDuration?: { months: number } | null;
  requestedMotorcycle?: InquiryMotorcycleOption | null;
  motorcycle?: MotorcycleSearchResult;
  createdBy?: string;
  createdAt: string;
}

export interface InquiryInput {
  customerName: string;
  customerPhone: string;
  documentType: InquiryDocumentType;
  address?: string;
  occupation?: string;
  occupationAddress?: string;
  firstGuarantorName?: string;
  firstGuarantorPhone?: string;
  firstGuarantorAddress?: string;
  firstGuarantorOccupation?: string;
  firstGuarantorOccupationAddress?: string;
  secondGuarantorName?: string;
  secondGuarantorPhone?: string;
  secondGuarantorAddress?: string;
  secondGuarantorOccupation?: string;
  secondGuarantorOccupationAddress?: string;
  downPayment?: number;
  motorcyclePrice?: number | null;
  motorcycleId?: string;
  requestedMotorcycle?: InquiryMotorcycleSelection | null;
  documentImage?: File;
  idCardFrontImage?: File;
  idCardBackImage?: File;
  guarantorIdFrontImage?: File;
  guarantorIdBackImage?: File;
  guarantor2IdFrontImage?: File;
  guarantor2IdBackImage?: File;
  guarantorSignatureImage?: File;
  financingCompanyId?: string;
  installmentDurationId?: string;
}

export interface InstallmentDurationRecord {
  id: string;
  months: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function inquiryFormData(input: InquiryInput) {
  const form = new FormData();
  form.set('customerName', input.customerName);
  form.set('customerPhone', input.customerPhone);
  form.set('documentType', input.documentType);

  for (const field of [
    'address',
    'occupation',
    'occupationAddress',
    'firstGuarantorName',
    'firstGuarantorPhone',
    'firstGuarantorAddress',
    'firstGuarantorOccupation',
    'firstGuarantorOccupationAddress',
    'secondGuarantorName',
    'secondGuarantorPhone',
    'secondGuarantorAddress',
    'secondGuarantorOccupation',
    'secondGuarantorOccupationAddress',
  ] as const) {
    const value = input[field];
    if (value !== undefined) form.set(field, value);
  }
  if (input.downPayment !== undefined) form.set('downPayment', String(input.downPayment));
  if (input.motorcyclePrice !== undefined) form.set('motorcyclePrice', input.motorcyclePrice == null ? '' : String(input.motorcyclePrice));
  if (input.motorcycleId) form.set('motorcycleId', input.motorcycleId);
  if (input.requestedMotorcycle !== undefined) form.set('requestedMotorcycle', JSON.stringify(input.requestedMotorcycle));
  if (input.financingCompanyId) form.set('financingCompanyId', input.financingCompanyId);
  if (input.installmentDurationId !== undefined) form.set('installmentDurationId', input.installmentDurationId);

  for (const field of [
    'documentImage',
    'idCardFrontImage',
    'idCardBackImage',
    'guarantorIdFrontImage',
    'guarantorIdBackImage',
    'guarantor2IdFrontImage',
    'guarantor2IdBackImage',
    'guarantorSignatureImage',
  ] as const) {
    const file = input[field];
    if (file) form.set(field, file);
  }
  return form;
}

export const installmentDurations = {
  list: () => apiFetch<InstallmentDurationRecord[]>('/installment-durations'),
  listAll: () => apiFetch<InstallmentDurationRecord[]>('/admin/installment-durations'),
  create: (data: { months: number; isActive?: boolean; sortOrder?: number }) => apiFetch<InstallmentDurationRecord>('/admin/installment-durations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InstallmentDurationRecord>) => apiFetch<InstallmentDurationRecord>(`/admin/installment-durations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<InstallmentDurationRecord>(`/admin/installment-durations/${id}`, { method: 'DELETE' }),
};

export const inquiries = {
  list: () => apiFetch<InquiryRecord[]>('/inquiries'),
  get: (id: string) => apiFetch<InquiryRecord>(`/inquiries/${id}`),
  motorcycleOptions: () => apiFetch<InquiryMotorcycleOption[]>('/inquiries/motorcycle-options'),
  create: (input: InquiryInput) => apiFetch<InquiryRecord>('/inquiries', { method: 'POST', body: inquiryFormData(input) }),
  update: (id: string, input: InquiryInput) => apiFetch<InquiryRecord>(`/inquiries/${id}`, { method: 'PATCH', body: inquiryFormData(input) }),
  uploadElectricityLetter: (id: string, file: File) => {
    const form = new FormData();
    form.set('file', file);
    return apiFetch<{ electricityLetterUploaded: boolean }>(`/inquiries/${id}/electricity-letter`, {
      method: 'POST',
      body: form,
    });
  },
  downloadElectricityLetter: (id: string) => apiFetchBlob(`/inquiries/${id}/electricity-letter`),
  sendWhatsApp: (id: string) => apiFetch<{ phone: string; message: string }>(`/inquiries/${id}/send-whatsapp`, { method: 'POST' }),
  whatsappMessage: (id: string) => apiFetch<{ phone: string; message: string }>(`/inquiries/${id}/whatsapp-message`),
  sendForReview: (id: string) => apiFetch<unknown>(`/inquiries/${id}/send-for-review`, { method: 'POST' }),
};


// ─── Sales API ────────────────────────────────────────────
export type SalePaymentMethod = 'CASH' | 'VISA';

export interface SaleRecord {
  id: string;
  motorcycleId: string;
  motorcycle: MotorcycleSearchResult;
  customerName: string;
  customerPhone: string;
  customerCode?: string | null;
  customerIdImage?: string;
  customerIdImageBack?: string;
  buyerNationalId?: string | null;
  address?: string | null;
  salePrice: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: SalePaymentMethod;
  branchId?: string;
  createdAt: string;
}

export interface SaleInput {
  motorcycleId: string;
  customerName: string;
  customerPhone: string;
  salePrice: number;
  paymentMethod: SalePaymentMethod;
  customerIdImage?: File;
  customerIdImageBack?: File;
  buyerNationalId?: string;
  address?: string;
  amountPaid: number;
}

export const sales = {
  list: (branchId?: string) => {
    const params = branchId ? `?branchId=${branchId}` : '';
    return apiFetch<SaleRecord[]>(`/sales${params}`);
  },
  get: (id: string) => apiFetch<SaleRecord>(`/sales/${id}`),
  create: (input: SaleInput) => {
    const form = new FormData();
    form.set('motorcycleId', input.motorcycleId);
    form.set('customerName', input.customerName);
    form.set('customerPhone', input.customerPhone);
    form.set('salePrice', String(input.salePrice));
    form.set('paymentMethod', input.paymentMethod);
    if (input.customerIdImage) form.set('customerIdImage', input.customerIdImage);
    return apiFetch<SaleRecord>('/sales', { method: 'POST', body: form });
  },
};

// ─── Sales Requests (Installments) ─────────────────────────
export interface SaleRequestRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  motorcycleId: string;
  financingCompanyId: string;
  requestedAmount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface SaleRequestInput {
  customerName: string;
  customerPhone: string;
  motorcycleId: string;
  financingCompanyId: string;
  requestedAmount: number;
}

export const salesRequests = {
  list: (branchId?: string) => {
    const params = branchId ? `?branchId=${branchId}` : '';
    return apiFetch<SaleRequestRecord[]>(`/sales-requests${params}`);
  },
  create: (input: SaleRequestInput) => 
    apiFetch<SaleRequestRecord>('/sales-requests', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
};

// ─── POS Reservations ─────────────────────────────────────
export interface PosReservationRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  motorcycleId: string;
  holdAmount: number;
  reservationDate: string;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  createdAt: string;
}

export interface PosReservationInput {
  customerName: string;
  customerPhone: string;
  motorcycleId: string;
  holdAmount: number;
}

export const posReservations = {
  list: (branchId?: string) => {
    const params = branchId ? `?branchId=${branchId}` : '';
    return apiFetch<PosReservationRecord[]>(`/pos-reservations${params}`);
  },
  create: (input: PosReservationInput) =>
    apiFetch<PosReservationRecord>('/pos-reservations', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  cancel: (id: string) =>
    apiFetch<{ id: string; status: string; refundAmount: number; penaltyApplied: boolean }>(`/pos-reservations/${id}/cancel`, {
      method: 'POST'
    }),
};

// ─── POS Installment Plans ─────────────────────────────────────
export interface PosInstallment {
  id: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  paidAt?: string;
}

export interface PosInstallmentPlanRecord {
  id: string;
  orderId?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  buyerAddress?: string | null;
  buyerOccupation?: string | null;
  buyerOccupationAddress?: string | null;
  documentType?: 'EMPLOYEE' | 'PENSION' | 'COMMERCIAL_REGISTRY' | 'NEITHER' | null;
  firstGuarantorName?: string | null;
  firstGuarantorPhone?: string | null;
  firstGuarantorAddress?: string | null;
  firstGuarantorOccupation?: string | null;
  firstGuarantorOccupationAddress?: string | null;
  secondGuarantorName?: string | null;
  secondGuarantorPhone?: string | null;
  secondGuarantorAddress?: string | null;
  secondGuarantorOccupation?: string | null;
  secondGuarantorOccupationAddress?: string | null;
  motorcycle: MotorcycleSearchResult;
  financingCompany?: { id: string; name: string } | null;
  totalAmount: number;
  paidAmount: number;
  remainingBalance: number;
  motorcyclePrice?: number | null;
  downPayment?: number | null;
  annualInterestRate?: number | null;
  durationMonths?: number | null;
  financedAmount?: number | null;
  totalInterest?: number | null;
  customerIdImageAvailable?: boolean;
  documents?: Partial<Record<
    'buyerIdFront' | 'buyerIdBack' | 'supportingDocument' |
    'firstGuarantorIdFront' | 'firstGuarantorIdBack' |
    'secondGuarantorIdFront' | 'secondGuarantorIdBack' |
    'guarantorSignature' | 'electricityLetter',
    boolean
  >>;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  installments: PosInstallment[];
}

export interface DirectPosInstallmentInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address?: string;
  occupation?: string;
  occupationAddress?: string;
  documentType: 'EMPLOYEE' | 'PENSION' | 'COMMERCIAL_REGISTRY' | 'NEITHER';
  firstGuarantorName?: string;
  firstGuarantorPhone?: string;
  firstGuarantorAddress?: string;
  firstGuarantorOccupation?: string;
  firstGuarantorOccupationAddress?: string;
  secondGuarantorName?: string;
  secondGuarantorPhone?: string;
  secondGuarantorAddress?: string;
  secondGuarantorOccupation?: string;
  secondGuarantorOccupationAddress?: string;
  motorcycleId: string;
  downPayment: number;
  annualInterestRate: number;
  durationMonths: number;
  files: Partial<Record<
    'documentImage' | 'idCardFrontImage' | 'idCardBackImage' |
    'guarantorIdFrontImage' | 'guarantorIdBackImage' |
    'guarantor2IdFrontImage' | 'guarantor2IdBackImage' |
    'guarantorSignatureImage' | 'electricityLetter',
    File
  >>;
}

export const posInstallments = {
  list: (branchId?: string, query?: string) => {
    let params = '?';
    if (branchId) params += `branchId=${branchId}&`;
    if (query) params += `query=${encodeURIComponent(query)}&`;
    return apiFetch<PosInstallmentPlanRecord[]>(`/pos-installments${params}`);
  },
  generate: (input: { saleRequestId: string; months: number; interestRate: number }) =>
    apiFetch<PosInstallmentPlanRecord>('/pos-installments/generate', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  createDirect: (input: DirectPosInstallmentInput) => {
    const form = new FormData();
    form.set('customerName', input.customerName);
    form.set('customerPhone', input.customerPhone);
    for (const field of [
      'customerEmail', 'address', 'occupation', 'occupationAddress', 'documentType',
      'firstGuarantorName', 'firstGuarantorPhone', 'firstGuarantorAddress',
      'firstGuarantorOccupation', 'firstGuarantorOccupationAddress',
      'secondGuarantorName', 'secondGuarantorPhone', 'secondGuarantorAddress',
      'secondGuarantorOccupation', 'secondGuarantorOccupationAddress',
    ] as const) {
      const value = input[field];
      if (value) form.set(field, value);
    }
    form.set('motorcycleId', input.motorcycleId);
    form.set('downPayment', String(input.downPayment));
    form.set('annualInterestRate', String(input.annualInterestRate));
    form.set('durationMonths', String(input.durationMonths));
    for (const [field, file] of Object.entries(input.files)) {
      if (file) form.set(field, file);
    }
    return apiFetch<PosInstallmentPlanRecord>('/pos-installments/direct', {
      method: 'POST',
      body: form,
    });
  },
  downloadCustomerIdImage: (id: string) => apiFetchBlob(`/pos-installments/${id}/customer-id-image`),
  downloadDocument: (id: string, document: string) =>
    apiFetchBlob(`/pos-installments/${id}/documents/${encodeURIComponent(document)}`),
};

// ─── Desktop Permissions ────────────────────────────────────────────
export interface DesktopPagePermission {
  pageKey: string;
  canView: boolean;
  canEdit: boolean;
}

export const desktopPermissions = {
  /** Get the calling user's own desktop permissions */
  getMe: () => apiFetch<DesktopPagePermission[]>('/desktop-permissions/me'),
  /** Get permissions for a specific user (super_admin only) */
  getForUser: (userId: string) => apiFetch<DesktopPagePermission[]>(`/desktop-permissions/${userId}`),
  /** Bulk-set permissions for a user (super_admin only) */
  setForUser: (userId: string, permissions: DesktopPagePermission[]) =>
    apiFetch<DesktopPagePermission[]>(`/desktop-permissions/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
  /** Reset all permissions for a user to defaults (super_admin only) */
  resetForUser: (userId: string) =>
    apiFetch<void>(`/desktop-permissions/${userId}/reset`, { method: 'DELETE' }),
};

// ─── Attendance ─────────────────────────────────────────────────────
export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  branchId: string | null;
  branchNameEn: string | null;
  branchNameAr: string | null;
  checkIn: string;
  checkOut: string | null;
  notes: string | null;
  createdAt: string;
  durationMinutes: number | null;
}

export interface AttendanceSummaryEmployee {
  userId: string;
  userName: string;
  salary: number | null;
  attendanceDays: number;
  totalMinutes: number;
}

export interface AttendanceListResult {
  items: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const attendance = {
  checkIn: (notes?: string) =>
    apiFetch<AttendanceRecord>('/attendance/check-in', { method: 'POST', body: JSON.stringify({ notes }) }),
  checkOut: (notes?: string) =>
    apiFetch<AttendanceRecord>('/attendance/check-out', { method: 'POST', body: JSON.stringify({ notes }) }),
  getMe: (params?: { page?: number; limit?: number; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    return apiFetch<AttendanceListResult>(`/attendance/me?${q}`);
  },
  listAll: (params?: { userId?: string; page?: number; limit?: number; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set('userId', params.userId);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    return apiFetch<AttendanceListResult>(`/attendance?${q}`);
  },
  summary: (params?: { userId?: string; startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set('userId', params.userId);
    if (params?.startDate) q.set('startDate', new Date(`${params.startDate}T00:00:00`).toISOString());
    if (params?.endDate) q.set('endDate', new Date(`${params.endDate}T23:59:59.999`).toISOString());
    q.set('timeZone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    return apiFetch<{ startDate: string | null; endDate: string | null; employees: AttendanceSummaryEmployee[] }>(`/attendance/summary?${q}`);
  },
  update: (id: string, data: { checkIn?: string; checkOut?: string | null; notes?: string | null }) =>
    apiFetch<AttendanceRecord>(`/attendance/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};


export interface InstallmentRequest {
  id: string;
  customerId: string;
  motorcycleId: string | null;
  financingCompanyId: string;
  installmentDurationId: string;
  status: 'pending' | 'approved' | 'rejected';
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  buyerAddress?: string | null;
  buyerOccupation?: string | null;
  buyerNationalIdImage: string;
  buyerNationalIdBackImage?: string | null;
  salarySlipImage?: string | null;
  apartmentContractImage?: string | null;
  guarantorName: string;
  guarantorPhone: string;
  guarantorAddress?: string | null;
  guarantorNationalIdImage?: string | null;
  guarantorNationalIdBackImage?: string | null;
  guarantorSignatureImage?: string | null;
  motorcyclePrice: number;
  downPayment: number;
  annualInterestRate: number;
  durationMonthsSnapshot: number;
  financedAmount: number;
  totalInterest: number;
  totalAmountDue: number;
  monthlyInstallment: number;
  durationMonths?: number;
  installmentAmount?: number;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id?: string; name?: string | null; phone?: string | null } | null;
  motorcycle?: {
    id: string;
    vin: string;
    engineNumber?: string | null;
    model: string;
    year: number;
    color?: string | null;
    fuelType?: MotorcycleFuelType | null;
    price: number;
    status: string;
    brand?: { id?: string; nameAr: string; nameEn: string };
  } | null;
  financingCompany?: any;
  duration?: any;
  inquiry?: {
    id: string;
    requestedMotorcycle?: InquiryMotorcycleOption | null;
    documentType?: InquiryDocumentType | null;
    address?: string | null;
    occupation?: string | null;
    firstGuarantorName?: string | null;
    firstGuarantorPhone?: string | null;
    firstGuarantorAddress?: string | null;
    firstGuarantorOccupation?: string | null;
    firstGuarantorOccupationAddress?: string | null;
    secondGuarantorName?: string | null;
    secondGuarantorPhone?: string | null;
    secondGuarantorAddress?: string | null;
    secondGuarantorOccupation?: string | null;
    secondGuarantorOccupationAddress?: string | null;
    electricityLetterUploaded: boolean;
  } | null;
}

export const customerFinancing = {
  listRequests: (status?: string) => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    return apiFetch<InstallmentRequest[]>(`/admin/installment-requests?${q}`);
  },
  reviewRequest: (id: string, data: { status: 'approved' | 'rejected'; rejectionReason?: string; motorcycleId?: string }) => apiFetch<InstallmentRequest>(`/admin/installment-requests/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  motorcycleOptions: (id: string) => apiFetch<Array<{
    id: string;
    vin: string;
    engineNumber: string | null;
    model: string;
    year: number;
    color: string | null;
    fuelType: MotorcycleFuelType | null;
    price: number;
    brand: { nameAr: string; nameEn: string };
    category: { nameAr: string; nameEn: string };
  }>>(`/admin/installment-requests/${id}/motorcycle-options`),
  getRequest: (id: string) => apiFetch<InstallmentRequest>(`/admin/installment-requests/${id}`),
  updateRequest: (id: string, data: { buyerName?: string; buyerPhone?: string; financingCompanyId?: string; downPayment?: number }) => apiFetch<InstallmentRequest>(`/admin/installment-requests/${id}/details`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRequest: (id: string) => apiFetch<InstallmentRequest>(`/admin/installment-requests/${id}`, { method: 'DELETE' }),
  getWhatsAppMessage: (id: string) => apiFetch<{ phone: string; message: string }>(`/admin/installment-requests/${id}/whatsapp`),
};

export type CurrentOrderPaymentMethod = 'CASH' | 'INSTALLMENT';

export interface CurrentOrderRow {
  id: string;
  sourceType: CurrentOrderPaymentMethod;
  customerId: string;
  orderId: string | null;
  motorcycleId: string;
  chassisNumber: string | null;
  motorNumber: string | null;
  customerCode: string | null;
  buyerName: string | null;
  buyerAddress: string | null;
  nationalId: string | null;
  model: string | null;
  motorcycleType: string | null;
  engineCapacity: string | null;
  color: string | null;
  fuelType: MotorcycleFuelType | null;
  electricityReply: string;
  notes: string | null;
  cylinder: string | null;
  trafficOffice: string | null;
  governorate: string | null;
  subDealer: string | null;
  bodyStyle: string | null;
  reviewLine: string | null;
  electricityLetterInquiryId: string | null;
  electricityLetterUploaded: boolean;
  paymentMethod: CurrentOrderPaymentMethod;
}

export type CurrentOrderManualFieldsInput = Partial<
  Pick<CurrentOrderRow, 'cylinder' | 'trafficOffice' | 'governorate' | 'subDealer' | 'bodyStyle' | 'reviewLine' | 'notes'>
>;

export interface CurrentOrderManualData {
  id: string;
  desktopOrderItemId: string | null;
  installmentRequestId: string | null;
  cylinder: string | null;
  trafficOffice: string | null;
  governorate: string | null;
  subDealer: string | null;
  bodyStyle: string | null;
  reviewLine: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentOrdersResult {
  items: CurrentOrderRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CurrentOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  paymentMethod?: CurrentOrderPaymentMethod;
  sortBy?: 'createdAt' | 'buyerName' | 'chassisNumber';
  sortOrder?: 'asc' | 'desc';
  branchId?: string;
}

function buildCurrentOrdersQuery(params: CurrentOrdersQuery) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.paymentMethod) query.set('paymentMethod', params.paymentMethod);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);
  if (params.branchId) query.set('branchId', params.branchId);
  return query;
}

export const currentOrders = {
  list: (params: CurrentOrdersQuery) => apiFetch<CurrentOrdersResult>(`/current-orders?${buildCurrentOrdersQuery(params)}`),
  export: (params: Omit<CurrentOrdersQuery, 'page' | 'limit'>) =>
    apiFetchBlob(`/current-orders/export?${buildCurrentOrdersQuery(params)}`),
  updateCustomerNationalId: (customerId: string, nationalId: string, expectedNationalId: string | null) =>
    apiFetch<{ nationalId: string }>(`/current-orders/customers/${customerId}/national-id`, {
      method: 'PATCH',
      body: JSON.stringify({ nationalId, expectedNationalId }),
    }),
  updateCashOrderNotes: (orderId: string, notes: string) =>
    apiFetch<{ notes: string | null }>(`/current-orders/cash-orders/${orderId}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),
  updateManualFields: (
    sourceType: CurrentOrderPaymentMethod,
    rowId: string,
    input: CurrentOrderManualFieldsInput,
  ) => apiFetch<CurrentOrderManualData>(`/current-orders/${sourceType}/${rowId}/manual-fields`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
};
