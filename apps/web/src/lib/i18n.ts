// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

export type Locale = "es" | "en";

const dict = {
  es: {
    enterOffice: "Entrar a la oficina",
    connecting: "Abriendo la oficina…",
    offlineTitle: "La Agencia se desconectó",
    offlineBody:
      "No te preocupes. Pulsa el botón verde para volver a conectar. Si no funciona, cierra y vuelve a abrir La Agencia. En desarrollo: npm run agency.",
    reconnect: "Reconectar",
    settings: "Cuentas",
    sprints: "Sprint",
    team: "Equipo",
    todos: "Mis pendientes",
    queue: "Cola de trabajo",
    talkHint: "Acércate a un líder · F o E para hablar · WASD para caminar",
    talkingTo: "Hablando con",
    send: "Enviar",
    typeHere: "Escribe aquí…",
    workerHint:
      "Este compañero trabaja en la suboficina. Habla con el líder del área.",
    offices: "Oficinas",
    newOffice: "+ Nueva",
    epic: "Épica",
    sprintOf: "Sprint",
    of: "de",
    planSprint: "Planificar sprint",
    runSprint: "Ejecutar",
    approve: "Aprobar",
    changes: "Pedir cambios",
    markDone: "Hecho",
    noTodos: "Ana te avisará si necesitas crear alguna cuenta (AWS, GitHub…).",
  },
  en: {
    enterOffice: "Enter the office",
    connecting: "Opening the office…",
    offlineTitle: "La Agencia disconnected",
    offlineBody:
      "No worries. Press the green button to reconnect. If that fails, close and reopen La Agencia. For development: npm run agency.",
    reconnect: "Reconnect",
    settings: "Accounts",
    sprints: "Sprint",
    team: "Team",
    todos: "My todos",
    queue: "Work queue",
    talkHint: "Walk to a leader · F or E to talk · WASD to walk",
    talkingTo: "Talking to",
    send: "Send",
    typeHere: "Type here…",
    workerHint: "This teammate works in the sub-office. Talk to the area lead.",
    offices: "Offices",
    newOffice: "+ New",
    epic: "Epic",
    sprintOf: "Sprint",
    of: "of",
    planSprint: "Plan sprint",
    runSprint: "Run",
    approve: "Approve",
    changes: "Request changes",
    markDone: "Done",
    noTodos: "Ana will tell you if you need to create accounts (AWS, GitHub…).",
  },
} as const;

export function t(locale: Locale, key: keyof (typeof dict)["es"]): string {
  return dict[locale][key] || dict.es[key];
}

export function detectLocale(): Locale {
  const lang = navigator.language?.toLowerCase() || "es";
  return lang.startsWith("en") ? "en" : "es";
}
