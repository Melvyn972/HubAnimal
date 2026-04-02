import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPatient } from '../lib/api'
import { getLastPatientId, setLastPatientId } from '../lib/storage'
import type { PatientCreateInput } from '../types'

export default function HomePage() {
  const navigate = useNavigate()
  const lastPatientId = useMemo(() => getLastPatientId(), [])

  const [form, setForm] = useState<PatientCreateInput>({
    name: '',
    species: '',
    dateOfBirth: '',
    ownerContact: '',
    allergiesCritical: '',
    treatmentsCritiques: '',
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const patient = await createPatient({
        ...form,
        dateOfBirth: form.dateOfBirth ? form.dateOfBirth : undefined,
        ownerContact: form.ownerContact ? form.ownerContact : undefined,
        allergiesCritical: form.allergiesCritical ? form.allergiesCritical : undefined,
        treatmentsCritiques: form.treatmentsCritiques ? form.treatmentsCritiques : undefined,
      })

      setLastPatientId(patient.id)
      navigate(`/patients/${patient.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'server_error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="pageTitle">Carnet de santé</div>

      {lastPatientId ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 10 }}>
            Carnet précédent
          </div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Un carnet existe déjà sur ce navigateur.
          </div>
          <a className="link" href={`#/patients/${lastPatientId}`}>
            Ouvrir le carnet
          </a>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="card">
          <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 10 }}>
            Créer un carnet
          </div>

          {error ? <div className="alert" style={{ marginBottom: 12 }}>{error}</div> : null}

          <div className="grid2">
            <div className="field">
              <div className="label">Nom de l’animal</div>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <div className="label">Espèce</div>
              <input
                className="input"
                value={form.species}
                onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field">
              <div className="label">Date de naissance (optionnel)</div>
              <input
                className="input"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </div>
            <div className="field">
              <div className="label">Contact propriétaire (optionnel)</div>
              <input
                className="input"
                value={form.ownerContact}
                onChange={(e) => setForm((f) => ({ ...f, ownerContact: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field">
              <div className="label">Allergies critiques (optionnel)</div>
              <textarea
                value={form.allergiesCritical}
                onChange={(e) => setForm((f) => ({ ...f, allergiesCritical: e.target.value }))}
              />
            </div>
            <div className="field">
              <div className="label">Traitements critiques (optionnel)</div>
              <textarea
                value={form.treatmentsCritiques}
                onChange={(e) => setForm((f) => ({ ...f, treatmentsCritiques: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="button" type="submit" disabled={busy}>
              {busy ? 'Création...' : 'Créer le carnet'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

