import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CitoraLogo } from '../components/ui'
import { setBrandColor } from '../lib/brand'

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    setBrandColor(null)
    document.title = `${title} · Citora`
  }, [title])

  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <CitoraLogo className="text-lg text-slate-900" />
          <Link to="/" className="text-sm font-semibold text-slate-500 hover:text-slate-700">Volver</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-slate-700">
        <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
        {children}
      </main>
    </div>
  )
}

export function Terms() {
  return (
    <LegalPage title="Términos de uso">
      <p className="text-sm text-slate-400">Última actualización: 2026.</p>
      <p>
        Citora es una plataforma que permite a negocios crear su propia web de reservas y gestionar sus citas.
        Cada negocio que usa Citora es responsable de sus propios servicios, precios, horarios y políticas de
        cancelación, que verás en la web de cada uno antes de reservar.
      </p>
      <h2 className="font-bold text-slate-900">Para quien reserva una cita</h2>
      <p>
        Al reservar una cita a través de Citora, el contrato de ese servicio (el corte de pelo, el masaje, la
        manicura, etc.) es entre tú y el negocio, no con Citora. Citora solo ofrece la herramienta para reservar.
        Las condiciones de cancelación, cambio y reembolso las define cada negocio en su propia página de
        Políticas, dentro de su web.
      </p>
      <h2 className="font-bold text-slate-900">Para los dueños de negocio</h2>
      <p>
        Al crear tu app en Citora aceptas usarla para tu negocio real, con información verdadera, y a pagar la
        mensualidad acordada una vez termine tu período de prueba si quieres seguir usándola. Puedes dejar de
        usarla cuando quieras: tus datos no se comparten ni se venden.
      </p>
      <h2 className="font-bold text-slate-900">Disponibilidad</h2>
      <p>
        Citora se ofrece "tal cual". Hacemos lo posible por mantenerla siempre disponible, pero no podemos
        garantizar que nunca vaya a fallar. Si tienes dudas, escríbenos por WhatsApp desde la página principal.
      </p>
    </LegalPage>
  )
}

export function Privacy() {
  return (
    <LegalPage title="Privacidad">
      <p className="text-sm text-slate-400">Última actualización: 2026.</p>
      <p>
        Esta página explica qué datos guarda Citora y para qué los usa, tanto de los dueños de negocio como de
        sus clientes.
      </p>
      <h2 className="font-bold text-slate-900">Si reservas una cita</h2>
      <p>
        Al reservar, el negocio recibe tu nombre, tu teléfono y, si lo escribes, una nota para tu cita. Esos
        datos se guardan para que el negocio pueda atenderte, contactarte por WhatsApp y llevar su propio
        registro de clientes. No se usan para enviarte publicidad de otros negocios, ni se venden a nadie.
      </p>
      <p>
        Si activas los avisos push en tu dispositivo, guardamos también la información técnica necesaria para
        enviarte esas notificaciones (nada que te identifique por sí sola). Puedes desactivarlos cuando quieras
        desde la página de tu cita.
      </p>
      <h2 className="font-bold text-slate-900">Si tienes un negocio en Citora</h2>
      <p>
        Guardamos los datos de tu negocio (nombre, teléfono, servicios, horario) y los de tus clientas para que
        tu app funcione. Puedes pedir que se elimine tu cuenta y tus datos en cualquier momento, escribiéndonos
        por WhatsApp desde la página principal.
      </p>
      <h2 className="font-bold text-slate-900">Visitas a la web</h2>
      <p>
        Contamos las visitas de forma anónima para saber cuánta gente usa Citora y mejorarla: qué páginas se
        ven, desde qué tipo de dispositivo y de dónde viene la visita (por ejemplo, Instagram). No usamos
        cookies ni guardamos tu IP, tu nombre ni ningún dato que te identifique: tu navegador solo guarda un
        número al azar. Estos datos se borran a los 13 meses.
      </p>
      <h2 className="font-bold text-slate-900">Dónde se guardan los datos</h2>
      <p>
        Los datos se guardan en Supabase, un proveedor externo de bases de datos, con las medidas de seguridad
        propias de ese servicio (contraseñas cifradas, acceso restringido por cuenta).
      </p>
    </LegalPage>
  )
}
