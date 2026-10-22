export const messages = {
  en: {
    product: "ResourceOS",
    tagline: "Resource Intelligence. Sovereign Control.",
    navigation: [
      "Command Center",
      "Resource Registry",
      "Resource Chain",
      "Cargo Verification",
      "Trade & Counterparties",
      "Revenue & Treasury",
      "ARRS Control Center",
      "Intelligence & Risk",
      "Documents & Certificates",
      "Administration",
    ],
    demo: "DEMONSTRATION ENVIRONMENT",
  },
};
export type Locale = keyof typeof messages;
export const defaultLocale: Locale = "en";
