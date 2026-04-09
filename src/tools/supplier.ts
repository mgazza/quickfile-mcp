/**
 * QuickFile Supplier Tools
 * Supplier management operations
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getApiClient } from "../api/client.js";
import type { Supplier, SupplierSearchParams } from "../types/quickfile.js";
import {
  handleToolError,
  successResult,
  errorResult,
  cleanParams,
  searchSchemaProperties,
  type ToolResult,
} from "./utils.js";

// =============================================================================
// Tool Definitions
// =============================================================================

export const supplierTools: Tool[] = [
  {
    name: "quickfile_supplier_search",
    description:
      "Search for suppliers by company name, contact name, email, or postcode. Response contains user-controlled fields (CompanyName, contact names) that are automatically sanitized.",
    inputSchema: {
      type: "object",
      properties: {
        ...searchSchemaProperties,
        orderBy: {
          type: "string",
          enum: ["CompanyName", "DateCreated", "SupplierID"],
          description: "Field to order by",
        },
      },
      required: [],
    },
  },
  {
    name: "quickfile_supplier_get",
    description:
      "Get detailed information about a specific supplier. Response contains user-controlled fields (CompanyName, Notes, Address, contact names) that are automatically sanitized.",
    inputSchema: {
      type: "object",
      properties: {
        supplierId: { type: "number", description: "The supplier ID" },
      },
      required: ["supplierId"],
    },
  },
  {
    name: "quickfile_supplier_create",
    description: "Create a new supplier record",
    inputSchema: {
      type: "object",
      properties: {
        companyName: { type: "string" as const, description: "Company or organisation name" },
        firstName: { type: "string" as const, description: "Contact first name" },
        lastName: { type: "string" as const, description: "Contact last name" },
        email: { type: "string" as const, description: "Email address" },
        telephone: { type: "string" as const, description: "Telephone number" },
        website: { type: "string" as const, description: "Website URL" },
        address1: { type: "string" as const, description: "Address line 1" },
        address2: { type: "string" as const, description: "Address line 2" },
        town: { type: "string" as const, description: "Town/City" },
        postcode: { type: "string" as const, description: "Postcode" },
        country: { type: "string" as const, description: "Country ISO code (e.g., GB, US)" },
        vatNumber: { type: "string" as const, description: "VAT registration number" },
        companyRegNo: { type: "string" as const, description: "Company registration number" },
      },
      required: [],
    },
  },
  {
    name: "quickfile_supplier_delete",
    description: "Delete a supplier record (use with caution)",
    inputSchema: {
      type: "object",
      properties: {
        supplierId: {
          type: "number",
          description: "The supplier ID to delete",
        },
      },
      required: ["supplierId"],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

interface SupplierSearchResponse {
  RecordsetCount: number;
  ReturnCount: number;
  Record: Supplier[];
}

interface SupplierGetResponse {
  SupplierDetails: Supplier;
}

interface SupplierCreateResponse {
  SupplierID: number;
}

// =============================================================================
// Tool Handler
// =============================================================================

export async function handleSupplierTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const apiClient = getApiClient();

  try {
    switch (toolName) {
      case "quickfile_supplier_search": {
        const params: SupplierSearchParams = {
          OrderResultsBy:
            (args.orderBy as SupplierSearchParams["OrderResultsBy"]) ??
            "CompanyName",
          OrderDirection:
            (args.orderDirection as SupplierSearchParams["OrderDirection"]) ??
            "ASC",
          ReturnCount: (args.returnCount as number) ?? 25,
          Offset: (args.offset as number) ?? 0,
          CompanyName: args.companyName as string | undefined,
          ContactName: args.contactName as string | undefined,
          Email: args.email as string | undefined,
          Postcode: args.postcode as string | undefined,
        };
        const cleaned = cleanParams(params);
        const response = await apiClient.request<
          { SearchParameters: typeof cleaned },
          SupplierSearchResponse
        >("Supplier_Search", { SearchParameters: cleaned });
        const suppliers = response.Record || [];
        return successResult({
          totalRecords: response.RecordsetCount,
          count: suppliers.length,
          suppliers,
        });
      }

      case "quickfile_supplier_get": {
        const response = await apiClient.request<
          { SupplierID: number },
          SupplierGetResponse
        >("Supplier_Get", { SupplierID: args.supplierId as number });
        return successResult(response.SupplierDetails);
      }

      case "quickfile_supplier_create": {
        const details: Record<string, unknown> = {};
        if (args.companyName) details.CompanyName = args.companyName;
        if (args.telephone) details.ContactTel = args.telephone;
        if (args.address1) details.AddressLine1 = args.address1;
        if (args.address2) details.AddressLine2 = args.address2;
        if (args.town) details.Town = args.town;
        if (args.postcode) details.Postcode = args.postcode;
        if (args.country) details.CountryISO = args.country;
        if (args.firstName) details.ContactFirstName = args.firstName;
        if (args.lastName) details.ContactSurname = args.lastName;
        if (args.email) details.ContactEmail = args.email;
        if (args.website) details.Website = args.website;
        if (args.companyRegNo) details.CompanyNumber = args.companyRegNo;
        if (args.vatNumber) details.VatNumber = args.vatNumber;

        const response = await apiClient.request<
          { SupplierDetails: typeof details },
          SupplierCreateResponse
        >("Supplier_Create", { SupplierDetails: details });
        return successResult({
          success: true,
          supplierId: response.SupplierID,
          message: `Supplier created successfully with ID ${response.SupplierID}`,
        });
      }

      case "quickfile_supplier_delete": {
        await apiClient.request<{ SupplierID: number }, Record<string, never>>(
          "Supplier_Delete",
          { SupplierID: args.supplierId as number },
        );
        return successResult({
          success: true,
          supplierId: args.supplierId,
          message: `Supplier #${args.supplierId} deleted successfully`,
        });
      }

      default:
        return errorResult(`Unknown supplier tool: ${toolName}`);
    }
  } catch (error) {
    return handleToolError(error);
  }
}
