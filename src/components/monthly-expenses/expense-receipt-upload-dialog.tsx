import {
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import styles from "./expense-receipt-upload-dialog.module.scss";

const FILE_ACCEPT = [
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");

interface ExpenseReceiptUploadDialogProps {
  coveredPaymentsMax: number;
  coveredPaymentsRemaining: number;
  errorMessage: string | null;
  expenseDescription: string;
  isOpen: boolean;
  isSubmitting: boolean;
  uploadProgressPercent: number;
  onClose: () => void;
  onUpload: (args: { coveredPayments: number; file: File }) => Promise<void>;
}

function getDroppedFile(event: DragEvent<HTMLDivElement>): File | null {
  const droppedFile = event.dataTransfer.files?.[0];

  return droppedFile ?? null;
}

function formatPaymentCount(count: number): string {
  return `${count} pago${count === 1 ? "" : "s"}`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }

  const kilobytes = Math.max(1, Math.round(bytes / 1024));

  return `${kilobytes} KB`;
}

function getFileExtension(fileName: string): string {
  const normalizedFileName = fileName.trim();
  const lastDotIndex = normalizedFileName.lastIndexOf(".");

  if (
    lastDotIndex <= 0 ||
    lastDotIndex === normalizedFileName.length - 1
  ) {
    return "FILE";
  }

  return normalizedFileName.slice(lastDotIndex + 1).toUpperCase();
}

export function ExpenseReceiptUploadDialog({
  coveredPaymentsMax,
  coveredPaymentsRemaining,
  errorMessage,
  expenseDescription,
  isOpen,
  isSubmitting,
  uploadProgressPercent,
  onClose,
  onUpload,
}: ExpenseReceiptUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isFileRemoveConfirmOpen, setIsFileRemoveConfirmOpen] = useState(false);
  const [coverageMode, setCoverageMode] = useState<"full" | "partial">("full");
  const [partialCoveredPayments, setPartialCoveredPayments] = useState("1");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputIdBase = useId();
  const fullCoverageOptionId = `${inputIdBase}-full-coverage`;
  const partialCoverageOptionId = `${inputIdBase}-partial-coverage`;
  const partialCoveredPaymentsInputId = `${inputIdBase}-partial-covered-payments`;

  const normalizedCoveredPaymentsMax = Math.max(coveredPaymentsMax, 1);
  const normalizedCoveredPaymentsRemaining = Math.max(coveredPaymentsRemaining, 1);
  const shouldShowCoverageOptions = normalizedCoveredPaymentsRemaining > 1;
  const parsedPartialCoveredPayments = Number(partialCoveredPayments);
  const partialCoveredPaymentsIsValid =
    Number.isInteger(parsedPartialCoveredPayments) &&
    parsedPartialCoveredPayments > 0 &&
    parsedPartialCoveredPayments <= normalizedCoveredPaymentsRemaining;

  const dropzoneLabel = useMemo(
    () =>
      expenseDescription.trim().length > 0
        ? `Comprobante para ${expenseDescription.trim()}`
        : "Comprobante del gasto",
    [expenseDescription],
  );
  const selectedFileExtension = selectedFile
    ? getFileExtension(selectedFile.name)
    : null;
  const selectedFileSize = selectedFile
    ? formatFileSize(selectedFile.size)
    : null;
  const selectedFileStatus: "ready" | "uploading" | "error" = !selectedFile
    ? "ready"
    : isSubmitting
      ? "uploading"
      : errorMessage
        ? "error"
        : "ready";
  const normalizedUploadProgressPercent = Math.min(
    100,
    Math.max(0, Math.round(uploadProgressPercent)),
  );
  const uploadProgress = selectedFileStatus === "uploading"
    ? normalizedUploadProgressPercent
    : selectedFileStatus === "error"
      ? normalizedUploadProgressPercent
      : selectedFile
        ? 100
        : 0;

  /**
   * Resets the local form state so each upload flow starts from a clean slate.
   */
  function resetDialogState() {
    setIsFileRemoveConfirmOpen(false);
    setSelectedFile(null);
    setIsDraggingFile(false);
    setCoverageMode("full");
    setPartialCoveredPayments("1");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetDialogState();
      onClose();
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setIsFileRemoveConfirmOpen(false);
    setSelectedFile(nextFile);
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleClearSelectedFile = () => {
    setIsFileRemoveConfirmOpen(false);
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    setIsFileRemoveConfirmOpen(false);
    setSelectedFile(getDroppedFile(event));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      return;
    }

    const coveredPayments = shouldShowCoverageOptions && coverageMode === "partial"
      ? parsedPartialCoveredPayments
      : normalizedCoveredPaymentsRemaining;

    if (!Number.isInteger(coveredPayments) || coveredPayments <= 0) {
      return;
    }

    await onUpload({
      coveredPayments,
      file: selectedFile,
    });
  };

  return (
    <Dialog onOpenChange={handleDialogOpenChange} open={isOpen}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Subir comprobante</DialogTitle>
          <DialogDescription>
            Subí un archivo del comprobante y lo vamos a guardar en Google Drive.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.content}>
          <div
            aria-label={dropzoneLabel}
            className={cn(styles.dropzone, isDraggingFile && styles.dropzoneActive)}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            role="region"
          >
            <span className={styles.dropzoneIcon}>
              <Upload aria-hidden="true" />
            </span>
            <p className={styles.dropzoneText}>
              Arrastrá y soltá el archivo acá, o seleccioná uno desde tu equipo.
            </p>
            <p className={styles.dropzoneHint}>PDF, JPG, PNG, WEBP, HEIC o HEIF (hasta 5MB).</p>
            <Button
              className={styles.filePickerButton}
              onClick={handleOpenFilePicker}
              size="sm"
              type="button"
              variant="outline"
            >
              Seleccionar archivo
            </Button>
            <Input
              accept={FILE_ACCEPT}
              className={styles.fileInput}
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
          </div>

          {selectedFile ? (
            <div className={styles.fileCard}>
              <div className={styles.fileCardHeader}>
                <span
                  className={cn(
                    styles.fileTypeBadge,
                    selectedFile.type.startsWith("image/")
                      ? styles.fileTypeBadgeImage
                      : styles.fileTypeBadgeDocument,
                  )}
                >
                  {selectedFileExtension}
                </span>

                <div className={styles.fileDetails}>
                  <p className={styles.fileName}>{selectedFile.name}</p>
                  <p className={styles.fileMeta}>
                    <span>{selectedFileSize}</span>
                    <span
                      className={cn(
                        styles.fileStatus,
                        selectedFileStatus === "ready" && styles.fileStatusReady,
                        selectedFileStatus === "uploading" && styles.fileStatusUploading,
                        selectedFileStatus === "error" && styles.fileStatusError,
                      )}
                    >
                      {selectedFileStatus === "uploading" ? (
                        <LoaderCircle aria-hidden="true" className={styles.statusSpinner} />
                      ) : null}
                      {selectedFileStatus === "ready" ? (
                        <CircleCheck aria-hidden="true" />
                      ) : null}
                      {selectedFileStatus === "error" ? (
                        <CircleAlert aria-hidden="true" />
                      ) : null}
                      {selectedFileStatus === "uploading"
                        ? `Subiendo... ${normalizedUploadProgressPercent}%`
                        : null}
                      {selectedFileStatus === "ready" ? "Listo para subir" : null}
                      {selectedFileStatus === "error" ? "Error en la carga" : null}
                    </span>
                  </p>
                </div>

                <Popover
                  onOpenChange={setIsFileRemoveConfirmOpen}
                  open={isFileRemoveConfirmOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      aria-label={`Quitar archivo ${selectedFile.name}`}
                      className={styles.fileRemoveButton}
                      disabled={isSubmitting}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className={styles.fileRemoveConfirmPopover}
                    side="bottom"
                  >
                    <p className={styles.fileRemoveConfirmMessage}>
                      ¿Querés quitar este archivo seleccionado?
                    </p>
                    <div className={styles.fileRemoveConfirmActions}>
                      <Button
                        aria-label={`Cancelar quitar archivo ${selectedFile.name}`}
                        onClick={() => setIsFileRemoveConfirmOpen(false)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Cancelar
                      </Button>
                      <Button
                        aria-label={`Confirmar quitar archivo ${selectedFile.name}`}
                        onClick={() => {
                          setIsFileRemoveConfirmOpen(false);
                          handleClearSelectedFile();
                        }}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Quitar
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div aria-hidden="true" className={styles.fileProgressTrack}>
                <span
                  className={cn(
                    styles.fileProgressFill,
                    selectedFileStatus === "uploading" && styles.fileProgressFillUploading,
                    selectedFileStatus === "error" && styles.fileProgressFillError,
                  )}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}

          {shouldShowCoverageOptions ? (
            <div className={styles.coverageSection}>
              <p className={styles.coverageTitle}>
                Elegí cómo aplicar este comprobante:
              </p>

              <RadioGroup
                className={styles.coverageOptions}
                onValueChange={(value) => {
                  if (value === "partial") {
                    setCoverageMode("partial");
                    return;
                  }

                  setCoverageMode("full");
                }}
                value={coverageMode}
              >
                <div
                  className={cn(
                    styles.coverageOption,
                    coverageMode === "full" && styles.coverageOptionSelected,
                  )}
                >
                  <div className={styles.coverageOptionHeader}>
                    <RadioGroupItem id={fullCoverageOptionId} value="full" />
                    <Label className={styles.coverageOptionLabel} htmlFor={fullCoverageOptionId}>
                      Todo el periodo
                    </Label>
                  </div>
                  <p className={styles.coverageOptionDescription}>
                    El comprobante cubre {formatPaymentCount(normalizedCoveredPaymentsRemaining)} pendientes de un total de {formatPaymentCount(normalizedCoveredPaymentsMax)} en este mes.
                  </p>
                </div>

                <div
                  className={cn(
                    styles.coverageOption,
                    coverageMode === "partial" && styles.coverageOptionSelected,
                  )}
                >
                  <div className={styles.coverageOptionHeader}>
                    <RadioGroupItem id={partialCoverageOptionId} value="partial" />
                    <Label className={styles.coverageOptionLabel} htmlFor={partialCoverageOptionId}>
                      Cobertura parcial
                    </Label>
                  </div>
                  <p className={styles.coverageOptionDescription}>
                    El comprobante cubre solo la cantidad de pagos que indiques manualmente.
                  </p>
                </div>
              </RadioGroup>

              {coverageMode === "partial" ? (
                <div className={styles.partialCoverageField}>
                  <Label htmlFor={partialCoveredPaymentsInputId}>Cantidad de pagos a cubrir</Label>
                  <Input
                    id={partialCoveredPaymentsInputId}
                    inputMode="numeric"
                    max={normalizedCoveredPaymentsRemaining}
                    min={1}
                    onChange={(event) =>
                      setPartialCoveredPayments(event.target.value.replace(/[^\d]/g, ""))}
                    type="number"
                    value={partialCoveredPayments}
                  />
                  <p className={styles.coverageHint}>
                    Podés indicar entre 1 y {normalizedCoveredPaymentsRemaining} pagos.
                  </p>
                </div>
              ) : null}

              {coverageMode === "partial" && !partialCoveredPaymentsIsValid ? (
                <p className={styles.errorText} role="alert">
                  Ingresá una cantidad de pagos válida entre 1 y {normalizedCoveredPaymentsRemaining}.
                </p>
              ) : null}
            </div>
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
              disabled={
                !selectedFile ||
                isSubmitting ||
                (shouldShowCoverageOptions &&
                  coverageMode === "partial" &&
                  !partialCoveredPaymentsIsValid)
              }
              onClick={() => {
                void handleUpload();
              }}
              type="button"
            >
              {isSubmitting ? "Subiendo..." : "Subir comprobante"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
