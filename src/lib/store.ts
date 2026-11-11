import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppNotification, Booking, City, Conversation, DriverDocument, DriverVerification,
  Language, Message, Mode, NotificationType, Report, ReportReason,
  Review, ReviewCategories, Ride, RideRequest, SearchQuery, User, Vehicle,
} from './types';
import { buildSeed, type SeedData } from './seed';
import { generatePin, hashPassword, nowIso, uid } from './utils';
import { cityName } from './cities';
import { translate } from '../i18n';

export type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export interface AppState extends SeedData {
  sessionUserId: string | null;
  language: Language;
  onboardingSeen: boolean;

  setLanguage: (lang: Language) => void;
  setOnboardingSeen: () => void;
  signUp: (p: { fullName: string; email: string; password: string }) => Promise<Result>;
  login: (email: string, password: string) => Promise<Result>;
  phoneAuth: (phone: string) => Result & { isNew?: boolean };
  loginDemo: (userId: string) => void;
  logout: () => void;
  updateProfile: (p: Partial<Pick<User, 'fullName' | 'phone' | 'photoUrl' | 'dateOfBirth' | 'gender' | 'bio' | 'atmosphere' | 'language'>>) => void;
  setMode: (mode: Mode) => void;
  resetAll: () => void;

  addVehicle: (p: Omit<Vehicle, 'id' | 'ownerId' | 'isDemo'>) => Result;
  saveDocument: (doc: Omit<DriverDocument, 'id' | 'userId' | 'uploadedAt'>) => Result;
  removeDocument: (kind: DriverDocument['kind']) => void;
  submitVerification: () => Result;
  reviewVerification: (userId: string, approve: boolean, reason?: string) => void;

  publishRide: (p: Omit<Ride, 'id' | 'driverId' | 'status' | 'createdAt' | 'isDemo' | 'arrivalAt'> & { durationMin: number }) => Result & { rideId?: string };
  updateRide: (rideId: string, p: Partial<Ride>) => Result;
  cancelRide: (rideId: string) => Result;
  startRide: (rideId: string) => Result;
  completeRide: (rideId: string) => Result;

  requestBooking: (rideId: string, seats: number) => Result & { bookingId?: string };
  decideBooking: (bookingId: string, accept: boolean) => Result;
  cancelBooking: (bookingId: string) => Result;
  boardWithPin: (bookingId: string, pin: string) => Result;
  markNoShow: (bookingId: string) => Result;
  confirmPayment: (bookingId: string, side: 'passenger' | 'driver') => Result;
  submitReview: (p: { bookingId: string; stars: number; categories: ReviewCategories | null; text: string }) => Result;

  createRideRequest: (p: Omit<RideRequest, 'id' | 'passengerId' | 'status' | 'createdAt' | 'isDemo'>) => Result;
  closeRideRequest: (id: string) => void;

  ensureConversation: (otherUserId: string, rideId?: string | null, bookingId?: string | null) => string;
  sendMessage: (conversationId: string, text: string) => Result;
  markConversationRead: (conversationId: string) => void;
  blockInConversation: (conversationId: string, block: boolean) => void;

  addReport: (p: { targetType: Report['targetType']; targetId: string; reason: ReportReason; details: string }) => Result;
  resolveReport: (reportId: string, action: string) => void;
  dismissReport: (reportId: string) => void;
  moderateReview: (reviewId: string, remove: boolean) => void;

  toggleSavedDriver: (driverId: string) => void;
  addTrustedContact: (name: string, phone: string) => Result;
  removeTrustedContact: (id: string) => void;
  addRecentSearch: (q: SearchQuery) => void;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  suspendUser: (userId: string, suspend: boolean) => void;
  addCity: (p: Omit<City, 'id'>) => Result;
  sendAnnouncement: (title: string, body: string) => Result;
}

function initialState() {
  return {
    ...buildSeed(),
    sessionUserId: null as string | null,
    language: 'fr' as Language,
    onboardingSeen: false,
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const notify = (userId: string, type: NotificationType, params: Record<string, string | number>, route: string | null) => {
        const user = get().users.find((u) => u.id === userId);
        if (!user) return;
        const lang = user.language;
        const n: AppNotification = {
          id: uid(), userId, type,
          title: translate(lang, `notif.${type}.title`, params),
          body: translate(lang, `notif.${type}.body`, params),
          route, read: false, createdAt: nowIso(),
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

        setLanguage: (lang) => {
          set((s) => ({
            language: lang,
            users: s.sessionUserId ? s.users.map((u) => (u.id === s.sessionUserId ? { ...u, language: lang } : u)) : s.users,
          }));
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
          if (user.status === 'suspended') return fail('auth.suspended');
          set({ sessionUserId: user.id, language: user.language });
          return ok;
        },

        phoneAuth: (phone) => {
          const s = get();
          const existing = s.users.find((u) => u.phone === phone);
          if (existing) {
            if (existing.status === 'suspended') return fail('auth.suspended');
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

        loginDemo: (userId) => {
          const user = get().users.find((u) => u.id === userId && u.isDemo);
          if (!user) return;
          set({ sessionUserId: user.id, language: user.language });
        },

        logout: () => set({ sessionUserId: null }),

        updateProfile: (p) => {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) }));
        },

        setMode: (mode) => {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, mode } : u)) }));
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
          if (!id) return fail('common.error');
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
          if (!id) return;
          set((s) => ({ documents: s.documents.filter((d) => !(d.userId === id && d.kind === kind)) }));
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
          for (const admin of get().users.filter((u) => u.role === 'admin')) {
            notify(admin.id, 'verification_update', { status: translate(admin.language, 'verify.status.pending') }, '/admin/verifications');
          }
          return ok;
        },

        reviewVerification: (userId, approve, reason) => {
          set((s) => ({
            verifications: s.verifications.map((v) =>
              v.userId === userId ? { ...v, status: approve ? 'verified' : 'rejected', reviewedAt: nowIso(), reason: approve ? null : reason ?? null } : v,
            ),
          }));
          const user = get().users.find((u) => u.id === userId);
          if (user) {
            notify(userId, 'verification_update', { status: translate(user.language, approve ? 'verify.status.verified' : 'verify.status.rejected') }, '/driver/verification');
          }
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
          set((s) => ({ rideRequests: s.rideRequests.map((r) => (r.id === id && r.passengerId === s.sessionUserId ? { ...r, status: 'closed' } : r)) }));
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
          if (!id) return;
          set((s) => ({
            messages: s.messages.map((m) =>
              m.conversationId === conversationId && !m.readBy.includes(id) ? { ...m, readBy: [...m.readBy, id] } : m,
            ),
          }));
        },

        blockInConversation: (conversationId, block) => {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conversationId ? { ...c, blockedBy: block ? id : c.blockedBy === id ? null : c.blockedBy } : c,
            ),
          }));
        },

        addReport: (p) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          const report: Report = { ...p, id: uid(), reporterId: id, status: 'open', action: null, createdAt: nowIso(), resolvedAt: null };
          set((s) => ({ reports: [report, ...s.reports] }));
          return ok;
        },

        resolveReport: (reportId, action) => {
          set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'resolved', action, resolvedAt: nowIso() } : r)) }));
        },

        dismissReport: (reportId) => {
          set((s) => ({ reports: s.reports.map((r) => (r.id === reportId ? { ...r, status: 'dismissed', action: null, resolvedAt: nowIso() } : r)) }));
        },

        moderateReview: (reviewId, remove) => {
          set((s) => ({ reviews: s.reviews.map((r) => (r.id === reviewId ? { ...r, status: remove ? 'removed' : 'visible' } : r)) }));
        },

        toggleSavedDriver: (driverId) => {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => {
            const exists = s.savedDrivers.some((d) => d.userId === id && d.driverId === driverId);
            return {
              savedDrivers: exists
                ? s.savedDrivers.filter((d) => !(d.userId === id && d.driverId === driverId))
                : [...s.savedDrivers, { userId: id, driverId, createdAt: nowIso() }],
            };
          });
        },

        addTrustedContact: (name, phone) => {
          const id = get().sessionUserId;
          if (!id) return fail('common.error');
          if (!name.trim()) return fail('common.required');
          set((s) => ({ trustedContacts: [...s.trustedContacts, { id: uid(), userId: id, name: name.trim(), phone }] }));
          return ok;
        },

        removeTrustedContact: (id) => {
          set((s) => ({ trustedContacts: s.trustedContacts.filter((c) => c.id !== id) }));
        },

        addRecentSearch: (q) => {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => ({
            recentSearches: [
              { ...q, id: uid(), userId: id, createdAt: nowIso() },
              ...s.recentSearches.filter((r) => !(r.userId === id && r.fromCityId === q.fromCityId && r.toCityId === q.toCityId && r.date === q.date)),
            ].slice(0, 30),
          }));
        },

        markNotificationRead: (id) => {
          set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
        },

        markAllNotificationsRead: () => {
          const id = get().sessionUserId;
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === id ? { ...n, read: true } : n)) }));
        },

        suspendUser: (userId, suspend) => {
          set((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, status: suspend ? 'suspended' : 'active' } : u)) }));
        },

        addCity: (p) => {
          if (!p.nameFr.trim()) return fail('common.required');
          const city: City = { ...p, id: uid() };
          set((s) => ({ cities: [...s.cities, city] }));
          return ok;
        },

        sendAnnouncement: (title, body) => {
          if (!title.trim() || !body.trim()) return fail('common.required');
          const announcement = { id: uid(), title: title.trim(), body: body.trim(), createdAt: nowIso() };
          set((s) => ({ announcements: [announcement, ...s.announcements] }));
          for (const u of get().users.filter((x) => x.status === 'active' && x.role !== 'admin')) {
            notify(u.id, 'announcement', { text: `${title.trim()} — ${body.trim()}` }, null);
          }
          return ok;
        },
      };
    },
    {
      name: 'waslni-store-v1',
      version: 1,
    },
  ),
);

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