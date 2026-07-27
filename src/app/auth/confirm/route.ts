import {
  getSafeConfirmationDestination,
  getSupportedEmailOtpType,
} from "@/lib/auth/email-confirmation";
import { createClient } from "@/lib/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

function getInvalidLinkRedirect(request: NextRequest) {
  const destination = request.nextUrl.clone();
  destination.pathname = "/auth/error";
  destination.search = "";
  destination.hash = "";
  destination.searchParams.set("reason", "invalid_or_expired_link");
  return destination;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = getSupportedEmailOtpType(request.nextUrl.searchParams.get("type"));
  const next = getSafeConfirmationDestination(request.nextUrl.searchParams.get("next"))
    ?? "/set-password";

  if (!tokenHash || !type) {
    return NextResponse.redirect(getInvalidLinkRedirect(request));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    console.error("Unable to verify Supabase email confirmation token", {
      code: error.code,
      status: error.status,
      type,
    });
    return NextResponse.redirect(getInvalidLinkRedirect(request));
  }

  const destination = request.nextUrl.clone();
  destination.pathname = next;
  destination.search = "";
  destination.hash = "";
  return NextResponse.redirect(destination);
}
