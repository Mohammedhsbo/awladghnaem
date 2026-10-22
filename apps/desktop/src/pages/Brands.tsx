import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { brands, getUser, type BrandInput, type BrandRecord, type BrandUpdateInput } from '../api';

type Lang = 'en' | 'ar';

interface BrandFormState {
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm: BrandFormState = { nameAr: '', nameEn: '', sortOrder: 0, isActive: true };
const emptyBrands: BrandRecord[] = [];

function hasPermission(action: string) {
  const user = getUser();
  return user?.role.name === 'super_admin' ||
    user?.role.permissions.some(permission => permission.resource === 'motorcycle' && permission.action === action) === true;
}

export default function Brands({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const queryClient = useQueryClient();
  const canCreate = hasPermission('create');
  const canUpdate = hasPermission('update');
  const canDelete = hasPermission('delete');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BrandRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BrandRecord | null>(null);
  const [form, setForm] = useState<BrandFormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const query = useQuery({
    queryKey: ['desktop-brands-management'],
    queryFn: brands.listAll,
  });
  const records = query.data ?? emptyBrands;
  const filteredBrands = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return records;
    return records.filter(brand =>
      brand.nameAr.toLocaleLowerCase().includes(term) ||
      brand.nameEn.toLocaleLowerCase().includes(term),
    );
  }, [records, search]);

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['desktop-brands-management'] });
    void queryClient.invalidateQueries({ queryKey: ['desktop-brands'] });
  };

  const save = useMutation({
    mutationFn: (payload: { id: string; input: BrandUpdateInput } | { id: null; input: BrandInput }) =>
      payload.id === null ? brands.create(payload.input) : brands.update(payload.id, payload.input),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => brands.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (error: Error & { code?: string }) => {
      setDeleteError(error.code === 'BRAND_IN_USE'
        ? (isRtl ? 'لا يمكن حذف هذه الماركة لارتباطها بدراجات في المخزون.' : 'This brand cannot be deleted because motorcycles are linked to it.')
        : error.message);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (brand: BrandRecord) => {
    setEditing(brand);
    setForm({
      nameAr: brand.nameAr,
      nameEn: brand.nameEn,
      sortOrder: brand.sortOrder,
      isActive: brand.isActive,
    });
    setFormError('');
    setShowForm(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    const nameAr = form.nameAr.trim();
    const nameEn = form.nameEn.trim();
    if (!nameAr || !nameEn) {
      setFormError(isRtl ? 'يرجى إدخال اسم الماركة بالعربية والإنجليزية.' : 'Enter the brand name in Arabic and English.');
      return;
    }
    if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0) {
      setFormError(isRtl ? 'يجب أن يكون ترتيب الماركة رقمًا صحيحًا غير سالب.' : 'Sort order must be a non-negative integer.');
      return;
    }

    const input = editing
      ? { nameAr, nameEn, sortOrder: form.sortOrder, isActive: form.isActive }
      : { nameAr, nameEn, sortOrder: form.sortOrder };
    save.mutate({ id: editing?.id ?? null, input });
  };

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{isRtl ? 'إدارة المخزون' : 'Inventory management'}</span>
          <h1>{isRtl ? 'الماركات التجارية' : 'Motorcycle brands'}</h1>
          <p>{isRtl ? 'إدارة الماركات المستخدمة في بيانات الدراجات.' : 'Manage brands used by motorcycle inventory.'}</p>
        </div>
        <div className="report-controls">
          <button className="secondary-action" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={16} /> {isRtl ? 'تحديث' : 'Refresh'}
          </button>
          {canCreate && (
            <button className="primary-action" onClick={openCreate}>
              <Plus size={16} /> {isRtl ? 'إضافة ماركة' : 'Add brand'}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={isRtl ? 'ابحث باسم الماركة بالعربية أو الإنجليزية...' : 'Search Arabic or English brand name...'}
            aria-label={isRtl ? 'البحث عن ماركة' : 'Search brands'}
          />
        </div>
        <span className="result-count">{filteredBrands.length} {isRtl ? 'ماركة' : 'brands'}</span>
      </div>

      {query.isLoading && <div className="state-panel">{isRtl ? 'جاري تحميل الماركات...' : 'Loading brands...'}</div>}
      {query.isError && (
        <div className="state-panel" role="alert">
          <p>{isRtl ? 'تعذر تحميل الماركات.' : 'Could not load brands.'}</p>
          <button className="secondary-action" onClick={() => query.refetch()}>{isRtl ? 'إعادة المحاولة' : 'Retry'}</button>
        </div>
      )}
      {!query.isLoading && !query.isError && filteredBrands.length === 0 && (
        <div className="state-panel">
          <Bike size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>{search.trim()
            ? (isRtl ? 'لا توجد ماركات تطابق البحث.' : 'No brands match your search.')
            : (isRtl ? 'لا توجد ماركات مسجلة.' : 'No brands have been added yet.')}</p>
          {!search.trim() && canCreate && (
            <button className="primary-action" onClick={openCreate}><Plus size={16} /> {isRtl ? 'إضافة ماركة' : 'Add brand'}</button>
          )}
        </div>
      )}
      {!query.isLoading && !query.isError && filteredBrands.length > 0 && (
        <div className="surface-panel" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', color: '#fff' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left' }}>#</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left' }}>{isRtl ? 'الاسم بالعربية' : 'Arabic name'}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: isRtl ? 'right' : 'left' }}>{isRtl ? 'الاسم بالإنجليزية' : 'English name'}</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{isRtl ? 'الحالة' : 'Status'}</th>
                {(canUpdate || canDelete) && <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{isRtl ? 'إجراءات' : 'Actions'}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredBrands.map((brand, index) => (
                <tr key={brand.id} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'transparent' : 'var(--bg-2)' }}>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-3)' }}>{brand.sortOrder}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{brand.nameAr}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{brand.nameEn}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <span className={`status-pill ${brand.isActive ? 'status-active' : 'status-cancelled'}`}>
                      {brand.isActive ? (isRtl ? 'نشطة' : 'Active') : (isRtl ? 'غير نشطة' : 'Inactive')}
                    </span>
                  </td>
                  {(canUpdate || canDelete) && (
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {canUpdate && (
                          <button className="secondary-action" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }} onClick={() => openEdit(brand)}>
                            <Pencil size={14} /> {isRtl ? 'تعديل' : 'Edit'}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className="secondary-action"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: 'var(--red-light)' }}
                            onClick={() => { setDeleteTarget(brand); setDeleteError(''); }}
                            disabled={(brand._count?.motorcycles ?? 0) > 0}
                            title={(brand._count?.motorcycles ?? 0) > 0
                              ? (isRtl ? 'لا يمكن حذف ماركة مرتبطة بدراجات.' : 'Brands linked to motorcycles cannot be deleted.')
                              : undefined}
                          >
                            <Trash2 size={14} /> {isRtl ? 'حذف' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <div className="payment-modal" style={{ width: 'min(520px, 95%)', position: 'relative' }}>
            <button type="button" className="drawer-close" onClick={closeForm} aria-label={isRtl ? 'إغلاق' : 'Close'}><X size={18} /></button>
            <h2 style={{ marginBottom: '1.5rem' }}>{editing ? (isRtl ? 'تعديل الماركة' : 'Edit brand') : (isRtl ? 'إضافة ماركة جديدة' : 'Add a brand')}</h2>
            <form onSubmit={submit} className="transfer-form">
              {formError && <div className="inline-error" role="alert">{formError}</div>}
              <label>
                <span>{isRtl ? 'الاسم بالعربية *' : 'Arabic name *'}</span>
                <input maxLength={200} value={form.nameAr} onChange={event => setForm(current => ({ ...current, nameAr: event.target.value }))} required autoFocus />
              </label>
              <label>
                <span>{isRtl ? 'الاسم بالإنجليزية *' : 'English name *'}</span>
                <input maxLength={200} value={form.nameEn} onChange={event => setForm(current => ({ ...current, nameEn: event.target.value }))} required />
              </label>
              <label>
                <span>{isRtl ? 'الترتيب' : 'Sort order'}</span>
                <input type="number" min={0} step={1} value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))} />
              </label>
              {editing && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <input type="checkbox" checked={form.isActive} onChange={event => setForm(current => ({ ...current, isActive: event.target.checked }))} />
                  <span>{isRtl ? 'ماركة نشطة' : 'Active brand'}</span>
                </label>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="secondary-action" onClick={closeForm} style={{ flex: 1 }}>
                  <X size={15} /> {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" className="primary-action" disabled={save.isPending} style={{ flex: 1 }}>
                  {save.isPending ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, alignItems: 'center', justifyContent: 'center' }}>
          <div className="payment-modal" style={{ width: 'min(440px, 95%)', position: 'relative' }}>
            <h2>{isRtl ? 'تأكيد حذف الماركة' : 'Confirm brand deletion'}</h2>
            <p>{isRtl ? `هل تريد حذف «${deleteTarget.nameAr}»؟` : `Delete "${deleteTarget.nameEn}"?`}</p>
            <p>{isRtl ? 'لا يمكن حذف الماركة إذا كانت مرتبطة بدراجات في المخزون.' : 'Brands linked to inventory motorcycles cannot be deleted.'}</p>
            {deleteError && <div className="inline-error" role="alert">{deleteError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="secondary-action" onClick={() => { setDeleteTarget(null); setDeleteError(''); }} style={{ flex: 1 }}>
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                className="primary-action"
                onClick={() => remove.mutate(deleteTarget.id)}
                disabled={remove.isPending}
                style={{ flex: 1, background: 'var(--red-light, #ef4444)' }}
              >
                {remove.isPending ? (isRtl ? 'جاري الحذف...' : 'Deleting...') : (isRtl ? 'حذف' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
