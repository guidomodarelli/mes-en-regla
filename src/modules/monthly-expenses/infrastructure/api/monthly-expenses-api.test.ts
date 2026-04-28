import {
  getMonthlyExpensesDocumentViaApi,
  MonthlyExpensesAuthenticationError,
  saveMonthlyExpensesDocumentViaApi,
} from "./monthly-expenses-api";

describe("monthly-expenses-api client", () => {
  it("sends x-correlation-id header on GET requests", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      json: async () => ({
        data: {
          items: [],
          month: "2026-03",
        },
      }),
      ok: true,
    });

    await getMonthlyExpensesDocumentViaApi("2026-03", fetchImplementation);

    const options = fetchImplementation.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const headers = new Headers(options?.headers);

    expect(headers.get("x-correlation-id")).toEqual(expect.any(String));
  });

  it("accepts paymentLink without protocol in POST payloads", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });

    await saveMonthlyExpensesDocumentViaApi(
      {
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
      fetchImplementation,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/storage/monthly-expenses",
      expect.objectContaining({
        body: JSON.stringify({
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
        }),
        method: "POST",
      }),
    );
  });

  it("rejects invalid paymentLink before sending POST request", async () => {
    const fetchImplementation = jest.fn();

    await expect(
      saveMonthlyExpensesDocumentViaApi(
        {
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
        fetchImplementation,
      ),
    ).rejects.toThrow();

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("accepts receipt share phone with separators and normalizes it", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });

    await saveMonthlyExpensesDocumentViaApi(
      {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receiptShareMessage: "Hola",
            receiptSharePhoneDigits: "+54 9 11 2345-6789",
            receiptShareStatus: "pending",
            requiresReceiptShare: true,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      },
      fetchImplementation,
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/storage/monthly-expenses",
      expect.objectContaining({
        body: JSON.stringify({
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptShareMessage: "Hola",
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 45,
            },
          ],
          month: "2026-03",
        }),
        method: "POST",
      }),
    );
  });

  it("rejects receipt share payload when requiresReceiptShare is true and phone is missing", async () => {
    const fetchImplementation = jest.fn();

    await expect(
      saveMonthlyExpensesDocumentViaApi(
        {
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
        fetchImplementation,
      ),
    ).rejects.toThrow();

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("returns receipt rename warnings from POST responses", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      json: async () => ({
        data: {
          receiptRenameWarnings: [
            {
              fileId: "receipt-file-id",
              nextFileName: "2026-03-16 - Fibra - cubre 1 pagos.pdf",
              previousFileName: "2026-03-16 - Internet - cubre 1 pagos.pdf",
              reasonCode: "insufficient_permissions",
            },
          ],
          renamedReceiptFilesCount: 1,
          storedDocument: {
            id: "monthly-expenses-file-id",
            month: "2026-03",
            name: "compromisos-mensuales-2026-marzo.json",
            viewUrl: null,
          },
        },
      }),
      ok: true,
      status: 200,
    });

    await expect(
      saveMonthlyExpensesDocumentViaApi(
        {
          items: [
            {
              currency: "ARS",
              description: "Fibra",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 45,
            },
          ],
          month: "2026-03",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      receiptRenameWarnings: [
        {
          fileId: "receipt-file-id",
          nextFileName: "2026-03-16 - Fibra - cubre 1 pagos.pdf",
          previousFileName: "2026-03-16 - Internet - cubre 1 pagos.pdf",
          reasonCode: "insufficient_permissions",
        },
      ],
      renamedReceiptFilesCount: 1,
      storedDocument: {
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "compromisos-mensuales-2026-marzo.json",
        viewUrl: null,
      },
    });
  });

  it("returns non-blocking exchange rate warning from POST responses", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      json: async () => ({
        data: {
          exchangeRateLoadError:
            "No pudimos cargar la cotización histórica del mes seleccionado. Igual podés seguir cargando y guardando compromisos.",
          receiptRenameWarnings: [],
          renamedReceiptFilesCount: 0,
          storedDocument: {
            id: "monthly-expenses-file-id",
            month: "2026-05",
            name: "compromisos-mensuales-2026-mayo.json",
            viewUrl: null,
          },
        },
      }),
      ok: true,
      status: 200,
    });

    await expect(
      saveMonthlyExpensesDocumentViaApi(
        {
          items: [
            {
              currency: "ARS",
              description: "Fibra",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 45,
            },
          ],
          month: "2026-05",
        },
        fetchImplementation,
      ),
    ).resolves.toEqual({
      exchangeRateLoadError:
        "No pudimos cargar la cotización histórica del mes seleccionado. Igual podés seguir cargando y guardando compromisos.",
      receiptRenameWarnings: [],
      renamedReceiptFilesCount: 0,
      storedDocument: {
        id: "monthly-expenses-file-id",
        month: "2026-05",
        name: "compromisos-mensuales-2026-mayo.json",
        viewUrl: null,
      },
    });
  });

  it("throws MonthlyExpensesAuthenticationError when POST responds with 401", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      json: async () => ({
        error: "Google authentication is required before saving monthly expenses.",
      }),
      ok: false,
      status: 401,
    });

    await expect(
      saveMonthlyExpensesDocumentViaApi(
        {
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 45,
            },
          ],
          month: "2026-03",
        },
        fetchImplementation,
      ),
    ).rejects.toBeInstanceOf(MonthlyExpensesAuthenticationError);
  });
});
