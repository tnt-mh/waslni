import type {
  Announcement, AppNotification, Booking, City, Conversation, DriverDocument,
  DriverVerification, Message, RecentSearch, Report, Review, Ride, RidePreferences,
  RideRequest, SavedDriver, TrustedContact, User, Vehicle,
} from './types';
import { CITIES } from './cities';
import { estimateDurationMin, haversineKm } from './utils';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_SALT = 'demo-salt';
export const DEMO_HASH = '04c88dccabe1af11dec1c135d49914ba6995bad0986964b43e09f410198a7615';

function at(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function plusMinutes(iso: string, min: number): string {
  return new Date(new Date(iso).getTime() + min * 60000).toISOString();
}

function rideDuration(fromId: string, toId: string): number {
  const from = CITIES.find((c) => c.id === fromId)!;
  const to = CITIES.find((c) => c.id === toId)!;
  return estimateDurationMin(haversineKm(from.lat, from.lon, to.lat, to.lon));
}

const prefs = (p: Partial<RidePreferences> = {}): RidePreferences => ({
  chatty: false, quiet: false, music: false, luggage: true,
  smokingAllowed: false, petsAllowed: false, ac: true, ...p,
});

function demoUser(p: Partial<User> & Pick<User, 'id' | 'fullName' | 'email'>): User {
  return {
    phone: null, passwordHash: DEMO_HASH, salt: DEMO_SALT, photoUrl: null,
    avatarHue: 230, dateOfBirth: '1995-06-15', gender: 'unspecified', language: 'fr',
    bio: '', role: 'user', mode: 'passenger', status: 'active',
    phoneVerified: false, emailVerified: true, atmosphere: [],
    createdAt: at(-120, 9), isDemo: true, ...p,
  };
}

const DOC_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'><rect width='480' height='300' rx='16' fill='#E8EEFF'/><rect x='24' y='24' width='432' height='252' rx='10' fill='white' stroke='#000080' stroke-opacity='0.25'/><text x='240' y='140' font-family='sans-serif' font-size='20' font-weight='bold' fill='#000080' text-anchor='middle'>DOCUMENT DE DÉMONSTRATION</text><text x='240' y='170' font-family='sans-serif' font-size='14' fill='#6B7280' text-anchor='middle'>Aucune donnée réelle — exemple fictif</text></svg>`,
)}`;

export interface SeedData {
  cities: City[];
  users: User[];
  vehicles: Vehicle[];
  documents: DriverDocument[];
  verifications: DriverVerification[];
  rides: Ride[];
  bookings: Booking[];
  rideRequests: RideRequest[];
  conversations: Conversation[];
  messages: Message[];
  reviews: Review[];
  reports: Report[];
  notifications: AppNotification[];
  trustedContacts: TrustedContact[];
  savedDrivers: SavedDriver[];
  announcements: Announcement[];
  recentSearches: RecentSearch[];
}

export function buildSeed(): SeedData {
  const users: User[] = [
    demoUser({ id: 'u-amina', fullName: 'Amina Tounsi', email: 'amina@demo.waslni.dz', phone: '+213550123456', phoneVerified: true, gender: 'female', avatarHue: 260, bio: 'Étudiante en médecine à Alger. Je voyage souvent vers Blida le week-end. Ponctuelle et souriante !', atmosphere: ['quiet', 'music'], mode: 'passenger' }),
    demoUser({ id: 'u-karim', fullName: 'Karim Benali', email: 'karim@demo.waslni.dz', phone: '+213661234567', phoneVerified: true, gender: 'male', avatarHue: 220, bio: 'Ingénieur à Alger, je fais la navette vers Blida chaque semaine. Conduite calme, musique douce et bonne humeur garantis.', atmosphere: ['chatty', 'music'], mode: 'driver', dateOfBirth: '1988-03-22' }),
    demoUser({ id: 'u-yacine', fullName: 'Yacine Meziane', email: 'yacine@demo.waslni.dz', phone: '+213770112233', phoneVerified: true, gender: 'male', avatarHue: 200, bio: 'Commercial entre Oran et Alger. Trajets réguliers sur l’autoroute Est-Ouest.', mode: 'driver', dateOfBirth: '1985-11-02' }),
    demoUser({ id: 'u-sara', fullName: 'Sara Hamidi', email: 'sara@demo.waslni.dz', phone: '+213551445566', phoneVerified: true, gender: 'female', avatarHue: 300, bio: 'Enseignante à Constantine. Je propose des trajets entre femmes vers Béjaïa et Alger.', atmosphere: ['quiet'], mode: 'driver', dateOfBirth: '1992-07-19' }),
    demoUser({ id: 'u-lina', fullName: 'Lina Cherif', email: 'lina@demo.waslni.dz', phone: '+213662778899', phoneVerified: true, gender: 'female', avatarHue: 330, bio: 'Je travaille à Alger et je rentre sur Tipaza. Trajets entre femmes, ambiance calme.', mode: 'driver', dateOfBirth: '1996-01-08' }),
    demoUser({ id: 'u-amine', fullName: 'Amine Bouzid', email: 'amine@demo.waslni.dz', phone: '+213773665544', phoneVerified: true, gender: 'male', avatarHue: 180, bio: 'De Béjaïa vers Alger chaque semaine. Bagages acceptés, arrêts possibles.', mode: 'driver', dateOfBirth: '1990-09-30' }),
    demoUser({ id: 'u-mohand', fullName: 'Mohand Ait Ali', email: 'mohand@demo.waslni.dz', phone: '+213554332211', phoneVerified: true, gender: 'male', avatarHue: 150, bio: 'Nouveau conducteur depuis Tizi Ouzou.', mode: 'driver', dateOfBirth: '1993-04-12' }),
    demoUser({ id: 'u-nassim', fullName: 'Nassim Kaci', email: 'nassim@demo.waslni.dz', phone: '+213665001122', phoneVerified: true, gender: 'male', avatarHue: 30, bio: 'Étudiant à Boumerdès.', mode: 'passenger' }),
    demoUser({ id: 'u-rym', fullName: 'Rym Belkacem', email: 'rym@demo.waslni.dz', phone: '+213556889900', phoneVerified: true, gender: 'female', avatarHue: 20, bio: 'Je voyage entre Constantine et Béjaïa pour le travail.', mode: 'passenger' }),
    demoUser({ id: 'u-admin', fullName: 'Admin Waslni', email: 'admin@waslni.dz', gender: 'unspecified', avatarHue: 230, role: 'admin', mode: 'passenger', bio: 'Compte administrateur de démonstration.', createdAt: at(-200, 9) }),
  ];

  const vehicles: Vehicle[] = [
    { id: 'v-karim', ownerId: 'u-karim', brand: 'Renault', model: 'Clio 4', color: 'Blanche', plate: '01234 116 16', year: 2019, seats: 3, isDemo: true },
    { id: 'v-yacine', ownerId: 'u-yacine', brand: 'Volkswagen', model: 'Golf 7', color: 'Grise', plate: '05678 115 31', year: 2018, seats: 3, isDemo: true },
    { id: 'v-sara', ownerId: 'u-sara', brand: 'Hyundai', model: 'i20', color: 'Bleue', plate: '09012 117 25', year: 2021, seats: 3, isDemo: true },
    { id: 'v-lina', ownerId: 'u-lina', brand: 'Toyota', model: 'Yaris', color: 'Rouge', plate: '03456 116 16', year: 2020, seats: 3, isDemo: true },
    { id: 'v-amine', ownerId: 'u-amine', brand: 'Peugeot', model: '208', color: 'Blanche', plate: '07890 114 06', year: 2017, seats: 3, isDemo: true },
    { id: 'v-mohand', ownerId: 'u-mohand', brand: 'Dacia', model: 'Logan', color: 'Beige', plate: '02468 113 15', year: 2016, seats: 3, isDemo: true },
  ];

  const documents: DriverDocument[] = [];
  const verifications: DriverVerification[] = [];
  const driverIds = ['u-karim', 'u-yacine', 'u-sara', 'u-lina', 'u-amine', 'u-mohand'];
  for (const userId of driverIds) {
    const docIds: string[] = [];
    for (const kind of ['id_card', 'license', 'registration', 'selfie'] as const) {
      const id = `doc-${userId}-${kind}`;
      docIds.push(id);
      documents.push({ id, userId, kind, imageDataUrl: DOC_PLACEHOLDER, fileName: `${kind}-demo.svg`, uploadedAt: at(-30, 10) });
    }
    const pending = userId === 'u-mohand';
    verifications.push({
      userId,
      status: pending ? 'pending' : 'verified',
      documentIds: docIds,
      submittedAt: at(pending ? -1 : -30, 10),
      reviewedAt: pending ? null : at(-28, 15),
      reason: null,
    });
  }

  function mkRide(p: Pick<Ride, 'id' | 'driverId' | 'vehicleId' | 'fromCityId' | 'toCityId' | 'departureAt' | 'seatsTotal' | 'pricePerSeat' | 'pickupPoint' | 'dropoffPoint'> & Partial<Ride>): Ride {
    const duration = rideDuration(p.fromCityId, p.toCityId);
    return {
      arrivalAt: plusMinutes(p.departureAt, duration), stops: [], preferences: prefs(),
      womenOnly: false, recurring: null, status: 'published', notes: '',
      createdAt: at(-2, 12), isDemo: true, ...p,
    };
  }

  const rides: Ride[] = [
    mkRide({ id: 'r1', driverId: 'u-karim', vehicleId: 'v-karim', fromCityId: 'w16', toCityId: 'w9', departureAt: at(1, 7, 30), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Gare routière du Caroubier, Alger', dropoffPoint: 'Place des Martyrs, Blida', preferences: prefs({ chatty: true, music: true }), notes: 'Départ ponctuel, merci d’arriver 10 minutes en avance.' }),
    mkRide({ id: 'r2', driverId: 'u-karim', vehicleId: 'v-karim', fromCityId: 'w16', toCityId: 'w35', departureAt: at(2, 8, 0), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Métro Hai El Badr, Alger', dropoffPoint: 'Cité universitaire, Boumerdès', preferences: prefs({ music: true }) }),
    mkRide({ id: 'r3', driverId: 'u-karim', vehicleId: 'v-karim', fromCityId: 'w16', toCityId: 'w9', departureAt: at(-3, 7, 30), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Gare routière du Caroubier, Alger', dropoffPoint: 'Place des Martyrs, Blida', status: 'completed', preferences: prefs({ chatty: true, music: true }) }),
    mkRide({ id: 'r4', driverId: 'u-yacine', vehicleId: 'v-yacine', fromCityId: 'w31', toCityId: 'w16', departureAt: at(2, 6, 0), seatsTotal: 3, pricePerSeat: 1200, pickupPoint: 'Gare routière d’Oran (USTO)', dropoffPoint: 'Gare routière du Caroubier, Alger', preferences: prefs({ quiet: true, music: false }), notes: 'Trajet calme sur l’autoroute, un arrêt pause café possible.' }),
    mkRide({ id: 'r5', driverId: 'u-yacine', vehicleId: 'v-yacine', fromCityId: 'w31', toCityId: 'w13', departureAt: at(2, 14, 0), seatsTotal: 3, pricePerSeat: 500, pickupPoint: 'Place Tahtaha, Oran', dropoffPoint: 'Centre-ville, Tlemcen', preferences: prefs({ chatty: true }) }),
    mkRide({ id: 'r6', driverId: 'u-sara', vehicleId: 'v-sara', fromCityId: 'w25', toCityId: 'w6', departureAt: at(2, 9, 0), seatsTotal: 3, pricePerSeat: 450, pickupPoint: 'Gare routière de Constantine', dropoffPoint: 'Place des Martyrs, Béjaïa', womenOnly: true, preferences: prefs({ quiet: true, music: true }) }),
    mkRide({ id: 'r7', driverId: 'u-sara', vehicleId: 'v-sara', fromCityId: 'w25', toCityId: 'w16', departureAt: at(4, 7, 0), seatsTotal: 3, pricePerSeat: 1100, pickupPoint: 'Gare routière de Constantine', dropoffPoint: 'Gare routière du Caroubier, Alger', womenOnly: true, preferences: prefs({ quiet: true }) }),
    mkRide({ id: 'r8', driverId: 'u-lina', vehicleId: 'v-lina', fromCityId: 'w16', toCityId: 'w42', departureAt: at(2, 8, 30), seatsTotal: 3, pricePerSeat: 300, pickupPoint: 'Métro Khelifa Boukhalfa, Alger', dropoffPoint: 'Port de Tipaza', womenOnly: true, preferences: prefs({ chatty: true, music: true }) }),
    mkRide({ id: 'r9', driverId: 'u-lina', vehicleId: 'v-lina', fromCityId: 'w16', toCityId: 'w35', departureAt: at(3, 17, 30), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Métro Hai El Badr, Alger', dropoffPoint: 'Centre-ville, Boumerdès', womenOnly: true, recurring: { frequency: 'weekly', daysOfWeek: [0, 1, 2, 3, 4], until: at(60, 17) }, preferences: prefs({ quiet: true }) }),
    mkRide({ id: 'r10', driverId: 'u-amine', vehicleId: 'v-amine', fromCityId: 'w6', toCityId: 'w16', departureAt: at(3, 6, 30), seatsTotal: 3, pricePerSeat: 900, pickupPoint: 'Gare routière de Béjaïa', dropoffPoint: 'Gare routière du Caroubier, Alger', stops: [{ cityId: 'w10', label: 'Aire de repos de Bouira' }], preferences: prefs({ luggage: true, petsAllowed: true }), notes: 'Grand coffre, bagages volumineux acceptés.' }),
    mkRide({ id: 'r11', driverId: 'u-amine', vehicleId: 'v-amine', fromCityId: 'w6', toCityId: 'w15', departureAt: at(5, 10, 0), seatsTotal: 3, pricePerSeat: 400, pickupPoint: 'Place des Martyrs, Béjaïa', dropoffPoint: 'Nouvelle ville, Tizi Ouzou', preferences: prefs({ chatty: true, music: true }) }),
    mkRide({ id: 'r12', driverId: 'u-karim', vehicleId: 'v-karim', fromCityId: 'w16', toCityId: 'w42', departureAt: at(4, 9, 0), seatsTotal: 3, pricePerSeat: 300, pickupPoint: 'Gare routière du Caroubier, Alger', dropoffPoint: 'Centre-ville, Tipaza', recurring: { frequency: 'daily', daysOfWeek: [], until: at(30, 9) }, preferences: prefs({ music: true, luggage: true }) }),
    mkRide({ id: 'r13', driverId: 'u-yacine', vehicleId: 'v-yacine', fromCityId: 'w31', toCityId: 'w27', departureAt: at(1, 16, 0), seatsTotal: 3, pricePerSeat: 350, pickupPoint: 'Place Tahtaha, Oran', dropoffPoint: 'Centre-ville, Mostaganem', preferences: prefs({ chatty: true, music: true }) }),
    mkRide({ id: 'r14', driverId: 'u-lina', vehicleId: 'v-lina', fromCityId: 'w16', toCityId: 'w9', departureAt: at(1, 18, 0), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Métro Khelifa Boukhalfa, Alger', dropoffPoint: 'Centre-ville, Blida', womenOnly: true, preferences: prefs({ quiet: true, music: true }) }),
    mkRide({ id: 'r15', driverId: 'u-karim', vehicleId: 'v-karim', fromCityId: 'w16', toCityId: 'w35', departureAt: at(-5, 8, 0), seatsTotal: 3, pricePerSeat: 200, pickupPoint: 'Métro Hai El Badr, Alger', dropoffPoint: 'Cité universitaire, Boumerdès', status: 'completed' }),
    mkRide({ id: 'r16', driverId: 'u-yacine', vehicleId: 'v-yacine', fromCityId: 'w31', toCityId: 'w16', departureAt: at(-6, 6, 0), seatsTotal: 3, pricePerSeat: 1200, pickupPoint: 'Gare routière d’Oran (USTO)', dropoffPoint: 'Gare routière du Caroubier, Alger', status: 'completed', preferences: prefs({ quiet: true }) }),
    mkRide({ id: 'r17', driverId: 'u-yacine', vehicleId: 'v-yacine', fromCityId: 'w31', toCityId: 'w13', departureAt: at(-8, 14, 0), seatsTotal: 3, pricePerSeat: 500, pickupPoint: 'Place Tahtaha, Oran', dropoffPoint: 'Centre-ville, Tlemcen', status: 'completed' }),
  ];

  function mkBooking(p: Pick<Booking, 'id' | 'rideId' | 'passengerId' | 'seats' | 'status'> & Partial<Booking>): Booking {
    return {
      pin: null, createdAt: at(-2, 10), decidedAt: null, boardedAt: null, completedAt: null,
      passengerPaid: false, driverReceived: false, paidAt: null, receivedAt: null,
      cancelledBy: null, isDemo: true, ...p,
    };
  }

  const bookings: Booking[] = [
    mkBooking({ id: 'b1', rideId: 'r1', passengerId: 'u-amina', seats: 1, status: 'confirmed', pin: '4821', decidedAt: at(-1, 11), createdAt: at(-1, 9) }),
    mkBooking({ id: 'b2', rideId: 'r2', passengerId: 'u-nassim', seats: 2, status: 'pending', createdAt: at(0, 8) }),
    mkBooking({ id: 'b3', rideId: 'r3', passengerId: 'u-amina', seats: 1, status: 'completed', pin: '1097', decidedAt: at(-4, 10), boardedAt: at(-3, 7, 35), completedAt: at(-3, 8, 25), passengerPaid: true, driverReceived: true, paidAt: at(-3, 8, 30), receivedAt: at(-3, 8, 32), createdAt: at(-5, 14) }),
    mkBooking({ id: 'b4', rideId: 'r6', passengerId: 'u-rym', seats: 1, status: 'confirmed', pin: '7315', decidedAt: at(-1, 16), createdAt: at(-1, 12) }),
    mkBooking({ id: 'b5', rideId: 'r4', passengerId: 'u-nassim', seats: 2, status: 'confirmed', pin: '5902', decidedAt: at(-1, 18), createdAt: at(-1, 15) }),
    mkBooking({ id: 'b6', rideId: 'r8', passengerId: 'u-rym', seats: 1, status: 'cancelled', cancelledBy: 'u-rym', createdAt: at(-2, 9) }),
    mkBooking({ id: 'b7', rideId: 'r5', passengerId: 'u-nassim', seats: 1, status: 'pending', createdAt: at(0, 9) }),
    mkBooking({ id: 'b9', rideId: 'r15', passengerId: 'u-nassim', seats: 1, status: 'completed', pin: '2244', decidedAt: at(-6, 10), boardedAt: at(-5, 8, 5), completedAt: at(-5, 8, 55), passengerPaid: true, driverReceived: true, paidAt: at(-5, 9), receivedAt: at(-5, 9, 5), createdAt: at(-7, 12) }),
    mkBooking({ id: 'b10', rideId: 'r16', passengerId: 'u-rym', seats: 1, status: 'completed', pin: '8130', decidedAt: at(-7, 10), boardedAt: at(-6, 6, 5), completedAt: at(-6, 10, 30), passengerPaid: true, driverReceived: true, paidAt: at(-6, 10, 35), receivedAt: at(-6, 10, 40), createdAt: at(-8, 12) }),
    mkBooking({ id: 'b11', rideId: 'r17', passengerId: 'u-amina', seats: 1, status: 'completed', pin: '6675', decidedAt: at(-9, 10), boardedAt: at(-8, 14, 5), completedAt: at(-8, 16, 0), passengerPaid: true, driverReceived: true, paidAt: at(-8, 16, 5), receivedAt: at(-8, 16, 10), createdAt: at(-10, 12) }),
  ];

  const conversations: Conversation[] = [
    { id: 'c1', participantIds: ['u-amina', 'u-karim'], rideId: 'r1', bookingId: 'b1', blockedBy: null, createdAt: at(-1, 11) },
    { id: 'c2', participantIds: ['u-nassim', 'u-karim'], rideId: 'r2', bookingId: 'b2', blockedBy: null, createdAt: at(0, 8) },
    { id: 'c3', participantIds: ['u-rym', 'u-sara'], rideId: 'r6', bookingId: 'b4', blockedBy: null, createdAt: at(-1, 16) },
  ];

  const messages: Message[] = [
    { id: 'm1', conversationId: 'c1', senderId: 'u-amina', text: 'Bonjour ! Je serai à la gare du Caroubier à 7h15.', createdAt: at(-1, 11, 5), readBy: ['u-amina', 'u-karim'], isDemo: true },
    { id: 'm2', conversationId: 'c1', senderId: 'u-karim', text: 'Parfait, je serai là. Clio blanche, plaque 01234 116 16.', createdAt: at(-1, 11, 12), readBy: ['u-amina', 'u-karim'], isDemo: true },
    { id: 'm3', conversationId: 'c1', senderId: 'u-amina', text: 'Merci, à demain !', createdAt: at(-1, 11, 15), readBy: ['u-amina'], isDemo: true },
    { id: 'm4', conversationId: 'c2', senderId: 'u-nassim', text: 'Bonjour, est-ce que vous pouvez déposer à la cité universitaire ?', createdAt: at(0, 8, 5), readBy: ['u-nassim'], isDemo: true },
    { id: 'm5', conversationId: 'c2', senderId: 'u-karim', text: 'Oui, pas de souci. J’attends votre confirmation de réservation.', createdAt: at(0, 8, 20), readBy: ['u-karim'], isDemo: true },
    { id: 'm6', conversationId: 'c3', senderId: 'u-rym', text: 'Bonjour Sara, le départ est bien de la gare routière ?', createdAt: at(-1, 16, 10), readBy: ['u-rym', 'u-sara'], isDemo: true },
    { id: 'm7', conversationId: 'c3', senderId: 'u-sara', text: 'Oui, devant l’entrée principale. À bientôt !', createdAt: at(-1, 16, 25), readBy: ['u-sara'], isDemo: true },
  ];

  const reviews: Review[] = [
    { id: 'rv1', bookingId: 'b3', rideId: 'r3', authorId: 'u-amina', targetId: 'u-karim', stars: 5, categories: { driving: 5, punctuality: 5, communication: 5, respect: 5, vehicle: 5 }, text: 'Trajet très agréable, conduite prudente et ponctualité parfaite. Je recommande !', createdAt: at(-3, 9), status: 'visible', isDemo: true },
    { id: 'rv2', bookingId: 'b3', rideId: 'r3', authorId: 'u-karim', targetId: 'u-amina', stars: 5, categories: null, text: 'Passagère ponctuelle et respectueuse.', createdAt: at(-3, 9, 30), status: 'visible', isDemo: true },
    { id: 'rv3', bookingId: 'b9', rideId: 'r15', authorId: 'u-nassim', targetId: 'u-karim', stars: 5, categories: { driving: 5, punctuality: 5, communication: 4, respect: 5, vehicle: 4 }, text: 'Très bon trajet vers Boumerdès, conducteur sérieux.', createdAt: at(-5, 10), status: 'visible', isDemo: true },
    { id: 'rv4', bookingId: 'b9', rideId: 'r15', authorId: 'u-karim', targetId: 'u-nassim', stars: 5, categories: null, text: 'Passager sympathique, tout s’est bien passé.', createdAt: at(-5, 10, 30), status: 'visible', isDemo: true },
    { id: 'rv5', bookingId: 'b10', rideId: 'r16', authorId: 'u-rym', targetId: 'u-yacine', stars: 4, categories: { driving: 5, punctuality: 4, communication: 4, respect: 5, vehicle: 4 }, text: 'Bon trajet, quelques minutes de retard au départ mais conduite très sûre.', createdAt: at(-6, 12), status: 'visible', isDemo: true },
    { id: 'rv6', bookingId: 'b10', rideId: 'r16', authorId: 'u-yacine', targetId: 'u-rym', stars: 5, categories: null, text: 'Passagère ponctuelle, merci !', createdAt: at(-6, 12, 30), status: 'visible', isDemo: true },
    { id: 'rv7', bookingId: 'b11', rideId: 'r17', authorId: 'u-amina', targetId: 'u-yacine', stars: 5, categories: { driving: 5, punctuality: 5, communication: 5, respect: 5, vehicle: 5 }, text: 'Excellent conducteur, voiture propre et trajet tranquille.', createdAt: at(-8, 18), status: 'visible', isDemo: true },
  ];

  const rideRequests: RideRequest[] = [
    { id: 'rq1', passengerId: 'u-rym', fromCityId: 'w16', toCityId: 'w42', date: at(4, 9).slice(0, 10), timePreference: 'morning', seats: 1, maxBudget: 350, womenOnly: false, status: 'open', createdAt: at(0, 7), isDemo: true },
    { id: 'rq2', passengerId: 'u-nassim', fromCityId: 'w25', toCityId: 'w6', date: at(2, 9).slice(0, 10), timePreference: 'flexible', seats: 2, maxBudget: 500, womenOnly: false, status: 'open', createdAt: at(-1, 20), isDemo: true },
  ];

  const notifications: AppNotification[] = [
    { id: 'n1', userId: 'u-karim', type: 'booking_request', title: 'Nouvelle demande de réservation', body: 'Nassim Kaci souhaite réserver 2 places sur Alger → Boumerdès.', route: '/driver/ride/r2', read: false, createdAt: at(0, 8) },
    { id: 'n2', userId: 'u-yacine', type: 'booking_request', title: 'Nouvelle demande de réservation', body: 'Nassim Kaci souhaite réserver 1 place sur Oran → Tlemcen.', route: '/driver/ride/r5', read: false, createdAt: at(0, 9) },
    { id: 'n3', userId: 'u-amina', type: 'booking_accepted', title: 'Réservation confirmée 🎉', body: 'Votre place sur Alger → Blida est confirmée. Code PIN disponible.', route: '/reservation/b1', read: true, createdAt: at(-1, 11) },
    { id: 'n4', userId: 'u-amina', type: 'ride_reminder', title: 'Rappel de trajet', body: 'Votre trajet Alger → Blida commence demain à 07:30.', route: '/reservation/b1', read: false, createdAt: at(0, 7) },
    { id: 'n5', userId: 'u-karim', type: 'payment', title: 'Paiement confirmé', body: 'Le paiement de 200 DA pour Alger → Blida est confirmé.', route: '/driver/ride/r3', read: true, createdAt: at(-3, 8, 32) },
    { id: 'n6', userId: 'u-rym', type: 'booking_accepted', title: 'Réservation confirmée 🎉', body: 'Votre place sur Constantine → Béjaïa est confirmée.', route: '/reservation/b4', read: true, createdAt: at(-1, 16) },
  ];

  const trustedContacts: TrustedContact[] = [
    { id: 'tc1', userId: 'u-amina', name: 'Nadia (sœur)', phone: '+213661234567' },
  ];

  const savedDrivers: SavedDriver[] = [
    { userId: 'u-amina', driverId: 'u-karim', createdAt: at(-3, 10) },
  ];

  const reports: Report[] = [
    { id: 'rep1', reporterId: 'u-rym', targetType: 'user', targetId: 'u-amine', reason: 'no_show', details: 'Le conducteur ne s’est pas présenté au point de rendez-vous lors d’un trajet précédent.', status: 'open', action: null, createdAt: at(-2, 14), resolvedAt: null },
  ];

  const announcements: Announcement[] = [
    { id: 'an1', title: 'Bienvenue sur Waslni 🎉', body: 'Le covoiturage rendu facile, partout en Algérie. Vérifiez votre profil et publiez votre premier trajet !', createdAt: at(-10, 9) },
  ];

  const recentSearches: RecentSearch[] = [
    { id: 'rs1', userId: 'u-amina', fromCityId: 'w16', toCityId: 'w9', date: at(1, 7).slice(0, 10), seats: 1, createdAt: at(-1, 9) },
    { id: 'rs2', userId: 'u-amina', fromCityId: 'w16', toCityId: 'w31', date: at(2, 6).slice(0, 10), seats: 1, createdAt: at(-2, 18) },
  ];

  return {
    cities: CITIES, users, vehicles, documents, verifications, rides, bookings,
    rideRequests, conversations, messages, reviews, reports, notifications,
    trustedContacts, savedDrivers, announcements, recentSearches,
  };
}