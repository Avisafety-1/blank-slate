import { defineTool, type ToolDefinition } from "@lovable.dev/mcp-js";

// The app bundles zod 3.25.76 while @lovable.dev/mcp-js's published types were
// built against zod 3.23.8. The two copies have structurally incompatible
// ZodIssue types, so a raw schema shape from the app's zod is not assignable to
// mcp-js's ZodRawShape even though they are runtime-compatible. This wrapper
// relaxes only the schema typing; runtime behavior is unchanged.
type AnyShape = Record<string, unknown>;

export function defineMcpTool<
  TIn extends AnyShape | undefined = undefined,
  TOut extends AnyShape | undefined = undefined,
>(
  def: Omit<ToolDefinition<any, any>, "inputSchema" | "outputSchema"> & {
    inputSchema?: TIn;
    outputSchema?: TOut;
  },
) {
  return defineTool(def as unknown as ToolDefinition<any, any>);
}
