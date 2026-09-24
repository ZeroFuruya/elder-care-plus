/**
 * Synthetic emergency profile for the demo elder. Committed fixtures only — never real
 * health data (see AGENTS.md, "Data safety and AI use").
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
