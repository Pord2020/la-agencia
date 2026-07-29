// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

/** Floor leaders — bilingual names, only these talk to the user on the main floor. */

export interface FloorLeader {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  roleEn: string;
  department: string;
  talksToUser: boolean;
  agentFileId: string;
}

export const FLOOR_LEADERS: FloorLeader[] = [
  {
    id: "pau",
    name: "Pau",
    nameEn: "Pau",
    role: "Product Owner",
    roleEn: "Product Owner",
    department: "reception",
    talksToUser: true,
    agentFileId: "product-owner",
  },
  {
    id: "alex",
    name: "Alex",
    nameEn: "Alex",
    role: "Líder Técnico",
    roleEn: "Tech Lead",
    department: "engineering",
    talksToUser: true,
    agentFileId: "tech-lead",
  },
  {
    id: "ana",
    name: "Ana",
    nameEn: "Ana",
    role: "Asistente",
    roleEn: "Assistant",
    department: "helpdesk",
    talksToUser: true,
    agentFileId: "onboarding-guide",
  },
  {
    id: "maya",
    name: "Maya",
    nameEn: "Maya",
    role: "Líder Marketing",
    roleEn: "Marketing Lead",
    department: "marketing",
    talksToUser: true,
    agentFileId: "mkt-positioning",
  },
  {
    id: "leo",
    name: "Leo",
    nameEn: "Leo",
    role: "Líder Diseño",
    roleEn: "Design Lead",
    department: "design",
    talksToUser: true,
    agentFileId: "wireframe-designer",
  },
  {
    id: "nora",
    name: "Nora",
    nameEn: "Nora",
    role: "Líder Legal",
    roleEn: "Legal Lead",
    department: "legal",
    talksToUser: true,
    agentFileId: "legal-privacy-policy",
  },
  {
    id: "sam",
    name: "Sam",
    nameEn: "Sam",
    role: "Líder QA",
    roleEn: "QA Lead",
    department: "qa",
    talksToUser: true,
    agentFileId: "qa-verifier",
  },
];

export function leaderById(id: string) {
  return FLOOR_LEADERS.find((l) => l.id === id || l.agentFileId === id);
}
