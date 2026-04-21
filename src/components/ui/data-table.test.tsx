import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./data-table";

type TableRow = {
  label: string;
  paid: boolean;
};

describe("DataTable", () => {
  it("applies custom row class names based on the provided callback", () => {
    const rows: TableRow[] = [
      { label: "Pagado", paid: true },
      { label: "Pendiente", paid: false },
    ];

    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    render(
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
        getRowClassName={(row) => (row.paid ? "paid-row" : undefined)}
      />,
    );

    expect(screen.getByText("Pagado").closest("tr")).toHaveClass("paid-row");
    expect(screen.getByText("Pendiente").closest("tr")).not.toHaveClass(
      "paid-row",
    );
  });

  it("adds and removes normalized unique exclusion tags from the toolbar", async () => {
    const user = userEvent.setup();
    const rows: TableRow[] = [{ label: "Agua", paid: true }];
    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    function DataTableWithExclusions() {
      const [excludeFilterValues, setExcludeFilterValues] = useState<string[]>([]);

      return (
        <DataTable
          columns={columns}
          data={rows}
          emptyMessage="Sin datos"
          excludeFilterLabel="Excluir resultados"
          excludeFilterValues={excludeFilterValues}
          filterColumnId="label"
          onExcludeFilterValuesChange={setExcludeFilterValues}
          showExcludeFilterToggle
        />
      );
    }

    render(<DataTableWithExclusions />);

    expect(
      screen.queryByText("Filtros de exclusión activos"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Mostrar filtros de exclusión" }),
    );

    const exclusionInput = screen.getByRole("textbox", {
      name: "Excluir resultados",
    });

    await user.type(exclusionInput, "   {enter}");

    expect(
      screen.getByText("Ingresá un texto para excluir."),
    ).toBeInTheDocument();

    await user.type(exclusionInput, " Agua {enter}");

    expect(screen.getByText("− Agua")).toBeInTheDocument();
    expect(screen.getByText("Filtros de exclusión activos")).toBeInTheDocument();
    expect(
      screen.queryByText("Ingresá un texto para excluir."),
    ).not.toBeInTheDocument();

    await user.type(exclusionInput, "água{enter}");

    expect(screen.getAllByText("− Agua")).toHaveLength(1);
    expect(screen.getByText("Esa exclusión ya está activa.")).toBeInTheDocument();

    await user.type(exclusionInput, "internet");

    expect(
      screen.queryByText("Esa exclusión ya está activa."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Limpiar filtros excluidos" }),
    );

    expect(screen.queryByText("− Agua")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Filtros de exclusión activos"),
    ).not.toBeInTheDocument();

    await user.type(exclusionInput, "Agua{enter}");

    await user.click(screen.getByRole("button", { name: "Quitar exclusión Agua" }));

    expect(screen.queryByText("− Agua")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Filtros de exclusión activos"),
    ).not.toBeInTheDocument();
  });

  it("adds a new exclusion when pressing Enter on the main filter with spaces before the leading minus", async () => {
    const user = userEvent.setup();
    const rows: TableRow[] = [
      { label: "Internet", paid: true },
      { label: "Agua", paid: false },
    ];
    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    function DataTableWithMainAndExcludeFilters() {
      const [excludeFilterValues, setExcludeFilterValues] = useState<string[]>([]);

      return (
        <DataTable
          columns={columns}
          data={rows}
          emptyMessage="Sin datos"
          excludeFilterValues={excludeFilterValues}
          filterColumnId="label"
          onExcludeFilterValuesChange={setExcludeFilterValues}
          showExcludeFilterToggle
        />
      );
    }

    render(<DataTableWithMainAndExcludeFilters />);

    const mainFilterInput = screen.getByRole("textbox", { name: "Filtrar" });
    await user.type(mainFilterInput, "   -internet");

    expect(mainFilterInput).toHaveClass("text-red-400");
    expect(
      screen.getByText("Estás escribiendo una exclusión. Presioná Enter para aplicarla."),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(screen.getByText("− internet")).toBeInTheDocument();
    expect(mainFilterInput).toHaveValue("");
    expect(mainFilterInput).not.toHaveClass("text-red-400");
    expect(
      screen.queryByText("Estás escribiendo una exclusión. Presioná Enter para aplicarla."),
    ).not.toBeInTheDocument();
  });

  it("renders per-tag excluded rows counters and unique excluded rows summary", () => {
    const rows: TableRow[] = [
      { label: "Préstamo auto", paid: false },
      { label: "Préstamo tarjeta", paid: true },
    ];
    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    render(
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
        excludeFilterRowsCountByValue={{
          auto: 2,
          tarjeta: 2,
        }}
        excludeFilterUniqueRowsCount={3}
        excludeFilterValues={["auto", "tarjeta"]}
        filterColumnId="label"
        showExcludeFilterToggle
      />,
    );

    expect(
      screen.getByLabelText("Filas excluidas por auto: 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Filas excluidas por tarjeta: 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Total de filas excluidas únicas: 3"),
    ).toBeInTheDocument();
    expect(screen.getByText("Total excluidas:")).toBeInTheDocument();
  });

  it("clears all exclusions from the summary badge action", async () => {
    const user = userEvent.setup();
    const rows: TableRow[] = [
      { label: "Préstamo auto", paid: false },
      { label: "Préstamo tarjeta", paid: true },
    ];
    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    function DataTableWithSummaryAndExclusions() {
      const [excludeFilterValues, setExcludeFilterValues] = useState<string[]>([
        "auto",
        "tarjeta",
      ]);

      return (
        <DataTable
          columns={columns}
          data={rows}
          emptyMessage="Sin datos"
          excludeFilterRowsCountByValue={{
            auto: 2,
            tarjeta: 2,
          }}
          excludeFilterUniqueRowsCount={3}
          excludeFilterValues={excludeFilterValues}
          filterColumnId="label"
          onExcludeFilterValuesChange={setExcludeFilterValues}
          showExcludeFilterToggle
        />
      );
    }

    render(<DataTableWithSummaryAndExclusions />);

    expect(screen.getByText("− auto")).toBeInTheDocument();
    expect(screen.getByText("− tarjeta")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Total de filas excluidas únicas: 3"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Quitar todas las exclusiones" }),
    );

    expect(screen.queryByText("− auto")).not.toBeInTheDocument();
    expect(screen.queryByText("− tarjeta")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Total de filas excluidas únicas: 3"),
    ).not.toBeInTheDocument();
  });

  it("does not render per-tag excluded rows counters when metrics are not provided", () => {
    const rows: TableRow[] = [
      { label: "Préstamo auto", paid: false },
      { label: "Préstamo tarjeta", paid: true },
    ];
    const columns: ColumnDef<TableRow>[] = [
      {
        accessorKey: "label",
        header: "Estado",
      },
    ];

    render(
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
        excludeFilterValues={["auto", "tarjeta"]}
        filterColumnId="label"
        showExcludeFilterToggle
      />,
    );

    expect(screen.getByText("− auto")).toBeInTheDocument();
    expect(screen.getByText("− tarjeta")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Filas excluidas por auto:/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Filas excluidas por tarjeta:/),
    ).not.toBeInTheDocument();
  });

  it("applies numeric range advanced filters from the modal", async () => {
    const user = userEvent.setup();
    const rows = [
      { amount: 10, label: "Item 10", link: "", status: "none" },
      { amount: 25, label: "Item 25", link: "https://example.com", status: "pending" },
      { amount: 40, label: "Item 40", link: "https://example.com", status: "sent" },
    ];
    const columns: ColumnDef<(typeof rows)[number]>[] = [
      {
        accessorKey: "label",
        header: "Descripción",
      },
      {
        accessorKey: "amount",
        cell: ({ row }) => String(row.original.amount),
        filterFn: (row, _columnId, filterValue) => {
          if (
            !filterValue ||
            typeof filterValue !== "object" ||
            (filterValue as { kind?: string }).kind !== "numberRange"
          ) {
            return true;
          }

          const parsedFilterValue = filterValue as {
            kind: "numberRange";
            max?: number;
            min?: number;
          };
          const rowAmount = row.original.amount;

          if (parsedFilterValue.min != null && rowAmount < parsedFilterValue.min) {
            return false;
          }

          if (parsedFilterValue.max != null && rowAmount > parsedFilterValue.max) {
            return false;
          }

          return true;
        },
        header: "Monto",
      },
      {
        accessorKey: "status",
        header: "Estado",
      },
      {
        accessorKey: "link",
        header: "Link",
      },
    ];

    render(
      <DataTable
        advancedFiltersConfig={[
          {
            columnId: "amount",
            label: "Monto",
            type: "numberRange",
          },
        ]}
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
        filterColumnId="label"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros avanzados" }));
    await user.type(screen.getByRole("spinbutton", { name: "Monto Mínimo" }), "20");
    await user.type(screen.getByRole("spinbutton", { name: "Monto Máximo" }), "30");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.queryByText("Item 10")).not.toBeInTheDocument();
    expect(screen.getByText("Item 25")).toBeInTheDocument();
    expect(screen.queryByText("Item 40")).not.toBeInTheDocument();
    expect(screen.getByText("Filtros avanzados activos")).toBeInTheDocument();
  });

  it("renders advanced filters toggle when only advanced filters are configured", () => {
    const rows = [{ amount: 10, label: "Item 10" }];
    const columns: ColumnDef<(typeof rows)[number]>[] = [
      {
        accessorKey: "label",
        header: "Descripción",
      },
      {
        accessorKey: "amount",
        header: "Monto",
      },
    ];

    render(
      <DataTable
        advancedFiltersConfig={[
          {
            columnId: "amount",
            label: "Monto",
            type: "numberRange",
          },
        ]}
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Filtros avanzados" }),
    ).toBeInTheDocument();
  });

  it("applies and clears enum and presence advanced filters", async () => {
    const user = userEvent.setup();
    const rows = [
      { label: "Sin envio", link: "", status: "none" },
      { label: "Pendiente con link", link: "https://example.com/pending", status: "pending" },
      { label: "Enviado con link", link: "https://example.com/sent", status: "sent" },
    ];
    const columns: ColumnDef<(typeof rows)[number]>[] = [
      {
        accessorKey: "label",
        header: "Descripción",
      },
      {
        accessorKey: "status",
        filterFn: (row, _columnId, filterValue) => {
          if (
            !filterValue ||
            typeof filterValue !== "object" ||
            (filterValue as { kind?: string }).kind !== "enum"
          ) {
            return true;
          }

          return row.original.status === (filterValue as { value: string }).value;
        },
        header: "Estado",
      },
      {
        accessorKey: "link",
        filterFn: (row, _columnId, filterValue) => {
          if (
            !filterValue ||
            typeof filterValue !== "object" ||
            (filterValue as { kind?: string }).kind !== "presence"
          ) {
            return true;
          }

          const hasValue = row.original.link.trim().length > 0;

          return (filterValue as { value: "hasValue" | "noValue" }).value ===
            "hasValue"
            ? hasValue
            : !hasValue;
        },
        header: "Link",
      },
    ];

    render(
      <DataTable
        advancedFiltersConfig={[
          {
            columnId: "status",
            enumOptions: [
              { label: "Pendiente", value: "pending" },
              { label: "Enviado", value: "sent" },
              { label: "Sin estado", value: "none" },
            ],
            label: "Estado",
            type: "enum",
          },
          {
            columnId: "link",
            label: "Link",
            type: "presence",
          },
        ]}
        columns={columns}
        data={rows}
        emptyMessage="Sin datos"
        filterColumnId="label"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros avanzados" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Estado" }),
      "pending",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Link" }),
      "hasValue",
    );
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.queryByText("Sin envio")).not.toBeInTheDocument();
    expect(screen.getByText("Pendiente con link")).toBeInTheDocument();
    expect(screen.queryByText("Enviado con link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filtros avanzados" }));
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(screen.getByText("Sin envio")).toBeInTheDocument();
    expect(screen.getByText("Pendiente con link")).toBeInTheDocument();
    expect(screen.getByText("Enviado con link")).toBeInTheDocument();
    expect(
      screen.queryByText("Filtros avanzados activos"),
    ).not.toBeInTheDocument();
  });
});
