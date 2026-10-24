import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWhatsAppUrl } from '../../../../packages/shared-types/src/whatsapp.ts';
import {
  buildInquiryWhatsAppMessage,
  buildInquiryWhatsAppUrl,
  normalizeEgyptWhatsAppPhone,
} from './inquiryWhatsApp.ts';

function inquiry(overrides = {}) {
  return {
    id: 'inquiry-123',
    customerName: 'سارة أحمد',
    customerPhone: '010 1234-5678',
    documentType: 'EMPLOYEE',
    createdAt: '2026-10-22T00:00:00.000Z',
    electricityLetterUploaded: false,
    ...overrides,
  };
}

test('normalizes Egyptian mobile phone formats to a single international country code', () => {
  assert.equal(normalizeEgyptWhatsAppPhone('010 1234-5678'), '201012345678');
  assert.equal(normalizeEgyptWhatsAppPhone('+20 (10) 1234 5678'), '201012345678');
  assert.equal(normalizeEgyptWhatsAppPhone('0020-10-1234-5678'), '201012345678');
  assert.equal(normalizeEgyptWhatsAppPhone('٢٠١٠١٢٣٤٥٦٧٨'), '201012345678');
  assert.equal(normalizeEgyptWhatsAppPhone('01234'), null);
  assert.equal(normalizeEgyptWhatsAppPhone('010abcdefgh'), null);
});

test('builds an encoded WhatsApp URL with the complete reviewable inquiry message', () => {
  const fullInquiry = inquiry({
    address: 'القاهرة',
    occupation: 'مهندسة',
    occupationAddress: 'مدينة نصر',
    firstGuarantorName: 'أحمد علي',
    firstGuarantorPhone: '01112345678',
    firstGuarantorAddress: 'الجيزة',
    firstGuarantorOccupation: 'محاسب',
    firstGuarantorOccupationAddress: 'الدقي',
    secondGuarantorName: 'منى علي',
    secondGuarantorPhone: '01212345678',
    secondGuarantorAddress: 'الهرم',
    secondGuarantorOccupation: 'طبيبة',
    secondGuarantorOccupationAddress: 'المعادي',
    documentImage: 'https://private.example/supporting-document',
    idCardFrontImage: 'https://private.example/id-front',
    idCardBackImage: 'https://private.example/id-back',
    guarantorIdFrontImage: 'front.jpg',
    guarantorIdBackImage: 'back.jpg',
    guarantorSignatureImage: 'signature.jpg',
    guarantor2IdFrontImage: 'second-front.jpg',
    guarantor2IdBackImage: 'second-back.jpg',
    electricityLetterUploaded: true,
    requestedMotorcycle: {
      brandId: 'brand',
      brandNameAr: 'هوندا',
      brandNameEn: 'Honda',
      categoryId: 'category',
      categoryNameAr: 'سكوتر',
      categoryNameEn: 'Scooter',
      model: '2026',
    },
    motorcyclePrice: 32000,
    downPayment: 25000,
    financingCompany: { name: 'شركة التمويل', annualInterestRate: 25 },
    installmentDuration: { months: 12 },
    financingBreakdown: {
      motorcyclePrice: 32000,
      downPayment: 25000,
      annualInterestRate: 25,
      durationMonths: 12,
      financedAmount: 7000,
      totalInterest: 1750,
      totalAmountDue: 8750,
      monthlyInstallment: 729.17,
    },
  });
  const message = buildInquiryWhatsAppMessage(fullInquiry);
  const url = buildInquiryWhatsAppUrl(fullInquiry.customerPhone, message);

  assert.ok(url?.startsWith('https://wa.me/201012345678?text='));
  assert.equal(decodeURIComponent(url.split('?text=')[1]), message);
  assert.match(message, /بيانات المشتري/);
  assert.match(message, /المهنة: مهندسة/);
  assert.match(message, /عنوان المهنة: مدينة نصر/);
  assert.match(message, /هوندا/);
  assert.match(message, /رقم الاستعلام: inquiry-123/);
  assert.match(message, /أحمد علي/);
  assert.match(message, /منى علي/);
  assert.match(message, /شركة التمويل/);
  assert.match(message, /المبلغ الممول: ٧٬٠٠٠ جنيه/);
  assert.match(message, /القسط الشهري: ٧٢٩٫١٧ جنيه/);
  assert.match(message, /تقديرية/);
  assert.match(message, /بطاقة المشتري - الوجه الأمامي: مرفق/);
  assert.match(message, /خطاب الكهرباء: مرفق/);
  assert.doesNotMatch(message, /private\.example|undefined|null|NaN/);
});

test('omits missing guarantors and unavailable financing amounts', () => {
  const message = buildInquiryWhatsAppMessage(inquiry({
    financingCompany: { name: 'شركة التمويل', annualInterestRate: 0 },
    installmentDuration: { months: 12 },
    downPayment: 500,
    financingBreakdown: null,
  }));

  assert.doesNotMatch(message, /بيانات الضامن/);
  assert.match(message, /معلومات التمويل المتاحة/);
  assert.match(message, /شركة التمويل/);
  assert.doesNotMatch(message, /المبلغ الممول:|إجمالي الفائدة:|إجمالي المبلغ المستحق:/);
  assert.doesNotMatch(message, /القسط الشهري:/);
  assert.doesNotMatch(message, /undefined|null|NaN/);
});

test('returns no WhatsApp URL for an invalid recipient number', () => {
  assert.equal(buildInquiryWhatsAppUrl('1234', 'رسالة'), null);
});

test('encodes Arabic and mixed-script WhatsApp message text without truncation', () => {
  const message = 'طلب تمويل جديد - Honda 2026\nالقسط: ٥٬٦٦٦٫٦٧ جنيه';
  const url = buildWhatsAppUrl('01012345678', message);

  assert.equal(url, `https://wa.me/201012345678?text=${encodeURIComponent(message)}`);
  assert.equal(decodeURIComponent(url.split('?text=')[1]), message);
});
