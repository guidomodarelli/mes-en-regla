import type { ReactNode } from "react";

const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

interface SearchCharWithSourceIndex {
  char: string;
  sourceIndex: number;
}

export interface FuzzyMatchRank {
  contiguousPairCount: number;
  gapCount: number;
  longestRun: number;
  matchedChars: number;
  maxGap: number;
  span: number;
  startIndex: number;
}

export function compareFuzzyMatchRank(
  leftRank: FuzzyMatchRank,
  rightRank: FuzzyMatchRank,
): number {
  if (leftRank.longestRun !== rightRank.longestRun) {
    return rightRank.longestRun - leftRank.longestRun;
  }

  if (leftRank.contiguousPairCount !== rightRank.contiguousPairCount) {
    return rightRank.contiguousPairCount - leftRank.contiguousPairCount;
  }

  if (leftRank.gapCount !== rightRank.gapCount) {
    return leftRank.gapCount - rightRank.gapCount;
  }

  if (leftRank.maxGap !== rightRank.maxGap) {
    return leftRank.maxGap - rightRank.maxGap;
  }

  if (leftRank.span !== rightRank.span) {
    return leftRank.span - rightRank.span;
  }

  if (leftRank.startIndex !== rightRank.startIndex) {
    return leftRank.startIndex - rightRank.startIndex;
  }

  return 0;
}

export function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLocaleLowerCase();
}

function getSearchCharsWithSourceIndices(
  value: string,
): SearchCharWithSourceIndex[] {
  const chars: SearchCharWithSourceIndex[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const normalizedChar = normalizeSearchValue(value[index]);

    if (!normalizedChar) {
      continue;
    }

    for (const char of normalizedChar) {
      chars.push({
        char,
        sourceIndex: index,
      });
    }
  }

  return chars;
}

export function getExactMatchIndices(value: string, query: string): number[] | null {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (!normalizedQuery) {
    return [];
  }

  const valueChars = getSearchCharsWithSourceIndices(value);
  const queryChars = Array.from(normalizedQuery);

  if (queryChars.length > valueChars.length) {
    return null;
  }

  for (let valueIndex = 0; valueIndex <= valueChars.length - queryChars.length; valueIndex += 1) {
    let isExactMatch = true;

    for (let queryIndex = 0; queryIndex < queryChars.length; queryIndex += 1) {
      if (valueChars[valueIndex + queryIndex].char !== queryChars[queryIndex]) {
        isExactMatch = false;
        break;
      }
    }

    if (!isExactMatch) {
      continue;
    }

    const matchStartSourceIndex = valueChars[valueIndex].sourceIndex;
    const matchEndSourceIndex = valueChars[valueIndex + queryChars.length - 1].sourceIndex;

    return Array.from(
      { length: matchEndSourceIndex - matchStartSourceIndex + 1 },
      (_, index) => matchStartSourceIndex + index,
    );
  }

  return null;
}

export function getFuzzyMatchIndices(value: string, query: string): number[] | null {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (!normalizedQuery) {
    return [];
  }

  const valueChars = getSearchCharsWithSourceIndices(value);
  const queryChars = Array.from(normalizedQuery);
  const matchedIndices: number[] = [];
  let valueCursor = 0;

  for (const queryChar of queryChars) {
    let foundAt = -1;

    for (let index = valueCursor; index < valueChars.length; index += 1) {
      if (valueChars[index].char === queryChar) {
        foundAt = index;
        break;
      }
    }

    if (foundAt === -1) {
      return null;
    }

    matchedIndices.push(valueChars[foundAt].sourceIndex);
    valueCursor = foundAt + 1;
  }

  return Array.from(new Set(matchedIndices));
}

export function getFuzzyMatchRank(value: string, query: string): FuzzyMatchRank | null {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (!normalizedQuery) {
    return null;
  }

  const valueChars = getSearchCharsWithSourceIndices(value);
  const queryChars = Array.from(normalizedQuery);
  const matchedSourceIndices: number[] = [];
  let valueCursor = 0;

  for (const queryChar of queryChars) {
    let foundAt = -1;

    for (let index = valueCursor; index < valueChars.length; index += 1) {
      if (valueChars[index].char === queryChar) {
        foundAt = index;
        break;
      }
    }

    if (foundAt === -1) {
      return null;
    }

    matchedSourceIndices.push(valueChars[foundAt].sourceIndex);
    valueCursor = foundAt + 1;
  }

  const startIndex = matchedSourceIndices[0] ?? 0;
  const endIndex = matchedSourceIndices[matchedSourceIndices.length - 1] ?? startIndex;
  let contiguousPairCount = 0;
  let gapCount = 0;
  let longestRun = matchedSourceIndices.length > 0 ? 1 : 0;
  let maxGap = 0;
  let currentRun = matchedSourceIndices.length > 0 ? 1 : 0;

  for (let index = 1; index < matchedSourceIndices.length; index += 1) {
    if (matchedSourceIndices[index] === matchedSourceIndices[index - 1] + 1) {
      contiguousPairCount += 1;
      currentRun += 1;
    } else {
      currentRun = 1;
    }

    if (currentRun > longestRun) {
      longestRun = currentRun;
    }

    const gap = Math.max(matchedSourceIndices[index] - matchedSourceIndices[index - 1] - 1, 0);
    gapCount += gap;

    if (gap > maxGap) {
      maxGap = gap;
    }
  }

  return {
    contiguousPairCount,
    gapCount,
    longestRun,
    matchedChars: queryChars.length,
    maxGap,
    span: Math.max(endIndex - startIndex, 0),
    startIndex,
  };
}

export function renderHighlightedText(
  value: string,
  matchedIndices: number[],
  highlightClassName: string,
  keyPrefix: string,
): ReactNode {
  if (matchedIndices.length === 0) {
    return value;
  }

  const matchedIndexSet = new Set(matchedIndices);
  const highlightedParts: ReactNode[] = [];
  let currentStart = 0;
  let partIndex = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (!matchedIndexSet.has(index)) {
      continue;
    }

    if (currentStart < index) {
      highlightedParts.push(
        <span key={`${keyPrefix}-text-${partIndex}`}>
          {value.slice(currentStart, index)}
        </span>,
      );
      partIndex += 1;
    }

    let matchEnd = index + 1;
    while (matchEnd < value.length && matchedIndexSet.has(matchEnd)) {
      matchEnd += 1;
    }

    highlightedParts.push(
      <mark className={highlightClassName} key={`${keyPrefix}-match-${partIndex}`}>
        {value.slice(index, matchEnd)}
      </mark>,
    );
    partIndex += 1;
    currentStart = matchEnd;
    index = matchEnd - 1;
  }

  if (currentStart < value.length) {
    highlightedParts.push(
      <span key={`${keyPrefix}-text-${partIndex}`}>
        {value.slice(currentStart)}
      </span>,
    );
  }

  return highlightedParts;
}
