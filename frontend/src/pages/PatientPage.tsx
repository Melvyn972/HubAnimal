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
      <div className="pageTitle">Carnet</div>

      {busy ? <div className="muted">Chargement...</div> : null}

      {error ? <div className="alert">{error}</div> : null}

      {patient ? (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 8 }}>
              {patient.name} ({patient.species})
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              Date de naissance : {patient.dateOfBirth || '—'}
            </div>
            <div className="hr" />
            <div className="grid2">
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Allergies critiques
                </div>
                <div>{patient.allergiesCritical || '—'}</div>
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Traitements critiques
                </div>
                <div>{patient.treatmentsCritiques || '—'}</div>
              </div>
            </div>
            <div className="hr" />
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Contact propriétaire
              </div>
              <div>{patient.ownerContact || '—'}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 8 }}>
              Historique
            </div>

            {patient.timelineEntries.length ? (
              patient.timelineEntries.map((t) => (
                <div key={t.id} className="timelineItem">
                  <div className="timelineMeta">
                    {t.date} • poids : {t.weight === null ? '—' : `${t.weight} kg`}
                  </div>
                  <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 6 }}>
                    Diagnostic
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{t.diagnosis || '—'}</div>
                  <div className="hr" />
                  <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 6 }}>
                    Traitement
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{t.treatment || '—'}</div>
                  {t.prescriptionText ? (
                    <>
                      <div className="hr" />
                      <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 6 }}>
                        Ordonnance
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{t.prescriptionText}</div>
                    </>
                  ) : null}
                  {t.notes ? (
                    <>
                      <div className="hr" />
                      <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 6 }}>
                        Notes
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</div>
                    </>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="muted">Aucune entrée pour le moment.</div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 10 }}>
              QR consultation temporaire
            </div>

            <div className="grid2" style={{ marginBottom: 12 }}>
              <div className="field">
                <div className="label">Durée (minutes)</div>
                <input
                  className="input"
                  type="number"
                  value={expiresInMinutes}
                  min={1}
                  max={1440}
                  onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <div className="label">URL accessible depuis le téléphone</div>
                <input
                  className="input"
                  value={shareBaseUrl}
                  onChange={(e) => setShareBaseUrlState(e.target.value)}
                  placeholder="http://192.168.x.x:5173"
                />
              </div>
            </div>

            {qrError ? <div className="alert" style={{ marginBottom: 12 }}>{qrError}</div> : null}

            <button className="button" type="button" onClick={onGenerateQr} disabled={qrBusy}>
              {qrBusy ? 'Génération...' : 'Générer le QR'}
            </button>

            {tokenExpiresAt ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Token valable jusqu’au : {new Date(tokenExpiresAt).toLocaleString()}
              </div>
            ) : null}

            {qrDataUrl ? (
              <div style={{ marginTop: 14 }}>
                <div className="qrRow">
                  <img className="qrImg" src={qrDataUrl} alt="QR code consultation" />
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 650, color: 'var(--text-h)', marginBottom: 8 }}>
                      Lien de consultation
                    </div>
                    <div className="muted" style={{ marginBottom: 10, wordBreak: 'break-word' }}>
                      <code>{shareLink}</code>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button" type="button" onClick={onCopyLink}>
                        Copier le lien
                      </button>
                      <a className="link" href={shareLink || '#'} target="_blank" rel="noreferrer">
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

