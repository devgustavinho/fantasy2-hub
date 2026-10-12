import { api } from "@/lib/api";
import type { WelcomePage, WelcomeQr } from "@/lib/types";

export const getWelcome = () => api.get<WelcomePage>("/welcome");

export const updateWelcome = (data: { title: string; body: string }) =>
  api.put<WelcomePage>("/welcome", data);

export const getWelcomeQr = () => api.get<WelcomeQr>("/welcome/qr");

export const uploadWelcomeImage = (file: File) => {
  const form = new FormData();
  form.set("image", file);
  return api.postForm<{ url: string }>("/welcome/images", form);
};
