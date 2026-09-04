"use client";

export { tool, defineTools } from "./tool";
export { ModelContext, type ModelContextProps } from "./model-context";
export { ToolConfirmations } from "./confirmations";
export { useToolCalls, useModelContextTools } from "./hooks";
export { isModelContextAvailable } from "./native";
export { NextWebMCPError, type NextWebMCPErrorCode } from "./errors";
export type {
  AnyZodSchema,
  AppRouterInstance,
  ConfirmRequest,
  RegisteredToolInfo,
  ToolAnnotations,
  ToolCallRecord,
  ToolContext,
  ToolDef,
  ToolExecuteOptions,
} from "./types";
