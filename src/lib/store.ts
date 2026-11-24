import { create, type StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppNotification, Booking, City, Conversation, DriverDocument, DriverVerification,
  AccountRestriction, Language, Message, Mode, ModerationAction, ModerationAppeal,
  NotificationType, Report, ReportReason, Review, ReviewCategories, Ride, RideRequest,
  SearchQuery, StaffMember, StaffRole, User, Vehicle,
} from './types';
import { buildSeed, type SeedData } from './seed';
import { generatePin, hashPassword, nowIso, uid } from './utils';
import { cityName } from './cities';
import { translate } from '../i18n';
import { runtimeMode } from './runtime';
import { canStaff, staffRoleOf } from './staff';
import { useCloudStore } from './cloudStore';

export type Result = { ok: true } | { ok: false; error: string };
type MaybePromise<T> = T | Promise<T>;
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export interface AppState extends SeedData {
  sessionUserId: string | null;
  language: Language;
  onboardingSeen: boolean;
  connectionStatus: 'idle' | 'loading' | 'ready' | 'error';
  connectionError: string | null;
  staffMembers: StaffMember[];
  restrictions: AccountRestriction[];
  moderationActions: ModerationAction[];
  appeals: ModerationAppeal[];

  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setLanguage: (lang: Language) => MaybePromise<Result>;
  setOnboardingSeen: () => void;
  signUp: (p: { fullName: string; email: string; password: string }) => Promise<Result & { confirmationRequired?: boolean }>;
  login: (email: string, password: string) => Promise<Result>;
  requestPhoneOtp: (phone: string) => Promise<Result>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<Result & { isNew?: boolean }>;
  phoneAuth: (phone: string) => MaybePromise<Result & { isNew?: boolean }>;
  requestPasswordReset: (email: string) => Promise<Result>;
  updatePassword: (password: string) => Promise<Result>;
  loginDemo: (userId: string) => void;
  logout: () => MaybePromise<Result>;
  updateProfile: (p: Partial<Pick<User, 'fullName' | 'phone' | 'photoUrl' | 'dateOfBirth' | 'gender' | 'bio' | 'atmosphere' | 'language'>>) => MaybePromise<Result>;
  setMode: (mode: Mode) => MaybePromise<Result>;
  resetAll: () => void;

  addVehicle: (p: Omit<Vehicle, 'id' | 'ownerId' | 'isDemo'>) => MaybePromise<Result>;
  saveDocument: (doc: Omit<DriverDocument, 'id' | 'userId' | 'uploadedAt'>) => MaybePromise<Result>;
  removeDocument: (kind: DriverDocument['kind']) => MaybePromise<Result>;
  getDocumentUrl: (documentId: string, reason: string) => Promise<Result & { url?: string }>;
  submitVerification: () => MaybePromise<Result>;
  reviewVerification: (userId: string, approve: boolean, reason?: string) => MaybePromise<Result>;

  publishRide: (p: Omit<Ride, 'id' | 'driverId' | 'status' | 'createdAt' | 'isDemo' | 'arrivalAt'> & { durationMin: number }) => MaybePromise<Result & { rideId?: string }>;
  updateRide: (rideId: string, p: Partial<Ride>) => MaybePromise<Result>;
  cancelRide: (rideId: string) => MaybePromise<Result>;
  startRide: (rideId: string) => MaybePromise<Result>;
  completeRide: (rideId: string) => MaybePromise<Result>;

  requestBooking: (rideId: string, seats: number) => MaybePromise<Result & { bookingId?: string }>;
  decideBooking: (bookingId: string, accept: boolean) => MaybePromise<Result>;
  cancelBooking: (bookingId: string) => MaybePromise<Result>;
  boardWithPin: (bookingId: string, pin: string) => MaybePromise<Result>;
  markNoShow: (bookingId: string) => MaybePromise<Result>;
  confirmPayment: (bookingId: string, side: 'passenger' | 'driver') => MaybePromise<Result>;
  submitReview: (p: { bookingId: string; stars: number; categories: ReviewCategories | null; text: string }) => MaybePromise<Result>;

  createRideRequest: (p: Omit<RideRequest, 'id' | 'passengerId' | 'status' | 'createdAt' | 'isDemo'>) => MaybePromise<Result>;
  closeRideRequest: (id: string) => MaybePromise<Result>;

  ensureConversation: (otherUserId: string, rideId?: string | null, bookingId?: string | null) => MaybePromise<string>;
  sendMessage: (conversationId: string, text: string) => MaybePromise<Result>;
  markConversationRead: (conversationId: string) => MaybePromise<Result>;
  blockInConversation: (conversationId: string, block: boolean) => MaybePromise<Result>;

  addReport: (p: { targetType: Report['targetType']; targetId: string; reason: ReportReason; details: string }) => MaybePromise<Result>;
  resolveReport: (reportId: string, action: string, internalNote?: string) => MaybePromise<Result>;
  dismissReport: (reportId: string, internalNote?: string) => MaybePromise<Result>;
  assignReport: (reportId: string, staffUserId: string) => MaybePromise<Result>;
  moderateReview: (reviewId: string, remove: boolean, reason?: string) => MaybePromise<Result>;
  setStaffRole: (userId: string, role: StaffRole, active: boolean) => MaybePromise<Result>;
  applyModeration: (p: { userId: string; kind: 'warning' | 'timeout' | 'ban'; reason: string; publicMessage: string; internalNote: string; durationMinutes?: number }) => MaybePromise<Result>;
  reverseRestriction: (restrictionId: string, reason: string, publicMessage: string, internalNote: string) => MaybePromise<Result>;
  submitAppeal: (actionId: string, statement: string) => MaybePromise<Result>;
  reviewAppeal: (appealId: string, decision: 'under_review' | 'granted' | 'denied', note: string, publicMessage?: string, internalNote?: string) => MaybePromise<Result>;

  toggleSavedDriver: (driverId: string) => MaybePromise<Result>;
  addTrustedContact: (name: string, phone: string) => MaybePromise<Result>;
  removeTrustedContact: (id: string) => MaybePromise<Result>;
  addRecentSearch: (q: SearchQuery) => MaybePromise<Result>;

  markNotificationRead: (id: string) => MaybePromise<Result>;
  markAllNotificationsRead: () => MaybePromise<Result>;

  suspendUser: (userId: string, suspend: boolean) => MaybePromise<Result>;
  addCity: (p: Omit<City, 'id'>) => MaybePromise<Result>;
  sendAnnouncement: (title: string, body: string) => MaybePromise<Result>;
}

function initialState() {
  const seed = buildSeed();
  const createdAt = new Date(Date.now() - 12 * 86400000).toISOString();
  const reversedAt = new Date(Date.now() - 2 * 86400000).toISOString();
  const restrictionId = 'demo-restriction-reversed';
  const actionId = 'demo-moderation-ban';
  const staffMembers: StaffMember[] = [{
    userId: 'u-admin', role: 'super_admin', active: true,
    createdAt: new Date(Date.now() - 200 * 86400000).toISOString(),
    updatedAt: createdAt,
  }];
  const restrictions: AccountRestriction[] = [{
    id: restrictionId, userId: 'u-yacine', kind: 'ban',
    reason: 'Demo audit example: identity mismatch required review.',
    publicMessage: 'Your demo account restriction was reviewed and reversed.',
    internalNote: 'Fictional demonstration record only.', startsAt: createdAt,
    expiresAt: null, active: false, createdBy: 'u-admin', createdAt,
    reversedAt, reversedBy: 'u-admin',
  }];
  const moderationActions: ModerationAction[] = [
    {
      id: 'demo-moderation-reversal', actorId: 'u-admin', subjectId: 'u-yacine',
      actionType: 'reverse_ban', targetType: 'user', targetId: 'u-yacine',
      reason: 'Demo audit example: review completed.', publicMessage: 'Access restored.',
      internalNote: 'Fictional demonstration record only.', durationMinutes: null,
      expiresAt: null, metadata: { restrictionId }, createdAt: reversedAt,
    },
    {
      id: actionId, actorId: 'u-admin', subjectId: 'u-yacine', actionType: 'ban',
      targetType: 'user', targetId: 'u-yacine', reason: 'Demo audit example.',
      publicMessage: 'A demo restriction was applied.', internalNote: 'Fictional demonstration record only.',
      durationMinutes: null, expiresAt: null, metadata: { restrictionId }, createdAt,
    },
  ];
  const appeals: ModerationAppeal[] = [{
    id: 'demo-appeal-granted', actionId, appellantId: 'u-yacine',
    statement: 'This is a fictional appeal used to demonstrate the moderation workflow.',
    status: 'granted', reviewedBy: 'u-admin', reviewNote: 'Demo review completed.',
    publicMessage: 'The demo restriction was reversed.', internalNote: 'Fictional demonstration record only.',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), reviewedAt: reversedAt,
  }];
  return {
    ...seed,
    users: seed.users.map((user) => user.id === 'u-admin' ? { ...user, staffRole: 'super_admin' as const } : user),
    sessionUserId: null,
    language: 'fr' as Language,
    onboardingSeen: false,
    connectionStatus: 'ready' as const,
    connectionError: null,
    staffMembers,
    restrictions,
    moderationActions,
    appeals,
  };
}

const demoStateCreator: StateCreator<AppState> = (set, get) => {
      const notify = (userId: string, type: NotificationType, params: Record<string, string | number>, route: string | null) => {
        const user = get().users.find((u) => u.id === userId);
        if (!user) return;
        const lang = user.language;
        const n: AppNotification = {
          id: uid(), userId, type,
          title: translate(lang, `notif.${type}.title`, params),
          body: translate(lang, `notif.${type}.body`, params),
          route, read: false, createdAt: nowIso(), params,
        };
        set((s) => ({ notifications: [n, ...s.notifications] }));
      };

      const rideLabel = (ride: Ride, lang: Language) => {
        const s = get();
        return {
          from: cityName(s.cities.find((c) => c.id === ride.fromCityId), lang),
          to: cityName(s.cities.find((c) => c.id === ride.toCityId), lang),
        };
      };

      const seatsAvailable = (s: AppState, rideId: string): number => {
        const ride = s.rides.find((r) => r.id === rideId);
        if (!ride) return 0;
        const taken = s.bookings
          .filter((b) => b.rideId === rideId && b.status === 'confirmed')
          .reduce((sum, b) => sum + b.seats, 0);
        return Math.max(0, ride.seatsTotal - taken);
      };

      return {
        ...initialState(),

        initialize: async () => undefined,
        refresh: async () => undefined,

        setLanguage: (lang) => {
          set((s) => ({
            language: lang,
            users: s.sessionUserId ? s.users.map((u) => (u.id === s.sessionUserId ? { ...u, language: lang } : u)) : s.users,
          }));
          return ok;
        },
        setOnboardingSeen: () => set({ onboardingSeen: true }),

        signUp: async ({ fullName, email, password }) => {
          const s = get();
          const normalized = email.trim().toLowerCase();
          if (s.users.some((u) => u.email?.toLowerCase() === normalized)) return fail('auth.emailTaken');
          const salt = uid();
          const passwordHash = await hashPassword(password, salt);
          const user: User = {
            id: uid(), fullName: fullName.trim(), email: normalized, phone: null,
            passwordHash, salt, photoUrl: null, avatarHue: Math.floor(Math.random() * 360),
            dateOfBirth: null, gender: 'unspecified', language: s.language, bio: '',
            role: 'user', mode: 'passenger', status: 'active',
            phoneVerified: false, emailVerified: false, atmosphere: [],
            createdAt: nowIso(), isDemo: false,
          };
          set((st) => ({
            users: [...st.users, user],
            verifications: [...st.verifications, { userId: user.id, status: 'not_submitted', documentIds: [], submittedAt: null, reviewedAt: null, reason: null }],
            sessionUserId: user.id,
          }));
          return ok;
        },

        login: async (email, password) => {
          const s = get();
          const user = s.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
          if (!user || !user.passwordHash || !user.salt) return fail('auth.invalidCredentials');
          const hash = await hashPassword(password, user.salt);
          if (hash !== user.passwordHash) return fail('auth.invalidCredentials');
          set({ sessionUserId: user.id, language: user.language });
          return ok;
        },

        phoneAuth: (phone) => {
          const s = get();
          const existing = s.users.find((u) => u.phone === phone);
          if (existing) {
            set({ sessionUserId: existing.id, language: existing.language });
            return { ok: true, isNew: false };
          }
          const user: User = {
            id: uid(), fullName: '', email: null, phone,
            passwordHash: null, salt: null, photoUrl: null, avatarHue: Math.floor(Math.random() * 360),
            dateOfBirth: null, gender: 'unspecified', language: s.language, bio: '',
            role: 'user', mode: 'passenger', status: 'active',
            phoneVerified: false, emailVerified: false, atmosphere: [],
            createdAt: nowIso(), isDemo: false,
          };
          set((st) => ({
            users: [...st.users, user],
            verifications: [...st.verifications, { userId: user.id, status: 'not_submitted', documentIds: [], submittedAt: null, reviewedAt: null, reason: null }],
            sessionUserId: user.id,
          }));
          return { ok: true, isNew: true };
        },

        requestPhoneOtp: async () => ok,
        verifyPhoneOtp: async (phone) => get().phoneAuth(phone),
        requestPasswordReset: async () => fail('auth.resetUnavailableDemo'),
        updatePassword: async () => fail('auth.resetUnavailableDemo'),

        loginDemo: (userId) => {
          const user = get().users.find((u) => u.id === userId && u.isDemo);
          if (!user) return;
          set({ sessionUserId: user.id, language: user.language });
        },

        logout: () => {
          set({ sessionUserId: null });
          return ok;
        },

        updateProfile: (p) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) }));
          return ok;
        },

        setMode: (mode) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, mode } : u)) }));
          return ok;
        },

        resetAll: () => set({ ...initialState() }),

        addVehicle: (p) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          const vehicle: Vehicle = { ...p, id: uid(), ownerId: id, isDemo: false };
          set((s) => ({ vehicles: [...s.vehicles, vehicle] }));
          return ok;
        },

        saveDocument: (doc) => {
          const id = get().sessionUserId;
          if (!id || get().verifications.some((v) => v.userId === id && (v.status === 'pending' || v.status === 'verified'))) return fail('common.error');
          const existing = get().documents.find((d) => d.userId === id && d.kind === doc.kind);
          const full: DriverDocument = { ...doc, id: existing?.id ?? uid(), userId: id, uploadedAt: nowIso() };
          set((s) => ({
            documents: [...s.documents.filter((d) => !(d.userId === id && d.kind === doc.kind)), full],
            verifications: s.verifications.map((v) =>
              v.userId === id && (v.status === 'rejected' || v.status === 'not_submitted')
                ? { ...v, status: 'not_submitted', reason: null }
                : v,
            ),
          }));
          return ok;
        },

        removeDocument: (kind) => {
          const id = get().sessionUserId;
          if (!id || get().verifications.some((v) => v.userId === id && (v.status === 'pending' || v.status === 'verified'))) return fail('common.error');
          set((s) => ({ documents: s.documents.filter((d) => !(d.userId === id && d.kind === kind)) }));
          return ok;
        },

        getDocumentUrl: async (documentId) => {
          const document = get().documents.find((d) => d.id === documentId);
          const me = get().users.find((u) => u.id === get().sessionUserId);
          if (!document || !me || (document.userId !== me.id && !canStaff(me, 'review_verification'))) return fail('common.error');
          return { ok: true, url: document.imageDataUrl };
        },

        submitVerification: () => {
          const s = get();
          const id = s.sessionUserId;
          if (!id) return fail('common.error');
          const docs = s.documents.filter((d) => d.userId === id);
          const kinds = new Set(docs.map((d) => d.kind));
          if (!(['id_card', 'license', 'registration', 'selfie'] as const).every((k) => kinds.has(k))) return fail('verify.missingDocs');
          set((st) => ({
            verifications: st.verifications.some((v) => v.userId === id)
              ? st.verifications.map((v) => (v.userId === id ? { ...v, status: 'pending', documentIds: docs.map((d) => d.id), submittedAt: nowIso(), reviewedAt: null, reason: null } : v))
              : [...st.verifications, { userId: id, status: 'pending', documentIds: docs.map((d) => d.id), submittedAt: nowIso(), reviewedAt: null, reason: null }],
          }));
          for (const admin of get().users.filter((u) => canStaff(u, 'review_verification'))) {
            notify(admin.id, 'verification_update', { status: translate(admin.language, 'verify.status.pending') }, '/admin/verifications');
          }
          return ok;
        },

        reviewVerification: (userId, approve, reason) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const verification = get().verifications.find((v) => v.userId === userId);
          if (!me || !canStaff(me, 'review_verification') || !verification || verification.status !== 'pending') return fail('common.error');
          if (!approve && !reason?.trim()) return fail('common.required');
          const now = nowIso();
          set((s) => ({
            verifications: s.verifications.map((v) =>
              v.userId === userId ? { ...v, status: approve ? 'verified' : 'rejected', reviewedAt: now, reason: approve ? null : reason!.trim() } : v,
            ),
            moderationActions: [{
              id: uid(), actorId: me.id, subjectId: userId,
              actionType: approve ? 'verify_driver' : 'reject_driver',
              targetType: 'verification', targetId: userId,
              reason: approve ? 'Verification approved' : reason!.trim(),
              publicMessage: approve ? 'Verification approved' : reason!.trim(),
              internalNote: '', durationMinutes: null, expiresAt: null,
              metadata: {}, createdAt: now,
            }, ...s.moderationActions],
          }));
          const user = get().users.find((u) => u.id === userId);
          if (user) {
            notify(userId, 'verification_update', { status: translate(user.language, approve ? 'verify.status.verified' : 'verify.status.rejected') }, '/driver/verification');
          }
          return ok;
        },

        publishRide: (p) => {
          const s = get();
          const id = s.sessionUserId;
          if (!id) return fail('common.error');
          const verification = s.verifications.find((v) => v.userId === id);
          if (!verification || verification.status !== 'verified') return fail('driver.verificationNeededText');
          const vehicle = s.vehicles.find((v) => v.id === p.vehicleId && v.ownerId === id);
          if (!vehicle) return fail('publish.noVehicle');
          if (p.fromCityId === p.toCityId) return fail('publish.sameCity');
          if (new Date(p.departureAt).getTime() <= Date.now()) return fail('publish.pastTime');
          if (p.pricePerSeat < 50) return fail('publish.invalidPrice');
          if (p.seatsTotal < 1 || p.seatsTotal > vehicle.seats) return fail('common.error');
          const { durationMin, ...rest } = p;
          const ride: Ride = {
            ...rest, id: uid(), driverId: id, status: 'published',
            arrivalAt: new Date(new Date(p.departureAt).getTime() + durationMin * 60000).toISOString(),
            createdAt: nowIso(), isDemo: false,
          };
          set((st) => ({ rides: [ride, ...st.rides] }));
          for (const req of get().rideRequests.filter((r) => r.status === 'open' && r.fromCityId === ride.fromCityId && r.toCityId === ride.toCityId)) {
            const { from, to } = rideLabel(ride, get().users.find((u) => u.id === req.passengerId)?.language ?? 'fr');
            notify(req.passengerId, 'ride_match', { from, to }, `/ride/${ride.id}`);
          }
          return { ok: true, rideId: ride.id };
        },

        updateRide: (rideId, p) => {
          const s = get();
          const ride = s.rides.find((r) => r.id === rideId);
          if (!ride || ride.driverId !== s.sessionUserId) return fail('common.error');
          const hasConfirmed = s.bookings.some((b) => b.rideId === rideId && b.status === 'confirmed');
          const allowed: Partial<Ride> = hasConfirmed
            ? { notes: p.notes ?? ride.notes, preferences: p.preferences ?? ride.preferences }
            : p;
          set((st) => ({ rides: st.rides.map((r) => (r.id === rideId ? { ...r, ...allowed } : r)) }));
          return ok;
        },

        cancelRide: (rideId) => {
          const s = get();
          const ride = s.rides.find((r) => r.id === rideId);
          if (!ride || ride.driverId !== s.sessionUserId) return fail('common.error');
          if (ride.status === 'completed' || ride.status === 'cancelled') return fail('common.error');
          const affected = s.bookings.filter((b) => b.rideId === rideId && (b.status === 'confirmed' || b.status === 'pending'));
          set((st) => ({
            rides: st.rides.map((r) => (r.id === rideId ? { ...r, status: 'cancelled' } : r)),
            bookings: st.bookings.map((b) => (affected.some((a) => a.id === b.id) ? { ...b, status: 'cancelled', cancelledBy: ride.driverId } : b)),
          }));
          const st2 = get();
          for (const b of affected) {
            const lang = st2.users.find((u) => u.id === b.passengerId)?.language ?? 'fr';
            const { from, to } = rideLabel(ride, lang);
            notify(b.passengerId, 'ride_cancelled', { from, to, date: ride.departureAt.slice(0, 10) }, `/reservation/${b.id}`);
          }
          return ok;
        },

        startRide: (rideId) => {
          const s = get();
          const ride = s.rides.find((r) => r.id === rideId);
          if (!ride || ride.driverId !== s.sessionUserId || ride.status !== 'published') return fail('common.error');
          set((st) => ({ rides: st.rides.map((r) => (r.id === rideId ? { ...r, status: 'in_progress' } : r)) }));
          return ok;
        },

        completeRide: (rideId) => {
          const s = get();
          const ride = s.rides.find((r) => r.id === rideId);
          if (!ride || ride.driverId !== s.sessionUserId) return fail('common.error');
          if (ride.status !== 'published' && ride.status !== 'in_progress') return fail('common.error');
          const affected = s.bookings.filter((b) => b.rideId === rideId && b.status === 'confirmed');
          set((st) => ({
            rides: st.rides.map((r) => (r.id === rideId ? { ...r, status: 'completed' } : r)),
            bookings: st.bookings.map((b) => {
              if (!affected.some((a) => a.id === b.id)) return b;
              return { ...b, status: b.boardedAt ? 'completed' : 'no_show', completedAt: nowIso() };
            }),
          }));
          const st2 = get();
          for (const b of affected) {
            const lang = st2.users.find((u) => u.id === b.passengerId)?.language ?? 'fr';
            const label = rideLabel(ride, lang);
            notify(b.passengerId, 'review_request', { from: label.from, to: label.to }, `/review/${b.id}`);
          }
          const driverLang = st2.users.find((u) => u.id === ride.driverId)?.language ?? 'fr';
          const dlabel = rideLabel(ride, driverLang);
          if (affected.some((b) => b.boardedAt)) {
            notify(ride.driverId, 'review_request', { from: dlabel.from, to: dlabel.to }, `/driver/ride/${rideId}`);
          }
          return ok;
        },

        requestBooking: (rideId, seats) => {
          const s = get();
          const id = s.sessionUserId;
          if (!id) return fail('book.loginRequired');
          const user = s.users.find((u) => u.id === id);
          if (!user || user.status !== 'active') return fail('book.verificationRequired');
          const ride = s.rides.find((r) => r.id === rideId);
          if (!ride || ride.status !== 'published') return fail('ride.notFound');
          if (new Date(ride.departureAt).getTime() <= Date.now()) return fail('ride.notFound');
          if (ride.driverId === id) return fail('book.driverSelf');
          if (ride.womenOnly && user.gender !== 'female') return fail('book.womenOnlyDenied');
          if (s.bookings.some((b) => b.rideId === rideId && b.passengerId === id && (b.status === 'pending' || b.status === 'confirmed'))) return fail('book.duplicate');
          const available = seatsAvailable(s, rideId);
          if (seats < 1) return fail('common.error');
          if (available < seats) return fail('book.notEnoughSeats');
          const booking: Booking = {
            id: uid(), rideId, passengerId: id, seats, status: 'pending', pin: null,
            createdAt: nowIso(), decidedAt: null, boardedAt: null, completedAt: null,
            passengerPaid: false, driverReceived: false, paidAt: null, receivedAt: null,
            cancelledBy: null, isDemo: false,
          };
          set((st) => ({ bookings: [booking, ...st.bookings] }));
          const driver = get().users.find((u) => u.id === ride.driverId);
          const { from, to } = rideLabel(ride, driver?.language ?? 'fr');
          notify(ride.driverId, 'booking_request', { name: user.fullName, seats, from, to }, `/driver/ride/${rideId}`);
          return { ok: true, bookingId: booking.id };
        },

        decideBooking: (bookingId, accept) => {
          const s = get();
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking || booking.status !== 'pending') return fail('common.error');
          const ride = s.rides.find((r) => r.id === booking.rideId);
          if (!ride || ride.driverId !== s.sessionUserId) return fail('common.error');
          if (accept && seatsAvailable(s, ride.id) < booking.seats) return fail('book.notEnoughSeats');
          set((st) => ({
            bookings: st.bookings.map((b) =>
              b.id === bookingId
                ? { ...b, status: accept ? 'confirmed' : 'rejected', pin: accept ? generatePin() : null, decidedAt: nowIso() }
                : b,
            ),
          }));
          const passenger = get().users.find((u) => u.id === booking.passengerId);
          const { from, to } = rideLabel(ride, passenger?.language ?? 'fr');
          notify(booking.passengerId, accept ? 'booking_accepted' : 'booking_rejected', { from, to }, `/reservation/${bookingId}`);
          return ok;
        },

        cancelBooking: (bookingId) => {
          const s = get();
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking) return fail('common.error');
          const ride = s.rides.find((r) => r.id === booking.rideId);
          const isPassenger = booking.passengerId === s.sessionUserId;
          const isDriver = ride?.driverId === s.sessionUserId;
          if (!isPassenger && !isDriver) return fail('common.error');
          if (booking.status !== 'pending' && booking.status !== 'confirmed') return fail('common.error');
          set((st) => ({
            bookings: st.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'cancelled', cancelledBy: s.sessionUserId } : b)),
          }));
          if (ride && isPassenger) {
            const driver = get().users.find((u) => u.id === ride.driverId);
            const { from, to } = rideLabel(ride, driver?.language ?? 'fr');
            notify(ride.driverId, 'ride_cancelled', { from, to, date: ride.departureAt.slice(0, 10) }, `/driver/ride/${ride.id}`);
          }
          return ok;
        },

        boardWithPin: (bookingId, pin) => {
          const s = get();
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking || booking.status !== 'confirmed') return fail('common.error');
          const ride = s.rides.find((r) => r.id === booking.rideId);
          if (!ride || ride.driverId !== s.sessionUserId) return fail('common.error');
          if (booking.pin !== pin.trim()) return fail('driver.pinWrong');
          set((st) => ({ bookings: st.bookings.map((b) => (b.id === bookingId ? { ...b, boardedAt: nowIso() } : b)) }));
          return ok;
        },

        markNoShow: (bookingId) => {
          const s = get();
          const booking = s.bookings.find((b) => b.id === bookingId);
          const ride = booking && s.rides.find((r) => r.id === booking.rideId);
          if (!booking || !ride || ride.driverId !== s.sessionUserId || booking.status !== 'confirmed') return fail('common.error');
          set((st) => ({ bookings: st.bookings.map((b) => (b.id === bookingId ? { ...b, status: 'no_show' } : b)) }));
          return ok;
        },

        confirmPayment: (bookingId, side) => {
          const s = get();
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking || booking.status !== 'completed') return fail('common.error');
          const ride = s.rides.find((r) => r.id === booking.rideId);
          if (!ride) return fail('common.error');
          if (side === 'passenger' && booking.passengerId !== s.sessionUserId) return fail('common.error');
          if (side === 'driver' && ride.driverId !== s.sessionUserId) return fail('common.error');
          set((st) => ({
            bookings: st.bookings.map((b) =>
              b.id === bookingId
                ? side === 'passenger'
                  ? { ...b, passengerPaid: true, paidAt: nowIso() }
                  : { ...b, driverReceived: true, receivedAt: nowIso() }
                : b,
            ),
          }));
          const updated = get().bookings.find((b) => b.id === bookingId)!;
          if (updated.passengerPaid && updated.driverReceived) {
            const amount = ride.pricePerSeat * booking.seats;
            for (const userId of [booking.passengerId, ride.driverId]) {
              const lang = get().users.find((u) => u.id === userId)?.language ?? 'fr';
              const { from, to } = rideLabel(ride, lang);
              notify(userId, 'payment', { amount: `${amount} DA`, from, to }, side === 'passenger' ? `/reservation/${bookingId}` : `/driver/ride/${ride.id}`);
            }
          }
          return ok;
        },

        submitReview: ({ bookingId, stars, categories, text }) => {
          const s = get();
          const id = s.sessionUserId;
          if (!id) return fail('common.error');
          const booking = s.bookings.find((b) => b.id === bookingId);
          if (!booking || booking.status !== 'completed') return fail('review.onlyCompleted');
          const ride = s.rides.find((r) => r.id === booking.rideId);
          if (!ride) return fail('common.error');
          const isPassenger = booking.passengerId === id;
          const isDriver = ride.driverId === id;
          if (!isPassenger && !isDriver) return fail('common.error');
          if (s.reviews.some((r) => r.bookingId === bookingId && r.authorId === id)) return fail('review.alreadyReviewed');
          if (stars < 1 || stars > 5) return fail('review.starsRequired');
          const targetId = isPassenger ? ride.driverId : booking.passengerId;
          const review: Review = {
            id: uid(), bookingId, rideId: ride.id, authorId: id, targetId,
            stars, categories, text: text.trim(), createdAt: nowIso(), status: 'visible', isDemo: false,
          };
          set((st) => ({ reviews: [review, ...st.reviews] }));
          return ok;
        },

        createRideRequest: (p) => {
          const s = get();
          const id = s.sessionUserId;
          if (!id) return fail('common.error');
          if (p.fromCityId === p.toCityId) return fail('home.sameCity');
          const request: RideRequest = { ...p, id: uid(), passengerId: id, status: 'open', createdAt: nowIso(), isDemo: false };
          set((st) => ({ rideRequests: [request, ...st.rideRequests] }));
          const st = get();
          const matching = st.rides.filter((r) => r.status === 'published' && r.fromCityId === p.fromCityId && r.toCityId === p.toCityId && new Date(r.departureAt).getTime() > Date.now());
          for (const driverId of new Set(matching.map((r) => r.driverId))) {
            const driver = st.users.find((u) => u.id === driverId);
            if (!driver) continue;
            const from = cityName(st.cities.find((c) => c.id === p.fromCityId), driver.language);
            const to = cityName(st.cities.find((c) => c.id === p.toCityId), driver.language);
            notify(driverId, 'ride_match', { from, to }, '/driver');
          }
          for (const ride of matching.slice(0, 3)) {
            const lang = st.users.find((u) => u.id === id)?.language ?? 'fr';
            const { from, to } = rideLabel(ride, lang);
            notify(id, 'ride_match', { from, to }, `/ride/${ride.id}`);
          }
          return ok;
        },

        closeRideRequest: (id) => {
          const request = get().rideRequests.find((r) => r.id === id && r.passengerId === get().sessionUserId);
          if (!request) return fail('common.error');
          set((s) => ({ rideRequests: s.rideRequests.map((r) => (r.id === id ? { ...r, status: 'closed' } : r)) }));
          return ok;
        },

        ensureConversation: (otherUserId, rideId = null, bookingId = null) => {
          const s = get();
          const id = s.sessionUserId;
          if (!id || id === otherUserId) return '';
          const existing = s.conversations.find(
            (c) => c.participantIds.includes(id) && c.participantIds.includes(otherUserId) && (rideId ? c.rideId === rideId : true),
          );
          if (existing) return existing.id;
          const conv: Conversation = { id: uid(), participantIds: [id, otherUserId], rideId, bookingId, blockedBy: null, createdAt: nowIso() };
          set((st) => ({ conversations: [conv, ...st.conversations] }));
          return conv.id;
        },

        sendMessage: (conversationId, text) => {
          const s = get();
          const id = s.sessionUserId;
          const conv = s.conversations.find((c) => c.id === conversationId);
          if (!id || !conv || !conv.participantIds.includes(id)) return fail('common.error');
          if (conv.blockedBy) return fail('msg.blocked');
          const trimmed = text.trim();
          if (!trimmed) return fail('common.error');
          const msg: Message = { id: uid(), conversationId, senderId: id, text: trimmed.slice(0, 1000), createdAt: nowIso(), readBy: [id], isDemo: false };
          set((st) => ({ messages: [...st.messages, msg] }));
          const otherId = conv.participantIds.find((p) => p !== id)!;
          const other = get().users.find((u) => u.id === otherId);
          const sender = get().users.find((u) => u.id === id);
          if (other) {
            notify(otherId, 'message', { name: sender?.fullName ?? '', text: trimmed.slice(0, 80) }, `/chat/${conversationId}`);
            if (other.isDemo) {
              window.setTimeout(() => {
                const st = get();
                const c = st.conversations.find((x) => x.id === conversationId);
                if (!c || c.blockedBy) return;
                const reply: Message = {
                  id: uid(), conversationId, senderId: otherId,
                  text: translate(other.language, 'msg.autoReply'),
                  createdAt: nowIso(), readBy: [otherId], isDemo: true, autoReply: true,
                };
                set((st2) => ({ messages: [...st2.messages, reply] }));
              }, 1600);
            }
          }
          return ok;
        },

        markConversationRead: (conversationId) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          set((s) => ({
            messages: s.messages.map((m) =>
              m.conversationId === conversationId && !m.readBy.includes(id) ? { ...m, readBy: [...m.readBy, id] } : m,
            ),
          }));
          return ok;
        },

        blockInConversation: (conversationId, block) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conversationId ? { ...c, blockedBy: block ? id : c.blockedBy === id ? null : c.blockedBy } : c,
            ),
          }));
          return ok;
        },

        addReport: (p) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          const report: Report = { ...p, id: uid(), reporterId: id, status: 'open', action: null, createdAt: nowIso(), resolvedAt: null };
          set((s) => ({ reports: [report, ...s.reports] }));
          return ok;
        },

        resolveReport: (reportId, action, internalNote = '') => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const report = get().reports.find((r) => r.id === reportId);
          if (!me || !canStaff(me, 'manage_reports') || !report || !action.trim() || report.status === 'resolved' || report.status === 'dismissed') return fail('common.error');
          const now = nowIso();
          set((s) => ({
            reports: s.reports.map((r) => r.id === reportId ? { ...r, status: 'resolved', action: action.trim(), resolvedAt: now, resolvedBy: me.id } : r),
            moderationActions: [{
              id: uid(), actorId: me.id, subjectId: report.targetType === 'user' ? report.targetId : null,
              actionType: 'resolve_report', targetType: 'report', targetId: reportId,
              reason: action.trim(), publicMessage: '', internalNote: internalNote.trim(),
              durationMinutes: null, expiresAt: null, metadata: { reportId }, createdAt: now,
            }, ...s.moderationActions],
          }));
          return ok;
        },

        dismissReport: (reportId, internalNote = '') => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const report = get().reports.find((r) => r.id === reportId);
          if (!me || !canStaff(me, 'manage_reports') || !report || !internalNote.trim() || report.status === 'resolved' || report.status === 'dismissed') return fail('common.error');
          const now = nowIso();
          set((s) => ({
            reports: s.reports.map((r) => r.id === reportId ? { ...r, status: 'dismissed', action: null, resolvedAt: now, resolvedBy: me.id } : r),
            moderationActions: [{
              id: uid(), actorId: me.id, subjectId: report.targetType === 'user' ? report.targetId : null,
              actionType: 'dismiss_report', targetType: 'report', targetId: reportId,
              reason: internalNote.trim(), publicMessage: '', internalNote: internalNote.trim(),
              durationMinutes: null, expiresAt: null, metadata: { reportId }, createdAt: now,
            }, ...s.moderationActions],
          }));
          return ok;
        },

        assignReport: (reportId, staffUserId) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const report = get().reports.find((r) => r.id === reportId);
          const assignee = get().users.find((u) => u.id === staffUserId);
          if (!me || !canStaff(me, 'manage_reports') || !report || !assignee || !canStaff(assignee, 'manage_reports') || report.status === 'resolved' || report.status === 'dismissed') return fail('common.error');
          set((s) => ({ reports: s.reports.map((r) => r.id === reportId ? { ...r, assignedTo: staffUserId, status: 'in_review' } : r) }));
          return ok;
        },

        moderateReview: (reviewId, remove, reason = '') => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const review = get().reviews.find((r) => r.id === reviewId);
          if (!me || !canStaff(me, 'moderate_content') || !review || (remove && !reason.trim())) return fail('common.error');
          const now = nowIso();
          set((s) => ({
            reviews: s.reviews.map((r) => r.id === reviewId ? { ...r, status: remove ? 'removed' : 'visible' } : r),
            moderationActions: [{
              id: uid(), actorId: me.id, subjectId: review.authorId,
              actionType: remove ? 'hide_review' : 'restore_review', targetType: 'review', targetId: reviewId,
              reason: reason.trim(), publicMessage: '', internalNote: '',
              durationMinutes: null, expiresAt: null, metadata: {}, createdAt: now,
            }, ...s.moderationActions],
          }));
          return ok;
        },

        setStaffRole: (userId, role, active) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const target = get().users.find((u) => u.id === userId);
          if (!me || staffRoleOf(me) !== 'super_admin' || !target || userId === me.id) return fail('common.error');
          const now = nowIso();
          set((s) => ({
            users: s.users.map((u) => u.id === userId ? { ...u, role: role === 'read_only' || role === 'moderator' ? 'user' : 'admin', staffRole: role } : u),
            staffMembers: [...s.staffMembers.filter((m) => m.userId !== userId), {
              userId, role, active,
              createdAt: s.staffMembers.find((m) => m.userId === userId)?.createdAt ?? now,
              updatedAt: now,
            }],
            moderationActions: [{
              id: uid(), actorId: me.id, subjectId: userId, actionType: 'staff_role_change',
              targetType: 'staff', targetId: userId, reason: `Role changed to ${role}; active=${active}`,
              publicMessage: '', internalNote: '', durationMinutes: null, expiresAt: null,
              metadata: { role, active }, createdAt: now,
            }, ...s.moderationActions],
          }));
          return ok;
        },

        applyModeration: (p) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const target = get().users.find((u) => u.id === p.userId);
          const permission = p.kind === 'warning' ? 'moderate_content' : 'reverse_restriction';
          if (!me || !target || target.id === me.id || !canStaff(me, permission) || !p.reason.trim()) return fail('common.error');
          if (p.kind === 'timeout' && (!p.durationMinutes || !Number.isInteger(p.durationMinutes) || p.durationMinutes < 1 || p.durationMinutes > 525600)) return fail('common.error');
          const now = nowIso();
          const expiresAt = p.kind === 'timeout'
            ? new Date(Date.now() + p.durationMinutes! * 60000).toISOString()
            : null;
          const id = uid();
          set((s) => ({
            restrictions: [{ id, userId: p.userId, kind: p.kind, reason: p.reason.trim(), publicMessage: p.publicMessage.trim(), internalNote: p.internalNote.trim(), startsAt: now, expiresAt, active: true, createdBy: me.id, createdAt: now, reversedAt: null, reversedBy: null }, ...s.restrictions],
            moderationActions: [{ id: uid(), actorId: me.id, subjectId: p.userId, actionType: p.kind, targetType: 'user', targetId: p.userId, reason: p.reason.trim(), publicMessage: p.publicMessage.trim(), internalNote: p.internalNote.trim(), durationMinutes: p.durationMinutes ?? null, expiresAt, metadata: { restrictionId: id }, createdAt: now }, ...s.moderationActions],
            users: p.kind === 'warning' ? s.users : s.users.map((u) => u.id === p.userId ? { ...u, status: 'suspended', restrictionStatus: p.kind === 'ban' ? 'banned' : 'timeout' } : u),
          }));
          notify(p.userId, 'moderation', { message: p.publicMessage.trim() || p.reason.trim() }, '/account/restrictions');
          return ok;
        },

        reverseRestriction: (restrictionId, reason, publicMessage, internalNote) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const restriction = get().restrictions.find((r) => r.id === restrictionId);
          if (!me || !canStaff(me, 'reverse_restriction') || !restriction || restriction.userId === me.id || !restriction.active || restriction.reversedAt || !reason.trim()) return fail('common.error');
          const now = nowIso();
          set((s) => {
            const remaining = s.restrictions.find((r) => r.id !== restrictionId && r.userId === restriction.userId && r.active && !r.reversedAt && r.kind !== 'warning' && (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()));
            return {
              restrictions: s.restrictions.map((r) => r.id === restrictionId ? { ...r, active: false, reversedAt: now, reversedBy: me.id } : r),
              moderationActions: [{ id: uid(), actorId: me.id, subjectId: restriction.userId, actionType: restriction.kind === 'ban' ? 'reverse_ban' : 'unban', targetType: 'user', targetId: restriction.userId, reason: reason.trim(), publicMessage: publicMessage.trim(), internalNote: internalNote.trim(), durationMinutes: null, expiresAt: null, metadata: { restrictionId }, createdAt: now }, ...s.moderationActions],
              users: s.users.map((u) => u.id === restriction.userId ? {
                ...u,
                status: remaining ? 'suspended' : 'active',
                restrictionStatus: remaining ? (remaining.kind === 'ban' ? 'banned' : 'timeout') : 'active',
              } : u),
            };
          });
          notify(restriction.userId, 'moderation', { message: publicMessage.trim() || reason.trim() }, '/account/restrictions');
          return ok;
        },

        submitAppeal: (actionId, statement) => {
          const id = get().sessionUserId;
          const action = get().moderationActions.find((a) => a.id === actionId);
          if (!id || !statement.trim() || statement.trim().length > 3000) return fail('common.required');
          if (!action || action.subjectId !== id || !['timeout', 'ban'].includes(action.actionType)) return fail('common.error');
          const restrictionId = action.metadata.restrictionId;
          const restriction = get().restrictions.find((r) => r.id === restrictionId);
          if (!restriction || !restriction.active || restriction.reversedAt
            || new Date(restriction.startsAt).getTime() > Date.now()
            || (restriction.expiresAt && new Date(restriction.expiresAt).getTime() <= Date.now())) return fail('common.error');
          if (get().appeals.some((a) => a.actionId === actionId && a.appellantId === id && a.status !== 'denied')) return fail('common.error');
          set((s) => ({ appeals: [{ id: uid(), actionId, appellantId: id, statement: statement.trim(), status: 'open', reviewedBy: null, reviewNote: null, publicMessage: null, internalNote: null, createdAt: nowIso(), reviewedAt: null }, ...s.appeals] }));
          return ok;
        },

        reviewAppeal: (appealId, decision, note, publicMessage = '', internalNote = '') => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const appeal = get().appeals.find((a) => a.id === appealId);
          const action = get().moderationActions.find((a) => a.id === appeal?.actionId);
          if (!me || !canStaff(me, 'decide_appeals') || !appeal || !action
            || !['timeout', 'ban'].includes(action.actionType)
            || appeal.status === 'granted' || appeal.status === 'denied') return fail('common.error');
          if (decision !== 'under_review' && !note.trim()) return fail('common.required');
          const now = nowIso();
          const restrictionId = typeof action.metadata.restrictionId === 'string' ? action.metadata.restrictionId : null;
          const restriction = restrictionId ? get().restrictions.find((r) => r.id === restrictionId) : null;
          if (decision === 'granted' && (!restriction || !restriction.active || restriction.reversedAt
            || restriction.createdBy === me.id || action.actorId === me.id || appeal.appellantId === me.id)) return fail('common.error');
          set((s) => {
            const grantActions: ModerationAction[] = [];
            if (decision === 'granted' && restriction) {
              grantActions.push({
                id: uid(), actorId: me.id, subjectId: restriction.userId,
                actionType: restriction.kind === 'ban' ? 'reverse_ban' : 'unban',
                targetType: 'user', targetId: restriction.userId, reason: note.trim(),
                publicMessage: publicMessage.trim(), internalNote: internalNote.trim(),
                durationMinutes: null, expiresAt: null, metadata: { restrictionId }, createdAt: now,
              });
            }
            const remaining = restriction
              ? s.restrictions.find((r) => r.id !== restriction.id && r.userId === restriction.userId && r.active && !r.reversedAt && r.kind !== 'warning' && (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()))
              : null;
            return {
              appeals: s.appeals.map((a) => a.id === appealId ? { ...a, status: decision, reviewedBy: me.id, reviewNote: note.trim(), publicMessage: publicMessage.trim(), internalNote: internalNote.trim(), reviewedAt: decision === 'under_review' ? null : now } : a),
              restrictions: decision === 'granted' && restrictionId
                ? s.restrictions.map((r) => r.id === restrictionId ? { ...r, active: false, reversedAt: now, reversedBy: me.id } : r)
                : s.restrictions,
              users: decision === 'granted' && restriction
                ? s.users.map((u) => u.id === restriction.userId ? { ...u, status: remaining ? 'suspended' : 'active', restrictionStatus: remaining ? (remaining.kind === 'ban' ? 'banned' : 'timeout') : 'active' } : u)
                : s.users,
              moderationActions: [...grantActions, ...s.moderationActions],
            };
          });
          notify(appeal.appellantId, 'appeal_update', { status: translate(get().users.find((u) => u.id === appeal.appellantId)?.language ?? 'fr', `admin.status.${decision}`) }, '/appeals');
          return ok;
        },

        toggleSavedDriver: (driverId) => {
          const id = get().sessionUserId;
          const me = get().users.find((u) => u.id === id);
          const driver = get().users.find((u) => u.id === driverId);
          if (!id || !me || me.status !== 'active' || !driver || driver.mode !== 'driver' || driver.id === id) return fail('common.error');
          set((s) => {
            const exists = s.savedDrivers.some((d) => d.userId === id && d.driverId === driverId);
            return {
              savedDrivers: exists
                ? s.savedDrivers.filter((d) => !(d.userId === id && d.driverId === driverId))
                : [...s.savedDrivers, { userId: id, driverId, createdAt: nowIso() }],
            };
          });
          return ok;
        },

        addTrustedContact: (name, phone) => {
          const id = get().sessionUserId;
          const me = get().users.find((u) => u.id === id);
          if (!id || !me || me.status !== 'active') return fail('common.error');
          if (!name.trim() || !phone.trim()) return fail('common.required');
          set((s) => ({ trustedContacts: [...s.trustedContacts, { id: uid(), userId: id, name: name.trim(), phone: phone.trim() }] }));
          return ok;
        },

        removeTrustedContact: (id) => {
          const userId = get().sessionUserId;
          if (!userId || !get().trustedContacts.some((c) => c.id === id && c.userId === userId)) return fail('common.error');
          set((s) => ({ trustedContacts: s.trustedContacts.filter((c) => c.id !== id) }));
          return ok;
        },

        addRecentSearch: (q) => {
          const id = get().sessionUserId;
          const me = get().users.find((u) => u.id === id);
          if (!id || !me || me.status !== 'active') return fail('common.error');
          set((s) => ({
            recentSearches: [
              { ...q, id: uid(), userId: id, createdAt: nowIso() },
              ...s.recentSearches.filter((r) => !(r.userId === id && r.fromCityId === q.fromCityId && r.toCityId === q.toCityId && r.date === q.date)),
            ].slice(0, 30),
          }));
          return ok;
        },

        markNotificationRead: (id) => {
          const userId = get().sessionUserId;
          if (!userId || !get().notifications.some((n) => n.id === id && n.userId === userId)) return fail('common.error');
          set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) }));
          return ok;
        },

        markAllNotificationsRead: () => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === id ? { ...n, read: true } : n)) }));
          return ok;
        },

        suspendUser: (userId, suspend) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          const target = get().users.find((u) => u.id === userId);
          if (!me || !target || target.id === me.id || !canStaff(me, 'reverse_restriction')) return fail('common.error');
          if (suspend) {
            const activeBan = get().restrictions.some((r) => r.userId === userId && r.kind === 'ban' && r.active && !r.reversedAt && (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()));
            if (activeBan) return fail('common.error');
            return get().applyModeration({
              userId, kind: 'ban', reason: 'Account suspended by an administrator.',
              publicMessage: 'Your account has been suspended.', internalNote: 'Legacy suspension action.',
            });
          }
          const restriction = get().restrictions.find((r) => r.userId === userId && r.kind === 'ban' && r.active && !r.reversedAt && (!r.expiresAt || new Date(r.expiresAt).getTime() > Date.now()));
          if (!restriction) return fail('common.error');
          return get().reverseRestriction(restriction.id, 'Account suspension reversed by an administrator.', 'Your account access has been restored.', 'Legacy suspension reversal.');
        },

        addCity: (p) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          if (!me || !canStaff(me, 'manage_cities')) return fail('common.error');
          if (!p.nameFr.trim() || !p.nameAr.trim() || !Number.isInteger(p.code) || p.code < 1 || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return fail('common.required');
          if (get().cities.some((c) => c.code === p.code || c.nameFr.toLocaleLowerCase() === p.nameFr.trim().toLocaleLowerCase())) return fail('common.error');
          const city: City = { ...p, id: uid(), nameFr: p.nameFr.trim(), nameAr: p.nameAr.trim() };
          set((s) => ({ cities: [...s.cities, city] }));
          return ok;
        },

        sendAnnouncement: (title, body) => {
          const me = get().users.find((u) => u.id === get().sessionUserId);
          if (!me || !canStaff(me, 'send_announcements')) return fail('common.error');
          if (!title.trim() || !body.trim()) return fail('common.required');
          const announcement = { id: uid(), title: title.trim(), body: body.trim(), createdAt: nowIso() };
          set((s) => ({ announcements: [announcement, ...s.announcements] }));
          for (const u of get().users.filter((x) => x.status === 'active' && x.role !== 'admin')) {
            notify(u.id, 'announcement', { text: `${title.trim()} — ${body.trim()}` }, null);
          }
          return ok;
        },
      };
};

export const useDemoStore = runtimeMode === 'demo'
  ? create<AppState>()(persist(demoStateCreator, {
      name: 'waslni-demo-store-v2',
      version: 2,
    }))
  : create<AppState>()(demoStateCreator);

export const useStore = (runtimeMode === 'demo' ? useDemoStore : useCloudStore) as typeof useDemoStore;

export function currentUser(s: AppState): User | null {
  return s.users.find((u) => u.id === s.sessionUserId) ?? null;
}

export function getSeatsAvailable(s: AppState, rideId: string): number {
  const ride = s.rides.find((r) => r.id === rideId);
  if (!ride) return 0;
  const taken = s.bookings.filter((b) => b.rideId === rideId && b.status === 'confirmed').reduce((sum, b) => sum + b.seats, 0);
  return Math.max(0, ride.seatsTotal - taken);
}

export function getDriverRating(s: AppState, userId: string): { avg: number; count: number } {
  const reviews = s.reviews.filter((r) => r.targetId === userId && r.status === 'visible');
  if (reviews.length === 0) return { avg: 0, count: 0 };
  return { avg: reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length, count: reviews.length };
}

const emptyVerifications = new Map<string, DriverVerification>();
export function getVerification(s: AppState, userId: string): DriverVerification {
  const found = s.verifications.find((v) => v.userId === userId);
  if (found) return found;
  // Stable reference: selectors must not return a fresh object on every snapshot.
  let empty = emptyVerifications.get(userId);
  if (!empty) {
    empty = { userId, status: 'not_submitted', documentIds: [], submittedAt: null, reviewedAt: null, reason: null };
    emptyVerifications.set(userId, empty);
  }
  return empty;
}

export function getUnreadNotifications(s: AppState, userId: string): number {
  return s.notifications.filter((n) => n.userId === userId && !n.read).length;
}

export function getUnreadMessages(s: AppState, userId: string): number {
  const myConvs = s.conversations.filter((c) => c.participantIds.includes(userId)).map((c) => c.id);
  return s.messages.filter((m) => myConvs.includes(m.conversationId) && m.senderId !== userId && !m.readBy.includes(userId)).length;
}

export function getActiveBooking(s: AppState, rideId: string, userId: string): Booking | undefined {
  return s.bookings.find((b) => b.rideId === rideId && b.passengerId === userId && (b.status === 'pending' || b.status === 'confirmed'));
}