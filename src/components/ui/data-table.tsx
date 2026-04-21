"use client";

import * as React from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CircleAlert, ChevronDown, Ellipsis, Eraser, Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PresenceFilterValue = "hasValue" | "noValue";

export type DataTableAdvancedFilterType = "numberRange" | "enum" | "presence";

export interface DataTableAdvancedEnumOption {
  label: string;
  value: string;
}

export interface DataTableAdvancedFilterConfig {
  columnId: string;
  label: string;
  type: DataTableAdvancedFilterType;
  enumOptions?: DataTableAdvancedEnumOption[];
}

export type DataTableColumnFilterValue =
  | {
      kind: "numberRange";
      max?: number;
      min?: number;
    }
  | {
      kind: "enum";
      value: string;
    }
  | {
      kind: "presence";
      value: PresenceFilterValue;
    };

type DataTableAdvancedFilterDraftValue =
  | {
      kind: "numberRange";
      max: string;
      min: string;
    }
  | {
      kind: "enum";
      value: string;
    }
  | {
      kind: "presence";
      value: PresenceFilterValue | "";
    };

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage: string;
  getRowClassName?: (row: TData) => string | undefined;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  filterColumnId?: string;
  filterLabel?: string;
  filterPlaceholder?: string;
  filterValue?: string;
  onFilterValueChange?: (value: string) => void;
  showExcludeFilterToggle?: boolean;
  excludeFilterValues?: string[];
  onExcludeFilterValuesChange?: (values: string[]) => void;
  excludeFilterPlaceholder?: string;
  excludeFilterLabel?: string;
  excludeFilterToggleLabel?: string;
  excludeFilterRowsCountByValue?: Record<string, number>;
  excludeFilterUniqueRowsCount?: number;
  showColumnVisibilityToggle?: boolean;
  columnVisibilityButtonLabel?: string;
  columnVisibilityMenuLabel?: string;
  sortingBadgeLabelOverrides?: Record<string, string>;
  selectAllColumnsLabel?: string;
  deselectAllColumnsLabel?: string;
  hideableColumnsDefaultVisibility?: VisibilityState;
  advancedFiltersConfig?: DataTableAdvancedFilterConfig[];
  advancedFiltersButtonLabel?: string;
  advancedFiltersDescription?: string;
  advancedFiltersDialogTitle?: string;
  clearAdvancedFiltersLabel?: string;
  applyAdvancedFiltersLabel?: string;
}

interface DataTableColumnMeta {
  label?: string;
  cellClassName?: string;
}

const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
const CLEAR_FILTER_ARIA_LABEL = "Limpiar filtro";
const ACTIVE_EXCLUSIONS_SR_LABEL = "Filtros de exclusión activos";
const HIDE_EXCLUDE_FILTERS_ARIA_LABEL = "Ocultar filtros de exclusión";
const EMPTY_EXCLUDE_FILTER_ERROR_MESSAGE = "Ingresá un texto para excluir.";
const DUPLICATE_EXCLUDE_FILTER_ERROR_MESSAGE = "Esa exclusión ya está activa.";
const EXCLUDED_ROWS_SUMMARY_LABEL = "Total excluidas";
const CLEAR_ALL_EXCLUSIONS_ARIA_LABEL = "Quitar todas las exclusiones";
const CLEAR_ALL_EXCLUSIONS_FROM_INPUT_ARIA_LABEL = "Limpiar filtros excluidos";
const REVERSE_FILTER_PENDING_MESSAGE =
  "Estás escribiendo una exclusión. Presioná Enter para aplicarla.";
const ADVANCED_FILTERS_ICON_LABEL = "Filtros avanzados";
const ADVANCED_FILTERS_ACTIVE_SR_LABEL = "Filtros avanzados activos";
const ADVANCED_FILTERS_DIALOG_CANCEL_LABEL = "Cancelar";
const ADVANCED_FILTERS_NUMBER_MIN_LABEL = "Mínimo";
const ADVANCED_FILTERS_NUMBER_MAX_LABEL = "Máximo";
const ADVANCED_FILTERS_ENUM_ALL_OPTION = "Todos";
const ADVANCED_FILTERS_PRESENCE_ALL_OPTION = "Todos";
const ADVANCED_FILTERS_PRESENCE_HAS_OPTION = "Tiene valor";
const ADVANCED_FILTERS_PRESENCE_HAS_NOT_OPTION = "Sin valor";
const ADVANCED_FILTERS_INVALID_MIN_MESSAGE = "Ingresá un mínimo válido.";
const ADVANCED_FILTERS_INVALID_MAX_MESSAGE = "Ingresá un máximo válido.";
const ADVANCED_FILTERS_INVALID_RANGE_MESSAGE =
  "El mínimo no puede ser mayor que el máximo.";
const EMPTY_ADVANCED_FILTERS_CONFIG: DataTableAdvancedFilterConfig[] = [];

function normalizeFilterToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLocaleLowerCase()
    .trim();
}

function getTableFilterValue(
  filterValue: string,
  showExcludeFilterToggle: boolean,
): string {
  const normalizedFilterValue = filterValue.trimStart();

  if (showExcludeFilterToggle && normalizedFilterValue.startsWith("-")) {
    return "";
  }

  return filterValue;
}

function getDefaultAdvancedFilterDraftValue(
  filterType: DataTableAdvancedFilterType,
): DataTableAdvancedFilterDraftValue {
  if (filterType === "numberRange") {
    return {
      kind: "numberRange",
      max: "",
      min: "",
    };
  }

  if (filterType === "enum") {
    return {
      kind: "enum",
      value: "",
    };
  }

  return {
    kind: "presence",
    value: "",
  };
}

function parseNullableNumber(value: string): number | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isAdvancedFilterDraftValueActive(
  filterValue: DataTableAdvancedFilterDraftValue,
): boolean {
  if (filterValue.kind === "numberRange") {
    return (
      filterValue.min.trim().length > 0 || filterValue.max.trim().length > 0
    );
  }

  return filterValue.value !== "";
}

function areColumnFiltersEqual(
  leftFilters: ColumnFiltersState,
  rightFilters: ColumnFiltersState,
): boolean {
  if (leftFilters.length !== rightFilters.length) {
    return false;
  }

  return leftFilters.every(
    (leftFilter, index) =>
      leftFilter.id === rightFilters[index]?.id &&
      leftFilter.value === rightFilters[index]?.value,
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage,
  getRowClassName,
  sorting: controlledSorting,
  onSortingChange,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,
  filterColumnId,
  filterLabel = "Filtrar",
  filterPlaceholder = "Filtrar...",
  filterValue: controlledFilterValue,
  onFilterValueChange,
  showExcludeFilterToggle = false,
  excludeFilterValues: controlledExcludeFilterValues,
  onExcludeFilterValuesChange,
  excludeFilterPlaceholder = "Excluir por descripción",
  excludeFilterLabel = "Filtro de exclusión",
  excludeFilterToggleLabel = "Mostrar filtros de exclusión",
  excludeFilterRowsCountByValue,
  excludeFilterUniqueRowsCount,
  showColumnVisibilityToggle = false,
  columnVisibilityButtonLabel = "Columnas",
  columnVisibilityMenuLabel = "Mostrar columnas",
  sortingBadgeLabelOverrides,
  selectAllColumnsLabel = "Mostrar todas",
  deselectAllColumnsLabel = "Ocultar todas",
  hideableColumnsDefaultVisibility,
  advancedFiltersConfig = EMPTY_ADVANCED_FILTERS_CONFIG,
  advancedFiltersButtonLabel = ADVANCED_FILTERS_ICON_LABEL,
  advancedFiltersDescription = "Aplicá filtros por columna.",
  advancedFiltersDialogTitle = "Filtros avanzados",
  clearAdvancedFiltersLabel = "Limpiar filtros",
  applyAdvancedFiltersLabel = "Aplicar filtros",
}: DataTableProps<TData, TValue>) {
  const [uncontrolledSorting, setUncontrolledSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [uncontrolledFilterValue, setUncontrolledFilterValue] = React.useState("");
  const [uncontrolledExcludeFilterValues, setUncontrolledExcludeFilterValues] =
    React.useState<string[]>([]);
  const [excludeFilterInputValue, setExcludeFilterInputValue] = React.useState("");
  const [excludeFilterErrorMessage, setExcludeFilterErrorMessage] = React.useState<
    string | null
  >(null);
  const [isExcludeFilterInputVisible, setIsExcludeFilterInputVisible] =
    React.useState(false);
  const [uncontrolledColumnVisibility, setUncontrolledColumnVisibility] =
    React.useState<VisibilityState>({});
  const [isAdvancedFiltersDialogOpen, setIsAdvancedFiltersDialogOpen] =
    React.useState(false);
  const [advancedFiltersDraftByColumn, setAdvancedFiltersDraftByColumn] =
    React.useState<Record<string, DataTableAdvancedFilterDraftValue>>({});
  const [advancedFiltersAppliedByColumn, setAdvancedFiltersAppliedByColumn] =
    React.useState<Record<string, DataTableColumnFilterValue>>({});
  const sorting = controlledSorting ?? uncontrolledSorting;
  const columnVisibility = controlledColumnVisibility ?? uncontrolledColumnVisibility;
  const isFilterValueControlled = controlledFilterValue != null;
  const isExcludeFilterValuesControlled = controlledExcludeFilterValues != null;
  const resolvedFilterValue = isFilterValueControlled
    ? controlledFilterValue
    : uncontrolledFilterValue;
  const resolvedExcludeFilterValues = isExcludeFilterValuesControlled
    ? controlledExcludeFilterValues
    : uncontrolledExcludeFilterValues;
  const hasActiveExcludeFilterValues = resolvedExcludeFilterValues.length > 0;
  const tableFilterValue = getTableFilterValue(
    resolvedFilterValue,
    showExcludeFilterToggle,
  );
  const hasPendingReverseFilter =
    showExcludeFilterToggle && resolvedFilterValue.trimStart().startsWith("-");
  const advancedFilterColumnIds = React.useMemo(
    () =>
      new Set(
        advancedFiltersConfig.map((advancedFilterConfig) => advancedFilterConfig.columnId),
      ),
    [advancedFiltersConfig],
  );
  const hasActiveAdvancedFilters =
    Object.keys(advancedFiltersAppliedByColumn).length > 0;

  const handleExcludeFilterValuesChange = React.useCallback(
    (nextExcludeFilterValues: string[]) => {
      if (!isExcludeFilterValuesControlled) {
        setUncontrolledExcludeFilterValues(nextExcludeFilterValues);
      }

      onExcludeFilterValuesChange?.(nextExcludeFilterValues);
    },
    [isExcludeFilterValuesControlled, onExcludeFilterValuesChange],
  );

  const addExcludeFilterValue = React.useCallback(
    (
      rawExcludeFilterValue: string,
      options: { clearExcludeInputValue?: boolean } = {},
    ): boolean => {
      const normalizedCandidate = normalizeFilterToken(rawExcludeFilterValue);

      if (!normalizedCandidate) {
        setExcludeFilterErrorMessage(EMPTY_EXCLUDE_FILTER_ERROR_MESSAGE);
        return false;
      }

      const hasDuplicateExcludeFilter = resolvedExcludeFilterValues.some(
        (excludeFilterValue) =>
          normalizeFilterToken(excludeFilterValue) === normalizedCandidate,
      );

      if (hasDuplicateExcludeFilter) {
        setExcludeFilterErrorMessage(DUPLICATE_EXCLUDE_FILTER_ERROR_MESSAGE);
        return false;
      }

      handleExcludeFilterValuesChange([
        ...resolvedExcludeFilterValues,
        rawExcludeFilterValue.trim(),
      ]);

      if (options.clearExcludeInputValue ?? true) {
        setExcludeFilterInputValue("");
      }

      setExcludeFilterErrorMessage(null);
      return true;
    },
    [handleExcludeFilterValuesChange, resolvedExcludeFilterValues],
  );

  const removeExcludeFilterValue = React.useCallback(
    (excludeFilterValueToRemove: string) => {
      handleExcludeFilterValuesChange(
        resolvedExcludeFilterValues.filter(
          (excludeFilterValue) => excludeFilterValue !== excludeFilterValueToRemove,
        ),
      );
    },
    [handleExcludeFilterValuesChange, resolvedExcludeFilterValues],
  );

  const handleClearAllExcludeFilters = React.useCallback(() => {
    handleExcludeFilterValuesChange([]);
    setExcludeFilterInputValue("");
    setExcludeFilterErrorMessage(null);
  }, [handleExcludeFilterValuesChange]);

  const handleSortingChange = React.useCallback(
    (updater: SortingState | ((previousState: SortingState) => SortingState)) => {
      const nextSorting =
        typeof updater === "function" ? updater(sorting) : updater;

      if (controlledSorting == null) {
        setUncontrolledSorting(nextSorting);
      }

      onSortingChange?.(nextSorting);
    },
    [controlledSorting, onSortingChange, sorting],
  );

  const handleColumnVisibilityChange = React.useCallback(
    (
      updater:
        | VisibilityState
        | ((previousState: VisibilityState) => VisibilityState),
    ) => {
      if (controlledColumnVisibility == null) {
        setUncontrolledColumnVisibility(updater);
      }

      onColumnVisibilityChange?.(updater);
    },
    [controlledColumnVisibility, onColumnVisibilityChange],
  );

  // TanStack Table manages internal reactive state through this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    state: {
      columnFilters,
      columnVisibility,
      sorting,
    },
  });
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide());
  const getHideableColumnDefaultVisibility = React.useCallback(
    (columnId: string): boolean =>
      hideableColumnsDefaultVisibility?.[columnId] ?? true,
    [hideableColumnsDefaultVisibility],
  );
  const areHideableColumnsAtDefaultVisibility = hideableColumns.every(
    (column) =>
      column.getIsVisible() === getHideableColumnDefaultVisibility(column.id),
  );
  const areSomeHideableColumnsVisible = hideableColumns.some((column) =>
    column.getIsVisible(),
  );
  const shouldShowColumnVisibilityToggle =
    showColumnVisibilityToggle && hideableColumns.length > 0;
  const hasModifiedColumnVisibility =
    shouldShowColumnVisibilityToggle && !areHideableColumnsAtDefaultVisibility;
  const hasToolbarChanges = hasModifiedColumnVisibility;
  const shouldShowAdvancedFiltersToggle = advancedFiltersConfig.length > 0;
  const shouldShowStandaloneAdvancedFiltersToggle =
    shouldShowAdvancedFiltersToggle && !filterColumnId;
  const shouldShowToolbarActions =
    shouldShowColumnVisibilityToggle || shouldShowStandaloneAdvancedFiltersToggle;
  const shouldShowToolbar =
    Boolean(filterColumnId) ||
    shouldShowToolbarActions ||
    shouldShowAdvancedFiltersToggle;
  const filterColumn = filterColumnId ? table.getColumn(filterColumnId) : undefined;
  const activeSortingEntry = sorting[0];
  const activeSortingColumn = activeSortingEntry
    ? table.getColumn(activeSortingEntry.id)
    : undefined;
  const activeSortingColumnMeta = activeSortingColumn?.columnDef.meta as
    | DataTableColumnMeta
    | undefined;
  const activeSortingColumnLabel =
    (activeSortingEntry
      ? sortingBadgeLabelOverrides?.[activeSortingEntry.id]
      : undefined) ??
    activeSortingColumnMeta?.label ??
    (typeof activeSortingColumn?.columnDef.header === "string"
      ? activeSortingColumn.columnDef.header
      : activeSortingEntry?.id);
  const shouldShowSortingBadge =
    activeSortingEntry != null && activeSortingColumnLabel != null;
  const activeSortingDirectionSymbol = activeSortingEntry?.desc ? "↓" : "↑";
  const activeSortingDirectionLabel = activeSortingEntry?.desc
    ? "descendente"
    : "ascendente";
  const footerGroups = table.getFooterGroups();
  const hasFooterContent = footerGroups.some((footerGroup) =>
    footerGroup.headers.some(
      (footer) => !footer.isPlaceholder && footer.column.columnDef.footer != null,
    ),
  );

  const handleResetSorting = React.useCallback(() => {
    handleSortingChange([]);
  }, [handleSortingChange]);

  const handleClearMainFilter = React.useCallback(() => {
    if (!isFilterValueControlled) {
      setUncontrolledFilterValue("");
    }

    onFilterValueChange?.("");
    filterColumn?.setFilterValue("");
  }, [filterColumn, isFilterValueControlled, onFilterValueChange]);

  React.useEffect(() => {
    if (!filterColumn) {
      return;
    }

    const currentFilterValue = String(filterColumn.getFilterValue() ?? "");

    if (currentFilterValue === tableFilterValue) {
      return;
    }

    filterColumn.setFilterValue(tableFilterValue);
  }, [filterColumn, tableFilterValue]);

  React.useEffect(() => {
    if (
      advancedFilterColumnIds.size === 0 &&
      Object.keys(advancedFiltersAppliedByColumn).length === 0
    ) {
      return;
    }

    setColumnFilters((previousColumnFilters) => {
      const nextColumnFilters = previousColumnFilters.filter(
        (columnFilter) => !advancedFilterColumnIds.has(columnFilter.id),
      );

      for (const [columnId, filterValue] of Object.entries(
        advancedFiltersAppliedByColumn,
      )) {
        nextColumnFilters.push({
          id: columnId,
          value: filterValue,
        });
      }

      if (areColumnFiltersEqual(previousColumnFilters, nextColumnFilters)) {
        return previousColumnFilters;
      }

      return nextColumnFilters;
    });
  }, [advancedFilterColumnIds, advancedFiltersAppliedByColumn]);

  const advancedFilterValidationMessagesByColumn = React.useMemo(() => {
    const nextValidationMessagesByColumn: Record<string, string> = {};

    for (const advancedFilterConfig of advancedFiltersConfig) {
      const draftValue =
        advancedFiltersDraftByColumn[advancedFilterConfig.columnId] ??
        getDefaultAdvancedFilterDraftValue(advancedFilterConfig.type);

      if (advancedFilterConfig.type !== "numberRange" || draftValue.kind !== "numberRange") {
        continue;
      }

      const hasMinValue = draftValue.min.trim().length > 0;
      const hasMaxValue = draftValue.max.trim().length > 0;
      const parsedMin = parseNullableNumber(draftValue.min);
      const parsedMax = parseNullableNumber(draftValue.max);

      if (hasMinValue && parsedMin == null) {
        nextValidationMessagesByColumn[advancedFilterConfig.columnId] =
          ADVANCED_FILTERS_INVALID_MIN_MESSAGE;
        continue;
      }

      if (hasMaxValue && parsedMax == null) {
        nextValidationMessagesByColumn[advancedFilterConfig.columnId] =
          ADVANCED_FILTERS_INVALID_MAX_MESSAGE;
        continue;
      }

      if (parsedMin != null && parsedMax != null && parsedMin > parsedMax) {
        nextValidationMessagesByColumn[advancedFilterConfig.columnId] =
          ADVANCED_FILTERS_INVALID_RANGE_MESSAGE;
      }
    }

    return nextValidationMessagesByColumn;
  }, [advancedFiltersConfig, advancedFiltersDraftByColumn]);
  const hasAdvancedFilterValidationErrors =
    Object.keys(advancedFilterValidationMessagesByColumn).length > 0;

  const handleOpenAdvancedFiltersDialog = React.useCallback(() => {
    const nextDraftByColumn: Record<string, DataTableAdvancedFilterDraftValue> = {};

    for (const advancedFilterConfig of advancedFiltersConfig) {
      const appliedFilterValue = advancedFiltersAppliedByColumn[advancedFilterConfig.columnId];

      if (advancedFilterConfig.type === "numberRange") {
        nextDraftByColumn[advancedFilterConfig.columnId] = {
          kind: "numberRange",
          max:
            appliedFilterValue?.kind === "numberRange" &&
            appliedFilterValue.max != null
              ? String(appliedFilterValue.max)
              : "",
          min:
            appliedFilterValue?.kind === "numberRange" &&
            appliedFilterValue.min != null
              ? String(appliedFilterValue.min)
              : "",
        };
        continue;
      }

      if (advancedFilterConfig.type === "enum") {
        nextDraftByColumn[advancedFilterConfig.columnId] = {
          kind: "enum",
          value:
            appliedFilterValue?.kind === "enum"
              ? appliedFilterValue.value
              : "",
        };
        continue;
      }

      nextDraftByColumn[advancedFilterConfig.columnId] = {
        kind: "presence",
        value:
          appliedFilterValue?.kind === "presence"
            ? appliedFilterValue.value
            : "",
      };
    }

    setAdvancedFiltersDraftByColumn(nextDraftByColumn);
    setIsAdvancedFiltersDialogOpen(true);
  }, [advancedFiltersAppliedByColumn, advancedFiltersConfig]);

  const handleApplyAdvancedFilters = React.useCallback(() => {
    if (hasAdvancedFilterValidationErrors) {
      return;
    }

    const nextAppliedFiltersByColumn: Record<string, DataTableColumnFilterValue> = {};

    for (const advancedFilterConfig of advancedFiltersConfig) {
      const draftFilterValue =
        advancedFiltersDraftByColumn[advancedFilterConfig.columnId] ??
        getDefaultAdvancedFilterDraftValue(advancedFilterConfig.type);

      if (!isAdvancedFilterDraftValueActive(draftFilterValue)) {
        continue;
      }

      if (draftFilterValue.kind === "numberRange") {
        const parsedMin = parseNullableNumber(draftFilterValue.min);
        const parsedMax = parseNullableNumber(draftFilterValue.max);

        if (parsedMin == null && parsedMax == null) {
          continue;
        }

        nextAppliedFiltersByColumn[advancedFilterConfig.columnId] = {
          kind: "numberRange",
          ...(parsedMax != null ? { max: parsedMax } : {}),
          ...(parsedMin != null ? { min: parsedMin } : {}),
        };
        continue;
      }

      if (draftFilterValue.kind === "enum" && draftFilterValue.value) {
        nextAppliedFiltersByColumn[advancedFilterConfig.columnId] = {
          kind: "enum",
          value: draftFilterValue.value,
        };
        continue;
      }

      if (draftFilterValue.kind === "presence" && draftFilterValue.value) {
        nextAppliedFiltersByColumn[advancedFilterConfig.columnId] = {
          kind: "presence",
          value: draftFilterValue.value,
        };
      }
    }

    setAdvancedFiltersAppliedByColumn(nextAppliedFiltersByColumn);
    setIsAdvancedFiltersDialogOpen(false);
  }, [
    advancedFiltersConfig,
    advancedFiltersDraftByColumn,
    hasAdvancedFilterValidationErrors,
  ]);

  const handleClearAdvancedFilters = React.useCallback(() => {
    setAdvancedFiltersDraftByColumn({});
    setAdvancedFiltersAppliedByColumn({});
    setIsAdvancedFiltersDialogOpen(false);
  }, []);

  return (
    <div className="grid gap-4">
      {shouldShowToolbar ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {filterColumnId ? (
              <div className="grid w-full max-w-sm gap-2">
                <div className="relative w-full">
                  <Input
                    aria-label={filterLabel}
                    className={`w-full pr-16 ${
                      hasPendingReverseFilter ? "text-red-400" : ""
                    }`}
                    onChange={(event) => {
                      const nextFilterValue = event.target.value;

                      if (!isFilterValueControlled) {
                        setUncontrolledFilterValue(nextFilterValue);
                      }

                      onFilterValueChange?.(nextFilterValue);
                      filterColumn?.setFilterValue(
                        getTableFilterValue(nextFilterValue, showExcludeFilterToggle),
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      const trimmedResolvedFilterValue = resolvedFilterValue.trimStart();

                      if (
                        !showExcludeFilterToggle ||
                        !trimmedResolvedFilterValue.startsWith("-")
                      ) {
                        return;
                      }

                      event.preventDefault();

                      const excludeFilterCandidate =
                        trimmedResolvedFilterValue.slice(1);
                      const wasExcludeFilterAdded = addExcludeFilterValue(
                        excludeFilterCandidate,
                        {
                          clearExcludeInputValue: false,
                        },
                      );

                      if (wasExcludeFilterAdded) {
                        handleClearMainFilter();
                      }
                    }}
                    placeholder={filterPlaceholder}
                    type="text"
                    value={resolvedFilterValue}
                  />
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                    {resolvedFilterValue ? (
                      <Button
                        aria-label={CLEAR_FILTER_ARIA_LABEL}
                        className="active:-translate-y-0"
                        onClick={handleClearMainFilter}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    ) : null}
                    {showExcludeFilterToggle ? (
                      <Button
                        aria-expanded={isExcludeFilterInputVisible}
                        aria-label={
                          isExcludeFilterInputVisible
                            ? HIDE_EXCLUDE_FILTERS_ARIA_LABEL
                            : excludeFilterToggleLabel
                        }
                        className="relative"
                        onClick={() => {
                          setIsExcludeFilterInputVisible((previousState) => {
                            const nextState = !previousState;

                            if (!nextState) {
                              setExcludeFilterInputValue("");
                              setExcludeFilterErrorMessage(null);
                            }

                            return nextState;
                          });
                        }}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Ellipsis aria-hidden="true" />
                        {hasActiveExcludeFilterValues ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                            />
                            <span className="sr-only">{ACTIVE_EXCLUSIONS_SR_LABEL}</span>
                          </>
                        ) : null}
                      </Button>
                    ) : null}
                    {shouldShowAdvancedFiltersToggle ? (
                      <Button
                        aria-label={advancedFiltersButtonLabel}
                        className="relative"
                        onClick={handleOpenAdvancedFiltersDialog}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Filter aria-hidden="true" />
                        {hasActiveAdvancedFilters ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                            />
                            <span className="sr-only">{ADVANCED_FILTERS_ACTIVE_SR_LABEL}</span>
                          </>
                        ) : null}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {showExcludeFilterToggle && isExcludeFilterInputVisible ? (
                  <div className="grid gap-1">
                    <div className="flex items-center gap-1">
                      <Input
                        aria-invalid={excludeFilterErrorMessage != null}
                        aria-label={excludeFilterLabel}
                        onChange={(event) => {
                          setExcludeFilterInputValue(event.target.value);

                          if (excludeFilterErrorMessage != null) {
                            setExcludeFilterErrorMessage(null);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            return;
                          }

                          event.preventDefault();
                          addExcludeFilterValue(excludeFilterInputValue);
                        }}
                        placeholder={excludeFilterPlaceholder}
                        type="text"
                        value={excludeFilterInputValue}
                      />
                      <Button
                        aria-label={CLEAR_ALL_EXCLUSIONS_FROM_INPUT_ARIA_LABEL}
                        className="shrink-0"
                        disabled={!hasActiveExcludeFilterValues}
                        onClick={handleClearAllExcludeFilters}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Eraser aria-hidden="true" />
                      </Button>
                    </div>
                    {excludeFilterErrorMessage ? (
                      <p aria-live="polite" className="text-sm text-destructive">
                        {excludeFilterErrorMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {hasPendingReverseFilter ? (
                  <div
                    aria-live="polite"
                    className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-muted-foreground"
                    role="status"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                      <CircleAlert aria-hidden="true" className="size-4" />
                      <span>Exclusión pendiente</span>
                    </div>
                    <p className="mt-1 text-xs">
                      {REVERSE_FILTER_PENDING_MESSAGE}
                    </p>
                  </div>
                ) : null}
                {showExcludeFilterToggle && resolvedExcludeFilterValues.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {excludeFilterUniqueRowsCount != null ? (
                      <Badge
                        aria-label={`Total de filas excluidas únicas: ${excludeFilterUniqueRowsCount}`}
                        className="inline-flex h-6 items-center gap-1.5 px-2.5"
                        variant="destructive"
                      >
                        <span>{`${EXCLUDED_ROWS_SUMMARY_LABEL}:`}</span>
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive/20 px-1.5 text-[10px] leading-4 font-semibold">
                          {excludeFilterUniqueRowsCount}
                        </span>
                        <button
                          aria-label={CLEAR_ALL_EXCLUSIONS_ARIA_LABEL}
                          className="inline-flex size-4 items-center justify-center rounded-sm text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                          onClick={handleClearAllExcludeFilters}
                          type="button"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </Badge>
                    ) : null}
                    {resolvedExcludeFilterValues.map((excludeFilterValue) => {
                      const excludedRowsCount =
                        excludeFilterRowsCountByValue?.[excludeFilterValue];

                      return (
                      <Badge
                        className="inline-flex h-6 items-center gap-1.5 px-2.5"
                        key={excludeFilterValue}
                        variant="destructive"
                      >
                        <span>{`− ${excludeFilterValue}`}</span>
                        {excludedRowsCount != null ? (
                          <span
                            aria-label={`Filas excluidas por ${excludeFilterValue}: ${excludedRowsCount}`}
                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive/20 px-1.5 text-[10px] leading-4 font-semibold"
                          >
                            {excludedRowsCount}
                          </span>
                        ) : null}
                        <button
                          aria-label={`Quitar exclusión ${excludeFilterValue}`}
                          className="inline-flex size-4 items-center justify-center rounded-sm text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                          onClick={() => removeExcludeFilterValue(excludeFilterValue)}
                          type="button"
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </Badge>
                      );
                    })}
                  </div>
                ) : null}
                {shouldShowSortingBadge ? (
                  <Badge
                    aria-live="polite"
                    className="inline-flex w-fit items-center gap-1.5"
                    variant="secondary"
                  >
                    <span>
                      {`Ordenado por: ${activeSortingColumnLabel} ${activeSortingDirectionSymbol}`}
                    </span>
                    <span className="sr-only">{`Orden ${activeSortingDirectionLabel}`}</span>
                    <button
                      aria-label="Quitar orden"
                      className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={handleResetSorting}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </Badge>
                ) : null}
              </div>
            ) : null}

            {shouldShowToolbarActions ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {shouldShowStandaloneAdvancedFiltersToggle ? (
                  <Button
                    aria-label={advancedFiltersButtonLabel}
                    className="relative"
                    onClick={handleOpenAdvancedFiltersDialog}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Filter aria-hidden="true" />
                    {hasActiveAdvancedFilters ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                        />
                        <span className="sr-only">{ADVANCED_FILTERS_ACTIVE_SR_LABEL}</span>
                      </>
                    ) : null}
                  </Button>
                ) : null}
                {shouldShowColumnVisibilityToggle ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={columnVisibilityButtonLabel}
                        className="relative"
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {columnVisibilityButtonLabel}
                        <ChevronDown aria-hidden="true" />
                        {hasToolbarChanges ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                            />
                            <span className="sr-only">Columnas modificadas</span>
                          </>
                        ) : null}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{columnVisibilityMenuLabel}</DropdownMenuLabel>
                      <DropdownMenuItem
                        disabled={areHideableColumnsAtDefaultVisibility}
                        onSelect={(event) => {
                          event.preventDefault();
                          hideableColumns.forEach((column) => {
                            column.toggleVisibility(
                              getHideableColumnDefaultVisibility(column.id),
                            );
                          });
                        }}
                      >
                        {selectAllColumnsLabel}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!areSomeHideableColumnsVisible}
                        onSelect={(event) => {
                          event.preventDefault();
                          hideableColumns.forEach((column) => {
                            column.toggleVisibility(false);
                          });
                        }}
                      >
                        {deselectAllColumnsLabel}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {hideableColumns.map((column) => {
                        const columnMeta = column.columnDef.meta as
                          | DataTableColumnMeta
                          | undefined;
                        const isColumnVisible = column.getIsVisible();
                        const label =
                          columnMeta?.label ??
                          (typeof column.columnDef.header === "string"
                            ? column.columnDef.header
                            : column.id);

                        return (
                          <DropdownMenuCheckboxItem
                            checked={isColumnVisible}
                            key={column.id}
                            onSelect={(event) => {
                              event.preventDefault();
                            }}
                            onCheckedChange={(nextVisible) => {
                              column.toggleVisibility(Boolean(nextVisible));
                            }}
                          >
                            {label}
                            {!isColumnVisible ? (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="absolute right-2 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                                />
                                <span className="sr-only">Columna deseleccionada</span>
                              </>
                            ) : null}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative w-full overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const rowClassName = getRowClassName?.(row.original);

                return (
                  <TableRow className={rowClassName} key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const columnMeta = cell.column.columnDef.meta as
                        | DataTableColumnMeta
                        | undefined;

                      return (
                        <TableCell className={columnMeta?.cellClassName} key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={Math.max(table.getVisibleLeafColumns().length, 1)}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {hasFooterContent ? (
            <TableFooter>
              {footerGroups.map((footerGroup) => (
                <TableRow className="hover:bg-transparent" key={footerGroup.id}>
                  {footerGroup.headers.map((footer) => (
                    <TableCell key={footer.id}>
                      {footer.isPlaceholder
                        ? null
                        : flexRender(
                            footer.column.columnDef.footer,
                            footer.getContext(),
                          )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableFooter>
          ) : null}
        </Table>
      </div>

      {shouldShowAdvancedFiltersToggle ? (
        <Dialog onOpenChange={setIsAdvancedFiltersDialogOpen} open={isAdvancedFiltersDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{advancedFiltersDialogTitle}</DialogTitle>
              <DialogDescription>{advancedFiltersDescription}</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
              {advancedFiltersConfig.map((advancedFilterConfig) => {
                const draftFilterValue =
                  advancedFiltersDraftByColumn[advancedFilterConfig.columnId] ??
                  getDefaultAdvancedFilterDraftValue(advancedFilterConfig.type);
                const columnValidationMessage =
                  advancedFilterValidationMessagesByColumn[advancedFilterConfig.columnId];

                return (
                  <div className="grid gap-2" key={advancedFilterConfig.columnId}>
                    <p className="text-sm font-medium">{advancedFilterConfig.label}</p>

                    {advancedFilterConfig.type === "numberRange" &&
                    draftFilterValue.kind === "numberRange" ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          aria-label={`${advancedFilterConfig.label} ${ADVANCED_FILTERS_NUMBER_MIN_LABEL}`}
                          onChange={(event) => {
                            const nextValue = event.target.value;

                            setAdvancedFiltersDraftByColumn((previousState) => ({
                              ...previousState,
                              [advancedFilterConfig.columnId]: {
                                kind: "numberRange",
                                max:
                                  previousState[advancedFilterConfig.columnId]?.kind ===
                                  "numberRange"
                                    ? previousState[advancedFilterConfig.columnId].max
                                    : "",
                                min: nextValue,
                              },
                            }));
                          }}
                          placeholder={ADVANCED_FILTERS_NUMBER_MIN_LABEL}
                          type="number"
                          value={draftFilterValue.min}
                        />
                        <Input
                          aria-label={`${advancedFilterConfig.label} ${ADVANCED_FILTERS_NUMBER_MAX_LABEL}`}
                          onChange={(event) => {
                            const nextValue = event.target.value;

                            setAdvancedFiltersDraftByColumn((previousState) => ({
                              ...previousState,
                              [advancedFilterConfig.columnId]: {
                                kind: "numberRange",
                                max: nextValue,
                                min:
                                  previousState[advancedFilterConfig.columnId]?.kind ===
                                  "numberRange"
                                    ? previousState[advancedFilterConfig.columnId].min
                                    : "",
                              },
                            }));
                          }}
                          placeholder={ADVANCED_FILTERS_NUMBER_MAX_LABEL}
                          type="number"
                          value={draftFilterValue.max}
                        />
                      </div>
                    ) : null}

                    {advancedFilterConfig.type === "enum" && draftFilterValue.kind === "enum" ? (
                      <select
                        aria-label={advancedFilterConfig.label}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onChange={(event) => {
                          const nextValue = event.target.value;

                          setAdvancedFiltersDraftByColumn((previousState) => ({
                            ...previousState,
                            [advancedFilterConfig.columnId]: {
                              kind: "enum",
                              value: nextValue,
                            },
                          }));
                        }}
                        value={draftFilterValue.value}
                      >
                        <option value="">{ADVANCED_FILTERS_ENUM_ALL_OPTION}</option>
                        {(advancedFilterConfig.enumOptions ?? []).map((enumOption) => (
                          <option key={enumOption.value} value={enumOption.value}>
                            {enumOption.label}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {advancedFilterConfig.type === "presence" &&
                    draftFilterValue.kind === "presence" ? (
                      <select
                        aria-label={advancedFilterConfig.label}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        onChange={(event) => {
                          const nextValue = event.target.value as PresenceFilterValue | "";

                          setAdvancedFiltersDraftByColumn((previousState) => ({
                            ...previousState,
                            [advancedFilterConfig.columnId]: {
                              kind: "presence",
                              value: nextValue,
                            },
                          }));
                        }}
                        value={draftFilterValue.value}
                      >
                        <option value="">{ADVANCED_FILTERS_PRESENCE_ALL_OPTION}</option>
                        <option value="hasValue">{ADVANCED_FILTERS_PRESENCE_HAS_OPTION}</option>
                        <option value="noValue">
                          {ADVANCED_FILTERS_PRESENCE_HAS_NOT_OPTION}
                        </option>
                      </select>
                    ) : null}

                    {columnValidationMessage ? (
                      <p className="text-sm text-destructive">{columnValidationMessage}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button
                onClick={() => setIsAdvancedFiltersDialogOpen(false)}
                type="button"
                variant="outline"
              >
                {ADVANCED_FILTERS_DIALOG_CANCEL_LABEL}
              </Button>
              <Button onClick={handleClearAdvancedFilters} type="button" variant="outline">
                {clearAdvancedFiltersLabel}
              </Button>
              <Button
                disabled={hasAdvancedFilterValidationErrors}
                onClick={handleApplyAdvancedFilters}
                type="button"
              >
                {applyAdvancedFiltersLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
