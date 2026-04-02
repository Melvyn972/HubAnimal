const LAST_PATIENT_ID_KEY = "hubanimal:lastPatientId"
const SHARE_BASE_URL_KEY = "hubanimal:shareBaseUrl"

export function getLastPatientId(): string | null {
  const raw = window.localStorage.getItem(LAST_PATIENT_ID_KEY)
  return raw && raw.length ? raw : null
}

export function setLastPatientId(patientId: string) {
  window.localStorage.setItem(LAST_PATIENT_ID_KEY, patientId)
}

export function getShareBaseUrl(): string | null {
  const raw = window.localStorage.getItem(SHARE_BASE_URL_KEY)
  return raw && raw.length ? raw : null
}

export function setShareBaseUrl(url: string) {
  window.localStorage.setItem(SHARE_BASE_URL_KEY, url)
}

