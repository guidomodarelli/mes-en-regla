import type { MonthlyExpensesRepository } from "../../domain/repositories/monthly-expenses-repository";
import type {
  MonthlyExpenseReceiptsRepository,
} from "../../domain/repositories/monthly-expense-receipts-repository";
import {
  createEmptyMonthlyExpensesDocument,
  createMonthlyExpensesDocument,
  toMonthlyExpensesDocumentInput,
} from "../../domain/value-objects/monthly-expenses-document";
import type { GetMonthlyExpensesDocumentQuery } from "../queries/get-monthly-expenses-document-query";
import {
  toMonthlyExpensesDocumentResult,
  type MonthlyExpensesDocumentResult,
} from "../results/monthly-expenses-document-result";
import type { MonthlyExchangeRateSnapshot } from "@/modules/exchange-rates/domain/entities/monthly-exchange-rate-snapshot";
import {
  MissingMonthlyExchangeRateError,
} from "@/modules/exchange-rates/domain/errors/missing-monthly-exchange-rate-error";

const MONTHLY_EXCHANGE_RATE_FALLBACK_MESSAGE =
  "No pudimos cargar la cotización histórica del mes seleccionado. Igual podés seguir cargando y guardando compromisos.";

interface GetMonthlyExpensesDocumentDependencies {
  getExchangeRateSnapshot: (
    month: string,
  ) => Promise<MonthlyExchangeRateSnapshot>;
  query: GetMonthlyExpensesDocumentQuery;
  receiptsRepository?: MonthlyExpenseReceiptsRepository;
  repository: MonthlyExpensesRepository;
}

function getPreferredFolderId(
  primaryFolderId: string | undefined,
  fallbackFolderId: string | undefined,
): string | undefined {
  if (primaryFolderId !== undefined) {
    return primaryFolderId;
  }

  return fallbackFolderId;
}

async function verifyReceiptStatusesByFileId({
  document,
  includeDriveStatuses,
  receiptsRepository,
}: {
  document: ReturnType<typeof createMonthlyExpensesDocument>;
  includeDriveStatuses: boolean;
  receiptsRepository?: MonthlyExpenseReceiptsRepository;
}) {
  if (!includeDriveStatuses || !receiptsRepository) {
    return {};
  }

  const statusesByFileId: Record<
    string,
    {
      allReceiptsFolderStatus: "normal" | "trashed" | "missing";
      fileStatus: "normal" | "trashed" | "missing";
      monthlyFolderStatus?: "normal" | "trashed" | "missing";
    }
  > = {};

  for (const item of document.items) {
    for (const receipt of item.receipts) {
      try {
        statusesByFileId[receipt.fileId] = await receiptsRepository.verifyReceipt({
          allReceiptsFolderId: receipt.allReceiptsFolderId,
          fileId: receipt.fileId,
          monthlyFolderId: receipt.monthlyFolderId,
        });
      } catch {
        // Keep document loading resilient even if Drive status verification fails.
      }
    }
  }

  return statusesByFileId;
}

async function verifyFolderStatusesByItemId({
  document,
  includeDriveStatuses,
  receiptsRepository,
}: {
  document: ReturnType<typeof createMonthlyExpensesDocument>;
  includeDriveStatuses: boolean;
  receiptsRepository?: MonthlyExpenseReceiptsRepository;
}) {
  if (!includeDriveStatuses || !receiptsRepository) {
    return {};
  }

  const statusesByItemId: Record<
    string,
    {
      allReceiptsFolderStatus: "normal" | "trashed" | "missing";
      monthlyFolderStatus?: "normal" | "trashed" | "missing";
    }
  > = {};

  for (const item of document.items) {
    const allReceiptsFolderId = getPreferredFolderId(
      item.folders?.allReceiptsFolderId,
      item.receipts[0]?.allReceiptsFolderId,
    );
    const monthlyFolderId = getPreferredFolderId(
      item.folders?.monthlyFolderId,
      item.receipts[0]?.monthlyFolderId,
    );

    if (!allReceiptsFolderId) {
      continue;
    }

    try {
      statusesByItemId[item.id] = await receiptsRepository.verifyFolders({
        allReceiptsFolderId,
        monthlyFolderId: monthlyFolderId ?? "",
      });
    } catch {
      // Keep document loading resilient even if Drive status verification fails.
    }
  }

  return statusesByItemId;
}

export async function getMonthlyExpensesDocument({
  getExchangeRateSnapshot,
  query,
  receiptsRepository,
  repository,
}: GetMonthlyExpensesDocumentDependencies): Promise<MonthlyExpensesDocumentResult> {
  const includeDriveStatuses = query.includeDriveStatuses !== false;
  const storedDocument = await repository.getByMonth(query.month);

  try {
    const exchangeRateSnapshot = await getExchangeRateSnapshot(query.month);

    if (!storedDocument) {
      const emptyDocument = createMonthlyExpensesDocument(
        {
          exchangeRateSnapshot: {
            blueRate: exchangeRateSnapshot.blueRate,
            month: exchangeRateSnapshot.month,
            officialRate: exchangeRateSnapshot.officialRate,
            solidarityRate: exchangeRateSnapshot.solidarityRate,
          },
          items: [],
          month: query.month,
        },
        "Loading monthly expenses",
      );

      return toMonthlyExpensesDocumentResult(
        emptyDocument,
        null,
        await verifyReceiptStatusesByFileId({
          document: emptyDocument,
          includeDriveStatuses,
          receiptsRepository,
        }),
        await verifyFolderStatusesByItemId({
          document: emptyDocument,
          includeDriveStatuses,
          receiptsRepository,
        }),
      );
    }

    if (storedDocument.exchangeRateSnapshot) {
      return toMonthlyExpensesDocumentResult(
        storedDocument,
        null,
        await verifyReceiptStatusesByFileId({
          document: storedDocument,
          includeDriveStatuses,
          receiptsRepository,
        }),
        await verifyFolderStatusesByItemId({
          document: storedDocument,
          includeDriveStatuses,
          receiptsRepository,
        }),
      );
    }

    const enrichedDocument = createMonthlyExpensesDocument(
      {
        ...toMonthlyExpensesDocumentInput(storedDocument),
        exchangeRateSnapshot: {
          blueRate: exchangeRateSnapshot.blueRate,
          month: exchangeRateSnapshot.month,
          officialRate: exchangeRateSnapshot.officialRate,
          solidarityRate: exchangeRateSnapshot.solidarityRate,
        },
      },
      "Loading monthly expenses",
    );

    await repository.save(enrichedDocument);

    return toMonthlyExpensesDocumentResult(
      enrichedDocument,
      null,
      await verifyReceiptStatusesByFileId({
        document: enrichedDocument,
        includeDriveStatuses,
        receiptsRepository,
      }),
      await verifyFolderStatusesByItemId({
        document: enrichedDocument,
        includeDriveStatuses,
        receiptsRepository,
      }),
    );
  } catch (error) {
    const fallbackDocument =
      storedDocument ?? createEmptyMonthlyExpensesDocument(query.month);
    const exchangeRateLoadError =
      error instanceof MissingMonthlyExchangeRateError
        ? MONTHLY_EXCHANGE_RATE_FALLBACK_MESSAGE
        : "No pudimos cargar la cotización histórica del mes seleccionado.";

    return toMonthlyExpensesDocumentResult(
      fallbackDocument,
      exchangeRateLoadError,
      await verifyReceiptStatusesByFileId({
        document: fallbackDocument,
        includeDriveStatuses,
        receiptsRepository,
      }),
      await verifyFolderStatusesByItemId({
        document: fallbackDocument,
        includeDriveStatuses,
        receiptsRepository,
      }),
    );
  }
}
