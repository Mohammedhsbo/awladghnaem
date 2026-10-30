import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CheckCircle2, Edit3, Package, RefreshCw, Search, Trash2, X } from 'lucide-react';
import {
  desktopPermissions,
  motorcycleBoxes,
  type CreateMotorcycleBoxInput,
  type DesktopUser,
  type MotorcycleBox,
  type MotorcycleBoxChecklistInput,
  type UpdateMotorcycleBoxInput,
} from '../api';

type MotorcycleChecklistDraft = {
  motorPresent: boolean | null;
  chassisPresent: boolean | null;
  tirePresent: boolean | null;
  exhaustPresent: boolean | null;
};

type BoxForm = {
  boxNumber: string;
  boxCount: number | '';
  motorcycleCount: number | '';
  boxes: MotorcycleChecklistDraft[][];
};

const emptyChecklist = (): MotorcycleChecklistDraft => ({
  motorPresent: null,
  chassisPresent: null,
  tirePresent: null,
  exhaustPresent: null,
});

const emptyForm = (): BoxForm => ({
  boxNumber: '',
  boxCount: 1,
  motorcycleCount: 1,
  boxes: [[emptyChecklist()]],
});

function ordinal(index: number) {
  const ordinals = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  return index < ordinals.length ? ordinals[index] : `رقم ${index + 1}`;
}

function motorcycleLabel(index: number) {
  return `الموتوسيكل ${ordinal(index)}`;
}

function boxLabel(index: number) {
  return `الصندوق ${ordinal(index)}`;
}

function generatedBoxNumber(base: string, index: number, boxCount: number) {
  return boxCount > 1 && index > 0 ? `${base}-${index + 1}` : base;
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

function getBoxStats(box: MotorcycleBox) {
  const units = box.motorcycleUnits?.length
    ? box.motorcycleUnits
    : [{
        id: box.id,
        motorPresent: box.motorPresent,
        chassisPresent: box.chassisPresent,
        tirePresent: box.tirePresent,
        exhaustPresent: box.exhaustPresent,
      }];
  const totalParts = units.length * 4;
  let presentParts = 0;
  let missingParts = 0;
  let unknownParts = 0;
  units.forEach(unit => {
    [unit.motorPresent, unit.chassisPresent, unit.tirePresent, unit.exhaustPresent].forEach(value => {
      if (value === true) presentParts++;
      else if (value === false) missingParts++;
      else unknownParts++;
    });
  });
  const isComplete = missingParts === 0 && unknownParts === 0;
  return { units, totalParts, presentParts, missingParts, unknownParts, isComplete };
}

function componentChip(label: string, value: boolean | null) {
  const statusClass = value === null ? 'chip-unknown' : value ? 'chip-present' : 'chip-missing';
  return <span className={`boxes-chip ${statusClass}`}>
    {value === null
      ? <AlertCircle size={12} strokeWidth={2.5} />
      : value
        ? <Check size={12} strokeWidth={2.5} />
        : <X size={12} strokeWidth={2.5} />}
    <span className="chip-key">{label}:</span>
    <span className="chip-val">{value === null ? 'غير مسجل' : value ? 'موجود' : 'غير موجود'}</span>
  </span>;
}

export default function MotorcycleBoxes({ user }: { user: DesktopUser }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BoxForm>(emptyForm);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editingBox, setEditingBox] = useState<MotorcycleBox | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
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

  const save = useMutation<MotorcycleBox | MotorcycleBox[], Error, CreateMotorcycleBoxInput | UpdateMotorcycleBoxInput>({
    mutationFn: (data: CreateMotorcycleBoxInput | UpdateMotorcycleBoxInput) => {
      if (editingBox) {
        if (!('motorcycles' in data)) throw new Error('Invalid box update payload.');
        return motorcycleBoxes.update(editingBox.id, data);
      }
      if (!('boxes' in data)) throw new Error('Invalid box creation payload.');
      return motorcycleBoxes.create(data);
    },
    onSuccess: () => {
      setForm(emptyForm());
      setEditingBox(null);
      setValidationErrors({});
      setError('');
      setSuccess(editingBox ? 'تم تعديل الصندوق بنجاح.' : 'تمت إضافة الصناديق بنجاح.');
      void queryClient.invalidateQueries({ queryKey: ['motorcycle-boxes'] });
    },
    onError: (reason: Error) => {
      setSuccess('');
      const code = 'code' in reason ? reason.code : undefined;
      setError(code === 'MOTORCYCLE_BOX_NUMBER_EXISTS'
        ? 'أحد أرقام الصناديق المولدة مستخدم بالفعل. غيّر اسم الصندوق وحاول مرة أخرى.'
        : reason.message || 'تعذر حفظ الصندوق. حاول مرة أخرى.');
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

  const updateMotorcycle = (boxIndex: number, motorcycleIndex: number, patch: Partial<MotorcycleChecklistDraft>) => {
    setForm(current => ({
      ...current,
      boxes: current.boxes.map((box, currentBoxIndex) => currentBoxIndex === boxIndex
        ? box.map((motorcycle, currentMotorcycleIndex) =>
          currentMotorcycleIndex === motorcycleIndex ? { ...motorcycle, ...patch } : motorcycle,
        )
        : box,
      ),
    }));
    setValidationErrors(current => {
      const next = { ...current };
      Object.keys(patch).forEach(field => {
        delete next[`boxes.${boxIndex}.motorcycles.${motorcycleIndex}.${field}`];
      });
      return next;
    });
    setError('');
    setSuccess('');
  };

  const updateMotorcycleCount = (value: string) => {
    const motorcycleCount = value === '' ? '' : Number(value);
    setForm(current => {
      const validCount = typeof motorcycleCount === 'number'
        && Number.isInteger(motorcycleCount)
        && motorcycleCount > 0
        && motorcycleCount <= 2_147_483_647;
      const boxes = current.boxes.map(box => validCount
        ? Array.from({ length: motorcycleCount }, (_, index) => box[index] ?? emptyChecklist())
        : [],
      );
      return { ...current, motorcycleCount, boxes };
    });
    setValidationErrors(current => {
      const next = { ...current };
      delete next.motorcycleCount;
      Object.keys(next).forEach(key => {
        const match = key.match(/^boxes\.(\d+)\.motorcycles\.(\d+)\./);
        const motorcycleIndex = Number(match?.[2]);
        if (Number.isInteger(motorcycleIndex) && motorcycleIndex >= Number(motorcycleCount || 0)) delete next[key];
      });
      return next;
    });
    setError('');
    setSuccess('');
  };

  const updateBoxCount = (value: string) => {
    const boxCount = value === '' ? '' : Number(value);
    setForm(current => {
      const validCount = typeof boxCount === 'number'
        && Number.isInteger(boxCount)
        && boxCount > 0
        && boxCount <= 2_147_483_647;
      const boxes = validCount
        ? Array.from({ length: boxCount }, (_, index) => current.boxes[index]
          ?? (typeof current.motorcycleCount === 'number'
            ? Array.from({ length: current.motorcycleCount }, emptyChecklist)
            : []),
        )
        : [];
      return { ...current, boxCount, boxes };
    });
    setValidationErrors(current => {
      const next = { ...current };
      delete next.boxCount;
      Object.keys(next).forEach(key => {
        const boxIndex = Number(key.match(/^boxes\.(\d+)\./)?.[1]);
        if (Number.isInteger(boxIndex) && boxIndex >= Number(boxCount || 0)) delete next[key];
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
      boxCount: 1,
      motorcycleCount,
      boxes: [Array.from({ length: motorcycleCount }, (_, index) => {
        const unit = box.motorcycleUnits?.[index];
        const hasLegacyStatuses = index === 0 && !box.motorcycleUnits?.length;
        return {
          motorPresent: unit?.motorPresent ?? (hasLegacyStatuses ? box.motorPresent : null),
          chassisPresent: unit?.chassisPresent ?? (hasLegacyStatuses ? box.chassisPresent : null),
          tirePresent: unit?.tirePresent ?? (hasLegacyStatuses ? box.tirePresent : null),
          exhaustPresent: unit?.exhaustPresent ?? (hasLegacyStatuses ? box.exhaustPresent : null),
        };
      })],
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
      typeof form.boxCount !== 'number'
      || !Number.isInteger(form.boxCount)
      || form.boxCount < 1
      || form.boxCount > 2_147_483_647
    ) {
      errors.boxCount = 'أدخل عددًا صحيحًا موجبًا للصناديق.';
    } else if (form.boxes.length !== form.boxCount) {
      errors.boxCount = 'عدد قوائم الصناديق يجب أن يطابق عدد الصناديق.';
    } else if (typeof form.boxCount === 'number' && form.boxes.some((_, index) =>
      generatedBoxNumber(form.boxNumber.trim(), index, Number(form.boxCount)).length > 100,
    )) {
      errors.boxNumber = 'يجب ألا يتجاوز طول أرقام الصناديق المولدة 100 حرف.';
    }
    if (
      typeof form.motorcycleCount !== 'number'
      || !Number.isInteger(form.motorcycleCount)
      || form.motorcycleCount < 1
      || form.motorcycleCount > 2_147_483_647
    ) {
      errors.motorcycleCount = 'أدخل عددًا صحيحًا موجبًا للموتوسيكلات.';
    } else if (form.boxes.some(box => box.length !== form.motorcycleCount)) {
      errors.motorcycleCount = 'عدد قوائم المكونات يجب أن يطابق عدد الموتوسيكلات في كل صندوق.';
    }

    form.boxes.forEach((box, boxIndex) => {
      box.forEach((motorcycle, motorcycleIndex) => {
        const key = (field: string) => `boxes.${boxIndex}.motorcycles.${motorcycleIndex}.${field}`;
        if (motorcycle.motorPresent === null) errors[key('motorPresent')] = 'حدد حالة الموتور.';
        if (motorcycle.chassisPresent === null) errors[key('chassisPresent')] = 'حدد حالة الشاسيه.';
        if (motorcycle.tirePresent === null) errors[key('tirePresent')] = 'حدد حالة الكاوتش.';
        if (motorcycle.exhaustPresent === null) errors[key('exhaustPresent')] = 'حدد حالة الشكمان.';
      });
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
    if (typeof form.boxCount !== 'number' || typeof form.motorcycleCount !== 'number') return;

    const checklistGroups: Array<{ motorcycles: MotorcycleBoxChecklistInput[] }> = [];
    for (const box of form.boxes) {
      const motorcycles: MotorcycleBoxChecklistInput[] = [];
      for (const motorcycle of box) {
        if (
          motorcycle.motorPresent === null
          || motorcycle.chassisPresent === null
          || motorcycle.tirePresent === null
          || motorcycle.exhaustPresent === null
        ) {
          setError('يرجى تحديد حالة المكونات لكل موتوسيكل في كل صندوق.');
          return;
        }
        motorcycles.push({
          motorPresent: motorcycle.motorPresent,
          chassisPresent: motorcycle.chassisPresent,
          tirePresent: motorcycle.tirePresent,
          exhaustPresent: motorcycle.exhaustPresent,
        });
      }
      checklistGroups.push({ motorcycles });
    }

    if (editingBox) {
      const input: UpdateMotorcycleBoxInput = {
        boxNumber: form.boxNumber.trim(),
        motorcycleCount: form.motorcycleCount,
        motorcycles: checklistGroups[0].motorcycles,
      };
      save.mutate(input);
      return;
    }
    const input: CreateMotorcycleBoxInput = {
      boxNumber: form.boxNumber.trim(),
      boxCount: form.boxCount,
      motorcycleCount: form.motorcycleCount,
      boxes: checklistGroups,
    };
    save.mutate(input);
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
          عدد الصناديق
          <input
            type="number"
            min={1}
            max={2_147_483_647}
            step={1}
            value={form.boxCount}
            onChange={event => updateBoxCount(event.target.value)}
            disabled={Boolean(editingBox)}
            required
          />
          {validationErrors.boxCount && <span className="box-field-error">{validationErrors.boxCount}</span>}
        </label>
        <label className="box-count-label">
          عدد الموتوسيكلات في الصندوق
          <input
            type="number"
            min={1}
            max={2_147_483_647}
            step={1}
            value={form.motorcycleCount}
            onChange={event => updateMotorcycleCount(event.target.value)}
            required
          />
          {validationErrors.motorcycleCount && <span className="box-field-error">{validationErrors.motorcycleCount}</span>}
        </label>
      </div>
      {editingBox && (editingBox.motorcycleUnits?.length ?? 0) > Number(form.motorcycleCount || 0) && <p className="box-count-warning">
        ستبقى الموتوسيكلات المرتبطة الزائدة محفوظة في المخزون بعد إزالتها من الصندوق.
      </p>}

      <h3 className="box-form-section-title">قائمة مكونات الموتوسيكلات</h3>
      <div className="box-list-preview">
        {form.boxes.map((motorcycles, boxIndex) => {
          const boxNumber = generatedBoxNumber(form.boxNumber.trim(), boxIndex, Number(form.boxCount || 0));
          return <section className="box-preview-section" key={boxIndex}>
            <header className="box-preview-header">
              <h4>{boxLabel(boxIndex)}</h4>
              <span>{boxNumber || 'أدخل اسم الصندوق أو رقمه'}</span>
            </header>
            <div className="box-motorcycle-sections">
              {motorcycles.map((motorcycle, motorcycleIndex) => {
                const fieldError = (field: string) =>
                  validationErrors[`boxes.${boxIndex}.motorcycles.${motorcycleIndex}.${field}`];
                const update = (patch: Partial<MotorcycleChecklistDraft>) =>
                  updateMotorcycle(boxIndex, motorcycleIndex, patch);
                return <section className="box-motorcycle-section" key={motorcycleIndex}>
                  <h5>{motorcycleLabel(motorcycleIndex)}</h5>
                  <div className="box-status-grid">
                    <div>
                      <ComponentStatus
                        label="الموتور"
                        name={`box-${boxIndex}-motorcycle-${motorcycleIndex}-motor`}
                        value={motorcycle.motorPresent}
                        onChange={value => update({ motorPresent: value })}
                      />
                      {fieldError('motorPresent') && <span className="box-field-error" role="alert">{fieldError('motorPresent')}</span>}
                    </div>
                    <div>
                      <ComponentStatus
                        label="الشاسيه"
                        name={`box-${boxIndex}-motorcycle-${motorcycleIndex}-chassis`}
                        value={motorcycle.chassisPresent}
                        onChange={value => update({ chassisPresent: value })}
                      />
                      {fieldError('chassisPresent') && <span className="box-field-error" role="alert">{fieldError('chassisPresent')}</span>}
                    </div>
                    <div>
                      <ComponentStatus
                        label="الكاوتش"
                        name={`box-${boxIndex}-motorcycle-${motorcycleIndex}-tire`}
                        value={motorcycle.tirePresent}
                        onChange={value => update({ tirePresent: value })}
                      />
                      {fieldError('tirePresent') && <span className="box-field-error" role="alert">{fieldError('tirePresent')}</span>}
                    </div>
                    <div>
                      <ComponentStatus
                        label="الشكمان"
                        name={`box-${boxIndex}-motorcycle-${motorcycleIndex}-exhaust`}
                        value={motorcycle.exhaustPresent}
                        onChange={value => update({ exhaustPresent: value })}
                      />
                      {fieldError('exhaustPresent') && <span className="box-field-error" role="alert">{fieldError('exhaustPresent')}</span>}
                    </div>
                  </div>
                </section>;
              })}
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

    {(() => {
      const filteredBoxes = (list.data ?? []).filter(box => {
        const matchesSearch = !searchQuery.trim() || box.boxNumber.toLowerCase().includes(searchQuery.trim().toLowerCase());
        if (!matchesSearch) return false;
        const { isComplete } = getBoxStats(box);
        if (statusFilter === 'complete') return isComplete;
        if (statusFilter === 'incomplete') return !isComplete;
        return true;
      });

      const totalBoxes = list.data?.length ?? 0;
      const completeBoxes = (list.data ?? []).filter(b => getBoxStats(b).isComplete).length;
      const incompleteBoxes = totalBoxes - completeBoxes;

      return (
        <div className="surface-panel boxes-list-panel">
          <div className="boxes-panel-header">
            <div className="boxes-panel-title-group">
              <div className="boxes-panel-icon-wrap">
                <Package size={22} className="boxes-panel-icon" />
              </div>
              <div>
                <h2>الصناديق المحفوظة</h2>
                <span className="boxes-panel-subtitle">إجمالي {totalBoxes} صندوق في المخزون</span>
              </div>
            </div>

            <div className="boxes-header-controls">
              <div className="boxes-search-box">
                <Search size={15} className="boxes-search-icon" />
                <input
                  type="text"
                  placeholder="بحث برقم الصندوق..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="boxes-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="boxes-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="مسح البحث"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="boxes-filter-pills">
                <button
                  type="button"
                  className={`boxes-filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  الكل ({totalBoxes})
                </button>
                <button
                  type="button"
                  className={`boxes-filter-pill ${statusFilter === 'complete' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('complete')}
                >
                  مكتمل ({completeBoxes})
                </button>
                <button
                  type="button"
                  className={`boxes-filter-pill ${statusFilter === 'incomplete' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('incomplete')}
                >
                  به نواقص ({incompleteBoxes})
                </button>
              </div>
            </div>
          </div>

          {list.isLoading && <div className="state-panel">جاري تحميل الصناديق...</div>}
          {list.isError && <div className="state-panel" role="alert">
            <p>تعذر تحميل الصناديق.</p>
            <button className="secondary-action" onClick={() => list.refetch()}>إعادة المحاولة</button>
          </div>}
          {!list.isLoading && !list.isError && totalBoxes === 0 && (
            <div className="empty-state">لا توجد صناديق محفوظة حتى الآن.</div>
          )}
          {!list.isLoading && !list.isError && totalBoxes > 0 && filteredBoxes.length === 0 && (
            <div className="empty-state">لا توجد نتائج مطابقة للبحث أو الفلتر المحدد.</div>
          )}

          {!list.isLoading && !list.isError && filteredBoxes.length > 0 && (
            <div className="boxes-table-wrap">
              <table className="boxes-premium-table">
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}><span className="boxes-th-inner">رقم / اسم الصندوق</span></th>
                    <th style={{ width: '9%' }}><span className="boxes-th-inner">العدد</span></th>
                    <th style={{ width: '13%' }}><span className="boxes-th-inner">حالة الاكتمال</span></th>
                    <th><span className="boxes-th-inner">فحص مكونات الموتوسيكلات (الموتور • الشاسيه • الكاوتش • الشكمان)</span></th>
                    <th style={{ width: '11%' }}><span className="boxes-th-inner">تاريخ الإضافة</span></th>
                    {(canEdit || canDelete) && <th style={{ width: '13%' }}><span className="boxes-th-inner">الإجراءات</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredBoxes.map((box, rowIndex) => {
                    const stats = getBoxStats(box);
                    return (
                      <tr key={box.id} className={rowIndex % 2 === 1 ? 'boxes-row-alt' : ''}>
                        <td>
                          <div className="boxes-box-number-cell">
                            <span className="boxes-box-number-icon"><Package size={16} /></span>
                            <strong className="boxes-number-text">{box.boxNumber}</strong>
                          </div>
                        </td>

                        <td>
                          <div className="boxes-count-cell">
                            <span className="boxes-count-val">{box.motorcycleCount ?? stats.units.length}</span>
                            <span className="boxes-count-label">موتوسيكل</span>
                          </div>
                        </td>

                        <td>
                          {stats.isComplete ? (
                            <span className="boxes-status-tag tag-complete">
                              <CheckCircle2 size={13} strokeWidth={2.5} />
                              <span>مكتمل ({stats.totalParts}/{stats.totalParts})</span>
                            </span>
                          ) : (
                            <span className="boxes-status-tag tag-missing">
                              <AlertCircle size={13} strokeWidth={2.5} />
                              <span>
                                {stats.missingParts > 0 && `نواقص (${stats.missingParts})`}
                                {stats.missingParts > 0 && stats.unknownParts > 0 && ' • '}
                                {stats.unknownParts > 0 && `غير مسجل (${stats.unknownParts})`}
                              </span>
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="boxes-unit-list">
                            {stats.units.map((unit, index) => (
                              <div className="boxes-unit-item" key={unit.id || index}>
                                <span className="boxes-unit-badge">{motorcycleLabel(index)}</span>
                                <div className="boxes-unit-chips">
                                  {componentChip('الموتور', unit.motorPresent)}
                                  {componentChip('الشاسيه', unit.chassisPresent)}
                                  {componentChip('الكاوتش', unit.tirePresent)}
                                  {componentChip('الشكمان', unit.exhaustPresent)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td>
                          <span className="boxes-date-cell">
                            {new Date(box.createdAt).toLocaleDateString('ar-EG')}
                          </span>
                        </td>

                        {(canEdit || canDelete) && (
                          <td>
                            <div className="boxes-actions-cell">
                              {canEdit && (
                                <button
                                  type="button"
                                  className="boxes-action-btn boxes-action-edit"
                                  title="تعديل"
                                  aria-label={`تعديل ${box.boxNumber}`}
                                  onClick={() => openEdit(box)}
                                >
                                  <Edit3 size={14} />
                                  <span>تعديل</span>
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  className="boxes-action-btn boxes-action-delete"
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
                                  <Trash2 size={14} />
                                  <span>حذف</span>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    })()}
  </section>;
}
