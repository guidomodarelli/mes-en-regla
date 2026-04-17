import { createEmptyMonthlyExpensesDocumentResult } from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";
import type { MonthlyExpenseItemResult } from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";

import {
  copyMonthlyExpenseTemplatesToMonth,
  getExpenseValidationMessage,
  getMaxManualCoveredPayments,
  toEditableRows,
  toSaveMonthlyExpensesCommand,
} from "./monthly-expenses-page";

describe("monthly expenses page mappers", () => {
  it("falls back to receipt monthly folder metadata when top-level folder metadata is blank", () => {
    const document = createEmptyMonthlyExpensesDocumentResult("2026-03");
    document.items = [
      {
        currency: "ARS",
        description: "Internet",
        folders: {
          allReceiptsFolderId: "receipt-folder-id",
          allReceiptsFolderViewUrl:
            "https://drive.google.com/drive/folders/receipt-folder-id",
          monthlyFolderId: undefined as unknown as string,
          monthlyFolderStatus: "missing",
          monthlyFolderViewUrl: undefined as unknown as string,
        },
        id: "expense-1",
        occurrencesPerMonth: 1,
        receipts: [
          {
            allReceiptsFolderId: "receipt-folder-id",
            allReceiptsFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-folder-id",
            coveredPayments: 1,
            fileId: "receipt-file-id",
            fileName: "comprobante.pdf",
            fileStatus: "normal",
            fileViewUrl:
              "https://drive.google.com/file/d/receipt-file-id/view",
            monthlyFolderId: "receipt-month-folder-id",
            monthlyFolderStatus: "normal",
            monthlyFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-month-folder-id",
          },
        ],
        subtotal: 100,
        total: 100,
      } as MonthlyExpenseItemResult,
    ];

    expect(toEditableRows(document)[0]).toEqual(
      expect.objectContaining({
        monthlyFolderId: "receipt-month-folder-id",
        monthlyFolderStatus: "normal",
        monthlyFolderViewUrl:
          "https://drive.google.com/drive/folders/receipt-month-folder-id",
      }),
    );
  });

  it("does not reconstruct a cleared monthly folder reference from receipt metadata", () => {
    const rows = toEditableRows({
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
          receipts: [
            {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
            },
          ],
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    });

    const command = toSaveMonthlyExpensesCommand({
      error: null,
      exchangeRateLoadError: null,
      exchangeRateSnapshot: null,
      isSubmitting: false,
      month: "2026-03",
      rows,
    });

    expect(command.items[0]).toEqual(
      expect.objectContaining({
        folders: {
          allReceiptsFolderId: "receipt-folder-id",
          allReceiptsFolderViewUrl:
            "https://drive.google.com/drive/folders/receipt-folder-id",
          monthlyFolderId: "",
          monthlyFolderViewUrl: "",
        },
      }),
    );
  });

  it("does not reconstruct a cleared shared receipts folder reference from receipt metadata", () => {
    const rows = toEditableRows({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          folders: {
            allReceiptsFolderId: "",
            allReceiptsFolderViewUrl: "",
            monthlyFolderId: "receipt-month-folder-id",
            monthlyFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-month-folder-id",
          },
          id: "expense-1",
          occurrencesPerMonth: 1,
          receipts: [
            {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
            },
          ],
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    });

    const command = toSaveMonthlyExpensesCommand({
      error: null,
      exchangeRateLoadError: null,
      exchangeRateSnapshot: null,
      isSubmitting: false,
      month: "2026-03",
      rows,
    });

    expect(command.items[0]?.folders).toBeUndefined();
  });

  it("does not copy loans that are no longer active in the destination month", () => {
    const sourceDocument = createEmptyMonthlyExpensesDocumentResult("2026-03");
    sourceDocument.items = [
      {
        currency: "ARS",
        description: "Prestamo",
        id: "expense-1",
        loan: {
          endMonth: "2026-04",
          installmentCount: 2,
          paidInstallments: 1,
          startMonth: "2026-03",
        },
        occurrencesPerMonth: 1,
        receipts: [],
        subtotal: 100,
        total: 100,
      },
    ];

    const copiedRows = copyMonthlyExpenseTemplatesToMonth(
      "2026-04",
      toEditableRows(sourceDocument),
    );

    expect(copiedRows).toHaveLength(0);
  });

  it("synchronizes payment records from legacy manual coverage before saving", () => {
    const rows = toEditableRows({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          manualCoveredPayments: 1,
          occurrencesPerMonth: 4,
          paymentRecords: [
            {
              coveredPayments: 1,
              id: "receipt-record-1",
              receipt: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 1,
                fileId: "receipt-file-id",
                fileName: "comprobante.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id/view",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
              registeredAt: "2026-03-10T10:00:00.000Z",
            },
            {
              coveredPayments: 1,
              id: "manual-record-1",
              registeredAt: "2026-03-11T10:00:00.000Z",
            },
          ],
          receipts: [
            {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
            },
          ],
          subtotal: 100,
          total: 400,
        },
      ],
      month: "2026-03",
    });

    const command = toSaveMonthlyExpensesCommand({
      error: null,
      exchangeRateLoadError: null,
      exchangeRateSnapshot: null,
      isSubmitting: false,
      month: "2026-03",
      rows: [
        {
          ...rows[0],
          manualCoveredPayments: "3",
        },
      ],
    });

    expect(command.items[0]?.paymentRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coveredPayments: 3,
          id: "manual-record-1",
          registeredAt: "2026-03-11T10:00:00.000Z",
        }),
        expect.objectContaining({
          coveredPayments: 1,
          id: "receipt-record-1",
          registeredAt: "2026-03-10T10:00:00.000Z",
        }),
      ]),
    );
  });

  it("preserves multiple manual payment records before saving", () => {
    const rows = toEditableRows({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          manualCoveredPayments: 3,
          occurrencesPerMonth: 4,
          paymentRecords: [
            {
              coveredPayments: 1,
              id: "receipt-record-1",
              receipt: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 1,
                fileId: "receipt-file-id",
                fileName: "comprobante.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id/view",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
              registeredAt: "2026-03-10T10:00:00.000Z",
            },
            {
              coveredPayments: 1,
              id: "manual-record-1",
              registeredAt: "2026-03-11T10:00:00.000Z",
            },
            {
              coveredPayments: 2,
              id: "manual-record-2",
              registeredAt: "2026-03-12T10:00:00.000Z",
            },
          ],
          receipts: [
            {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
            },
          ],
          subtotal: 100,
          total: 400,
        },
      ],
      month: "2026-03",
    });

    const command = toSaveMonthlyExpensesCommand({
      error: null,
      exchangeRateLoadError: null,
      exchangeRateSnapshot: null,
      isSubmitting: false,
      month: "2026-03",
      rows: [
        {
          ...rows[0],
          description: "Internet actualizado",
        },
      ],
    });

    expect(command.items[0]?.paymentRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coveredPayments: 1,
          id: "manual-record-1",
          registeredAt: "2026-03-11T10:00:00.000Z",
        }),
        expect.objectContaining({
          coveredPayments: 2,
          id: "manual-record-2",
          registeredAt: "2026-03-12T10:00:00.000Z",
        }),
        expect.objectContaining({
          coveredPayments: 1,
          id: "receipt-record-1",
          registeredAt: "2026-03-10T10:00:00.000Z",
        }),
      ]),
    );
  });

  it("uses legacy manual coverage when payment records are empty", () => {
    const maxManualCoveredPayments = getMaxManualCoveredPayments({
      row: {
        manualCoveredPayments: "2",
        occurrencesPerMonth: "5",
        paymentRecords: [],
        receipts: [
          {
            allReceiptsFolderId: "receipt-folder-id",
            allReceiptsFolderStatus: undefined,
            allReceiptsFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-folder-id",
            coveredPayments: 1,
            fileId: "receipt-file-id",
            fileName: "comprobante.pdf",
            fileStatus: undefined,
            fileViewUrl:
              "https://drive.google.com/file/d/receipt-file-id/view",
            monthlyFolderId: "receipt-month-folder-id",
            monthlyFolderStatus: undefined,
            monthlyFolderViewUrl:
              "https://drive.google.com/drive/folders/receipt-month-folder-id",
          },
        ],
      },
    });

    expect(maxManualCoveredPayments).toBe(2);
  });

  it("requires a valid receipt share phone when creating an expense", () => {
    const editableRow = toEditableRows({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          occurrencesPerMonth: 1,
          receiptSharePhoneDigits: "",
          requiresReceiptShare: true,
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    })[0];

    expect(getExpenseValidationMessage("2026-03", editableRow, "create")).toBe(
      "Corregí los errores antes de continuar.",
    );
  });

  it("does not block edit mode for legacy invalid receipt share phone values", () => {
    const editableRow = toEditableRows({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          occurrencesPerMonth: 1,
          receiptSharePhoneDigits: "",
          requiresReceiptShare: true,
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    })[0];

    expect(getExpenseValidationMessage("2026-03", editableRow, "edit")).toBeNull();
  });
});
