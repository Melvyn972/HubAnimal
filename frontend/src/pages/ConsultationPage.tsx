import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { submitConsultation, validateConsultationToken } from '../lib/api'
import type { Patient } from '../types'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export default function ConsultationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [patient, setPatient] = useState<Patient | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const [date, setDate] = useState(todayIsoDate())
  const [weight, setWeight] = useState<string>('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatment, setTreatment] = useState('')
  const [prescriptionText, setPrescriptionText] = useState('')
  const [notes, setNotes] = useState('')

  const tokenHint = useMemo(() => {
    if (!token) return null
    if (token.length <= 10) return token
    return `${token.slice(0, 6)}…${token.slice(-4)}`
  }, [token])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!token) {
        setError('token_required')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const validated = await validateConsultationToken({ token })
        if (!cancelled) {
          setPatient(validated.patient)
          setExpiresAt(validated.expiresAt)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'server_error')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token || !patient) return
    setBusy(true)
    setError(null)
    try {
      const weightValue = weight.trim().length ? Number(weight) : null
      await submitConsultation({
        token,
        entry: {
          date,
          weight: Number.isNaN(weightValue as number) ? null : weightValue,
          diagnosis,
          treatment,
          prescriptionText,
          notes,
        },
      })

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'server_error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-3 text-base font-[650] text-fg">Consultation (QR)</div>

      {tokenHint ? (
        <div className="mb-3 text-[13px] text-muted">
          Token :{' '}
          <code className="rounded-md bg-code-bg px-1.5 py-0.5 font-mono text-[13px] text-fg">
            {tokenHint}
          </code>
        </div>
      ) : null}

      {busy ? <div className="mb-3 text-[13px] text-muted">Chargement...</div> : null}

      {error ? (
        <div className="mb-3 rounded-[10px] border border-accent-border bg-accent-bg p-3 text-fg">
          {error}
        </div>
      ) : null}

      {patient ? (
        <div className="rounded-[10px] border border-border bg-transparent p-4">
          <div className="mb-2 font-[650] text-fg">
            {patient.name} ({patient.species})
          </div>
          <div className="mb-3 text-[13px] text-muted">
            Allergies critiques : {patient.allergiesCritical || '—'}
          </div>
          {expiresAt ? (
            <div className="mb-3 text-[13px] text-muted">
              Token valable jusqu’au : {new Date(expiresAt).toLocaleString()}
            </div>
          ) : null}

          <div className="my-4 border-t border-border" />

          {submitted ? (
            <div>
              <div className="mb-2 font-[650] text-fg">Mise à jour effectuée</div>
              <div className="mb-3.5 text-[13px] text-muted">L’entrée a été enregistrée dans le carnet.</div>
              <button
                className="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => navigate('/')}
              >
                Retour à l’accueil
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="text-[13px] text-muted">Date</div>
                  <input
                    className="rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-[13px] text-muted">Poids (kg, optionnel)</div>
                  <input
                    className="rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="ex: 12.4"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">Diagnostic</div>
                <textarea
                  className="min-h-[90px] resize-y rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  required
                />
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">Traitement</div>
                <textarea
                  className="min-h-[90px] resize-y rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                  required
                />
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">Ordonnance (texte)</div>
                <textarea
                  className="min-h-[90px] resize-y rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  value={prescriptionText}
                  onChange={(e) => setPrescriptionText(e.target.value)}
                />
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">Notes (optionnel)</div>
                <textarea
                  className="min-h-[90px] resize-y rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {error ? (
                <div className="mt-3 rounded-[10px] border border-accent-border bg-accent-bg p-3 text-fg">
                  {error}
                </div>
              ) : null}

              <div className="mt-3.5 flex flex-wrap gap-2.5">
                <button
                  className="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? 'Enregistrement...' : 'Enregistrer dans le carnet'}
                </button>
                <button
                  className="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={busy}
                  onClick={() => navigate('/')}
                >
                  Quitter
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  )
}
