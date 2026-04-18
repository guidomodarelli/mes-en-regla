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

    await user.click(screen.getByRole("button", { name: "Quitar exclusión Agua" }));

    expect(screen.queryByText("− Agua")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Filtros de exclusión activos"),
    ).not.toBeInTheDocument();
  });
});
