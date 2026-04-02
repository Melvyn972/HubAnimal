export type TimelineEntry = {
  id: string
  createdAt: string
  date: string
  weight: number | null
  diagnosis: string
  treatment: string
  prescriptionText: string
  notes: string
}

export type Patient = {
  id: string
  name: string
  species: string
  dateOfBirth: string | null
  ownerContact: string
  allergiesCritical: string
  treatmentsCritiques: string
  timelineEntries: TimelineEntry[]
  createdAt: string
}

export type ConsultationEntryInput = {
  date: string
  weight: number | null
  diagnosis: string
  treatment: string
  prescriptionText: string
  notes: string
}

export type PatientCreateInput = {
  name: string
  species: string
  dateOfBirth?: string
  ownerContact?: string
  allergiesCritical?: string
  treatmentsCritiques?: string
}

