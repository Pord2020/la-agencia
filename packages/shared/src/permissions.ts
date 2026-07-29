// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/**
 * @module permissions
 * Sensitive actions the agency must confirm with the human client.
 *
 * Product rule: non-technical users should prefer “let the team work” and only
 * block truly destructive or expensive external actions.
 */

/** Categories of work that may require a human gate. */
export type PermissionKind =
  | "install_dependency"
  | "acquire_resource"
  | "activate_resource"
  | "delete_files"
  | "deploy_production"
  | "spend_heavy"
  | "open_external"
  | "mcp_tool"
  | "shell_dangerous";

export type PermissionDecision =
  "allow_once" | "allow_project_session" | "deny";
export type PermissionRiskLevel = "low" | "medium" | "high" | "critical";
export type PermissionStatus =
  "pending" | "allowed" | "denied" | "expired" | "consumed";

export interface PermissionRequest {
  id: string;
  projectId: string;
  operationId?: string;
  kind: PermissionKind;
  riskLevel: PermissionRiskLevel;
  status: PermissionStatus;
  expiresAt: string;
  /** Short title for the modal (plain language). */
  title: string;
  /** One or two sentences in the client's language. */
  summary: string;
  /** Optional technical detail (collapsed for guided users). */
  technicalDetail?: string;
  agentId?: string;
  createdAt: string;
  /** Recommended default for No-TI: let the team proceed safely. */
  recommended: PermissionDecision;
}

export interface PermissionRecord {
  requestId: string;
  operationId?: string;
  decision: PermissionDecision;
  decidedAt: string;
}
