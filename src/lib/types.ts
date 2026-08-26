export type Role = "admin" | "sindico" | "morador";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  apartmentId: string | null;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
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
}
