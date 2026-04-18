import { render, screen } from "@testing-library/react";

import { getExactMatchIndices, renderHighlightedText } from "./fuzzy-search";

describe("getExactMatchIndices", () => {
  it("returns an empty array when the query is blank", () => {
    expect(getExactMatchIndices("Agua", "   ")).toEqual([]);
  });

  it("matches exact contiguous text with accent-insensitive normalization", () => {
    expect(getExactMatchIndices("Préstamo tarjeta", "PREST")).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("does not match non-contiguous text", () => {
    expect(getExactMatchIndices("AxxBxxC gasto", "abc")).toBeNull();
  });

  it("returns null when the query is longer than the value", () => {
    expect(getExactMatchIndices("Agua", "aguitas")).toBeNull();
  });

  it("trims query whitespace before matching", () => {
    expect(getExactMatchIndices("Préstamo tarjeta", "  tarjeta  ")).toEqual([
      9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});

describe("renderHighlightedText", () => {
  it("highlights the contiguous segment returned by exact matching", () => {
    const matchIndices = getExactMatchIndices("Préstamo tarjeta", "prest");

    if (matchIndices == null) {
      throw new Error("Expected an exact match for the provided query");
    }

    render(
      <div>
        {renderHighlightedText("Préstamo tarjeta", matchIndices, "exact-highlight")}
      </div>,
    );

    expect(screen.getByText("Prést", { selector: "mark" })).toHaveClass(
      "exact-highlight",
    );
    expect(screen.getByText("amo tarjeta", { selector: "span" })).toBeInTheDocument();
  });
});
