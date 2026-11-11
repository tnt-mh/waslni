import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { Sheet } from './feedback';
import { Input } from './ui';
import { useStore } from '../lib/store';
import { useI18n } from '../i18n';
import { cityName } from '../lib/cities';

export function CityPicker({ open, onClose, onSelect, title }: {
  open: boolean; onClose: () => void; onSelect: (cityId: string) => void; title: string;
}) {
  const { t, lang } = useI18n();
  const cities = useStore((s) => s.cities);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? cities.filter((c) => c.nameFr.toLowerCase().includes(query) || c.nameAr.includes(q.trim()) || String(c.code) === query)
      : cities;
    return [...list].sort((a, b) => a.nameFr.localeCompare(b.nameFr));
  }, [cities, q]);

  const popular = cities.filter((c) => c.popular);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="input-icon-wrap mb-16">
        <span className="lead-icon"><Search size={17} /></span>
        <Input
          className="input"
          placeholder={t('home.searchCity')}
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          style={{ paddingInlineStart: 42 }}
        />
      </div>
      {!q && (
        <>
          <span className="label mb-8">{t('home.popular')}</span>
          <div className="row wrap gap-8 mb-16">
            {popular.map((c) => (
              <button key={c.id} className="chip soft" onClick={() => { onSelect(c.id); onClose(); setQ(''); }}>
                {cityName(c, lang)}
              </button>
            ))}
          </div>
          <span className="label mb-8">{t('home.allWilayas')}</span>
        </>
      )}
      <div className="col gap-4" style={{ maxHeight: '46dvh', overflowY: 'auto' }}>
        {filtered.map((c) => (
          <button
            key={c.id}
            className="list-row"
            onClick={() => { onSelect(c.id); onClose(); setQ(''); }}
          >
            <MapPin size={17} color="var(--navy)" />
            <span className="grow small bold">{cityName(c, lang)}</span>
            <span className="tiny muted-2">{String(c.code).padStart(2, '0')}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="subtitle center" style={{ padding: 20 }}>{t('search.noResults')}</p>}
      </div>
    </Sheet>
  );
}