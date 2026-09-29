/**
 * Synthetic emergency profile for the tagged local-demo fallback.
 *
 * Supabase-backed builds no longer import this: the elder emergency screen
 * shows an honest empty state until the real profile lands (Sprint 2), so a
 * demo stranger is never presented as the signed-in older adult. Committed
 * fixtures only — never real health data (see AGENTS.md, "Data safety and AI
 * use").
 */
export const demoEmergencyProfile = {
  fullName: 'Ana Reyes',
  dateOfBirth: '14 March 1948',
  bloodType: 'O+',
  address: '12 Sampaguita Street, Barangay San Roque',
  conditions: ['Hypertension', 'Type 2 diabetes'],
  allergies: ['Penicillin'],
  medicines: ['Amlodipine 5 mg', 'Metformin 500 mg'],
  instructions: 'Keep the medicine box on the kitchen counter. Call my daughter before any change.',
  physician: { name: 'Dr. Lourdes Bautista', number: '+63 917 000 0000' },
  emergencyContact: { name: 'Maria Santos (daughter)', number: '+63 917 000 0001' },
} as const;
