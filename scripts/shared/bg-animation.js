/**
 * High-Performance Interactive Ambient Aurora & Constellation Animation
 * Features floating glowing energy orbs, interactive cursor magnetic tracking,
 * and dual light/dark theme adaptation.
 */

(function () {
  let canvas, ctx;
  let particles = [];
  let orbs = [];
  let mouse = { x: null, y: null, radius: 220 };
  let animationFrameId;
  let isDarkMode = true;

  const PARTICLE_COUNT = 30;
  const CONNECT_DISTANCE = 160;

  function updateThemeState() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    isDarkMode = theme === 'dark';
  }

  function initCanvas() {
    canvas = document.getElementById('bgCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'bgCanvas';
      document.body.prepend(canvas);
    }
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '-1';
    ctx = canvas.getContext('2d');
    updateThemeState();
    resizeCanvas();
    createElements();
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class GlowingOrb {
    constructor(color) {
      this.color = color;
      this.reset();
    }

    reset() {
      this.x = Math.random() * (canvas ? canvas.width : window.innerWidth);
      this.y = Math.random() * (canvas ? canvas.height : window.innerHeight);
      this.radius = Math.random() * 180 + 120;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.alpha = Math.random() * 0.15 + 0.08;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < -100) this.x = canvas.width + 100;
      if (this.x > canvas.width + 100) this.x = -100;
      if (this.y < -100) this.y = canvas.height + 100;
      if (this.y > canvas.height + 100) this.y = -100;
    }

    draw() {
      ctx.save();
      ctx.globalCompositeOperation = isDarkMode ? 'screen' : 'multiply';
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      gradient.addColorStop(0, this.color.replace('ALPHA', isDarkMode ? this.alpha : this.alpha * 0.6));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    }
  }

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2.2 + 1;
      this.vx = (Math.random() - 0.5) * 0.7;
      this.vy = (Math.random() - 0.5) * 0.7;
      this.alpha = Math.random() * 0.6 + 0.3;
      this.hue = Math.random() > 0.5 ? 265 : 195; // Purple or Cyan
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0) this.x = canvas.width;
      if (this.x > canvas.width) this.x = 0;
      if (this.y < 0) this.y = canvas.height;
      if (this.y > canvas.height) this.y = 0;

      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          this.x -= Math.cos(angle) * force * 2;
          this.y -= Math.sin(angle) * force * 2;
        }
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      if (isDarkMode) {
        ctx.fillStyle = `hsla(${this.hue}, 90%, 75%, ${this.alpha})`;
        ctx.shadowColor = `hsla(${this.hue}, 90%, 65%, 0.8)`;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = `hsla(${this.hue}, 80%, 45%, ${this.alpha * 0.8})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function createElements() {
    particles = [];
    orbs = [
      new GlowingOrb('rgba(124, 58, 237, ALPHA)'),
      new GlowingOrb('rgba(56, 189, 248, ALPHA)'),
      new GlowingOrb('rgba(168, 85, 247, ALPHA)'),
      new GlowingOrb('rgba(236, 72, 153, ALPHA)')
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw ambient glowing orbs
    orbs.forEach(orb => {
      orb.update();
      orb.draw();
    });

    // Draw constellation nodes & links
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();

      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECT_DISTANCE) {
          const opacity = (1 - dist / CONNECT_DISTANCE) * (isDarkMode ? 0.3 : 0.2);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = isDarkMode
            ? `rgba(168, 85, 247, ${opacity})`
            : `rgba(109, 40, 217, ${opacity})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }

      if (mouse.x !== null && mouse.y !== null) {
        const dx = particles[i].x - mouse.x;
        const dy = particles[i].y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const opacity = (1 - dist / mouse.radius) * (isDarkMode ? 0.5 : 0.35);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = isDarkMode
            ? `rgba(56, 189, 248, ${opacity})`
            : `rgba(124, 58, 237, ${opacity})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  window.addEventListener('themechange', () => {
    updateThemeState();
  });

  window.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    animate();
  });
})();
