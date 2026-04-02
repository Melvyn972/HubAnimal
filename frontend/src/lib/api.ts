import type {
  ConsultationEntryInput,
  Patient,
  PatientCreateInput,
} from '../types'

type ApiErr = { ok: false; error: string }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  })

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body ? (body as ApiErr).error : 'server_error'
    throw new Error(String(err))
  }

  return body as T
}

export async function createPatient(input: PatientCreateInput): Promise<Patient> {
  const res = await apiFetch<{ ok: true; patient: Patient }>('/api/patients', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.patient
}

export async function getPatient(patientId: string): Promise<Patient> {
  const res = await apiFetch<{ ok: true; patient: Patient }>(`/api/patients/${encodeURIComponent(patientId)}`)
  return res.patient
}

export async function createConsultationToken(params: {
  patientId: string
  expiresInMinutes: number
}): Promise<{ token: string; expiresAt: string }> {
  const res = await apiFetch<{ ok: true; token: string; expiresAt: string }>(
    '/api/consultation/tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        patientId: params.patientId,
        expiresInMinutes: params.expiresInMinutes,
      }),
    },
  )

  return { token: res.token, expiresAt: res.expiresAt }
}

export async function validateConsultationToken(params: {
  token: string
}): Promise<{ patient: Patient; expiresAt: string }> {
  const res = await apiFetch<{ ok: true; patient: Patient; token: { token: string; expiresAt: string } }>(
    `/api/consultation/validate?token=${encodeURIComponent(params.token)}`,
  )

  return { patient: res.patient, expiresAt: res.token.expiresAt }
}

export async function submitConsultation(params: {
  token: string
  entry: ConsultationEntryInput
}): Promise<{ patientId: string }> {
  const res = await apiFetch<{ ok: true; patientId: string }>('/api/consultation/submit', {
    method: 'POST',
    body: JSON.stringify({
      token: params.token,
      entry: params.entry,
    }),
  })

  return { patientId: res.patientId }
}

