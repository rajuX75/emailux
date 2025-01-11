import { db } from "@/server/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

// Define types for Clerk webhook payload
interface ClerkEmailAddress {
  email_address: string;
  id: string;
  verification: {
    status: string;
    strategy: string;
  };
}

interface ClerkExternalAccount {
  email_address: string;
  given_name: string;
  family_name: string;
  picture: string;
  approved_scopes: string;
  google_id?: string;
}

// Validation schema for webhook payload
const webhookSchema = z.object({
  data: z.object({
    id: z.string(),
    email_addresses: z.array(
      z.object({
        email_address: z.string().email(),
        id: z.string(),
        verification: z.object({
          status: z.string(),
          strategy: z.string(),
        }),
      }),
    ),
    external_accounts: z
      .array(
        z.object({
          email_address: z.string().email(),
          given_name: z.string().nullable(),
          family_name: z.string().nullable(),
          picture: z.string().url().optional(),
          approved_scopes: z.string(),
          google_id: z.string().optional(),
        }),
      )
      .optional(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    image_url: z.string().url().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
    banned: z.boolean(),
    external_id: z.string().nullable(),
  }),
  type: z.string(),
});

export const POST = async (req: Request) => {
  try {
    // Validate request has a body
    if (!req.body) {
      return new Response("Missing request body", {
        status: 400,
        statusText: "Bad Request",
      });
    }

    // Parse request body
    const rawBody = await req.json();

    // Validate webhook data against schema
    const validatedData = webhookSchema.safeParse(rawBody);

    if (!validatedData.success) {
      console.error("Validation error:", validatedData.error);
      return new Response(
        JSON.stringify({
          error: "Invalid webhook payload",
          details: validatedData.error.errors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { data } = validatedData.data;

    // Extract primary email
    const primaryEmail = data.email_addresses[0];
    if (!primaryEmail) {
      return new Response("No email address found", { status: 400 });
    }

    // Extract external account info (if exists)
    const externalAccount = data.external_accounts?.[0];

    // Prepare user data
    const userData = {
      id: data.id,
      emailAddress: primaryEmail.email_address,
      firstName: data.first_name ?? externalAccount?.given_name ?? null,
      lastName: data.last_name ?? externalAccount?.family_name ?? null,
      imageUrl: data.image_url ?? externalAccount?.picture ?? null,
      emailVerified: primaryEmail.verification.status === "verified",
      createdAtClerk: new Date(data.created_at),
      updatedAtClerk: new Date(data.updated_at),
      banned: data.banned,
      externalId: data.external_id,
      // Store OAuth details if available
      oauthProvider: externalAccount ? "google" : null,
      oauthId: externalAccount?.google_id ?? null,
      oauthScopes: externalAccount?.approved_scopes ?? null,
    };

    // Upsert user data
    await db.user.upsert({
      where: { id: data.id },
      update: userData,
      create: userData,
    });

    // Store email addresses
    for (const email of data.email_addresses) {
      await db.userEmail.upsert({
        where: { id: email.id },
        update: {
          emailAddress: email.email_address,
          verificationStatus: email.verification.status,
          verificationStrategy: email.verification.strategy,
        },
        create: {
          id: email.id,
          userId: data.id,
          emailAddress: email.email_address,
          verificationStatus: email.verification.status,
          verificationStrategy: email.verification.strategy,
        },
      });
    }

    return new Response(
      JSON.stringify({ message: "Webhook processed successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Webhook processing error:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle specific Prisma errors
      const prismaErrors: Record<string, { status: number; message: string }> =
        {
          P2002: { status: 409, message: "Resource already exists" },
          P2014: { status: 400, message: "Invalid ID provided" },
          P2003: { status: 400, message: "Foreign key constraint failed" },
        };

      const errorInfo = prismaErrors[error.code] ?? {
        status: 500,
        message: "Database error occurred",
      };

      return new Response(
        JSON.stringify({
          error: errorInfo.message,
          code: error.code,
        }),
        {
          status: errorInfo.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
