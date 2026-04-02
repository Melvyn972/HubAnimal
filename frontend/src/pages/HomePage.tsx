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
      <div className="mb-3 text-lg font-bold text-fg">Carnet de santé</div>

      {lastPatientId ? (
        <div className="mb-4 rounded-[10px] border border-border bg-transparent p-4">
          <div className="mb-2.5 font-[650] text-fg">Carnet précédent</div>
          <div className="mb-3 text-[13px] text-muted">Un carnet existe déjà sur ce navigateur.</div>
          <a
            className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg no-underline transition-colors hover:border-accent-border hover:bg-accent-bg"
            href={`#/patients/${lastPatientId}`}
          >
            Ouvrir le carnet
          </a>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="rounded-[10px] borderbg-transparent py-4">
          <div className="mb-2.5 font-[650] text-fg">Créer un carnet</div>

          {error ? (
            <div className="mb-3 rounded-[10px] border border-accent-border bg-accent-bg p-3 text-fg">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Nom de l’animal</div>
              <input
                className="rounded-xl border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Espèce</div>
              <input
                className="rounded-xl border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                value={form.species}
                onChange={(e) => setForm((f) => ({ ...f, species: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Date de naissance (optionnel)</div>
              <input
                className="rounded-xl border border-border bg-transparent px-4 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Contact propriétaire (optionnel)</div>
              <input
                className="rounded-xl border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                value={form.ownerContact}
                onChange={(e) => setForm((f) => ({ ...f, ownerContact: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Allergies critiques (optionnel)</div>
              <textarea
                className="min-h-[90px] resize-y rounded-xl border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                value={form.allergiesCritical}
                onChange={(e) => setForm((f) => ({ ...f, allergiesCritical: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[13px] text-muted">Traitements critiques (optionnel)</div>
              <textarea
                className="min-h-[90px] resize-y rounded-xl border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit focus-visible:border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border/40"
                value={form.treatmentsCritiques}
                onChange={(e) => setForm((f) => ({ ...f, treatmentsCritiques: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex w-full justify-center flex-wrap gap-2.5">
            <button
              className="cursor-pointer font-bold rounded-full bg-accent px-6 py-2.5 text-white transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Création...' : 'Créer le carnet'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
