import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { createConsultationToken, getPatient } from '../lib/api'
import { getShareBaseUrl, setShareBaseUrl } from '../lib/storage'
import type { Patient } from '../types'

export default function PatientPage() {
  const params = useParams()
  const patientId = params.patientId || ''

  const [patient, setPatient] = useState<Patient | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialShareBaseUrl = useMemo(() => {
    return getShareBaseUrl() || window.location.origin
  }, [])

  const [shareBaseUrl, setShareBaseUrlState] = useState(initialShareBaseUrl)
  const [expiresInMinutes, setExpiresInMinutes] = useState(15)

  const [qrBusy, setQrBusy] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setBusy(true)
      setError(null)
      try {
        const p = await getPatient(patientId)
        if (!cancelled) setPatient(p)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'server_error')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    if (patientId) load()
    return () => {
      cancelled = true
    }
  }, [patientId])

  async function onGenerateQr() {
    if (!patient) return
    setQrBusy(true)
    setQrError(null)
    setTokenExpiresAt(null)
    setShareLink(null)
    setQrDataUrl(null)

    try {
      const effectiveBaseUrl = shareBaseUrl && shareBaseUrl.length ? shareBaseUrl : window.location.origin
      const { token, expiresAt } = await createConsultationToken({
        patientId: patient.id,
        expiresInMinutes,
      })

      const url = `${effectiveBaseUrl}/#/consultation?token=${encodeURIComponent(token)}`
      const qr = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 240,
      })

      setShareBaseUrl(effectiveBaseUrl)
      setTokenExpiresAt(expiresAt)
      setShareLink(url)
      setQrDataUrl(qr)
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'server_error')
    } finally {
      setQrBusy(false)
    }
  }

  async function onCopyLink() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
  }

  return (
    <div>
      <div className="mb-3 text-base font-[650] text-fg">Carnet</div>

      {busy ? <div className="text-[13px] text-muted">Chargement...</div> : null}

      {error ? (
        <div className="rounded-[10px] border border-accent-border bg-accent-bg p-3 text-fg">
          {error}
        </div>
      ) : null}

      {patient ? (
        <div>
          <div className="mb-4 rounded-[10px] border border-border bg-transparent p-4">
            <div className="mb-2 font-[650] text-fg">
              {patient.name} ({patient.species})
            </div>
            <div className="mb-2.5 text-[13px] text-muted">
              Date de naissance : {patient.dateOfBirth || '—'}
            </div>
            <div className="my-4 border-t border-border" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[13px] text-muted">Allergies critiques</div>
                <div>{patient.allergiesCritical || '—'}</div>
              </div>
              <div>
                <div className="mb-1.5 text-[13px] text-muted">Traitements critiques</div>
                <div>{patient.treatmentsCritiques || '—'}</div>
              </div>
            </div>
            <div className="my-4 border-t border-border" />
            <div>
              <div className="mb-1.5 text-[13px] text-muted">Contact propriétaire</div>
              <div>{patient.ownerContact || '—'}</div>
            </div>
          </div>

          <div className="mb-4 rounded-[10px] border border-border bg-transparent p-4">
            <div className="mb-2 font-[650] text-fg">Historique</div>

            {patient.timelineEntries.length ? (
              patient.timelineEntries.map((t) => (
                <div key={t.id} className="mb-2.5 rounded-[10px] border border-border p-3">
                  <div className="mb-1.5 text-[13px] text-muted">
                    {t.date} • poids : {t.weight === null ? '—' : `${t.weight} kg`}
                  </div>
                  <div className="mb-1.5 font-[650] text-fg">Diagnostic</div>
                  <div className="whitespace-pre-wrap">{t.diagnosis || '—'}</div>
                  <div className="my-4 border-t border-border" />
                  <div className="mb-1.5 font-[650] text-fg">Traitement</div>
                  <div className="whitespace-pre-wrap">{t.treatment || '—'}</div>
                  {t.prescriptionText ? (
                    <>
                      <div className="my-4 border-t border-border" />
                      <div className="mb-1.5 font-[650] text-fg">Ordonnance</div>
                      <div className="whitespace-pre-wrap">{t.prescriptionText}</div>
                    </>
                  ) : null}
                  {t.notes ? (
                    <>
                      <div className="my-4 border-t border-border" />
                      <div className="mb-1.5 font-[650] text-fg">Notes</div>
                      <div className="whitespace-pre-wrap">{t.notes}</div>
                    </>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-[13px] text-muted">Aucune entrée pour le moment.</div>
            )}
          </div>

          <div className="rounded-[10px] border border-border bg-transparent p-4">
            <div className="mb-2.5 font-[650] text-fg">QR consultation temporaire</div>

            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">Durée (minutes)</div>
                <input
                  className="rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  type="number"
                  value={expiresInMinutes}
                  min={1}
                  max={1440}
                  onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[13px] text-muted">URL accessible depuis le téléphone</div>
                <input
                  className="rounded-lg border border-border bg-transparent px-2.5 py-2.5 font-[inherit] text-inherit"
                  value={shareBaseUrl}
                  onChange={(e) => setShareBaseUrlState(e.target.value)}
                  placeholder="http://192.168.x.x:5173"
                />
              </div>
            </div>

            {qrError ? (
              <div className="mb-3 rounded-[10px] border border-accent-border bg-accent-bg p-3 text-fg">
                {qrError}
              </div>
            ) : null}

            <button
              className="cursor-pointer rounded-full bg-accent px-6 py-2.5 text-white transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onGenerateQr}
              disabled={qrBusy}
            >
              {qrBusy ? 'Génération...' : 'Générer le QR'}
            </button>

            {tokenExpiresAt ? (
              <div className="mt-2.5 text-[13px] text-muted">
                Token valable jusqu’au : {new Date(tokenExpiresAt).toLocaleString()}
              </div>
            ) : null}

            {qrDataUrl ? (
              <div className="mt-3.5">
                <div className="flex flex-wrap w-full justify-center items-start gap-4">
                  <img
                    className="h-60 w-60 border border-border bg-white"
                    src={qrDataUrl}
                    alt="QR code consultation"
                  />
                  <div className="min-w-[220px]">
                    <div className="mb-2 font-[650] text-fg">Lien de consultation</div>
                    <div className="mb-2.5 text-[13px] text-muted wrap-break-word">
                      <code className="rounded-md bg-code-bg px-1.5 py-0.5 font-mono text-[13px] text-fg">
                        {shareLink}
                      </code>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        className="cursor-pointer rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg transition-colors hover:border-accent-border hover:bg-accent-bg disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        onClick={onCopyLink}
                      >
                        Copier le lien
                      </button>
                      <a
                        className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2.5 text-fg no-underline transition-colors hover:border-accent-border hover:bg-accent-bg"
                        href={shareLink || '#'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ouvrir
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
