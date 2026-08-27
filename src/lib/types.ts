export type Role = "admin" | "sindico" | "morador";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type HouseholdRole = "owner" | "family";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  apartmentId: string | null;
  approvalStatus: ApprovalStatus;
  whatsapp: string | null;
  whatsappVisible: boolean;
  householdRole: HouseholdRole;
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
  householdRole: HouseholdRole;
  tower: number | null;
  apartmentCode: string | null;
}

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
}

export interface ApartmentMapEntry {
  id: string;
  floor: number;
  unitNumber: number;
  code: string;
  residents: {
    id: string;
    name: string;
    householdRole: HouseholdRole;
    approvalStatus: ApprovalStatus;
  }[];
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
  updatedAt: string | null;
  authorId: string;
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

export interface ServiceItemImage {
  id: string;
  path: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  images: ServiceItemImage[];
  createdAt: string;
}

export interface ServiceOwner {
  id: string;
  name: string;
  whatsapp: string | null;
  tower: number | null;
  apartmentCode: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface CondoService {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  owner: ServiceOwner;
  tags: Tag[];
  items: ServiceItem[];
}

export interface MyService {
  id: string;
  name: string;
  description: string | null;
  tags: Tag[];
  items: ServiceItem[];
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

// Resultado de login (senha ou passkey) — o backend pode responder de 3 formas diferentes
// dependendo do estado da conta (2FA obrigatório pra admin). Aprovação pendente/recusada não
// afeta o login em si — sempre libera sessão; quem bloqueia o app é o `ApprovalGate` no front,
// usando `user.approvalStatus`.
export type LoginResult =
  | { status: "ok"; user: User }
  | { status: "totp-setup-required"; token: string; otpauthUrl: string; qrDataUrl: string }
  | { status: "totp-verify-required"; token: string };
