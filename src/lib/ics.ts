function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildAppointmentIcs(opts: {
  token: string
  startsAt: string
  endsAt: string
  title: string
  location?: string | null
  description?: string | null
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Citora//Citas//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${opts.token}@citora.app`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(opts.startsAt)}`,
    `DTEND:${toIcsUtc(opts.endsAt)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    opts.location ? `LOCATION:${icsEscape(opts.location)}` : '',
    opts.description ? `DESCRIPTION:${icsEscape(opts.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

/** Descarga el .ics en el navegador (abre la app de calendario en la mayoría de los móviles). */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
