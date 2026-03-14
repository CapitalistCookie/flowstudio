import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fffdf0] p-6">
      <div className="pointer-events-none absolute inset-0 z-0">
        <img 
          src="/assets/asteroid_splash.jpg" 
          alt="" 
          className="h-full w-full object-cover opacity-70 brightness-[0.85] contrast-[1.05]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(253,251,240,0.2)_0%,rgba(0,0,0,0.4)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#fffdf0]/10 to-[#fffdf0]/90" />
      </div>
      <div className="relative z-10 scale-105">
        <SignIn forceRedirectUrl="/dashboard" />
      </div>
    </div>
  )
}