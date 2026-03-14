import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskType } from '../src/types/enums.js';

const ROOT = resolve(__dirname, '../../..');
const INFRA = resolve(ROOT, 'infra');

function readInfra(relativePath: string): string {
  return readFileSync(resolve(INFRA, relativePath), 'utf-8');
}

// ─── T19.1: Terraform files exist and are structurally valid ─────────────────

describe('Terraform Configuration', () => {
  const EXPECTED_TF_FILES = [
    'terraform/main.tf',
    'terraform/variables.tf',
    'terraform/outputs.tf',
    'terraform/network.tf',
    'terraform/storage.tf',
    'terraform/secrets.tf',
    'terraform/cloud-run.tf',
    'terraform/stdb-vm.tf',
  ];

  for (const file of EXPECTED_TF_FILES) {
    test(`${file} exists`, () => {
      expect(existsSync(resolve(INFRA, file))).toBe(true);
    });
  }

  test('main.tf has required provider and backend', () => {
    const content = readInfra('terraform/main.tf');
    expect(content).toContain('required_version');
    expect(content).toContain('hashicorp/google');
    expect(content).toContain('backend "gcs"');
  });

  test('variables.tf defines all required variables', () => {
    const content = readInfra('terraform/variables.tf');
    const required = ['project_id', 'region', 'zone', 'project_prefix'];
    for (const v of required) {
      expect(content).toContain(`variable "${v}"`);
    }
  });

  test('cloud-run.tf worker list matches all 13 TaskTypes', () => {
    const content = readInfra('terraform/cloud-run.tf');
    const expectedWorkers = [
      'audio-extract', 'video-sample', 'cursor-processor', 'typing-detector',
      'speech-transcription', 'video-understanding', 'ui-change-detector',
      'interaction-pattern', 'intent-graph', 'narrative-planner',
      'edit-planner', 'timeline-builder', 'render',
    ];
    for (const w of expectedWorkers) {
      expect(content, `Worker "${w}" should be in Cloud Run config`).toContain(`"${w}"`);
    }
    expect(Object.values(TaskType)).toHaveLength(13);
  });

  test('cloud-run.tf ffmpeg_workers matches build-and-push.sh', () => {
    const tfContent = readInfra('terraform/cloud-run.tf');
    const scriptContent = readInfra('scripts/build-and-push.sh');

    const tfMatch = tfContent.match(/ffmpeg_workers\s*=\s*toset\(\[([^\]]+)\]\)/);
    expect(tfMatch).not.toBeNull();
    const tfWorkers = tfMatch![1].match(/"([^"]+)"/g)!.map(s => s.replace(/"/g, ''));

    for (const w of tfWorkers) {
      expect(scriptContent, `${w} should be in FFMPEG_WORKERS`).toContain(w);
    }
  });

  test('cloud-run.tf injects API keys only to correct workers', () => {
    const content = readInfra('terraform/cloud-run.tf');
    expect(content).toContain('deepgram_workers  = toset(["speech-transcription"])');
    expect(content).toContain('google_ai_workers = toset(["video-understanding"])');
    expect(content).toContain('vertex_workers = toset(["intent-graph", "narrative-planner", "edit-planner"])');
  });

  test('cloud-run.tf workers use VPC connector for SpacetimeDB access', () => {
    const content = readInfra('terraform/cloud-run.tf');
    expect(content).toContain('vpc_access');
    expect(content).toContain('PRIVATE_RANGES_ONLY');
  });

  test('cloud-run.tf workers have health probe on /health:8080', () => {
    const content = readInfra('terraform/cloud-run.tf');
    expect(content).toContain('startup_probe');
    expect(content).toContain('path = "/health"');
    expect(content).toContain('port = 8080');
  });
});

// ─── T19.3-T19.4: Dockerfiles ─────────────────────────────────────────────────

describe('Dockerfiles', () => {
  test('Dockerfile.worker exists and has required instructions', () => {
    const content = readInfra('docker/Dockerfile.worker');
    expect(content).toContain('FROM node:20');
    expect(content).toContain('ARG NEEDS_FFMPEG');
    expect(content).toContain('ARG WORKER_NAME');
    expect(content).toContain('ENTRYPOINT');
    expect(content).toContain('EXPOSE 8080');
    expect(content).toContain('NODE_ENV=production');
  });

  test('Dockerfile.worker installs FFmpeg conditionally', () => {
    const content = readInfra('docker/Dockerfile.worker');
    expect(content).toContain('if [ "$NEEDS_FFMPEG" = "true" ]');
    expect(content).toContain('apt-get install -y --no-install-recommends ffmpeg');
  });

  test('Dockerfile.worker copies shared packages before worker-specific', () => {
    const content = readInfra('docker/Dockerfile.worker');
    const sharedCopy = content.indexOf('COPY packages/shared/');
    const workerSharedCopy = content.indexOf('COPY packages/workers/shared/');
    const workerCopy = content.indexOf('COPY packages/workers/${WORKER_NAME}/');
    expect(sharedCopy).toBeLessThan(workerCopy);
    expect(workerSharedCopy).toBeLessThan(workerCopy);
  });

  test('Dockerfile.client exists and is multi-stage', () => {
    const content = readInfra('docker/Dockerfile.client');
    expect(content).toContain('FROM node:20');
    expect(content).toContain('AS base');
    expect(content).toContain('AS production');
    expect(content).toContain('EXPOSE 3000');
    expect(content).toContain('NODE_ENV=production');
  });

  test('Dockerfile.client uses standalone Next.js output', () => {
    const content = readInfra('docker/Dockerfile.client');
    expect(content).toContain('.next/standalone');
    expect(content).toContain('.next/static');
    expect(content).toContain('server.js');
  });
});

// ─── T19.5: FFmpeg worker detection in build script ───────────────────────────

describe('Build Script', () => {
  test('FFMPEG_WORKERS includes audio-extract, video-sample, render', () => {
    const content = readInfra('scripts/build-and-push.sh');
    const match = content.match(/FFMPEG_WORKERS="([^"]+)"/);
    expect(match).not.toBeNull();
    const workers = match![1].split(/\s+/);
    expect(workers).toContain('audio-extract');
    expect(workers).toContain('video-sample');
    expect(workers).toContain('render');
  });

  test('build script uses DOCKER_BUILDKIT', () => {
    const content = readInfra('scripts/build-and-push.sh');
    expect(content).toContain('DOCKER_BUILDKIT=1');
  });

  test('build script handles both client and worker builds', () => {
    const content = readInfra('scripts/build-and-push.sh');
    expect(content).toContain('Dockerfile.client');
    expect(content).toContain('Dockerfile.worker');
  });
});

// ─── T19.6: Deploy scripts exist ─────────────────────────────────────────────

describe('Deploy Scripts', () => {
  const EXPECTED_SCRIPTS = [
    'scripts/build-and-push.sh',
    'scripts/deploy-worker.sh',
    'scripts/deploy-stdb.sh',
    'scripts/deploy-all.sh',
    'scripts/setup-secrets.sh',
  ];

  for (const script of EXPECTED_SCRIPTS) {
    test(`${script} exists`, () => {
      expect(existsSync(resolve(INFRA, script))).toBe(true);
    });
  }

  for (const script of EXPECTED_SCRIPTS) {
    test(`${script} starts with shebang`, () => {
      const content = readInfra(script);
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
  }

  for (const script of EXPECTED_SCRIPTS) {
    test(`${script} uses strict mode`, () => {
      const content = readInfra(script);
      expect(content).toContain('set -euo pipefail');
    });
  }
});

// ─── T19.7: Environment variable completeness ────────────────────────────────

describe('Environment Variables', () => {
  test('.env.example exists', () => {
    expect(existsSync(resolve(ROOT, '.env.example'))).toBe(true);
  });

  test('.env.example documents all critical env vars', () => {
    const content = readFileSync(resolve(ROOT, '.env.example'), 'utf-8');
    const criticalVars = [
      'STDB_HOST', 'STDB_MODULE', 'GCS_BUCKET', 'GCP_PROJECT_ID',
      'DEEPGRAM_API_KEY', 'GOOGLE_AI_API_KEY', 'HEALTH_PORT',
      'WORKER_CONCURRENCY', 'WORKER_POLL_INTERVAL_MS',
    ];
    for (const v of criticalVars) {
      expect(content, `.env.example should document ${v}`).toContain(v);
    }
  });

  test('cloud-run.tf env vars are a subset of .env.example', () => {
    const envExample = readFileSync(resolve(ROOT, '.env.example'), 'utf-8');
    const cloudRun = readInfra('terraform/cloud-run.tf');

    const tfEnvVars = [...cloudRun.matchAll(/name\s*=\s*"([A-Z_]+)"/g)].map(m => m[1]);
    const envExampleVars = [...envExample.matchAll(/^([A-Z_]+)=/gm)].map(m => m[1]);

    for (const v of tfEnvVars) {
      if (!v) continue;
      const inExample = envExampleVars.includes(v) ||
        envExample.includes(v);
      expect(inExample, `${v} in cloud-run.tf should be in .env.example`).toBe(true);
    }
  });
});

// ─── Cloud Function ──────────────────────────────────────────────────────────

describe('Cloud Function', () => {
  test('generate-upload-url index.js exists', () => {
    expect(existsSync(resolve(INFRA, 'cloud-function/generate-upload-url/index.js'))).toBe(true);
  });

  test('generate-upload-url package.json lists @google-cloud/storage', () => {
    const pkg = JSON.parse(readInfra('cloud-function/generate-upload-url/package.json'));
    expect(pkg.dependencies['@google-cloud/storage']).toBeDefined();
  });

  test('cloud function rejects path traversal', () => {
    const content = readInfra('cloud-function/generate-upload-url/index.js');
    expect(content).toContain('..');
    expect(content).toContain('Invalid projectId or filename');
  });

  test('cloud function validates video content type', () => {
    const content = readInfra('cloud-function/generate-upload-url/index.js');
    expect(content).toContain("contentType.startsWith('video/')");
  });

  test('cloud function uses CORS (documented security gap)', () => {
    const content = readInfra('cloud-function/generate-upload-url/index.js');
    expect(content).toContain('Access-Control-Allow-Origin');
  });
});
