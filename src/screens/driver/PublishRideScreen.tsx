import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Car, Check, ChevronRight, MapPin, Plus, Trash2 } from 'lucide-react';
import { Screen, EmptyState, useToast } from '../../components/feedback';
import { ScreenHeader } from '../../components/AppShell';
import { Badge, Banner, Button, Card, Field, Input, Segmented, StepsDots, Stepper, SuccessCheck, Textarea, Toggle } from '../../components/ui';
import { CityPicker } from '../../components/CityPicker';
import { useStore, currentUser, getVerification } from '../../lib/store';
import { cityName } from '../../lib/cities';
import { estimateDurationMin, estimateSoloCost, formatPrice, formatTime, haversineKm, todayInputValue, LOCALES } from '../../lib/utils';
import { useI18n } from '../../i18n';
import type { RidePreferences, RideStop } from '../../lib/types';

const DEFAULT_PREFS: RidePreferences = { chatty: true, quiet: false, music: true, luggage: true, smokingAllowed: false, petsAllowed: false, ac: true };
const STEP_COUNT = 10;

function dateInputValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function timeInputValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function PublishRideScreen() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useStore(currentUser)!;
  const cities = useStore((s) => s.cities);
  const vehicles = useStore(useShallow((s) => s.vehicles.filter((v) => v.ownerId === me.id)));
  const verification = useStore((s) => getVerification(s, me.id));
  const publishRide = useStore((s) => s.publishRide);
  const updateRide = useStore((s) => s.updateRide);

  const editId = params.get('edit');
  const editRide = useStore((s) => (editId ? s.rides.find((r) => r.id === editId && r.driverId === me.id) : undefined));
  const hasConfirmed = useStore((s) => (editRide ? s.bookings.some((b) => b.rideId === editRide.id && b.status === 'confirmed') : false));

  const prefillFrom = params.get('from');
  const prefillTo = params.get('to');
  const [step, setStep] = useState(0);
  const [fromCityId, setFromCityId] = useState(editRide?.fromCityId ?? (cities.some((c) => c.id === prefillFrom) ? prefillFrom! : ''));
  const [toCityId, setToCityId] = useState(editRide?.toCityId ?? (cities.some((c) => c.id === prefillTo) ? prefillTo! : ''));
  const [date, setDate] = useState(editRide ? dateInputValue(editRide.departureAt) : todayInputValue());
  const [time, setTime] = useState(editRide ? timeInputValue(editRide.departureAt) : '08:00');
  const [recurringOn, setRecurringOn] = useState(!!editRide?.recurring);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'custom'>(editRide?.recurring?.frequency ?? 'weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(editRide?.recurring?.daysOfWeek ?? []);
  const [until, setUntil] = useState(editRide?.recurring?.until ? dateInputValue(editRide.recurring.until) : '');
  const [seats, setSeats] = useState(editRide?.seatsTotal ?? 3);
  const [vehicleId, setVehicleId] = useState(editRide?.vehicleId ?? vehicles[0]?.id ?? '');
  const [price, setPrice] = useState(editRide ? String(editRide.pricePerSeat) : '');
  const [pickup, setPickup] = useState(editRide?.pickupPoint ?? '');
  const [dropoff, setDropoff] = useState(editRide?.dropoffPoint ?? '');
  const [stops, setStops] = useState<RideStop[]>(editRide?.stops ?? []);
  const [prefs, setPrefs] = useState<RidePreferences>(editRide?.preferences ?? DEFAULT_PREFS);
  const [womenOnly, setWomenOnly] = useState(editRide?.womenOnly ?? false);
  const [notes, setNotes] = useState(editRide?.notes ?? '');
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ target: 'from' } | { target: 'to' } | { target: 'stop'; index: number } | null>(null);

  const fromCity = cities.find((c) => c.id === fromCityId);
  const toCity = cities.find((c) => c.id === toCityId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const km = fromCity && toCity ? haversineKm(fromCity.lat, fromCity.lon, toCity.lat, toCity.lon) : 0;
  const durationMin = estimateDurationMin(km);
  const soloCost = estimateSoloCost(km);
  const departureAt = date && time ? new Date(`${date}T${time}:00`).toISOString() : null;
  const arrivalAt = departureAt ? new Date(new Date(departureAt).getTime() + durationMin * 60000).toISOString() : null;

  const setPref = (key: keyof RidePreferences, value: boolean) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      if (key === 'chatty' && value) next.quiet = false;
      if (key === 'quiet' && value) next.chatty = false;
      return next;
    });
  };

  const validate = (s: number): string => {
    switch (s) {
      case 0: return fromCityId ? '' : 'common.required';
      case 1:
        if (!toCityId) return 'common.required';
        return toCityId === fromCityId ? 'publish.sameCity' : '';
      case 2:
        if (!date || !time || !departureAt) return 'common.required';
        if (new Date(departureAt).getTime() <= Date.now()) return 'publish.pastTime';
        if (recurringOn && frequency !== 'daily' && daysOfWeek.length === 0) return 'common.required';
        return '';
      case 4: return vehicleId ? '' : 'publish.noVehicle';
      case 5: {
        const n = Number(price);
        if (!price.trim() || !Number.isFinite(n) || n < 50) return 'publish.invalidPrice';
        if (km > 0 && n > soloCost) return 'publish.priceTooHigh';
        return '';
      }
      case 6: return pickup.trim() && dropoff.trim() ? '' : 'publish.missingPoints';
      case 7: return stops.every((st) => st.cityId && st.label.trim()) ? '' : 'common.required';
      default: return '';
    }
  };

  const next = () => {
    const err = validate(step);
    if (err) return setError(t(err));
    setError('');
    setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
    window.scrollTo(0, 0);
  };
  const back = () => { setError(''); setStep((s) => Math.max(0, s - 1)); window.scrollTo(0, 0); };

  const recurringRule = recurringOn
    ? { frequency, daysOfWeek: frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : daysOfWeek, until: until || null }
    : null;

  const submit = () => {
    if (!departureAt || !arrivalAt) return;
    const fields = {
      vehicleId, fromCityId, toCityId, departureAt, seatsTotal: seats,
      pricePerSeat: Number(price), pickupPoint: pickup.trim(), dropoffPoint: dropoff.trim(),
      stops, preferences: prefs, womenOnly, recurring: recurringRule, notes: notes.trim(),
    };
    if (editRide) {
      const res = updateRide(editRide.id, { ...fields, arrivalAt });
      if (!res.ok) return toast(t(res.error), 'error');
      toast(t('publish.changesSaved'), 'success');
      navigate(`/driver/ride/${editRide.id}`);
      return;
    }
    const res = publishRide({ ...fields, durationMin });
    if (!res.ok) return toast(t(res.error), 'error');
    setPublishedId(res.rideId ?? null);
    window.scrollTo(0, 0);
  };

  const saveRestricted = () => {
    if (!editRide) return;
    const res = updateRide(editRide.id, { preferences: prefs, notes: notes.trim() });
    if (!res.ok) return toast(t(res.error), 'error');
    toast(t('publish.changesSaved'), 'success');
    navigate(`/driver/ride/${editRide.id}`);
  };

  if (verification.status !== 'verified') {
    return (
      <Screen noNav>
        <ScreenHeader title={t('publish.title')} />
        <div className="screen-body col gap-16">
          <Banner kind="warning">{t('driver.verificationNeededText')}</Banner>
          <Button block onClick={() => navigate('/driver/verification')}>{t('driver.verificationNeeded')}</Button>
        </div>
      </Screen>
    );
  }

  if (editId && !editRide) {
    return (
      <Screen noNav>
        <ScreenHeader title={t('publish.editTitle')} />
        <div className="screen-body"><EmptyState icon={<Car size={28} />} title={t('common.error')} /></div>
      </Screen>
    );
  }

  if (publishedId) {
    return (
      <Screen noNav>
        <div className="screen-body col center gap-16" style={{ paddingTop: 64, textAlign: 'center' }}>
          <SuccessCheck />
          <h1 className="h1">{t('publish.published')}</h1>
          <p className="subtitle">{t('publish.publishedText')}</p>
          <Button block size="lg" onClick={() => navigate(`/driver/ride/${publishedId}`)}>{t('publish.viewRide')}</Button>
          <Button block variant="ghost" onClick={() => navigate('/driver')}>{t('nav.dashboard')}</Button>
        </div>
      </Screen>
    );
  }

  const prefToggles = (
    <div className="col">
      <Toggle on={prefs.chatty} onChange={(v) => setPref('chatty', v)} label={t('ride.pref.chatty')} />
      <Toggle on={prefs.quiet} onChange={(v) => setPref('quiet', v)} label={t('ride.pref.quiet')} />
      <Toggle on={prefs.music} onChange={(v) => setPref('music', v)} label={t('ride.pref.music')} />
      <Toggle on={prefs.luggage} onChange={(v) => setPref('luggage', v)} label={t('ride.pref.luggage')} />
      <Toggle on={prefs.smokingAllowed} onChange={(v) => setPref('smokingAllowed', v)} label={t('ride.pref.smoking')} />
      <Toggle on={prefs.petsAllowed} onChange={(v) => setPref('petsAllowed', v)} label={t('ride.pref.pets')} />
      <Toggle on={prefs.ac} onChange={(v) => setPref('ac', v)} label={t('ride.pref.ac')} />
    </div>
  );

  if (editRide && hasConfirmed) {
    return (
      <Screen noNav>
        <ScreenHeader title={t('publish.editTitle')} />
        <div className="screen-body col gap-16">
          <Banner kind="warning">{t('publish.hasBookings')}</Banner>
          <span className="label">{t('publish.atmosphere')}</span>
          {prefToggles}
          <Field label={t('publish.notes')}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('publish.notesPlaceholder')} rows={3} />
          </Field>
          <Button block size="lg" onClick={saveRestricted}>{t('publish.saveChanges')}</Button>
        </div>
      </Screen>
    );
  }

  const stepTitle = t(`publish.step${step + 1}`);

  return (
    <Screen noNav>
      <ScreenHeader title={editRide ? t('publish.editTitle') : t('publish.title')} />
      <div className="screen-body col gap-16">
        <div className="col gap-8">
          <StepsDots total={STEP_COUNT} current={step} />
          <span className="tiny muted">{t('publish.step', { n: step + 1, total: STEP_COUNT })}</span>
          <h2 className="h2">{stepTitle}</h2>
        </div>

        {step === 0 && (
          <Card clickable className="row between" onClick={() => setPicker({ target: 'from' })}>
            <span className="row gap-8"><MapPin size={18} color="var(--navy)" /><span className="bold">{fromCity ? cityName(fromCity, lang) : t('publish.departureCity')}</span></span>
            <span className="chevron"><ChevronRight size={18} /></span>
          </Card>
        )}

        {step === 1 && (
          <Card clickable className="row between" onClick={() => setPicker({ target: 'to' })}>
            <span className="row gap-8"><MapPin size={18} color="var(--navy)" /><span className="bold">{toCity ? cityName(toCity, lang) : t('publish.destinationCity')}</span></span>
            <span className="chevron"><ChevronRight size={18} /></span>
          </Card>
        )}

        {step === 2 && (
          <>
            <div className="row gap-12">
              <div className="grow"><Field label={t('common.date')} required><Input type="date" value={date} min={todayInputValue()} onChange={(e) => setDate(e.target.value)} /></Field></div>
              <div className="grow"><Field label={t('publish.departureTime')} required><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
            </div>
            {arrivalAt && km > 0 && (
              <Banner kind="info">{t('publish.arrivalEstimate')} : {formatTime(arrivalAt, lang)} · ~{Math.round(km)} {t('common.km')} · {durationMin} {t('common.min')}</Banner>
            )}
            <Toggle on={recurringOn} onChange={setRecurringOn} label={t('driver.recurring')} />
            {recurringOn && (
              <div className="col gap-12">
                <Segmented
                  value={frequency}
                  onChange={setFrequency}
                  options={[
                    { value: 'daily', label: t('driver.recurringDaily') },
                    { value: 'weekly', label: t('driver.recurringWeekly') },
                    { value: 'custom', label: t('driver.recurringCustom') },
                  ]}
                />
                {frequency !== 'daily' && (
                  <Field label={t('driver.recurringDays')}>
                    <div className="row wrap gap-8">
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`chip ${daysOfWeek.includes(d) ? 'active' : ''}`}
                          onClick={() => setDaysOfWeek((days) => days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}
                        >
                          {new Date(2024, 0, 7 + d).toLocaleDateString(LOCALES[lang], { weekday: 'short' })}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label={`${t('driver.recurringUntil')} (${t('common.optional')})`}>
                  <Input type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
                </Field>
                <Banner kind="info">{t('driver.recurringNote')}</Banner>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <Card className="col gap-16">
            <p className="subtitle">{t('publish.seatsHint')}</p>
            <div className="row center"><Stepper value={seats} min={1} max={7} onChange={setSeats} /></div>
          </Card>
        )}

        {step === 4 && (
          vehicles.length === 0 ? (
            <div className="col gap-12">
              <Banner kind="warning">{t('publish.noVehicle')}</Banner>
              <Button block variant="outline" onClick={() => navigate('/driver/verification')}>{t('verify.title')}</Button>
            </div>
          ) : (
            <div className="col gap-8">
              <p className="subtitle">{t('publish.selectVehicle')}</p>
              {vehicles.map((v) => (
                <Card key={v.id} clickable className="row between" onClick={() => { setVehicleId(v.id); setSeats((s) => Math.min(s, v.seats)); }}>
                  <span className="row gap-12">
                    <Car size={20} color="var(--navy)" />
                    <span className="col" style={{ gap: 2 }}>
                      <span className="small bold">{v.brand} {v.model} · {v.color}</span>
                      <span className="tiny muted">{v.plate} · {v.seats} {t('common.seats')}</span>
                    </span>
                  </span>
                  {vehicleId === v.id && <Check size={20} color="var(--success)" />}
                </Card>
              ))}
            </div>
          )
        )}

        {step === 5 && (
          <>
            <Field label={`${t('common.price')} (${t('common.da')})`} required hint={t('publish.priceHint')}>
              <Input type="number" inputMode="numeric" min={50} step={50} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="200" />
            </Field>
            {km > 0 && <Banner kind="info">{t('publish.priceEstimate', { amount: formatPrice(soloCost, lang) })}</Banner>}
            <Banner kind="warning">{t('driver.costSharingWarning')}</Banner>
          </>
        )}

        {step === 6 && (
          <>
            <Field label={t('publish.pickupPoint')} required>
              <Input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder={t('publish.pickupPlaceholder')} />
            </Field>
            <Field label={t('publish.dropoffPoint')} required>
              <Input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder={t('publish.dropoffPlaceholder')} />
            </Field>
          </>
        )}

        {step === 7 && (
          <div className="col gap-12">
            {stops.length === 0 && <p className="subtitle">{t('publish.noStops')}</p>}
            {stops.map((st, i) => (
              <Card key={i} className="col gap-8">
                <div className="row between">
                  <button type="button" className="chip soft" onClick={() => setPicker({ target: 'stop', index: i })}>
                    <MapPin size={14} /> {st.cityId ? cityName(cities.find((c) => c.id === st.cityId), lang) : t('publish.stopCity')}
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('common.delete')} onClick={() => setStops((list) => list.filter((_, x) => x !== i))}>
                    <Trash2 size={17} color="var(--error)" />
                  </button>
                </div>
                <Input value={st.label} onChange={(e) => setStops((list) => list.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))} placeholder={t('publish.stopLabel')} />
              </Card>
            ))}
            <Button variant="outline" block onClick={() => setStops((list) => [...list, { cityId: '', label: '' }])}>
              <Plus size={17} /> {t('publish.addStop')}
            </Button>
          </div>
        )}

        {step === 8 && (
          <>
            <span className="label">{t('publish.atmosphere')}</span>
            {prefToggles}
            <Toggle on={womenOnly} onChange={setWomenOnly} label={t('publish.womenOnly')} hint={t('publish.womenOnlyHint')} />
            <Field label={`${t('publish.notes')} (${t('common.optional')})`}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('publish.notesPlaceholder')} rows={3} />
            </Field>
          </>
        )}

        {step === 9 && (
          <>
            <p className="subtitle">{t('publish.review')}</p>
            <Card className="col gap-12">
              <div className="row between">
                <span className="bold">{fromCity ? cityName(fromCity, lang) : '—'} → {toCity ? cityName(toCity, lang) : '—'}</span>
                <span className="navy-text bold">{formatPrice(Number(price) || 0, lang)}</span>
              </div>
              {stops.length > 0 && (
                <span className="tiny muted">{t('publish.step8')} : {stops.map((st) => cityName(cities.find((c) => c.id === st.cityId), lang)).join(' · ')}</span>
              )}
              <div className="divider" />
              <div className="row between small"><span className="muted">{t('common.date')}</span><span className="bold">{departureAt ? new Date(departureAt).toLocaleDateString(LOCALES[lang], { weekday: 'short', day: 'numeric', month: 'short' }) : '—'} · {time}</span></div>
              {arrivalAt && <div className="row between small"><span className="muted">{t('publish.arrivalEstimate')}</span><span className="bold">{formatTime(arrivalAt, lang)}</span></div>}
              <div className="row between small"><span className="muted">{t('publish.step4')}</span><span className="bold">{seats} {t('common.seats')}</span></div>
              <div className="row between small"><span className="muted">{t('publish.step5')}</span><span className="bold">{vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : '—'}</span></div>
              <div className="row between small"><span className="muted">{t('publish.pickupPoint')}</span><span className="bold ellipsis" style={{ maxWidth: '55%' }}>{pickup}</span></div>
              <div className="row between small"><span className="muted">{t('publish.dropoffPoint')}</span><span className="bold ellipsis" style={{ maxWidth: '55%' }}>{dropoff}</span></div>
              <div className="row wrap gap-8">
                {womenOnly && <Badge variant="navy">{t('publish.womenOnly')}</Badge>}
                {recurringOn && <Badge variant="neutral">{t('driver.recurring')}</Badge>}
                {prefs.quiet && <Badge variant="neutral">{t('ride.pref.quiet')}</Badge>}
                {prefs.chatty && <Badge variant="neutral">{t('ride.pref.chatty')}</Badge>}
                {prefs.ac && <Badge variant="neutral">{t('ride.pref.ac')}</Badge>}
              </div>
              {notes.trim() && <p className="small muted">{notes}</p>}
            </Card>
            <Banner kind="warning">{t('driver.costSharingWarning')}</Banner>
          </>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        <div className="row gap-12 mt-8">
          {step > 0 && <Button variant="ghost" onClick={back}>{t('common.previous')}</Button>}
          <Button block size="lg" onClick={step === STEP_COUNT - 1 ? submit : next}>
            {step === STEP_COUNT - 1 ? (editRide ? t('publish.saveChanges') : t('publish.publish')) : t('common.next')}
          </Button>
        </div>
      </div>

      <CityPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker?.target === 'to' ? t('publish.destinationCity') : picker?.target === 'stop' ? t('publish.stopCity') : t('publish.departureCity')}
        onSelect={(cityId) => {
          if (!picker) return;
          if (picker.target === 'from') setFromCityId(cityId);
          else if (picker.target === 'to') setToCityId(cityId);
          else {
            const idx = picker.index;
            setStops((list) => list.map((x, i) => (i === idx ? { ...x, cityId } : x)));
          }
        }}
      />
    </Screen>
  );
}