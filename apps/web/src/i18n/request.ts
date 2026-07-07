import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["en", "gu", "hi"] as const;
export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "wfiq-locale";

// Cookie-based locale (no URL routing), so existing routes are untouched. The locale
// is read from a cookie; anything unknown falls back to English.
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = (LOCALES as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as string)
    : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
