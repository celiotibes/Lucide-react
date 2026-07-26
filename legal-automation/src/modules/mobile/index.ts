// src/modules/mobile/index.ts
export { MobileService } from './mobile.service';
export { setupMobileRoutes } from './routes';
export type {
  MobileUser,
  MobileSession,
  MobileNotification,
  MobileCase,
  MobileDocument,
  MobileTimeEntry,
  MobilePushPayload,
  MobileAppConfig,
  SyncStatus,
  CaseUpdate,
  MobileDeadline,
} from './types';
