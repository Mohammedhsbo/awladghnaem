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
type DisplayField = Exclude<keyof CurrentOrderRow, 'id' | 'sourceType' | 'customerId' | 'orderId' | 'motorcycleId' | 'electricityLetterInquiryId'>;
type EditableField = 'nationalId' | 'color' | 'notes';
type EditState = { rowId: string; field: EditableField; value: string; original: string | null };

const columns: Array<{ key: DisplayField; header: string; width: number }> = [
  { key: 'chassisNumber', header: 'رقم الشاسيه', width: 20 },
  { key: 'customerCode', header: 'كود العميل', width: 16 },
  { key: 'buyerName', header: 'اسم المشتري', width: 24 },
  { key: 'buyerAddress', header: 'عنوان المشتري', width: 30 },
  { key: 'nationalId', header: 'الرقم القومي', width: 18 },
  { key: 'model', header: 'الموديل', width: 20 },
  { key: 'motorcycleType', header: 'نوع الدراجة', width: 18 },
  { key: 'engineCapacity', header: 'السعة', width: 14 },
  { key: 'vin', header: 'VIN', width: 22 },
  { key: 'color', header: 'اللون', width: 16 },
  { key: 'notes', header: 'ملاحظات', width: 30 },
  { key: 'electricityLetterUploaded', header: 'جواب كهرباء', width: 20 },
  { key: 'paymentMethod', header: 'طريقة الدفع', width: 18 },
];

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
  if (key === 'electricityLetterUploaded') {
    return row.electricityLetterUploaded ? (lang === 'ar' ? 'مرفق' : 'Uploaded') : (lang === 'ar' ? 'غير مرفق' : 'Not uploaded');
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
      query.data!.items.find((row) => row.id === state.rowId)!.customerId,
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
    mutationFn: (state: EditState) => {
      const row = query.data!.items.find((item) => item.id === state.rowId)!;
      return motorcycles.updateColor(row.motorcycleId, state.value);
    },
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
      const row = query.data!.items.find((item) => item.id === state.rowId)!;
      if (!row.orderId) throw new Error(isRtl ? 'تعذر تحديد الطلب.' : 'Could not identify the order.');
      return currentOrders.updateCashOrderNotes(row.orderId, state.value);
    },
    onSuccess: async () => {
      setEditing(null);
      setSaveError('');
      setSaveMessage(isRtl ? 'تم حفظ الملاحظات.' : 'Notes saved.');
      await invalidateRows();
    },
    onError: (error: unknown) => setSaveError(getApiErrorMessage(error)),
  });

  const startEdit = (row: CurrentOrderRow, field: EditableField) => {
    setSaveError('');
    setSaveMessage('');
    setEditing({ rowId: row.id, field, value: row[field] ?? '', original: row[field] });
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
    } else {
      if (editing.value.length > 2000) {
        setSaveError(isRtl ? 'يجب ألا تتجاوز الملاحظات 2000 حرف.' : 'Notes must be 2,000 characters or fewer.');
        return;
      }
      saveNotes.mutate(editing);
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

  const activeSave = saveNationalId.isPending || saveColor.isPending || saveNotes.isPending;
  const canEditNationalId = hasPermission('customer', 'update');
  const canEditColor = hasPermission('motorcycle', 'update');
  const canEditNotes = hasPermission('order', 'update');

  const renderCell = (row: CurrentOrderRow, key: DisplayField) => {
    const value = displayValue(row, key, lang);
    if (key === 'electricityLetterUploaded') {
      return row.electricityLetterUploaded && row.electricityLetterInquiryId
        ? <button
            type="button"
            className="secondary-action"
            disabled={downloadingInquiryId === row.electricityLetterInquiryId}
            onClick={() => void downloadElectricityLetter(row)}
          >
            <Download size={14} /> {downloadingInquiryId === row.electricityLetterInquiryId
              ? (isRtl ? 'جارٍ التنزيل...' : 'Downloading...')
              : (isRtl ? 'عرض / تنزيل' : 'View / Download')}
          </button>
        : <span>{value}</span>;
    }
    if (key === 'buyerAddress') return <span>{value}</span>;
    const editable = (key === 'nationalId' && canEditNationalId)
      || (key === 'color' && canEditColor)
      || (key === 'notes' && row.sourceType === 'CASH' && row.orderId !== null && canEditNotes);
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
    return <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 190 }}>
      {field === 'notes'
        ? <textarea
            rows={2}
            maxLength={2000}
            value={editing.value}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            aria-label={isRtl ? 'تعديل الملاحظات' : 'Edit notes'}
          />
        : <input
            type="text"
            inputMode={field === 'nationalId' ? 'numeric' : 'text'}
            maxLength={field === 'nationalId' ? 14 : 50}
            value={editing.value}
            onChange={(event) => setEditing({ ...editing, value: event.target.value })}
            aria-label={field === 'nationalId' ? (isRtl ? 'تعديل الرقم القومي' : 'Edit national ID') : (isRtl ? 'تعديل اللون' : 'Edit color')}
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
        <button type="button" className="primary-action" onClick={() => void exportWorkbook()} disabled={exporting || !query.data?.total}>
          <Download size={17} /> {exporting ? (isRtl ? 'جارٍ التصدير...' : 'Exporting...') : 'تصدير إلى Excel — Export to Excel'}
        </button>
      </div>

      <div className="surface-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isRtl ? 'بحث بالاسم أو رقم الشاسيه أو VIN أو الرقم القومي' : 'Search name, chassis number, VIN, or national ID'}
            aria-label={isRtl ? 'بحث في الطلبات الجارية' : 'Search current orders'}
            style={{ flex: '1 1 260px', minWidth: 180, minHeight: 42, padding: '0 0.8rem', borderRadius: 8, border: '1px solid var(--pos-border)' }}
          />
          <select
            value={paymentMethod}
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
                <table style={{ width: '100%', minWidth: 1600, borderCollapse: 'collapse', textAlign: isRtl ? 'right' : 'left' }}>
                  <thead>
                    <tr>
                      {columns.map((column) => {
                        const sortable = column.key === 'buyerName' || column.key === 'chassisNumber';
                        const active = sortBy === column.key;
                        return <th key={column.key} scope="col" style={{ position: 'sticky', top: 0, zIndex: 1, padding: '0.8rem', whiteSpace: 'nowrap', background: 'var(--surface, #f5f8fc)', borderBottom: '1px solid var(--pos-border)' }}>
                          {sortable
                            ? <button type="button" onClick={() => toggleSort(column.key as 'buyerName' | 'chassisNumber')} style={{ border: 0, background: 'transparent', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                                {column.header}{active ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                              </button>
                            : column.header}
                        </th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((row) => <tr key={row.id}>
                      {columns.map((column) => <td key={column.key} style={{ padding: '0.7rem 0.8rem', minWidth: 110, maxWidth: 320, verticalAlign: 'top', borderBottom: '1px solid var(--pos-border)', whiteSpace: column.key === 'notes' || column.key === 'buyerAddress' ? 'normal' : 'nowrap' }}>
                        {renderCell(row, column.key)}
                      </td>)}
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{isRtl ? `صفحة ${query.data.page} من ${Math.max(1, query.data.totalPages)}` : `Page ${query.data.page} of ${Math.max(1, query.data.totalPages)}`}</span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" className="secondary-action" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{isRtl ? 'السابق' : 'Previous'}</button>
                  <button type="button" className="secondary-action" disabled={page >= query.data.totalPages} onClick={() => setPage((current) => current + 1)}>{isRtl ? 'التالي' : 'Next'}</button>
                </div>
              </div>
            </>}
    </section>
  );
}
