import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export function sendBookingConfirmation(to: string) {
  return resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: "Your booking is confirmed",
    html: "<p>See you soon!</p>",
  });
}
