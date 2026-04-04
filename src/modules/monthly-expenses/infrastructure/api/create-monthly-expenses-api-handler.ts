import type { NextApiHandler, NextApiRequest } from "next";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import {
  GoogleOAuthAuthenticationError,
  GoogleOAuthConfigurationError,
} from "@/modules/auth/infrastructure/oauth/google-oauth-token";
import {
  MonthlyExpenseCoverageValidationError,
} from "@/modules/monthly-expenses/application/errors/monthly-expense-coverage-validation-error";
import {
  MonthlyExpenseReceiptFolderConflictError,
} from "@/modules/monthly-expenses/application/errors/monthly-expense-receipt-folder-conflict-error";
import type { TursoDatabase } from "@/modules/shared/infrastructure/database/drizzle/turso-database";
import { TursoConfigurationError } from "@/modules/shared/infrastructure/database/turso-server-config";
import {
  appLogger,
  createRequestLogContext,
} from "@/modules/shared/infrastructure/observability/app-logger";

import type { SaveMonthlyExpensesCommand } from "../../application/commands/save-monthly-expenses-command";

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
        "monthly-expenses API requires monthly folder metadata to include both fields or neither one.",
      path: ["monthlyFolderId"],
    });
  }
});

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
      "monthly-expenses API requires receiptSharePhoneDigits to be a valid international phone number.",
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
        "monthly-expenses API requires receiptSharePhoneDigits when requiresReceiptShare is true.",
      path: ["receiptSharePhoneDigits"],
    });
  }
});

const monthlyExpensesRequestBodySchema = z.object({
  items: z.array(monthlyExpenseItemSchema),
  month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();

const monthlyExpensesGetQuerySchema = z.object({
  month: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

async function getDefaultUserSubject(request: NextApiRequest) {
  const { getAuthenticatedUserSubjectFromRequest } = await import(
    "@/modules/auth/infrastructure/next-auth/authenticated-user-subject"
  );

  return getAuthenticatedUserSubjectFromRequest(request);
}

async function getDefaultDatabase(): Promise<TursoDatabase> {
  const { createMigratedTursoDatabase } = await import(
    "@/modules/shared/infrastructure/database/drizzle/turso-database"
  );

  return createMigratedTursoDatabase();
}

export function createMonthlyExpensesApiHandler<TLoadResult, TSaveResult>({
  getDatabase = getDefaultDatabase,
  getUserSubject = getDefaultUserSubject,
  load,
  save,
}: {
  getDatabase?: () => Promise<TursoDatabase> | TursoDatabase;
  getUserSubject?: (request: NextApiRequest) => Promise<string>;
  load: (dependencies: {
    database: TursoDatabase;
    month: string;
    request: NextApiRequest;
    userSubject: string;
  }) => Promise<TLoadResult>;
  save: (dependencies: {
    command: SaveMonthlyExpensesCommand;
    database: TursoDatabase;
    request: NextApiRequest;
    userSubject: string;
  }) => Promise<TSaveResult>;
}): NextApiHandler {
  return async function monthlyExpensesApiHandler(request, response) {
    const requestContext = createRequestLogContext(request);

    if (request.method !== "GET" && request.method !== "POST") {
      appLogger.warn("monthly-expenses API received an unsupported method", {
        context: {
          ...requestContext,
          operation: "monthly-expenses-api:method-not-allowed",
        },
      });
      response.setHeader("Allow", "GET, POST");

      return response.status(405).json({
        error:
          "monthly-expenses only supports GET and POST requests on this endpoint.",
      });
    }

    if (request.method === "GET") {
      const rawMonthQuery = Array.isArray(request.query.month)
        ? request.query.month[0]
        : request.query.month;
      const parsedQuery = monthlyExpensesGetQuerySchema.safeParse({
        month: rawMonthQuery,
      });

      if (!parsedQuery.success) {
        appLogger.warn("monthly-expenses API received an invalid GET month", {
          context: {
            ...requestContext,
            operation: "monthly-expenses-api:get:invalid-month-query",
          },
        });

        return response.status(400).json({
          error:
            "monthly-expenses requires a month query parameter in YYYY-MM format for GET requests.",
        });
      }

      try {
        const userSubject = await getUserSubject(request);
        const database = await getDatabase();

        return response.status(200).json({
          data: await load({
            database,
            month: parsedQuery.data.month,
            request,
            userSubject,
          }),
        });
      } catch (error) {
        appLogger.error("monthly-expenses API GET request failed", {
          context: {
            ...requestContext,
            month: parsedQuery.data.month,
            operation: "monthly-expenses-api:get",
          },
          error,
        });

        if (error instanceof GoogleOAuthAuthenticationError) {
          return response.status(401).json({
            error:
              "Google authentication is required before loading monthly expenses.",
          });
        }

        if (error instanceof GoogleOAuthConfigurationError) {
          return response.status(500).json({
            error:
              "Google OAuth server configuration is incomplete for monthly expenses loading.",
          });
        }

        if (error instanceof TursoConfigurationError) {
          return response.status(500).json({
            error:
              "Database server configuration is incomplete for monthly expenses loading.",
          });
        }

        return response.status(500).json({
          error: "We could not load monthly expenses right now. Try again later.",
        });
      }
    }

    const parsedBody = monthlyExpensesRequestBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      appLogger.warn("monthly-expenses API received an invalid POST payload", {
        context: {
          ...requestContext,
          operation: "monthly-expenses-api:post:invalid-payload",
        },
      });

      return response.status(400).json({
        error:
          "monthly-expenses requires a month in YYYY-MM format, valid expense rows, and complete loan details when a debt is included.",
      });
    }

    try {
      const userSubject = await getUserSubject(request);
      const database = await getDatabase();
      await save({
        command: parsedBody.data,
        database,
        request,
        userSubject,
      });

      response.status(204).end();
      return;
    } catch (error) {
      appLogger.error("monthly-expenses API POST request failed", {
        context: {
          ...requestContext,
          month: parsedBody.data.month,
          operation: "monthly-expenses-api:post",
        },
        error,
      });

      if (error instanceof GoogleOAuthAuthenticationError) {
        return response.status(401).json({
          error:
            "Google authentication is required before saving monthly expenses.",
        });
      }

      if (error instanceof GoogleOAuthConfigurationError) {
        return response.status(500).json({
          error:
            "Google OAuth server configuration is incomplete for monthly expenses storage.",
        });
      }

      if (error instanceof TursoConfigurationError) {
        return response.status(500).json({
          error:
            "Database server configuration is incomplete for monthly expenses storage.",
        });
      }

      if (error instanceof MonthlyExpenseReceiptFolderConflictError) {
        return response.status(409).json({
          error: error.message,
        });
      }

      if (error instanceof MonthlyExpenseCoverageValidationError) {
        return response.status(400).json({
          error: error.message,
        });
      }

      return response.status(500).json({
        error: "We could not save monthly expenses right now. Try again later.",
      });
    }
  };
}
