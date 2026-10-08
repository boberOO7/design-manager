export function getCalendarInvitationErrorKey(result: unknown) {
  const code = typeof result === "object" && result !== null && "errorCode" in result ? result.errorCode : null;
  if (code === "INVITATION_AUTH_REQUIRED") return "invitationAuthRequired";
  if (code === "INVITATION_UNAVAILABLE") return "invitationUnavailable";
  return "invitationResponseFailed";
}
