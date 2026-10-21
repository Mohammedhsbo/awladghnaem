import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Save, X } from 'lucide-react';
import {
  currentOrders,
  getApiErrorMessage,
  getUser,
  inquiries,
  motorcycles,
  type CurrentOrderPaymentMethod,
  type CurrentOrderRow,
  type CurrentOrdersQuery,
} from '../api';
import { DataTableState } from '../components/DataTable';
import { useViewingBranch } from '../contexts/ViewingBranchContext';

type Lang = 'en' | 'ar';
type DisplayField = Exclude<keyof CurrentOrderRow, 'id' | 'sourceType' | 'customerId' | 'orderId' | 'motorcycleId' | 'electricityLetterInquiryId' | 'fuelType' | 'electricityLetterUploaded'>;
type ManualField = 'cylinder' | 'trafficOffice' | 'governorate' | 'subDealer' | 'bodyStyle' | 'reviewLine';
type EditableField = 'nationalId' | 'color' | 'notes' | ManualField;
type EditState = {
  rowId: string;
  sourceType: CurrentOrderRow['sourceType'];
  recordId: string;
  customerId: string;
  motorcycleId: string;
  orderId: string | null;
  field: EditableField;
  value: string;
  original: string | null;
};

const columns: Array<{ key: DisplayField; header: string; width: number }> = [
  { key: 'motorNumber', header: 'رقم الموتور', width: 22 },
  { key: 'chassisNumber', header: 'رقم الشاسيه', width: 20 },
  { key: 'customerCode', header: 'كود العميل', width: 16 },
  { key: 'buyerName', header: 'اسم المشترى', width: 24 },
  { key: 'buyerAddress', header: 'عنوان المشترى', width: 30 },
  { key: 'nationalId', header: 'الرقم القومى', width: 18 },
  { key: 'model', header: 'الموديل', width: 20 },
  { key: 'cylinder', header: 'السيلندر', width: 16 },
  { key: 'motorcycleType', header: 'نوع الدراجة', width: 18 },
  { key: 'engineCapacity', header: 'السعة', width: 14 },
  { key: 'trafficOffice', header: 'وحدة المرور', width: 18 },
  { key: 'governorate', header: 'المحافظة', width: 18 },
  { key: 'subDealer', header: 'التاجر الفرعى', width: 20 },
  { key: 'bodyStyle', header: 'شكل الدراجة', width: 18 },
  { key: 'color', header: 'اللون', width: 16 },
  { key: 'notes', header: 'ملاحظات', width: 30 },
  { key: 'electricityReply', header: 'جواب كهرباء', width: 20 },
  { key: 'paymentMethod', header: 'طريقة الدفع', width: 18 },
  { key: 'reviewLine', header: 'مراجعة السطر', width: 24 },
];
const manualFields: readonly ManualField[] = ['cylinder', 'trafficOffice', 'governorate', 'subDealer', 'bodyStyle', 'reviewLine'];

function isManualField(field: EditableField): field is ManualField {
  return manualFields.includes(field as ManualField);
}

function hasPermission(resource: string, action: string) {
  const user = getUser();
  return user?.role.name === 'super_admin'
    || user?.role.permissions.some((permission) => permission.resource === resource && permission.action === action) === true;
}

function displayValue(row: CurrentOrderRow, key: DisplayField, lang: Lang) {
  if (key === 'paymentMethod') {
    if (row.paymentMethod === 'CASH') return lang === 'ar' ? 'نقدي' : 'Cash';
    return lang === 'ar' ? 'تقسيط' : 'Installment';
  }
  return row[key] ?? '';
}

export default function CurrentOrders({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const { viewingBranchId } = useViewingBranch();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CurrentOrderPaymentMethod | ''>('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<NonNullable<CurrentOrdersQuery['sortBy']>>('createdAt');
  const [sortOrder, setSortOrder] = useState<NonNullable<CurrentOrdersQuery['sortOrder']>>('desc');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadingInquiryId, setDownloadingInquiryId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params: CurrentOrdersQuery = {
    page,
    limit: 25,
    search: debouncedSearch || undefined,
    paymentMethod: paymentMethod || undefined,
    sortBy,
    sortOrder,
    branchId: viewingBranchId ?? undefined,
  };
  const query = useQuery({
    queryKey: ['current-orders', params],
    queryFn: () => currentOrders.list(params),
  });

  const invalidateRows = () => queryClient.invalidateQueries({ queryKey: ['current-orders'] });
  const saveNationalId = useMutation({
    mutationFn: (state: EditState) => currentOrders.updateCustomerNationalId(
      state.customerId,
      state.value,
      state.original,
    ),
    onSuccess: async () => {
      setEditing(null);
      setSaveError('');
      setSaveMessage(isRtl ? 'تم حفظ الرقم القومي.' : 'National ID saved.');
      await invalidateRows();
    },
    onError: (error: unknown) => setSaveError(getApiErrorMessage(error)),
  });
  const saveColor = useMutation({
    mutationFn: (state: EditState) => motorcycles.updateColor(state.motorcycleId, state.value),
    onSuccess: async () => {
      setEditing(null);
      setSaveError('');
      setSaveMessage(isRtl ? 'تم حفظ اللون.' : 'Color saved.');
      await invalidateRows();
    },
    onError: (error: unknown) => setSaveError(getApiErrorMessage(error)),
  });
  const saveNotes = useMutation({
    mutationFn: (state: EditState) => {
      if (!state.orderId) throw new Error(isRtl ? 'تعذر تحديد الطلب.' : 'Could not identify the order.');
      return currentOrders.updateCashOrderNotes(state.orderId, state.value);
    },
    onSuccess: async () => {
      setEditing(null);
      setSaveError('');
      setSaveMessage(isRtl ? 'تم حفظ الملاحظات.' : 'Notes saved.');
      await invalidateRows();
    },
    onError: (error: unknown) => setSaveError(getApiErrorMessage(error)),
  });
  const saveManualFields = useMutation({
    mutationFn: (state: EditState) => {
      const input: Partial<Pick<CurrentOrderRow, ManualField | 'notes'>> = {};
      if (state.field === 'notes' || isManualField(state.field)) {
        input[state.field] = state.value;
      }
      return currentOrders.updateManualFields(state.sourceType, state.recordId, {
        ...input,
      });
    },
    onSuccess: async () => {
      setEditing(null);
      setSaveError('');
      setSaveMessage(isRtl ? 'تم حفظ البيانات اليدوية.' : 'Manual value saved.');
      await invalidateRows();
    },
    onError: (error: unknown) => setSaveError(getApiErrorMessage(error)),
  });

  const startEdit = (row: CurrentOrderRow, field: EditableField) => {
    setSaveError('');
    setSaveMessage('');
    setEditing({
      rowId: row.id,
      sourceType: row.sourceType,
      recordId: row.id.slice(row.sourceType.length + 1),
      customerId: row.customerId,
      motorcycleId: row.motorcycleId,
      orderId: row.orderId,
      field,
      value: row[field] ?? '',
      original: row[field],
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    setSaveError('');
    if (editing.field === 'nationalId') {
      if (!/^\d{14}$/.test(editing.value)) {
        setSaveError(isRtl ? 'يجب أن يتكون الرقم القومي من 14 رقمًا.' : 'National ID must contain exactly 14 digits.');
        return;
      }
      saveNationalId.mutate(editing);
    } else if (editing.field === 'color') {
      if (editing.value.length > 50) {
        setSaveError(isRtl ? 'يجب ألا يتجاوز اللون 50 حرفًا.' : 'Color must be 50 characters or fewer.');
        return;
      }
      saveColor.mutate(editing);
    } else if (editing.field === 'notes') {
      if (editing.value.length > 2000) {
        setSaveError(isRtl ? 'يجب ألا تتجاوز الملاحظات 2000 حرف.' : 'Notes must be 2,000 characters or fewer.');
        return;
      }
      if (editing.sourceType === 'CASH') saveNotes.mutate(editing);
      else saveManualFields.mutate(editing);
    } else {
      const maxLength = editing.field === 'cylinder' ? 100
        : editing.field === 'reviewLine' ? 2000 : 200;
      if (editing.value.length > maxLength) {
        setSaveError(isRtl ? `يجب ألا يتجاوز الإدخال ${maxLength} حرفًا.` : `Value must be ${maxLength} characters or fewer.`);
        return;
      }
      saveManualFields.mutate(editing);
    }
  };

  const exportWorkbook = async () => {
    setExporting(true);
    setExportError('');
    try {
      const file = await currentOrders.export({
        search: debouncedSearch || undefined,
        paymentMethod: paymentMethod || undefined,
        sortBy,
        sortOrder,
        branchId: viewingBranchId ?? undefined,
      });
      const downloadUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `current-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setExportError(getApiErrorMessage(error, isRtl ? 'تعذر تصدير البيانات.' : 'Could not export current orders.'));
    } finally {
      setExporting(false);
    }
  };

  const downloadElectricityLetter = async (row: CurrentOrderRow) => {
    if (!row.electricityLetterInquiryId) return;
    setDownloadingInquiryId(row.electricityLetterInquiryId);
    setDownloadError('');
    try {
      const file = await inquiries.downloadElectricityLetter(row.electricityLetterInquiryId);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'electricity-letter';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDownloadError(getApiErrorMessage(error, isRtl ? 'تعذر تنزيل جواب الكهرباء.' : 'Could not download the Electricity Letter.'));
    } finally {
      setDownloadingInquiryId(null);
    }
  };

  const toggleSort = (next: NonNullable<CurrentOrdersQuery['sortBy']>) => {
    setPage(1);
    if (sortBy === next) setSortOrder((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(next);
      setSortOrder('asc');
    }
  };

  const activeSave = saveNationalId.isPending || saveColor.isPending || saveNotes.isPending || saveManualFields.isPending;
  const canEditNationalId = hasPermission('customer', 'update');
  const canEditColor = hasPermission('motorcycle', 'update');
  const canEditNotes = hasPermission('order', 'update');

  useEffect(() => {
    if (!editing) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmLinkNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!window.confirm(isRtl ? 'لديك تعديلات غير محفوظة. هل تريد مغادرة الصفحة؟' : 'You have unsaved changes. Leave this page?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', confirmLinkNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', confirmLinkNavigation, true);
    };
  }, [editing, isRtl]);

  const renderCell = (row: CurrentOrderRow, key: DisplayField) => {
    const value = displayValue(row, key, lang);
    if (key === 'electricityReply') {
      return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{value || '—'}</span>
        {row.electricityLetterUploaded && row.electricityLetterInquiryId && <button
          type="button"
          className="secondary-action"
          disabled={downloadingInquiryId === row.electricityLetterInquiryId}
          onClick={() => void downloadElectricityLetter(row)}
        >
          <Download size={14} /> {downloadingInquiryId === row.electricityLetterInquiryId
            ? (isRtl ? 'جارٍ التنزيل...' : 'Downloading...')
            : (isRtl ? 'عرض المستند' : 'View document')}
        </button>}
      </div>;
    }
    if (key === 'buyerAddress') return <span>{value}</span>;
    const manualField = manualFields.includes(key as ManualField);
    const editable = (key === 'nationalId' && canEditNationalId)
      || (key === 'color' && canEditColor)
      || (key === 'notes' && row.sourceType === 'CASH' && row.orderId !== null && canEditNotes)
      || (key === 'notes' && row.sourceType === 'INSTALLMENT' && hasPermission('installment', 'update'))
      || (manualField && hasPermission(row.sourceType === 'CASH' ? 'order' : 'installment', 'update'));
    if (!editable) {
      const invalidNationalId = key === 'nationalId' && value !== '' && !/^\d{14}$/.test(value);
      return <span>
        {value || <span aria-label={isRtl ? 'غير متوفر' : 'Not available'}>—</span>}
        {invalidNationalId && <small style={{ display: 'block', color: '#b45309' }}>{isRtl ? 'رقم غير صالح' : 'Invalid format'}</small>}
      </span>;
    }

    const field = key as EditableField;
    const isEditing = editing?.rowId === row.id && editing.field === field;
    if (!isEditing) {
      const invalidNationalId = key === 'nationalId' && value !== '' && !/^\d{14}$/.test(value);
      return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>
          {value || <span aria-label={isRtl ? 'غير متوفر' : 'Not available'}>—</span>}
          {invalidNationalId && <small style={{ display: 'block', color: '#b45309' }}>{isRtl ? 'رقم غير صالح' : 'Invalid format'}</small>}
        </span>
        <button
          type="button"
          className="secondary-action"
          aria-label={isRtl ? `تعديل ${columns.find((column) => column.key === key)?.header}` : `Edit ${key}`}
          onClick={() => startEdit(row, field)}
        ><Pencil size={14} /></button>
      </div>;
    }

    const nationalIdInvalid = field === 'nationalId' && editing.value !== '' && !/^\d{14}$/.test(editing.value);
    const maxLength = field === 'nationalId' ? 14
      : field === 'color' ? 50
        : field === 'cylinder' ? 100
          : field === 'reviewLine' || field === 'notes' ? 2000 : 200;
    return <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 190 }}>
      {field === 'notes' || field === 'reviewLine'
        ? <textarea
            rows={2}
            maxLength={2000}
            value={editing.value}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            aria-label={isRtl ? `تعديل ${columns.find((column) => column.key === field)?.header ?? 'القيمة'}` : `Edit ${field}`}
          />
        : <input
            type="text"
            inputMode={field === 'nationalId' ? 'numeric' : 'text'}
            maxLength={maxLength}
            value={editing.value}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            aria-label={isRtl ? `تعديل ${columns.find((column) => column.key === field)?.header ?? 'القيمة'}` : `Edit ${field}`}
          />}
      <button type="button" className="secondary-action" disabled={activeSave || (field === 'nationalId' && !/^\d{14}$/.test(editing.value)) || nationalIdInvalid} onClick={saveEdit} aria-label={isRtl ? 'حفظ' : 'Save'}><Save size={14} /></button>
      <button type="button" className="secondary-action" disabled={activeSave} onClick={() => setEditing(null)} aria-label={isRtl ? 'إلغاء' : 'Cancel'}><X size={14} /></button>
    </div>;
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading" style={{ alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">{isRtl ? 'العملاء والطلبات' : 'Customers & orders'}</span>
          <h1>الطلبات الجارية — Current Orders</h1>
          <p>{isRtl ? 'الطلبات المعتمدة بالتقسيط ومبيعات الدفع النقدي.' : 'Approved installment requests and cash sales.'}</p>
        </div>
        <button type="button" className="primary-action" onClick={() => void exportWorkbook()} disabled={exporting || Boolean(editing) || !query.data?.total}>
          <Download size={17} /> {exporting ? (isRtl ? 'جارٍ التصدير...' : 'Exporting...') : 'تصدير إلى Excel — Export to Excel'}
        </button>
      </div>

      <div className="surface-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            disabled={Boolean(editing)}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isRtl ? 'بحث بالاسم أو رقم الشاسيه أو رقم الموتور أو الرقم القومي' : 'Search name, chassis number, motor number, or national ID'}
            aria-label={isRtl ? 'بحث في الطلبات الجارية' : 'Search current orders'}
            style={{ flex: '1 1 260px', minWidth: 180, minHeight: 42, padding: '0 0.8rem', borderRadius: 8, border: '1px solid var(--pos-border)' }}
          />
          <select
            value={paymentMethod}
            disabled={Boolean(editing)}
            onChange={(event) => {
              setPaymentMethod(event.target.value as CurrentOrderPaymentMethod | '');
              setPage(1);
            }}
            aria-label={isRtl ? 'طريقة الدفع' : 'Payment method'}
            style={{ minHeight: 42, padding: '0 0.8rem', borderRadius: 8, border: '1px solid var(--pos-border)', background: 'var(--pos-card)', color: 'var(--text-1)' }}
          >
            <option value="">{isRtl ? 'كل طرق الدفع' : 'All payment methods'}</option>
            <option value="INSTALLMENT">{isRtl ? 'تقسيط' : 'Installment'}</option>
            <option value="CASH">{isRtl ? 'نقدي' : 'Cash'}</option>
          </select>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)', marginInlineStart: 'auto' }}>
            {isRtl ? `إجمالي السجلات: ${query.data?.total ?? 0}` : `Matching records: ${query.data?.total ?? 0}`}
          </span>
        </div>
        {(saveError || exportError || downloadError) && <p role="alert" style={{ color: 'var(--danger, #b91c1c)', marginTop: '0.75rem', marginBottom: 0 }}>{saveError || exportError || downloadError}</p>}
        {saveMessage && !saveError && <p role="status" style={{ color: 'var(--success, #047857)', marginTop: '0.75rem', marginBottom: 0 }}>{saveMessage}</p>}
        <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-2)' }}>
          {isRtl ? 'علامة القلم تعني أن الحقل قابل للتحرير؛ باقي الحقول مصدرها بيانات النظام.' : 'A pencil marks editable fields; other fields are sourced from system records.'}
        </small>
        {exporting && <small style={{ display: 'block', marginTop: '0.5rem' }}>{isRtl ? 'يتم تصدير كل السجلات المطابقة للبحث والمرشح النشط.' : 'Exporting all records matching the current search and filter.'}</small>}
      </div>

      {query.isLoading
        ? <DataTableState kind="loading" lang={lang} />
        : query.isError
          ? <DataTableState kind="error" lang={lang} onRetry={() => void query.refetch()} />
          : !query.data?.items.length
            ? <DataTableState kind="empty" lang={lang} />
            : <>
              <div className="data-table-shell" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--surface, white)', border: '1px solid var(--pos-border)', borderRadius: 12 }}>
                <table style={{ width: '100%', minWidth: 2400, borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                  <thead>
                    <tr>
                      {columns.map((column) => {
                        const sortable = column.key === 'buyerName' || column.key === 'chassisNumber';
                        const active = sortBy === column.key;
                        const manual = manualFields.includes(column.key as ManualField);
                        return <th key={column.key} scope="col" style={{ position: 'sticky', top: 0, zIndex: 1, padding: '0.8rem', whiteSpace: 'nowrap', background: 'var(--surface, #f5f8fc)', borderBottom: '1px solid var(--pos-border)' }}>
                          {sortable
                            ? <button type="button" disabled={Boolean(editing)} onClick={() => toggleSort(column.key as 'buyerName' | 'chassisNumber')} style={{ border: 0, background: 'transparent', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                                {column.header}{active ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                              </button>
                            : column.header}
                          {manual && <small title={isRtl ? 'قابل للتحرير' : 'Editable'} style={{ marginInlineStart: 6, color: 'var(--accent-primary)' }}>✎</small>}
                        </th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((row) => <tr key={row.id}>
                      {columns.map((column) => <td key={column.key} style={{ padding: '0.7rem 0.8rem', minWidth: `${column.width}ch`, maxWidth: 320, verticalAlign: 'top', borderBottom: '1px solid var(--pos-border)', whiteSpace: column.key === 'notes' || column.key === 'buyerAddress' || column.key === 'reviewLine' ? 'normal' : 'nowrap' }}>
                        {renderCell(row, column.key)}
                      </td>)}
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{isRtl ? `صفحة ${query.data.page} من ${Math.max(1, query.data.totalPages)}` : `Page ${query.data.page} of ${Math.max(1, query.data.totalPages)}`}</span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary-action" disabled={page <= 1 || Boolean(editing)} onClick={() => setPage((current) => current - 1)}>{isRtl ? 'السابق' : 'Previous'}</button>
                  <button type="button" className="secondary-action" disabled={page >= query.data.totalPages || Boolean(editing)} onClick={() => setPage((current) => current + 1)}>{isRtl ? 'التالي' : 'Next'}</button>
                </div>
              </div>
            </>}
    </section>
  );
}
