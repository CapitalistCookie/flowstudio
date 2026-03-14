import { SignIn } from "@clerk/nextjs"
import { FluxLogo } from "@/components/flux-logo"

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#070605] overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-[#F5A623]/10 blur-[150px] animate-pulse" />
      <div className="pointer-events-none absolute left-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-[#1A9E8F]/5 blur-[120px]" />

      {/* Logo */}
      <div className="mb-10 relative z-10">
        <FluxLogo size="lg" />
      </div>

      {/* Clerk Sign-In with dark cinematic styling */}
      <div className="relative z-10">
        <SignIn
          appearance={{
            variables: {
              colorPrimary: "#F5A623",
              colorBackground: "#141210",
              colorInputBackground: "#1E1C18",
              colorInputText: "#F0EDE8",
              colorText: "#F0EDE8",
              colorTextSecondary: "#6B6860",
              colorNeutral: "#272420",
              colorShimmer: "rgba(245,166,35,0.08)",
              borderRadius: "0.5rem",
              fontFamily: "DM Sans, system-ui, sans-serif",
              fontSize: "0.9rem",
            },
            elements: {
              card: "shadow-2xl border border-[rgba(245,166,35,0.12)] bg-[#141210]",
              headerTitle: "text-foreground font-medium",
              headerSubtitle: "text-muted-foreground",
              formFieldInput: "bg-[#1E1C18] border-[#272420] text-foreground placeholder:text-muted-foreground focus:border-[rgba(245,166,35,0.4)] focus:ring-1 focus:ring-[rgba(245,166,35,0.2)]",
              formButtonPrimary: "bg-[#F5A623] hover:bg-[#E09420] text-[#0D0C0A] font-medium transition-colors",
              socialButtonsBlockButton: "bg-[#1E1C18] border-[#272420] text-foreground hover:bg-[#272420] transition-colors",
              dividerLine: "bg-[#272420]",
              dividerText: "text-muted-foreground",
              footerActionLink: "text-[#F5A623] hover:text-[#E09420]",
              identityPreviewText: "text-foreground",
              identityPreviewEditButton: "text-[#F5A623]",
            },
          }}
        />
      </div>

      {/* Footer */}
      <p className="relative z-10 mt-8 text-xs text-muted-foreground/50">
        © 2026 FlowStudio · GenAI Genesis Hackathon
      </p>
    </div>
  )
}
