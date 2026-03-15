/**
 * Runtime environment validation.
 * Call once at app startup to surface misconfigurations early.
 */

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  hint: string;
}

export function checkEnvironment(): { ok: boolean; warnings: string[] } {
  const checks: EnvCheck[] = [
    {
      name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      value: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      required: true,
      hint: 'Clerk auth will not work. Get from clerk.com dashboard.',
    },
    {
      name: 'NEXT_PUBLIC_STDB_HOST',
      value: process.env.NEXT_PUBLIC_STDB_HOST,
      required: false,
      hint: 'Defaults to ws://localhost:3000. Set for production.',
    },
    {
      name: 'NEXT_PUBLIC_RAILTRACKS_URL',
      value: process.env.NEXT_PUBLIC_RAILTRACKS_URL,
      required: false,
      hint: 'Defaults to http://localhost:8000. AI agent calls will fail without gateway.',
    },
    {
      name: 'NEXT_PUBLIC_GCS_BUCKET_URL',
      value: process.env.NEXT_PUBLIC_GCS_BUCKET_URL,
      required: false,
      hint: 'Defaults to https://storage.googleapis.com/flowstudio-uploads.',
    },
  ];

  const warnings: string[] = [];
  let ok = true;

  for (const check of checks) {
    if (!check.value && check.required) {
      warnings.push(`MISSING (required): ${check.name} — ${check.hint}`);
      ok = false;
    } else if (!check.value) {
      warnings.push(`MISSING (optional): ${check.name} — ${check.hint}`);
    }
  }

  if (warnings.length > 0) {
    console.warn('[FlowStudio] Environment check:');
    warnings.forEach(w => console.warn(`  ${w}`));
  }

  return { ok, warnings };
}
