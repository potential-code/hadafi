import { sendMail } from "../mail/mailer";

/** What a 6-digit code is for; each gets its own subject and wording. */
export type CodePurpose = "sign-in" | "sign-up" | "email-verification" | "forget-password";

const COPY: Record<CodePurpose, { subject: string; intro: string; label: string; expiryNote: string; ignoreNote: string }> = {
  "sign-in": {
    subject: "Your Hadafi sign-in code",
    intro: "Use this code to sign in to your Hadafi account.",
    label: "Your sign-in code",
    expiryNote: "Enter it on the sign-in page.",
    ignoreNote: "If you didn't try to sign in, you can ignore this email. Nobody can sign in without this code.",
  },
  "sign-up": {
    subject: "Confirm your email for Hadafi",
    intro: "Use this code to confirm your email and finish creating your Hadafi account.",
    label: "Your confirmation code",
    expiryNote: "Enter it to finish signing up.",
    ignoreNote: "If you didn't start signing up for Hadafi, you can ignore this email. No account is created without this code.",
  },
  "email-verification": {
    subject: "Verify your Hadafi email",
    intro: "Use this code to verify the email address on your Hadafi account. You only need to do this once.",
    label: "Your verification code",
    expiryNote: "Enter it to verify your email.",
    ignoreNote: "If you didn't try to sign in, you can ignore this email. Your account will not change.",
  },
  "forget-password": {
    subject: "Reset your Hadafi password",
    intro: "Use this code to choose a new password for your Hadafi account.",
    label: "Your password reset code",
    expiryNote: "Enter it with your new password.",
    ignoreNote: "If you didn't ask to reset your password, you can ignore this email. Your password will not change.",
  },
};

export async function sendCodeEmail(email: string, code: string, purpose: CodePurpose): Promise<void> {
  const copy = COPY[purpose];
  await sendMail({
    to: email,
    subject: copy.subject,
    template: "otp-code",
    context: { code, intro: copy.intro, label: copy.label, expiryNote: copy.expiryNote, ignoreNote: copy.ignoreNote },
  });
}
