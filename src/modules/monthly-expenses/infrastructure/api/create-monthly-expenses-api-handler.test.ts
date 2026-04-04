import type { NextApiRequest, NextApiResponse } from "next";
import type { TursoDatabase } from "@/modules/shared/infrastructure/database/drizzle/turso-database";

import { GoogleOAuthAuthenticationError } from "@/modules/auth/infrastructure/oauth/google-oauth-token";
import { TursoConfigurationError } from "@/modules/shared/infrastructure/database/turso-server-config";

import { createMonthlyExpensesApiHandler } from "./create-monthly-expenses-api-handler";

interface MockJsonResponse {
  body: unknown | undefined;
  ended: boolean;
  headers: Record<string, string>;
  statusCode: number;
}

function createMockResponse(): NextApiResponse & MockJsonResponse {
  const response: MockJsonResponse & {
    end(): MockJsonResponse;
    json(payload: unknown): MockJsonResponse;
    setHeader(name: string, value: string): MockJsonResponse;
    status(code: number): MockJsonResponse;
  } = {
    body: undefined,
    ended: false,
    end() {
      response.ended = true;
      return response;
    },
    headers: {},
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    setHeader(name: string, value: string) {
      response.headers[name] = value;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    statusCode: 200,
  };

  return response as unknown as NextApiResponse & MockJsonResponse;
}

describe("createMonthlyExpensesApiHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("rejects methods other than GET and POST", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn(),
      save: jest.fn(),
    });

    const request = {
      body: {},
      method: "PUT",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.headers).toEqual({ Allow: "GET, POST" });
    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({
      error:
        "monthly-expenses only supports GET and POST requests on this endpoint.",
    });
  });

  it("returns 400 when GET receives an invalid month query", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn(),
      save: jest.fn(),
    });

    const request = {
      method: "GET",
      query: {
        month: "03-2026",
      },
    } as unknown as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error:
        "monthly-expenses requires a month query parameter in YYYY-MM format for GET requests.",
    });
  });

  it("returns 200 with the loaded monthly document when GET is valid", async () => {
    const database = {} as TursoDatabase;
    const load = jest.fn().mockResolvedValue({
      items: [
        {
          currency: "ARS",
          description: "Agua",
          id: "expense-1",
          occurrencesPerMonth: 1,
          subtotal: 10774.53,
          total: 10774.53,
        },
      ],
      month: "2026-03",
    });
    const handler = createMonthlyExpensesApiHandler({
      load,
      getDatabase: jest.fn().mockResolvedValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save: jest.fn(),
    });

    const request = {
      method: "GET",
      query: {
        month: "2026-03",
      },
    } as unknown as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(load).toHaveBeenCalledWith({
      database,
      month: "2026-03",
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      data: {
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 10774.53,
            total: 10774.53,
          },
        ],
        month: "2026-03",
      },
    });
  });

  it("returns 400 when the request body is invalid", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn(),
      save: jest.fn(),
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "  ",
            id: "expense-1",
            occurrencesPerMonth: 0,
            subtotal: 0,
          },
        ],
        month: "03-2026",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error:
        "monthly-expenses requires a month in YYYY-MM format, valid expense rows, and complete loan details when a debt is included.",
    });
  });

  it("returns 400 when paymentLink is not a valid URL", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn(),
      save: jest.fn(),
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            occurrencesPerMonth: 1,
              paymentLink: "asdads",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error:
        "monthly-expenses requires a month in YYYY-MM format, valid expense rows, and complete loan details when a debt is included.",
    });
  });

  it("returns 204 without exposing the saved document when the request succeeds", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Expensas",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 55032.07,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Expensas",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 55032.07,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(response.body).toBeUndefined();
  });

  it("passes loan metadata to the save use case when a debt is included", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Prestamo tarjeta",
            id: "expense-1",
            loan: {
              installmentCount: 12,
              lenderName: "Papa",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Prestamo tarjeta",
            id: "expense-1",
            loan: {
              installmentCount: 12,
              lenderName: "Papa",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
    expect(response.body).toBeUndefined();
  });

  it("passes paymentLink to the save use case when provided", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            isPaid: true,
            occurrencesPerMonth: 1,
            paymentLink: "pagos.empresa-energia.com",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            isPaid: true,
            occurrencesPerMonth: 1,
            paymentLink: "https://pagos.empresa-energia.com",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
  });

  it("passes receipt sharing metadata to the save use case when provided", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receiptShareMessage: "Hola, te comparto el comprobante",
            receiptSharePhoneDigits: "+54 9 11 2345-6789",
            receiptShareStatus: "pending",
            requiresReceiptShare: true,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receiptShareMessage: "Hola, te comparto el comprobante",
            receiptSharePhoneDigits: "5491123456789",
            receiptShareStatus: "pending",
            requiresReceiptShare: true,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
  });

  it("returns 400 when receipt sharing is enabled without a valid phone", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn(),
      save: jest.fn(),
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            requiresReceiptShare: true,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(400);
  });

  it("passes receipt coveredPayments and manualCoveredPayments to save", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Limpieza",
            id: "expense-1",
            manualCoveredPayments: 2,
            occurrencesPerMonth: 8,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 6,
                fileId: "receipt-file-id",
                fileName: "comprobante.pdf",
                fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
            ],
            subtotal: 100,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Limpieza",
            id: "expense-1",
            manualCoveredPayments: 2,
            occurrencesPerMonth: 8,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 6,
                fileId: "receipt-file-id",
                fileName: "comprobante.pdf",
                fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
            ],
            subtotal: 100,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
  });

  it("passes shared folder metadata to save even when monthly folder metadata is blank", async () => {
    const database = {} as TursoDatabase;
    const save = jest.fn().mockResolvedValue({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockReturnValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save,
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              monthlyFolderId: "",
              monthlyFolderViewUrl: "",
            },
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(save).toHaveBeenCalledWith({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              monthlyFolderId: "",
              monthlyFolderViewUrl: "",
            },
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      database,
      request,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(204);
    expect(response.ended).toBe(true);
  });

  it("returns 401 when Google authentication is missing", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn(),
      getUserSubject: jest.fn().mockRejectedValue(
        new GoogleOAuthAuthenticationError(
          "google-drive-client:getGoogleSessionTokenFromRequest requires an authenticated NextAuth session.",
        ),
      ),
      save: jest.fn(),
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 10774.53,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({
      error: "Google authentication is required before saving monthly expenses.",
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 500 when database configuration is missing", async () => {
    const handler = createMonthlyExpensesApiHandler({
      load: jest.fn(),
      getDatabase: jest.fn().mockImplementation(() => {
        throw new TursoConfigurationError(
          "turso-server-config:missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN server configuration.",
        );
      }),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      save: jest.fn().mockRejectedValue(
        new Error("unexpected"),
      ),
    });

    const request = {
      body: {
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 10774.53,
          },
        ],
        month: "2026-03",
      },
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error:
        "Database server configuration is incomplete for monthly expenses storage.",
    });
  });
});
