import { createEmptyMonthlyExpensesDocumentResult } from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";
import type { MonthlyExpenseItemResult } from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";

import {
  copyMonthlyExpenseTemplatesToMonth,
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
});
