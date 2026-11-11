import type { City } from './types';

const W: Array<[number, string, string, number, number, boolean?]> = [
  [1, 'Adrar', 'أدرار', 27.87, -0.29],
  [2, 'Chlef', 'الشلف', 36.17, 1.33],
  [3, 'Laghouat', 'الأغواط', 33.8, 2.86],
  [4, 'Oum El Bouaghi', 'أم البواقي', 35.87, 7.11],
  [5, 'Batna', 'باتنة', 35.55, 6.17],
  [6, 'Béjaïa', 'بجاية', 36.75, 5.07, true],
  [7, 'Biskra', 'بسكرة', 34.85, 5.73],
  [8, 'Béchar', 'بشار', 31.62, -2.22],
  [9, 'Blida', 'البليدة', 36.47, 2.83, true],
  [10, 'Bouira', 'البويرة', 36.37, 3.9],
  [11, 'Tamanrasset', 'تمنراست', 22.79, 5.53],
  [12, 'Tébessa', 'تبسة', 35.4, 8.12],
  [13, 'Tlemcen', 'تلمسان', 34.88, -1.31],
  [14, 'Tiaret', 'تيارت', 35.37, 1.32],
  [15, 'Tizi Ouzou', 'تيزي وزو', 36.72, 4.05, true],
  [16, 'Alger', 'الجزائر', 36.75, 3.06, true],
  [17, 'Djelfa', 'الجلفة', 34.67, 3.25],
  [18, 'Jijel', 'جيجل', 36.82, 5.77],
  [19, 'Sétif', 'سطيف', 36.19, 5.41],
  [20, 'Saïda', 'سعيدة', 34.83, 0.15],
  [21, 'Skikda', 'سكيكدة', 36.88, 6.91],
  [22, 'Sidi Bel Abbès', 'سيدي بلعباس', 35.19, -0.63],
  [23, 'Annaba', 'عنابة', 36.9, 7.77],
  [24, 'Guelma', 'قالمة', 36.46, 7.43],
  [25, 'Constantine', 'قسنطينة', 36.37, 6.61, true],
  [26, 'Médéa', 'المدية', 36.26, 2.75],
  [27, 'Mostaganem', 'مستغانم', 35.93, 0.09],
  [28, "M'Sila", 'المسيلة', 35.7, 4.54],
  [29, 'Mascara', 'معسكر', 35.4, 0.14],
  [30, 'Ouargla', 'ورقلة', 31.95, 5.32],
  [31, 'Oran', 'وهران', 35.7, -0.63, true],
  [32, 'El Bayadh', 'البيض', 33.68, 1.02],
  [33, 'Illizi', 'إليزي', 26.48, 8.47],
  [34, 'Bordj Bou Arreridj', 'برج بوعريريج', 36.07, 4.76],
  [35, 'Boumerdès', 'بومرداس', 36.76, 3.47, true],
  [36, 'El Tarf', 'الطارف', 36.77, 8.31],
  [37, 'Tindouf', 'تندوف', 27.67, -8.15],
  [38, 'Tissemsilt', 'تيسمسيلت', 35.61, 1.81],
  [39, 'El Oued', 'الوادي', 33.37, 6.86],
  [40, 'Khenchela', 'خنشلة', 35.44, 7.14],
  [41, 'Souk Ahras', 'سوق أهراس', 36.29, 7.95],
  [42, 'Tipaza', 'تيبازة', 36.59, 2.45, true],
  [43, 'Mila', 'ميلة', 36.45, 6.26],
  [44, 'Aïn Defla', 'عين الدفلى', 36.26, 1.97],
  [45, 'Naâma', 'النعامة', 33.27, -0.31],
  [46, 'Aïn Témouchent', 'عين تموشنت', 35.3, -1.14],
  [47, 'Ghardaïa', 'غرداية', 32.49, 3.67],
  [48, 'Relizane', 'غليزان', 35.74, 0.56],
  [49, "El M'Ghair", 'المغير', 33.95, 5.92],
  [50, 'El Meniaa', 'المنيعة', 30.58, 2.88],
  [51, 'Ouled Djellal', 'أولاد جلال', 34.43, 4.97],
  [52, 'Bordj Baji Mokhtar', 'برج باجي مختار', 21.33, 0.95],
  [53, 'Béni Abbès', 'بني عباس', 30.13, -2.17],
  [54, 'Timimoun', 'تيميمون', 29.26, 0.24],
  [55, 'Touggourt', 'تقرت', 33.1, 6.06],
  [56, 'Djanet', 'جانت', 24.55, 9.48],
  [57, 'In Salah', 'عين صالح', 27.19, 2.48],
  [58, 'In Guezzam', 'عين قزام', 19.57, 5.77],
];

export const CITIES: City[] = W.map(([code, nameFr, nameAr, lat, lon, popular]) => ({
  id: `w${code}`,
  code,
  nameFr,
  nameAr,
  lat,
  lon,
  popular: popular === true,
}));

export function cityById(cities: City[], id: string): City | undefined {
  return cities.find((c) => c.id === id);
}

export function cityName(city: City | undefined, lang: 'fr' | 'ar' | 'en'): string {
  if (!city) return '—';
  return lang === 'ar' ? city.nameAr : city.nameFr;
}

export const POPULAR_ROUTES: Array<[string, string]> = [
  ['w16', 'w9'],
  ['w16', 'w35'],
  ['w16', 'w42'],
  ['w16', 'w15'],
  ['w16', 'w31'],
  ['w25', 'w6'],
  ['w31', 'w13'],
  ['w16', 'w19'],
];