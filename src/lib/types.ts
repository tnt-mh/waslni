export type Language = 'fr' | 'ar' | 'en';
export type Mode = 'passenger' | 'driver';
export type Gender = 'female' | 'male' | 'unspecified';
export type UserRole = 'user' | 'admin';

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
  status: 'open' | 'resolved' | 'dismissed';
  action: string | null;
  createdAt: string;
  resolvedAt: string | null;
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
  | 'review_request';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  route: string | null;
  read: boolean;
  createdAt: string;
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