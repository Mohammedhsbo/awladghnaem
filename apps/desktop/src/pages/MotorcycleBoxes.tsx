import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Package, RefreshCw, Trash2 } from 'lucide-react';
import { desktopPermissions, motorcycleBoxes, type CreateMotorcycleBoxInput, type DesktopUser, type MotorcycleBox } from '../api';

const emptyForm = {
  boxNumber: '',
  motorPresent: null as boolean | null,
  chassisPresent: null as boolean | null,
  tirePresent: null as boolean | null,
};

function ComponentStatus({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return <fieldset className="box-status-field">
    <legend>{label}</legend>
    {[true, false].map(present => <label className="box-status-option" key={String(present)}>
      <input
        type="radio"
        name={label}
        checked={value === present}
        onChange={() => onChange(present)}
        required
      />
      {present ? 'موجود' : 'غير موجود'}
    </label>)}
  </fieldset>;
}

export default function MotorcycleBoxes({ user }: { user: DesktopUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [editingBox, setEditingBox] = useState<MotorcycleBox | null>(null);
  const isSuperAdmin = user.role.name === 'super_admin';

  const permissions = useQuery({
    queryKey: ['my-desktop-perms'],
    queryFn: desktopPermissions.getMe,
    enabled: !isSuperAdmin,
    staleTime: 60_000,
  });
  const pageCanEdit = isSuperAdmin || permissions.data?.find(permission => permission.pageKey === 'boxes')?.canEdit === true;
  const hasCreatePermission = isSuperAdmin || user.role.permissions.some(permission =>
    permission.resource === 'motorcycle' && permission.action === 'create',
  );
  const hasUpdatePermission = isSuperAdmin || user.role.permissions.some(permission =>
    permission.resource === 'motorcycle' && permission.action === 'update',
  );
  const hasDeletePermission = isSuperAdmin || user.role.permissions.some(permission =>
    permission.resource === 'motorcycle' && permission.action === 'delete',
  );
  const canCreate = pageCanEdit && hasCreatePermission;
  const canEdit = pageCanEdit && hasUpdatePermission;
  const canDelete = pageCanEdit && hasDeletePermission;
  const canView = isSuperAdmin || permissions.data?.find(permission => permission.pageKey === 'boxes')?.canView === true;

  const list = useQuery({
    queryKey: ['motorcycle-boxes'],
    queryFn: motorcycleBoxes.list,
    enabled: canView,
  });
  const create = useMutation({
    mutationFn: (data: CreateMotorcycleBoxInput) => editingBox
      ? motorcycleBoxes.update(editingBox.id, data)
      : motorcycleBoxes.create(data),
    onSuccess: () => {
      setForm(emptyForm);
      setEditingBox(null);
      setError('');
      setSuccess(editingBox ? 'تم تعديل الصندوق بنجاح.' : 'تمت إضافة الصندوق بنجاح.');
      void queryClient.invalidateQueries({ queryKey: ['motorcycle-boxes'] });
    },
    onError: (reason: Error) => {
      setSuccess('');
      setError(reason.message || 'تعذر إضافة الصندوق. حاول مرة أخرى.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => motorcycleBoxes.remove(id),
    onSuccess: () => {
      setError('');
      setSuccess('تم حذف الصندوق بنجاح.');
      void queryClient.invalidateQueries({ queryKey: ['motorcycle-boxes'] });
    },
    onError: (reason: Error) => {
      setSuccess('');
      setError(reason.message || 'تعذر حذف الصندوق. حاول مرة أخرى.');
    },
  });

  const openEdit = (box: MotorcycleBox) => {
    setEditingBox(box);
    setForm({
      boxNumber: box.boxNumber,
      motorPresent: box.motorPresent,
      chassisPresent: box.chassisPresent,
      tirePresent: box.tirePresent,
    });
    setError('');
    setSuccess('');
  };
  const cancelEdit = () => {
    setEditingBox(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
  };

  const isFormValid = form.boxNumber.trim().length > 0
    && form.motorPresent !== null
    && form.chassisPresent !== null
    && form.tirePresent !== null;

  if (!isSuperAdmin && permissions.isLoading) {
    return <section className="desktop-page" dir="rtl"><div className="state-panel">جاري تحميل الصلاحيات...</div></section>;
  }
  if (!isSuperAdmin && permissions.isError) {
    return <section className="desktop-page" dir="rtl"><div className="state-panel" role="alert">تعذر تحميل صلاحيات الصفحة. أعد تحميل الصفحة للمحاولة مرة أخرى.</div></section>;
  }
  if (!canView) {
    return <section className="desktop-page" dir="rtl"><div className="state-panel">ليس لديك صلاحية عرض الصناديق.</div></section>;
  }

  return <section className="desktop-page motorcycle-boxes-page" dir="rtl">
    <div className="page-heading">
      <div>
        <span className="eyebrow">إدارة المخزون</span>
        <h1>الصناديق</h1>
        <p>إضافة الصناديق ومراجعة حالة مكوناتها المحفوظة.</p>
      </div>
      <button className="secondary-action" type="button" onClick={() => list.refetch()} disabled={list.isFetching}>
        <RefreshCw size={16} /> تحديث
      </button>
    </div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {success && <div className="inline-success" role="status">{success}</div>}

    {(canCreate || (editingBox && canEdit)) && <form
      className="surface-panel motorcycle-box-form"
      onSubmit={event => {
        event.preventDefault();
        if (form.motorPresent === null || form.chassisPresent === null || form.tirePresent === null || !form.boxNumber.trim()) return;
        create.mutate({
          boxNumber: form.boxNumber.trim(),
          motorPresent: form.motorPresent,
          chassisPresent: form.chassisPresent,
          tirePresent: form.tirePresent,
        });
      }}
    >
      <h2><Package size={19} /> {editingBox ? 'تعديل الصندوق' : 'إضافة صندوق'}</h2>
      <label className="box-number-label">
        اسم الصندوق أو رقمه
        <input
          value={form.boxNumber}
          onChange={event => { setForm(current => ({ ...current, boxNumber: event.target.value })); setError(''); setSuccess(''); }}
          maxLength={100}
          required
        />
      </label>
      <div className="box-status-grid">
        <ComponentStatus label="الماتور" value={form.motorPresent} onChange={value => { setForm(current => ({ ...current, motorPresent: value })); setError(''); setSuccess(''); }} />
        <ComponentStatus label="الشاسيه" value={form.chassisPresent} onChange={value => { setForm(current => ({ ...current, chassisPresent: value })); setError(''); setSuccess(''); }} />
        <ComponentStatus label="الكاوتش" value={form.tirePresent} onChange={value => { setForm(current => ({ ...current, tirePresent: value })); setError(''); setSuccess(''); }} />
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-action" onClick={cancelEdit}>
          إلغاء
        </button>
        <button className="primary-action" disabled={!isFormValid || create.isPending}>
          {create.isPending ? (editingBox ? 'جاري الحفظ...' : 'جاري الإضافة...') : (editingBox ? 'حفظ التعديلات' : 'إضافة الصندوق')}
        </button>
      </div>
    </form>}

    {!canCreate && !editingBox && <div className="state-panel">لديك صلاحية عرض الصناديق فقط.</div>}

    <div className="surface-panel boxes-list-panel">
      <div className="panel-heading"><h2>الصناديق المحفوظة</h2><span>{list.data?.length ?? 0}</span></div>
      {list.isLoading && <div className="state-panel">جاري تحميل الصناديق...</div>}
      {list.isError && <div className="state-panel" role="alert">
        <p>تعذر تحميل الصناديق.</p>
        <button className="secondary-action" onClick={() => list.refetch()}>إعادة المحاولة</button>
      </div>}
      {!list.isLoading && !list.isError && list.data?.length === 0 && <div className="empty-state">لا توجد صناديق محفوظة حتى الآن.</div>}
      {!list.isLoading && !list.isError && !!list.data?.length && <div className="attendance-table-wrap">
        <table className="attendance-table">
          <thead><tr>
            <th>رقم/اسم الصندوق</th><th>الماتور</th><th>الشاسيه</th><th>الكاوتش</th><th>تاريخ الإضافة</th>
            {(canEdit || canDelete) && <th>الإجراءات</th>}
          </tr></thead>
          <tbody>{list.data.map(box => <tr key={box.id}>
            <td>{box.boxNumber}</td>
            <td><span className={box.motorPresent ? 'status-pill' : 'status-text'}>{box.motorPresent ? 'موجود' : 'غير موجود'}</span></td>
            <td><span className={box.chassisPresent ? 'status-pill' : 'status-text'}>{box.chassisPresent ? 'موجود' : 'غير موجود'}</span></td>
            <td><span className={box.tirePresent ? 'status-pill' : 'status-text'}>{box.tirePresent ? 'موجود' : 'غير موجود'}</span></td>
            <td>{new Date(box.createdAt).toLocaleDateString('ar-EG')}</td>
            {(canEdit || canDelete) && <td className="box-row-actions">
              {canEdit && <button type="button" className="icon-button" title="تعديل" aria-label={`تعديل ${box.boxNumber}`} onClick={() => openEdit(box)}>
                <Edit3 size={16} />
              </button>}
              {canDelete && <button
                type="button"
                className="icon-button box-delete-button"
                title="حذف"
                aria-label={`حذف ${box.boxNumber}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`هل أنت متأكد من حذف الصندوق "${box.boxNumber}"؟`)) {
                    setError('');
                    setSuccess('');
                    remove.mutate(box.id);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>}
            </td>}
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </section>;
}
