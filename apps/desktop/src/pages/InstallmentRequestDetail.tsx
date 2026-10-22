import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Edit3, ExternalLink, MessageCircle, Save, Trash2, User, Bike, FileImage, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { customerFinancing, inquiries, type InstallmentRequest } from '../api';
import { formatDownPaymentReceiptHTML, formatInstallmentRequestHTML } from '../utils/receiptFormatter';

function buildWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

const statusStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
  pending:  { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: '' },
  approved: { bg: '#ecfdf5', color: '#047857', border: '#6ee7b7', label: '' },
  rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', label: '' },
};

function parseSavedDownPayment(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export default function InstallmentRequestDetail({ lang }: { lang: 'en' | 'ar' }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [selectedMotorcycleId, setSelectedMotorcycleId] = useState('');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [form, setForm] = useState({ buyerName: '', buyerPhone: '', financingCompanyId: '', downPayment: '' });

  const query = useQuery<InstallmentRequest>({
    queryKey: ['installment-request', id],
    queryFn: () => customerFinancing.getRequest(id!),
    enabled: Boolean(id),
  });
  const request = query.data;
  const motorcycleOptionsQuery = useQuery({
    queryKey: ['installment-request-motorcycle-options', id],
    queryFn: () => customerFinancing.motorcycleOptions(id!),
    enabled: Boolean(id && request && request.status !== 'approved'),
  });
  useEffect(() => {
    setSelectedMotorcycleId(request?.motorcycleId ?? '');
  }, [request?.id, request?.motorcycleId]);
  const selectedMotorcycle = motorcycleOptionsQuery.data?.find(motorcycle => motorcycle.id === selectedMotorcycleId)
    ?? (request?.motorcycle?.id === selectedMotorcycleId ? request.motorcycle : null);
  const electricityLetterQuery = useQuery({
    queryKey: ['installment-request-electricity-letter', id, request?.inquiry?.id],
    queryFn: () => {
      const inquiryId = request?.inquiry?.id;
      if (!inquiryId) throw new Error('No inquiry is associated with this installment request.');
      return inquiries.downloadElectricityLetter(inquiryId);
    },
    enabled: Boolean(request?.inquiry?.id && request?.inquiry?.electricityLetterUploaded),
    retry: false,
  });
  const [electricityLetterUrl, setElectricityLetterUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = electricityLetterQuery.data;
    if (!blob) {
      setElectricityLetterUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setElectricityLetterUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [electricityLetterQuery.data]);

  const edit = useMutation({
    mutationFn: () => customerFinancing.updateRequest(id!, { buyerName: form.buyerName, buyerPhone: form.buyerPhone, financingCompanyId: form.financingCompanyId, downPayment: Number(form.downPayment) }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['installment-request', id] }); setEditing(false); }
  });
  const approve = useMutation({
    mutationFn: () => customerFinancing.reviewRequest(id!, {
      status: 'approved',
      ...(selectedMotorcycleId ? { motorcycleId: selectedMotorcycleId } : {}),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['installment-request', id] });
      void queryClient.invalidateQueries({ queryKey: ['installment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['installment-request-motorcycle-options', id] });
    },
  });
  const remove = useMutation({ mutationFn: () => customerFinancing.deleteRequest(id!), onSuccess: () => navigate('/installment-requests') });
  const whatsapp = useMutation({ mutationFn: () => customerFinancing.getWhatsAppMessage(id!), onSuccess: ({ phone, message }) => window.open(buildWhatsAppUrl(phone, message), '_blank') });

  if (query.isLoading) return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="premium-glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: '0.75rem' }}>
        <div className="spinner" /><span style={{ color: 'var(--blue)' }}>{isRtl ? 'جاري التحميل...' : 'Loading...'}</span>
      </div>
    </section>
  );

  if (query.isError || !request) return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <button className="premium-action-btn outline" style={{ marginBottom: '1.5rem' }} onClick={() => navigate('/installment-requests')}><ArrowLeft size={16} /> {isRtl ? 'العودة' : 'Back'}</button>
      <div className="premium-glass-panel" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{isRtl ? 'فشل تحميل الطلب' : 'Failed to load request.'}</div>
    </section>
  );

  const imageItems: Array<[string, string | null | undefined]> = [
    [isRtl ? 'بطاقة العميل - أمامي' : 'Buyer ID front', request.buyerNationalIdImage],
    [isRtl ? 'بطاقة العميل - خلفي' : 'Buyer ID back', request.buyerNationalIdBackImage],
    [isRtl ? 'المستند الداعم' : 'Supporting document', request.salarySlipImage],
    [isRtl ? 'بطاقة الضامن - أمامي' : 'Guarantor ID front', request.guarantorNationalIdImage],
    [isRtl ? 'بطاقة الضامن - خلفي' : 'Guarantor ID back', request.guarantorNationalIdBackImage],
    [isRtl ? 'توقيع الضامن' : 'Guarantor signature', request.guarantorSignatureImage],
  ];
  const startEdit = () => { setForm({ buyerName: request.buyerName, buyerPhone: request.buyerPhone, financingCompanyId: request.financingCompanyId, downPayment: String(request.downPayment) }); setEditing(true); };
  const buyerAddress = request.buyerAddress || request.inquiry?.address || '-';
  const buyerOccupation = request.buyerOccupation || request.inquiry?.occupation || '-';
  const electricityLetterMissing = !request.inquiry?.id || !request.inquiry.electricityLetterUploaded;
  const electricityLetterIsImage = electricityLetterQuery.data?.type.startsWith('image/') ?? false;
  const sStyle = statusStyles[request.status] ?? statusStyles.pending;
  const receiptCustomerName = request.customer?.name?.trim() || request.buyerName?.trim() || '';
  const receiptCustomerPhone = request.customer?.phone?.trim() || request.buyerPhone?.trim() || '';
  const receiptDownPayment = parseSavedDownPayment(request.downPayment);
  const printRequest = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const motorcycle = request.motorcycle;
    const html = formatInstallmentRequestHTML({
      id: request.id,
      createdAt: request.createdAt,
      status: request.status,
      buyer: { name: request.buyerName, phone: request.buyerPhone, email: request.buyerEmail, address: request.buyerAddress || request.inquiry?.address, occupation: request.buyerOccupation || request.inquiry?.occupation },
      guarantors: request.inquiry ? [
        {
          name: request.inquiry.firstGuarantorName || request.guarantorName,
          phone: request.inquiry.firstGuarantorPhone || request.guarantorPhone,
          address: request.inquiry.firstGuarantorAddress || request.guarantorAddress,
          occupation: request.inquiry.firstGuarantorOccupation,
          occupationAddress: request.inquiry.firstGuarantorOccupationAddress,
        },
        {
          name: request.inquiry.secondGuarantorName,
          phone: request.inquiry.secondGuarantorPhone,
          address: request.inquiry.secondGuarantorAddress,
          occupation: request.inquiry.secondGuarantorOccupation,
          occupationAddress: request.inquiry.secondGuarantorOccupationAddress,
        },
      ].filter(guarantor => Boolean(guarantor.name || guarantor.phone || guarantor.address || guarantor.occupation || guarantor.occupationAddress)) : [
        { name: request.guarantorName, phone: request.guarantorPhone, address: request.guarantorAddress },
      ],
      motorcycle: {
        brand: motorcycle?.brand?.nameAr ?? motorcycle?.brand?.nameEn
          ?? (request.inquiry?.requestedMotorcycle
            ? (isRtl ? request.inquiry.requestedMotorcycle.brandNameAr : request.inquiry.requestedMotorcycle.brandNameEn)
            : '-'),
        model: motorcycle?.model ?? request.inquiry?.requestedMotorcycle?.model ?? '-',
        vin: motorcycle?.vin,
        engineNumber: motorcycle?.engineNumber,
        year: motorcycle?.year,
        color: motorcycle?.color,
        fuelType: motorcycle?.fuelType,
        price: motorcycle ? request.motorcyclePrice : null,
      },
      financing: {
        company: request.financingCompany?.name ?? '-',
        downPayment: request.downPayment,
        installmentAmount: motorcycle ? request.installmentAmount : null,
        monthlyInstallment: motorcycle ? request.monthlyInstallment : null,
        durationMonths: request.durationMonths ?? request.duration?.months,
      },
      documentType: request.inquiry?.documentType,
      documents: imageItems.flatMap(([label, url]) => url ? [{ label, url }] : []),
    }, lang);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  const printDownPaymentReceipt = () => {
    setReceiptError(null);
    if (!receiptCustomerName || receiptDownPayment === null) {
      setReceiptError(isRtl
        ? !receiptCustomerName
          ? 'تعذرت الطباعة: اسم العميل غير متاح في هذا الطلب.'
          : 'تعذرت الطباعة: قيمة المقدم المحفوظة غير متاحة أو غير صالحة.'
        : !receiptCustomerName
          ? 'Cannot print: this request has no customer name.'
          : 'Cannot print: this request has no valid saved down-payment amount.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setReceiptError(isRtl
        ? 'تعذر فتح نافذة الإيصال. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.'
        : 'The receipt window was blocked. Allow pop-ups and try again.');
      return;
    }
    printWindow.opener = null;
    try {
      const html = formatDownPaymentReceiptHTML({
        buyerName: receiptCustomerName,
        buyerPhone: receiptCustomerPhone,
        downPayment: receiptDownPayment,
        motorcycle: request.motorcycle
          ? {
              brand: isRtl
                ? request.motorcycle.brand?.nameAr ?? request.motorcycle.brand?.nameEn
                : request.motorcycle.brand?.nameEn ?? request.motorcycle.brand?.nameAr,
              model: request.motorcycle.model,
            }
          : request.inquiry?.requestedMotorcycle
            ? {
                brand: isRtl
                  ? request.inquiry.requestedMotorcycle.brandNameAr
                  : request.inquiry.requestedMotorcycle.brandNameEn,
                model: [
                  isRtl
                    ? request.inquiry.requestedMotorcycle.categoryNameAr
                    : request.inquiry.requestedMotorcycle.categoryNameEn,
                  request.inquiry.requestedMotorcycle.model,
                ].filter(Boolean).join(' · '),
              }
            : null,
      }, lang);
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 250);
    } catch {
      printWindow.close();
      setReceiptError(isRtl
        ? 'تعذر تجهيز الإيصال للطباعة. أعد المحاولة.'
        : 'Could not prepare the receipt for printing. Please try again.');
    }
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="premium-page-header" style={{ marginBottom: '2rem' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <button
            onClick={() => navigate('/installment-requests')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '10px', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1rem', transition: 'all 0.2s ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            <ArrowLeft size={15} /> {isRtl ? 'العودة لطلبات التقسيط' : 'Back to requests'}
          </button>
          <h1 style={{ margin: 0, fontSize: '1.9rem' }}>{isRtl ? 'تفاصيل طلب التقسيط' : 'Installment Request Detail'}</h1>
          <p style={{ marginTop: '0.35rem', fontFamily: 'monospace', fontSize: '0.78rem', opacity: 0.75 }}>{request.id}</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.5rem 1.1rem', borderRadius: '99px', fontWeight: 700, fontSize: '0.85rem', background: sStyle.bg, color: sStyle.color, border: `1px solid ${sStyle.border}`, position: 'relative', zIndex: 1 }}>
          {request.status === 'pending' ? (isRtl ? 'معلق' : 'Pending') : request.status === 'approved' ? (isRtl ? 'موافق عليه' : 'Approved') : (isRtl ? 'مرفوض' : 'Rejected')}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <button className="premium-action-btn solid" onClick={() => whatsapp.mutate()} disabled={whatsapp.isPending || !request.motorcycle}>
          <MessageCircle size={17} /> {isRtl ? ' إرسال عبر واتساب الى شركه التمويل ' : 'Send via WhatsApp to financing company'}
        </button>
        <button className="premium-action-btn outline" onClick={printRequest}>
          <Printer size={17} /> {isRtl ? 'طباعة الطلب' : 'Print request'}
        </button>
        <button className="premium-action-btn outline" onClick={printDownPaymentReceipt}>
          <Printer size={17} /> {isRtl ? 'طباعة إيصال المقدم' : 'Print down-payment receipt'}
        </button>
        {request.status !== 'approved' && (
          <button
            className="premium-action-btn success-outline"
            onClick={() => {
              const changingUnit = Boolean(request.motorcycleId && selectedMotorcycleId && selectedMotorcycleId !== request.motorcycleId);
              const confirmationMessage = changingUnit
                ? (isRtl ? 'سيتم تغيير الدراجة المحددة صراحةً. هل تريد تخصيص الدراجة الجديدة والموافقة؟' : 'This explicitly changes the selected motorcycle. Allocate the new unit and approve?')
                : (isRtl ? 'هل تريد تخصيص هذه الدراجة و الموافقة على الطلب؟' : 'Allocate this motorcycle and approve the request?');
              if (!window.confirm(confirmationMessage)) return;
              approve.mutate();
            }}
            disabled={approve.isPending || motorcycleOptionsQuery.isLoading || !selectedMotorcycle
              || !motorcycleOptionsQuery.data?.some(motorcycle => motorcycle.id === selectedMotorcycleId)}
          >
            <CheckCircle size={17} /> {approve.isPending
              ? (isRtl ? 'جارٍ التخصيص والموافقة...' : 'Allocating and approving...')
              : (isRtl ? 'تخصيص الدراجة والموافقة' : 'Allocate motorcycle and approve')}
          </button>
        )}
        <button className="premium-action-btn outline" onClick={startEdit}>
          <Edit3 size={17} /> {isRtl ? 'تعديل' : 'Edit'}
        </button>
        <button className="premium-action-btn danger-outline" onClick={() => { if (window.confirm(isRtl ? 'حذف الطلب؟' : 'Delete this request?')) remove.mutate(); }} disabled={remove.isPending}>
          <Trash2 size={17} /> {isRtl ? 'حذف' : 'Delete'}
        </button>
      </div>
      {receiptError && (
        <div className="state-panel" role="alert" style={{ marginBottom: '1.25rem' }}>
          {receiptError}
        </div>
      )}
      {approve.isError && (
        <div className="state-panel" role="alert" style={{ marginBottom: '1.25rem' }}>
          {approve.error instanceof Error ? approve.error.message : (isRtl ? 'تعذر تخصيص الدراجة أو الموافقة على الطلب.' : 'Could not allocate the motorcycle or approve the request.')}
        </div>
      )}

      {/* Edit Form */}
      {editing && (
        <div className="premium-glass-panel" style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.05rem', color: 'var(--blue-dark)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Edit3 size={18} /> {isRtl ? 'تعديل البيانات' : 'Edit Details'}
          </h2>
          <form onSubmit={e => { e.preventDefault(); edit.mutate(); }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {[
                { label: isRtl ? 'اسم العميل' : 'Customer name', key: 'buyerName', value: form.buyerName },
                { label: isRtl ? 'الهاتف' : 'Phone', key: 'buyerPhone', value: form.buyerPhone },
                { label: isRtl ? 'معرف شركة التمويل' : 'Financing company ID', key: 'financingCompanyId', value: form.financingCompanyId },
                { label: isRtl ? 'الدفعة المقدمة' : 'Down payment', key: 'downPayment', value: form.downPayment, type: 'number' },
              ].map(field => (
                <label key={field.key} style={{ display: 'grid', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {field.label}
                  <input
                    className="pos-input"
                    type={field.type || 'text'}
                    value={field.value}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                    style={{ minHeight: 42, borderRadius: 10, border: '1px solid #bfdbfe', padding: '0 0.75rem' }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="premium-action-btn solid" type="submit" disabled={edit.isPending}>
                <Save size={16} /> {isRtl ? 'حفظ التعديل' : 'Save changes'}
              </button>
              <button className="premium-action-btn outline" type="button" onClick={() => setEditing(false)}>{isRtl ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Info Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
        <div className="premium-stat-card">
          <h3><User size={18} /> {isRtl ? 'بيانات العميل' : 'Customer Info'}</h3>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {[
              [isRtl ? 'الاسم' : 'Name', request.buyerName],
              [isRtl ? 'الهاتف' : 'Phone', request.buyerPhone],
              [isRtl ? 'البريد' : 'Email', request.buyerEmail || '-'],
              [isRtl ? 'العنوان' : 'Address', buyerAddress],
              [isRtl ? 'المهنة' : 'Occupation', buyerOccupation],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', textAlign: isRtl ? 'left' : 'right' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="premium-stat-card">
          <h3><Bike size={18} /> {isRtl ? 'بيانات الطلب' : 'Request Info'}</h3>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {request.status !== 'approved' && (
              <div style={{ display: 'grid', gap: '0.65rem', padding: '0.85rem', borderRadius: 10, background: '#f8fafc', border: '1px solid #dbeafe' }}>
                <strong>{isRtl ? 'تخصيص وحدة المخزون' : 'Inventory unit allocation'}</strong>
                {request.inquiry?.requestedMotorcycle && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {isRtl ? 'النوع/الموديل المطلوب: ' : 'Requested type/model: '}
                    {isRtl
                      ? `${request.inquiry.requestedMotorcycle.brandNameAr} ${request.inquiry.requestedMotorcycle.model} · ${request.inquiry.requestedMotorcycle.categoryNameAr}`
                      : `${request.inquiry.requestedMotorcycle.brandNameEn} ${request.inquiry.requestedMotorcycle.model} · ${request.inquiry.requestedMotorcycle.categoryNameEn}`}
                  </span>
                )}
                {motorcycleOptionsQuery.isLoading && <span>{isRtl ? 'جارٍ تحميل الوحدات المتاحة...' : 'Loading available units...'}</span>}
                {motorcycleOptionsQuery.isError && (
                  <span role="alert" style={{ color: '#b91c1c' }}>
                    {isRtl ? 'تعذر تحميل وحدات المخزون.' : 'Could not load inventory units.'}
                    <button type="button" className="secondary-action" onClick={() => void motorcycleOptionsQuery.refetch()}>
                      {isRtl ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                  </span>
                )}
                {motorcycleOptionsQuery.isSuccess && motorcycleOptionsQuery.data.length === 0 && (
                  <span>{isRtl ? 'لا توجد وحدات متاحة ومتوافقة حالياً.' : 'No compatible available units at this time.'}</span>
                )}
                {motorcycleOptionsQuery.isSuccess && motorcycleOptionsQuery.data.length > 0 && (
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>{isRtl ? 'اختر الوحدة الفعلية' : 'Select the physical unit'}</span>
                    <select value={selectedMotorcycleId} onChange={event => setSelectedMotorcycleId(event.target.value)}>
                      <option value="">{isRtl ? '-- اختر وحدة --' : '-- Select a unit --'}</option>
                      {request.motorcycleId && request.motorcycle
                        && !motorcycleOptionsQuery.data.some(motorcycle => motorcycle.id === request.motorcycleId) && (
                          <option value={request.motorcycleId} disabled>
                            {isRtl ? 'الوحدة الحالية غير متاحة' : 'Currently linked unit is unavailable'}
                          </option>
                        )}
                      {motorcycleOptionsQuery.data.map(motorcycle => (
                        <option key={motorcycle.id} value={motorcycle.id}>
                          {`${isRtl ? motorcycle.brand.nameAr : motorcycle.brand.nameEn} ${motorcycle.model} · ${motorcycle.year} · ${isRtl ? 'شاسيه' : 'Chassis'} ${motorcycle.vin} · ${isRtl ? 'موتور' : 'Motor'} ${motorcycle.engineNumber ?? '-'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedMotorcycle && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span><strong>{isRtl ? 'رقم الشاسيه:' : 'Chassis number:'}</strong> {selectedMotorcycle.vin}</span>
                    <span><strong>{isRtl ? 'رقم الموتور:' : 'Motor number:'}</strong> {selectedMotorcycle.engineNumber || '-'}</span>
                    <span><strong>{isRtl ? 'السعر:' : 'Price:'}</strong> {Number(selectedMotorcycle.price).toLocaleString()} EGP</span>
                  </div>
                )}
              </div>
            )}
            {[
              [isRtl ? 'الدراجة' : 'Motorcycle', request.motorcycle ? `${isRtl ? request.motorcycle.brand?.nameAr : request.motorcycle.brand?.nameEn} ${request.motorcycle.model}` : (isRtl ? 'لم يتم تخصيص وحدة بعد' : 'No unit allocated yet')],
              [isRtl ? 'نوع الوقود' : 'Fuel type', request.motorcycle?.fuelType === 'PETROL' ? (isRtl ? 'بنزين' : 'Petrol') : request.motorcycle?.fuelType === 'ELECTRIC' ? (isRtl ? 'كهرباء' : 'Electric') : (isRtl ? 'غير معروف' : 'Unknown')],
              [isRtl ? 'سعر الدراجة' : 'Motorcycle price', request.motorcycle ? `${request.motorcyclePrice.toLocaleString()} EGP` : '-'],
              [isRtl ? 'شركة التمويل' : 'Financing company', request.financingCompany?.name || '-'],
              [isRtl ? 'الدفعة المقدمة' : 'Down payment', request.downPayment != null ? `${request.downPayment.toLocaleString()} EGP` : '-'],
              [isRtl ? 'القسط الشهري' : 'Monthly installment', request.motorcycle && request.monthlyInstallment != null ? `${request.monthlyInstallment.toLocaleString()} EGP` : '-'],
              [isRtl ? 'مدة التقسيط' : 'Duration', request.duration?.months ? `${request.duration.months} ${isRtl ? 'شهر' : 'months'}` : '-'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', textAlign: isRtl ? 'left' : 'right' }}>{val}</span>
              </div>
            ))}
            {request.status === 'approved' && request.motorcycle && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{isRtl ? 'رقم الشاسيه' : 'Chassis number'}</span>
                  <span style={{ fontWeight: 600 }}>{request.motorcycle.vin}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', padding: '0.55rem 0', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{isRtl ? 'رقم الموتور' : 'Motor number'}</span>
                  <span style={{ fontWeight: 600 }}>{request.motorcycle.engineNumber || '-'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="premium-stat-card" style={{ marginBottom: '1.25rem' }}>
        <h3><User size={18} /> {isRtl ? 'بيانات الضامنين' : 'Guarantor Information'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {[
            {
              title: isRtl ? 'الضامن الأول' : 'First guarantor',
              name: request.inquiry?.firstGuarantorName || request.guarantorName || '',
              phone: request.inquiry?.firstGuarantorPhone || request.guarantorPhone || '',
              address: request.inquiry?.firstGuarantorAddress || request.guarantorAddress || '',
              occupation: request.inquiry?.firstGuarantorOccupation || '',
              occupationAddress: request.inquiry?.firstGuarantorOccupationAddress ?? '',
            },
            {
              title: isRtl ? 'الضامن الثاني' : 'Second guarantor',
              name: request.inquiry?.secondGuarantorName ?? '',
              phone: request.inquiry?.secondGuarantorPhone ?? '',
              address: request.inquiry?.secondGuarantorAddress ?? '',
              occupation: request.inquiry?.secondGuarantorOccupation ?? '',
              occupationAddress: request.inquiry?.secondGuarantorOccupationAddress ?? '',
            },
          ].map(guarantor => (
            <div key={guarantor.title}>
              <h4 style={{ margin: '0 0 0.4rem' }}>{guarantor.title}</h4>
              {[
                [isRtl ? 'الاسم' : 'Name', guarantor.name],
                [isRtl ? 'رقم الهاتف' : 'Phone number', guarantor.phone],
                [isRtl ? 'العنوان' : 'Address', guarantor.address],
                [isRtl ? 'المهنة' : 'Occupation', guarantor.occupation],
                [isRtl ? 'عنوان المهنة' : 'Occupation Address', guarantor.occupationAddress],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word', textAlign: isRtl ? 'left' : 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="premium-stat-card" style={{ marginBottom: '1.25rem' }}>
        <h3><FileImage size={18} /> جواب الكهرباء</h3>
        {electricityLetterMissing ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>لم يتم رفع جواب الكهرباء</p>
        ) : electricityLetterQuery.isLoading ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>جاري تحميل جواب الكهرباء...</p>
        ) : electricityLetterQuery.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--danger, #b91c1c)' }}>تعذر تحميل جواب الكهرباء</p>
        ) : electricityLetterUrl && electricityLetterIsImage ? (
          <a href={electricityLetterUrl} target="_blank" rel="noopener noreferrer" aria-label="فتح جواب الكهرباء بحجم أكبر">
            <img
              src={electricityLetterUrl}
              alt="جواب الكهرباء"
              style={{ display: 'block', width: '100%', maxWidth: 720, maxHeight: 520, objectFit: 'contain', borderRadius: 10, background: '#f8fafc', border: '1px solid #dbeafe' }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem', color: 'var(--blue-dark)', fontSize: '0.8rem', fontWeight: 600 }}>
              <ExternalLink size={14} /> فتح الصورة بحجم أكبر
            </span>
          </a>
        ) : electricityLetterUrl ? (
          <a href={electricityLetterUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <ExternalLink size={15} /> فتح جواب الكهرباء
          </a>
        ) : null}
      </div>

      {/* Documents */}
      {imageItems.some(([, img]) => img) && (
        <div className="premium-stat-card">
          <h3><FileImage size={18} /> {isRtl ? 'المستندات' : 'Documents'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.85rem' }}>
            {imageItems.map(([label, image]) => image && (
              <a key={label} href={image} target="_blank" rel="noreferrer"
                style={{ display: 'block', textDecoration: 'none', borderRadius: '12px', overflow: 'hidden', border: '1px solid #bfdbfe', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 20px rgba(37,99,235,0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
              >
                <img src={image} alt={label} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '0.5rem 0.65rem', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--blue-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <ExternalLink size={12} style={{ flexShrink: 0, color: 'var(--blue)' }} />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
