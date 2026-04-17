import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { ExternalLink, MoreVertical, Paperclip, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import styles from "./expense-receipt-coverage-edit-dialog.module.scss";

const RECEIPT_FILE_ACCEPT = [
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");

interface ExpenseReceiptCoverageEditDialogProps {
  canManageReceipt: boolean;
  currentCoveredPayments: number;
  errorMessage: string | null;
  expenseDescription: string;
  isOpen: boolean;
  isSubmitting: boolean;
  maxCoveredPayments: number;
  onClose: () => void;
  onDeleteReceipt: () => Promise<void>;
  onSave: (args: {
    coveredPayments: number;
    replacementFile: File | null;
  }) => Promise<void>;
  receiptFileName: string | null;
  receiptFileViewUrl: string | null;
}

export function ExpenseReceiptCoverageEditDialog({
  canManageReceipt,
  currentCoveredPayments,
  errorMessage,
  expenseDescription,
  isOpen,
  isSubmitting,
  maxCoveredPayments,
  onClose,
  onDeleteReceipt,
  onSave,
  receiptFileName,
  receiptFileViewUrl,
}: ExpenseReceiptCoverageEditDialogProps) {
  const normalizedMaxCoveredPayments = Math.max(maxCoveredPayments, 1);
  const [coveredPaymentsValue, setCoveredPaymentsValue] = useState(
    String(Math.max(currentCoveredPayments, 1)),
  );
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [isReceiptActionsMenuOpen, setIsReceiptActionsMenuOpen] = useState(false);
  const [isDeleteReceiptConfirmOpen, setIsDeleteReceiptConfirmOpen] = useState(false);
  const replacementFileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedCoveredPayments = Number(coveredPaymentsValue);
  const hasValidCoveredPayments =
    Number.isInteger(parsedCoveredPayments) &&
    parsedCoveredPayments > 0 &&
    parsedCoveredPayments <= normalizedMaxCoveredPayments;
  const hasReceipt = Boolean(receiptFileName && receiptFileViewUrl);
  const shouldShowReplacementInput = canManageReceipt && !hasReceipt;
  const normalizedExpenseDescription = expenseDescription.trim() || "gasto";
  const normalizedReceiptFileName = receiptFileName?.trim() || "comprobante";
  const replacementFileName = replacementFile?.name ?? null;

  const receiptFileLink = useMemo(() => {
    if (!receiptFileViewUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(receiptFileViewUrl);

      if (!/^https?:$/i.test(parsedUrl.protocol)) {
        return null;
      }

      return parsedUrl.toString();
    } catch {
      return null;
    }
  }, [receiptFileViewUrl]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      onClose();
    }
  };

  const handleReplacementFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReplacementFile(event.target.files?.[0] ?? null);
  };

  const handleClearReplacementFile = () => {
    setReplacementFile(null);

    if (replacementFileInputRef.current) {
      replacementFileInputRef.current.value = "";
    }
  };

  const handleDeleteReceipt = async () => {
    if (isSubmitting || !hasReceipt) {
      return;
    }

    await onDeleteReceipt();
    setIsDeleteReceiptConfirmOpen(false);
    handleClearReplacementFile();
  };

  const handleSave = async () => {
    if (!hasValidCoveredPayments || isSubmitting) {
      return;
    }

    await onSave({
      coveredPayments: parsedCoveredPayments,
      replacementFile,
    });
  };

  return (
    <AlertDialog onOpenChange={setIsDeleteReceiptConfirmOpen} open={isDeleteReceiptConfirmOpen}>
      <Dialog onOpenChange={handleDialogOpenChange} open={isOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar registro de pago</DialogTitle>
            <DialogDescription>
              Ajusta cuántos pagos desea cubrir para {expenseDescription || "el gasto seleccionado"}.
            </DialogDescription>
          </DialogHeader>

          <div className={styles.content}>
            <div className={styles.fieldGroup}>
              <label htmlFor="receipt-covered-payments">¿Cuántos pagos desea cubrir?</label>
              <Input
                id="receipt-covered-payments"
                inputMode="numeric"
                max={normalizedMaxCoveredPayments}
                min={1}
                onChange={(event) =>
                  setCoveredPaymentsValue(event.target.value.replace(/[^\d]/g, ""))}
                type="number"
                value={coveredPaymentsValue}
              />
              <p className={styles.hint}>Maximo permitido: {normalizedMaxCoveredPayments} pagos.</p>
            </div>

            {canManageReceipt && hasReceipt ? (
              <div className={styles.fileRow}>
                <span className={styles.fileName}>Archivo:</span>
                {receiptFileLink ? (
                  <a
                    className={styles.fileLink}
                    href={receiptFileLink}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Paperclip aria-hidden="true" className={styles.fileLinkIcon} />
                    {normalizedReceiptFileName}
                    <ExternalLink aria-hidden="true" className={styles.fileLinkIcon} />
                  </a>
                ) : (
                  <span className={styles.fileName}>{normalizedReceiptFileName}</span>
                )}
                <DropdownMenu onOpenChange={setIsReceiptActionsMenuOpen} open={isReceiptActionsMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Abrir acciones de comprobante ${normalizedReceiptFileName}`}
                      className={styles.fileActionsButton}
                      disabled={isSubmitting}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <MoreVertical aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setIsReceiptActionsMenuOpen(false);
                        window.setTimeout(() => {
                          setIsDeleteReceiptConfirmOpen(true);
                        }, 0);
                      }}
                      variant="destructive"
                    >
                      <Trash2 aria-hidden="true" />
                      Eliminar comprobante
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}

            {shouldShowReplacementInput ? (
              <div className={styles.fieldGroup}>
                <label htmlFor="receipt-replacement-file-input">
                  Adjuntar nuevo comprobante:
                </label>
                <Input
                  accept={RECEIPT_FILE_ACCEPT}
                  aria-label={`Seleccionar nuevo comprobante para ${normalizedExpenseDescription}`}
                  id="receipt-replacement-file-input"
                  onChange={handleReplacementFileChange}
                  ref={replacementFileInputRef}
                  type="file"
                />
                <p className={styles.hint}>
                  {replacementFileName
                    ? `Comprobante seleccionado: ${replacementFileName}`
                    : "Sin comprobante seleccionado."}
                </p>
              </div>
            ) : null}

            {!hasValidCoveredPayments ? (
              <p className={styles.errorText} role="alert">
                Ingresa un numero entero entre 1 y {normalizedMaxCoveredPayments}.
              </p>
            ) : null}

            {errorMessage ? (
              <p className={styles.errorText} role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className={styles.actions}>
              <Button
                disabled={isSubmitting}
                onClick={onClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={!hasValidCoveredPayments || isSubmitting}
                onClick={() => {
                  void handleSave();
                }}
                type="button"
              >
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Querés eliminar este comprobante?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción quita el archivo adjunto para {normalizedExpenseDescription}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            aria-label={`Confirmar eliminación de comprobante ${normalizedReceiptFileName}`}
            onClick={() => {
              void handleDeleteReceipt();
            }}
            variant="destructive"
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
