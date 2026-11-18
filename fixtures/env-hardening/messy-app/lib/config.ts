const { OPENAI_API_KEY, SMTP_PORT = "587", SUPPORT_EMAIL } = process.env;

export const config = {
  openAiKey: OPENAI_API_KEY,
  smtpPort: Number(SMTP_PORT),
  supportEmail: SUPPORT_EMAIL,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
};
