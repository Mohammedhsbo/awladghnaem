import { useState } from 'react';
import { ArrowLeft, Download, FileImage } from 'lucide-react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { getApiErrorMessage, inquiries, type InquiryDocumentType } from '../api';

type Lang = 'en' | 'ar';

function InquiryField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || String(value).trim() === '') return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 0.7fr) minmax(0, 1.3fr)', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid #eef2f7' }}>
      <strong style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{label}</strong>
      <span style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

function InquirySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.65rem', color: 'var(--blue-dark)', fontSize: '1.05rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function documentIsImage(url: string) {
  return /\.(jpe?g|png|webp)(?:[?#]|$)/i.test(url);
}

function isSafeDocumentUrl(url: string) {
  try {
    return ['http:', 'https:'].includes(new URL(url, window.location.origin).protocol);
  } catch {
    return false;
  }
}

export default function InquiryDetail({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [documentError, setDocumentError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['inquiry', id],
    queryFn: () => inquiries.get(id!),
    enabled: Boolean(id),
  });
  const inquiry = query.data;
  const t = (en: string, ar: string) => isRtl ? ar : en;
  const locale = isRtl ? 'ar-EG' : 'en-EG';
  const money = (amount: number | null | undefined) => amount == null ? undefined : `${amount.toLocaleString(locale)} EGP`;

  async function downloadElectricityLetter() {
    if (!id) return;
    setDocumentError(null);
    try {
      const file = await inquiries.downloadElectricityLetter(id);
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `electricity-letter${file.type === 'application/pdf' ? '.pdf' : ''}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setDocumentError(getApiErrorMessage(error, t('Could not download the electricity letter.', 'تعذر تنزيل خطاب الكهرباء.')));
    }
  }

  if (query.isLoading) {
    return (
      <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="premium-glass-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200, gap: '0.75rem' }}>
          <div className="spinner" /><span>{t('Loading inquiry...', 'جاري تحميل الاستعلام...')}</span>
        </div>
      </section>
    );
  }

  if (query.isError || !inquiry) {
    return (
      <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
        <button className="premium-action-btn outline" style={{ marginBottom: '1rem' }} onClick={() => navigate('/inquiries')}>
          <ArrowLeft size={16} /> {t('Back to inquiries', 'العودة إلى الاستعلامات')}
        </button>
        <div className="state-panel" role="alert">{query.error ? getApiErrorMessage(query.error, t('Could not load inquiry.', 'تعذر تحميل الاستعلام.')) : t('Inquiry not found.', 'الاستعلام غير موجود.')}</div>
      </section>
    );
  }

  const motorcycleName = inquiry.requestedMotorcycle
    ? [
        isRtl ? inquiry.requestedMotorcycle.brandNameAr : inquiry.requestedMotorcycle.brandNameEn,
        isRtl ? inquiry.requestedMotorcycle.categoryNameAr : inquiry.requestedMotorcycle.categoryNameEn,
        inquiry.requestedMotorcycle.model,
      ].filter(Boolean).join(' · ')
    : inquiry.motorcycle
      ? [
          isRtl ? inquiry.motorcycle.brand.nameAr : inquiry.motorcycle.brand.nameEn,
          isRtl ? inquiry.motorcycle.category?.nameAr : inquiry.motorcycle.category?.nameEn,
          inquiry.motorcycle.model,
        ].filter(Boolean).join(' · ')
      : null;
  const calculation = inquiry.financingBreakdown;
  const documentTypeLabel: Record<InquiryDocumentType, string> = {
    EMPLOYEE: t('Employee', 'موظف'),
    PENSION: t('Pension', 'صاحب معاش'),
    COMMERCIAL_REGISTRY: t('Commercial registry', 'سجل تجاري'),
    NEITHER: t('Other', 'غير ذلك'),
  };
  const guarantors = [
    {
      title: t('First guarantor', 'الضامن الأول'),
      name: inquiry.firstGuarantorName,
      phone: inquiry.firstGuarantorPhone,
      address: inquiry.firstGuarantorAddress,
      occupation: inquiry.firstGuarantorOccupation,
      occupationAddress: inquiry.firstGuarantorOccupationAddress,
      front: inquiry.guarantorIdFrontImage,
      back: inquiry.guarantorIdBackImage,
    },
    {
      title: t('Second guarantor', 'الضامن الثاني'),
      name: inquiry.secondGuarantorName,
      phone: inquiry.secondGuarantorPhone,
      address: inquiry.secondGuarantorAddress,
      occupation: inquiry.secondGuarantorOccupation,
      occupationAddress: inquiry.secondGuarantorOccupationAddress,
      front: inquiry.guarantor2IdFrontImage,
      back: inquiry.guarantor2IdBackImage,
    },
  ];
  const documents: Array<{ label: string; url?: string | null }> = [
    { label: t('Supporting document', 'المستند الداعم'), url: inquiry.documentImage },
    { label: t('Buyer ID front', 'بطاقة المشتري - الوجه الأمامي'), url: inquiry.idCardFrontImage },
    { label: t('Buyer ID back', 'بطاقة المشتري - الوجه الخلفي'), url: inquiry.idCardBackImage },
    { label: t('Guarantor signature', 'توقيع الضامن'), url: inquiry.guarantorSignatureImage },
    { label: t('First guarantor ID front', 'بطاقة الضامن الأول - الوجه الأمامي'), url: inquiry.guarantorIdFrontImage },
    { label: t('First guarantor ID back', 'بطاقة الضامن الأول - الوجه الخلفي'), url: inquiry.guarantorIdBackImage },
    { label: t('Second guarantor ID front', 'بطاقة الضامن الثاني - الوجه الأمامي'), url: inquiry.guarantor2IdFrontImage },
    { label: t('Second guarantor ID back', 'بطاقة الضامن الثاني - الوجه الخلفي'), url: inquiry.guarantor2IdBackImage },
  ];
  const availableDocuments = documents.flatMap(item =>
    item.url && isSafeDocumentUrl(item.url) ? [{ label: item.label, url: item.url }] : [],
  );

  return (
    <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <button className="premium-action-btn outline" style={{ marginBottom: '0.75rem' }} onClick={() => navigate('/inquiries')}>
            <ArrowLeft size={16} /> {t('Back to inquiries', 'العودة إلى الاستعلامات')}
          </button>
          <h1 style={{ margin: 0 }}>{t('Inquiry details', 'تفاصيل الاستعلام')}</h1>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)' }}>
            {t('Reference', 'رقم الاستعلام')}: {inquiry.id}
          </p>
        </div>
      </header>

      <InquirySection title={t('Customer details', 'بيانات العميل')}>
        <InquiryField label={t('Name', 'الاسم')} value={inquiry.customerName} />
        <InquiryField label={t('Phone', 'الهاتف')} value={inquiry.customerPhone} />
        <InquiryField label={t('Address', 'العنوان')} value={inquiry.address} />
        <InquiryField label={t('Occupation', 'المهنة')} value={inquiry.occupation} />
        <InquiryField label={t('Occupation address', 'عنوان المهنة')} value={inquiry.occupationAddress} />
        <InquiryField label={t('Document type', 'نوع المستند')} value={documentTypeLabel[inquiry.documentType]} />
        <InquiryField label={t('Created at', 'تاريخ الإنشاء')} value={new Date(inquiry.createdAt).toLocaleString(locale)} />
      </InquirySection>

      <InquirySection title={t('Motorcycle', 'الدراجة النارية')}>
        <InquiryField label={t('Requested motorcycle', 'الدراجة المطلوبة')} value={motorcycleName} />
        <InquiryField label={t('Chassis number', 'رقم الشاسيه')} value={inquiry.motorcycle?.vin} />
        <InquiryField label={t('Motorcycle price', 'سعر الدراجة')} value={money(inquiry.motorcyclePrice ?? inquiry.motorcycle?.price)} />
      </InquirySection>

      <InquirySection title={t('Financing breakdown', 'تفاصيل التمويل')}>
        {!calculation && <p style={{ margin: '0 0 0.5rem', color: 'var(--text-secondary)' }}>{t('The financing breakdown is unavailable until the required price, down payment, company rate, and duration are saved.', 'تفاصيل التمويل غير متاحة حتى يتم حفظ السعر والدفعة المقدمة ونسبة الشركة والمدة المطلوبة.')}</p>}
        <InquiryField label={t('Finance company', 'شركة التمويل')} value={inquiry.financingCompany?.name} />
        <InquiryField label={t('Annual interest rate', 'نسبة الفائدة السنوية')} value={inquiry.annualInterestRate == null ? undefined : `${inquiry.annualInterestRate}%`} />
        <InquiryField label={t('Duration', 'مدة التقسيط')} value={inquiry.installmentDuration ? t(`${inquiry.installmentDuration.months} months`, `${inquiry.installmentDuration.months} شهر`) : undefined} />
        <InquiryField label={t('Down payment', 'الدفعة المقدمة')} value={money(inquiry.downPayment)} />
        <InquiryField label={t('Financed amount', 'المبلغ المموّل')} value={money(calculation?.financedAmount)} />
        <InquiryField label={t('Total interest', 'إجمالي الفائدة')} value={money(calculation?.totalInterest)} />
        <InquiryField label={t('Total amount due', 'إجمالي المستحق')} value={money(calculation?.totalAmountDue)} />
        <InquiryField label={t('Monthly installment', 'القسط الشهري')} value={money(calculation?.monthlyInstallment)} />
      </InquirySection>

      {guarantors.map(guarantor => (
        <InquirySection key={guarantor.title} title={guarantor.title}>
          <InquiryField label={t('Name', 'الاسم')} value={guarantor.name} />
          <InquiryField label={t('Phone', 'الهاتف')} value={guarantor.phone} />
          <InquiryField label={t('Address', 'العنوان')} value={guarantor.address} />
          <InquiryField label={t('Occupation', 'المهنة')} value={guarantor.occupation} />
          <InquiryField label={t('Occupation address', 'عنوان المهنة')} value={guarantor.occupationAddress} />
          <InquiryField label={t('ID front', 'بطاقة الهوية - الوجه الأمامي')} value={guarantor.front ? t('Attached', 'مرفق') : undefined} />
          <InquiryField label={t('ID back', 'بطاقة الهوية - الوجه الخلفي')} value={guarantor.back ? t('Attached', 'مرفق') : undefined} />
        </InquirySection>
      ))}

      <InquirySection title={t('Documents', 'المستندات')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {availableDocuments.map(item => (
            <a key={item.label} href={item.url} target="_blank" rel="noopener noreferrer" className="surface-panel" style={{ padding: '0.75rem', color: 'var(--blue-dark)', textDecoration: 'none' }}>
              {documentIsImage(item.url)
                ? <img src={item.url} alt={item.label} style={{ width: '100%', height: 120, objectFit: 'contain', background: '#f8fafc', borderRadius: 8, marginBottom: '0.5rem' }} />
                : <FileImage size={20} style={{ marginBottom: '0.5rem' }} />}
              <span style={{ display: 'block', fontSize: '0.82rem' }}>{item.label}</span>
            </a>
          ))}
          {inquiry.electricityLetterUploaded && (
            <button type="button" className="surface-panel" onClick={() => void downloadElectricityLetter()} style={{ padding: '0.75rem', textAlign: 'start', color: 'var(--blue-dark)', cursor: 'pointer' }}>
              <Download size={20} style={{ marginBottom: '0.5rem' }} />
              <span style={{ display: 'block', fontSize: '0.82rem' }}>{t('Electricity letter', 'خطاب الكهرباء')}</span>
            </button>
          )}
        </div>
        {availableDocuments.length === 0 && !inquiry.electricityLetterUploaded && (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{t('No documents are attached.', 'لا توجد مستندات مرفقة.')}</p>
        )}
        {documentError && <p role="alert" style={{ color: 'var(--red-light)' }}>{documentError}</p>}
      </InquirySection>
    </section>
  );
}
