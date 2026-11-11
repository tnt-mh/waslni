import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, MessageCircle, Plus, Send } from 'lucide-react';
import { Screen, EmptyState, Sheet, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Badge, Button, Card, Field, Input, Segmented, Select, Stepper, Toggle } from '../components/ui';
import { CityPicker } from '../components/CityPicker';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatPrice, todayInputValue } from '../lib/utils';
import { useI18n } from '../i18n';

const TIME_KEYS = ['morning', 'afternoon', 'evening', 'flexible'] as const;

export function RideRequestsScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const me = useStore(currentUser)!;
  const requests = useStore((s) => s.rideRequests);
  const cities = useStore((s) => s.cities);
  const rides = useStore((s) => s.rides);
  const createRideRequest = useStore((s) => s.createRideRequest);
  const closeRideRequest = useStore((s) => s.closeRideRequest);
  const ensureConversation = useStore((s) => s.ensureConversation);

  const [tab, setTab] = useState<'mine' | 'all'>(me.mode === 'driver' ? 'all' : 'mine');
  const [open, setOpen] = useState(params.get('new') === '1');
  const [from, setFrom] = useState(params.get('from') ?? 'w16');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [date, setDate] = useState(params.get('date') ?? todayInputValue());
  const [timePref, setTimePref] = useState<string>('flexible');
  const [seats, setSeats] = useState(Number(params.get('seats') ?? 1));
  const [budget, setBudget] = useState('500');
  const [womenOnly, setWomenOnly] = useState(false);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [error, setError] = useState('');

  const list = (tab === 'mine' ? requests.filter((r) => r.passengerId === me.id) : requests.filter((r) => r.status === 'open'))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const submit = () => {
    setError('');
    if (!to) return setError(t('home.destination'));
    if (from === to) return setError(t('home.sameCity'));
    const maxBudget = Number(budget);
    if (!Number.isFinite(maxBudget) || maxBudget < 0) return setError(t('publish.invalidPrice'));
    const res = createRideRequest({ fromCityId: from, toCityId: to, date, timePreference: timePref, seats, maxBudget, womenOnly });
    if (!res.ok) return setError(t(res.error));
    setOpen(false);
    setTab('mine');
    toast(t('req.published'), 'success');
  };

  const timeLabel = (key: string) => t(`req.time${key.charAt(0).toUpperCase()}${key.slice(1)}`);

  return (
    <Screen>
      <ScreenHeader title={t('req.title')} right={<Button size="sm" onClick={() => setOpen(true)}><Plus size={15} /> {t('req.create')}</Button>} />
      <div className="screen-body">
        <p className="subtitle">{t('req.subtitle')}</p>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mine', label: t('req.myRequests') },
            { value: 'all', label: t('req.allRequests') },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState icon={<Inbox size={30} />} title={t('req.empty')} action={<Button onClick={() => setOpen(true)}><Plus size={16} /> {t('req.create')}</Button>} />
        ) : (
          <div className="col gap-12 stagger">
            {list.map((r) => {
              const author = useStore.getState().users.find((u) => u.id === r.passengerId);
              const matching = rides.filter((x) => x.status === 'published' && x.fromCityId === r.fromCityId && x.toCityId === r.toCityId && new Date(x.departureAt).getTime() > Date.now());
              const isMine = r.passengerId === me.id;
              return (
                <Card key={r.id} className="col gap-10" >
                  <div className="row between">
                    <span className="bold small">
                      {cityName(cities.find((c) => c.id === r.fromCityId), lang)} → {cityName(cities.find((c) => c.id === r.toCityId), lang)}
                    </span>
                    <Badge variant={r.status === 'open' ? 'success' : 'neutral'}>{t(r.status === 'open' ? 'req.open' : 'req.closed')}</Badge>
                  </div>
                  <span className="tiny muted">
                    {formatDate(`${r.date}T12:00:00`, lang)} · {timeLabel(r.timePreference)} · {r.seats} {t(r.seats > 1 ? 'common.seats' : 'common.seat')}
                  </span>
                  <div className="row between">
                    <span className="small navy-text bold">{t('req.budget', { amount: formatPrice(r.maxBudget, lang) })}</span>
                    {!isMine && author && <span className="tiny muted">{author.fullName}</span>}
                  </div>
                  {r.womenOnly && <Badge variant="navy">{t('search.womenOnlyBadge')}</Badge>}
                  {isMine && matching.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/search?from=${r.fromCityId}&to=${r.toCityId}&date=${r.date}&seats=${r.seats}`)}>
                      {t('req.matchingRides')} ({matching.length})
                    </Button>
                  )}
                  <div className="row gap-8">
                    {isMine && r.status === 'open' && (
                      <Button variant="outline" size="sm" block onClick={() => { closeRideRequest(r.id); toast(t('req.closed'), 'success'); }}>{t('req.close')}</Button>
                    )}
                    {!isMine && me.mode === 'driver' && r.status === 'open' && (
                      <>
                        <Button variant="secondary" size="sm" block onClick={() => { const c = ensureConversation(r.passengerId); if (c) navigate(`/chat/${c}`); }}>
                          <MessageCircle size={14} /> {t('req.contactPassenger')}
                        </Button>
                        <Button size="sm" block onClick={() => navigate(`/driver/publish?from=${r.fromCityId}&to=${r.toCityId}`)}>
                          <Send size={14} /> {t('req.offerRide')}
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('req.create')}>
        <div className="col gap-16">
          <div className="row gap-8">
            <Button variant="outline" block onClick={() => setPicker('from')}>{cityName(cities.find((c) => c.id === from), lang)}</Button>
            <Button variant="outline" block onClick={() => setPicker('to')}>{to ? cityName(cities.find((c) => c.id === to), lang) : t('home.destination')}</Button>
          </div>
          <Field label={t('req.desiredDate')}>
            <Input type="date" value={date} min={todayInputValue()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('req.timePreference')}>
            <Select value={timePref} onChange={(e) => setTimePref(e.target.value)}>
              {TIME_KEYS.map((k) => <option key={k} value={k}>{timeLabel(k)}</option>)}
            </Select>
          </Field>
          <div className="row between">
            <span className="label">{t('home.passengers')}</span>
            <Stepper value={seats} min={1} max={7} onChange={setSeats} />
          </div>
          <Field label={t('req.maxBudget')}>
            <Input type="number" min={0} step={50} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
          <Toggle on={womenOnly} onChange={setWomenOnly} label={t('publish.womenOnly')} hint={t('publish.womenOnlyHint')} />
          {error && <span className="error-text">{error}</span>}
          <p className="hint">{t('req.notifyDrivers')}</p>
          <Button block size="lg" onClick={submit}>{t('req.create')}</Button>
        </div>
      </Sheet>
      <CityPicker open={picker !== null} onClose={() => setPicker(null)} title={picker === 'from' ? t('home.departure') : t('home.destination')} onSelect={(id) => (picker === 'from' ? setFrom(id) : setTo(id))} />
    </Screen>
  );
}