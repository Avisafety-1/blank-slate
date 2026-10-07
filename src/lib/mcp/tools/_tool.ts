import { defineTool, type ToolDefinition } from "@lovable.dev/mcp-js";

// The app bundles zod 3.25.76 while @lovable.dev/mcp-js's published types were
// built against zod 3.23.8. The two copies have structurally incompatible
// ZodIssue/ContentBlock types, so tool definitions written with the app's zod
// are not directly assignable to mcp-js's ToolDefinition even though they are
// runtime-compatible. This wrapper relaxes only the compile-time typing;
// runtime behavior is unchanged.
export function defineMcpTool(def: Record<string, unknown>) {
  return defineTool(def as unknown as ToolDefinition<any, any>);
}
