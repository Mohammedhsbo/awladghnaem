import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Package, RefreshCw, Trash2 } from 'lucide-react';
import {
  branches,
  brands,
  categories,
  desktopPermissions,
  motorcycleBoxes,
  type CreateMotorcycleBoxInput,
  type DesktopUser,
  type MotorcycleBox,
  type MotorcycleBoxUnitInput,
} from '../api';

type FuelType = 'PETROL' | 'ELECTRIC' | '';
type MotorcycleCondition = 'NEW' | 'USED' | 'IMPORTED' | '';
type MotorcycleDraft = {
  engineNumber: string;
  vin: string;
  fuelType: FuelType;
  model: string;
  year: number | '';
  color: string;
  engineSize: string;
  price: number | '';
  costPrice: number | '';
  condition: MotorcycleCondition;
  brandId: string;
  categoryId: string;
  branchId: string;
  motorPresent: boolean | null;
  chassisPresent: boolean | null;
  tirePresent: boolean | null;
};
type BoxForm = {
  boxNumber: string;
  motorcycleCount: 1 | 2;
  motorcycles: [MotorcycleDraft, MotorcycleDraft];
};

const emptyMotorcycle = (year: number | '' = new Date().getFullYear()): MotorcycleDraft => ({
  engineNumber: '',
  vin: '',
  fuelType: '',
  model: '',
  year,
  color: '',
  engineSize: '',
  price: 0,
  costPrice: 0,
  condition: 'NEW',
  brandId: '',
  categoryId: '',
  branchId: '',
  motorPresent: null,
  chassisPresent: null,
  tirePresent: null,
});

const emptyForm = (): BoxForm => ({
  boxNumber: '',
  motorcycleCount: 1,
  motorcycles: [emptyMotorcycle(), emptyMotorcycle()],
});

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

function boxMotorcycleDraft(box: MotorcycleBox, index: number): MotorcycleDraft {
  const unit = box.motorcycleUnits?.[index];
  const motorcycle = unit?.motorcycle;
  const isLegacyPrimary = index === 0 && !unit;
  return {
    engineNumber: motorcycle?.engineNumber ?? '',
    vin: motorcycle?.vin ?? '',
    fuelType: motorcycle?.fuelType ?? '',
    model: motorcycle?.model ?? '',
    year: motorcycle?.year ?? '',
    color: motorcycle?.color ?? '',
    engineSize: motorcycle?.engineSize ?? '',
    price: motorcycle ? Number(motorcycle.price) : '',
    costPrice: motorcycle ? Number(motorcycle.costPrice) : '',
    condition: motorcycle?.condition ?? '',
    brandId: motorcycle?.brandId ?? '',
    categoryId: motorcycle?.categoryId ?? '',
    branchId: motorcycle?.branchId ?? '',
    motorPresent: unit?.motorPresent ?? (isLegacyPrimary ? box.motorPresent : null),
    chassisPresent: unit?.chassisPresent ?? (isLegacyPrimary ? box.chassisPresent : null),
    tirePresent: unit?.tirePresent ?? (isLegacyPrimary ? box.tirePresent : null),
  };
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
      {index === 0 ? 'الأول' : 'الثاني'}: {unit[field] ? 'موجود' : 'غير موجود'}
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
  const formEnabled = canCreate || (!!editingBox && canEdit);

  const list = useQuery({
    queryKey: ['motorcycle-boxes'],
    queryFn: motorcycleBoxes.list,
    enabled: canView,
  });
  const brandList = useQuery({
    queryKey: ['motorcycle-box-brands'],
    queryFn: () => brands.list({ isActive: true }),
    enabled: formEnabled,
  });
  const categoryList = useQuery({
    queryKey: ['motorcycle-box-categories'],
    queryFn: () => categories.list({ isActive: true, flat: true }),
    enabled: formEnabled,
  });
  const branchList = useQuery({
    queryKey: ['motorcycle-box-branches'],
    queryFn: () => branches.list(),
    enabled: formEnabled,
  });

  const create = useMutation({
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
      void queryClient.invalidateQueries({ queryKey: ['desktop-inventory'] });
    },
    onError: (reason: Error) => {
      const details = (reason as Error & { details?: { motorcycleIndex?: number; field?: string } }).details;
      if (details && Number.isInteger(details.motorcycleIndex) && details.field) {
        setValidationErrors(current => ({
          ...current,
          [`motorcycles.${details.motorcycleIndex}.${details.field}`]: 'هذا الرقم مستخدم بالفعل في المخزون.',
        }));
      }
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

  const updateMotorcycle = (index: number, patch: Partial<MotorcycleDraft>) => {
    setForm(current => ({
      ...current,
      motorcycles: current.motorcycles.map((motorcycle, currentIndex) =>
        currentIndex === index ? { ...motorcycle, ...patch } : motorcycle,
      ) as BoxForm['motorcycles'],
    }));
    setValidationErrors(current => {
      const next = { ...current };
      Object.keys(patch).forEach(field => delete next[`motorcycles.${index}.${field}`]);
      return next;
    });
    setError('');
    setSuccess('');
  };

  const openEdit = (box: MotorcycleBox) => {
    setEditingBox(box);
    setForm({
      boxNumber: box.boxNumber,
      motorcycleCount: box.motorcycleCount === 2 ? 2 : 1,
      motorcycles: [boxMotorcycleDraft(box, 0), boxMotorcycleDraft(box, 1)],
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
    const selected = form.motorcycles.slice(0, form.motorcycleCount);
    selected.forEach((motorcycle, index) => {
      const key = (field: string) => `motorcycles.${index}.${field}`;
      if (!motorcycle.engineNumber.trim()) errors[key('engineNumber')] = 'رقم الموتور مطلوب.';
      if (!motorcycle.vin.trim()) errors[key('vin')] = 'رقم الشاسيه مطلوب.';
      if (!motorcycle.model.trim()) errors[key('model')] = 'الموديل مطلوب.';
      if (motorcycle.year === '' || !Number.isInteger(Number(motorcycle.year)) || Number(motorcycle.year) < 1900 || Number(motorcycle.year) > 2100) {
        errors[key('year')] = 'أدخل سنة صحيحة بين 1900 و2100.';
      }
      if (!motorcycle.fuelType) errors[key('fuelType')] = 'نوع الوقود مطلوب.';
      if (!motorcycle.condition) errors[key('condition')] = 'حالة الموتوسيكل مطلوبة.';
      if (motorcycle.price === '' || Number(motorcycle.price) <= 0) errors[key('price')] = 'سعر البيع يجب أن يكون أكبر من صفر.';
      if (motorcycle.costPrice === '' || Number(motorcycle.costPrice) < 0) errors[key('costPrice')] = 'سعر التكلفة مطلوب.';
      if (!motorcycle.brandId) errors[key('brandId')] = 'اختر الماركة.';
      if (!motorcycle.categoryId) errors[key('categoryId')] = 'اختر الفئة.';
      if (!motorcycle.branchId) errors[key('branchId')] = 'اختر الفرع.';
      if (motorcycle.motorPresent === null) errors[key('motorPresent')] = 'حدد حالة الموتور.';
      if (motorcycle.chassisPresent === null) errors[key('chassisPresent')] = 'حدد حالة الشاسيه.';
      if (motorcycle.tirePresent === null) errors[key('tirePresent')] = 'حدد حالة الكاوتش.';
    });
    if (!form.boxNumber.trim()) errors.boxNumber = 'اسم الصندوق أو رقمه مطلوب.';

    (['vin', 'engineNumber'] as const).forEach(field => {
      const indicesByNumber = new Map<string, number[]>();
      selected.forEach((motorcycle, index) => {
        const serial = motorcycle[field].trim().toUpperCase();
        if (serial) indicesByNumber.set(serial, [...(indicesByNumber.get(serial) ?? []), index]);
      });
      indicesByNumber.forEach(indices => {
        if (indices.length > 1) {
          indices.forEach(index => {
            errors[`motorcycles.${index}.${field}`] = field === 'vin'
              ? 'رقم الشاسيه مكرر بين الموتوسيكلين.'
              : 'رقم الموتور مكرر بين الموتوسيكلين.';
          });
        }
      });
    });
    return errors;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const errors = validateForm();
    setValidationErrors(errors);
    if (Object.keys(errors).length) {
      setError('يرجى مراجعة الحقول المحددة قبل الحفظ.');
      return;
    }

    const motorcycles: MotorcycleBoxUnitInput[] = [];
    for (const motorcycle of form.motorcycles.slice(0, form.motorcycleCount)) {
      if (
        !motorcycle.fuelType ||
        !motorcycle.condition ||
        motorcycle.year === '' ||
        motorcycle.price === '' ||
        motorcycle.costPrice === '' ||
        motorcycle.motorPresent === null ||
        motorcycle.chassisPresent === null ||
        motorcycle.tirePresent === null
      ) {
        setError('يرجى مراجعة بيانات الموتوسيكلات المطلوبة.');
        return;
      }
      motorcycles.push({
        engineNumber: motorcycle.engineNumber.trim(),
        vin: motorcycle.vin.trim().toUpperCase(),
        fuelType: motorcycle.fuelType,
        model: motorcycle.model.trim(),
        year: Number(motorcycle.year),
        color: motorcycle.color.trim(),
        engineSize: motorcycle.engineSize.trim(),
        price: Number(motorcycle.price),
        costPrice: Number(motorcycle.costPrice),
        condition: motorcycle.condition,
        brandId: motorcycle.brandId,
        categoryId: motorcycle.categoryId,
        branchId: motorcycle.branchId,
        motorPresent: motorcycle.motorPresent,
        chassisPresent: motorcycle.chassisPresent,
        tirePresent: motorcycle.tirePresent,
      });
    }
    create.mutate({
      boxNumber: form.boxNumber.trim(),
      motorPresent: motorcycles.every(motorcycle => motorcycle.motorPresent),
      chassisPresent: motorcycles.every(motorcycle => motorcycle.chassisPresent),
      tirePresent: motorcycles.every(motorcycle => motorcycle.tirePresent),
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
        <p>إضافة الصناديق ومراجعة بيانات ومكونات الموتوسيكلات المحفوظة.</p>
      </div>
      <button className="secondary-action" type="button" onClick={() => list.refetch()} disabled={list.isFetching}>
        <RefreshCw size={16} /> تحديث
      </button>
    </div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {success && <div className="inline-success" role="status">{success}</div>}

    {(canCreate || (editingBox && canEdit)) && <form
      className="surface-panel motorcycle-box-form"
      onSubmit={submit}
    >
      <h2><Package size={19} /> {editingBox ? 'تعديل الصندوق' : 'إضافة صندوق'}</h2>
      {(brandList.isError || categoryList.isError || branchList.isError) && <div className="inline-error" role="alert">
        تعذر تحميل بيانات المخزون المطلوبة. أعد تحميل الصفحة للمحاولة مرة أخرى.
      </div>}
      <label className="box-number-label">
        اسم الصندوق أو رقمه
        <input
          value={form.boxNumber}
          onChange={event => {
            setForm(current => ({ ...current, boxNumber: event.target.value }));
            setValidationErrors(current => { const next = { ...current }; delete next.boxNumber; return next; });
            setError('');
            setSuccess('');
          }}
          maxLength={100}
          required
        />
        {validationErrors.boxNumber && <span className="box-field-error">{validationErrors.boxNumber}</span>}
      </label>
      <fieldset className="box-count-field">
        <legend>عدد الموتوسيكلات في الصندوق</legend>
        {([1, 2] as const).map(count => <label className="box-status-option" key={count}>
          <input
            type="radio"
            name="box-motorcycle-count"
            value={count}
            checked={form.motorcycleCount === count}
            onChange={() => {
              setForm(current => ({ ...current, motorcycleCount: count }));
              if (count === 1) {
                setValidationErrors(current => Object.fromEntries(
                  Object.entries(current).filter(([key]) => !key.startsWith('motorcycles.1.')),
                ));
              }
              setError('');
              setSuccess('');
            }}
          />
          {count === 1 ? 'موتوسيكل واحد' : 'موتوسيكلين'}
        </label>)}
      </fieldset>
      {editingBox && (editingBox.motorcycleUnits?.length ?? 0) > form.motorcycleCount && <p className="box-count-warning">
        سيتم فصل الموتوسيكل الزائد عن الصندوق مع بقائه محفوظًا في المخزون.
      </p>}

      <div className="box-motorcycle-sections">
        {form.motorcycles.slice(0, form.motorcycleCount).map((motorcycle, index) => {
          const fieldError = (field: string) => validationErrors[`motorcycles.${index}.${field}`];
          const errorMessage = (field: string) => fieldError(field) && <span className="box-field-error" role="alert">{fieldError(field)}</span>;
          const update = (patch: Partial<MotorcycleDraft>) => updateMotorcycle(index, patch);
          const displayBrandName = (brand: { nameAr: string; nameEn: string }) => brand.nameAr || brand.nameEn;
          const displayCategoryName = (category: { nameAr: string; nameEn: string }) => category.nameAr || category.nameEn;
          const displayBranchName = (branch: { nameAr: string; nameEn: string }) => branch.nameAr || branch.nameEn;
          return <section className="box-motorcycle-section" key={index}>
            <h3>{index === 0 ? 'الموتوسيكل الأول' : 'الموتوسيكل الثاني'}</h3>
            <div className="box-inventory-grid">
              <label className="box-inventory-field">
                <span>رقم الموتور *</span>
                <input value={motorcycle.engineNumber} onChange={event => update({ engineNumber: event.target.value })} maxLength={100} required />
                {errorMessage('engineNumber')}
              </label>
              <label className="box-inventory-field">
                <span>رقم الشاسيه *</span>
                <input value={motorcycle.vin} onChange={event => update({ vin: event.target.value.toUpperCase() })} maxLength={50} pattern="[A-Z0-9-]+" title="استخدم أحرفًا إنجليزية كبيرة أو أرقامًا أو شرطات فقط." required />
                {errorMessage('vin')}
              </label>
              <label className="box-inventory-field">
                <span>الموديل *</span>
                <input value={motorcycle.model} onChange={event => update({ model: event.target.value })} maxLength={200} required />
                {errorMessage('model')}
              </label>
              <label className="box-inventory-field">
                <span>سنة الصنع *</span>
                <input type="number" min={1900} max={2100} step={1} value={motorcycle.year} onChange={event => update({ year: event.target.value ? Number(event.target.value) : '' })} required />
                {errorMessage('year')}
              </label>
              <label className="box-inventory-field">
                <span>نوع الوقود *</span>
                <select value={motorcycle.fuelType} onChange={event => update({ fuelType: event.target.value as FuelType })} required>
                  <option value="">اختر نوع الوقود</option>
                  <option value="PETROL">بنزين</option>
                  <option value="ELECTRIC">كهرباء</option>
                </select>
                {errorMessage('fuelType')}
              </label>
              <label className="box-inventory-field">
                <span>حالة الموتوسيكل *</span>
                <select value={motorcycle.condition} onChange={event => update({ condition: event.target.value as MotorcycleCondition })} required>
                  <option value="">اختر الحالة</option>
                  <option value="NEW">جديد</option>
                  <option value="USED">مستعمل</option>
                  <option value="IMPORTED">مستورد</option>
                </select>
                {errorMessage('condition')}
              </label>
              <label className="box-inventory-field">
                <span>الماركة *</span>
                <select value={motorcycle.brandId} onChange={event => update({ brandId: event.target.value })} required>
                  <option value="">اختر الماركة</option>
                  {(brandList.data ?? []).map(brand => <option key={brand.id} value={brand.id}>{displayBrandName(brand)}</option>)}
                </select>
                {errorMessage('brandId')}
              </label>
              <label className="box-inventory-field">
                <span>الفئة *</span>
                <select value={motorcycle.categoryId} onChange={event => update({ categoryId: event.target.value })} required>
                  <option value="">اختر الفئة</option>
                  {(categoryList.data ?? []).map(category => <option key={category.id} value={category.id}>{displayCategoryName(category)}</option>)}
                </select>
                {errorMessage('categoryId')}
              </label>
              <label className="box-inventory-field">
                <span>الفرع *</span>
                <select
                  value={motorcycle.branchId}
                  onChange={event => update({ branchId: event.target.value })}
                  disabled={Boolean(editingBox?.motorcycleUnits?.[index])}
                  required
                >
                  <option value="">اختر الفرع</option>
                  {(branchList.data?.items ?? []).map(branch => <option key={branch.id} value={branch.id}>{displayBranchName(branch)}</option>)}
                </select>
                {errorMessage('branchId')}
              </label>
              <label className="box-inventory-field">
                <span>سعر البيع *</span>
                <input type="number" min={0.01} step="0.01" value={motorcycle.price} onChange={event => update({ price: event.target.value ? Number(event.target.value) : '' })} required />
                {errorMessage('price')}
              </label>
              <label className="box-inventory-field">
                <span>سعر التكلفة *</span>
                <input type="number" min={0} step="0.01" value={motorcycle.costPrice} onChange={event => update({ costPrice: event.target.value ? Number(event.target.value) : '' })} required />
                {errorMessage('costPrice')}
              </label>
              <label className="box-inventory-field">
                <span>اللون</span>
                <input value={motorcycle.color} onChange={event => update({ color: event.target.value })} maxLength={50} />
              </label>
              <label className="box-inventory-field">
                <span>سعة المحرك</span>
                <input value={motorcycle.engineSize} onChange={event => update({ engineSize: event.target.value })} maxLength={20} />
              </label>
            </div>
            <div className="box-status-grid">
              <ComponentStatus label="الماتور" name={`motorcycle-${index}-motor`} value={motorcycle.motorPresent} onChange={value => update({ motorPresent: value })} />
              <ComponentStatus label="الشاسيه" name={`motorcycle-${index}-chassis`} value={motorcycle.chassisPresent} onChange={value => update({ chassisPresent: value })} />
              <ComponentStatus label="الكاوتش" name={`motorcycle-${index}-tire`} value={motorcycle.tirePresent} onChange={value => update({ tirePresent: value })} />
            </div>
            {errorMessage('motorPresent') || errorMessage('chassisPresent') || errorMessage('tirePresent')}
          </section>;
        })}
      </div>
      <div className="modal-actions">
        <button type="button" className="secondary-action" onClick={cancelEdit}>
          إلغاء
        </button>
        <button className="primary-action" disabled={create.isPending}>
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
            <th>رقم/اسم الصندوق</th><th>الموتوسيكلات</th><th>العدد</th><th>الماتور</th><th>الشاسيه</th><th>الكاوتش</th><th>تاريخ الإضافة</th>
            {(canEdit || canDelete) && <th>الإجراءات</th>}
          </tr></thead>
          <tbody>{list.data.map(box => <tr key={box.id}>
            <td>{box.boxNumber}</td>
            <td className="box-list-motorcycles">
              {box.motorcycleUnits?.length
                ? box.motorcycleUnits.map((unit, index) => <span key={unit.id}>
                  {index === 0 ? 'الأول' : 'الثاني'}: {unit.motorcycle.engineNumber ?? '—'} / {unit.motorcycle.vin}
                </span>)
                : <span>بيانات الموتوسيكل غير مسجلة</span>}
            </td>
            <td>{box.motorcycleCount ?? 1}</td>
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
