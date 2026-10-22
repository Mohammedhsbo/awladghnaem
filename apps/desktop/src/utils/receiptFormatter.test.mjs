import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDownPaymentReceiptHTML } from './receiptFormatter.ts';

test('formats a down-payment receipt with only its four requested details', () => {
  const html = formatDownPaymentReceiptHTML({
    buyerName: 'Test Customer',
    buyerPhone: '01012345678',
    downPayment: 12500,
    motorcycle: { brand: 'Honda', model: 'Scooter 2026' },
  }, 'en');

  assert.match(html, /Down-payment receipt/);
  assert.match(html, /Customer name/);
  assert.match(html, /Honda · Scooter 2026/);
  assert.match(html, /Phone number/);
  assert.match(html, /Down Payment/);
  assert.match(html, /EGP/);
  assert.equal(html.match(/class="row(?: amount)?"/g)?.length, 4);
  assert.doesNotMatch(html, /request-123|Financing company|Request no\.|Date:/);
});

test('uses unavailable placeholders instead of inventing missing receipt data', () => {
  const html = formatDownPaymentReceiptHTML({
    buyerName: 'Test Customer',
    buyerPhone: '',
    downPayment: 0,
  }, 'ar');

  assert.match(html, /إيصال استلام مقدم/);
  assert.match(html, /الموتوسيكل/);
  assert.match(html, /رقم الهاتف/);
  assert.match(html, /—/);
  assert.match(html, /المقدم/);
});
