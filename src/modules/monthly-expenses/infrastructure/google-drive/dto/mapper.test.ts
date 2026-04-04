import {
  createMonthlyExpensesFileName,
  mapGoogleDriveMonthlyExpensesFileDtoToStoredDocument,
  mapMonthlyExpensesDocumentToGoogleDriveFile,
  parseGoogleDriveMonthlyExpensesContent,
} from "./mapper";

describe("monthlyExpensesGoogleDriveMapper", () => {
  it("serializes the monthly document into a Drive JSON file", () => {
    const result = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Expensas",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 55032.07,
          total: 55032.07,
        },
      ],
      month: "2026-03",
    });

    expect(result).toEqual({
      content: JSON.stringify(
        {
          items: [
            {
              currency: "ARS",
              description: "Expensas",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              subtotal: 55032.07,
            },
          ],
          month: "2026-03",
        },
        null,
        2,
      ),
      mimeType: "application/json",
      name: "gastos-mensuales-2026-marzo.json",
    });
    expect(createMonthlyExpensesFileName("2026-03")).toBe(
      "gastos-mensuales-2026-marzo.json",
    );
  });

  it("serializes loan metadata without derived fields", () => {
    const result = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Prestamo familiar",
          id: "expense-1",
          loan: {
            endMonth: "2026-12",
            installmentCount: 12,
            lenderName: "Papa",
            paidInstallments: 3,
            startMonth: "2026-01",
          },
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 50000,
          total: 50000,
        },
      ],
      month: "2026-03",
    });

    expect(result.content).toBe(
      JSON.stringify(
        {
          items: [
            {
              currency: "ARS",
              description: "Prestamo familiar",
              id: "expense-1",
              loan: {
                installmentCount: 12,
                lenderName: "Papa",
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              paymentLink: null,
              subtotal: 50000,
            },
          ],
          month: "2026-03",
        },
        null,
        2,
      ),
    );
  });

  it("parses stored Drive content into the internal monthly document", () => {
    const result = parseGoogleDriveMonthlyExpensesContent(
      JSON.stringify({
        items: [
          {
            currency: "USD",
            description: "Google One",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 2.49,
          },
        ],
        month: "2026-03",
      }),
      "Loading monthly expenses",
    );

    expect(result).toEqual({
      items: [
        {
          currency: "USD",
          description: "Google One",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 2.49,
          total: 2.49,
        },
      ],
      month: "2026-03",
    });
  });

  it("parses stored loan metadata and derives the payment progress", () => {
    const result = parseGoogleDriveMonthlyExpensesContent(
      JSON.stringify({
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
      }),
      "Loading monthly expenses",
    );

    expect(result).toEqual({
      items: [
        {
          currency: "ARS",
          description: "Prestamo tarjeta",
          id: "expense-1",
          loan: {
            endMonth: "2026-12",
            installmentCount: 12,
            lenderName: "Papa",
            paidInstallments: 3,
            startMonth: "2026-01",
          },
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 50000,
          total: 50000,
        },
      ],
      month: "2026-03",
    });
  });

  it("maps file metadata into the stored document result", () => {
    expect(
      mapGoogleDriveMonthlyExpensesFileDtoToStoredDocument(
        {
          id: "monthly-expenses-file-id",
          name: "gastos-mensuales-2026-marzo.json",
          webViewLink:
            "https://drive.google.com/file/d/monthly-expenses-file-id/view",
        },
        "2026-03",
      ),
    ).toEqual({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: "https://drive.google.com/file/d/monthly-expenses-file-id/view",
    });
  });

  it("serializes and parses paymentLink when provided", () => {
    const serialized = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Electricidad",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: "pagos.empresa-energia.com",
          receipts: [],
          subtotal: 45,
          total: 45,
        },
      ],
      month: "2026-03",
    });

    expect(serialized.content).toContain(
      '"paymentLink": "pagos.empresa-energia.com"',
    );

    const parsed = parseGoogleDriveMonthlyExpensesContent(
      serialized.content,
      "Loading monthly expenses",
    );

    expect(parsed.items[0]?.paymentLink).toBe("https://pagos.empresa-energia.com");
  });

  it("serializes and parses isPaid when enabled", () => {
    const serialized = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          isPaid: true,
          manualCoveredPayments: 1,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    });

    expect(serialized.content).toContain('"isPaid": true');

    const parsed = parseGoogleDriveMonthlyExpensesContent(
      serialized.content,
      "Loading monthly expenses",
    );

    expect(parsed.items[0]?.isPaid).toBe(true);
  });

  it("throws when parsing an invalid paymentLink", () => {
    expect(() =>
      parseGoogleDriveMonthlyExpensesContent(
        JSON.stringify({
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
        }),
        "Loading monthly expenses",
      ),
    ).toThrow("Loading monthly expenses could not parse the stored monthly expenses document.");
  });

  it("serializes and parses receipt sharing metadata", () => {
    const serialized = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          receiptShareMessage: "Hola",
          receiptSharePhoneDigits: "5491123456789",
          receiptShareStatus: "pending",
          requiresReceiptShare: true,
          paymentLink: null,
          receipts: [],
          subtotal: 45,
          total: 45,
        },
      ],
      month: "2026-03",
    });

    expect(serialized.content).toContain('"requiresReceiptShare": true');
    expect(serialized.content).toContain('"receiptSharePhoneDigits": "5491123456789"');

    const parsed = parseGoogleDriveMonthlyExpensesContent(
      serialized.content,
      "Loading monthly expenses",
    );

    expect(parsed.items[0]?.requiresReceiptShare).toBe(true);
    expect(parsed.items[0]?.receiptSharePhoneDigits).toBe("5491123456789");
    expect(parsed.items[0]?.receiptShareStatus).toBe("pending");
  });

  it("throws when parsing an invalid receiptSharePhoneDigits", () => {
    expect(() =>
      parseGoogleDriveMonthlyExpensesContent(
        JSON.stringify({
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptSharePhoneDigits: "123",
              requiresReceiptShare: true,
              subtotal: 45,
            },
          ],
          month: "2026-03",
        }),
        "Loading monthly expenses",
      ),
    ).toThrow("Loading monthly expenses could not parse the stored monthly expenses document.");
  });

  it("parses legacy singular receipt payloads into receipts array", () => {
    const result = parseGoogleDriveMonthlyExpensesContent(
      JSON.stringify({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipt: {
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
              folderId: "receipt-folder-id",
              folderViewUrl: "https://drive.google.com/drive/folders/receipt-folder-id",
            },
            subtotal: 100,
          },
        ],
        month: "2026-03",
      }),
      "Loading monthly expenses",
    );

    expect(result.items[0]?.receipts).toEqual([
      {
        allReceiptsFolderId: "receipt-folder-id",
        allReceiptsFolderViewUrl:
          "https://drive.google.com/drive/folders/receipt-folder-id",
        coveredPayments: 1,
        fileId: "receipt-file-id",
        fileName: "comprobante.pdf",
        fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
        monthlyFolderId: "receipt-folder-id",
        monthlyFolderViewUrl:
          "https://drive.google.com/drive/folders/receipt-folder-id",
      },
    ]);
  });

  it("serializes and parses folder metadata at item level without receipts", () => {
    const serialized = mapMonthlyExpensesDocumentToGoogleDriveFile({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          folders: {
            allReceiptsFolderId: "receipt-folder-id",
            allReceiptsFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-folder-id",
            monthlyFolderId: "receipt-month-folder-id",
            monthlyFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-month-folder-id",
          },
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          paymentLink: null,
          receipts: [],
          subtotal: 45,
          total: 45,
        },
      ],
      month: "2026-03",
    });

    const parsed = parseGoogleDriveMonthlyExpensesContent(
      serialized.content,
      "Loading monthly expenses",
    );

    expect(parsed.items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "receipt-month-folder-id",
      monthlyFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-month-folder-id",
    });
    expect(parsed.items[0]?.receipts).toEqual([]);
  });

  it("parses shared folder metadata when the monthly folder reference is blank", () => {
    const result = parseGoogleDriveMonthlyExpensesContent(
      JSON.stringify({
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
      }),
      "Loading monthly expenses",
    );

    expect(result.items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "",
      monthlyFolderViewUrl: "",
    });
    expect(result.items[0]?.receipts).toEqual([]);
  });
});
