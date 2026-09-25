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
  createDose,
  getDoseById,
  listDoses,
  listDosesForDay,
  listMedicines,
  listRecentConfirmations,
  summarise,
  type AdherenceSummary,
  type DoseView,
  type NewDose,
} from './doses';
export { inspectDatabase, type TableDump } from './inspect';
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
