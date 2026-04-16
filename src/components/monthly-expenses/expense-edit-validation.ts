import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

export const OCCURRENCES_PER_MONTH_VALIDATION_ERROR_MESSAGE =
  "Ingresá una cantidad mayor a 0.";
export const RECEIPT_SHARE_PHONE_REQUIRED_ERROR_MESSAGE =
  "Completá el número de WhatsApp.";
export const RECEIPT_SHARE_PHONE_VALIDATION_ERROR_MESSAGE =
  "Ingresá un número de WhatsApp internacional válido.";
export const SUBTOTAL_VALIDATION_ERROR_MESSAGE =
  "Ingresá un subtotal mayor a 0.";

const receiptSharePhoneSchema = z
  .string()
  .trim()
  .min(1, RECEIPT_SHARE_PHONE_REQUIRED_ERROR_MESSAGE)
  .refine((value) => {
    const phoneDigits = normalizeReceiptSharePhoneDigits(value);

    if (!phoneDigits) {
      return false;
    }

    const parsedPhone = parsePhoneNumberFromString(`+${phoneDigits}`);

    return Boolean(parsedPhone?.isValid());
  }, RECEIPT_SHARE_PHONE_VALIDATION_ERROR_MESSAGE)
  .transform((value) => normalizeReceiptSharePhoneDigits(value));

export function normalizeReceiptSharePhoneDigits(value: string): string {
  return value.trim().replace(/\D+/g, "");
}

export function validateReceiptSharePhoneDigits(value: string): string | null {
  const result = receiptSharePhoneSchema.safeParse(value);

  if (result.success) {
    return null;
  }

  return (
    result.error.issues[0]?.message ??
    RECEIPT_SHARE_PHONE_VALIDATION_ERROR_MESSAGE
  );
}

export function validateSubtotalAmount(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return SUBTOTAL_VALIDATION_ERROR_MESSAGE;
  }

  return null;
}

export function validateOccurrencesPerMonth(value: number): string | null {
  if (!Number.isInteger(value) || value <= 0) {
    return OCCURRENCES_PER_MONTH_VALIDATION_ERROR_MESSAGE;
  }

  return null;
}
