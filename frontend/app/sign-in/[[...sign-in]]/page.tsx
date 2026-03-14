import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 p-6">
      <div className="pointer-events-none absolute inset-0 z-0">
        <img 
          src="/assets/asteroid_splash.jpg" 
          alt="" 
          className="h-full w-full object-cover opacity-60 brightness-[0.7] contrast-[1.1]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-neutral-950/90" />
      </div>
      <div className="relative z-10 scale-105 drop-shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <SignIn forceRedirectUrl="/dashboard" />
      </div>
    </div>
  )
}