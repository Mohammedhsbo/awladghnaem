import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut, RefreshCw, Calendar, User, Pencil, Save, X } from 'lucide-react';
import { attendance, users, type AttendanceRecord, type AttendanceSummaryEmployee, type DesktopUser } from '../api';

type Lang = 'en' | 'ar';

function formatDate(iso: string, isRtl: boolean) {
  return new Date(iso).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatTime(iso: string, isRtl: boolean) {
  return new Date(iso).toLocaleTimeString(isRtl ? 'ar-EG' : 'en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(minutes: number, isRtl: boolean): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return isRtl ? `${hours} ساعة و${remainder} دقيقة` : `${hours}h ${remainder}m`;
}

function localDateTime(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function AttendanceRow({ record, isRtl, canCorrect, isSaving, onSave }: {
  record: AttendanceRecord;
  isRtl: boolean;
  canCorrect: boolean;
  isSaving: boolean;
  onSave: (id: string, data: { checkIn: string; checkOut: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [checkIn, setCheckIn] = useState(localDateTime(record.checkIn));
  const [checkOut, setCheckOut] = useState(record.checkOut ? localDateTime(record.checkOut) : '');
  return (
    <tr className={!record.checkOut ? 'audit-row-open' : ''}>
      <td>
        <div className="audit-user-meta">
          <span className="audit-avatar">{record.userName?.charAt(0)?.toUpperCase() ?? 'U'}</span>
          <div><strong>{record.userName}</strong><span>{record.userEmail}</span></div>
        </div>
      </td>
      <td>{formatDate(record.checkIn, isRtl)}</td>
      <td>{editing
        ? <input type="datetime-local" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
        : <span className="audit-time audit-time-in">{formatTime(record.checkIn, isRtl)}</span>}
      </td>
      <td>{editing
        ? <input type="datetime-local" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
        : record.checkOut
          ? <span className="audit-time audit-time-out">{formatTime(record.checkOut, isRtl)}</span>
          : <span className="audit-pill audit-pill-open">{isRtl ? 'حاضر' : 'Active'}</span>}
      </td>
      <td>{record.durationMinutes === null ? '—' : formatDuration(record.durationMinutes, isRtl)}</td>
      <td>{isRtl ? (record.branchNameAr ?? '—') : (record.branchNameEn ?? '—')}</td>
      <td><span className={`audit-pill ${record.checkOut ? 'audit-pill-closed' : 'audit-pill-open'}`}>
        {record.checkOut ? (isRtl ? 'منتهي' : 'Closed') : (isRtl ? 'قيد التشغيل' : 'Open')}
      </span></td>
      <td><span className="audit-notes">{record.notes ?? '—'}</span></td>
      {canCorrect && <td>
        {editing ? <div style={{ display: 'flex', gap: 6 }}>
          <button className="secondary-action" type="button" disabled={isSaving || !checkIn} onClick={() => {
            onSave(record.id, {
              checkIn: new Date(checkIn).toISOString(),
              checkOut: checkOut ? new Date(checkOut).toISOString() : null,
            });
            setEditing(false);
          }}><Save size={14} /></button>
          <button className="secondary-action" type="button" onClick={() => setEditing(false)}><X size={14} /></button>
        </div> : <button className="secondary-action" type="button" onClick={() => {
          setCheckIn(localDateTime(record.checkIn));
          setCheckOut(record.checkOut ? localDateTime(record.checkOut) : '');
          setEditing(true);
        }}><Pencil size={14} /></button>}
      </td>}
    </tr>
  );
}

function AttendanceTable({ records, isRtl, canCorrect = false, isSaving = false, onSave }: {
  records: AttendanceRecord[];
  isRtl: boolean;
  canCorrect?: boolean;
  isSaving?: boolean;
  onSave?: (id: string, data: { checkIn: string; checkOut: string | null }) => void;
}) {
  if (records.length === 0) {
    return <div className="empty-state">{isRtl ? 'لا توجد سجلات حضور.' : 'No attendance records found.'}</div>;
  }

  return (
    <div className="audit-table-shell">
      <table className="audit-table">
        <thead>
          <tr>
            <th>{isRtl ? 'الموظف' : 'Employee'}</th>
            <th>{isRtl ? 'التاريخ' : 'Date'}</th>
            <th>{isRtl ? 'تسجيل دخول' : 'Check-in'}</th>
            <th>{isRtl ? 'تسجيل خروج' : 'Check-out'}</th>
            <th>{isRtl ? 'المدة' : 'Duration'}</th>
            <th>{isRtl ? 'الفرع' : 'Branch'}</th>
            <th>{isRtl ? 'الحالة' : 'Status'}</th>
            <th>{isRtl ? 'ملاحظات' : 'Notes'}</th>
            {canCorrect && <th>{isRtl ? 'تعديل' : 'Correct'}</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => <AttendanceRow
            key={record.id}
            record={record}
            isRtl={isRtl}
            canCorrect={canCorrect}
            isSaving={isSaving}
            onSave={onSave ?? (() => undefined)}
          />)}
        </tbody>
      </table>
    </div>
  );
}

export default function Attendance({ lang, user }: { lang: Lang; user: DesktopUser }) {
  const isRtl = lang === 'ar';
  const isSuperAdmin = user.role.name === 'super_admin';
  const canEditSalary = isSuperAdmin || user.role.permissions.some((permission) => permission.resource === 'user' && permission.action === 'update');
  const canViewSummary = isSuperAdmin || user.role.permissions.some((permission) =>
    permission.resource === 'user' && (permission.action === 'read' || permission.action === 'update'));
  const queryClient = useQueryClient();

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, string>>({});

  // ── Own attendance ────────────────────────────────────────
  const myQuery = useQuery({
    queryKey: ['my-attendance', startDate, endDate],
    queryFn: () => attendance.getMe({ startDate: startDate || undefined, endDate: endDate || undefined, limit: 50 }),
    enabled: !isSuperAdmin,
  });

  // ── Admin: all attendance ────────────────────────────────
  const adminQuery = useQuery({
    queryKey: ['all-attendance', selectedUserId, startDate, endDate],
    queryFn: () => attendance.listAll({ userId: selectedUserId || undefined, startDate: startDate || undefined, endDate: endDate || undefined, limit: 100 }),
    enabled: isSuperAdmin,
  });

  // ── Check current open record ─────────────────────────────
  const openRecordQuery = useQuery({
    queryKey: ['my-open-attendance'],
    queryFn: () => attendance.getMe({ limit: 1 }),
  });
  const openRecord = openRecordQuery.data?.items.find((r) => !r.checkOut) ?? null;

  // ── User list for admin selector ─────────────────────────
  const usersQuery = useQuery({
    queryKey: ['account-users'],
    queryFn: users.list,
    enabled: canViewSummary,
  });

  const summaryQuery = useQuery({
    queryKey: ['attendance-summary', selectedUserId, startDate, endDate],
    queryFn: () => attendance.summary({
      userId: selectedUserId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    enabled: isSuperAdmin,
  });

  const saveSalaryMut = useMutation({
    mutationFn: (input: { userId: string; salary: number | null }) => users.update(input.userId, { salary: input.salary }),
    onSuccess: (_, input) => {
      setSalaryDrafts((current) => {
        const next = { ...current };
        delete next[input.userId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['account-users'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
    onError: (reason: Error) => setError(reason.message),
  });

  const updateAttendanceMut = useMutation({
    mutationFn: (input: { id: string; data: { checkIn: string; checkOut: string | null } }) =>
      attendance.update(input.id, input.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance-summary'] });
    },
    onError: (reason: Error) => setError(reason.message),
  });

  // ── Mutations ────────────────────────────────────────────
  const checkInMut = useMutation({
    mutationFn: () => attendance.checkIn(notes || undefined),
    onSuccess: () => {
      setError('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
    },
    onError: (err: Error & { code?: string }) =>
      setError(err.message || err.code || (isRtl ? 'حدث خطأ.' : 'An error occurred.')),
  });

  const checkOutMut = useMutation({
    mutationFn: () => attendance.checkOut(notes || undefined),
    onSuccess: () => {
      setError('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
    },
    onError: (err: Error & { code?: string }) =>
      setError(err.message || err.code || (isRtl ? 'حدث خطأ.' : 'An error occurred.')),
  });

  const records = isSuperAdmin
    ? (adminQuery.data?.items ?? [])
    : (myQuery.data?.items ?? []);

  const isLoading = isSuperAdmin ? adminQuery.isLoading : myQuery.isLoading;
  const isQueryError = isSuperAdmin ? adminQuery.isError : myQuery.isError;

  return (
    <section className="desktop-page audit-shell" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading audit-header">
        <div>
          <span className="eyebrow">{isRtl ? 'متابعة الحضور' : 'Time tracking'}</span>
          <h1>{isRtl ? 'الحضور والانصراف' : 'Attendance'}</h1>
          <p>
            {isRtl
              ? 'سجّل حضورك وانصرافك واستعرض تقارير الحضور.'
              : 'Record your check-in and check-out, and view attendance reports.'}
          </p>
        </div>
        <button
          className="secondary-action"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
            void queryClient.invalidateQueries({ queryKey: ['all-attendance'] });
            void queryClient.invalidateQueries({ queryKey: ['my-open-attendance'] });
          }}
        >
          <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      <div className="surface-panel audit-card audit-clock-card">
        <div className="panel-heading audit-panel-heading">
          <div>
            <span className="eyebrow">{isRtl ? 'الوقت الحالي' : 'Clock'}</span>
            <h2>
              <Clock size={18} />
              {new Date().toLocaleTimeString(isRtl ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
            </h2>
          </div>
          {openRecord && (
            <div className="attendance-open-info">
              <span className="audit-pill audit-pill-open audit-pill-large">
                {isRtl ? 'حاضر منذ' : 'Clocked in since'} {formatTime(openRecord.checkIn, isRtl)}
              </span>
            </div>
          )}
        </div>

        <div className="audit-toolbar-grid">
          <label className="input-label audit-input-label">
            {isRtl ? 'ملاحظة (اختياري)' : 'Note (optional)'}
            <input
              className="pos-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRtl ? 'أضف ملاحظة...' : 'Add a note...'}
            />
          </label>
          <button
            id="btn-check-in"
            className="primary-action audit-primary-action audit-primary-action-success"
            disabled={!!openRecord || checkInMut.isPending}
            onClick={() => checkInMut.mutate()}
          >
            <LogIn size={17} />
            {checkInMut.isPending ? (isRtl ? 'جاري...' : 'Clocking in...') : (isRtl ? 'تسجيل دخول' : 'Check In')}
          </button>
          <button
            id="btn-check-out"
            className="primary-action audit-primary-action audit-primary-action-danger"
            disabled={!openRecord || checkOutMut.isPending}
            onClick={() => checkOutMut.mutate()}
          >
            <LogOut size={17} />
            {checkOutMut.isPending ? (isRtl ? 'جاري...' : 'Clocking out...') : (isRtl ? 'تسجيل خروج' : 'Check Out')}
          </button>
        </div>

        {error && <div className="form-error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </div>

      <div className="surface-panel audit-filters">
        {canViewSummary && (
          <label className="input-label audit-input-label audit-input-flex">
            <span><User size={14} />{isRtl ? 'الموظف' : 'Employee'}</span>
            <select
              className="pos-input"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">{isRtl ? 'كل الموظفين' : 'All employees'}</option>
              {(usersQuery.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="input-label audit-input-label audit-input-flex">
          <span><Calendar size={14} />{isRtl ? 'من' : 'From'}</span>
          <input type="date" className="pos-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="input-label audit-input-label audit-input-flex">
          <span><Calendar size={14} />{isRtl ? 'إلى' : 'To'}</span>
          <input type="date" className="pos-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button
          className="secondary-action"
          onClick={() => { setStartDate(''); setEndDate(''); setSelectedUserId(''); }}
        >
          {isRtl ? 'مسح الفلاتر' : 'Clear filters'}
        </button>
      </div>

      <div className="panel-heading audit-table-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'التقرير' : 'Report'}</span>
          <h2>{isRtl ? 'سجل الحضور' : 'Attendance log'}</h2>
        </div>
        <span className="result-count">{records.length}</span>
      </div>

      {isLoading && <div className="state-panel">{isRtl ? 'جاري التحميل...' : 'Loading...'}</div>}
      {isQueryError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل البيانات.' : 'Could not load records.'}</div>}
      {!isLoading && !isQueryError && <AttendanceTable
        records={records}
        isRtl={isRtl}
        canCorrect={isSuperAdmin}
        isSaving={updateAttendanceMut.isPending}
        onSave={(id, data) => updateAttendanceMut.mutate({ id, data })}
      />}
      {isSuperAdmin && (
        <>
          <div className="panel-heading audit-table-heading">
            <div>
              <span className="eyebrow">{isRtl ? 'ملخص الفترة' : 'Period summary'}</span>
              <h2>{isRtl ? 'ملخص المرتب وساعات العمل' : 'Salary and working-hours summary'}</h2>
            </div>
          </div>
          {summaryQuery.isError && <div className="state-panel" role="alert">{isRtl ? 'تعذر تحميل الملخص.' : 'Could not load summary.'}</div>}
          {summaryQuery.data && (
            <div className="audit-table-shell">
              <table className="audit-table">
                <thead><tr>
                  <th>{isRtl ? 'اسم الموظف' : 'Employee'}</th>
                  <th>{isRtl ? 'المرتب الشهري' : 'Monthly salary'}</th>
                  <th>{isRtl ? 'عدد أيام الحضور' : 'Attendance days'}</th>
                  <th>{isRtl ? 'إجمالي ساعات العمل' : 'Total working hours'}</th>
                </tr></thead>
                <tbody>
                  {summaryQuery.data.employees.map((employee: AttendanceSummaryEmployee) => {
                    const salaryValue = Object.prototype.hasOwnProperty.call(salaryDrafts, employee.userId)
                      ? salaryDrafts[employee.userId]
                      : employee.salary === null ? '' : String(employee.salary);
                    return <tr key={employee.userId}>
                      <td>{employee.userName}</td>
                      <td>{canEditSalary ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="number" min="0" step="0.01" value={salaryValue} onChange={(event) =>
                          setSalaryDrafts((current) => ({ ...current, [employee.userId]: event.target.value }))
                        } aria-label={isRtl ? `المرتب الشهري لـ ${employee.userName}` : `Monthly salary for ${employee.userName}`} />
                        <button className="secondary-action" type="button" disabled={saveSalaryMut.isPending} onClick={() => {
                          const salary = salaryValue.trim() ? Number(salaryValue) : null;
                          if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
                            setError(isRtl ? 'المرتب يجب أن يكون رقماً غير سالب.' : 'Salary must be a non-negative number.');
                            return;
                          }
                          setError('');
                          saveSalaryMut.mutate({ userId: employee.userId, salary });
                        }}><Save size={14} /></button>
                      </div> : employee.salary === null ? '—' : `${employee.salary.toLocaleString(isRtl ? 'ar-EG' : 'en-EG')} ${isRtl ? 'ج.م' : 'EGP'}`}</td>
                      <td>{employee.attendanceDays}</td>
                      <td>{formatDuration(employee.totalMinutes, isRtl)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              <p style={{ padding: '0 1rem', color: 'var(--text-2)' }}>
                {isRtl ? 'المرتب شهري؛ لا يتم احتساب خصومات أو إضافي أو تقسيط دون سياسة معتمدة.' : 'Salary is monthly. No deductions, overtime, or proration are calculated without an approved policy.'}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
