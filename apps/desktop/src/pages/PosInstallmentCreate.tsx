import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileImage, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { pos, posInstallments, type DirectPosInstallmentInput, type MotorcycleSearchResult } from '../api';
import { useViewingBranch } from '../contexts/ViewingBranchContext';

type Lang = 'en' | 'ar';
type DocumentType = DirectPosInstallmentInput['documentType'];
type FileField = keyof DirectPosInstallmentInput['files'];
type BuyerForm = Omit<DirectPosInstallmentInput, 'files' | 'downPayment' | 'annualInterestRate' | 'durationMonths'> & {
  downPayment: string;
  annualInterestRate: string;
  durationMonths: string;
};

const initialForm: BuyerForm = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  address: '',
  occupation: '',
  occupationAddress: '',
  documentType: 'EMPLOYEE',
  firstGuarantorName: '',
  firstGuarantorPhone: '',
  firstGuarantorAddress: '',
  firstGuarantorOccupation: '',
  firstGuarantorOccupationAddress: '',
  secondGuarantorName: '',
  secondGuarantorPhone: '',
  secondGuarantorAddress: '',
  secondGuarantorOccupation: '',
  secondGuarantorOccupationAddress: '',
  motorcycleId: '',
  downPayment: '',
  annualInterestRate: '',
  durationMonths: '12',
};

function Section({ number, title, description, children }: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="inquiry-form-section">
      <div className="inquiry-section-heading">
        <span className="inquiry-section-number">{number}</span>
        <div><h3>{title}</h3><p>{description}</p></div>
      </div>
      {children}
    </section>
  );
}

export default function PosInstallmentCreate({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewingBranchId } = useViewingBranch();
  const [form, setForm] = useState<BuyerForm>(initialForm);
  const [files, setFiles] = useState<Partial<Record<FileField, File>>>({});
  const [motorcycleSearch, setMotorcycleSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const motorcyclesQuery = useQuery({
    queryKey: ['direct-installment-motorcycles', viewingBranchId, motorcycleSearch],
    queryFn: () => pos.searchMotorcycles(motorcycleSearch.trim() || undefined, viewingBranchId ?? undefined, 50),
    enabled: motorcycleSearch.trim().length === 0 || motorcycleSearch.trim().length >= 2,
  });
  const motorcycles: MotorcycleSearchResult[] = motorcyclesQuery.data ?? [];
  const selectedMotorcycle = motorcycles.find(item => item.id === form.motorcycleId);
  const motorcyclePrice = selectedMotorcycle?.price ?? null;
  const deposit = Number(form.downPayment);
  const annualRate = Number(form.annualInterestRate);
  const months = Number(form.durationMonths);
  const validCalculation = motorcyclePrice != null
    && form.downPayment !== ''
    && form.annualInterestRate !== ''
    && Number.isFinite(deposit) && deposit >= 0 && deposit <= motorcyclePrice
    && Number.isFinite(annualRate) && annualRate >= 0 && annualRate <= 999.99
    && Number.isInteger(months) && months >= 1 && months <= 120;
  const financedAmount = validCalculation
    ? Math.round((motorcyclePrice! - deposit + Number.EPSILON) * 100) / 100
    : null;
  const totalInterest = financedAmount == null
    ? null
    : Math.round((financedAmount * annualRate * months / 1200 + Number.EPSILON) * 100) / 100;
  const totalDue = financedAmount == null || totalInterest == null
    ? null
    : Math.round((financedAmount + totalInterest + Number.EPSILON) * 100) / 100;
  const monthlyInstallment = totalDue == null
    ? null
    : Math.round((totalDue / months + Number.EPSILON) * 100) / 100;

  const money = (amount: number) =>
    `${amount.toLocaleString(isRtl ? 'ar-EG' : 'en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${isRtl ? 'ج.م' : 'EGP'}`;
  const label = (english: string, arabic: string) => isRtl ? arabic : english;
  const update = <K extends keyof BuyerForm>(key: K, value: BuyerForm[K]) =>
    setForm(previous => ({ ...previous, [key]: value }));

  const createPlan = useMutation({
    mutationFn: () => {
      if (!selectedMotorcycle) throw new Error(label('Select an available motorcycle from the current inventory results.', 'اختر دراجة متاحة من نتائج المخزون الحالية.'));
      if (form.documentType === 'NEITHER') {
        const required: FileField[] = [
          'idCardFrontImage', 'idCardBackImage',
          'guarantorIdFrontImage', 'guarantorIdBackImage',
          'guarantor2IdFrontImage', 'guarantor2IdBackImage',
        ];
        if (required.some(field => !files[field])) {
          throw new Error(label('Buyer and both guarantors must have ID front and back images.', 'يجب إرفاق وجهي بطاقة المشتري والضامنين.'));
        }
      } else if (!files.documentImage || !files.idCardFrontImage || !files.idCardBackImage) {
        throw new Error(label('Attach the supporting document and buyer ID front/back images.', 'أرفق المستند الداعم ووجهي بطاقة المشتري.'));
      }
      if ((form.documentType === 'EMPLOYEE' || form.documentType === 'PENSION') &&
        (!form.address?.trim() || !form.occupation?.trim())) {
        throw new Error(label('Address and occupation are required for this document route.', 'العنوان والمهنة مطلوبان لنوع المستند المحدد.'));
      }
      if (!validCalculation) {
        throw new Error(label('Check the down payment, rate, and duration values.', 'تحقق من قيمة المقدم والفائدة ومدة التقسيط.'));
      }
      return posInstallments.createDirect({
        ...form,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail?.trim() || undefined,
        address: form.address?.trim() || undefined,
        occupation: form.occupation?.trim() || undefined,
        occupationAddress: form.occupationAddress?.trim() || undefined,
        firstGuarantorName: form.firstGuarantorName?.trim() || undefined,
        firstGuarantorPhone: form.firstGuarantorPhone?.trim() || undefined,
        firstGuarantorAddress: form.firstGuarantorAddress?.trim() || undefined,
        firstGuarantorOccupation: form.firstGuarantorOccupation?.trim() || undefined,
        firstGuarantorOccupationAddress: form.firstGuarantorOccupationAddress?.trim() || undefined,
        secondGuarantorName: form.secondGuarantorName?.trim() || undefined,
        secondGuarantorPhone: form.secondGuarantorPhone?.trim() || undefined,
        secondGuarantorAddress: form.secondGuarantorAddress?.trim() || undefined,
        secondGuarantorOccupation: form.secondGuarantorOccupation?.trim() || undefined,
        secondGuarantorOccupationAddress: form.secondGuarantorOccupationAddress?.trim() || undefined,
        downPayment: deposit,
        annualInterestRate: annualRate,
        durationMonths: months,
        files,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-installments'] });
      void queryClient.invalidateQueries({ queryKey: ['direct-installment-motorcycles'] });
      void queryClient.invalidateQueries({ queryKey: ['desktop-inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['desktop-transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-dashboard'] });
      navigate('/pos-installments', {
        state: {
          directNotice: isRtl
            ? 'تم إنشاء خطة التقسيط وتسجيل البيع وتحديث حالة الدراجة.'
            : 'Installment plan created, sale recorded, and motorcycle inventory updated.',
        },
      });
    },
    onError: (saveError: Error) => setError(saveError.message),
  });

  const docTypeLabels: Record<DocumentType, string> = {
    EMPLOYEE: label('Employee', 'موظف'),
    PENSION: label('Pension statement', 'بيان معاش'),
    COMMERCIAL_REGISTRY: label('Commercial registry', 'سجل تجاري'),
    NEITHER: label('Other / guarantors', 'غير ذلك / ضامنين'),
  };

  function uploadField(field: FileField, english: string, arabic: string, accept = 'image/jpeg,image/png,image/webp') {
    const required = field === 'idCardFrontImage' || field === 'idCardBackImage' ||
      (form.documentType === 'NEITHER' && [
        'guarantorIdFrontImage',
        'guarantorIdBackImage',
        'guarantor2IdFrontImage',
        'guarantor2IdBackImage',
      ].includes(field)) ||
      (field === 'documentImage' && form.documentType !== 'NEITHER');
    return (
      <label key={field}>
        <FileImage size={16} /> {label(english, arabic)}{required ? ' *' : ''}
        <input
          type="file"
          accept={accept}
          required={required}
          onChange={event => {
            const file = event.target.files?.[0];
            if (file && file.size > 5 * 1024 * 1024) {
              setError(label('Each file must be 5 MB or smaller.', 'يجب ألا يتجاوز حجم كل ملف 5 ميجابايت.'));
              event.target.value = '';
              return;
            }
            setFiles(previous => ({ ...previous, [field]: file }));
            setError(null);
          }}
        />
        {files[field] && <small>{files[field]?.name}</small>}
      </label>
    );
  }

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{label('Direct POS installment sale', 'بيع مباشر بالتقسيط')}</span>
          <h1>{label('Create Installment Plan', 'إنشاء خطة تقسيط')}</h1>
          <p>{label('Enter buyer, guarantor, inventory, and direct-financing details.', 'أدخل بيانات المشتري والضامنين والدراجة والتمويل المباشر.')}</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => navigate('/pos-installments')}>
          <ArrowLeft size={16} /> {label('Back to installment plans', 'العودة إلى خطط التقسيط')}
        </button>
      </div>

      <form className="surface-panel" style={{ maxWidth: 1100, padding: '1.4rem' }} onSubmit={event => {
        event.preventDefault();
        setError(null);
        createPlan.mutate();
      }}>
        {error && <div className="inquiry-form-error" role="alert">{error}</div>}

        <Section number="01" title={label('Buyer information', 'بيانات المشتري')} description={label('Contact and employment details.', 'بيانات التواصل والعمل.')}>
          <div className="form-grid inquiry-customer-fields">
            <label>{label('Full name *', 'الاسم الكامل *')}<input required maxLength={200} value={form.customerName} onChange={event => update('customerName', event.target.value)} /></label>
            <label>{label('Phone number *', 'رقم الهاتف *')}<input required maxLength={50} value={form.customerPhone} onChange={event => update('customerPhone', event.target.value)} /></label>
            <label>{label('Email', 'البريد الإلكتروني')}<input type="email" maxLength={255} value={form.customerEmail} onChange={event => update('customerEmail', event.target.value)} /></label>
            <label>{label('Address', 'العنوان')}<input maxLength={2000} value={form.address} onChange={event => update('address', event.target.value)} /></label>
            <label>{label('Occupation', 'المهنة')}<input maxLength={200} value={form.occupation} onChange={event => update('occupation', event.target.value)} /></label>
            <label>{label('Occupation address', 'عنوان العمل')}<input maxLength={2000} value={form.occupationAddress} onChange={event => update('occupationAddress', event.target.value)} /></label>
          </div>
        </Section>

        <Section number="02" title={label('Document route', 'نوع المستند')} description={label('Choose the document route available for this customer.', 'اختر نوع المستند المتوفر للعميل.')}>
          <div className="inquiry-document-options">
            {(['EMPLOYEE', 'PENSION', 'COMMERCIAL_REGISTRY', 'NEITHER'] as const).map(type => (
              <label key={type} className={`inquiry-document-option ${form.documentType === type ? 'is-selected' : ''}`}>
                <input type="radio" name="documentType" checked={form.documentType === type} onChange={() => update('documentType', type)} />
                <span><strong>{docTypeLabels[type]}</strong><small>{form.documentType === type ? label('Selected', 'محدد') : label('Select route', 'اضغط للاختيار')}</small></span>
              </label>
            ))}
          </div>
        </Section>

        <Section number="03" title={label('Guarantors', 'بيانات الضامنين')} description={label('Enter the guarantors recorded for this direct installment request.', 'أدخل بيانات الضامنين لطلب التقسيط المباشر.')}>
          <div className="form-grid inquiry-customer-fields">
            {([
              ['firstGuarantorName', 'First guarantor name', 'اسم الضامن الأول'],
              ['firstGuarantorPhone', 'First guarantor phone', 'هاتف الضامن الأول'],
              ['firstGuarantorAddress', 'First guarantor address', 'عنوان الضامن الأول'],
              ['firstGuarantorOccupation', 'First guarantor occupation', 'مهنة الضامن الأول'],
              ['firstGuarantorOccupationAddress', 'First guarantor occupation address', 'عنوان عمل الضامن الأول'],
              ['secondGuarantorName', 'Second guarantor name', 'اسم الضامن الثاني'],
              ['secondGuarantorPhone', 'Second guarantor phone', 'هاتف الضامن الثاني'],
              ['secondGuarantorAddress', 'Second guarantor address', 'عنوان الضامن الثاني'],
              ['secondGuarantorOccupation', 'Second guarantor occupation', 'مهنة الضامن الثاني'],
              ['secondGuarantorOccupationAddress', 'Second guarantor occupation address', 'عنوان عمل الضامن الثاني'],
            ] as const).map(([field, en, ar]) => (
              <label key={field}>{label(en, ar)}<input maxLength={2000} value={form[field] ?? ''} onChange={event => update(field, event.target.value)} /></label>
            ))}
          </div>
        </Section>

        <Section number="04" title={label('Upload documents', 'رفع المستندات')} description={label('JPG, PNG, WEBP, or PDF for supporting documents; image files for IDs. Maximum 5 MB each.', 'ارفع المستندات بصيغة JPG أو PNG أو WEBP أو PDF، والبطاقات كصور. الحد الأقصى 5 ميجابايت لكل ملف.')}>
          <div className="inquiry-upload-panel">
            <div className="form-grid inquiry-upload-grid">
              {form.documentType !== 'NEITHER' && uploadField('documentImage', 'Supporting document', 'المستند الداعم', 'image/jpeg,image/png,image/webp,application/pdf')}
              {uploadField('idCardFrontImage', 'Buyer ID - front', 'بطاقة المشتري - وجه')}
              {uploadField('idCardBackImage', 'Buyer ID - back', 'بطاقة المشتري - ظهر')}
              {form.documentType === 'NEITHER' && <>
                {uploadField('guarantorIdFrontImage', 'First guarantor ID - front', 'بطاقة الضامن الأول - وجه')}
                {uploadField('guarantorIdBackImage', 'First guarantor ID - back', 'بطاقة الضامن الأول - ظهر')}
                {uploadField('guarantor2IdFrontImage', 'Second guarantor ID - front', 'بطاقة الضامن الثاني - وجه')}
                {uploadField('guarantor2IdBackImage', 'Second guarantor ID - back', 'بطاقة الضامن الثاني - ظهر')}
              </>}
              {uploadField('guarantorSignatureImage', 'Guarantor signature (optional)', 'توقيع الضامن (اختياري)')}
              {uploadField('electricityLetter', 'Electricity bill (optional)', 'إيصال كهرباء (اختياري)', 'image/jpeg,image/png,image/webp,application/pdf')}
            </div>
          </div>
        </Section>

        <Section number="05" title={label('Motorcycle selection', 'اختيار الدراجة')} description={label('Search eligible available inventory. Price is taken from the selected inventory record.', 'ابحث في المخزون المتاح. يتم اعتماد السعر من سجل الدراجة المحددة.')}>
          <div className="form-grid inquiry-customer-fields">
            <label>{label('Search by brand, model, or inventory number', 'ابحث بالماركة أو الموديل أو رقم الشاسيه')}
              <input value={motorcycleSearch} onChange={event => {
                setMotorcycleSearch(event.target.value);
                update('motorcycleId', '');
              }} placeholder={label('Brand, model, or VIN', 'الماركة أو الموديل أو رقم الشاسيه')} />
            </label>
            <label>{label('Available motorcycle *', 'الدراجة المتاحة *')}
              <select required value={form.motorcycleId} onChange={event => update('motorcycleId', event.target.value)}>
                <option value="">{label('-- Select a motorcycle --', '-- اختر دراجة --')}</option>
                {motorcycles.map(motorcycle => (
                  <option key={motorcycle.id} value={motorcycle.id}>
                    {(isRtl ? motorcycle.brand.nameAr : motorcycle.brand.nameEn)} {motorcycle.model} · {motorcycle.vin} · {money(motorcycle.price)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {motorcyclesQuery.isLoading && <p>{label('Loading available motorcycles…', 'جاري تحميل الدراجات المتاحة…')}</p>}
          {motorcyclesQuery.isError && <div className="inline-error" role="alert">{motorcyclesQuery.error.message}
            <button className="secondary-action" type="button" onClick={() => void motorcyclesQuery.refetch()}>{label('Retry', 'إعادة المحاولة')}</button>
          </div>}
          {!motorcyclesQuery.isLoading && !motorcyclesQuery.isError && motorcycles.length === 0 &&
            <p role="status">{label('No eligible motorcycles are available for this branch/search.', 'لا توجد دراجات متاحة مطابقة للبحث في هذا الفرع.')}</p>}
          {selectedMotorcycle && <p>{label('Inventory price:', 'سعر المخزون:')} <strong>{money(selectedMotorcycle.price)}</strong></p>}
        </Section>

        <Section number="06" title={label('Direct installment terms', 'تفاصيل التقسيط المباشر')} description={label('Enter the annual rate used by your business. These values are estimates until the sale is submitted.', 'أدخل نسبة الفائدة السنوية المعتمدة. هذه القيم تقديرية حتى تأكيد البيع.')}>
          <div className="form-grid inquiry-customer-fields">
            <label>{label('Down payment *', 'المقدم *')}<input required type="number" min="0" max={motorcyclePrice ?? undefined} step="0.01" value={form.downPayment} onChange={event => update('downPayment', event.target.value)} /></label>
            <label>{label('Annual interest rate (%) *', 'الفائدة السنوية (%) *')}<input required type="number" min="0" max="999.99" step="0.01" value={form.annualInterestRate} onChange={event => update('annualInterestRate', event.target.value)} /></label>
            <label>{label('Duration in months *', 'مدة التقسيط بالأشهر *')}<input required type="number" min="1" max="120" step="1" value={form.durationMonths} onChange={event => update('durationMonths', event.target.value)} /></label>
          </div>
          {financedAmount != null && totalInterest != null && totalDue != null && monthlyInstallment != null && (
            <div className="pos-plan-summary-card" style={{ marginTop: '1rem', padding: '1rem', borderRadius: 12, background: 'var(--surface-2, #f8fafc)' }}>
              <strong>{label('Estimated financing breakdown (annual flat interest)', 'تقدير التمويل (فائدة سنوية ثابتة)')}</strong>
              <p>{label('Motorcycle price:', 'سعر الدراجة:')} {money(motorcyclePrice!)}</p>
              <p>{label('Financed amount:', 'المبلغ الممول:')} {money(financedAmount)}</p>
              <p>{label('Total interest:', 'إجمالي الفائدة:')} {money(totalInterest)}</p>
              <p>{label('Total amount due:', 'إجمالي المبلغ المستحق:')} {money(totalDue)}</p>
              <p>{label('Estimated monthly installment:', 'القسط الشهري التقديري:')} {money(monthlyInstallment)}</p>
            </div>
          )}
        </Section>

        <div className="pos-plan-modal-actions" style={{ margin: '1rem 1.75rem' }}>
          <button className="secondary-action" type="button" onClick={() => navigate('/pos-installments')} disabled={createPlan.isPending}>
            {label('Cancel and go back', 'إلغاء والعودة')}
          </button>
          <button className="primary-action" type="submit" disabled={createPlan.isPending || motorcyclesQuery.isLoading || !selectedMotorcycle}>
            <Plus size={16} />
            {createPlan.isPending ? label('Creating sale and plan…', 'جاري إنشاء البيع والخطة…') : label('Create Sale and Plan', 'إنشاء البيع والخطة')}
          </button>
        </div>
      </form>
    </section>
  );
}
