import { create } from 'zustand';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import type { AppState } from './store';
import type {
  AccountRestriction, Announcement, AppNotification, Booking, City, Conversation,
  DriverDocument, DriverVerification, Message, ModerationAction, ModerationAppeal,
  NotificationType, RecentSearch, Report, Review, Ride, RidePreferences, RideRequest,
  SavedDriver, StaffMember, User, Vehicle,
} from './types';
import { requireSupabase } from './supabase';
import { canStaff, staffRoleOf } from './staff';
import { cityName } from './cities';
import { formatPrice, isValidEmail, normalizePhone } from './utils';
import { translate } from '../i18n';

type Result = { ok: true } | { ok: false; error: string };
type RpcResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
type Row = Record<string, any>;
type QueryResponse = { data: unknown; error: unknown };
type RowQuery = PromiseLike<QueryResponse> & { range(from: number, to: number): RowQuery };
type CloudData = ReturnType<typeof emptyData>;
type MutationContext = { userId: string; generation: number };

const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const DOCUMENT_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const NOTIFICATION_TYPES = new Set<NotificationType>([
  'booking_request', 'booking_accepted', 'booking_rejected', 'ride_reminder',
  'message', 'ride_cancelled', 'verification_update', 'ride_match',
  'announcement', 'payment', 'review_request', 'moderation', 'appeal_update',
]);
const PAGE_SIZE = 1000;

const USER_COLUMNS = 'id,full_name,email,phone,photo_url,avatar_hue,date_of_birth,gender,language,bio,role,mode,status,phone_verified,email_verified,atmosphere,created_at';
const PUBLIC_PROFILE_COLUMNS = 'id,full_name,photo_url,avatar_hue,bio,atmosphere,language,mode,created_at';
const BOOKING_COLUMNS = 'id,ride_id,passenger_id,seats,status,decided_at,boarded_at,completed_at,passenger_paid,driver_received,paid_at,received_at,cancelled_by,created_at';

function emptyData() {
  return {
    cities: [] as AppState['cities'],
    users: [] as AppState['users'],
    vehicles: [] as AppState['vehicles'],
    documents: [] as AppState['documents'],
    verifications: [] as AppState['verifications'],
    rides: [] as AppState['rides'],
    bookings: [] as AppState['bookings'],
    rideRequests: [] as AppState['rideRequests'],
    conversations: [] as AppState['conversations'],
    messages: [] as AppState['messages'],
    reviews: [] as AppState['reviews'],
    reports: [] as AppState['reports'],
    notifications: [] as AppState['notifications'],
    trustedContacts: [] as AppState['trustedContacts'],
    savedDrivers: [] as AppState['savedDrivers'],
    announcements: [] as AppState['announcements'],
    recentSearches: [] as AppState['recentSearches'],
    staffMembers: [] as AppState['staffMembers'],
    restrictions: [] as AppState['restrictions'],
    moderationActions: [] as AppState['moderationActions'],
    appeals: [] as AppState['appeals'],
  };
}

function initialState() {
  return {
    ...emptyData(),
    sessionUserId: null,
    language: 'fr' as const,
    onboardingSeen: false,
    connectionStatus: 'loading' as const,
    connectionError: null,
  };
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function object(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function language(value: unknown): User['language'] {
  return value === 'ar' || value === 'en' ? value : 'fr';
}

function errorDetails(error: unknown): { message: string; code: string; name: string } {
  const row = object(error);
  return {
    message: text(row.message, String(error ?? '')),
    code: text(row.code),
    name: text(row.name),
  };
}

function isConnectionError(error: unknown): boolean {
  const { message, code, name } = errorDetails(error);
  return error instanceof TypeError
    || name === 'AuthRetryableFetchError'
    || /fetch|network|connection|timed?\s*out|timeout|supabase is not configured/i.test(message);
}

function actionError(error: unknown, fallback = 'common.error'): string {
  if (isConnectionError(error)) return 'connection.error';
  const { message, code } = errorDetails(error);
  if (code === 'PGRST205' || code === '42P01' || code === '42703') return 'connection.schemaError';
  const m = message.toLowerCase();
  if (/email not confirmed/.test(m)) return 'auth.confirmationRequired';
  if (/invalid login credentials/.test(m)) return 'auth.invalidCredentials';
  if (/weak password|password.*too short/.test(m)) return 'auth.weakPassword';
  if (/email.*already|already.*email|user already exists/.test(m)) return 'auth.emailTaken';
  if (/phone.*already|already.*phone/.test(m)) return 'auth.phoneTaken';
  if (/invalid.*otp|otp.*expired|otp.*invalid/.test(m)) return 'auth.otpWrong';
  if (/unsupported phone provider|phone provider.*not|sms provider.*not|sms.*not (configured|enabled)/i.test(m)) return 'auth.otpRequired';
  if (/account is not active|account.*suspended|user is not active/.test(m)) return 'auth.suspended';
  if (/driver verification is required/.test(m)) return 'driver.verificationNeededText';
  if (/vehicle is not owned|no vehicle/.test(m)) return 'publish.noVehicle';
  if (/women-only|only female drivers/.test(m)) return 'book.womenOnlyDenied';
  if (/drivers cannot book their own ride/.test(m)) return 'book.driverSelf';
  if (/active booking already exists/.test(m)) return 'book.duplicate';
  if (/not enough seats|overbooking prevented/.test(m)) return 'book.notEnoughSeats';
  if (/ride is not bookable|ride is unavailable/.test(m)) return 'ride.notFound';
  if (/invalid booking pin|invalid pin/.test(m)) return 'driver.pinWrong';
  if (/reviews require a completed booking/.test(m)) return 'review.onlyCompleted';
  if (/stars must be between/.test(m)) return 'review.starsRequired';
  if (/conversation is blocked/.test(m)) return 'msg.blocked';
  if (/departure must be in the future|must depart in the future|departure.*past/.test(m)) return 'publish.pastTime';
  if (/booked rides cannot be edited/.test(m)) return 'publish.hasBookings';
  if (/provide (one to four|exactly one) document|required document|document set is no longer available|dossier.*incomplete/.test(m)) return 'verify.missingDocs';
  if (code === '23505') return fallback;
  return fallback;
}

function setConnectionError(key = 'connection.error') {
  useCloudStore.setState({ connectionStatus: 'error', connectionError: key });
}

function failure(error: unknown, fallback = 'common.error'): Result {
  const key = actionError(error, fallback);
  if (key === 'connection.error' || key === 'connection.schemaError') setConnectionError(key);
  return fail(key);
}

async function fetchRows(query: RowQuery): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data as Row[] : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchOne(query: PromiseLike<QueryResponse>): Promise<Row | null> {
  const { data, error } = await query;
  if (error) throw error;
  return data === null || data === undefined ? null : object(data);
}

async function callRpc<T = unknown>(
  name: string,
  params: Record<string, unknown>,
  fallback = 'common.error',
  context?: MutationContext,
): Promise<RpcResult<T>> {
  try {
    const { data, error } = await requireSupabase().rpc(name, params);
    if (error) {
      const key = actionError(error, fallback);
      if ((key === 'connection.error' || key === 'connection.schemaError') && (!context || isCurrentMutation(context))) setConnectionError(key);
      return { ok: false, error: key };
    }
    return { ok: true, data: data as T };
  } catch (error) {
    const key = actionError(error, fallback);
    if ((key === 'connection.error' || key === 'connection.schemaError') && (!context || isCurrentMutation(context))) setConnectionError(key);
    return { ok: false, error: key };
  }
}

async function runDirect(work: () => Promise<Result>): Promise<Result> {
  const context = currentMutationContext();
  try {
    const result = await work();
    if (result.ok && context && !isCurrentMutation(context)) return fail('common.error');
    return result;
  } catch (error) {
    if (context && !isCurrentMutation(context)) return fail('common.error');
    return failure(error);
  }
}

function mapPreferences(value: unknown): RidePreferences {
  const p = object(value);
  return {
    chatty: boolean(p.chatty), quiet: boolean(p.quiet), music: boolean(p.music),
    luggage: boolean(p.luggage), smokingAllowed: boolean(p.smokingAllowed),
    petsAllowed: boolean(p.petsAllowed), ac: boolean(p.ac),
  };
}

function isEffectiveSuspension(restriction: AccountRestriction | undefined, now = Date.now()): restriction is AccountRestriction {
  return !!restriction
    && restriction.active
    && restriction.kind !== 'warning'
    && new Date(restriction.startsAt).getTime() <= now
    && (!restriction.expiresAt || new Date(restriction.expiresAt).getTime() > now);
}

function mapUser(
  row: Row,
  member?: StaffMember,
  restriction?: AccountRestriction,
  effectiveStatus?: string,
): User {
  const staffRole = member?.active ? member.role : null;
  const suspends = isEffectiveSuspension(restriction);
  return {
    id: text(row.id),
    fullName: text(row.full_name),
    email: nullableText(row.email),
    phone: nullableText(row.phone),
    passwordHash: null,
    salt: null,
    photoUrl: nullableText(row.photo_url),
    avatarHue: number(row.avatar_hue, 210),
    dateOfBirth: nullableText(row.date_of_birth),
    gender: row.gender === 'female' || row.gender === 'male' ? row.gender : 'unspecified',
    language: language(row.language),
    bio: text(row.bio),
    role: row.role === 'admin' || staffRole === 'super_admin' || staffRole === 'admin' ? 'admin' : 'user',
    mode: row.mode === 'driver' ? 'driver' : 'passenger',
    status: row.status === 'suspended' || effectiveStatus === 'suspended' || suspends ? 'suspended' : 'active',
    phoneVerified: boolean(row.phone_verified),
    emailVerified: boolean(row.email_verified),
    atmosphere: stringArray(row.atmosphere),
    createdAt: text(row.created_at, new Date(0).toISOString()),
    isDemo: false,
    staffRole,
    restrictionStatus: suspends ? restriction.kind === 'ban' ? 'banned' : 'timeout' : 'active',
  };
}

function mapRestriction(row: Row): AccountRestriction {
  return {
    id: text(row.id), userId: text(row.user_id), kind: row.kind,
    reason: text(row.reason), internalNote: text(row.internal_note), publicMessage: nullableText(row.public_message) ?? '',
    startsAt: text(row.starts_at), expiresAt: nullableText(row.expires_at),
    active: boolean(row.active), createdBy: text(row.created_by), createdAt: text(row.created_at),
    reversedAt: nullableText(row.reversed_at), reversedBy: nullableText(row.reversed_by),
  };
}

function mapModerationAction(row: Row): ModerationAction {
  const targetType = row.report_id ? 'report'
    : row.review_id ? 'review'
      : row.verification_user_id ? 'verification'
        : row.action === 'staff_role_change' ? 'staff' : 'user';
  const targetId = row.report_id ?? row.review_id ?? row.verification_user_id ?? row.target_user_id ?? null;
  const metadata = object(row.metadata);
  return {
    id: text(row.id), actorId: text(row.actor_id), subjectId: nullableText(row.target_user_id ?? row.verification_user_id),
    actionType: row.action, targetType, targetId: nullableText(targetId),
    reason: text(row.reason), publicMessage: text(row.public_message), internalNote: text(row.internal_note),
    durationMinutes: row.duration_minutes == null ? null : number(row.duration_minutes),
    expiresAt: nullableText(row.expires_at),
    metadata: {
      ...metadata,
      restrictionId: nullableText(row.restriction_id),
      reportId: nullableText(row.report_id),
      reviewId: nullableText(row.review_id),
      verificationUserId: nullableText(row.verification_user_id),
    },
    createdAt: text(row.created_at),
  };
}

function notificationRoute(
  row: Row,
  type: NotificationType,
  params: Record<string, string | number>,
  booking: Booking | undefined,
  ride: Ride | undefined,
): string | null {
  const conversationId = text(params.conversation_id);
  if (type === 'message' && conversationId) return `/chat/${conversationId}`;
  if (booking) {
    if (type === 'booking_request') return `/driver/ride/${booking.rideId}`;
    if (type === 'review_request') {
      return row.user_id === booking.passengerId ? `/review/${booking.id}` : `/driver/ride/${booking.rideId}`;
    }
    if (['booking_accepted', 'booking_rejected', 'ride_cancelled', 'payment'].includes(type)) {
      return `/reservation/${booking.id}`;
    }
  }
  if (ride && ['ride_match', 'ride_reminder'].includes(type)) return `/ride/${ride.id}`;
  if (type === 'verification_update') return '/driver/verification';
  const route = nullableText(row.route);
  if (route === '/bookings') return '/reservations';
  if (route === '/verification') return '/driver/verification';
  if (route === '/reviews') return '/reservations';
  if (route === '/reports' || route === '/announcements') return '/notifications';
  return route;
}

function mapNotification(
  row: Row,
  lang: User['language'],
  users: User[],
  rides: Ride[],
  bookings: Booking[],
  requests: RideRequest[],
  messages: Message[],
  cities: City[],
): AppNotification {
  const rawParams = object(row.params);
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
  }
  const rawType = text(row.type);
  const type = NOTIFICATION_TYPES.has(rawType as NotificationType) ? rawType as NotificationType : 'announcement';
  const booking = bookings.find((item) => item.id === params.booking_id);
  const ride = rides.find((item) => item.id === (params.ride_id ?? booking?.rideId));
  if (ride) {
    params.from = cityName(cities.find((city) => city.id === ride.fromCityId), lang);
    params.to = cityName(cities.find((city) => city.id === ride.toCityId), lang);
    params.date = ride.departureAt.slice(0, 10);
    if (type === 'payment' && booking) params.amount = formatPrice(ride.pricePerSeat * booking.seats, lang);
  }
  if (type === 'booking_request' && booking) {
    params.name = users.find((user) => user.id === booking.passengerId)?.fullName ?? '';
    params.seats = booking.seats;
  }
  if (type === 'message') {
    const message = messages.find((item) => item.id === params.message_id);
    if (message) {
      params.name = users.find((user) => user.id === message.senderId)?.fullName ?? '';
      params.text = message.text.slice(0, 160);
    }
  }
  if (type === 'ride_match' && params.request_id) {
    const request = requests.find((item) => item.id === params.request_id);
    if (request) {
      params.from = cityName(cities.find((city) => city.id === request.fromCityId), lang);
      params.to = cityName(cities.find((city) => city.id === request.toCityId), lang);
      params.date = request.date;
    }
  }
  if (type === 'verification_update' && params.status) {
    params.status = translate(lang, `verify.status.${params.status}`);
  }
  if (type === 'announcement') {
    params.text = params.text ?? [params.title_key, params.body_key].filter(Boolean).join(' — ');
  }
  const titleKey = `notif.${type}.title`;
  const bodyKey = `notif.${type}.body`;
  let title = text(row.title).trim() || translate(lang, titleKey, params);
  let body = text(row.body).trim() || translate(lang, bodyKey, params);
  if (title === titleKey) title = translate(lang, 'notif.announcement.title');
  if (body === bodyKey) {
    body = text(params.public_message) || text(params.decision_note) || text(params.reason) || text(params.text);
  }
  if (type === 'moderation') {
    body = text(params.public_message) || text(params.reason) || body;
  } else if (type === 'appeal_update') {
    body = text(params.public_message) || text(params.decision_note) || body;
  }
  return {
    id: text(row.id), userId: text(row.user_id), type, title, body,
    route: notificationRoute(row, type, params, booking, ride), read: boolean(row.read), createdAt: text(row.created_at), params,
  };
}

async function fetchData(sb: ReturnType<typeof requireSupabase>, userId: string): Promise<CloudData> {
  const [profiles, ownUser, ownStaffRows] = await Promise.all([
    fetchRows(sb.from('public_profiles').select(PUBLIC_PROFILE_COLUMNS).order('id')),
    fetchOne(sb.from('users').select(USER_COLUMNS).eq('id', userId).maybeSingle()),
    fetchRows(sb.from('staff_members').select('user_id,role,active,created_at,updated_at').eq('user_id', userId)),
  ]);
  if (!ownUser) throw new Error('Authenticated profile is unavailable.');
  const { data: effectiveStatus, error: statusError } = await sb.rpc('effective_user_status', { p_user_id: userId });
  if (statusError) throw statusError;
  const ownStaff = ownStaffRows.find((member) => member.active);
  const accessUser: Pick<User, 'role' | 'staffRole' | 'status'> = {
    role: ownUser.role === 'admin' ? 'admin' : 'user',
    staffRole: ownStaff?.role ?? null,
    status: effectiveStatus === 'active' ? 'active' : 'suspended',
  };
  const canViewAdmin = canStaff(accessUser, 'view_admin');
  const canViewPrivateUsers = staffRoleOf(accessUser) === 'admin' || staffRoleOf(accessUser) === 'super_admin';
  const canReviewVerification = canStaff(accessUser, 'review_verification');
  const canModerate = canStaff(accessUser, 'moderate_content');
  const canManageReports = canStaff(accessUser, 'manage_reports');
  const canManageStaff = canStaff(accessUser, 'manage_staff');
  const canDecideAppeals = canStaff(accessUser, 'decide_appeals')
    && (staffRoleOf(accessUser) === 'admin' || staffRoleOf(accessUser) === 'super_admin');

  const [
    privateUsers, staffMembers, cities, vehicles, documents, verifications, rideRows, stopRows, recurringRows,
    bookingRows, pinRows, rideRequests, conversations, messages, reviews, reports, notificationRows,
    trustedContacts, savedDrivers, announcements, recentSearches, restrictionRows, restrictionDetailRows,
    moderationActionRows, moderationActionDetailRows, appeals,
  ] = await Promise.all([
    canViewPrivateUsers
      ? fetchRows(sb.from('users').select(USER_COLUMNS))
      : Promise.resolve([ownUser]),
    canManageStaff
      ? fetchRows(sb.from('staff_members').select('user_id,role,active,created_at,updated_at').order('user_id'))
      : Promise.resolve(ownStaffRows),
    fetchRows(sb.from('cities').select('id,code,name_fr,name_ar,lat,lon,popular').order('code')),
    fetchRows(sb.from('vehicles').select('id,owner_id,brand,model,color,plate,year,seats').order('created_at').order('id')),
    fetchRows((canReviewVerification
      ? sb.from('driver_documents').select('id,user_id,kind,storage_path,file_name,created_at').is('superseded_at', null)
      : sb.from('driver_documents').select('id,user_id,kind,storage_path,file_name,created_at').eq('user_id', userId).is('superseded_at', null)
    ).order('created_at', { ascending: false }).order('id')),
    fetchRows((canViewAdmin
      ? sb.from('driver_verifications').select('id,user_id,status,document_ids,submitted_at,reviewed_at,reason')
      : sb.from('driver_verifications').select('id,user_id,status,document_ids,submitted_at,reviewed_at,reason').eq('user_id', userId)
    ).order('user_id')),
    fetchRows(sb.from('rides').select('id,driver_id,vehicle_id,from_city_id,to_city_id,departure_at,arrival_at,seats_total,price_per_seat,pickup_point,dropoff_point,preferences,women_only,status,notes,created_at').order('departure_at', { ascending: false }).order('id')),
    fetchRows(sb.from('ride_stops').select('ride_id,city_id,label,position').order('position').order('ride_id')),
    fetchRows(sb.from('recurring_ride_rules').select('ride_id,frequency,days_of_week,until_date').order('ride_id')),
    fetchRows(sb.from('bookings').select(BOOKING_COLUMNS).order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('passenger_booking_pins').select('booking_id,ride_id,passenger_id,pin').eq('passenger_id', userId).order('booking_id')),
    fetchRows(sb.from('ride_requests').select('id,passenger_id,from_city_id,to_city_id,date,time_preference,seats,max_budget,women_only,status,created_at').order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('conversations').select('id,participant_a,participant_b,ride_id,booking_id,blocked_by,created_at').order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('messages').select('id,conversation_id,sender_id,text,read_by,auto_reply,created_at').order('created_at').order('id')),
    fetchRows(sb.from('reviews').select('id,booking_id,ride_id,author_id,target_id,stars,categories,text,status,created_at').order('created_at', { ascending: false }).order('id')),
    fetchRows((canManageReports
      ? sb.from('reports').select('id,reporter_id,target_type,target_id,reason,details,status,action,resolved_at,assigned_to,resolved_by,created_at')
      : sb.from('reports').select('id,reporter_id,target_type,target_id,reason,details,status,action,resolved_at,assigned_to,resolved_by,created_at').eq('reporter_id', userId)
    ).order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('notifications').select('id,user_id,type,title,body,route,read,params,created_at').eq('user_id', userId).order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('trusted_contacts').select('id,user_id,name,phone').eq('user_id', userId).order('id')),
    fetchRows(sb.from('saved_drivers').select('user_id,driver_id,created_at').eq('user_id', userId).order('driver_id')),
    fetchRows(sb.from('announcements').select('id,title,body,created_at').order('created_at', { ascending: false }).order('id')),
    fetchRows(sb.from('recent_searches').select('id,user_id,from_city_id,to_city_id,date,seats,created_at').eq('user_id', userId).order('created_at', { ascending: false }).order('id')),
    fetchRows((canViewAdmin
      ? sb.from('account_restrictions').select('id,user_id,kind,starts_at,expires_at,public_message,active,reversed_at,created_by,created_at')
      : sb.from('account_restrictions').select('id,user_id,kind,starts_at,expires_at,public_message,active,reversed_at,created_by,created_at').eq('user_id', userId)
    ).order('created_at', { ascending: false }).order('id')),
    canModerate
      ? fetchRows(sb.from('staff_restriction_details').select('id,reason,internal_note').order('id'))
      : Promise.resolve([]),
    canViewAdmin
      ? fetchRows(sb.from('moderation_actions').select('id,action,actor_id,target_user_id,restriction_id,report_id,review_id,verification_user_id,reason,created_at').order('created_at', { ascending: false }).order('id'))
      : fetchRows(sb.from('my_moderation_actions').select('id,action,actor_id,target_user_id,restriction_id,report_id,review_id,verification_user_id,reason,created_at').order('created_at', { ascending: false }).order('id')),
    canModerate
      ? fetchRows(sb.from('staff_moderation_action_details').select('id,internal_note,evidence,public_message,duration_minutes,expires_at').order('id'))
      : Promise.resolve([]),
    fetchRows((canDecideAppeals
      ? sb.from('staff_moderation_appeal_details').select('id,action_id,user_id,status,statement,decision_note,public_message,internal_note,reviewed_by,reviewed_at,created_at')
      : sb.from('moderation_appeals').select('id,action_id,user_id,status,statement,decision_note,public_message,reviewed_by,reviewed_at,created_at').eq('user_id', userId)
    ).order('created_at', { ascending: false }).order('id')),
  ]);

  const mappedStaff: StaffMember[] = staffMembers.map((row) => ({
    userId: text(row.user_id), role: row.role, active: boolean(row.active),
    createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  }));
  const restrictionDetails = new Map(restrictionDetailRows.map((row) => [text(row.id), row]));
  const mappedRestrictions = restrictionRows.map((row) => mapRestriction({ ...row, ...restrictionDetails.get(text(row.id)) }));
  const staffByUser = new Map(mappedStaff.map((member) => [member.userId, member]));
  const restrictionByUser = new Map<string, AccountRestriction>();
  for (const restriction of mappedRestrictions) {
    if (!isEffectiveSuspension(restriction)) continue;
    const current = restrictionByUser.get(restriction.userId);
    if (!current || restriction.createdAt > current.createdAt) restrictionByUser.set(restriction.userId, restriction);
  }
  const profileById = new Map(profiles.map((row) => [text(row.id), row]));
  const privateById = new Map(privateUsers.map((row) => [text(row.id), row]));
  const userIds = new Set([...profileById.keys(), ...privateById.keys()]);
  const users = [...userIds].map((id) => mapUser(
    { ...profileById.get(id), ...privateById.get(id) },
    staffByUser.get(id),
    restrictionByUser.get(id),
    id === userId ? text(effectiveStatus) : undefined,
  ));
  const mappedCities: City[] = cities.map((row) => ({
    id: text(row.id), code: number(row.code), nameFr: text(row.name_fr), nameAr: text(row.name_ar),
    lat: number(row.lat), lon: number(row.lon), popular: boolean(row.popular),
  }));
  const mappedVehicles: Vehicle[] = vehicles.map((row) => ({
    id: text(row.id), ownerId: text(row.owner_id), brand: text(row.brand), model: text(row.model),
    color: text(row.color), plate: text(row.plate), year: number(row.year), seats: number(row.seats), isDemo: false,
  }));
  const mappedDocuments: DriverDocument[] = documents.map((row) => ({
    id: text(row.id), userId: text(row.user_id), kind: row.kind, imageDataUrl: '',
    storagePath: nullableText(row.storage_path), fileName: text(row.file_name), uploadedAt: text(row.created_at),
  }));
  const mappedVerifications: DriverVerification[] = verifications.map((row) => ({
    userId: text(row.user_id), status: row.status, documentIds: stringArray(row.document_ids),
    submittedAt: nullableText(row.submitted_at), reviewedAt: nullableText(row.reviewed_at), reason: nullableText(row.reason),
  }));
  const recurringByRide = new Map(recurringRows.map((row) => [text(row.ride_id), row]));
  const stopsByRide = new Map<string, Array<{ cityId: string; label: string }>>();
  for (const row of stopRows) {
    const rideId = text(row.ride_id);
    const stops = stopsByRide.get(rideId) ?? [];
    stops.push({ cityId: text(row.city_id), label: text(row.label) });
    stopsByRide.set(rideId, stops);
  }
  const rides: Ride[] = rideRows.map((row) => {
    const rideId = text(row.id);
    const recurring = recurringByRide.get(rideId);
    return {
      id: rideId, driverId: text(row.driver_id), vehicleId: text(row.vehicle_id),
      fromCityId: text(row.from_city_id), toCityId: text(row.to_city_id),
      departureAt: text(row.departure_at), arrivalAt: text(row.arrival_at),
      seatsTotal: number(row.seats_total), pricePerSeat: number(row.price_per_seat),
      pickupPoint: text(row.pickup_point), dropoffPoint: text(row.dropoff_point),
      stops: stopsByRide.get(rideId) ?? [], preferences: mapPreferences(row.preferences),
      womenOnly: boolean(row.women_only),
      recurring: recurring ? {
        frequency: recurring.frequency,
        daysOfWeek: Array.isArray(recurring.days_of_week) ? recurring.days_of_week.map(number) : [],
        until: nullableText(recurring.until_date),
      } : null,
      status: row.status, notes: text(row.notes), createdAt: text(row.created_at), isDemo: false,
    };
  });
  const pins = new Map(pinRows.filter((row) => row.passenger_id === userId).map((row) => [text(row.booking_id), text(row.pin)]));
  const bookings: Booking[] = bookingRows.map((row) => ({
    id: text(row.id), rideId: text(row.ride_id), passengerId: text(row.passenger_id),
    seats: number(row.seats), status: row.status, pin: pins.get(text(row.id)) ?? null,
    createdAt: text(row.created_at), decidedAt: nullableText(row.decided_at),
    boardedAt: nullableText(row.boarded_at), completedAt: nullableText(row.completed_at),
    passengerPaid: boolean(row.passenger_paid), driverReceived: boolean(row.driver_received),
    paidAt: nullableText(row.paid_at), receivedAt: nullableText(row.received_at),
    cancelledBy: nullableText(row.cancelled_by), isDemo: false,
  }));
  const mappedRequests: RideRequest[] = rideRequests.map((row) => ({
    id: text(row.id), passengerId: text(row.passenger_id), fromCityId: text(row.from_city_id),
    toCityId: text(row.to_city_id), date: text(row.date), timePreference: text(row.time_preference),
    seats: number(row.seats), maxBudget: number(row.max_budget), womenOnly: boolean(row.women_only),
    status: row.status, createdAt: text(row.created_at), isDemo: false,
  }));
  const mappedConversations: Conversation[] = conversations.map((row) => ({
    id: text(row.id), participantIds: [text(row.participant_a), text(row.participant_b)],
    rideId: nullableText(row.ride_id), bookingId: nullableText(row.booking_id),
    blockedBy: nullableText(row.blocked_by), createdAt: text(row.created_at),
  }));
  const mappedMessages: Message[] = messages.map((row) => ({
    id: text(row.id), conversationId: text(row.conversation_id), senderId: text(row.sender_id),
    text: text(row.text), createdAt: text(row.created_at), readBy: stringArray(row.read_by),
    isDemo: false, autoReply: boolean(row.auto_reply),
  }));
  const mappedReviews: Review[] = reviews.map((row) => {
    const categories = object(row.categories);
    return {
      id: text(row.id), bookingId: text(row.booking_id), rideId: text(row.ride_id),
      authorId: text(row.author_id), targetId: text(row.target_id), stars: number(row.stars),
      categories: Object.keys(categories).length ? {
        driving: number(categories.driving), punctuality: number(categories.punctuality),
        communication: number(categories.communication), respect: number(categories.respect),
        vehicle: number(categories.vehicle),
      } : null,
      text: text(row.text), createdAt: text(row.created_at), status: row.status, isDemo: false,
    };
  });
  const mappedReports: Report[] = reports.map((row) => ({
    id: text(row.id), reporterId: text(row.reporter_id), targetType: row.target_type,
    targetId: text(row.target_id), reason: row.reason, details: text(row.details), status: row.status,
    action: nullableText(row.action), createdAt: text(row.created_at), resolvedAt: nullableText(row.resolved_at),
    assignedTo: nullableText(row.assigned_to), resolvedBy: nullableText(row.resolved_by),
  }));
  const ownLang = users.find((user) => user.id === userId)?.language ?? 'fr';
  const mappedNotifications = notificationRows.map((row) => mapNotification(row, ownLang, users, rides, bookings, mappedRequests, mappedMessages, mappedCities));
  const mappedAppeals: ModerationAppeal[] = appeals.map((row) => ({
    id: text(row.id), actionId: text(row.action_id), appellantId: text(row.user_id),
    statement: text(row.statement), status: row.status, reviewedBy: nullableText(row.reviewed_by),
    reviewNote: nullableText(row.decision_note), publicMessage: nullableText(row.public_message),
    internalNote: nullableText(row.internal_note), createdAt: text(row.created_at), reviewedAt: nullableText(row.reviewed_at),
  }));
  const actionDetails = new Map(moderationActionDetailRows.map((row) => [text(row.id), row]));
  const mappedActions = moderationActionRows.map((row) => {
    const merged = { ...row, ...actionDetails.get(text(row.id)) };
    const restrictionId = nullableText(merged.restriction_id);
    const restriction = mappedRestrictions.find((item) => item.id === restrictionId);
    return mapModerationAction({
      ...merged,
      public_message: merged.public_message ?? restriction?.publicMessage,
      duration_minutes: merged.duration_minutes ?? (restriction?.expiresAt
        ? Math.max(0, Math.round((new Date(restriction.expiresAt).getTime() - new Date(restriction.startsAt).getTime()) / 60000))
        : null),
      expires_at: merged.expires_at ?? restriction?.expiresAt,
    });
  });

  return {
    cities: mappedCities, users, vehicles: mappedVehicles, documents: mappedDocuments,
    verifications: mappedVerifications, rides, bookings, rideRequests: mappedRequests,
    conversations: mappedConversations, messages: mappedMessages, reviews: mappedReviews,
    reports: mappedReports, notifications: mappedNotifications,
    trustedContacts: trustedContacts.map((row) => ({
      id: text(row.id), userId: text(row.user_id), name: text(row.name), phone: text(row.phone),
    })),
    savedDrivers: savedDrivers.map((row): SavedDriver => ({
      userId: text(row.user_id), driverId: text(row.driver_id), createdAt: text(row.created_at),
    })),
    announcements: announcements.map((row): Announcement => ({
      id: text(row.id), title: text(row.title), body: text(row.body), createdAt: text(row.created_at),
    })),
    recentSearches: recentSearches.map((row): RecentSearch => ({
      id: text(row.id), userId: text(row.user_id), fromCityId: text(row.from_city_id),
      toCityId: text(row.to_city_id), date: text(row.date), seats: number(row.seats), createdAt: text(row.created_at),
    })),
    staffMembers: mappedStaff, restrictions: mappedRestrictions,
    moderationActions: mappedActions, appeals: mappedAppeals,
  };
}

let authUnsubscribe: (() => void) | null = null;
let realtimeChannels: RealtimeChannel[] = [];
let realtimeClient: ReturnType<typeof requireSupabase>['realtime'] | null = null;
let realtimeUserId: string | null = null;
let initializePromise: Promise<void> | null = null;
let initialized = false;
let sessionGeneration = 0;
let reloadVersion = 0;
let activeReload: { key: string; promise: Promise<boolean>; version: number } | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeRetryTimer: ReturnType<typeof setTimeout> | null = null;
let privateStatePollTimer: ReturnType<typeof setInterval> | null = null;
let privateStateRefresh: (() => void) | null = null;

function currentMutationContext(): MutationContext | null {
  const userId = useCloudStore.getState().sessionUserId;
  return userId ? { userId, generation: sessionGeneration } : null;
}

function isCurrentMutation(context: MutationContext): boolean {
  return sessionGeneration === context.generation
    && useCloudStore.getState().sessionUserId === context.userId;
}

function cleanupRealtime() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (realtimeRetryTimer) clearTimeout(realtimeRetryTimer);
  if (privateStatePollTimer) clearInterval(privateStatePollTimer);
  if (privateStateRefresh) {
    window.removeEventListener('focus', privateStateRefresh);
    document.removeEventListener('visibilitychange', privateStateRefresh);
  }
  refreshTimer = null;
  realtimeRetryTimer = null;
  privateStatePollTimer = null;
  privateStateRefresh = null;
  const client = realtimeClient;
  const channels = realtimeChannels;
  realtimeChannels = [];
  realtimeClient = null;
  realtimeUserId = null;
  if (client) {
    for (const channel of channels) void client.removeChannel(channel);
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const userId = useCloudStore.getState().sessionUserId;
    if (userId) void reload(userId, true);
  }, 150);
}

function setupRealtime(sb: ReturnType<typeof requireSupabase>, userId: string) {
  if (realtimeUserId === userId && realtimeChannels.length > 0) return;
  cleanupRealtime();
  const tables = [
    'rides', 'ride_stops', 'recurring_ride_rules', 'ride_occurrences', 'announcements', 'cities',
  ] as const;
  const channel = sb.channel(`waslni:${userId}:public-data`);
  for (const table of tables) {
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table,
    }, scheduleRefresh);
  }
  realtimeClient = sb.realtime;
  realtimeUserId = userId;
  realtimeChannels = [channel];
  channel.subscribe((status) => {
    if (realtimeUserId !== userId || useCloudStore.getState().sessionUserId !== userId) return;
    if (status === 'SUBSCRIBED' && useCloudStore.getState().connectionStatus === 'error') {
      void reload(userId, true);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setConnectionError();
      realtimeRetryTimer = setTimeout(() => {
        realtimeRetryTimer = null;
        if (useCloudStore.getState().sessionUserId !== userId) return;
        cleanupRealtime();
        setupRealtime(sb, userId);
      }, 3000);
    }
  });
  privateStatePollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && useCloudStore.getState().sessionUserId === userId) {
      void reload(userId, true);
    }
  }, 30000);
  privateStateRefresh = () => {
    if (document.visibilityState === 'visible' && useCloudStore.getState().sessionUserId === userId) {
      void reload(userId, true);
    }
  };
  window.addEventListener('focus', privateStateRefresh);
  document.addEventListener('visibilitychange', privateStateRefresh);
}

function reload(userId: string, force = false): Promise<boolean> {
  const generation = sessionGeneration;
  const key = `${generation}:${userId}`;
  if (!force && activeReload?.key === key) return activeReload.promise;
  const version = ++reloadVersion;
  const promise = (async () => {
    try {
      const data = await fetchData(requireSupabase(), userId);
      if (generation !== sessionGeneration || version !== reloadVersion || useCloudStore.getState().sessionUserId !== userId) return false;
      const ownLanguage = data.users.find((user) => user.id === userId)?.language;
      useCloudStore.setState({
        ...data,
        ...(ownLanguage ? { language: ownLanguage } : {}),
        connectionStatus: 'ready', connectionError: null,
      });
      setupRealtime(requireSupabase(), userId);
      return true;
    } catch (error) {
      if (generation === sessionGeneration && version === reloadVersion && useCloudStore.getState().sessionUserId === userId) {
        const key = actionError(error);
        setConnectionError(key === 'connection.schemaError' ? key : 'connection.error');
      }
      return false;
    }
  })();
  activeReload = { key, promise, version };
  void promise.then(() => {
    if (activeReload?.promise === promise) activeReload = null;
  });
  return promise;
}

async function reloadCurrent(): Promise<boolean> {
  const userId = useCloudStore.getState().sessionUserId;
  return userId ? reload(userId, true) : true;
}

async function finishMutation(context?: MutationContext): Promise<Result> {
  if (context && !isCurrentMutation(context)) return fail('common.error');
  const userId = context?.userId ?? useCloudStore.getState().sessionUserId;
  if (!userId) return fail('common.error');
  return await reload(userId, true) ? ok : fail('connection.error');
}

async function rpcAction(name: string, params: Record<string, unknown>, fallback = 'common.error'): Promise<Result> {
  const context = currentMutationContext();
  const result = await callRpc(name, params, fallback, context ?? undefined);
  if (!result.ok || !context) return fail(result.ok ? 'common.error' : result.error);
  return finishMutation(context);
}

function clearSession(status: 'ready' | 'error' = 'ready', error: string | null = null) {
  sessionGeneration += 1;
  reloadVersion += 1;
  activeReload = null;
  cleanupRealtime();
  useCloudStore.setState({
    ...emptyData(), ...initialState(), sessionUserId: null, connectionStatus: status, connectionError: error,
  });
}

async function activateSession(session: Session | null): Promise<boolean> {
  if (!session) {
    clearSession();
    return true;
  }
  sessionGeneration += 1;
  cleanupRealtime();
  const userId = session.user.id;
  useCloudStore.setState({
    ...emptyData(), sessionUserId: userId, onboardingSeen: false,
    connectionStatus: 'loading', connectionError: null,
  });
  return reload(userId);
}

async function activateAuthSession(session: Session): Promise<Result> {
  return await activateSession(session) ? ok : fail('connection.error');
}

function handleAuthChange(event: string, session: Session | null) {
  queueMicrotask(() => {
    void (async () => {
      const userId = session?.user.id ?? null;
      if (!userId) {
        if (event === 'SIGNED_OUT' || useCloudStore.getState().sessionUserId || realtimeUserId) clearSession();
        return;
      }
      if (!session || useCloudStore.getState().sessionUserId !== userId) {
        if (session) await activateAuthSession(session);
      } else if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        await reload(userId, true);
      }
    })();
  });
}

function sanitizeFileName(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? '';
  const safe = base.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 120);
  return safe || 'document';
}

function parseDocument(value: string): { ok: true; blob: Blob; mime: string } | { ok: false; error: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i.exec(value.trim());
  if (!match) return { ok: false, error: 'common.error' };
  const mime = match[1].toLowerCase();
  if (!DOCUMENT_MIMES.has(mime)) return { ok: false, error: 'common.error' };
  const base64 = match[2].replace(/\s/g, '');
  if (!base64 || base64.length > Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 4) return { ok: false, error: 'verify.docTooBig' };
  try {
    const binary = atob(base64);
    if (!binary.length || binary.length > MAX_DOCUMENT_BYTES) return { ok: false, error: 'verify.docTooBig' };
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const validSignature = mime === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mime === 'image/png'
        ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
          && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
        : bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
          && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!validSignature) return { ok: false, error: 'common.error' };
    return { ok: true, blob: new Blob([bytes], { type: mime }), mime };
  } catch {
    return { ok: false, error: 'common.error' };
  }
}

export const useCloudStore = create<AppState>()((set, get) => ({
  ...initialState(),

  initialize: () => {
    if (initialized) return Promise.resolve();
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      set({ connectionStatus: 'loading', connectionError: null });
      try {
        const sb = requireSupabase();
        if (!authUnsubscribe) {
          const { data } = sb.auth.onAuthStateChange(handleAuthChange);
          authUnsubscribe = () => data.subscription.unsubscribe();
        }
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        if (data.session) {
          const activated = await activateAuthSession(data.session);
          if (!activated.ok) throw new Error(activated.error);
        } else {
          clearSession();
        }
        initialized = true;
      } catch {
        cleanupRealtime();
        setConnectionError();
      }
    })().finally(() => { initializePromise = null; });
    return initializePromise;
  },

  refresh: async () => {
    await reloadCurrent();
  },

  setLanguage: async (lang) => {
    const context = currentMutationContext();
    const previous = get().language;
    set({ language: lang });
    if (!context) return ok;
    const result = await callRpc('update_my_profile', { p_patch: { language: lang } }, 'common.error', context);
    if (!isCurrentMutation(context)) return fail('common.error');
    if (!result.ok) {
      set({ language: previous });
      return fail(result.error);
    }
    return await reload(context.userId, true) ? ok : fail('connection.error');
  },

  setOnboardingSeen: () => set({ onboardingSeen: true }),

  signUp: async ({ fullName, email, password }) => {
    const normalized = email.trim().toLowerCase();
    if (!fullName.trim()) return fail('common.required');
    if (!isValidEmail(normalized)) return fail('auth.invalidEmail');
    if (password.length < 8) return fail('auth.weakPassword');
    try {
      const { data, error } = await requireSupabase().auth.signUp({
        email: normalized, password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) return failure(error);
      if (!data.session) {
        clearSession();
        return { ok: true, confirmationRequired: true };
      }
      return await activateSession(data.session) ? ok : fail('connection.error');
    } catch (error) {
      return failure(error);
    }
  },

  login: async (email, password) => {
    try {
      const { data, error } = await requireSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) return failure(error);
      if (!data.session) return fail('common.error');
      return await activateAuthSession(data.session);
    } catch (error) {
      return failure(error);
    }
  },

  requestPhoneOtp: async (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return fail('auth.invalidPhone');
    try {
      const { error } = await requireSupabase().auth.signInWithOtp({ phone: normalized });
      return error ? failure(error) : ok;
    } catch (error) {
      return failure(error);
    }
  },

  verifyPhoneOtp: async (phone, token) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return fail('auth.invalidPhone');
    try {
      const { data, error } = await requireSupabase().auth.verifyOtp({ phone: normalized, token: token.trim(), type: 'sms' });
      if (error) return failure(error, 'auth.otpWrong');
      const session = data.session;
      if (!session) return fail('common.error');
      const activated = await activateAuthSession(session);
      if (!activated.ok) return activated;
      const user = get().users.find((item) => item.id === session.user.id);
      return { ok: true, isNew: !user?.fullName.trim() };
    } catch (error) {
      return failure(error, 'auth.otpWrong');
    }
  },

  phoneAuth: () => fail('auth.otpRequired'),
  requestPasswordReset: async (email) => {
    if (!isValidEmail(email.trim())) return fail('auth.invalidEmail');
    try {
      const redirectTo = `${location.origin}${location.pathname}#/reset-password`;
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      return error ? failure(error) : ok;
    } catch (error) {
      return failure(error);
    }
  },

  updatePassword: async (password) => {
    if (password.length < 8) return fail('auth.weakPassword');
    try {
      const { error } = await requireSupabase().auth.updateUser({ password });
      return error ? failure(error) : ok;
    } catch (error) {
      return failure(error);
    }
  },

  loginDemo: () => undefined,

  logout: async () => {
    try {
      const { error } = await requireSupabase().auth.signOut();
      if (error) return failure(error);
      clearSession();
      return ok;
    } catch (error) {
      return failure(error);
    }
  },

  updateProfile: async (p) => {
    if (!get().sessionUserId) return fail('common.error');
    const fields: Record<string, string> = {
      fullName: 'full_name', phone: 'phone', photoUrl: 'photo_url', dateOfBirth: 'date_of_birth',
      gender: 'gender', bio: 'bio', atmosphere: 'atmosphere', language: 'language',
    };
    const patch: Row = {};
    for (const [key, column] of Object.entries(fields)) {
      const value = p[key as keyof typeof p];
      if (value !== undefined) patch[column] = value;
    }
    if (!Object.keys(patch).length) return fail('common.required');
    return rpcAction('update_my_profile', { p_patch: patch });
  },

  setMode: (mode) => get().sessionUserId
    ? rpcAction('set_my_mode', { p_mode: mode })
    : fail('common.error'),

  resetAll: () => undefined,

  addVehicle: (p) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    return runDirect(async () => {
      const sb = requireSupabase();
      const { error } = await sb.from('vehicles').insert({
        owner_id: userId, brand: p.brand.trim(), model: p.model.trim(), color: p.color.trim(),
        plate: p.plate.trim(), year: p.year, seats: p.seats,
      });
      return error ? failure(error) : finishMutation();
    });
  },

  saveDocument: (doc) => {
    const context = currentMutationContext();
    if (!context) return fail('common.error');
    return runDirect(async () => {
      const parsed = parseDocument(doc.imageDataUrl);
      if (!parsed.ok) return fail(parsed.error);
      const sb = requireSupabase();
      const fileName = sanitizeFileName(doc.fileName);
      const storagePath = `${context.userId}/${crypto.randomUUID()}-${fileName}`;
      const { error: uploadError } = await sb.storage.from('driver-documents').upload(storagePath, parsed.blob, {
        contentType: parsed.mime, upsert: false,
      });
      if (uploadError) return failure(uploadError);
      const registered = await callRpc<Row>('register_driver_document', {
        p_kind: doc.kind, p_storage_path: storagePath, p_file_name: fileName,
      }, 'common.error', context);
      if (!registered.ok) {
        await sb.storage.from('driver-documents').remove([storagePath]);
        return fail(registered.error);
      }
      if (!isCurrentMutation(context)) return fail('common.error');
      const previousPaths = stringArray(object(registered.data).previous_paths);
      if (previousPaths.length) {
        const { error } = await sb.storage.from('driver-documents').remove(previousPaths);
        if (error) return failure(error);
      }
      return finishMutation(context);
    });
  },

  removeDocument: (kind) => {
    const context = currentMutationContext();
    if (!context) return fail('common.error');
    return runDirect(async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('driver_documents').select('id').eq('user_id', context.userId).eq('kind', kind).is('superseded_at', null);
      if (error) return failure(error);
      for (const row of data ?? []) {
        const removed = await callRpc<string>('remove_driver_document', {
          p_document_id: text(object(row).id),
        }, 'common.error', context);
        if (!removed.ok) return fail(removed.error);
        if (!removed.data) return fail('common.error');
        const { error: storageError } = await sb.storage.from('driver-documents').remove([removed.data]);
        if (storageError) return failure(storageError);
      }
      return finishMutation(context);
    });
  },

  getDocumentUrl: async (documentId, reason) => {
    const context = currentMutationContext();
    const document = get().documents.find((item) => item.id === documentId);
    if (!context || !document?.storagePath) return fail('common.error');
    try {
      const { data, error } = await requireSupabase().functions.invoke('document-url', {
        body: { documentId, reason: reason.trim() },
      });
      if (error) return failure(error);
      if (!isCurrentMutation(context)) return fail('common.error');
      const url = text(object(data).url);
      return url ? { ok: true, url } : fail('common.error');
    } catch (error) {
      return failure(error);
    }
  },

  submitVerification: () => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    const kinds: DriverDocument['kind'][] = ['id_card', 'license', 'registration', 'selfie'];
    const documentIds = kinds.map((kind) => get().documents.find((doc) => doc.userId === userId && doc.kind === kind)?.id).filter((id): id is string => !!id);
    if (documentIds.length !== kinds.length) return fail('verify.missingDocs');
    return rpcAction('submit_verification', { p_document_ids: documentIds });
  },

  reviewVerification: (userId, approve, reason) => rpcAction('review_verification', {
    p_user_id: userId, p_decision: approve ? 'verified' : 'rejected', p_reason: approve ? null : reason ?? null,
  }),

  publishRide: (p) => {
    const context = currentMutationContext();
    if (!context) return fail('common.error');
    const userId = context.userId;
    const state = get();
    if (state.verifications.find((item) => item.userId === userId)?.status !== 'verified') return fail('driver.verificationNeededText');
    if (!state.vehicles.some((vehicle) => vehicle.id === p.vehicleId && vehicle.ownerId === userId)) return fail('publish.noVehicle');
    if (p.fromCityId === p.toCityId) return fail('publish.sameCity');
    if (new Date(p.departureAt).getTime() <= Date.now()) return fail('publish.pastTime');
    if (p.pricePerSeat < 50) return fail('publish.invalidPrice');
    if (p.recurring?.frequency === 'custom') return fail('common.error');
    const arrivalAt = new Date(new Date(p.departureAt).getTime() + p.durationMin * 60000).toISOString();
    return (async () => {
      const result = await callRpc<Row>('publish_ride', {
        p_ride: {
          vehicle_id: p.vehicleId, from_city_id: p.fromCityId, to_city_id: p.toCityId,
          departure_at: p.departureAt, arrival_at: arrivalAt, seats_total: p.seatsTotal,
          price_per_seat: p.pricePerSeat, pickup_point: p.pickupPoint, dropoff_point: p.dropoffPoint,
          preferences: p.preferences, women_only: p.womenOnly, notes: p.notes,
        },
        p_stops: p.stops.map((stop) => ({ city_id: stop.cityId, label: stop.label })),
        p_recurring: p.recurring ? {
          frequency: p.recurring.frequency, days_of_week: p.recurring.daysOfWeek, until_date: p.recurring.until,
        } : null,
      }, 'common.error', context);
      if (!result.ok) return result;
      const rideId = text(object(result.data).id);
      const refreshed = await finishMutation(context);
      if (!refreshed.ok) return refreshed;
      return rideId ? { ok: true, rideId } : fail('common.error');
    })();
  },

  updateRide: (rideId, p) => {
    if (!get().sessionUserId) return fail('common.error');
    const current = get().rides.find((ride) => ride.id === rideId);
    if (!current) return fail('ride.notFound');
    if (p.status !== undefined && p.status !== current.status) return fail('common.error');
    const hasConfirmed = get().bookings.some((booking) => booking.rideId === rideId && booking.status === 'confirmed');
    const structuralKeys: Array<keyof Partial<Ride>> = [
      'vehicleId', 'fromCityId', 'toCityId', 'departureAt', 'arrivalAt', 'seatsTotal',
      'pricePerSeat', 'pickupPoint', 'dropoffPoint', 'womenOnly', 'stops', 'recurring',
    ];
    if (hasConfirmed && structuralKeys.some((key) => p[key] !== undefined)) return fail('publish.hasBookings');
    const fromCityId = p.fromCityId ?? current.fromCityId;
    const toCityId = p.toCityId ?? current.toCityId;
    if (fromCityId === toCityId) return fail('publish.sameCity');
    if ((p.pricePerSeat ?? current.pricePerSeat) < 50) return fail('publish.invalidPrice');
    if (p.recurring?.frequency === 'custom') return fail('common.error');
    const columns: Record<string, string> = {
      vehicleId: 'vehicle_id', fromCityId: 'from_city_id', toCityId: 'to_city_id',
      departureAt: 'departure_at', arrivalAt: 'arrival_at', seatsTotal: 'seats_total',
      pricePerSeat: 'price_per_seat', pickupPoint: 'pickup_point', dropoffPoint: 'dropoff_point',
      preferences: 'preferences', womenOnly: 'women_only', notes: 'notes',
    };
    const patch: Row = {};
    for (const [key, column] of Object.entries(columns)) {
      const value = p[key as keyof typeof p];
      if (value !== undefined) patch[column] = value;
    }
    if (p.stops !== undefined) {
      patch.stops = p.stops.map((stop) => ({ city_id: stop.cityId, label: stop.label }));
    }
    if (p.recurring !== undefined) {
      patch.recurring = p.recurring ? {
        frequency: p.recurring.frequency, days_of_week: p.recurring.daysOfWeek, until_date: p.recurring.until,
      } : null;
    }
    return rpcAction('update_ride', { p_ride_id: rideId, p_patch: patch });
  },

  cancelRide: (rideId) => rpcAction('cancel_ride', { p_ride_id: rideId }),
  startRide: (rideId) => rpcAction('start_ride', { p_ride_id: rideId }),
  completeRide: (rideId) => rpcAction('complete_ride', { p_ride_id: rideId }),

  requestBooking: (rideId, seats) => {
    const context = currentMutationContext();
    if (!context) return fail('book.loginRequired');
    const userId = context.userId;
    const state = get();
    const ride = state.rides.find((item) => item.id === rideId);
    if (!ride || ride.status !== 'published' || new Date(ride.departureAt).getTime() <= Date.now()) return fail('ride.notFound');
    if (ride.driverId === userId) return fail('book.driverSelf');
    if (ride.womenOnly && state.users.find((user) => user.id === userId)?.gender !== 'female') return fail('book.womenOnlyDenied');
    if (state.bookings.some((booking) => booking.rideId === rideId && booking.passengerId === userId && (booking.status === 'pending' || booking.status === 'confirmed'))) return fail('book.duplicate');
    const taken = state.bookings.filter((booking) => booking.rideId === rideId && booking.status === 'confirmed').reduce((sum, booking) => sum + booking.seats, 0);
    if (seats < 1 || ride.seatsTotal - taken < seats) return fail('book.notEnoughSeats');
    return (async () => {
      const result = await callRpc<Row>('request_booking', { p_ride_id: rideId, p_seats: seats }, 'common.error', context);
      if (!result.ok) return result;
      const bookingId = text(object(result.data).id);
      const refreshed = await finishMutation(context);
      if (!refreshed.ok) return refreshed;
      return bookingId ? { ok: true, bookingId } : fail('common.error');
    })();
  },

  decideBooking: (bookingId, accept) => rpcAction('decide_booking', { p_booking_id: bookingId, p_accept: accept }, accept ? 'book.notEnoughSeats' : 'common.error'),
  cancelBooking: (bookingId) => rpcAction('cancel_booking', { p_booking_id: bookingId }),
  boardWithPin: (bookingId, pin) => /^\d{4}$/.test(pin.trim())
    ? rpcAction('board_booking_with_pin', { p_booking_id: bookingId, p_pin: pin.trim() }, 'driver.pinWrong')
    : fail('driver.pinWrong'),
  markNoShow: (bookingId) => rpcAction('mark_booking_no_show', { p_booking_id: bookingId }),

  confirmPayment: (bookingId, side) => {
    const userId = get().sessionUserId;
    const booking = get().bookings.find((item) => item.id === bookingId);
    const ride = get().rides.find((item) => item.id === booking?.rideId);
    if (!userId || !booking || !ride || booking.status !== 'completed') return fail('common.error');
    if (side === 'passenger' && booking.passengerId !== userId) return fail('common.error');
    if (side === 'driver' && ride.driverId !== userId) return fail('common.error');
    return rpcAction('confirm_payment', { p_booking_id: bookingId });
  },

  submitReview: ({ bookingId, stars, categories, text: reviewText }) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    const booking = get().bookings.find((item) => item.id === bookingId);
    if (!booking || booking.status !== 'completed') return fail('review.onlyCompleted');
    if (stars < 1 || stars > 5) return fail('review.starsRequired');
    if (get().reviews.some((review) => review.bookingId === bookingId && review.authorId === userId)) return fail('review.alreadyReviewed');
    return rpcAction('submit_review', {
      p_booking_id: bookingId, p_stars: stars, p_categories: categories, p_text: reviewText.trim(),
    }, 'review.alreadyReviewed');
  },

  createRideRequest: (p) => {
    if (!get().sessionUserId) return fail('common.error');
    if (p.fromCityId === p.toCityId) return fail('home.sameCity');
    if (p.date < new Date().toISOString().slice(0, 10)) return fail('common.error');
    return rpcAction('create_ride_request', { p_request: {
      from_city_id: p.fromCityId, to_city_id: p.toCityId, date: p.date,
      time_preference: p.timePreference, seats: p.seats, max_budget: p.maxBudget, women_only: p.womenOnly,
    } });
  },

  closeRideRequest: (id) => rpcAction('close_ride_request', { p_request_id: id }),

  ensureConversation: async (otherUserId, rideId = null, bookingId = null) => {
    const context = currentMutationContext();
    if (!context || context.userId === otherUserId) return '';
    const userId = context.userId;
    const existing = get().conversations.find((conversation) => conversation.participantIds.includes(userId)
      && conversation.participantIds.includes(otherUserId)
      && (!rideId || conversation.rideId === rideId)
      && (!bookingId || conversation.bookingId === bookingId));
    if (existing) return existing.id;
    const result = await callRpc<Row>('ensure_conversation', {
      p_ride_id: rideId, p_booking_id: bookingId, p_other_user_id: otherUserId,
    }, 'common.error', context);
    if (!result.ok) return '';
    const conversationId = text(object(result.data).id);
    const refreshed = await finishMutation(context);
    if (!refreshed.ok) return '';
    return conversationId;
  },

  sendMessage: (conversationId, text) => {
    const trimmed = text.trim();
    if (!get().sessionUserId || !trimmed) return fail('common.error');
    return rpcAction('send_message', { p_conversation_id: conversationId, p_text: trimmed.slice(0, 2000) }, 'msg.blocked');
  },

  markConversationRead: (conversationId) => rpcAction('mark_conversation_read', { p_conversation_id: conversationId }),
  blockInConversation: (conversationId, block) => rpcAction('set_conversation_block', { p_conversation_id: conversationId, p_blocked: block }),

  addReport: (p) => rpcAction('add_report', {
    p_target_type: p.targetType, p_target_id: p.targetId, p_reason: p.reason, p_details: p.details.trim(),
  }),
  resolveReport: (reportId, action, internalNote = '') => rpcAction('resolve_report', {
    p_report_id: reportId, p_action: action || null, p_internal_note: internalNote || null,
  }),
  dismissReport: (reportId, internalNote) => rpcAction('dismiss_report', { p_report_id: reportId, p_reason: internalNote ?? null }),
  assignReport: (reportId, staffUserId) => rpcAction('assign_report', { p_report_id: reportId, p_staff_user_id: staffUserId }),
  moderateReview: (reviewId, remove, reason) => rpcAction('moderate_review', {
    p_review_id: reviewId,
    p_action: remove ? 'hide_review' : 'restore_review',
    p_reason: reason?.trim() || (remove ? 'Review hidden by staff' : 'Review restored by staff'),
  }),
  setStaffRole: (userId, role, active) => rpcAction('set_staff_role', { p_user_id: userId, p_role: role, p_active: active }),

  applyModeration: (p) => {
    const durationMinutes = p.kind === 'timeout' ? p.durationMinutes ?? 0 : 0;
    if (p.kind === 'timeout' && durationMinutes <= 0) return fail('common.error');
    return rpcAction('apply_moderation', {
      p_user_id: p.userId, p_kind: p.kind, p_duration_minutes: durationMinutes,
      p_reason: p.reason, p_public_message: p.publicMessage || null,
      p_internal_note: p.internalNote || null, p_evidence: {},
    });
  },

  reverseRestriction: (restrictionId, reason, publicMessage, internalNote = '') => rpcAction('reverse_restriction', {
    p_restriction_id: restrictionId, p_reason: reason, p_public_message: publicMessage || null,
    p_internal_note: internalNote || null,
  }),

  submitAppeal: (actionId, statement) => {
    const userId = get().sessionUserId;
    const trimmed = statement.trim();
    if (!userId || !trimmed) return fail('common.required');
    if (trimmed.length > 3000) return fail('common.error');
    return rpcAction('submit_appeal', { p_action_id: actionId, p_statement: trimmed });
  },

  reviewAppeal: (appealId, decision, note, publicMessage, internalNote) => rpcAction('review_appeal', {
    p_appeal_id: appealId, p_status: decision,
    p_grant: decision === 'under_review' ? null : decision === 'granted', p_decision_note: note || null,
    p_public_message: publicMessage || null, p_internal_note: internalNote || null,
  }),

  toggleSavedDriver: (driverId) => {
    const userId = get().sessionUserId;
    if (!userId || userId === driverId) return fail('common.error');
    return runDirect(async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('saved_drivers').select('user_id,driver_id').eq('user_id', userId).eq('driver_id', driverId).maybeSingle();
      if (error) return failure(error);
      const result = data
        ? await sb.from('saved_drivers').delete().eq('user_id', userId).eq('driver_id', driverId)
        : await sb.from('saved_drivers').insert({ user_id: userId, driver_id: driverId });
      return result.error ? failure(result.error) : finishMutation();
    });
  },

  addTrustedContact: (name, phone) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    if (!name.trim() || !phone.trim()) return fail('common.required');
    return runDirect(async () => {
      const { error } = await requireSupabase().from('trusted_contacts').insert({ user_id: userId, name: name.trim(), phone: phone.trim() });
      return error ? failure(error) : finishMutation();
    });
  },

  removeTrustedContact: (id) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    return runDirect(async () => {
      const { error } = await requireSupabase().from('trusted_contacts').delete().eq('id', id).eq('user_id', userId);
      return error ? failure(error) : finishMutation();
    });
  },

  addRecentSearch: (q) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    return runDirect(async () => {
      const sb = requireSupabase();
      const { data, error } = await sb.from('recent_searches').insert({
        user_id: userId, from_city_id: q.fromCityId, to_city_id: q.toCityId, date: q.date, seats: q.seats,
      }).select('id').maybeSingle();
      if (error) return failure(error);
      const id = text(data?.id);
      if (!id) return fail('common.error');
      const duplicate = await sb.from('recent_searches').delete().eq('user_id', userId)
        .eq('from_city_id', q.fromCityId).eq('to_city_id', q.toCityId).eq('date', q.date).neq('id', id);
      if (duplicate.error) return failure(duplicate.error);
      const { data: rows, error: listError } = await sb.from('recent_searches').select('id').eq('user_id', userId).order('created_at', { ascending: false });
      if (listError) return failure(listError);
      const excess = (rows ?? []).slice(30).map((row: Row) => text(row.id)).filter(Boolean);
      if (excess.length) {
        const { error: trimError } = await sb.from('recent_searches').delete().eq('user_id', userId).in('id', excess);
        if (trimError) return failure(trimError);
      }
      return finishMutation();
    });
  },

  markNotificationRead: (id) => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    return runDirect(async () => {
      const { error } = await requireSupabase().from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId);
      return error ? failure(error) : finishMutation();
    });
  },

  markAllNotificationsRead: () => {
    const userId = get().sessionUserId;
    if (!userId) return fail('common.error');
    return runDirect(async () => {
      const { error } = await requireSupabase().from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
      return error ? failure(error) : finishMutation();
    });
  },

  suspendUser: async (userId, suspend) => {
    if (suspend) return get().applyModeration({
      userId, kind: 'ban', reason: 'Account suspended by staff', publicMessage: '', internalNote: '', durationMinutes: 0,
    });
    const restriction = get().restrictions.find((item) => item.userId === userId && item.active && item.kind !== 'warning');
    return restriction
      ? get().reverseRestriction(restriction.id, 'Account restriction reversed by staff', '', '')
      : ok;
  },

  addCity: (p) => {
    if (!p.nameFr.trim() || !p.nameAr.trim()) return fail('common.required');
    return rpcAction('add_city', {
      p_code: p.code, p_name_fr: p.nameFr.trim(), p_name_ar: p.nameAr.trim(),
      p_lat: p.lat, p_lon: p.lon, p_popular: p.popular,
    });
  },

  sendAnnouncement: (title, body) => {
    if (!title.trim() || !body.trim()) return fail('common.required');
    return rpcAction('send_announcement', {
      p_title_key: title.trim(), p_body_key: body.trim(), p_params: { text: `${title.trim()} — ${body.trim()}` },
    });
  },
}));

/** Audit a private document read before a caller mints a short-lived signed URL. */
export async function recordDocumentAccess(documentId: string, reason = ''): Promise<Result> {
  const context = currentMutationContext();
  const result = await callRpc('record_document_access', {
    p_document_id: documentId, p_reason: reason,
  }, 'common.error', context ?? undefined);
  return result.ok ? ok : fail(result.error);
}
