import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import Image from "next/image";

import { FinanceAppShell } from "@/components/finance-app-shell/finance-app-shell";
import { ReceiptFileUploader } from "@/components/monthly-expenses/receipt-file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TypingAnimation } from "@/components/ui/typing-animation";
import type { SaveMonthlyExpensesCommand } from "@/modules/monthly-expenses/application/commands/save-monthly-expenses-command";
import {
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import type {
  MonthlyExpenseItemResult,
  MonthlyExpensesDocumentResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";
import {
  getMonthlyExpensesDocumentViaApi,
  MonthlyExpensesAuthenticationError,
  saveMonthlyExpensesDocumentViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-api";
import {
  uploadMonthlyExpenseReceiptViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-receipts-api";
import {
  clearSharedReceiptPayload,
  consumeSharedReceiptPayload,
  readSharedReceiptPayload,
  type SharedReceiptPayload,
} from "@/modules/monthly-expenses/infrastructure/pwa/shared-receipt-payload";

import {
  deriveExpenseSearchQueryFromFileName,
  getCurrentMonthIdentifier,
  getRemainingReceiptPayments,
  suggestExpenseIdForSharedReceipt,
} from "./receipt-share-target-page-helpers";
import {
  buildPayloadFromFile,
  isIosShareTargetUnsupported,
} from "./receipt-share-target-support";
import { createMonthlyExpenseId } from "../utils/monthly-expenses-id";
import styles from "./receipt-share-target-page.module.scss";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SHARE_ERROR_MESSAGES: Record<string, string> = {
  "empty-payload": "No pudimos recuperar el contenido del comprobante compartido.",
  "invalid-payload": "No pudimos procesar el comprobante compartido.",
  "invalid-size": "El comprobante debe pesar entre 1 byte y 5 MB.",
  "missing-file": "No recibimos un archivo al compartir con Mes en regla.",
  "unsupported-type": "Solo se admiten comprobantes PDF, JPG, PNG, WEBP, HEIC o HEIF.",
};
const MANUAL_RECEIPT_INVALID_TYPE_ERROR = SHARE_ERROR_MESSAGES["unsupported-type"];
const MANUAL_RECEIPT_INVALID_SIZE_ERROR = SHARE_ERROR_MESSAGES["invalid-size"];

type MonthlyExpenseCurrency = "ARS" | "USD";

type CoverageMode = "full" | "partial";

type LoadSharedReceiptState =
  | { status: "empty" }
  | { payload: SharedReceiptPayload; status: "ready" }
  | { message: string; status: "error" };

function createExpenseId(): string {
  return createMonthlyExpenseId();
}

function getCoveredPaymentsByReceipts(item: MonthlyExpenseItemResult): number {
  return item.receipts?.reduce(
    (total, receipt) => total + (receipt.coveredPayments ?? 1),
    0,
  ) ?? 0;
}

function normalizeMonth(value: string): string {
  const normalizedMonth = value.trim();

  return MONTH_PATTERN.test(normalizedMonth)
    ? normalizedMonth
    : getCurrentMonthIdentifier();
}

function normalizeExpenseItemsForSave(
  items: MonthlyExpensesDocumentResult["items"],
): SaveMonthlyExpensesCommand["items"] {
  return items.map((item) => ({
    currency: item.currency,
    description: item.description,
    ...(item.folders
      ? {
          folders: {
            allReceiptsFolderId: item.folders.allReceiptsFolderId,
            allReceiptsFolderViewUrl: item.folders.allReceiptsFolderViewUrl,
            monthlyFolderId: item.folders.monthlyFolderId,
            monthlyFolderViewUrl: item.folders.monthlyFolderViewUrl,
          },
        }
      : {}),
    id: item.id,
    ...(typeof item.isPaid === "boolean"
      ? {
          isPaid: item.isPaid,
        }
      : {}),
    ...(item.loan
      ? {
          loan: {
            direction: item.loan.direction ?? "payable",
            installmentCount: item.loan.installmentCount,
            ...(item.loan.lenderId ? { lenderId: item.loan.lenderId } : {}),
            ...(item.loan.lenderName ? { lenderName: item.loan.lenderName } : {}),
            startMonth: item.loan.startMonth,
          },
        }
      : {}),
    ...(typeof item.manualCoveredPayments === "number"
      ? {
          manualCoveredPayments: item.manualCoveredPayments,
        }
      : {}),
    occurrencesPerMonth: item.occurrencesPerMonth,
    ...(typeof item.paymentLink !== "undefined"
      ? {
          paymentLink: item.paymentLink,
        }
      : {}),
    ...(typeof item.receiptShareMessage !== "undefined"
      ? {
          receiptShareMessage: item.receiptShareMessage,
        }
      : {}),
    ...(typeof item.receiptSharePhoneDigits !== "undefined"
      ? {
          receiptSharePhoneDigits: item.receiptSharePhoneDigits,
        }
      : {}),
    ...(typeof item.receiptShareStatus !== "undefined"
      ? {
          receiptShareStatus: item.receiptShareStatus,
        }
      : {}),
    ...(typeof item.requiresReceiptShare === "boolean"
      ? {
          requiresReceiptShare: item.requiresReceiptShare,
        }
      : {}),
    ...(item.receipts
      ? {
          receipts: item.receipts.map((receipt) => ({
            allReceiptsFolderId: receipt.allReceiptsFolderId,
            allReceiptsFolderViewUrl: receipt.allReceiptsFolderViewUrl,
            ...(typeof receipt.coveredPayments === "number"
              ? {
                  coveredPayments: receipt.coveredPayments,
                }
              : {}),
            fileId: receipt.fileId,
            fileName: receipt.fileName,
            fileViewUrl: receipt.fileViewUrl,
            monthlyFolderId: receipt.monthlyFolderId,
            monthlyFolderViewUrl: receipt.monthlyFolderViewUrl,
          })),
        }
      : {}),
    subtotal: item.subtotal,
  }));
}

export default function ReceiptShareTargetPage() {
  const router = useRouter();
  const { status } = useSession();
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthIdentifier());
  const [loadSharedReceiptState, setLoadSharedReceiptState] =
    useState<LoadSharedReceiptState>({ status: "empty" });
  const [monthDocument, setMonthDocument] =
    useState<MonthlyExpensesDocumentResult | null>(null);
  const [isLoadingMonthDocument, setIsLoadingMonthDocument] = useState(false);
  const [documentLoadError, setDocumentLoadError] = useState<string | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState("");
  const [isCreatingExpense, setIsCreatingExpense] = useState(false);
  const [newExpenseDescription, setNewExpenseDescription] = useState("");
  const [newExpenseCurrency, setNewExpenseCurrency] =
    useState<MonthlyExpenseCurrency>("ARS");
  const [newExpenseSubtotal, setNewExpenseSubtotal] = useState("1");
  const [newExpenseOccurrences, setNewExpenseOccurrences] = useState("1");
  const [coverageMode, setCoverageMode] = useState<CoverageMode>("full");
  const [partialCoveredPayments, setPartialCoveredPayments] = useState("1");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  const sharedReceiptPayload =
    loadSharedReceiptState.status === "ready"
      ? loadSharedReceiptState.payload
      : null;
  const isAuthenticated = status === "authenticated";

  const sharedReceiptPreviewSource = useMemo(() => {
    if (!sharedReceiptPayload) {
      return null;
    }

    return `data:${sharedReceiptPayload.mimeType};base64,${sharedReceiptPayload.contentBase64}`;
  }, [sharedReceiptPayload]);

  const selectedExpense = useMemo(() => {
    if (!monthDocument || !selectedExpenseId) {
      return null;
    }

    return monthDocument.items.find((item) => item.id === selectedExpenseId) ?? null;
  }, [monthDocument, selectedExpenseId]);

  const remainingReceiptPayments = useMemo(() => {
    if (isCreatingExpense) {
      const parsedOccurrences = Number(newExpenseOccurrences);

      if (!Number.isInteger(parsedOccurrences) || parsedOccurrences <= 0) {
        return 0;
      }

      return parsedOccurrences;
    }

    if (!selectedExpense) {
      return 0;
    }

    return getRemainingReceiptPayments({
      coveredPaymentsByReceipts: getCoveredPaymentsByReceipts(selectedExpense),
      manualCoveredPayments: selectedExpense.manualCoveredPayments ?? 0,
      occurrencesPerMonth: selectedExpense.occurrencesPerMonth,
    });
  }, [isCreatingExpense, newExpenseOccurrences, selectedExpense]);

  const effectiveCoveredPayments = useMemo(() => {
    if (coverageMode === "partial") {
      const parsedPartialCoveredPayments = Number(partialCoveredPayments);

      return Number.isInteger(parsedPartialCoveredPayments) && parsedPartialCoveredPayments > 0
        ? parsedPartialCoveredPayments
        : 0;
    }

    return remainingReceiptPayments;
  }, [coverageMode, partialCoveredPayments, remainingReceiptPayments]);

  useEffect(() => {
    setIsIosDevice(isIosShareTargetUnsupported(window.navigator));
  }, []);

  useEffect(() => {
    const shareErrorValue = Array.isArray(router.query.shareError)
      ? router.query.shareError[0]
      : router.query.shareError;

    if (typeof shareErrorValue === "string" && SHARE_ERROR_MESSAGES[shareErrorValue]) {
      setLoadSharedReceiptState({
        message: SHARE_ERROR_MESSAGES[shareErrorValue],
        status: "error",
      });
      return;
    }

    let isDisposed = false;

    async function loadSharedReceiptPayload() {
      const payload = await readSharedReceiptPayload();

      if (isDisposed) {
        return;
      }

      if (!payload) {
        setLoadSharedReceiptState({
          status: "empty",
        });
        return;
      }

      setLoadSharedReceiptState({
        payload,
        status: "ready",
      });
      setNewExpenseDescription(deriveExpenseSearchQueryFromFileName(payload.fileName));
    }

    void loadSharedReceiptPayload();

    return () => {
      isDisposed = true;
    };
  }, [router.query.shareError]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isDisposed = false;

    async function loadMonthDocument() {
      setIsLoadingMonthDocument(true);
      setDocumentLoadError(null);

      try {
        const document = await getMonthlyExpensesDocumentViaApi(selectedMonth);

        if (isDisposed) {
          return;
        }

        setMonthDocument(document);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setDocumentLoadError(getSafeMonthlyExpensesErrorMessage(error));
      } finally {
        if (!isDisposed) {
          setIsLoadingMonthDocument(false);
        }
      }
    }

    void loadMonthDocument();

    return () => {
      isDisposed = true;
    };
  }, [isAuthenticated, selectedMonth]);

  useEffect(() => {
    if (!monthDocument || !sharedReceiptPayload || isCreatingExpense) {
      return;
    }

    const hasCurrentSelection = monthDocument.items.some(
      (item) => item.id === selectedExpenseId,
    );

    if (hasCurrentSelection) {
      return;
    }

    const suggestedExpenseId = suggestExpenseIdForSharedReceipt({
      expenses: monthDocument.items.map((item) => ({
        description: item.description,
        id: item.id,
      })),
      fileName: sharedReceiptPayload.fileName,
    });

    setSelectedExpenseId(suggestedExpenseId ?? monthDocument.items[0]?.id ?? "");
  }, [
    isCreatingExpense,
    monthDocument,
    selectedExpenseId,
    sharedReceiptPayload,
  ]);

  useEffect(() => {
    if (coverageMode !== "partial") {
      return;
    }

    if (remainingReceiptPayments <= 0) {
      setPartialCoveredPayments("1");
      return;
    }

    const parsedPartialCoveredPayments = Number(partialCoveredPayments);

    if (
      !Number.isInteger(parsedPartialCoveredPayments) ||
      parsedPartialCoveredPayments <= 0 ||
      parsedPartialCoveredPayments > remainingReceiptPayments
    ) {
      setPartialCoveredPayments(String(remainingReceiptPayments));
    }
  }, [coverageMode, partialCoveredPayments, remainingReceiptPayments]);

  const handleConnectGoogle = () => {
    void signIn("google", {
      callbackUrl: "/recibir-comprobante",
    });
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(normalizeMonth(value));
    setSaveError(null);
  };

  const handleCreateExpenseToggle = (checked: boolean) => {
    setIsCreatingExpense(checked);
    setSaveError(null);
  };

  const handleManualFilePick = async (file: File | null) => {
    if (!file) {
      return;
    }

    const result = await buildPayloadFromFile(file);

    if (result.status === "error") {
      setLoadSharedReceiptState({ message: result.message, status: "error" });
      return;
    }

    setLoadSharedReceiptState({ payload: result.payload, status: "ready" });
    setNewExpenseDescription(
      deriveExpenseSearchQueryFromFileName(result.payload.fileName),
    );
  };

  const handleDiscardSharedReceipt = async () => {
    await clearSharedReceiptPayload();
    setLoadSharedReceiptState({ status: "empty" });
    setSaveError(null);
    toast.info("Comprobante descartado.");
  };

  const handleSaveSharedReceipt = async () => {
    if (!isAuthenticated) {
      setSaveError("Conectate con Google para guardar el comprobante.");
      return;
    }

    if (!sharedReceiptPayload) {
      setSaveError("No encontramos un comprobante compartido para guardar.");
      return;
    }

    if (!monthDocument) {
      setSaveError("Todavia no pudimos cargar los compromisos del mes seleccionado.");
      return;
    }

    let targetExpenseId = selectedExpenseId;
    let targetExpenseDescription = selectedExpense?.description ?? "";
    const parsedNewExpenseSubtotal = Number(newExpenseSubtotal);
    const parsedNewExpenseOccurrences = Number(newExpenseOccurrences);

    if (isCreatingExpense) {
      if (!newExpenseDescription.trim()) {
        setSaveError("Completá el nombre del nuevo compromiso.");
        return;
      }

      if (!Number.isFinite(parsedNewExpenseSubtotal) || parsedNewExpenseSubtotal <= 0) {
        setSaveError("Ingresá un subtotal valido mayor a 0.");
        return;
      }

      if (!Number.isInteger(parsedNewExpenseOccurrences) || parsedNewExpenseOccurrences <= 0) {
        setSaveError("Ingresá una cantidad de veces por mes mayor a 0.");
        return;
      }

      targetExpenseId = createExpenseId();
      targetExpenseDescription = newExpenseDescription.trim();
    } else if (!selectedExpense) {
      setSaveError("Seleccioná un compromiso para asociar el comprobante.");
      return;
    }

    if (remainingReceiptPayments <= 0) {
      setSaveError("No quedan pagos pendientes para asociar en este compromiso.");
      return;
    }

    if (
      !Number.isInteger(effectiveCoveredPayments) ||
      effectiveCoveredPayments <= 0 ||
      effectiveCoveredPayments > remainingReceiptPayments
    ) {
      setSaveError(`Ingresá una cobertura valida entre 1 y ${remainingReceiptPayments}.`);
      return;
    }

    setSaveError(null);
    setIsSubmitting(true);

    try {
      const receiptUpload = await uploadMonthlyExpenseReceiptViaApi({
        contentBase64: sharedReceiptPayload.contentBase64,
        coveredPayments: effectiveCoveredPayments,
        expenseDescription: targetExpenseDescription,
        fileName: sharedReceiptPayload.fileName,
        mimeType: sharedReceiptPayload.mimeType,
        month: selectedMonth,
      });

      const baseItems = isCreatingExpense
        ? [
            ...monthDocument.items,
            {
              currency: newExpenseCurrency,
              description: targetExpenseDescription,
              id: targetExpenseId,
              manualCoveredPayments: 0,
              occurrencesPerMonth: parsedNewExpenseOccurrences,
              receipts: [],
              subtotal: parsedNewExpenseSubtotal,
              total: Number((parsedNewExpenseSubtotal * parsedNewExpenseOccurrences).toFixed(2)),
            },
          ]
        : monthDocument.items;

      const nextItems = baseItems.map((item) => {
        if (item.id !== targetExpenseId) {
          return item;
        }

        const currentReceipts = item.receipts ?? [];

        return {
          ...item,
          folders: {
            allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
            allReceiptsFolderViewUrl: receiptUpload.allReceiptsFolderViewUrl,
            monthlyFolderId: receiptUpload.monthlyFolderId,
            monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
          },
          receipts: [
            ...currentReceipts,
            {
              allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
              allReceiptsFolderViewUrl: receiptUpload.allReceiptsFolderViewUrl,
              coveredPayments: receiptUpload.coveredPayments,
              fileId: receiptUpload.fileId,
              fileName: receiptUpload.fileName,
              fileViewUrl: receiptUpload.fileViewUrl,
              monthlyFolderId: receiptUpload.monthlyFolderId,
              monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
            },
          ],
        };
      });

      const saveCommand: SaveMonthlyExpensesCommand = {
        items: normalizeExpenseItemsForSave(nextItems),
        month: selectedMonth,
      };

      await saveMonthlyExpensesDocumentViaApi(saveCommand);
      await consumeSharedReceiptPayload();

      toast.success("Comprobante guardado correctamente.");
      await router.push(`/compromisos?month=${encodeURIComponent(selectedMonth)}`);
    } catch (error) {
      if (error instanceof MonthlyExpensesAuthenticationError) {
        setSaveError("Tu sesion de Google vencio. Inicia sesion de nuevo para guardar.");
        toast.warning("Tu sesion vencio. Te redirigimos para iniciar sesion nuevamente.");
        await signOut({
          callbackUrl: "/auth/signin?callbackUrl=%2Frecibir-comprobante",
        });
        return;
      }

      setSaveError(getSafeMonthlyExpensesErrorMessage(error));
      toast.error("No pudimos guardar el comprobante.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FinanceAppShell
      activeSection="expenses"
      authRedirectPath="/recibir-comprobante"
      expensesMonth={selectedMonth}
      isOAuthConfigured
    >
      <TypingAnimation
        aria-label="Recibir comprobante"
        as="h1"
        showCursor={false}
        startOnView={false}
      >
        Recibir comprobante
      </TypingAnimation>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Comprobante compartido</h2>

        {loadSharedReceiptState.status === "error" ? (
          <p className={styles.feedbackError}>{loadSharedReceiptState.message}</p>
        ) : null}

        {loadSharedReceiptState.status !== "ready" ? (
          <div className={styles.authCard}>
            {isIosDevice ? (
              <p className={styles.feedbackNeutral}>
                iOS no soporta recibir archivos compartidos en PWAs.
                Selecciona el comprobante manualmente con el boton de abajo.
              </p>
            ) : (
              <p className={styles.feedbackNeutral}>
                No hay un comprobante pendiente. Comparti un archivo hacia Mes en regla
                desde otra app, o seleccionalo manualmente.
              </p>
            )}
            <ReceiptFileUploader
              errorMessage={null}
              inputAriaLabel="Seleccionar comprobante"
              isDisabled={isSubmitting}
              isUploading={isSubmitting}
              onFileChange={(file) => {
                void handleManualFilePick(file);
              }}
              onInvalidFileSize={() => {
                setLoadSharedReceiptState({
                  message: MANUAL_RECEIPT_INVALID_SIZE_ERROR,
                  status: "error",
                });
              }}
              onInvalidFileType={() => {
                setLoadSharedReceiptState({
                  message: MANUAL_RECEIPT_INVALID_TYPE_ERROR,
                  status: "error",
                });
              }}
              selectedFile={null}
            />
          </div>
        ) : null}

        {sharedReceiptPayload && sharedReceiptPreviewSource ? (
          <div className={styles.receiptPreviewCard}>
            <div className={styles.receiptMeta}>
              <p className={styles.receiptFileName}>{sharedReceiptPayload.fileName}</p>
              <p className={styles.receiptFileInfo}>
                {sharedReceiptPayload.mimeType} - {sharedReceiptPayload.sizeBytes} bytes
              </p>
            </div>

            {sharedReceiptPayload.mimeType === "application/pdf" ? (
              <iframe
                className={styles.pdfPreview}
                src={sharedReceiptPreviewSource}
                title="Vista previa del comprobante"
              />
            ) : (
              <Image
                alt="Vista previa del comprobante"
                className={styles.imagePreview}
                height={640}
                src={sharedReceiptPreviewSource}
                unoptimized
                width={960}
              />
            )}
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Asociacion</h2>

        <div className={styles.fieldGroup}>
          <Label htmlFor="receipt-target-month">Periodo (ano-mes)</Label>
          <Input
            id="receipt-target-month"
            max="2100-12"
            min="2000-01"
            onChange={(event) => handleMonthChange(event.target.value)}
            type="month"
            value={selectedMonth}
          />
        </div>

        {!isAuthenticated ? (
          <div className={styles.authCard}>
            <p className={styles.feedbackNeutral}>
              Conectate con Google para cargar tus compromisos del mes y guardar el comprobante.
            </p>
            <Button onClick={handleConnectGoogle} type="button">
              Conectar con Google
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  checked={isCreatingExpense}
                  onChange={(event) => handleCreateExpenseToggle(event.target.checked)}
                  type="checkbox"
                />
                Crear compromiso nuevo
              </label>
            </div>

            {isLoadingMonthDocument ? (
              <p className={styles.feedbackNeutral}>Cargando compromisos del periodo seleccionado...</p>
            ) : null}

            {documentLoadError ? (
              <p className={styles.feedbackError}>{documentLoadError}</p>
            ) : null}

            {!isCreatingExpense ? (
              <div className={styles.fieldGroup}>
                <Label htmlFor="receipt-target-expense">Compromiso existente</Label>
                <select
                  className={styles.selectField}
                  id="receipt-target-expense"
                  onChange={(event) => {
                    setSelectedExpenseId(event.target.value);
                    setSaveError(null);
                  }}
                  value={selectedExpenseId}
                >
                  <option value="">Seleccionar compromiso</option>
                  {(monthDocument?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className={styles.newExpenseGrid}>
                <div className={styles.fieldGroup}>
                  <Label htmlFor="new-expense-description">Nombre del compromiso</Label>
                  <Input
                    id="new-expense-description"
                    onChange={(event) => setNewExpenseDescription(event.target.value)}
                    placeholder="Ej: Luz"
                    value={newExpenseDescription}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <Label htmlFor="new-expense-currency">Moneda</Label>
                  <select
                    className={styles.selectField}
                    id="new-expense-currency"
                    onChange={(event) => {
                      setNewExpenseCurrency(event.target.value as MonthlyExpenseCurrency);
                    }}
                    value={newExpenseCurrency}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <Label htmlFor="new-expense-subtotal">Subtotal</Label>
                  <Input
                    id="new-expense-subtotal"
                    min="0"
                    onChange={(event) => setNewExpenseSubtotal(event.target.value)}
                    step="0.01"
                    type="number"
                    value={newExpenseSubtotal}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <Label htmlFor="new-expense-occurrences">Veces por mes</Label>
                  <Input
                    id="new-expense-occurrences"
                    min="1"
                    onChange={(event) => setNewExpenseOccurrences(event.target.value)}
                    step="1"
                    type="number"
                    value={newExpenseOccurrences}
                  />
                </div>
              </div>
            )}

            <div className={styles.coverageCard}>
              <h3 className={styles.coverageTitle}>Cobertura del comprobante</h3>
              <p className={styles.coverageHint}>
                Pagos pendientes para este compromiso en {selectedMonth}: {remainingReceiptPayments}
              </p>

              <RadioGroup
                className={styles.coverageOptions}
                onValueChange={(value) => setCoverageMode(value as CoverageMode)}
                value={coverageMode}
              >
                <div className={styles.coverageOptionRow}>
                  <RadioGroupItem id="coverage-full" value="full" />
                  <Label htmlFor="coverage-full">Total ({remainingReceiptPayments} pagos)</Label>
                </div>
                <div className={styles.coverageOptionRow}>
                  <RadioGroupItem id="coverage-partial" value="partial" />
                  <Label htmlFor="coverage-partial">Parcial</Label>
                </div>
              </RadioGroup>

              {coverageMode === "partial" ? (
                <div className={styles.fieldGroup}>
                  <Label htmlFor="coverage-partial-value">Pagos cubiertos</Label>
                  <Input
                    id="coverage-partial-value"
                    max={Math.max(remainingReceiptPayments, 1)}
                    min="1"
                    onChange={(event) => setPartialCoveredPayments(event.target.value)}
                    step="1"
                    type="number"
                    value={partialCoveredPayments}
                  />
                </div>
              ) : null}
            </div>
          </>
        )}

        {saveError ? <p className={styles.feedbackError}>{saveError}</p> : null}

        <div className={styles.actionsRow}>
          <Button
            disabled={
              isSubmitting ||
              !isAuthenticated ||
              !sharedReceiptPayload ||
              isLoadingMonthDocument
            }
            onClick={() => {
              void handleSaveSharedReceipt();
            }}
            type="button"
          >
            {isSubmitting
              ? "Guardando comprobante..."
              : `Guardar (${effectiveCoveredPayments || 0} pagos)`}
          </Button>
          <Button
            onClick={() => {
              void handleDiscardSharedReceipt();
            }}
            type="button"
            variant="outline"
          >
            Descartar comprobante
          </Button>
        </div>
      </section>
    </FinanceAppShell>
  );
}
