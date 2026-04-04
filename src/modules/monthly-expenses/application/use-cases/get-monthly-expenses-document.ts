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
  receiptsRepository,
}: {
  document: ReturnType<typeof createMonthlyExpensesDocument>;
  receiptsRepository?: MonthlyExpenseReceiptsRepository;
}) {
  if (!receiptsRepository) {
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
  receiptsRepository,
}: {
  document: ReturnType<typeof createMonthlyExpensesDocument>;
  receiptsRepository?: MonthlyExpenseReceiptsRepository;
}) {
  if (!receiptsRepository) {
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
          receiptsRepository,
        }),
        await verifyFolderStatusesByItemId({
          document: emptyDocument,
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
          receiptsRepository,
        }),
        await verifyFolderStatusesByItemId({
          document: storedDocument,
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
        receiptsRepository,
      }),
      await verifyFolderStatusesByItemId({
        document: enrichedDocument,
        receiptsRepository,
      }),
    );
  } catch {
    const fallbackDocument =
      storedDocument ?? createEmptyMonthlyExpensesDocument(query.month);

    return toMonthlyExpensesDocumentResult(
      fallbackDocument,
      "No pudimos cargar la cotización histórica del mes seleccionado.",
      await verifyReceiptStatusesByFileId({
        document: fallbackDocument,
        receiptsRepository,
      }),
      await verifyFolderStatusesByItemId({
        document: fallbackDocument,
        receiptsRepository,
      }),
    );
  }
}
