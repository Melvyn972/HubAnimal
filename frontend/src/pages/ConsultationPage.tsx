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
      <div className="pageTitle">Consultation (QR)</div>

      {tokenHint ? (
        <div className="muted" style={{ marginBottom: 12 }}>
          Token : <code>{tokenHint}</code>
        </div>
      ) : null}

      {busy ? <div className="muted" style={{ marginBottom: 12 }}>Chargement...</div> : null}

      {error ? (
        <div className="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {patient ? (
        <div className="card">
          <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 8 }}>
            {patient.name} ({patient.species})
          </div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Allergies critiques : {patient.allergiesCritical || '—'}
          </div>
          {expiresAt ? (
            <div className="muted" style={{ marginBottom: 12 }}>
              Token valable jusqu’au : {new Date(expiresAt).toLocaleString()}
            </div>
          ) : null}

          <div className="hr" />

          {submitted ? (
            <div>
              <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 8 }}>
                Mise à jour effectuée
              </div>
              <div className="muted" style={{ marginBottom: 14 }}>
                L’entrée a été enregistrée dans le carnet.
              </div>
              <button className="button" type="button" onClick={() => navigate('/')}>
                Retour à l’accueil
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="grid2">
                <div className="field">
                  <div className="label">Date</div>
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="field">
                  <div className="label">Poids (kg, optionnel)</div>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="ex: 12.4"
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <div className="label">Diagnostic</div>
                <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} required />
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <div className="label">Traitement</div>
                <textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} required />
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <div className="label">Ordonnance (texte)</div>
                <textarea value={prescriptionText} onChange={(e) => setPrescriptionText(e.target.value)} />
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <div className="label">Notes (optionnel)</div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {error ? <div className="alert" style={{ marginTop: 12 }}>{error}</div> : null}

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="button" type="submit" disabled={busy}>
                  {busy ? 'Enregistrement...' : 'Enregistrer dans le carnet'}
                </button>
                <button className="button" type="button" disabled={busy} onClick={() => navigate('/')}>
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

