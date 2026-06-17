import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import { ArrowRight, BarChart3, Box, Globe, Layers, Shield, Zap } from 'lucide-react'

// ─── Floating Orb Background ───────────────────────────────────────────────────
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />
      <div className="landing-orb landing-orb-4" />
    </div>
  )
}

// ─── 3D Tilt Card ──────────────────────────────────────────────────────────────
function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 })

  function handleMouse(e: React.MouseEvent) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  function handleLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Animated Grid ─────────────────────────────────────────────────────────────
function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
      <div className="landing-grid" />
    </div>
  )
}

// ─── Particle Field ────────────────────────────────────────────────────────────
function ParticleField() {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 10,
    delay: Math.random() * 5,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="landing-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon,
  title,
  description,
  delay,
}: {
  icon: any
  title: string
  description: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.21, 1.11, 0.81, 0.99] }}
      viewport={{ once: true, margin: '-50px' }}
    >
      <TiltCard className="h-full">
        <div className="landing-feature-card group">
          <div className="landing-feature-icon">
            <Icon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold mt-4 mb-2">{title}</h3>
          <p className="text-sm text-neutral-400 leading-relaxed">{description}</p>
          <div className="landing-feature-glow" />
        </div>
      </TiltCard>
    </motion.div>
  )
}

// ─── Stat Counter ──────────────────────────────────────────────────────────────
function StatCounter({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true
          const duration = 2000
          const startTime = performance.now()
          function animate(currentTime: number) {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 4)
            setCount(Math.floor(eased * value))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.5 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="text-center"
    >
      <div className="text-4xl md:text-5xl font-black text-white tabular-nums">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-neutral-400 mt-2 font-medium">{label}</div>
    </motion.div>
  )
}

// ─── Main Landing Page ─────────────────────────────────────────────────────────
export function LandingPage() {
  const { scrollYProgress } = useScroll()
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const features = [
    { icon: Box, title: 'Inventory Management', description: 'Real-time stock tracking across multiple warehouse locations with automated movements and alerts.' },
    { icon: Globe, title: 'Multi-Channel Sales', description: 'Manage pricing and profitability across every sales channel from one unified dashboard.' },
    { icon: BarChart3, title: 'Profitability Analytics', description: 'Instant margin analysis with landed cost calculations, commission tracking, and fulfillment costs.' },
    { icon: Layers, title: 'Purchase Orders', description: 'End-to-end purchase management from draft to completion with automatic inventory allocation.' },
    { icon: Zap, title: 'Shipment Tracking', description: 'Visual pipeline tracking from supplier to warehouse with real-time status updates.' },
    { icon: Shield, title: 'Audit Trail', description: 'Complete activity logging for every action across your operations with user attribution.' },
  ]

  return (
    <div className="landing-page">
      {/* ═══ HERO SECTION ═══ */}
      <motion.section
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="landing-hero"
      >
        <FloatingOrbs />
        <AnimatedGrid />
        <ParticleField />

        <div className="landing-hero-content">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="landing-badge">
              <span className="landing-badge-dot" />
              Operations Intelligence Platform
            </div>
          </motion.div>

          {/* Logo / Title */}
          <div className="landing-title-wrapper">
            <AnimatePresence>
              {mounted && (
                <motion.h1
                  className="landing-title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  {'OpsCore'.split('').map((char, i) => (
                    <motion.span
                      key={i}
                      className="landing-title-char"
                      initial={{ opacity: 0, y: 80, rotateX: -90 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      transition={{
                        duration: 0.8,
                        delay: 0.6 + i * 0.08,
                        ease: [0.21, 1.11, 0.81, 0.99],
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </motion.h1>
              )}
            </AnimatePresence>

            {/* Glow line under title */}
            <motion.div
              className="landing-title-glow"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={mounted ? { scaleX: 1, opacity: 1 } : {}}
              transition={{ duration: 1.2, delay: 1.4, ease: 'easeOut' }}
            />
          </div>

          {/* Subtitle */}
          <motion.p
            className="landing-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 1.6 }}
          >
            The command center for your entire supply chain. Track inventory, manage purchases,
            analyze profitability — all in one beautifully crafted platform.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="landing-cta-group"
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 1.9 }}
          >
            <Link to="/login" className="landing-cta-primary">
              <span>Get Started</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              <div className="landing-cta-shine" />
            </Link>
            <Link to="/login?mode=signup" className="landing-cta-secondary">
              Create Account
            </Link>
          </motion.div>

          {/* 3D Dashboard Preview */}
          <motion.div
            className="landing-preview-wrapper"
            initial={{ opacity: 0, y: 60, rotateX: 15 }}
            animate={mounted ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 1.2, delay: 2.2, ease: [0.21, 1.11, 0.81, 0.99] }}
          >
            <div className="landing-preview">
              <div className="landing-preview-header">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="landing-preview-url">app.opscore.io/dashboard</div>
                <div className="w-12" />
              </div>
              <div className="landing-preview-body">
                <div className="landing-preview-sidebar">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 mb-4" />
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`h-2.5 rounded mb-3 ${i === 0 ? 'bg-red-500/40 w-full' : 'bg-white/5 w-4/5'}`} />
                  ))}
                </div>
                <div className="landing-preview-main">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="landing-preview-stat">
                        <div className="h-2 w-12 bg-white/10 rounded mb-2" />
                        <div className="h-4 w-8 bg-white/20 rounded" />
                      </div>
                    ))}
                  </div>
                  <div className="landing-preview-chart">
                    <svg viewBox="0 0 200 60" className="w-full h-full">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,45 Q20,40 40,35 T80,25 T120,30 T160,15 T200,20"
                        fill="none"
                        stroke="hsl(0, 72%, 51%)"
                        strokeWidth="2"
                        className="landing-chart-line"
                      />
                      <path
                        d="M0,45 Q20,40 40,35 T80,25 T120,30 T160,15 T200,20 V60 H0 Z"
                        fill="url(#chartGrad)"
                        className="landing-chart-fill"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="landing-preview-reflection" />
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* ═══ STATS SECTION ═══ */}
      <section className="landing-stats-section">
        <div className="landing-container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            <StatCounter value={10000} suffix="+" label="Products Tracked" />
            <StatCounter value={99} suffix="%" label="Uptime" />
            <StatCounter value={50} suffix="+" label="Integrations" />
            <StatCounter value={24} suffix="/7" label="Support" />
          </div>
        </div>
      </section>

      {/* ═══ FEATURES SECTION ═══ */}
      <section className="landing-features-section">
        <div className="landing-container">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
              Everything you need to{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400">
                dominate
              </span>
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
              Built for operators who demand precision. Every feature designed to give you
              complete visibility and control over your supply chain.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <FeatureCard key={feature.title} {...feature} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA SECTION ═══ */}
      <section className="landing-final-cta">
        <div className="landing-container text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-6xl font-black text-white mb-6">
              Ready to take control?
            </h2>
            <p className="text-neutral-400 text-lg mb-10 max-w-xl mx-auto">
              Join the operators who've transformed their supply chain management.
              Start in seconds — no credit card required.
            </p>
            <Link to="/login" className="landing-cta-primary landing-cta-large">
              <span>Launch OpsCore</span>
              <ArrowRight className="h-5 w-5" />
              <div className="landing-cta-shine" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="landing-footer">
        <div className="landing-container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full border-2 border-white" />
            </div>
            <span className="font-bold text-white">OpsCore</span>
          </div>
          <p className="text-sm text-neutral-500">© 2026 OpsCore. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
