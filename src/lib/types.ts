export type Role = "admin" | "sindico" | "morador";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  apartmentId: string | null;
  approvalStatus: ApprovalStatus;
  whatsapp: string | null;
  whatsappVisible: boolean;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  approvalStatus: ApprovalStatus;
  whatsapp: string | null;
  whatsappVisible: boolean;
  tower: number | null;
  apartmentCode: string | null;
}

export interface Apartment {
  id: string;
  tower: number;
  floor: number;
  unitNumber: number;
  code: string;
  label: string;
  available: boolean;
}

export type TopicStatus = "open" | "scheduled";
export type VoteValue = "favor" | "contra";

export interface Topic {
  id: string;
  title: string;
  description: string;
  status: TopicStatus;
  assemblyDate: string | null;
  statusNote: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  favorCount: number;
  contraCount: number;
  commentCount?: number;
  myVote?: VoteValue | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: Role;
}

export interface TopicEvent {
  id: string;
  message: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  topicId: string | null;
  topicTitle: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// Resultado de login (senha ou passkey) — o backend pode responder de 4 formas diferentes
// dependendo do estado da conta (aprovação pendente/recusada, 2FA obrigatório pra admin).
export type LoginResult =
  | { status: "ok"; user: User }
  | { status: "pending" | "rejected" }
  | { status: "totp-setup-required"; token: string; otpauthUrl: string; qrDataUrl: string }
  | { status: "totp-verify-required"; token: string };
