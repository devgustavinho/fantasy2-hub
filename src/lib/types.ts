export type Role = "admin" | "sindico" | "conselheiro" | "morador";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type HouseholdRole = "owner" | "family";

export interface User {
  id: string;
  name: string;
  email: string;
  /** Modo/visão ativa (um dos `roles`). */
  role: Role;
  /** Todos os cargos atribuídos. */
  roles: Role[];
  apartmentId: string | null;
  tower: number | null;
  apartmentCode: string | null;
  approvalStatus: ApprovalStatus;
  whatsapp: string | null;
  whatsappVisible: boolean;
  householdRole: HouseholdRole;
  totpEnabled: boolean;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
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

/** Cobertura no portal: aptos com pelo menos um morador aprovado. */
export interface TowerPortalCoverage {
  tower: number;
  total: number;
  onPortal: number;
  percent: number;
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

export type TopicStatus = "open" | "scheduled" | "closed";
/** Tipo de fechamento: debatida na assembleia / não pautada. */
export type TopicCloseKind = "debated" | "not_scheduled";
export type VoteValue = "favor" | "contra";

export interface Topic {
  id: string;
  title: string;
  description: string;
  status: TopicStatus;
  assemblyDate: string | null;
  statusNote: string | null;
  closeKind: TopicCloseKind | null;
  closeReason: string | null;
  closedAt: string | null;
  /** Código curto (até 6 A-Za-z0-9) para /t/<code>. */
  shareCode: string;
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
  linkUrl: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface ServiceItemImage {
  id: string;
  path: string;
}

export type SelectionType = "single" | "multi";

export interface ServiceItemOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ServiceItemOptionGroup {
  id: string;
  name: string;
  selectionType: SelectionType;
  maxSelections: number | null;
  required: boolean;
  options: ServiceItemOption[];
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isNegotiable: boolean;
  maxQuantity: number | null;
  images: ServiceItemImage[];
  optionGroups: ServiceItemOptionGroup[];
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

export type FulfillmentMode = "door" | "pickup" | "lobby" | "online";

// Listagem pública (`GET /services`) não traz os itens — só o suficiente pra escolher o
// negócio e ir pro link dedicado (`GET /services/:id`, que é o `CondoService` com `items`).
export interface ServiceSummary {
  id: string;
  name: string;
  description: string | null;
  instagram: string | null;
  imagePath: string | null;
  fulfillmentModes: FulfillmentMode[];
  /** Link curto escolhido pelo vendedor (`/n/<slug>`). */
  slug: string | null;
  createdAt: string;
  owner: ServiceOwner;
  tags: Tag[];
}

export interface CondoService extends ServiceSummary {
  items: ServiceItem[];
}

export interface MyService {
  id: string;
  name: string;
  description: string | null;
  instagram: string | null;
  imagePath: string | null;
  fulfillmentModes: FulfillmentMode[];
  slug: string | null;
  whatsapp: string | null;
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

/** Quem cadastrou — só o id (nome nunca é exposto em Contatos do condomínio). */
export interface RecommendationAuthor {
  id: string;
  name?: string;
}

export interface Recommendation {
  id: string;
  name: string;
  description: string | null;
  whatsapp: string | null;
  instagram: string | null;
  createdAt: string;
  createdBy: RecommendationAuthor;
  commentCount: number;
  /** Sempre vazio — tags não afetam Contatos do condomínio. */
  tags: Tag[];
}

export type RecommendationMediaType = "image" | "video";

export interface RecommendationMedia {
  id: string;
  mediaType: RecommendationMediaType;
  path: string;
}

export interface RecommendationComment {
  id: string;
  body: string | null;
  createdAt: string;
  author: RecommendationAuthor;
  media: RecommendationMedia[];
}

export interface WelcomePage {
  title: string;
  body: string;
  updatedAt: string;
}

export interface WelcomeQr {
  url: string;
  dataUrl: string;
}

/** Links de convite WhatsApp para o morador (geral + torre dele). */
export interface GroupLinksForUser {
  generalUrl: string | null;
  tower: number | null;
  towerUrl: string | null;
}

/** Todos os links (admin). */
export interface GroupLinksAll {
  generalUrl: string | null;
  towers: Record<1 | 2 | 3 | 4 | 5, string | null>;
  updatedAt: string | null;
}

export interface GroupLinksInput {
  generalUrl?: string | null;
  tower1Url?: string | null;
  tower2Url?: string | null;
  tower3Url?: string | null;
  tower4Url?: string | null;
  tower5Url?: string | null;
}

export type ClimateSurveyStatus = "open" | "closed";

export interface ClimateSurveySummary {
  id: string;
  title: string;
  description: string | null;
  allowComments: boolean;
  status: ClimateSurveyStatus;
  createdAt: string;
  createdByName: string;
  responseCount: number;
}

export interface ClimateOption {
  id: string;
  label: string;
  count: number;
  percent: number;
  selected: boolean;
}

export interface ClimateQuestion {
  id: string;
  prompt: string;
  options: ClimateOption[];
}

export interface ClimateComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  tower: number;
  apartmentCode: string;
}

export interface ClimateSurvey extends ClimateSurveySummary {
  canVote: boolean;
  voted: boolean;
  voteMessage: string | null;
  myComment: string | null;
  questions: ClimateQuestion[];
  comments: ClimateComment[];
}

export interface CreateClimateSurvey {
  title: string;
  description: string;
  allowComments: boolean;
  questions: { prompt: string; options: string[] }[];
}

export interface FaqEntry {
  id: string;
  question: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  createdBy: RecommendationAuthor;
}

export type ImprovementStatus = "new" | "reviewing" | "in_progress" | "done";

export interface Improvement {
  id: string;
  title: string;
  description: string;
  status: ImprovementStatus;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
}

export type BalanceteStatus = "em_analise" | "aprovado" | "aprovado_ressalvas" | "reprovado";
export type ParecerDecision = "aprovado" | "aprovado_ressalvas" | "reprovado";
export type ParecerStatus = "pendente" | "rascunho" | "finalizado";
export type ObservacaoTipo = "ressalva" | "conferido" | "pendencia";

export interface BalanceteSummary {
  id: string;
  referenceMonth: string;
  title: string;
  pdfUrl: string;
  status: BalanceteStatus;
  publishedAt: string;
  publishedById: string;
  publishedByName: string;
  parecerTotal: number;
  parecerFinalizados: number;
}

export interface BalanceteObservacao {
  id: string;
  parecerId: string;
  tipo: ObservacaoTipo;
  body: string;
  sortOrder: number;
  createdAt: string;
}

export interface BalanceteAnalysisItem {
  id: string;
  counselorId: string;
  counselorName: string;
  status: ParecerStatus;
  decision: ParecerDecision | null;
  finalizedAt: string | null;
}

export interface BalanceteFinalizedParecer {
  id: string;
  counselorId: string;
  counselorName: string;
  decision: ParecerDecision;
  finalizedAt: string | null;
  observacoes: BalanceteObservacao[];
}

export interface BalanceteMyParecer {
  id: string;
  balanceteId: string;
  counselorId: string;
  counselorName: string;
  decision: ParecerDecision | null;
  status: ParecerStatus;
  finalizedAt: string | null;
  updatedAt: string;
  observacoes: BalanceteObservacao[];
}

export interface BalanceteDetail {
  balancete: BalanceteSummary;
  analysis: BalanceteAnalysisItem[];
  finalizedPareceres: BalanceteFinalizedParecer[];
  myParecer: BalanceteMyParecer | null;
}

// Resultado de login (senha ou passkey) — o backend pode responder de 3 formas diferentes
// dependendo do estado da conta (2FA obrigatório pra admin). Aprovação pendente/recusada não
// afeta o login em si — sempre libera sessão; quem bloqueia o app é o `ApprovalGate` no front,
// usando `user.approvalStatus`.
export type LoginResult =
  | { status: "ok"; user: User; token: string }
  | { status: "totp-setup-required"; token: string; otpauthUrl: string; qrDataUrl: string }
  | { status: "totp-verify-required"; token: string };
