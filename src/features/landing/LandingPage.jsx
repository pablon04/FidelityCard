import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, CreditCard, EyeOff, Smartphone, ShieldAlert, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn.js'
import { FAQ, FEATURES, LOGIN_URL, PLANS, PROBLEMS, REGISTER_URL, STEPS } from './content.js'
import {
  ClientsMockup,
  DashboardMockup,
  EditorMockup,
  PassMockup,
  PromoMockup,
  ShareMockup,
} from './Mockups.jsx'

const FEATURE_MOCKUPS = {
  editor: EditorMockup,
  share: ShareMockup,
  wallet: PassMockup,
  clients: ClientsMockup,
  dashboard: DashboardMockup,
  promos: PromoMockup,
}

const ICONS = { CreditCard, EyeOff, Smartphone, ShieldAlert }

const btn =
  'inline-flex min-h-[48px] items-center justify-center rounded-control px-5 text-base font-semibold transition-colors'
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`
const btnSecondary = `${btn} border-[1.5px] border-border bg-surface text-text hover:bg-bg-muted`

function Section({ id, title, intro, children, muted }) {
  return (
    <section id={id} className={cn('scroll-mt-16 py-16 md:py-24', muted && 'bg-bg-muted')}>
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <h2 className="max-w-2xl text-2xl font-bold md:text-[34px] md:leading-[42px]">{title}</h2>
        {intro && <p className="mt-3 max-w-2xl text-lg text-text-muted">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function Header() {
  const links = [
    ['#problema', 'Problema'],
    ['#como-funciona', 'Cómo funciona'],
    ['#funciones', 'Funciones'],
    ['#planes', 'Planes'],
    ['#faq', 'Preguntas'],
  ]
  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-5">
        <a href="#top" className="text-lg font-bold">
          FidelityCard
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-6 md:flex">
          {links.map(([h, l]) => (
            <a key={h} href={h} className="text-sm font-medium text-text-muted hover:text-text">
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={LOGIN_URL} className="hidden px-3 text-sm font-medium sm:inline">
            Entrar
          </Link>
          <Link to={REGISTER_URL} className={`${btnPrimary} !min-h-[40px] !px-4 !text-sm`}>
            Empezar
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section id="top" className="py-14 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-5 md:grid-cols-2">
        <div>
          <p className="inline-block rounded-chip bg-bg-muted px-3 py-1 text-sm font-medium text-primary">
            Tarjeta de fidelidad digital para comercios
          </p>
          <h1 className="mt-4 text-[34px] font-bold leading-[42px] md:text-5xl md:leading-[56px]">
            Que tus clientes vuelvan, sin tarjetas de cartón
          </h1>
          <p className="mt-4 text-lg text-text-muted">
            Crea tu tarjeta de visitas o puntos, compártela con NFC o QR y tus clientes la llevan en
            el móvil. Sin app, sin cuenta y sin complicaciones.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={REGISTER_URL} className={btnPrimary}>
              Crear mi tarjeta
            </Link>
            <a href="#planes" className={btnSecondary}>
              Ver planes
            </a>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted">
            {['Clientes ilimitados', 'Google y Apple Wallet', 'Datos en la UE'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div aria-label="Ejemplo de tarjeta en el móvil" role="img">
          <PassMockup />
        </div>
      </div>
    </section>
  )
}

function Problems() {
  return (
    <Section
      id="problema"
      muted
      title="Los problemas de la fidelización de siempre"
      intro="Lo resolvemos con algo que tus clientes ya llevan encima: el móvil."
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        {PROBLEMS.map((p) => {
          const Icon = ICONS[p.icon]
          return (
            <li key={p.title} className="rounded-card border border-border-subtle bg-surface p-5">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 text-text-muted">{p.text}</p>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function Steps() {
  return (
    <Section id="como-funciona" title="Así de fácil funciona">
      <ol className="grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-card border border-border-subtle bg-surface p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-on-primary">
              {i + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-1 text-text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Features() {
  return (
    <Section
      id="funciones"
      muted
      title="Todo lo que incluye FidelityCard"
      intro="Un panel sencillo para ti y una experiencia sin fricción para tu cliente."
    >
      <div className="space-y-16 md:space-y-24">
        {FEATURES.map((f, i) => {
          const Mock = FEATURE_MOCKUPS[f.id]
          return (
            <div key={f.id} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
              <div className={cn(i % 2 === 1 && 'md:order-2')}>
                <h3 className="text-xl font-bold md:text-2xl">{f.title}</h3>
                <p className="mt-3 text-text-muted">{f.text}</p>
                <ul className="mt-4 space-y-2">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div aria-hidden="true" className={cn(i % 2 === 1 && 'md:order-1')}>
                <Mock />
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

const eur = (n) => `${n} €`

function Plans() {
  const [yearly, setYearly] = useState(false)
  return (
    <Section
      id="planes"
      title="Planes sencillos, clientes ilimitados"
      intro="Todos los planes incluyen clientes ilimitados, pase web, Google Wallet, Apple Wallet y Soporte por Whatsapp."
    >
      <div
        role="group"
        aria-label="Periodo de facturación"
        className="inline-flex rounded-chip border-[1.5px] border-border p-1"
      >
        {[
          [false, 'Mensual'],
          [true, 'Anual · 2 meses gratis'],
        ].map(([v, l]) => (
          <button
            key={l}
            type="button"
            aria-pressed={yearly === v}
            onClick={() => setYearly(v)}
            className={cn(
              'min-h-[40px] rounded-chip px-4 text-sm font-semibold',
              yearly === v ? 'bg-primary text-on-primary' : 'text-text-muted',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <ul className="mt-8 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <li
            key={p.id}
            className={cn(
              'relative flex flex-col rounded-card bg-surface p-6',
              p.featured ? 'border-2 border-primary' : 'border border-border-subtle',
            )}
          >
            {p.featured && (
              <span className="absolute -top-3 left-6 rounded-chip bg-primary px-3 py-0.5 text-xs font-semibold text-on-primary">
                ⭐ Más elegido
              </span>
            )}
            <h3 className="text-xl font-bold">{p.name}</h3>
            <p className="mt-1 min-h-[40px] text-sm text-text-muted">{p.tagline}</p>
            <p className="mt-4">
              <span className="text-4xl font-bold">{eur(yearly ? p.yearly : p.monthly)}</span>
              <span className="text-text-muted"> / {yearly ? 'año' : 'mes'}</span>
            </p>
            <p className="mt-1 h-5 text-sm text-text-muted">
              {yearly ? `Equivale a ${(p.yearly / 12).toFixed(2).replace('.', ',')} € al mes` : ''}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {[
                p.cards,
                'Clientes ilimitados',
                'Visitas o puntos',
                'QR, NFC y código de caja',
                'Google Wallet, Apple Wallet y pase web',
                'Ficha de cliente, historial y CSV',
                p.dashboard,
                `Promociones: ${p.promos}`,
                p.segmentation ? 'Segmentación de envíos' : null,
                p.kit,
              ]
                .filter(Boolean)
                .map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {t}
                  </li>
                ))}
            </ul>
            <Link
              to={`${REGISTER_URL}&plan=${p.id}`}
              className={`${p.featured ? btnPrimary : btnSecondary} mt-6`}
            >
              Empezar con {p.name}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-text-muted">
        * Envíos ilimitados sujetos a un uso razonable.
      </p>
    </Section>
  )
}

function Trust() {
  return (
    <Section
      id="datos"
      muted
      title="Datos de tus clientes, bien cuidados"
      intro="FidelityCard nace pensando en la privacidad."
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {[
          [
            'Consentimiento claro',
            'La privacidad es obligatoria y el marketing es opcional, cada uno por separado.',
          ],
          [
            'Alojamiento en la UE',
            'Los datos se guardan en servidores dentro de la Unión Europea.',
          ],
          ['Sin cuentas para clientes', 'Pedimos solo lo necesario: nombre, email y teléfono.'],
        ].map(([t, d]) => (
          <li key={t} className="rounded-card border border-border-subtle bg-surface p-5">
            <h3 className="text-lg font-semibold">{t}</h3>
            <p className="mt-1 text-text-muted">{d}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Faq() {
  return (
    <Section id="faq" title="Preguntas frecuentes" className="items-center content-center justify-center">
      <div className=" max-w-3xl divide-y divide-border-subtle rounded-card border border-border-subtle">
        {FAQ.map((f) => (
          <details key={f.q} className="group p-4">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown
                className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-2 text-text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}

function FinalCta() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl rounded-card bg-primary px-6 py-12 text-center text-on-primary">
        <h2 className="text-2xl font-bold md:text-[34px] md:leading-[42px]">
          Empieza a fidelizar hoy
        </h2>
        <p className="mt-3 text-lg opacity-90">
          Crea tu cuenta, diseña tu tarjeta y compártela con tus clientes.
        </p>
        <Link to={REGISTER_URL} className={`${btn} mt-6 bg-surface !text-text hover:opacity-90`}>
          Crear mi tarjeta
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border-subtle py-8">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-4 text-sm text-text-muted sm:flex-row sm:px-5">
        <p>© {new Date().getFullYear()} FidelityCard</p>
        <Link to={LOGIN_URL} className="underline underline-offset-2">
          Acceso comercios
        </Link>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'FidelityCard · Tarjeta de fidelidad digital para tu comercio'
  }, [])
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-30 focus:rounded-control focus:bg-surface focus:p-3"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Problems />
        <Steps />
        <Features />
        <Plans />
        <Trust />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}
