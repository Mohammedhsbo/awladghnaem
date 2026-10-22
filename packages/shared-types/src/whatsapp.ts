export function normalizeWhatsAppPhone(phone: string, defaultCountryCode = "966"): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("05")) return `${defaultCountryCode}${digits.slice(1)}`;
  if (digits.startsWith("01")) return `20${digits.slice(1)}`;
  if (digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

export function getValidWhatsAppPhone(phone: string, defaultCountryCode = "966"): string | null {
  const trimmedPhone = phone.trim();
  if (!/^\+?[0-9\s().-]+$/.test(trimmedPhone)) return null;

  const normalizedPhone = normalizeWhatsAppPhone(trimmedPhone, defaultCountryCode);
  return /^[1-9][0-9]{7,14}$/.test(normalizedPhone) ? normalizedPhone : null;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizeWhatsAppPhone(phone)}?text=${encodeURIComponent(message)}`;
}