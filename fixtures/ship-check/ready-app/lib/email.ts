import { Resend } from "resend";
import { env } from "./env";

const resend = new Resend(env.RESEND_API_KEY);

export function sendWelcome(to: string) {
  return resend.emails.send({ from: env.EMAIL_FROM, to, subject: "Welcome", html: "<p>Hi!</p>" });
}
