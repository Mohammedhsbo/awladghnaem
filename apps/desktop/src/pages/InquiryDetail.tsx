import { useRef, useState } from 'react';
import { ArrowLeft, Download, FileImage, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { financingCompanies, getApiErrorMessage, inquiries, type InquiryDocumentType } from '../api';
import { buildInquiryWhatsAppMessage, buildInquiryWhatsAppUrl } from '../utils/inquiryWhatsApp';

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
  const [documentsDownloading, setDocumentsDownloading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [openingWhatsAppRecipient, setOpeningWhatsAppRecipient] = useState<'customer' | 'financingCompany' | null>(null);
  const whatsappOpenLock = useRef(false);
  const query = useQuery({
    queryKey: ['inquiry', id],
    queryFn: () => inquiries.get(id!),
    enabled: Boolean(id),
  });
  const financingCompaniesQuery = useQuery({
    queryKey: ['financing-companies'],
    queryFn: financingCompanies.list,
  });
  const inquiry = query.data;
  const t = (en: string, ar: string) => isRtl ? ar : en;
  const locale = isRtl ? 'ar-EG' : 'en-EG';
  const money = (amount: number | null | undefined) => amount == null ? undefined : `${amount.toLocaleString(locale)} EGP`;

  function openInquiryWhatsApp(recipient: 'customer' | 'financingCompany') {
    if (!inquiry) return;
    setWhatsappError(null);
    setWhatsappNotice(null);
    if (whatsappOpenLock.current) return;

    if (recipient === 'financingCompany' && financingCompaniesQuery.isError) {
      setWhatsappError(getApiErrorMessage(
        financingCompaniesQuery.error,
        t('Could not load financing company details.', 'تعذر تحميل بيانات شركة التمويل.'),
      ));
      return;
    }

    const company = recipient === 'financingCompany'
      ? financingCompaniesQuery.data?.find(item => item.id === inquiry.financingCompanyId)
      : undefined;
    if (recipient === 'financingCompany' && !company) {
      setWhatsappError(t(
        'Could not find the financing company linked to this inquiry.',
        'تعذر العثور على شركة التمويل المرتبطة بهذا الاستعلام.',
      ));
      return;
    }

    const phone = recipient === 'customer' ? inquiry.customerPhone : company?.whatsappNumber ?? '';
    const whatsappUrl = buildInquiryWhatsAppUrl(phone, buildInquiryWhatsAppMessage(inquiry, recipient));
    if (!whatsappUrl) {
      setWhatsappError(recipient === 'customer'
        ? t(
            'The saved customer phone number is not valid for WhatsApp. Correct the number in the inquiry and try again.',
            'رقم هاتف العميل غير صالح لواتساب. صحح الرقم المحفوظ في الاستعلام ثم أعد المحاولة.',
          )
        : t(
            'The financing company WhatsApp number is invalid. Correct it in the company details and try again.',
            'رقم واتساب شركة التمويل غير صالح. صحح الرقم في بيانات الشركة ثم أعد المحاولة.',
          ));
      return;
    }

    whatsappOpenLock.current = true;
    setOpeningWhatsAppRecipient(recipient);
    const whatsappWindow = window.open(whatsappUrl, '_blank');
    window.setTimeout(() => {
      whatsappOpenLock.current = false;
      setOpeningWhatsAppRecipient(null);
    }, 1000);
    if (!whatsappWindow) {
      setWhatsappError(t(
        'Could not open WhatsApp. Allow pop-ups and try again.',
        'تعذر فتح واتساب. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
      ));
      return;
    }

    whatsappWindow.opener = null;
    setWhatsappNotice(t(
      `WhatsApp opened with the inquiry details for the ${recipient === 'customer' ? 'customer' : 'financing company'}. Review the message and press Send yourself; nothing was sent automatically.`,
      `تم فتح واتساب برسالة إلى ${recipient === 'customer' ? 'العميل' : 'شركة التمويل'} تحتوي على تفاصيل الاستعلام. راجعها واضغط إرسال بنفسك؛ لم تُرسل أي رسالة تلقائياً.`,
    ));
  }

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

  async function downloadDocumentsPdf() {
    if (!inquiry || documentsDownloading) return;
    if (availableDocuments.length === 0 && !inquiry.electricityLetterUploaded) {
      setDocumentError(t('No documents are attached.', 'لا توجد مستندات مرفقة.'));
      return;
    }

    const printWindow = window.desktopDocuments ? null : window.open('', '_blank');
    if (!window.desktopDocuments && !printWindow) {
      setDocumentError(t('Could not open the documents window. Allow pop-ups and try again.', 'تعذر فتح نافذة المستندات. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.'));
      return;
    }

    setDocumentError(null);
    setDocumentsDownloading(true);
    const objectUrls: string[] = [];

    try {
      const documentsToDownload: Array<{ label: string; url?: string; blob?: Blob }> = [...availableDocuments];
      if (inquiry.electricityLetterUploaded) {
        if (!id) throw new Error(t('Inquiry ID is unavailable.', 'رقم الاستعلام غير متاح.'));
        const file = await inquiries.downloadElectricityLetter(id);
        if (file.size === 0) throw new Error(t('The electricity letter is empty.', 'ملف خطاب الكهرباء فارغ.'));
        documentsToDownload.push({
          label: t('Electricity letter', 'خطاب الكهرباء'),
          blob: file,
        });
      }

      if (!window.desktopDocuments && printWindow) {
        const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!);
        const pages = documentsToDownload.map(item => {
          const url = item.blob ? URL.createObjectURL(item.blob) : item.url;
          if (!url) throw new Error(`${item.label}: ${t('document URL is missing.', 'رابط المستند غير موجود.')}`);
          if (item.blob) objectUrls.push(url);
          const isPdf = item.blob?.type.includes('pdf') || /\.pdf(?:[?#]|$)/i.test(url);
          const content = isPdf
            ? `<iframe src="${escapeHtml(url)}" title="${escapeHtml(item.label)}"></iframe>`
            : `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.label)}">`;
          return `<article class="document"><h2>${escapeHtml(item.label)}</h2>${content}</article>`;
        }).join('');

        printWindow.opener = null;
        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
          <html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
            <head>
              <meta charset="utf-8">
              <title>${escapeHtml(t('Inquiry documents', 'مستندات الاستعلام'))} - ${escapeHtml(inquiry.id)}</title>
              <style>
                * { box-sizing: border-box; }
                body { margin: 0; padding: 16px; color: #1e293b; font-family: Arial, sans-serif; }
                h1 { margin: 0 0 16px; font-size: 20px; }
                .document { min-height: 260mm; display: flex; flex-direction: column; align-items: center; page-break-after: always; break-after: page; }
                .document h2 { font-size: 16px; }
                .document img { max-width: 100%; max-height: 240mm; object-fit: contain; }
                .document iframe { width: 100%; height: 245mm; border: 0; }
                @media screen { body { max-width: 900px; margin: auto; } .document { border-bottom: 1px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 16px; } }
                @media print { body { padding: 0; } .document { min-height: 0; height: 270mm; } }
              </style>
            </head>
            <body>
              <h1>${escapeHtml(t('Inquiry documents', 'مستندات الاستعلام'))} - ${escapeHtml(inquiry.id)}</h1>
              ${pages}
              <script>
                const resources = [
                  ...Array.from(document.images, image => image.complete
                    ? Promise.resolve()
                    : new Promise(resolve => { image.onload = resolve; image.onerror = resolve; })),
                  ...Array.from(document.querySelectorAll('iframe'), frame =>
                    new Promise(resolve => { frame.onload = resolve; frame.onerror = resolve; })),
                ];
                Promise.race([Promise.all(resources), new Promise(resolve => setTimeout(resolve, 3000))])
                  .then(() => setTimeout(() => window.print(), 300));
                window.onafterprint = () => window.close();
              </script>
            </body>
          </html>`);
        printWindow.document.close();
        for (const url of objectUrls) window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      for (const item of documentsToDownload) {
        let file: Blob;
        if (item.blob) {
          file = item.blob;
        } else {
          if (!item.url) throw new Error(`${item.label}: ${t('document URL is missing.', 'رابط المستند غير موجود.')}`);
          const downloaded = await window.desktopDocuments!.fetchPublic(item.url);
          file = new Blob([downloaded.bytes], { type: downloaded.contentType });
        }
        if (file.size === 0) throw new Error(`${item.label}: ${t('file is empty.', 'الملف فارغ.')}`);

        const bytes = new Uint8Array(await file.arrayBuffer());
        const extension = item.url ? new URL(item.url).pathname.split('.').pop()?.toLowerCase() : '';
        const fileType = file.type.toLowerCase();
        const isPdf = fileType.includes('pdf') ||
          new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';

        if (isPdf) {
          const sourcePdf = await PDFDocument.load(bytes);
          const pages = await pdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
          if (pages.length === 0) throw new Error(`${item.label}: ${t('PDF has no pages.', 'ملف PDF لا يحتوي على صفحات.')}`);
          pages.forEach(page => pdf.addPage(page));
          continue;
        }

        let image: Awaited<ReturnType<typeof pdf.embedJpg>>;
        if (fileType.includes('jpeg') || fileType.includes('jpg') || extension === 'jpg' || extension === 'jpeg') {
          image = await pdf.embedJpg(bytes);
        } else if (fileType.includes('png') || extension === 'png') {
          image = await pdf.embedPng(bytes);
        } else if (fileType.includes('webp') || extension === 'webp') {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          if (!context) {
            bitmap.close();
            throw new Error(`${item.label}: ${t('could not process image.', 'تعذرت معالجة الصورة.')}`);
          }
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(result => result ? resolve(result) : reject(new Error(`${item.label}: ${t('could not convert image.', 'تعذر تحويل الصورة.')}`)), 'image/png');
          });
          image = await pdf.embedPng(await pngBlob.arrayBuffer());
        } else {
          throw new Error(`${item.label}: ${t('unsupported document format.', 'صيغة المستند غير مدعومة.')}`);
        }

        const page = pdf.addPage([595.28, 841.89]);
        const scaled = image.scale(Math.min(555.28 / image.width, 801.89 / image.height));
        page.drawImage(image, {
          x: (page.getWidth() - scaled.width) / 2,
          y: (page.getHeight() - scaled.height) / 2,
          width: scaled.width,
          height: scaled.height,
        });
      }

      if (pdf.getPageCount() === 0) {
        throw new Error(t('No downloadable document pages were found.', 'لم يتم العثور على صفحات مستندات قابلة للتنزيل.'));
      }
      const pdfBytes = await pdf.save();
      const outputBytes = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(outputBytes).set(pdfBytes);
      const output = new Blob([outputBytes], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(output);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `inquiry-${inquiry.id}-documents.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      printWindow?.close();
      setDocumentError(getApiErrorMessage(error, t('Could not prepare the documents PDF.', 'تعذر تجهيز مستندات PDF.')));
    } finally {
      setDocumentsDownloading(false);
    }
  }

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
        <button
          type="button"
          className="premium-action-btn outline"
          onClick={() => void downloadDocumentsPdf()}
          disabled={documentsDownloading}
          aria-busy={documentsDownloading}
        >
          {documentsDownloading ? <span className="spinner" /> : <Download size={17} />}
          {documentsDownloading
            ? t('Preparing documents...', 'جارٍ تجهيز المستندات...')
            : window.desktopDocuments
              ? t('Download documents PDF', 'تحميل المستندات PDF')
              : t('Print or save documents as PDF', 'طباعة أو حفظ المستندات PDF')}
        </button>
      </header>

      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          type="button"
          className="premium-action-btn solid inquiry-whatsapp-customer"
          onClick={() => openInquiryWhatsApp('customer')}
          disabled={openingWhatsAppRecipient !== null}
        >
          <MessageCircle size={16} /> {t('Send to customer via WhatsApp', 'إرسال للعميل عبر واتساب')}
        </button>
        <button
          type="button"
          className="premium-action-btn solid inquiry-whatsapp-financing"
          onClick={() => openInquiryWhatsApp('financingCompany')}
          disabled={openingWhatsAppRecipient !== null || financingCompaniesQuery.isLoading}
        >
          <MessageCircle size={16} /> {t('Send to financing company via WhatsApp', 'إرسال لشركة التمويل عبر واتساب')}
        </button>
      </div>
      {whatsappError && <div className="state-panel" role="alert" style={{ marginBottom: '1rem', color: 'var(--red-light)' }}>{whatsappError}</div>}
      {whatsappNotice && <div className="state-panel" role="status" style={{ marginBottom: '1rem', color: 'var(--green-dark, #047857)' }}>{whatsappNotice}</div>}

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
        <InquiryField label={t('Administrative fees rate', 'نسبة المصاريف الإدارية')} value={inquiry.administrativeFeesPercentage == null ? undefined : `${inquiry.administrativeFeesPercentage}%`} />
        <InquiryField label={t('Duration', 'مدة التقسيط')} value={inquiry.installmentDuration ? t(`${inquiry.installmentDuration.months} months`, `${inquiry.installmentDuration.months} شهر`) : undefined} />
        <InquiryField label={t('Down payment', 'الدفعة المقدمة')} value={money(inquiry.downPayment)} />
        <InquiryField label={t('Financed amount', 'المبلغ المموّل')} value={money(calculation?.financedAmount)} />
        <InquiryField label={t('Interest amount', 'قيمة الفائدة')} value={money(calculation?.totalInterest)} />
        <InquiryField label={t('Administrative fees amount', 'قيمة المصاريف الإدارية')} value={money(calculation?.administrativeFeesAmount)} />
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
