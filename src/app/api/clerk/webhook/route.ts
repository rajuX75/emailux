import { db } from "@/server/db";
import { Prisma } from "@prisma/client";

export const POST = async (req: Request) => {
  try {
    // Validate request body
    if (!req.body) {
      return new Response("Missing request body", { status: 400 });
    }

    // Parse and validate webhook data
    const { data } = await req.json();

    if (!data || typeof data !== "object") {
      return new Response("Invalid webhook payload", { status: 400 });
    }

    // Extract and validate required fields
    const emailAddress = data.email_addresses?.[0]?.email_address;
    const firstName = data.first_name;
    const lastName = data.last_name;
    const imageUrl = data.image_url;
    const id = data.id;

    if (!id || !emailAddress) {
      return new Response("Missing required fields: id and email", {
        status: 400,
      });
    }

    // Use upsert to handle both creation and updates
    await db.user.upsert({
      where: { id },
      update: {
        emailAddress,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        imageUrl: imageUrl ?? undefined,
      },
      create: {
        id,
        emailAddress,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        imageUrl: imageUrl ?? null,
      },
    });

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Handle specific database errors
    // Check if it's a Prisma error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return new Response("User already exists", { status: 409 });
      }
    }

    // Generic error response
    return new Response("Internal server error", { status: 500 });
  }
};
