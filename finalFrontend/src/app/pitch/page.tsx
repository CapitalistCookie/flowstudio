'use client';
import { useEffect, useRef } from 'react';

const slides = [
  {
    title: "FlowStudio",
    subtitle: "The Future of Cloud Native Video Editing",
    details: "Seamless, Local-first, Lightning Fast",
  },
  {
    title: "The Problem",
    subtitle: "Traditional video editing is bound to powerful hardware.",
    details: "Collaboration is difficult and rendering takes forever.",
  },
  {
    title: "The Solution",
    subtitle: "FlowStudio brings the power of the cloud.",
    details: "Edit on any device, collaborate in real-time.",
  },
  {
    title: "Architecture",
    subtitle: "Powered by Next.js & SpacetimeDB",
    details: "Low latency, intelligent processing, infinite scale.",
  },
  {
    title: "AI Integrations",
    subtitle: "Smart Cut, Auto-Caption, Scene Detection",
    details: "Powered by Gemini 2.0 and Vertex AI.",
  },
  {
    title: "Demo Time",
    subtitle: "Let's see FlowStudio in action",
    details: "Prepare to be amazed.",
  },
];

export default function PitchPresentation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let currentSlide = 0;
    let transitionProgress = 0;
    let isTransitioning = false;
    let transitionDir = 1; // 1 = forward, -1 = backward
    let particles: { x: number; y: number; vx: number; vy: number; radius: number; alpha: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };
    window.addEventListener('resize', resize);
    resize();

    function initParticles() {
      particles = [];
      for (let i = 0; i < 60; i++) {
        particles.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          radius: Math.random() * 3 + 1,
          alpha: Math.random() * 0.12 + 0.04,
        });
      }
    }

    function drawBackground() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      const bg = ctx!.createLinearGradient(0, 0, canvas!.width, canvas!.height);
      bg.addColorStop(0, '#fdfcfb');
      bg.addColorStop(1, '#f0ede8');
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      const g1 = ctx!.createRadialGradient(
        canvas!.width * 0.85, canvas!.height * 0.1, 0,
        canvas!.width * 0.85, canvas!.height * 0.1, canvas!.width * 0.35,
      );
      g1.addColorStop(0, 'rgba(99, 102, 241, 0.07)');
      g1.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx!.fillStyle = g1;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      const g2 = ctx!.createRadialGradient(
        canvas!.width * 0.1, canvas!.height * 0.9, 0,
        canvas!.width * 0.1, canvas!.height * 0.9, canvas!.width * 0.3,
      );
      g2.addColorStop(0, 'rgba(245, 158, 11, 0.06)');
      g2.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas!.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(60, 60, 100, ${p.alpha})`;
        ctx!.fill();
      });
    }

    function drawText(text: string, x: number, y: number, font: string, color: string, alpha: number) {
      ctx!.save();
      ctx!.font = font;
      ctx!.fillStyle = color;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      ctx!.globalAlpha = alpha;
      ctx!.fillText(text, x, y);
      ctx!.restore();
    }

    function drawDivider(cx: number, cy: number, alpha: number) {
      ctx!.save();
      ctx!.globalAlpha = alpha * 0.35;
      ctx!.strokeStyle = '#6366f1';
      ctx!.lineWidth = 2;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.moveTo(cx - 40, cy);
      ctx!.lineTo(cx + 40, cy);
      ctx!.stroke();
      ctx!.restore();
    }

    function drawProgressDots(cx: number, y: number) {
      const dotR = 5;
      const gap = 22;
      const startX = cx - ((slides.length - 1) * gap) / 2;
      slides.forEach((_, i) => {
        ctx!.save();
        ctx!.beginPath();
        ctx!.arc(startX + i * gap, y, dotR, 0, Math.PI * 2);
        ctx!.fillStyle = i === currentSlide ? '#6366f1' : '#c4bfb8';
        ctx!.globalAlpha = i === currentSlide ? 1 : 0.5;
        ctx!.fill();
        ctx!.restore();
      });
    }

    function drawSlide(index: number, progress: number, isOutgoing: boolean) {
      const slide = slides[index];
      if (!slide) return;
      const w = canvas!.width;
      const h = canvas!.height;

      // Pure crossfade — no positional movement
      const alpha = isOutgoing
        ? Math.max(0, 1 - progress * 1.6)
        : Math.min(1, progress * 1.6);

      drawText(
        `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`,
        w / 2, h / 2 - 155,
        '500 13px "Inter", system-ui, sans-serif',
        '#9ca3af', alpha,
      );

      drawText(
        slide.title,
        w / 2, h / 2 - 75,
        'bold 72px "Inter", system-ui, sans-serif',
        '#1e1b3a', alpha,
      );

      drawDivider(w / 2, h / 2 - 14, alpha);

      drawText(
        slide.subtitle,
        w / 2, h / 2 + 38,
        '400 26px "Inter", system-ui, sans-serif',
        '#374151', alpha,
      );

      drawText(
        slide.details,
        w / 2, h / 2 + 100,
        'italic 400 17px "Inter", system-ui, sans-serif',
        '#6b7280', alpha,
      );
    }

    const render = () => {
      drawBackground();
      const w = canvas!.width;
      const h = canvas!.height;

      if (isTransitioning) {
        transitionProgress += 0.04;
        if (transitionProgress >= 1) {
          isTransitioning = false;
          transitionProgress = 1;
        }
        const prevIndex = (currentSlide - transitionDir + slides.length) % slides.length;
        drawSlide(prevIndex, transitionProgress, true);
        drawSlide(currentSlide, transitionProgress, false);
      } else {
        drawSlide(currentSlide, 1, false);
      }


      drawProgressDots(w / 2, h - 48);
      drawText(
        'Click to navigate  ·  ← → arrow keys',
        w / 2, h - 22,
        '12px "Inter", system-ui, sans-serif',
        '#c4bfb8', 1,
      );

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Navigation
    const goNext = () => {
      if (isTransitioning || currentSlide >= slides.length - 1) return;
      transitionDir = 1;
      currentSlide++;
      transitionProgress = 0;
      isTransitioning = true;
    };

    const goPrev = () => {
      if (isTransitioning || currentSlide <= 0) return;
      transitionDir = -1;
      currentSlide--;
      transitionProgress = 0;
      isTransitioning = true;
    };

    const handleClick = (e: MouseEvent) => {
      // Left third = prev, right third = next, centre = next
      if (e.clientX < canvas!.width / 3) goPrev();
      else goNext();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
    };

    canvas.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#fdfcfb' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
      />
    </div>
  );
}
