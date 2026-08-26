import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api } from "@/lib/api";
import type { LoginResult } from "@/lib/types";

export interface PasskeyCredential {
  id: string;
  deviceName: string | null;
  createdAt: string;
}

export const listPasskeys = () => api.get<{ credentials: PasskeyCredential[] }>("/webauthn/credentials");

export const deletePasskey = (id: string) => api.delete<void>(`/webauthn/credentials/${id}`);

export async function registerPasskey(deviceName?: string) {
  const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>("/webauthn/register/options");
  const response = await startRegistration({ optionsJSON });
  return api.post<{ credential: PasskeyCredential }>("/webauthn/register/verify", {
    response,
    deviceName,
  });
}

export async function loginWithPasskey(email: string) {
  const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>("/webauthn/login/options", {
    email,
  });
  const response = await startAuthentication({ optionsJSON });
  return api.post<LoginResult>("/webauthn/login/verify", { email, response });
}
