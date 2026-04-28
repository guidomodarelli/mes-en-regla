import type { MonthlyExpensesRepository } from "../../domain/repositories/monthly-expenses-repository";
import type { MonthlyExpenseReceiptsRepository } from "../../domain/repositories/monthly-expense-receipts-repository";
import { getMonthlyExpensesDocument } from "./get-monthly-expenses-document";
import {
  MissingMonthlyExchangeRateError,
} from "@/modules/exchange-rates/domain/errors/missing-monthly-exchange-rate-error";

const getExchangeRateSnapshot = jest.fn().mockResolvedValue({
  blueRate: 1290,
  iibbRateDecimalUsed: 0.02,
  month: "2026-03",
  officialRate: 1200,
  solidarityRate: 1476,
  source: "ambito-historico-general",
  sourceDateIso: "2026-03-31",
  updatedAtIso: "2026-03-14T12:00:00.000Z",
});

describe("getMonthlyExpensesDocument", () => {
  beforeEach(() => {
    getExchangeRateSnapshot.mockClear();
  });

  it("returns an empty monthly document with the selected month snapshot when there is no stored file", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue(null),
      listAll: jest.fn(),
      save: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      repository,
    });

    expect(result).toEqual({
      exchangeRateLoadError: null,
      exchangeRateSnapshot: {
        blueRate: 1290,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
      },
      items: [],
      month: "2026-03",
    });
  });

  it("backfills a stored document when the snapshot is missing", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
        items: [],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      repository,
    });

    expect(result).toEqual({
      exchangeRateLoadError: null,
      exchangeRateSnapshot: {
        blueRate: 1290,
        month: "2026-03",
        officialRate: 1200,
        solidarityRate: 1476,
      },
      items: [],
      month: "2026-03",
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("verifies folder status for items without receipts and exposes warning/error states", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
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
            occurrencesPerMonth: 1,
            receipts: [],
            subtotal: 100,
            total: 100,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn().mockResolvedValue({
        allReceiptsFolderStatus: "missing",
        monthlyFolderStatus: "trashed",
      }),
      verifyReceipt: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.verifyFolders).toHaveBeenCalledWith({
      allReceiptsFolderId: "receipt-folder-id",
      monthlyFolderId: "receipt-month-folder-id",
    });
    expect(result.items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderStatus: "missing",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "receipt-month-folder-id",
      monthlyFolderStatus: "trashed",
      monthlyFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-month-folder-id",
    });
  });

  it("skips Drive verification when includeDriveStatuses is false", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
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
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn(),
      verifyReceipt: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        includeDriveStatuses: false,
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.verifyReceipt).not.toHaveBeenCalled();
    expect(receiptsRepository.verifyFolders).not.toHaveBeenCalled();
    expect(result.items[0]?.receipts?.[0]).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      coveredPayments: 1,
      fileId: "receipt-file-id",
      fileName: "comprobante.pdf",
      fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
      monthlyFolderId: "receipt-month-folder-id",
      monthlyFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-month-folder-id",
    });
  });

  it("verifies receipt Drive statuses sequentially to avoid request bursts", async () => {
    let activeVerifications = 0;
    let peakConcurrentVerifications = 0;

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
                allReceiptsFolderId: "receipt-folder-id-1",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id-1",
                fileId: "receipt-file-id-1",
                fileName: "comprobante-1.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id-1/view",
                monthlyFolderId: "receipt-month-folder-id-1",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id-1",
              },
              {
                allReceiptsFolderId: "receipt-folder-id-2",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id-2",
                fileId: "receipt-file-id-2",
                fileName: "comprobante-2.pdf",
                fileViewUrl:
                  "https://drive.google.com/file/d/receipt-file-id-2/view",
                monthlyFolderId: "receipt-month-folder-id-2",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id-2",
              },
            ],
            subtotal: 100,
            total: 100,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn().mockResolvedValue({
        allReceiptsFolderStatus: "normal",
        monthlyFolderStatus: "normal",
      }),
      verifyReceipt: jest.fn().mockImplementation(async () => {
        activeVerifications += 1;
        peakConcurrentVerifications = Math.max(
          peakConcurrentVerifications,
          activeVerifications,
        );

        await new Promise((resolve) => setTimeout(resolve, 0));

        activeVerifications -= 1;

        return {
          allReceiptsFolderStatus: "normal",
          fileStatus: "normal",
          monthlyFolderStatus: "normal",
        };
      }),
    };

    await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(peakConcurrentVerifications).toBe(1);
  });

  it("verifies the shared receipts folder even when the monthly folder reference is empty", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
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
            receipts: [],
            subtotal: 100,
            total: 100,
          },
        ],
        month: "2026-03",
      }),
      listAll: jest.fn(),
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn().mockResolvedValue({
        allReceiptsFolderStatus: "missing",
      }),
      verifyReceipt: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.verifyFolders).toHaveBeenCalledWith({
      allReceiptsFolderId: "receipt-folder-id",
      monthlyFolderId: "",
    });
    expect(result.items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderStatus: "missing",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "",
      monthlyFolderViewUrl: "",
    });
  });

  it("preserves an explicitly cleared monthly folder id instead of falling back to receipt metadata", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue({
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
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn().mockResolvedValue({
        allReceiptsFolderStatus: "normal",
        monthlyFolderStatus: "missing",
      }),
      verifyReceipt: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.verifyFolders).toHaveBeenCalledWith({
      allReceiptsFolderId: "receipt-folder-id",
      monthlyFolderId: "",
    });
    expect(result.items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderStatus: "normal",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "",
      monthlyFolderStatus: "missing",
      monthlyFolderViewUrl: "",
    });
  });

  it("falls back to receipt folder metadata only when top-level folder metadata is absent", async () => {
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
      save: jest.fn(),
    };
    const receiptsRepository: MonthlyExpenseReceiptsRepository = {
      deleteReceipt: jest.fn(),
      renameExpenseFolder: jest.fn(),
      renameReceiptFile: jest.fn(),
      saveReceipt: jest.fn(),
      verifyFolders: jest.fn().mockResolvedValue({
        allReceiptsFolderStatus: "normal",
        monthlyFolderStatus: "missing",
      }),
      verifyReceipt: jest.fn(),
    };

    await getMonthlyExpensesDocument({
      getExchangeRateSnapshot,
      query: {
        month: "2026-03",
      },
      receiptsRepository,
      repository,
    });

    expect(receiptsRepository.verifyFolders).toHaveBeenCalledWith({
      allReceiptsFolderId: "receipt-folder-id",
      monthlyFolderId: "receipt-month-folder-id",
    });
  });

  it("returns a non-blocking exchange rate warning when the selected month has no historical rates", async () => {
    const repository: MonthlyExpensesRepository = {
      getByMonth: jest.fn().mockResolvedValue(null),
      listAll: jest.fn(),
      save: jest.fn(),
    };

    const result = await getMonthlyExpensesDocument({
      getExchangeRateSnapshot: jest
        .fn()
        .mockRejectedValue(new MissingMonthlyExchangeRateError("2026-05")),
      query: {
        month: "2026-05",
      },
      repository,
    });

    expect(result).toEqual({
      exchangeRateLoadError:
        "No pudimos cargar la cotización histórica del mes seleccionado. Igual podés seguir cargando y guardando compromisos.",
      exchangeRateSnapshot: null,
      items: [],
      month: "2026-05",
    });
  });
});
