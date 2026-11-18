import { apiRequest, getCompanyCode, publicPost } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AccrualFrequency = 'NONE' | 'YEARLY' | 'MONTHLY';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  color: string;
  annualQuota: number;
  accrual: AccrualFrequency;
  requiresBalance: boolean;
  carryForwardMax: number;
  encashable: boolean;
  allowHalfDay: boolean;
  maxConsecutiveDays?: number | null;
  noticeDays: number;
  backdatedDays: number;
  sandwich: boolean;
  applicableDuringProbation: boolean;
  gender?: 'Male' | 'Female' | null;
  active: boolean;
}

export interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  paid: boolean;
  requiresBalance: boolean;
  balance: number;
  pending: number;
  available: number;
  credited: number;
  used: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  leaveTypeId?: string;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  fromDate: string;
  toDate: string;
  startHalf: boolean;
  endHalf: boolean;
  days: number;
  reason?: string;
  status: LeaveRequestStatus;
  decidedByName?: string;
  decisionComment?: string;
  appliedAt?: string;
}

export interface LeaveApplication {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  startHalf?: boolean;
  endHalf?: boolean;
  reason?: string;
  employeeId?: string;
}

export interface LeavePreview {
  days: number;
  breakdown: Array<{ date: string; kind: 'LEAVE' | 'HALF' | 'WEEKLY_OFF' | 'HOLIDAY' | 'SANDWICH'; label?: string }>;
  available: number | null;
  errors: string[];
}

export interface LedgerEntry {
  id: string;
  leaveTypeId: string;
  date: string;
  type: string;
  quantity: number;
  note?: string;
}

export interface DistributionResult {
  recipients: Array<{ employeeId: string; employeeCode: string; name: string; departmentName?: string }>;
  skipped: Array<{ employeeId: string; name: string; reason: string }>;
  credited: number;
  totalDays: number;
}

export interface LeaveBalanceReport {
  types: Array<{ id: string; code: string; name: string }>;
  rows: Array<{ employeeId: string; employeeCode: string; name: string; departmentName?: string; balances: Record<string, number> }>;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  optional: boolean;
  locations: string[];
}

export interface WorkflowStep {
  order: number;
  approverType: string;
  approverNames: string[];
  status: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  actedByName?: string;
  actedAt?: string;
  comment?: string;
  override?: boolean;
}

export interface ApprovalItem {
  id: string;
  requestType: string;
  requestId: string;
  title: string;
  summary: string;
  requesterName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  currentStep: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  fiscalYearStartMonth?: number;
  leaveYearStartMonth?: number;
  timezone?: string;
  currency?: string;
  weeklyOffDays?: number[];
  leaveAccrualStartDate?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan?: string;
  settings: CompanySettings;
}

const qs = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const hrApi = {
  // Company
  getCompany: () => apiRequest<Company>('/company'),
  updateCompany: (data: { name?: string; settings?: CompanySettings }) => apiRequest<Company>('/company', { method: 'PUT', body: data }),

  // Leave types
  getLeaveTypes: (all = false) => apiRequest<LeaveType[]>(`/leave/types${all ? '?all=true' : ''}`),
  createLeaveType: (data: Partial<LeaveType>) => apiRequest<LeaveType>('/leave/types', { method: 'POST', body: data }),
  updateLeaveType: (id: string, data: Partial<LeaveType>) => apiRequest<LeaveType>(`/leave/types/${id}`, { method: 'PUT', body: data }),

  // Balances
  getLeaveBalances: (employeeId?: string) => apiRequest<LeaveBalance[]>(`/leave/balances${qs({ employeeId })}`),
  getLeaveLedger: (employeeId?: string, leaveTypeId?: string) => apiRequest<LedgerEntry[]>(`/leave/ledger${qs({ employeeId, leaveTypeId })}`),
  adjustLeaveBalance: (data: { employeeId: string; leaveTypeId: string; quantity: number; note: string; type?: 'ADJUSTMENT' | 'OPENING' | 'COMP_OFF_CREDIT' }) =>
    apiRequest<LeaveBalance[]>('/leave/adjustments', { method: 'POST', body: data }),

  distributeLeave: (data: {
    leaveTypeId: string;
    quantity: number;
    scope: 'ALL' | 'DEPARTMENTS' | 'EMPLOYEES';
    departmentIds?: string[];
    employeeIds?: string[];
    note: string;
    preview?: boolean;
  }) => apiRequest<DistributionResult>('/leave/distribute', { method: 'POST', body: data }),
  getLeaveBalanceReport: () => apiRequest<LeaveBalanceReport>('/leave/reports/balances'),

  // Requests
  previewLeave: (data: LeaveApplication) => apiRequest<LeavePreview>('/leave/preview', { method: 'POST', body: data }),
  applyLeave: (data: LeaveApplication) => apiRequest<LeaveRequest>('/leave/requests', { method: 'POST', body: data }),
  getLeaveRequests: (scope: 'mine' | 'team' | 'all', status?: string) => apiRequest<LeaveRequest[]>(`/leave/requests${qs({ scope, status })}`),
  cancelLeave: (id: string) => apiRequest<LeaveRequest>(`/leave/requests/${id}/cancel`, { method: 'POST', body: {} }),
  getLeaveCalendar: (from: string, to: string) => apiRequest<LeaveRequest[]>(`/leave/calendar${qs({ from, to })}`),

  // Holidays
  getHolidays: (year: number) => apiRequest<Holiday[]>(`/holidays?year=${year}`),
  addHoliday: (data: { date: string; name: string; optional?: boolean }) => apiRequest<Holiday>('/holidays', { method: 'POST', body: data }),
  deleteHoliday: (id: string) => apiRequest<{ success: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),

  // HR operations
  runLeaveAccrual: () => apiRequest<{ credited: number; employees: number; notStarted?: boolean }>('/leave/accrual/run', { method: 'POST', body: {} }),

  // Approvals
  getApprovals: (tab: 'pending' | 'mine' | 'history') => apiRequest<ApprovalItem[]>(`/approvals?tab=${tab}`),
  getApprovalCount: () => apiRequest<{ pending: number }>('/approvals/count'),
  decideApproval: (id: string, decision: 'approve' | 'reject', comment?: string) =>
    apiRequest<ApprovalItem>(`/approvals/${id}/${decision}`, { method: 'POST', body: { comment } }),
  bulkApprove: (ids: string[]) =>
    apiRequest<{ succeeded: number; failed: number }>('/approvals/bulk', { method: 'POST', body: { ids, decision: 'APPROVE' } }),

  // Password links (no session)
  forgotPassword: (email: string) =>
    publicPost<{ success: boolean; message: string }>('/auth/forgot-password', { email, ...(getCompanyCode() ? { companyCode: getCompanyCode() } : {}) }),
  resetPassword: (token: string, newPassword: string) =>
    publicPost<{ success: boolean; message: string }>('/auth/reset-password', { token, newPassword }),
};

// ---------------------------------------------------------------------------
// Small formatting helpers shared by the HR screens
// ---------------------------------------------------------------------------
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const DAY_FMT = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const formatDate = (iso?: string) => (iso ? DATE_FMT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '');
export const formatDay = (iso: string) => DAY_FMT.format(new Date(`${iso}T00:00:00Z`));
export const formatDateRange = (from: string, to: string) => (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`);
export const formatDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Today's date (YYYY-MM-DD) in India, where business dates are defined. */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export const addDaysIso = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
