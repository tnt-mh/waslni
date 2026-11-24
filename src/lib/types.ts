export type Language = 'fr' | 'ar' | 'en';
export type Mode = 'passenger' | 'driver';
export type Gender = 'female' | 'male' | 'unspecified';
export type UserRole = 'user' | 'admin';
export type StaffRole = 'super_admin' | 'admin' | 'moderator' | 'read_only';
export type RestrictionStatus = 'active' | 'timeout' | 'banned';

export interface User {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  salt: string | null;
  photoUrl: string | null;
  avatarHue: number;
  dateOfBirth: string | null;
  gender: Gender;
  language: Language;
  bio: string;
  role: UserRole;
  mode: Mode;
  status: 'active' | 'suspended';
  phoneVerified: boolean;
  emailVerified: boolean;
  atmosphere: string[];
  createdAt: string;
  isDemo: boolean;
  staffRole?: StaffRole | null;
  restrictionStatus?: RestrictionStatus;
}

export type VerificationStatus =
  | 'not_submitted'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired';

export type DocumentKind = 'id_card' | 'license' | 'registration' | 'selfie';

export interface DriverDocument {
  id: string;
  userId: string;
  kind: DocumentKind;
  imageDataUrl: string;
  storagePath?: string | null;
  fileName: string;
  uploadedAt: string;
}

export interface DriverVerification {
  userId: string;
  status: VerificationStatus;
  documentIds: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  reason: string | null;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  brand: string;
  model: string;
  color: string;
  plate: string;
  year: number;
  seats: number;
  isDemo: boolean;
}

export interface RidePreferences {
  chatty: boolean;
  quiet: boolean;
  music: boolean;
  luggage: boolean;
  smokingAllowed: boolean;
  petsAllowed: boolean;
  ac: boolean;
}

export interface RideStop {
  cityId: string;
  label: string;
}

export interface RecurringRule {
  frequency: 'daily' | 'weekly' | 'custom';
  daysOfWeek: number[];
  until: string | null;
}

export type RideStatus = 'published' | 'in_progress' | 'completed' | 'cancelled';

export interface Ride {
  id: string;
  driverId: string;
  vehicleId: string;
  fromCityId: string;
  toCityId: string;
  departureAt: string;
  arrivalAt: string;
  seatsTotal: number;
  pricePerSeat: number;
  pickupPoint: string;
  dropoffPoint: string;
  stops: RideStop[];
  preferences: RidePreferences;
  womenOnly: boolean;
  recurring: RecurringRule | null;
  status: RideStatus;
  notes: string;
  createdAt: string;
  isDemo: boolean;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface Booking {
  id: string;
  rideId: string;
  passengerId: string;
  seats: number;
  status: BookingStatus;
  pin: string | null;
  createdAt: string;
  decidedAt: string | null;
  boardedAt: string | null;
  completedAt: string | null;
  passengerPaid: boolean;
  driverReceived: boolean;
  paidAt: string | null;
  receivedAt: string | null;
  cancelledBy: string | null;
  isDemo: boolean;
}

export interface RideRequest {
  id: string;
  passengerId: string;
  fromCityId: string;
  toCityId: string;
  date: string;
  timePreference: string;
  seats: number;
  maxBudget: number;
  womenOnly: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  isDemo: boolean;
}

export interface Conversation {
  id: string;
  participantIds: [string, string];
  rideId: string | null;
  bookingId: string | null;
  blockedBy: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readBy: string[];
  isDemo: boolean;
  autoReply?: boolean;
}

export interface ReviewCategories {
  driving: number;
  punctuality: number;
  communication: number;
  respect: number;
  vehicle: number;
}

export interface Review {
  id: string;
  bookingId: string;
  rideId: string;
  authorId: string;
  targetId: string;
  stars: number;
  categories: ReviewCategories | null;
  text: string;
  createdAt: string;
  status: 'visible' | 'removed';
  isDemo: boolean;
}

export type ReportReason =
  | 'suspicious_profile'
  | 'behavior'
  | 'wrong_vehicle'
  | 'wrong_driver'
  | 'unsafe_driving'
  | 'harassment'
  | 'fraud'
  | 'no_show'
  | 'abusive_review';

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'user' | 'ride' | 'review';
  targetId: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  action: string | null;
  createdAt: string;
  resolvedAt: string | null;
  assignedTo?: string | null;
  resolvedBy?: string | null;
}

export type NotificationType =
  | 'booking_request'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'ride_reminder'
  | 'message'
  | 'ride_cancelled'
  | 'verification_update'
  | 'ride_match'
  | 'announcement'
  | 'payment'
  | 'review_request'
  | 'moderation'
  | 'appeal_update';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  route: string | null;
  read: boolean;
  createdAt: string;
  params?: Record<string, string | number>;
}

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
}

export interface SavedDriver {
  userId: string;
  driverId: string;
  createdAt: string;
}

export interface City {
  id: string;
  code: number;
  nameFr: string;
  nameAr: string;
  lat: number;
  lon: number;
  popular: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface RecentSearch {
  id: string;
  userId: string;
  fromCityId: string;
  toCityId: string;
  date: string;
  seats: number;
  createdAt: string;
}

export interface SearchQuery {
  fromCityId: string;
  toCityId: string;
  date: string;
  seats: number;
}

export interface StaffMember {
  userId: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRestriction {
  id: string;
  userId: string;
  kind: 'warning' | 'timeout' | 'ban';
  reason: string;
  publicMessage: string;
  internalNote: string;
  startsAt: string;
  expiresAt: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  reversedAt: string | null;
  reversedBy: string | null;
}

export type ModerationActionType =
  | 'warning'
  | 'timeout'
  | 'ban'
  | 'unban'
  | 'reverse_ban'
  | 'hide_review'
  | 'restore_review'
  | 'resolve_report'
  | 'dismiss_report'
  | 'assign_report'
  | 'verify_driver'
  | 'reject_driver'
  | 'staff_role_change';

export interface ModerationAction {
  id: string;
  actorId: string;
  subjectId: string | null;
  actionType: ModerationActionType;
  targetType: 'user' | 'review' | 'report' | 'verification' | 'staff';
  targetId: string | null;
  reason: string;
  publicMessage: string;
  internalNote: string;
  durationMinutes: number | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ModerationAppeal {
  id: string;
  actionId: string;
  appellantId: string;
  statement: string;
  status: 'open' | 'under_review' | 'granted' | 'denied';
  reviewedBy: string | null;
  reviewNote: string | null;
  publicMessage?: string | null;
  internalNote?: string | null;
  createdAt: string;
  reviewedAt: string | null;
}