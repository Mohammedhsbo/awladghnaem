import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Package, RefreshCw, Trash2 } from 'lucide-react';
import {
  desktopPermissions,
  motorcycleBoxes,
  type CreateMotorcycleBoxInput,
  type DesktopUser,
  type MotorcycleBox,
  type MotorcycleBoxChecklistInput,
} from '../api';

type MotorcycleChecklistDraft = {
  motorPresent: boolean | null;
  chassisPresent: boolean | null;
  tirePresent: boolean | null;
};

type BoxForm = {
  boxNumber: string;
  motorcycleCount: number | '';
  motorcycles: MotorcycleChecklistDraft[];
};

const emptyChecklist = (): MotorcycleChecklistDraft => ({
  motorPresent: null,
  chassisPresent: null,
  tirePresent: null,
});

const emptyForm = (): BoxForm => ({
  boxNumber: '',
  motorcycleCount: 1,
  motorcycles: [emptyChecklist()],
});

function motorcycleLabel(index: number) {
  const ordinals = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  return index < ordinals.length
    ? `الموتوسيكل ${ordinals[index]}`
    : `الموتوسيكل رقم ${index + 1}`;
}

function ComponentStatus({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return <fieldset className="box-status-field">
    <legend>{label}</legend>
    {[true, false].map(present => <label className="box-status-option" key={String(present)}>
      <input
        type="radio"
        name={name}
        checked={value === present}
        onChange={() => onChange(present)}
        required
      />
      {present ? 'موجود' : 'غير موجود'}
    </label>)}
  </fieldset>;
}

function ComponentStatusSummary({
  box,
  field,
}: {
  box: MotorcycleBox;
  field: 'motorPresent' | 'chassisPresent' | 'tirePresent';
}) {
  if (box.motorcycleUnits?.length) {
    return <>{box.motorcycleUnits.map((unit, index) => <span
      className={unit[field] ? 'status-pill' : 'status-text'}
      key={unit.id}
    >
      {motorcycleLabel(index)}: {unit[field] ? 'موجود' : 'غير موجود'}
    </span>)}</>;
  }
  return <span className={box[field] ? 'status-pill' : 'status-text'}>{box[field] ? 'موجود' : 'غير موجود'}</span>;
}

export default function MotorcycleBoxes({ user }: { user: DesktopUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BoxForm>(emptyForm);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
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

  const save = useMutation({
    mutationFn: (data: CreateMotorcycleBoxInput) => editingBox
      ? motorcycleBoxes.update(editingBox.id, data)
      : motorcycleBoxes.create(data),
    onSuccess: () => {
      setForm(emptyForm());
      setEditingBox(null);
      setValidationErrors({});
      setError('');
      setSuccess(editingBox ? 'تم تعديل الصندوق بنجاح.' : 'تمت إضافة الصندوق بنجاح.');
      void queryClient.invalidateQueries({ queryKey: ['motorcycle-boxes'] });
    },
    onError: (reason: Error) => {
      setSuccess('');
      setError(reason.message || 'تعذر حفظ الصندوق. حاول مرة أخرى.');
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

  const updateMotorcycle = (index: number, patch: Partial<MotorcycleChecklistDraft>) => {
    setForm(current => ({
      ...current,
      motorcycles: current.motorcycles.map((motorcycle, currentIndex) =>
        currentIndex === index ? { ...motorcycle, ...patch } : motorcycle,
      ),
    }));
    setValidationErrors(current => {
      const next = { ...current };
      Object.keys(patch).forEach(field => delete next[`motorcycles.${index}.${field}`]);
      return next;
    });
    setError('');
    setSuccess('');
  };

  const updateCount = (value: string) => {
    const motorcycleCount = value === '' ? '' : Number(value);
    setForm(current => {
      const validCount = typeof motorcycleCount === 'number'
        && Number.isInteger(motorcycleCount)
        && motorcycleCount > 0
        && motorcycleCount <= 2_147_483_647;
      const motorcycles = validCount
        ? Array.from(
          { length: motorcycleCount },
          (_, index) => current.motorcycles[index] ?? emptyChecklist(),
        )
        : [];
      return { ...current, motorcycleCount, motorcycles };
    });
    setValidationErrors(current => {
      const next = { ...current };
      delete next.motorcycleCount;
      Object.keys(next).forEach(key => {
        const index = Number(key.match(/^motorcycles\.(\d+)\./)?.[1]);
        if (Number.isInteger(index) && index >= Number(motorcycleCount || 0)) delete next[key];
      });
      return next;
    });
    setError('');
    setSuccess('');
  };

  const openEdit = (box: MotorcycleBox) => {
    const motorcycleCount = Math.max(box.motorcycleCount || 1, box.motorcycleUnits?.length ?? 0, 1);
    setEditingBox(box);
    setForm({
      boxNumber: box.boxNumber,
      motorcycleCount,
      motorcycles: Array.from({ length: motorcycleCount }, (_, index) => {
        const unit = box.motorcycleUnits?.[index];
        const hasLegacyStatuses = index === 0 && !box.motorcycleUnits?.length;
        return {
          motorPresent: unit?.motorPresent ?? (hasLegacyStatuses ? box.motorPresent : null),
          chassisPresent: unit?.chassisPresent ?? (hasLegacyStatuses ? box.chassisPresent : null),
          tirePresent: unit?.tirePresent ?? (hasLegacyStatuses ? box.tirePresent : null),
        };
      }),
    });
    setValidationErrors({});
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingBox(null);
    setForm(emptyForm());
    setValidationErrors({});
    setError('');
    setSuccess('');
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.boxNumber.trim()) errors.boxNumber = 'اسم الصندوق أو رقمه مطلوب.';
    if (
      typeof form.motorcycleCount !== 'number'
      || !Number.isInteger(form.motorcycleCount)
      || form.motorcycleCount < 1
      || form.motorcycleCount > 2_147_483_647
    ) {
      errors.motorcycleCount = 'أدخل عددًا صحيحًا موجبًا للموتوسيكلات.';
    } else if (form.motorcycles.length !== form.motorcycleCount) {
      errors.motorcycleCount = 'عدد قوائم المكونات يجب أن يطابق عدد الموتوسيكلات.';
    }

    form.motorcycles.forEach((motorcycle, index) => {
      if (motorcycle.motorPresent === null) errors[`motorcycles.${index}.motorPresent`] = 'حدد حالة الموتور.';
      if (motorcycle.chassisPresent === null) errors[`motorcycles.${index}.chassisPresent`] = 'حدد حالة الشاسيه.';
      if (motorcycle.tirePresent === null) errors[`motorcycles.${index}.tirePresent`] = 'حدد حالة الكاوتش.';
    });
    return errors;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const errors = validateForm();
    setValidationErrors(errors);
    if (Object.keys(errors).length) {
      setError('يرجى مراجعة الحقول المحددة قبل الحفظ.');
      return;
    }
    if (typeof form.motorcycleCount !== 'number') return;

    const motorcycles: MotorcycleBoxChecklistInput[] = [];
    for (const motorcycle of form.motorcycles) {
      if (
        motorcycle.motorPresent === null
        || motorcycle.chassisPresent === null
        || motorcycle.tirePresent === null
      ) {
        setError('يرجى تحديد حالة المكونات لكل موتوسيكل.');
        return;
      }
      motorcycles.push({
        motorPresent: motorcycle.motorPresent,
        chassisPresent: motorcycle.chassisPresent,
        tirePresent: motorcycle.tirePresent,
      });
    }
    save.mutate({
      boxNumber: form.boxNumber.trim(),
      motorcycleCount: form.motorcycleCount,
      motorcycles,
    });
  };

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
        <p>إضافة الصناديق ومراجعة مكونات الموتوسيكلات المحفوظة.</p>
      </div>
      <button className="secondary-action" type="button" onClick={() => list.refetch()} disabled={list.isFetching}>
        <RefreshCw size={16} /> تحديث
      </button>
    </div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {success && <div className="inline-success" role="status">{success}</div>}

    {(canCreate || (editingBox && canEdit)) && <form className="surface-panel motorcycle-box-form" onSubmit={submit}>
      <h2><Package size={19} /> {editingBox ? 'تعديل الصندوق' : 'إضافة صندوق'}</h2>
      <h3 className="box-form-section-title">معلومات الصندوق</h3>
      <div className="box-information-grid">
        <label className="box-number-label">
          اسم الصندوق أو رقمه
          <input
            value={form.boxNumber}
            onChange={event => {
              setForm(current => ({ ...current, boxNumber: event.target.value }));
              setValidationErrors(current => {
                const next = { ...current };
                delete next.boxNumber;
                return next;
              });
              setError('');
              setSuccess('');
            }}
            maxLength={100}
            required
          />
          {validationErrors.boxNumber && <span className="box-field-error">{validationErrors.boxNumber}</span>}
        </label>
        <label className="box-count-label">
          عدد الموتوسيكلات في الصندوق
          <input
            type="number"
            min={1}
            max={2_147_483_647}
            step={1}
            value={form.motorcycleCount}
            onChange={event => updateCount(event.target.value)}
            required
          />
          {validationErrors.motorcycleCount && <span className="box-field-error">{validationErrors.motorcycleCount}</span>}
        </label>
      </div>
      {editingBox && (editingBox.motorcycleUnits?.length ?? 0) > Number(form.motorcycleCount || 0) && <p className="box-count-warning">
        ستبقى الموتوسيكلات المرتبطة الزائدة محفوظة في المخزون بعد إزالتها من الصندوق.
      </p>}

      <h3 className="box-form-section-title">قائمة مكونات الموتوسيكلات</h3>
      <div className="box-motorcycle-sections">
        {form.motorcycles.map((motorcycle, index) => {
          const fieldError = (field: string) => validationErrors[`motorcycles.${index}.${field}`];
          return <section className="box-motorcycle-section" key={index}>
            <h4>{motorcycleLabel(index)}</h4>
            <div className="box-status-grid">
              <div>
                <ComponentStatus
                  label="الموتور"
                  name={`motorcycle-${index}-motor`}
                  value={motorcycle.motorPresent}
                  onChange={value => updateMotorcycle(index, { motorPresent: value })}
                />
                {fieldError('motorPresent') && <span className="box-field-error" role="alert">{fieldError('motorPresent')}</span>}
              </div>
              <div>
                <ComponentStatus
                  label="الشاسيه"
                  name={`motorcycle-${index}-chassis`}
                  value={motorcycle.chassisPresent}
                  onChange={value => updateMotorcycle(index, { chassisPresent: value })}
                />
                {fieldError('chassisPresent') && <span className="box-field-error" role="alert">{fieldError('chassisPresent')}</span>}
              </div>
              <div>
                <ComponentStatus
                  label="الكاوتش"
                  name={`motorcycle-${index}-tire`}
                  value={motorcycle.tirePresent}
                  onChange={value => updateMotorcycle(index, { tirePresent: value })}
                />
                {fieldError('tirePresent') && <span className="box-field-error" role="alert">{fieldError('tirePresent')}</span>}
              </div>
            </div>
          </section>;
        })}
      </div>
      <div className="modal-actions">
        {editingBox && <button type="button" className="secondary-action" onClick={cancelEdit}>إلغاء</button>}
        <button className="primary-action" disabled={save.isPending}>
          {save.isPending ? (editingBox ? 'جاري الحفظ...' : 'جاري الإضافة...') : (editingBox ? 'حفظ التعديلات' : 'إضافة الصندوق')}
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
            <th>رقم/اسم الصندوق</th><th>قوائم الموتوسيكلات</th><th>العدد</th><th>الموتور</th><th>الشاسيه</th><th>الكاوتش</th><th>تاريخ الإضافة</th>
            {(canEdit || canDelete) && <th>الإجراءات</th>}
          </tr></thead>
          <tbody>{list.data.map(box => <tr key={box.id}>
            <td>{box.boxNumber}</td>
            <td className="box-list-motorcycles">
              {box.motorcycleUnits?.length
                ? box.motorcycleUnits.map((unit, index) => <span key={unit.id}>{motorcycleLabel(index)}</span>)
                : <span>بيانات المكونات الفردية غير مسجلة</span>}
            </td>
            <td>{box.motorcycleCount ?? box.motorcycleUnits?.length ?? 1}</td>
            <td className="box-component-status"><ComponentStatusSummary box={box} field="motorPresent" /></td>
            <td className="box-component-status"><ComponentStatusSummary box={box} field="chassisPresent" /></td>
            <td className="box-component-status"><ComponentStatusSummary box={box} field="tirePresent" /></td>
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
