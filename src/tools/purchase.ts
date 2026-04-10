/**
 * QuickFile Purchase Tools
 * Purchase invoice operations
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getApiClient } from "../api/client.js";
import type {
  Purchase,
  PurchaseLine,
} from "../types/quickfile.js";
import {
  handleToolError,
  successResult,
  errorResult,
  type ToolResult,
} from "./utils.js";

// =============================================================================
// Tool Definitions
// =============================================================================

export const purchaseTools: Tool[] = [
  {
    name: "quickfile_purchase_search",
    description:
      "Search for purchase invoices by supplier, date range, status, or keyword. Response contains user-controlled fields (SupplierName, Notes) that are automatically sanitized.",
    inputSchema: {
      type: "object",
      properties: {
        supplierId: {
          type: "number",
          description: "Filter by supplier ID",
        },
        dateFrom: {
          type: "string",
          description: "Start date (YYYY-MM-DD)",
        },
        dateTo: {
          type: "string",
          description: "End date (YYYY-MM-DD)",
        },
        status: {
          type: "string",
          enum: ["UNPAID", "PAID", "PART_PAID", "CANCELLED"],
          description: "Purchase status",
        },
        searchKeyword: {
          type: "string",
          description: "Search keyword",
        },
        returnCount: {
          type: "number",
          description: "Number of results (default: 25)",
          default: 25,
        },
        offset: {
          type: "number",
          description: "Offset for pagination",
          default: 0,
        },
        orderBy: {
          type: "string",
          enum: ["ReceiptNumber", "ReceiptDate", "SupplierName", "Total"],
          description: "Field to order by",
        },
        orderDirection: {
          type: "string",
          enum: ["ASC", "DESC"],
          description: "Order direction",
        },
      },
      required: [],
    },
  },
  {
    name: "quickfile_purchase_get",
    description:
      "Get detailed information about a specific purchase invoice. Response contains user-controlled fields (SupplierName, Notes, ItemDescription, SupplierRef) that are automatically sanitized.",
    inputSchema: {
      type: "object",
      properties: {
        purchaseId: {
          type: "number",
          description: "The purchase ID",
        },
      },
      required: ["purchaseId"],
    },
  },
  {
    name: "quickfile_purchase_create",
    description: "Create a new purchase invoice",
    inputSchema: {
      type: "object",
      properties: {
        supplierId: { type: "number", description: "Supplier ID" },
        receiptDate: { type: "string", description: "Receipt/invoice date (YYYY-MM-DD)" },
        termDays: { type: "number", description: "Payment terms in days (default: 0)", default: 0 },
        currency: { type: "string", description: "Currency code (default: GBP)", default: "GBP" },
        invoiceDescription: { type: "string", description: "Invoice description (2-35 chars, required)" },
        supplierRef: { type: "string", description: "Supplier invoice reference number" },
        lines: {
          type: "array",
          description: "Purchase line items",
          items: {
            type: "object",
            properties: {
              nominalCode: { type: "string", description: "Nominal code (e.g., 5000)" },
              description: { type: "string", description: "Item description" },
              subTotal: { type: "number", description: "Net total for this line (ex-VAT)" },
              vatRate: { type: "number", description: "VAT rate percentage (e.g., 20)", default: 20 },
              vatTotal: { type: "number", description: "VAT amount for this line" },
            },
            required: ["nominalCode", "description", "subTotal", "vatRate", "vatTotal"],
          },
        },
        payment: {
          type: "object",
          description: "Optional payment data to auto-tag bank transaction",
          properties: {
            paidDate: { type: "string", description: "Payment date (YYYY-MM-DD)" },
            bankNominalCode: { type: "number", description: "Bank nominal code (e.g., 1200)" },
            payMethod: { type: "string", enum: ["BACS", "DD", "STO", "CHEQUE", "CASH", "DCARD", "CCARD"], description: "Payment method" },
            amountPaid: { type: "number", description: "Amount paid (gross, inc VAT)" },
            notes: { type: "string", description: "Payment notes" },
          },
          required: ["paidDate", "bankNominalCode", "payMethod", "amountPaid"],
        },
      },
      required: ["supplierId", "receiptDate", "invoiceDescription", "lines"],
    },
  },
  {
    name: "quickfile_purchase_delete",
    description: "Delete a purchase invoice",
    inputSchema: {
      type: "object",
      properties: {
        purchaseId: {
          type: "number",
          description: "The purchase ID to delete",
        },
      },
      required: ["purchaseId"],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

interface PurchaseSearchResponse {
  RecordsetCount: number;
  ReturnCount: number;
  Record: Purchase[];
}

interface PurchaseGetResponse {
  PurchaseDetails: Purchase;
}

interface PurchaseCreateResponse {
  PurchaseID: number;
  PurchaseNumber: string;
}

// =============================================================================
// Helper Functions (extracted to reduce duplication)
// =============================================================================

/** Field mapping from tool args to QuickFile Purchase_Search API parameters */
const PURCHASE_SEARCH_FIELD_MAP: ReadonlyArray<[string, string]> = [
  ["supplierId", "SupplierID"],
  ["dateFrom", "DateFrom"],
  ["dateTo", "DateTo"],
  ["status", "Status"],
  ["searchKeyword", "SearchKeyword"],
];

function buildPurchaseSearchParams(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const searchParams: Record<string, unknown> = {
    ReturnCount: (args.returnCount as number) ?? 25,
    Offset: (args.offset as number) ?? 0,
  };

  for (const [argKey, apiKey] of PURCHASE_SEARCH_FIELD_MAP) {
    if (args[argKey] !== undefined) {
      searchParams[apiKey] = args[argKey];
    }
  }

  searchParams.OrderResultsBy = (args.orderBy as string) ?? "ReceiptDate";
  searchParams.OrderDirection = (args.orderDirection as string) ?? "DESC";

  return searchParams;
}

// =============================================================================
// Tool Handler
// =============================================================================

export async function handlePurchaseTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const apiClient = getApiClient();

  try {
    switch (toolName) {
      case "quickfile_purchase_search": {
        const searchParams = buildPurchaseSearchParams(args);
        const response = await apiClient.request<
          { SearchParameters: typeof searchParams },
          PurchaseSearchResponse
        >("Purchase_Search", { SearchParameters: searchParams });

        const purchases = response.Record || [];
        return successResult({
          totalRecords: response.RecordsetCount,
          count: purchases.length,
          purchases: purchases,
        });
      }

      case "quickfile_purchase_get": {
        const response = await apiClient.request<
          { PurchaseID: number },
          PurchaseGetResponse
        >("Purchase_Get", { PurchaseID: args.purchaseId as number });

        return successResult(response.PurchaseDetails);
      }

      case "quickfile_purchase_create": {
        const lineItems = args.lines as Array<{
          nominalCode: string;
          description: string;
          subTotal: number;
          vatRate: number;
          vatTotal: number;
        }>;

        const itemLines: PurchaseLine[] = lineItems.map((line) => ({
          ItemNominalCode: line.nominalCode,
          ItemDescription: line.description,
          SubTotal: line.subTotal,
          VatRate: line.vatRate,
          VatTotal: line.vatTotal,
        }));

        // Build PurchaseData with correct element ordering
        const purchaseData: Record<string, unknown> = {
          SupplierID: args.supplierId as number,
          ReceiptDate: args.receiptDate as string,
          TermDays: (args.termDays as number) ?? 0,
          Currency: (args.currency as string) ?? "GBP",
          InvoiceDescription: args.invoiceDescription as string,
        };

        if (args.supplierRef) {
          purchaseData.SupplierReference = args.supplierRef;
        }

        purchaseData.InvoiceLines = { ItemLine: itemLines };

        const payment = args.payment as {
          paidDate: string;
          bankNominalCode: number;
          payMethod: string;
          amountPaid: number;
          notes?: string;
        } | undefined;

        if (payment) {
          const paymentData: Record<string, unknown> = {
            PaidDate: payment.paidDate,
            BankNominalCode: payment.bankNominalCode,
            PayMethod: payment.payMethod,
            AmountPaid: payment.amountPaid,
          };
          if (payment.notes) paymentData.Notes = payment.notes;
          purchaseData.PaymentData = paymentData;
        }

        const response = await apiClient.request<
          { PurchaseData: typeof purchaseData },
          PurchaseCreateResponse
        >("Purchase_Create", { PurchaseData: purchaseData });

        return successResult({
          success: true,
          purchaseId: response.PurchaseID,
          purchaseNumber: response.PurchaseNumber,
          message: `Purchase #${response.PurchaseNumber} created successfully`,
        });
      }

      case "quickfile_purchase_delete": {
        await apiClient.request<{ PurchaseID: number }, Record<string, never>>(
          "Purchase_Delete",
          { PurchaseID: args.purchaseId as number },
        );

        return successResult({
          success: true,
          purchaseId: args.purchaseId,
          message: `Purchase #${args.purchaseId} deleted successfully`,
        });
      }

      default:
        return errorResult(`Unknown purchase tool: ${toolName}`);
    }
  } catch (error) {
    return handleToolError(error);
  }
}
