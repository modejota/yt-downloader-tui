import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import type { Language } from "@/domain/config";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";

type SupportedLanguage = "en" | "es";

/** The OS locale, narrowed to a supported language (English otherwise). */
function detectSystemLanguage(): SupportedLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  return locale.startsWith("es") ? "es" : "en";
}

function resolveLanguage(language: Language): SupportedLanguage {
  return language === "system" ? detectSystemLanguage() : language;
}

// Resources are static and inline, so this is ready to use synchronously right after this module loads
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initAsync: false,
});

export async function applyLanguage(language: Language): Promise<void> {
  await i18next.changeLanguage(resolveLanguage(language));
}

export { i18next as i18n };
