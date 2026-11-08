import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Plus, Pencil, Trash2, RefreshCw, X, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { financingCompanies, type FinancingCompanyRecord, type FinancingCompanyInput } from '../api';

type Lang = 'en' | 'ar';

const T = {
  en: {
    title: 'Financing Companies',
    subtitle: 'Manage installment and financing partners',
    eyebrow: 'Installment partners',
    add: 'Add company',
    refresh: 'Refresh',
    name: 'Company name',
    whatsappNumber: 'WhatsApp number',
    annualInterestRate: 'Annual interest rate (%)',
    waiverAnnualInterestRate: 'Waiver annual interest rate (%)',
    administrativeFeesPercentage: 'Administrative Fees (%)',
    administrativeFeeWaiverEnabled: 'Enable administrative fee waiver',
    sortOrder: 'Sort order',
    active: 'Active',
    inactive: 'Inactive',
    noData: 'No financing companies yet.',
    saving: 'Saving…',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Delete this company?',
    deleteWarning: 'This cannot be undone. Companies in use by active requests cannot be deleted.',
    confirm: 'Confirm',
    createdAt: 'Created',
    addTitle: 'New Financing Company',
    editTitle: 'Edit Financing Company',
    required: 'Name is required',
    requiredWhatsApp: 'WhatsApp number is required',
    invalidWhatsApp: 'WhatsApp number must be a valid phone number',
    invalidAnnualInterestRate: 'Annual interest rate must be between 0 and 999.99',
    invalidAdministrativeFeesPercentage: 'Administrative fees must be between 0 and 100%',
    invalidWaiverRate: 'Waiver interest rate must be higher than the standard rate',
  },
  ar: {
    title: 'شركات التمويل',
    subtitle: 'إدارة شركاء التقسيط والتمويل',
    eyebrow: 'شركاء التقسيط',
    add: 'إضافة شركة',
    refresh: 'تحديث',
    name: 'اسم الشركة',
    whatsappNumber: 'رقم واتساب',
    annualInterestRate: 'نسبة الفائدة السنوية (%)',
    waiverAnnualInterestRate: 'الفائدة السنوية عند الإعفاء (%)',
    administrativeFeesPercentage: 'المصاريف الإدارية (%)',
    administrativeFeeWaiverEnabled: 'تفعيل الإعفاء من المصاريف الإدارية',
    sortOrder: 'الترتيب',
    active: 'نشطة',
    inactive: 'غير نشطة',
    noData: 'لا توجد شركات تمويل حتى الآن.',
    saving: 'جاري الحفظ…',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    confirmDelete: 'حذف هذه الشركة؟',
    deleteWarning: 'لا يمكن التراجع. الشركات المرتبطة بطلبات نشطة لا يمكن حذفها.',
    confirm: 'تأكيد',
    createdAt: 'أُضيفت',
    addTitle: 'شركة تمويل جديدة',
    editTitle: 'تعديل شركة التمويل',
    required: 'الاسم مطلوب',
    requiredWhatsApp: 'رقم واتساب مطلوب',
    invalidWhatsApp: 'رقم واتساب غير صحيح',
    invalidAnnualInterestRate: 'نسبة الفائدة السنوية يجب أن تكون بين 0 و999.99',
    invalidAdministrativeFeesPercentage: 'يجب أن تكون المصاريف الإدارية بين 0 و100%',
    invalidWaiverRate: 'يجب أن تكون فائدة الإعفاء أعلى من الفائدة الأساسية',
  },
};

interface FormState {
  name: string;
  whatsappNumber: string;
  annualInterestRate: string;
  administrativeFeesPercentage: string;
  waiverAnnualInterestRate: string;
  administrativeFeeWaiverEnabled: boolean;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm: FormState = { name: '', whatsappNumber: '', annualInterestRate: '0', administrativeFeesPercentage: '0', waiverAnnualInterestRate: '0', administrativeFeeWaiverEnabled: false, isActive: true, sortOrder: 0 };
const whatsappPattern = /^\+?[0-9\s-]{8,20}$/;


export default function FinancingCompanies({ lang }: { lang: Lang }) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const isEditPage = Boolean(companyId);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FinancingCompanyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinancingCompanyRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['desktop-financing-companies'],
    queryFn: financingCompanies.listAll,
  });

  const companies = data ?? [];

  useEffect(() => {
    if (!companyId || !data) return;
    if (editTarget?.id === companyId) return;
    const company = data.find(item => item.id === companyId);
    if (company) {
      setEditTarget(company);
      setForm({
        name: company.name,
        whatsappNumber: company.whatsappNumber ?? '',
        annualInterestRate: String(company.annualInterestRate),
        administrativeFeesPercentage: String(company.administrativeFeesPercentage ?? 0),
        waiverAnnualInterestRate: String(company.waiverAnnualInterestRate ?? 0),
        administrativeFeeWaiverEnabled: company.administrativeFeeWaiverEnabled ?? false,
        isActive: company.isActive,
        sortOrder: company.sortOrder,
      });
      setShowForm(true);
    } else if (!isLoading) {
      navigate('/financing-companies', { replace: true });
    }
  }, [companyId, data, editTarget?.id, isLoading, navigate]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['desktop-financing-companies'] });
  };

  const createMut = useMutation({
    mutationFn: (input: FinancingCompanyInput) => financingCompanies.create(input),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<FinancingCompanyInput> }) =>
      financingCompanies.update(id, input),
    onSuccess: () => { invalidate(); closeForm(); },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => financingCompanies.remove(id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); },
    onError: (err: Error) => setFormError(err.message),
  });

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (company: FinancingCompanyRecord) => {
    setEditTarget(company);
    setForm({
      name: company.name,
      whatsappNumber: company.whatsappNumber ?? '',
      annualInterestRate: String(company.annualInterestRate),
      administrativeFeesPercentage: String(company.administrativeFeesPercentage ?? 0),
      waiverAnnualInterestRate: String(company.waiverAnnualInterestRate ?? 0),
      administrativeFeeWaiverEnabled: company.administrativeFeeWaiverEnabled ?? false,
      isActive: company.isActive,
      sortOrder: company.sortOrder,
    });
    setFormError('');
    setShowForm(true);
    navigate(`/financing-companies/${company.id}/edit`);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditTarget(null);
    setFormError('');
    if (companyId) navigate('/financing-companies');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError(t.required); return; }
    if (!form.whatsappNumber.trim()) { setFormError(t.requiredWhatsApp); return; }
    if (!whatsappPattern.test(form.whatsappNumber.trim())) { setFormError(t.invalidWhatsApp); return; }
    const annualInterestRate = Number(form.annualInterestRate);
    if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0 || annualInterestRate > 999.99) {
      setFormError(t.invalidAnnualInterestRate);
      return;
    }
    const administrativeFeesPercentage = Number(form.administrativeFeesPercentage);
    if (!Number.isFinite(administrativeFeesPercentage) || administrativeFeesPercentage < 0 || administrativeFeesPercentage > 100) {
      setFormError(t.invalidAdministrativeFeesPercentage);
      return;
    }
    const waiverAnnualInterestRate = Number(form.waiverAnnualInterestRate);
    if (!Number.isFinite(waiverAnnualInterestRate) || waiverAnnualInterestRate < 0 || waiverAnnualInterestRate > 999.99 ||
      (form.administrativeFeeWaiverEnabled && waiverAnnualInterestRate <= annualInterestRate)) {
      setFormError(t.invalidWaiverRate);
      return;
    }
    const payload: FinancingCompanyInput = {
      name: form.name.trim(),
      whatsappNumber: form.whatsappNumber.trim(),
      annualInterestRate,
      administrativeFeesPercentage,
      waiverAnnualInterestRate,
      administrativeFeeWaiverEnabled: form.administrativeFeeWaiverEnabled,
      isActive: form.isActive,
      sortOrder: form.sortOrder,
    };
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, input: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Page header */}
      <div
        className={isEditPage ? 'premium-page-header' : 'page-heading'}
        style={isEditPage ? { position: 'relative', overflow: 'hidden', marginBottom: '1.75rem' } : undefined}
      >
        <div>
          <span style={isEditPage ? { color: '#bfdbfe', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' } : undefined}>
            {isEditPage ? (isRtl ? 'إعدادات التمويل' : 'Financing settings') : t.eyebrow}
          </span>
          <h1 style={isEditPage ? { margin: '0.3rem 0 0.5rem', color: 'white' } : undefined}>
            {isEditPage ? t.editTitle : t.title}
          </h1>
          <p>{isEditPage && form.name ? form.name : t.subtitle}</p>
        </div>
        {isEditPage && <Building2 size={88} style={{ opacity: 0.1, position: 'absolute', insetInlineEnd: '2.5rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />}
        <div className="report-controls" style={isEditPage ? { position: 'relative', zIndex: 1 } : undefined}>
          {isEditPage && (
            <button className="secondary-action" onClick={closeForm}>
              <X size={16} /> {t.cancel}
            </button>
          )}
          {!isEditPage && <>
          <button className="secondary-action" onClick={() => refetch()}>
            <RefreshCw size={16} /> {t.refresh}
          </button>
          <button className="primary-action" onClick={openAdd}>
            <Plus size={16} /> {t.add}
          </button>
          </>}
        </div>
      </div>

      {/* States */}
      {isLoading && !isEditPage && (
        <div className="inventory-grid">
          {[1, 2, 3].map(n => <div className="metric-card skeleton" key={n} style={{ height: 90 }} />)}
        </div>
      )}
      {isEditPage && isLoading && (
        <div className="state-panel">{isRtl ? 'جاري تحميل بيانات الشركة...' : 'Loading company details...'}</div>
      )}
      {isError && !isEditPage && (
        <div className="state-panel">
          <p>{isRtl ? 'تعذر تحميل البيانات.' : 'Could not load data.'}</p>
          <button className="secondary-action" onClick={() => refetch()}>
            {isRtl ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
      {isError && isEditPage && (
        <div className="state-panel">
          <p>{isRtl ? 'تعذر تحميل بيانات الشركة.' : 'Could not load company details.'}</p>
          <button className="secondary-action" onClick={() => refetch()}>
            <RefreshCw size={16} /> {isRtl ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      )}
      {!isEditPage && !isLoading && !isError && companies.length === 0 && (
        <div className="state-panel">
          <Building2 size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>{t.noData}</p>
          <button className="primary-action" onClick={openAdd}><Plus size={16} /> {t.add}</button>
        </div>
      )}

      {/* Companies table */}
      {!isEditPage && !isLoading && !isError && companies.length > 0 && (
        <div className="surface-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#fff',
              }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>#</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.name}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.whatsappNumber}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{t.annualInterestRate}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{t.administrativeFeesPercentage}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{t.waiverAnnualInterestRate}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{isRtl ? 'الحالة' : 'Status'}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{t.sortOrder}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 600 }}>{t.createdAt}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, idx) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: idx % 2 === 0 ? 'transparent' : 'var(--bg-2)',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                    {c.sortOrder || idx + 1}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: c.isActive ? 'var(--green-light, #22c55e)' : 'var(--text-3)',
                        flexShrink: 0,
                      }} />
                      {c.name}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left', direction: 'ltr' }}>
                    {c.whatsappNumber}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {c.annualInterestRate.toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}%
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {(c.administrativeFeesPercentage ?? 0).toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}%
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {c.administrativeFeeWaiverEnabled
                      ? `${c.waiverAnnualInterestRate.toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}%`
                      : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <span className={`status-pill ${c.isActive ? 'status-available' : 'status-sold'}`}>
                      {c.isActive ? t.active : t.inactive}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-3)' }}>
                    {c.sortOrder}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-3)', fontSize: '0.8125rem' }}>
                    {formatDate(c.createdAt)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        className="secondary-action"
                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                        onClick={() => openEdit(c)}
                        title={t.edit}
                      >
                        <Pencil size={14} /> {t.edit}
                      </button>
                      <button
                        style={{
                          padding: '0.375rem 0.75rem', fontSize: '0.8125rem',
                          background: 'var(--red-light, #ef4444)', color: '#fff',
                          border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}
                        onClick={() => setDeleteTarget(c)}
                        title={t.delete}
                      >
                        <Trash2 size={14} /> {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <div
          className={isEditPage ? 'premium-glass-panel' : 'modal-backdrop'}
          style={isEditPage
            ? { width: '100%', maxWidth: 920, margin: '0 auto', padding: 'clamp(1.25rem, 3vw, 2.25rem)', border: '1px solid rgba(191, 219, 254, 0.8)', borderRadius: '1.25rem', background: 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(247,250,255,0.96))', boxShadow: '0 20px 55px rgba(15, 41, 79, 0.1)' }
            : { display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}
        >
          <div className={isEditPage ? undefined : 'payment-modal'} style={isEditPage ? undefined : { width: 'min(480px, 95%)', position: 'relative' }}>
            {!isEditPage && <button type="button" className="drawer-close" onClick={closeForm}><X size={18} /></button>}
            {isEditPage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.5rem', paddingBottom: '1.1rem', borderBottom: '1px solid #e6eef8' }}>
                <div style={{ display: 'grid', width: 42, height: 42, placeItems: 'center', flexShrink: 0, borderRadius: '0.85rem', color: '#2167a8', background: 'linear-gradient(145deg, #eaf3ff, #dcecff)' }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 style={{ margin: 0, color: '#173e6b', fontSize: '1.1rem', fontWeight: 850 }}>
                    {isRtl ? 'بيانات الشركة وشروط التمويل' : 'Company profile & financing terms'}
                  </h2>
                  <p style={{ margin: '0.25rem 0 0', color: '#70839b', fontSize: '0.82rem' }}>
                    {isRtl ? 'حدّث بيانات الشركة ونسب التمويل.' : 'Update company details and financing rates.'}
                  </p>
                </div>
              </div>
            )}
            {!isEditPage && <h2 style={{ marginBottom: '1.5rem' }}>{t.addTitle}</h2>}
            <form
              onSubmit={handleSubmit}
              className="transfer-form"
              style={isEditPage ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))', gap: '1.15rem', maxWidth: 'none' } : undefined}
            >
              {formError && <div className="inline-error" style={isEditPage ? { gridColumn: '1 / -1', margin: 0 } : undefined}>{formError}</div>}
              {isEditPage && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.2rem', color: '#46617f', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
                  {isRtl ? 'بيانات التواصل' : 'COMPANY CONTACT'}
                </div>
              )}
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.name} *</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 650, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)' } : undefined}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={isRtl ? 'مثال: شركة الأهلي للتمويل' : 'e.g. Al-Ahli Financing Co.'}
                  required
                  autoFocus
                />
              </label>
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.whatsappNumber} *</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 650, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)', direction: 'ltr' } : undefined}
                  value={form.whatsappNumber}
                  onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                  placeholder={isRtl ? '+966...' : '+966...'}
                  required
                />
              </label>
              {isEditPage && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.35rem', color: '#46617f', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
                  {isRtl ? 'نسب التمويل والإعفاء' : 'FINANCING & WAIVER RATES'}
                </div>
              )}
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.annualInterestRate} *</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 750, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)' } : undefined}
                  type="number"
                  min={0}
                  max={999.99}
                  step="0.01"
                  value={form.annualInterestRate}
                  onChange={e => setForm(f => ({ ...f, annualInterestRate: e.target.value }))}
                  required
                />
              </label>
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.administrativeFeesPercentage} *</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 750, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)' } : undefined}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.administrativeFeesPercentage}
                  onChange={e => setForm(f => ({ ...f, administrativeFeesPercentage: e.target.value }))}
                  required
                />
              </label>
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.waiverAnnualInterestRate} *</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 750, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)' } : undefined}
                  type="number"
                  min={0}
                  max={999.99}
                  step="0.01"
                  value={form.waiverAnnualInterestRate}
                  onChange={e => setForm(f => ({ ...f, waiverAnnualInterestRate: e.target.value }))}
                  required={form.administrativeFeeWaiverEnabled}
                />
              </label>
              <label style={isEditPage
                ? { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.95rem 1rem', border: `1px solid ${form.administrativeFeeWaiverEnabled ? '#b9d8fa' : '#e1eaf4'}`, borderRadius: '0.85rem', background: form.administrativeFeeWaiverEnabled ? 'linear-gradient(110deg, #edf5ff, #f8fbff)' : '#fff', color: '#344c68', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }
                : { display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  style={isEditPage ? { width: 18, height: 18, margin: 0, accentColor: '#2167a8' } : undefined}
                  type="checkbox"
                  checked={form.administrativeFeeWaiverEnabled}
                  onChange={e => setForm(f => ({ ...f, administrativeFeeWaiverEnabled: e.target.checked }))}
                />
                <span style={{ fontWeight: 500 }}>{t.administrativeFeeWaiverEnabled}</span>
              </label>
              <label style={isEditPage ? { display: 'grid', gap: '0.5rem', color: '#344c68', fontSize: '0.8rem', fontWeight: 750 } : undefined}>
                <span>{t.sortOrder}</span>
                <input
                  style={isEditPage ? { boxSizing: 'border-box', width: '100%', minHeight: 48, padding: '0.7rem 0.85rem', border: '1px solid #d6e3f2', borderRadius: '0.75rem', outline: 0, background: '#fff', color: '#173e6b', font: 'inherit', fontWeight: 750, boxShadow: '0 3px 10px rgba(28, 62, 102, 0.035)' } : undefined}
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </label>
              <label style={isEditPage
                ? { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.7rem', border: '1px solid #e1eaf4', borderRadius: '0.75rem', background: '#fff', color: '#344c68', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }
                : { display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: form.isActive ? 'var(--blue)' : 'var(--text-3)', display: 'flex' }}
                >
                  {form.isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
                <span style={{ fontWeight: 500 }}>{form.isActive ? t.active : t.inactive}</span>
              </label>
              <div style={isEditPage
                ? { gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.4rem', paddingTop: '1rem', borderTop: '1px solid #e6eef8' }
                : { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="secondary-action" onClick={closeForm} style={isEditPage ? { minWidth: 140 } : { flex: 1 }}>
                  <X size={15} /> {t.cancel}
                </button>
                <button type="submit" className="primary-action" disabled={isPending} style={isEditPage ? { minWidth: 160 } : { flex: 1 }}>
                  <Save size={15} /> {isPending ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="modal-backdrop" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <div className="payment-modal" style={{ width: 'min(400px, 95%)' }}>
            <h2 style={{ marginBottom: '0.75rem', fontSize: '1.125rem' }}>{t.confirmDelete}</h2>
            <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-2)' }}>
              <strong>{deleteTarget.name}</strong><br />{t.deleteWarning}
            </p>
            {formError && <div className="inline-error">{formError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="secondary-action" style={{ flex: 1 }} onClick={() => { setDeleteTarget(null); setFormError(''); }}>
                <X size={15} /> {t.cancel}
              </button>
              <button
                style={{ flex: 1, background: 'var(--red-light, #ef4444)', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                disabled={deleteMut.isPending}
                onClick={() => { setFormError(''); deleteMut.mutate(deleteTarget.id); }}
              >
                <Trash2 size={15} /> {deleteMut.isPending ? '…' : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
