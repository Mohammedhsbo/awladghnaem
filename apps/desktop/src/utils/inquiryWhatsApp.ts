import type { InquiryRecord } from '../api';

const documentTypeLabels: Record<InquiryRecord['documentType'], string> = {
  EMPLOYEE: 'موظف',
  PENSION: 'صاحب معاش',
  COMMERCIAL_REGISTRY: 'سجل تجاري',
  NEITHER: 'غير ذلك',
};

function toLatinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
}

export function normalizeEgyptWhatsAppPhone(phone: string): string | null {
  const normalized = toLatinDigits(phone.trim());
  if (!normalized || !/^\+?[\d\s()./-]+$/.test(normalized)) return null;

  let digits = normalized.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('20')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  if (!/^(10|11|12|15)\d{8}$/.test(digits)) return null;
  return `20${digits}`;
}

function present(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function money(value: number | null | undefined): string | null {
  const amount = finiteNumber(value);
  return amount == null
    ? null
    : `${amount.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} جنيه`;
}

function section(title: string, lines: Array<[string, string | null]>) {
  const availableLines = lines.flatMap(([label, value]) => value ? [`- ${label}: ${value}`] : []);
  return availableLines.length > 0 ? [`*${title}*`, ...availableLines] : [];
}

function attachmentStatus(inquiry: InquiryRecord) {
  const documents = [
    [inquiry.documentType === 'EMPLOYEE' ? 'مفردات المرتب' : 'المستند الداعم', inquiry.documentImage],
    ['بطاقة المشتري - الوجه الأمامي', inquiry.idCardFrontImage],
    ['بطاقة المشتري - الوجه الخلفي', inquiry.idCardBackImage],
    ['بطاقة الضامن الأول - الوجه الأمامي', inquiry.guarantorIdFrontImage],
    ['بطاقة الضامن الأول - الوجه الخلفي', inquiry.guarantorIdBackImage],
    ['توقيع الضامن', inquiry.guarantorSignatureImage],
    ['بطاقة الضامن الثاني - الوجه الأمامي', inquiry.guarantor2IdFrontImage],
    ['بطاقة الضامن الثاني - الوجه الخلفي', inquiry.guarantor2IdBackImage],
  ] as const;
  const lines = documents.map(([label, image]) => `- ${label}: ${image ? 'مرفق' : 'غير مرفق'}`);
  if (inquiry.electricityLetterUploaded) lines.push('- خطاب الكهرباء: مرفق');
  return lines;
}

export function buildInquiryWhatsAppMessage(inquiry: InquiryRecord): string {
  const name = present(inquiry.customerName);
  const greeting = name
    ? `الأستاذ/ ${name} المحترم،`
    : 'الأستاذ الكريم،';
  const createdAt = new Date(inquiry.createdAt);
  const createdDate = Number.isNaN(createdAt.getTime())
    ? null
    : createdAt.toLocaleDateString('ar-EG');

  const motorcycleName = inquiry.motorcycle
    ? [
        inquiry.motorcycle.brand.nameAr,
        inquiry.motorcycle.category?.nameAr,
        inquiry.motorcycle.model,
      ].filter(Boolean).join(' · ')
    : inquiry.requestedMotorcycle
      ? [
          inquiry.requestedMotorcycle.brandNameAr,
          inquiry.requestedMotorcycle.categoryNameAr,
          inquiry.requestedMotorcycle.model,
        ].filter(Boolean).join(' · ')
      : null;
  const motorcyclePrice = money(
    finiteNumber(inquiry.motorcyclePrice) ?? finiteNumber(inquiry.motorcycle?.price),
  );
  const fuelType = inquiry.motorcycle?.fuelType === 'PETROL'
    ? 'بنزين'
    : inquiry.motorcycle?.fuelType === 'ELECTRIC'
      ? 'كهرباء'
      : null;
  const motorcycleYear = finiteNumber(inquiry.motorcycle?.year);

  const breakdown = inquiry.financingBreakdown;
  const annualInterestRate = finiteNumber(breakdown?.annualInterestRate)
    ?? finiteNumber(inquiry.annualInterestRate)
    ?? finiteNumber(inquiry.financingCompany?.annualInterestRate);
  const durationMonths = finiteNumber(breakdown?.durationMonths)
    ?? finiteNumber(inquiry.installmentDuration?.months);
  const financingLines = section(
    breakdown ? '💳 تفاصيل التقسيط التقديرية' : '💳 معلومات التمويل المتاحة',
    [
      ['شركة التمويل', present(inquiry.financingCompany?.name)],
      ['المقدم', money(breakdown?.downPayment ?? inquiry.downPayment)],
      ['نسبة الفائدة السنوية', annualInterestRate == null ? null : `${annualInterestRate}%`],
      ['مدة التقسيط', durationMonths == null ? null : `${durationMonths} شهرًا`],
      ['المبلغ الممول', money(breakdown?.financedAmount)],
      ['إجمالي الفائدة', money(breakdown?.totalInterest)],
      ['إجمالي المبلغ المستحق', money(breakdown?.totalAmountDue)],
      ['القسط الشهري', money(breakdown?.monthlyInstallment)],
    ],
  );

  const firstGuarantor = section('🤝 بيانات الضامن الأول', [
    ['الاسم', present(inquiry.firstGuarantorName)],
    ['الهاتف', present(inquiry.firstGuarantorPhone)],
    ['العنوان', present(inquiry.firstGuarantorAddress)],
    ['المهنة', present(inquiry.firstGuarantorOccupation)],
    ['عنوان العمل', present(inquiry.firstGuarantorOccupationAddress)],
  ]);
  const secondGuarantor = section('🤝 بيانات الضامن الثاني', [
    ['الاسم', present(inquiry.secondGuarantorName)],
    ['الهاتف', present(inquiry.secondGuarantorPhone)],
    ['العنوان', present(inquiry.secondGuarantorAddress)],
    ['المهنة', present(inquiry.secondGuarantorOccupation)],
    ['عنوان العمل', present(inquiry.secondGuarantorOccupationAddress)],
  ]);
  const documents = [
    '*📎 المستندات*',
    ...attachmentStatus(inquiry),
  ];

  return [
    'السلام عليكم ورحمة الله وبركاته،',
    '',
    greeting,
    '',
    'نرسل لحضرتك تفاصيل طلب الاستعلام والتقسيط الخاص بك:',
    '',
    '━━━━━━━━━━━━━━',
    ...section('📋 أولًا: بيانات الاستعلام', [
      ['رقم الاستعلام', present(inquiry.id)],
      ['تاريخ الاستعلام', createdDate],
    ]),
    '',
    ...section('👤 ثانيًا: بيانات المشتري', [
      ['الاسم', name],
      ['رقم الهاتف', present(inquiry.customerPhone)],
      ['العنوان', present(inquiry.address)],
      ['المهنة', present(inquiry.occupation)],
      ['نوع المستند', documentTypeLabels[inquiry.documentType]],
    ]),
    '',
    ...section('🏍️ ثالثًا: بيانات الموتوسيكل', [
      ['الماركة والموديل', present(motorcycleName)],
      ['رقم الشاسيه', present(inquiry.motorcycle?.vin)],
      ['رقم المحرك', present(inquiry.motorcycle?.engineNumber)],
      ['سنة الصنع', motorcycleYear == null ? null : String(motorcycleYear)],
      ['اللون', present(inquiry.motorcycle?.color)],
      ['نوع الوقود', fuelType],
      ['السعر', motorcyclePrice],
    ]),
    '',
    ...firstGuarantor,
    ...(firstGuarantor.length > 0 && secondGuarantor.length > 0 ? [''] : []),
    ...secondGuarantor,
    '',
    ...financingLines,
    ...(breakdown ? ['', 'ملحوظة: هذه الحسابات تقديرية بناءً على البيانات المسجلة وليست موافقة نهائية.'] : []),
    '',
    ...documents,
    '',
    '━━━━━━━━━━━━━━',
    'يرجى مراجعة البيانات والتواصل معنا في حالة وجود أي استفسار أو الحاجة إلى تعديل أي بيانات.',
    '',
    'شكرًا لثقتكم بنا 🌹',
  ].filter(line => line !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

export function buildInquiryWhatsAppUrl(phone: string, message: string): string | null {
  const normalizedPhone = normalizeEgyptWhatsAppPhone(phone);
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
