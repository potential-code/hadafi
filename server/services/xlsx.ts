import type { Feature } from "write-excel-file/node";
import {
  getCellAddress,
  getOrderOfSiblings,
  getSelfClosingTagMarkup,
  insertElementMarkupAccordingToOrderOfSiblings,
} from "write-excel-file/utility";

/**
 * Shared bits for the Excel files Hadafi writes with write-excel-file
 * (admin exports). Ported from SMEEP's server/services/xlsx.ts.
 */

/** Hadafi's brand colour (the `--ui-brand` token), for header rows. White text on it is 5.3:1. */
export const BRAND_HEX = "#C8106A";

/**
 * Filter dropdowns on the first row, across `columnCount` columns.
 * write-excel-file has no built-in auto filter, so this inserts the
 * <autoFilter> element in the sheet XML where the format requires it.
 */
export function autoFilter(columnCount: number): Feature<Buffer> {
  const ref = `${getCellAddress(0, 0)}:${getCellAddress(0, columnCount - 1)}`;
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml) =>
            insertElementMarkupAccordingToOrderOfSiblings(
              xml,
              getSelfClosingTagMarkup("autoFilter", { ref }),
              getOrderOfSiblings("xl/worksheets/sheet{id}.xml", "worksheet") ?? [],
              "worksheet",
            ),
        },
      },
    },
  };
}
