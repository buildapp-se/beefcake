// Latmask-mejlet via Resend, samma mönster som Familjehubbens email.ts men utan delad data.
// Avsändaren är en egen underdomän på buildapp.se, aldrig apexdomänen (den bär ägarens riktiga e-post).

export const SENDER = 'Beefcake <latmask@beefcake.buildapp.se>'

export interface ReminderEmail {
  to: string
  /** Dagar sedan senaste passet */
  days: number
  appUrl: string
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Brevet: bara antalet dagar och en länk. Inget ur passen lämnar tjänsten. */
export function buildReminderEmail(reminder: ReminderEmail): { from: string; to: string[]; subject: string; text: string; html: string } {
  const line = `Nu har du inte tränat på ${reminder.days} dagar, din latmask.`
  return {
    from: SENDER,
    to: [reminder.to],
    subject: line,
    text: `${line}\n\nTräna i dag: ${reminder.appUrl}\n`,
    html: `<p><strong>${escapeHtml(line)}</strong></p><p><a href="${escapeHtml(reminder.appUrl)}">Träna i dag</a></p>`
  }
}

/** Skickar via Resend och svarar med statuskoden. Ett nätfel kastar; cronen fångar det per konto och går vidare. */
export async function sendReminderEmail(reminder: ReminderEmail, apiKey: string): Promise<number> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(buildReminderEmail(reminder))
  })
  return response.status
}
