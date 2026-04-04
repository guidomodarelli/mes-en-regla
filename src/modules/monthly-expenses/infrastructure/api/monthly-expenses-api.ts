import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { withCorrelationIdHeaders } from "@/modules/shared/infrastructure/observability/client-correlation-id";

import type { SaveMonthlyExpensesCommand } from "../../application/commands/save-monthly-expenses-command";
import type { MonthlyExpensesDocumentResult } from "../../application/results/monthly-expenses-document-result";

const PAYMENT_LINK_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const PAYMENT_LINK_URL_SCHEMA = z.url({
  protocol: /^https?$/,
  hostname: z.regexes.domain,
});
const RECEIPT_VIEW_URL_SCHEMA = z.url({
  protocol: /^https?$/,
  hostname: z.regexes.domain,
});
const RECEIPT_SHARE_STATUSES = ["pending", "sent"] as const;

function normalizeHttpPaymentLink(value: string): string {
  const normalizedValue = value.trim();
  const paymentLinkWithProtocol = PAYMENT_LINK_PROTOCOL_PATTERN.test(
    normalizedValue,
  )
    ? normalizedValue
    : `https://${normalizedValue}`;

  return PAYMENT_LINK_URL_SCHEMA.parse(paymentLinkWithProtocol);
}

function isValidHttpPaymentLink(value: string): boolean {
  try {
    normalizeHttpPaymentLink(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeReceiptSharePhoneDigits(value: string): string {
  const phoneDigits = value.trim().replace(/\D+/g, "");
  const parsedPhone = parsePhoneNumberFromString(`+${phoneDigits}`);

  if (!phoneDigits || !parsedPhone || !parsedPhone.isValid()) {
    throw new Error(
      "monthly-expenses-api requires receiptSharePhoneDigits to be a valid international phone number.",
    );
  }

  return phoneDigits;
}

function isValidReceiptSharePhoneDigits(value: string): boolean {
  try {
    normalizeReceiptSharePhoneDigits(value);
    return true;
  } catch {
    return false;
  }
}

const receiptSharePhoneDigitsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  },
  z
    .string()
    .refine((value) => isValidReceiptSharePhoneDigits(value))
    .transform((value) => normalizeReceiptSharePhoneDigits(value))
    .nullable(),
);

const receiptShareMessageSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  },
  z.string().trim().nullable(),
);

const monthlyExpenseReceiptSchema = z.object({
  allReceiptsFolderId: z.string().trim().min(1),
  allReceiptsFolderViewUrl: z
    .string()
    .trim()
    .refine((value) => RECEIPT_VIEW_URL_SCHEMA.safeParse(value).success),
  coveredPayments: z.number().int().positive().optional(),
  fileId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  fileViewUrl: z
    .string()
    .trim()
    .refine((value) => RECEIPT_VIEW_URL_SCHEMA.safeParse(value).success),
  monthlyFolderId: z.string().trim().min(1),
  monthlyFolderViewUrl: z
    .string()
    .trim()
    .refine((value) => RECEIPT_VIEW_URL_SCHEMA.safeParse(value).success),
}).strict();

const monthlyExpenseFoldersSchema = z.object({
  allReceiptsFolderId: z.string().trim().min(1),
  allReceiptsFolderViewUrl: z
    .string()
    .trim()
    .refine((value) => RECEIPT_VIEW_URL_SCHEMA.safeParse(value).success),
  monthlyFolderId: z.string().trim(),
  monthlyFolderViewUrl: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || RECEIPT_VIEW_URL_SCHEMA.safeParse(value).success,
    ),
}).strict().superRefine((value, context) => {
  const hasMonthlyFolderId = value.monthlyFolderId.length > 0;
  const hasMonthlyFolderViewUrl = value.monthlyFolderViewUrl.length > 0;

  if (hasMonthlyFolderId !== hasMonthlyFolderViewUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "monthly-expenses-api requires monthly folder metadata to include both fields or neither one.",
      path: ["monthlyFolderId"],
    });
  }
});

const monthlyExpenseReceiptResponseSchema = monthlyExpenseReceiptSchema.extend({
  allReceiptsFolderStatus: z.enum(["normal", "trashed", "missing"]).optional(),
  fileStatus: z.enum(["normal", "trashed", "missing"]).optional(),
  monthlyFolderStatus: z.enum(["normal", "trashed", "missing"]).optional(),
}).strict();

const monthlyExpenseFoldersResponseSchema = monthlyExpenseFoldersSchema.extend({
  allReceiptsFolderStatus: z.enum(["normal", "trashed", "missing"]).optional(),
  monthlyFolderStatus: z.enum(["normal", "trashed", "missing"]).optional(),
}).strict();

const monthlyExpenseItemSchema = z.object({
  currency: z.enum(["ARS", "USD"]),
  description: z.string().trim().min(1),
  folders: monthlyExpenseFoldersSchema.nullable().optional(),
  id: z.string().trim().min(1),
  isPaid: z.boolean().optional(),
  loan: z
    .object({
      installmentCount: z.number().int().positive(),
      lenderId: z.string().optional(),
      lenderName: z.string().optional(),
      startMonth: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    })
    .optional(),
  manualCoveredPayments: z.number().int().nonnegative().optional(),
  occurrencesPerMonth: z.number().int().positive(),
  paymentLink: z
    .string()
    .trim()
    .refine((value) => isValidHttpPaymentLink(value))
    .transform((value) => normalizeHttpPaymentLink(value))
    .nullable()
    .optional(),
  receiptShareMessage: receiptShareMessageSchema.optional(),
  receiptSharePhoneDigits: receiptSharePhoneDigitsSchema.optional(),
  receiptShareStatus: z.enum(RECEIPT_SHARE_STATUSES).nullable().optional(),
  requiresReceiptShare: z.boolean().optional(),
  receipts: z.array(monthlyExpenseReceiptSchema).optional(),
  subtotal: z.number().positive(),
}).strict().superRefine((value, context) => {
  if (value.requiresReceiptShare === true && !value.receiptSharePhoneDigits) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "monthly-expenses-api requires receiptSharePhoneDigits when requiresReceiptShare is true.",
      path: ["receiptSharePhoneDigits"],
    });
  }
});

const monthlyExpensesRequestSchema = z.object({
  items: z.array(monthlyExpenseItemSchema),
  month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();

const monthlyExpensesErrorEnvelopeSchema = z.object({
  error: z.string().trim().min(1),
}).strict();

const monthlyExpensesDocumentEnvelopeSchema = z.object({
  data: z.object({
    exchangeRateLoadError: z.string().nullable().optional(),
    exchangeRateSnapshot: z
      .object({
        blueRate: z.number().positive(),
        month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        officialRate: z.number().positive(),
        solidarityRate: z.number().positive(),
      })
      .nullable()
      .optional(),
    items: z.array(
      z.object({
        currency: z.enum(["ARS", "USD"]),
        description: z.string().trim().min(1),
        folders: monthlyExpenseFoldersResponseSchema.nullable().optional(),
        id: z.string().trim().min(1),
        isPaid: z.boolean().optional(),
        loan: z
          .object({
            endMonth: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
            installmentCount: z.number().int().positive(),
            lenderId: z.string().optional(),
            lenderName: z.string().optional(),
            paidInstallments: z.number().int().nonnegative(),
            startMonth: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          })
          .optional(),
        manualCoveredPayments: z.number().int().nonnegative().optional(),
        occurrencesPerMonth: z.number().int().positive(),
        paymentLink: z
          .string()
          .trim()
          .refine((value) => isValidHttpPaymentLink(value))
          .transform((value) => normalizeHttpPaymentLink(value))
          .nullable()
          .optional(),
        receiptShareMessage: receiptShareMessageSchema.optional(),
        receiptSharePhoneDigits: receiptSharePhoneDigitsSchema.optional(),
        receiptShareStatus: z.enum(RECEIPT_SHARE_STATUSES).nullable().optional(),
        requiresReceiptShare: z.boolean().optional(),
        receipts: z.array(monthlyExpenseReceiptResponseSchema).optional(),
        subtotal: z.number().positive(),
        total: z.number().nonnegative(),
      }).strict().superRefine((value, context) => {
        if (value.requiresReceiptShare === true && !value.receiptSharePhoneDigits) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "monthly-expenses-api requires receiptSharePhoneDigits when requiresReceiptShare is true.",
            path: ["receiptSharePhoneDigits"],
          });
        }
      }),
    ),
    month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }).strict(),
}).strict();

export class MonthlyExpensesApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MonthlyExpensesApiError";
  }
}

export async function saveMonthlyExpensesDocumentViaApi(
  payload: SaveMonthlyExpensesCommand,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const normalizedPayload = monthlyExpensesRequestSchema.parse(payload);
  const response = await fetchImplementation("/api/storage/monthly-expenses", {
    body: JSON.stringify(normalizedPayload),
    headers: withCorrelationIdHeaders({
      "Content-Type": "application/json",
    }),
    method: "POST",
  });

  if (!response.ok) {
    const responseJson = await response.json();
    const parsedError =
      monthlyExpensesErrorEnvelopeSchema.safeParse(responseJson);

    throw new MonthlyExpensesApiError(
      parsedError.success
        ? parsedError.data.error
        : "monthly-expenses-api:/api/storage/monthly-expenses returned an unexpected error response.",
    );
  }
}

export async function getMonthlyExpensesDocumentViaApi(
  month: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<MonthlyExpensesDocumentResult> {
  const normalizedMonth = z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(month);
  const searchParams = new URLSearchParams({
    month: normalizedMonth,
  });
  const response = await fetchImplementation(
    `/api/storage/monthly-expenses?${searchParams.toString()}`,
    {
      headers: withCorrelationIdHeaders(),
    },
  );
  const responseJson = await response.json();

  if (!response.ok) {
    const parsedError = monthlyExpensesErrorEnvelopeSchema.safeParse(responseJson);

    throw new MonthlyExpensesApiError(
      parsedError.success
        ? parsedError.data.error
        : "monthly-expenses-api:/api/storage/monthly-expenses returned an unexpected error response.",
    );
  }

  return monthlyExpensesDocumentEnvelopeSchema.parse(responseJson)
    .data as MonthlyExpensesDocumentResult;
}
