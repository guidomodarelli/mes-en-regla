import type { MonthlyExpensesRepository } from "../../domain/repositories/monthly-expenses-repository";
import type { MonthlyExpenseReceiptsRepository } from "../../domain/repositories/monthly-expense-receipts-repository";
import { saveMonthlyExpensesDocument } from "./save-monthly-expenses-document";

describe("saveMonthlyExpensesDocument", () => {
  it("delegates a validated monthly document with the snapshot to the repository", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn(),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: "https://drive.google.com/file/d/monthly-expenses-file-id/view",
      }),
    };

    const result = await saveMonthlyExpensesDocument({
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
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      repository,
    });

    expect(repository.save).toHaveBeenCalledWith({
      exchangeRateSnapshot: {
        blueRate: 1290,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
      },
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
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: "https://drive.google.com/file/d/monthly-expenses-file-id/view",
    });
  });

  it("renames receipt folder when an existing expense description changes", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [
          {
            currency: "ARS",
            description: "Internet viejo",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
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
      }),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn().mockResolvedValue(undefined),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    await saveMonthlyExpensesDocument({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet nuevo",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
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
          },
        ],
        month: "2026-03",
      },
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.renameExpenseFolder).toHaveBeenCalledWith({
      folderId: "receipt-folder-id",
      nextDescription: "Internet nuevo",
    });
  });

  it("does not rename receipt folders when description remains unchanged", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
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
      }),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn().mockResolvedValue(undefined),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    await saveMonthlyExpensesDocument({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
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
          },
        ],
        month: "2026-03",
      },
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.renameExpenseFolder).not.toHaveBeenCalled();
  });

  it("renames receipt folders when an item keeps only the shared folder metadata", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [
          {
            currency: "ARS",
            description: "Internet viejo",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              monthlyFolderId: "",
              monthlyFolderViewUrl: "",
            },
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [],
            subtotal: 100,
            total: 100,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn().mockResolvedValue(undefined),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    await saveMonthlyExpensesDocument({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet nuevo",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              monthlyFolderId: "",
              monthlyFolderViewUrl: "",
            },
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [],
            subtotal: 100,
          },
        ],
        month: "2026-03",
      },
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.renameExpenseFolder).toHaveBeenCalledWith({
      folderId: "receipt-folder-id",
      nextDescription: "Internet nuevo",
    });
  });

  it("renames the shared receipts folder when a monthly folder is added later", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [
          {
            currency: "ARS",
            description: "Internet viejo",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              monthlyFolderId: "",
              monthlyFolderViewUrl: "",
            },
            id: "expense-1",
            occurrencesPerMonth: 1,
            receipts: [],
            subtotal: 100,
            total: 100,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn().mockResolvedValue(undefined),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    await saveMonthlyExpensesDocument({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet nuevo",
            folders: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
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
          },
        ],
        month: "2026-03",
      },
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.renameExpenseFolder).toHaveBeenCalledWith({
      folderId: "receipt-folder-id",
      nextDescription: "Internet nuevo",
    });
  });

  it("rejects save when receipt-covered payments exceed remaining payments after manual coverage", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn(),
      listAll: jest.fn(),
      save: jest.fn(),
    };

    await expect(
      saveMonthlyExpensesDocument({
        command: {
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 8,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 4,
                  fileId: "receipt-file-id-1",
                  fileName: "comprobante-1.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-1/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-2",
                  fileName: "comprobante-2.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-2/view",
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
        getExchangeRateSnapshot: jest.fn().mockResolvedValue({
          blueRate: 1290,
          iibbRateDecimalUsed: 0.02,
          month: "2026-03",
          officialRate: 1200,
          solidarityRate: 1476,
          source: "ambito-historico-general",
          sourceDateIso: "2026-03-31",
          updatedAtIso: "2026-03-14T12:00:00.000Z",
        }),
        repository,
      }),
    ).rejects.toThrow(
      "Saving monthly expenses requires receipt coverage to be less than or equal to the remaining payments for each expense.",
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it("allows save when receipt-covered payments match remaining payments after manual coverage", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn(),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };

    await expect(
      saveMonthlyExpensesDocument({
        command: {
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 8,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-1",
                  fileName: "comprobante-1.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-1/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-2",
                  fileName: "comprobante-2.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-2/view",
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
        getExchangeRateSnapshot: jest.fn().mockResolvedValue({
          blueRate: 1290,
          iibbRateDecimalUsed: 0.02,
          month: "2026-03",
          officialRate: 1200,
          solidarityRate: 1476,
          source: "ambito-historico-general",
          sourceDateIso: "2026-03-31",
          updatedAtIso: "2026-03-14T12:00:00.000Z",
        }),
        repository,
      }),
    ).resolves.toEqual({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "gastos-mensuales-2026-marzo.json",
      viewUrl: null,
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("renames receipt file and persists updated fileName when covered payments change", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 3,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 1,
                fileId: "receipt-file-id",
                fileName: "2026-03-16 - Internet - cubre 1 pagos.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id/view",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
            ],
            subtotal: 100,
            total: 300,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: "monthly-expenses-file-id",
        month: "2026-03",
        name: "gastos-mensuales-2026-marzo.json",
        viewUrl: null,
      }),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn().mockResolvedValue(undefined),
      renameReceiptFile: jest.fn().mockResolvedValue(undefined),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    await saveMonthlyExpensesDocument({
      command: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 3,
            receipts: [
              {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                coveredPayments: 2,
                fileId: "receipt-file-id",
                fileName: "2026-03-16 - Internet - cubre 1 pagos.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id/view",
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
      getExchangeRateSnapshot: jest.fn().mockResolvedValue({
        blueRate: 1290,
        iibbRateDecimalUsed: 0.02,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
        source: "ambito-historico-general",
        sourceDateIso: "2026-03-31",
        updatedAtIso: "2026-03-14T12:00:00.000Z",
      }),
      now: new Date("2026-04-03T09:30:00.000Z"),
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.renameReceiptFile).toHaveBeenCalledWith({
      fileId: "receipt-file-id",
      nextFileName: "2026-03-16 - Internet - cubre 2 pagos.pdf",
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            receipts: [
              expect.objectContaining({
                fileName: "2026-03-16 - Internet - cubre 2 pagos.pdf",
              }),
            ],
          }),
        ],
      }),
    );
  });
});
