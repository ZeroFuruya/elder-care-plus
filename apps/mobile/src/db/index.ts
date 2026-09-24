export { getDatabase } from './database';
export {
  ensureDemoData,
  ensureDemoSchedule,
  loadDemoSafeDay,
  DEMO_CAREGIVER,
  DEMO_ELDER,
  DEMO_PASSWORD,
} from './demo';
export { getLinkedElder, linkCaregiverToElder, type CareLink } from './care-links';
export {
  confirmDose,
  getDoseById,
  listDoses,
  listDosesForDay,
  listMedicines,
  listRecentConfirmations,
  summarise,
  type AdherenceSummary,
  type DoseView,
} from './doses';
export {
  authenticate,
  countUsers,
  createUser,
  emailExists,
  findUserByEmail,
  normaliseEmail,
  type PublicUser,
  type SignInFailure,
  type SignInResult,
  type StoredUser,
} from './users';
