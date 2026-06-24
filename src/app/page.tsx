'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import './landing.css'
import { CONFIG } from '@/lib/config'

const WA_URL = `https://wa.me/${CONFIG.whatsapp}`

const WaButton = ({ className = '' }: { className?: string }) => (
  <a
    href={WA_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={`flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors ${className}`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.17 1.538 5.943L0 24l6.232-1.503A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.366l-.36-.214-3.7.893.935-3.58-.235-.372A9.818 9.818 0 1112 21.818z"/>
    </svg>
    Informes por WhatsApp
  </a>
)


export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const landing = CONFIG.landing
  const heroHighlight = 'Secundaria o Preparatoria'
  const [heroPrefix, heroSuffix] = landing.hero_titulo.split(heroHighlight)
  const convenioResumen = landing.convenios
    .map((c) => c.nombre.replace('Sindicato ', ''))
    .join(' y ')

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => { document.documentElement.style.scrollBehavior = prev }
  }, [])

  return (
    <div className="ivs-landing">

      {/* ── NAV ── */}
      <nav>
        <div className="nav-logo">
          <Image src={CONFIG.logo} alt={CONFIG.nombreCompleto} width={45} height={45} style={{ objectFit: 'contain', borderRadius: 6 }} />
          <div className="nav-logo-text">{CONFIG.nombre}</div>
        </div>
        <div className="nav-right">
          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-semibold transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.17 1.538 5.943L0 24l6.232-1.503A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.366l-.36-.214-3.7.893.935-3.58-.235-.372A9.818 9.818 0 1112 21.818z"/>
            </svg>
            WhatsApp
          </a>
          <Link href="/login" className="btn-ingresar">Ingresar</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg" />

        <div className="hero-inner">
          {/* LEFT */}
          <div className="hero-left">
            <div className="hero-badges-row">
              {landing.hero_badges.map((badge) => (
                <span key={badge} className="hero-badge-pill">{badge}</span>
              ))}
            </div>

            <h1 className="hero-title">
              {heroPrefix || 'Estudia '}
              <span className="grad">{heroHighlight}</span>
              {heroSuffix || ' desde casa'}
            </h1>

            <p className="hero-sub">
              {landing.hero_subtitulo}<br />
              <strong>{`Convenio con sindicatos ${convenioResumen}.`}</strong>
            </p>

            <div className="hero-btns">
              <Link href="/register" className="btn-cta-primary">
                Crear mi cuenta gratis →
              </Link>
              <WaButton />
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-num">2</div>
                <div className="stat-label">Niveles<br /><small>Sec. y Prepa</small></div>
              </div>
              <div className="stat">
                <div className="stat-num">6</div>
                <div className="stat-label">Meses<br /><small>Estándar</small></div>
              </div>
              <div className="stat">
                <div className="stat-num">3</div>
                <div className="stat-label">Meses<br /><small>Express</small></div>
              </div>
              <div className="stat">
                <div className="stat-num">100%</div>
                <div className="stat-label">En línea<br /><small>Sin salón</small></div>
              </div>
            </div>
          </div>

          {/* RIGHT: alumna con certificado */}
          <div className="hero-right">
            <Image
              src="/alumna-certificado.jpg"
              alt={`Alumna con certificado ${CONFIG.nombre}`}
              width={520}
              height={450}
              className="hero-img"
            />
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <div className="trust-bar">
        {[
          { num: '✅', label: 'Certificado SEP oficial' },
          { num: '🎓', label: `${landing.años_experiencia} años formando alumnos` },
          { num: '🤝', label: landing.hero_badges[2].replace('🤝 ', '') },
          { num: '📱', label: '100% en línea, sin salón' },
        ].map((item, i) => (
          <div className="trust-item" key={i}>
            <div className="trust-num">{item.num}</div>
            <div className="trust-label">{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── NIVELES ── */}
      <section className="section-light" id="niveles">
        <div className="section-header">
          <div className="tag-line">¿Qué quieres estudiar?</div>
          <h2 className="sec-title">Elige tu nivel</h2>
          <p className="sec-sub">Dos programas, el mismo certificado oficial, la misma calidad.</p>
        </div>

        <div className="niveles-grid">
          <div className="nivel-card">
            <div className="nivel-icon">📚</div>
            <h3 className="nivel-title">Secundaria</h3>
            <p className="nivel-desc">
              Certifícate con tu certificado de primaria. Modalidad 6 meses o 3 meses Express.
            </p>
            <div className="nivel-req">
              <span className="req-label">Documento requerido:</span>
              <span className="req-doc">Certificado de Primaria</span>
            </div>
            <div className="nivel-precios">
              <div className="precio-row">
                <span>6 meses regular</span>
                <strong>$1,200/mes</strong>
              </div>
              <div className="precio-row sindical">
                <span>🤝 Sindicalizado</span>
                <strong>$850/mes</strong>
              </div>
            </div>
            <WaButton />
          </div>

          <div className="nivel-card featured">
            <div className="nivel-popular">🔥 Más solicitada</div>
            <div className="nivel-icon">🎓</div>
            <h3 className="nivel-title">Preparatoria</h3>
            <p className="nivel-desc">
              Certifícate con tu certificado de secundaria. Modalidad 6 meses o 3 meses Express.
            </p>
            <div className="nivel-req">
              <span className="req-label">Documento requerido:</span>
              <span className="req-doc">Certificado de Secundaria</span>
            </div>
            <div className="nivel-precios">
              <div className="precio-row">
                <span>6 meses regular</span>
                <strong>$1,200/mes</strong>
              </div>
              <div className="precio-row sindical">
                <span>🤝 Sindicalizado</span>
                <strong>$850/mes</strong>
              </div>
            </div>
            <WaButton />
          </div>
        </div>
      </section>

      {/* ── BENEFICIOS ── */}
      <section className="section-gray" id="beneficios">
        <div className="section-header">
          <div className="tag-line">Por qué {CONFIG.nombre}</div>
          <h2 className="sec-title">Todo lo que necesitas,<br />nada de lo que no</h2>
          <p className="sec-sub">Diseñado para que termines. Sin excusas, sin complicaciones.</p>
        </div>

        <div className="benefits-grid">
          {[
            { icon: '📱', color: '#3AAFA9', title: 'Desde tu celular o PC', desc: 'Estudia cuando quieras, donde quieras. Sin horarios fijos, sin trasladarte.' },
            { icon: '🚫', color: '#EF4444', title: 'Sin examen final', desc: 'Nada de exámenes CENEVAL. Tu certificado se obtiene por actividades completadas.' },
            { icon: '⚡', color: '#F59E0B', title: '6 meses o 3 meses Express', desc: 'Elige tu ritmo. Programa regular en 6 meses o acelera al doble con Express en 3 meses.' },
            { icon: '✅', color: '#10B981', title: 'Certificado reconocido por la SEP', desc: 'Certificado con validez oficial para continuar en universidades de México.' },
            { icon: '🤝', color: '#1B3A57', title: 'Convenio sindical', desc: 'Precios preferenciales para trabajadores del IMSS y Sindicato de Ferrocarrileros.' },
            { icon: '🏛️', color: '#6366F1', title: 'Continúa en la universidad', desc: 'Tu certificado te abre las puertas a universidades en México. El siguiente paso es tuyo.' },
          ].map((b, i) => (
            <div className="benefit-card" key={i}>
              <div className="benefit-icon" style={{ background: `${b.color}18`, border: `1px solid ${b.color}30` }}>
                {b.icon}
              </div>
              <div className="benefit-title">{b.title}</div>
              <div className="benefit-desc">{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CONVENIOS ── */}
      <section className="section-light convenios-section" id="convenios">
        <div className="section-header">
          <div className="tag-line">Convenios Sindicales</div>
          <h2 className="sec-title">Precio especial para trabajadores sindicalizados</h2>
          <p className="sec-sub">
            {CONFIG.nombre} tiene convenio con el Sindicato del IMSS y el Sindicato de Ferrocarrileros de México,
            ofreciendo precios preferenciales para trabajadores sindicalizados y sus familias.
          </p>
        </div>

        <div className="convenios-grid">
          {landing.convenios.map((convenio) => (
            <div className="convenio-card" key={convenio.nombre}>
              <div className="convenio-emoji">{convenio.emoji}</div>
              <div className="convenio-nombre">{convenio.nombre}</div>
              <div className="convenio-desc">{convenio.desc}</div>
              <div className="convenio-precio">
                <span className="desde">desde</span>
                <strong>$850/mes</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="convenios-cta">
          <p className="convenios-hint">¿Eres trabajador sindicalizado? Menciona tu sindicato al contactarnos para aplicar el precio preferencial.</p>
          <WaButton />
        </div>
      </section>

      {/* ── PLANES Y PRECIOS ── */}
      <section className="section-gray" id="planes">
        <div className="section-header">
          <div className="tag-line">Planes y Precios</div>
          <h2 className="sec-title">Invierte en tu futuro</h2>
          <p className="sec-sub">Inscripción única: <strong>{`$${CONFIG.precios.inscripcion} MXN`}</strong> · Después pagas mensual según tu modalidad.</p>
        </div>

        {/* Tabla de precios */}
        <div className="precios-container">
          <div className="precios-header-note">
            <span>💡</span>
            <span>Mismos precios para Secundaria y Preparatoria · El precio cambia por velocidad, no por nivel</span>
          </div>

          <div className="precios-grid">
            {/* Regular 6 meses */}
            <div className="precio-card">
              <div className="precio-badge">Programa Regular</div>
              <div className="precio-titulo">6 Meses</div>
              <div className="precio-monto">
                <span className="monto-principal">$1,200</span>
                <span className="monto-periodo">MXN/mes</span>
              </div>
              <div className="precio-sindical">🤝 Sindicalizado: <strong>$850/mes</strong></div>
              <ul className="precio-features">
                <li>✓ Acceso completo 6 meses</li>
                <li>✓ Sin horarios fijos</li>
                <li>✓ Sin examen final (actividades)</li>
                <li>✓ Soporte por WhatsApp</li>
                <li>✓ Certificado oficial SEP</li>
              </ul>
              <WaButton />
            </div>

            {/* Express 3 meses */}
            <div className="precio-card featured">
              <div className="precio-popular-tag">🔥 Terminas antes</div>
              <div className="precio-badge">⚡ Express</div>
              <div className="precio-titulo">3 Meses</div>
              <div className="precio-monto">
                <span className="monto-principal">$2,400</span>
                <span className="monto-periodo">MXN/mes</span>
              </div>
              <div className="precio-sindical">🤝 Sindicalizado: <strong>$1,700/mes</strong></div>
              <ul className="precio-features">
                <li>✓ Terminas 3 meses antes</li>
                <li>✓ Ritmo intensivo manejable</li>
                <li>✓ Sin examen final (actividades)</li>
                <li>✓ Soporte prioritario WhatsApp</li>
                <li>✓ Certificado oficial SEP</li>
              </ul>
              <WaButton />
            </div>
          </div>

          {/* Certificación desglose */}
          <div className="certif-note">
            <strong>Costo de certificación (pago único al finalizar):</strong>
            <span>{`Secundaria: $${landing.certificacion_secundaria.toLocaleString('es-MX')} MXN`}</span>
            <span>{`Preparatoria: $${landing.certificacion_preparatoria.toLocaleString('es-MX')} MXN`}</span>
          </div>

          <div className="billing-trust">
            <span>🧾</span>
            <span>Empresa legalmente constituida en México · Emitimos facturas (CFDI)</span>
          </div>
        </div>
      </section>

      {/* ── PARA QUIÉN ── */}
      <section className="section-gray">
        <div className="section-header">
          <div className="tag-line">¿Es para mí?</div>
          <h2 className="sec-title">Diseñado para personas<br />como tú</h2>
        </div>

        <div className="quien-grid">
          {[
            { icon: '👷', title: 'Trabajadores', desc: 'Que no pueden ir a la escuela por su horario de trabajo.' },
            { icon: '👨‍👩‍👧', title: 'Padres de familia', desc: 'Que dejaron la escuela y quieren terminar sin dejar su hogar.' },
            { icon: '🏥', title: 'Trabajadores IMSS', desc: 'Con precio preferencial por convenio sindical.' },
            { icon: '🚂', title: 'Ferrocarrileros', desc: 'Precio especial para el sindicato de ferrocarrileros.' },
            { icon: '📈', title: 'Quienes buscan ascender', desc: 'Que necesitan su certificado para mejores empleos o la universidad.' },
            { icon: '⏰', title: 'Los que no tienen tiempo', desc: '3 o 6 meses desde tu celular — el tiempo que tengas es suficiente.' },
          ].map((q, i) => (
            <div className="quien-card" key={i}>
              <div className="quien-icon">{q.icon}</div>
              <div className="quien-text">
                <strong>{q.title}</strong>
                <span>{q.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROCESO ── */}
      <section className="section-light proceso" id="como-empezar">
        <div className="section-header">
          <div className="tag-line">Cómo empezar</div>
          <h2 className="sec-title">3 pasos y ya estás adentro</h2>
          <p className="sec-sub">Sin filas, sin trámites complicados. Todo desde tu celular.</p>
        </div>

        <div className="proceso-steps">
          {[
            { num: '01', icon: '🙋', title: 'Crea tu cuenta gratis', desc: 'Regístrate en menos de 2 minutos. Sin tarjeta de crédito. Tu cuenta queda lista al instante.' },
            { num: '02', icon: '💬', title: 'Contacta a tu asesor', desc: 'Escríbenos por WhatsApp. Te orientamos sobre nivel, modalidad y precio según tu situación.' },
            { num: '03', icon: '🎉', title: 'Control Escolar te da la bienvenida', desc: 'Nuestro equipo te contacta por WhatsApp, te solicita documentos y ¡empiezas a estudiar!' },
          ].map((s, i) => (
            <div className="step" key={i}>
              <div className="step-bubble">
                <span className="step-bubble-num">{s.num}</span>
                <span className="step-bubble-icon">{s.icon}</span>
              </div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>

        <div className="proceso-cta">
          <Link href="/register" className="btn-cta-primary">
            Crear mi cuenta gratis →
          </Link>
          <div className="proceso-divider">— o si prefieres —</div>
          <WaButton />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="faq-section section-gray">
        <div className="tag-line">Dudas comunes</div>
        <h2 className="sec-title">Preguntas frecuentes</h2>
        <div className="faq-list">
          {([
            {
              q: '¿El certificado es válido en México?',
              a: 'Sí. Emitimos un certificado oficial reconocido por la SEP México. Puedes verificarlo en el portal SIGED de la SEP con el folio de tu documento.',
            },
            {
              q: '¿Cuánto tiempo al día necesito dedicarle?',
              a: 'Con 1 a 2 horas diarias es suficiente. El plan de 6 meses es ideal si trabajas o tienes familia. El plan de 3 meses es más intensivo pero manejable.',
            },
            {
              q: '¿Qué documentos necesito para inscribirme?',
              a: 'Para Secundaria necesitas tu Certificado de Primaria. Para Preparatoria necesitas tu Certificado de Secundaria. Además: CURP, Acta de Nacimiento e Identificación Oficial.',
            },
            {
              q: '¿Cómo aplica el precio de convenio sindical?',
              a: 'Si eres trabajador del IMSS o del Sindicato de Ferrocarrileros, menciona tu sindicato al contactarnos por WhatsApp. Te aplicamos el precio preferencial automáticamente.',
            },
            {
              q: '¿Puedo ver la plataforma antes de pagar?',
              a: `Sí. Crea tu cuenta gratis, entra a la plataforma y explora el contenido. Solo necesitas pagar la inscripción ($${CONFIG.precios.inscripcion} MXN) para desbloquear acceso completo.`,
            },
          ]).map((item, i) => (
            <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
              <button
                className="faq-q"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span className="faq-q-text">{item.q}</span>
                <span className="faq-chevron" aria-hidden="true">›</span>
              </button>
              <div className="faq-a" style={{ '--faq-h': openFaq === i ? '1' : '0' } as React.CSSProperties}>
                <div className="faq-a-inner">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="cta-final section-teal">
        <div className="cta-proof">
          {[
            { icon: '✅', label: 'Certificado SEP' },
            { icon: '🎓', label: `${landing.años_experiencia} años` },
            { icon: '🤝', label: 'Convenio sindical' },
            { icon: '📱', label: '100% en línea' },
            { icon: '🚫', label: 'Sin examen final' },
          ].map((item, i) => (
            <div className="cta-proof-item" key={i}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="tag-line light" style={{ marginTop: '48px' }}>¿Listo para empezar?</div>
        <h2 className="sec-title light" style={{ marginTop: '16px' }}>
          Tu certificado te espera.<br />Solo falta el primer paso.
        </h2>
        <p className="cta-final-sub">
          Cientos de alumnos en México ya terminaron su Secundaria o Preparatoria con {CONFIG.nombre}.
          En 6 meses — o 3 — puedes ser el siguiente.
        </p>

        <div className="cta-final-btns">
          <Link href="/register" className="btn-cta-white">
            Crear mi cuenta gratis →
          </Link>
          <WaButton />
        </div>

        <p className="cta-final-footnote">
          {`Sin tarjeta de crédito · Registro en 2 minutos · Inscripción desde $${CONFIG.precios.inscripcion} MXN`}
        </p>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="billing-trust billing-trust--footer">
          <span>🧾</span>
          <span>Empresa legalmente constituida en México · Emitimos facturas (CFDI)</span>
        </div>
        <div className="footer-logo">
          <Image src={CONFIG.logo} alt={CONFIG.nombre} width={32} height={32} style={{ objectFit: 'contain', borderRadius: 4 }} />
          <span className="footer-logo-text">{CONFIG.nombre}</span>
        </div>
        <p className="footer-text">
          {CONFIG.dominio} · Preparatoria · Secundaria · {CONFIG.nombreCompleto}
        </p>
      </footer>
    </div>
  )
}
