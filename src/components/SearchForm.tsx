import { useState } from 'react';
import { ArrowDownUp, CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { Button, Field, Input, Stepper } from './ui';
import { CityPicker } from './CityPicker';
import { useStore } from '../lib/store';
import { cityName } from '../lib/cities';
import { useI18n } from '../i18n';
import { todayInputValue } from '../lib/utils';
import type { SearchQuery } from '../lib/types';

export function SearchForm({ initial, onSubmit, submitLabel }: {
  initial?: Partial<SearchQuery>; onSubmit: (q: SearchQuery) => void; submitLabel?: string;
}) {
  const { t, lang } = useI18n();
  const cities = useStore((s) => s.cities);
  const [from, setFrom] = useState(initial?.fromCityId ?? 'w16');
  const [to, setTo] = useState(initial?.toCityId ?? '');
  const [date, setDate] = useState(initial?.date ?? todayInputValue());
  const [seats, setSeats] = useState(initial?.seats ?? 1);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [error, setError] = useState('');

  const submit = () => {
    setError('');
    if (!to) return setError(t('home.destination'));
    if (from === to) return setError(t('home.sameCity'));
    if (date < todayInputValue()) return setError(t('home.pastDate'));
    onSubmit({ fromCityId: from, toCityId: to, date, seats });
  };

  return (
    <div className="card col gap-12">
      <div className="col gap-8" style={{ position: 'relative' }}>
        <button className="search-input" onClick={() => setPicker('from')}>
          <MapPin size={17} color="var(--navy)" />
          <span className="grow bold" style={{ color: 'var(--text)' }}>{cityName(cities.find((c) => c.id === from), lang)}</span>
          <span className="tiny muted">{t('home.departure')}</span>
        </button>
        <button
          className="icon-btn"
          style={{ position: 'absolute', insetInlineEnd: 6, top: '50%', transform: 'translateY(-50%)', background: '#fff', boxShadow: 'var(--shadow-md)', width: 34, height: 34, zIndex: 2 }}
          aria-label={t('home.swap')}
          onClick={() => { setFrom(to || from); setTo(to ? from : to); }}
        >
          <ArrowDownUp size={15} />
        </button>
        <button className="search-input" onClick={() => setPicker('to')}>
          <MapPin size={17} color="var(--navy)" />
          <span className="grow" style={{ color: to ? 'var(--text)' : undefined, fontWeight: to ? 700 : 400 }}>
            {to ? cityName(cities.find((c) => c.id === to), lang) : t('home.whereTo')}
          </span>
          <span className="tiny muted">{t('home.destination')}</span>
        </button>
      </div>
      <div className="row gap-12">
        <div className="grow">
          <Field label={t('common.date')}>
            <div className="input-icon-wrap">
              <span className="lead-icon"><CalendarDays size={16} /></span>
              <Input type="date" value={date} min={todayInputValue()} onChange={(e) => setDate(e.target.value)} style={{ paddingInlineStart: 40 }} />
            </div>
          </Field>
        </div>
        <div className="col gap-6" style={{ gap: 6 }}>
          <span className="label row gap-4"><Users size={13} /> {t('home.passengers')}</span>
          <Stepper value={seats} min={1} max={7} onChange={setSeats} />
        </div>
      </div>
      {error && <span className="error-text" style={{ margin: 0 }}>{error}</span>}
      <Button block size="lg" onClick={submit}><Search size={18} /> {submitLabel ?? t('home.searchRides')}</Button>
      <CityPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === 'from' ? t('home.departure') : t('home.destination')}
        onSelect={(id) => (picker === 'from' ? setFrom(id) : setTo(id))}
      />
    </div>
  );
}