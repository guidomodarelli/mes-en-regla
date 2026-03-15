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
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
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

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage: string;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  filterColumnId?: string;
  filterLabel?: string;
  filterPlaceholder?: string;
  showColumnVisibilityToggle?: boolean;
  columnVisibilityButtonLabel?: string;
  columnVisibilityMenuLabel?: string;
  resetSortingMenuItemLabel?: string;
  selectAllColumnsLabel?: string;
  deselectAllColumnsLabel?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage,
  sorting: controlledSorting,
  onSortingChange,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange,
  filterColumnId,
  filterLabel = "Filtrar",
  filterPlaceholder = "Filtrar...",
  showColumnVisibilityToggle = false,
  columnVisibilityButtonLabel = "Columnas",
  columnVisibilityMenuLabel = "Mostrar columnas",
  resetSortingMenuItemLabel = "Quitar ordenamiento",
  selectAllColumnsLabel = "Seleccionar todas",
  deselectAllColumnsLabel = "Deseleccionar todas",
}: DataTableProps<TData, TValue>) {
  const [uncontrolledSorting, setUncontrolledSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [uncontrolledColumnVisibility, setUncontrolledColumnVisibility] =
    React.useState<VisibilityState>({});
  const sorting = controlledSorting ?? uncontrolledSorting;
  const columnVisibility = controlledColumnVisibility ?? uncontrolledColumnVisibility;

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
  const areAllHideableColumnsVisible = hideableColumns.every((column) =>
    column.getIsVisible(),
  );
  const areSomeHideableColumnsVisible = hideableColumns.some((column) =>
    column.getIsVisible(),
  );
  const shouldShowColumnVisibilityToggle =
    showColumnVisibilityToggle && hideableColumns.length > 0;
  const hasModifiedColumnVisibility =
    shouldShowColumnVisibilityToggle && !areAllHideableColumnsVisible;
  const shouldShowResetSortingMenuItem =
    shouldShowColumnVisibilityToggle && sorting.length > 0;
  const hasToolbarChanges =
    hasModifiedColumnVisibility || shouldShowResetSortingMenuItem;
  const shouldShowToolbarActions = shouldShowColumnVisibilityToggle;
  const shouldShowToolbar = Boolean(filterColumnId) || shouldShowToolbarActions;
  const footerGroups = table.getFooterGroups();
  const hasFooterContent = footerGroups.some((footerGroup) =>
    footerGroup.headers.some(
      (footer) => !footer.isPlaceholder && footer.column.columnDef.footer != null,
    ),
  );

  const handleResetSorting = React.useCallback(() => {
    handleSortingChange([]);
  }, [handleSortingChange]);

  return (
    <div className="grid gap-4">
      {shouldShowToolbar ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {filterColumnId ? (
              <Input
                aria-label={filterLabel}
                className="w-full max-w-sm"
                onChange={(event) =>
                  table.getColumn(filterColumnId)?.setFilterValue(event.target.value)
                }
                placeholder={filterPlaceholder}
                type="text"
                value={String(table.getColumn(filterColumnId)?.getFilterValue() ?? "")}
              />
            ) : null}

            {shouldShowToolbarActions ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
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
                            <span className="sr-only">Columnas u orden modificados</span>
                          </>
                        ) : null}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!shouldShowResetSortingMenuItem ? (
                        <DropdownMenuLabel>{columnVisibilityMenuLabel}</DropdownMenuLabel>
                      ) : null}
                      {shouldShowResetSortingMenuItem ? (
                        <>
                          <DropdownMenuItem
                            className="pr-8"
                            onSelect={(event) => {
                              event.preventDefault();
                              handleResetSorting();
                            }}
                          >
                            {resetSortingMenuItemLabel}
                            <span
                              aria-hidden="true"
                              className="absolute right-2 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                            />
                            <span className="sr-only">Ordenamiento activo</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>{columnVisibilityMenuLabel}</DropdownMenuLabel>
                        </>
                      ) : null}
                      <DropdownMenuItem
                        disabled={areAllHideableColumnsVisible}
                        onSelect={(event) => {
                          event.preventDefault();
                          hideableColumns.forEach((column) => {
                            column.toggleVisibility(true);
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
                          | { label?: string }
                          | undefined;
                        const label =
                          columnMeta?.label ??
                          (typeof column.columnDef.header === "string"
                            ? column.columnDef.header
                            : column.id);

                        return (
                          <DropdownMenuCheckboxItem
                            checked={column.getIsVisible()}
                            key={column.id}
                            onSelect={(event) => {
                              event.preventDefault();
                            }}
                            onCheckedChange={(nextVisible) => {
                              column.toggleVisibility(Boolean(nextVisible));
                            }}
                          >
                            {label}
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
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
    </div>
  );
}
