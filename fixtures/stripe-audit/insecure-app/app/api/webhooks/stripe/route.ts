import { NextResponse } from "next/server";
import { db, orders, users } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

// Trusts whatever JSON is posted: no signature, no dedup, errors acknowledged with 200.
export async function POST(req: Request) {
  try {
    const event = await req.json();
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await db.insert(orders).values({ email: session.customer_details.email, paid: true });
        await db.update(users).set({ plan: "pro" });
        await sendWelcomeEmail(session.customer_details.email);
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ received: true });
  }
}
