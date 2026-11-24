import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { List, Map as MapIcon, Plus, SearchX, SlidersHorizontal } from 'lucide-react';
import { Screen, EmptyState, Sheet, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Button, Segmented, Select, SkeletonCard, Toggle } from '../components/ui';
import { SearchForm } from '../components/SearchForm';
import { RideCard } from '../components/RideCard';
import { MapView } from '../components/MapView';
import { useStore, getDriverRating, getSeatsAvailable } from '../lib/store';
import { cityName } from '../lib/cities';
import { useI18n } from '../i18n';
import { todayInputValue } from '../lib/utils';
import type { Ride, SearchQuery } from '../lib/types';

type SortKey = 'cheapest' | 'earliest' | 'latest' | 'rating' | 'seats';
interface Filters { quiet: boolean; chatty: boolean; womenOnly: boolean; ac: boolean; pets: boolean; luggage: boolean }
const DEFAULT_FILTERS: Filters = { quiet: false, chatty: false, womenOnly: false, ac: false, pets: false, luggage: false };

export function SearchScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const rides = useStore((s) => s.rides);
  const addRecentSearch = useStore((s) => s.addRecentSearch);

  const query: SearchQuery | null = params.get('to')
    ? {
        fromCityId: params.get('from') ?? 'w16',
        toCityId: params.get('to')!,
        date: params.get('date') ?? todayInputValue(),
        seats: Number(params.get('seats') ?? 1),
      }
    : null;

  const [view, setView] = useState<'list' | 'map'>('list');
  const [sort, setSort] = useState<SortKey>('earliest');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const id = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(id);
  }, [params.toString()]);

  const results = useMemo(() => {
    if (!query) return [];
    const dayStart = new Date(`${query.date}T00:00:00`);
    const dayEnd = new Date(`${query.date}T23:59:59`);
    let list = rides.filter((r) =>
      r.status === 'published' &&
      r.fromCityId === query.fromCityId &&
      r.toCityId === query.toCityId &&
      new Date(r.departureAt) >= dayStart &&
      new Date(r.departureAt) <= dayEnd &&
      new Date(r.departureAt).getTime() > Date.now(),
    );
    const state = useStore.getState();
    list = list.filter((r) => getSeatsAvailable(state, r.id) >= query.seats);
    if (filters.quiet) list = list.filter((r) => r.preferences.quiet);
    if (filters.chatty) list = list.filter((r) => r.preferences.chatty);
    if (filters.womenOnly) list = list.filter((r) => r.womenOnly);
    if (filters.ac) list = list.filter((r) => r.preferences.ac);
    if (filters.pets) list = list.filter((r) => r.preferences.petsAllowed);
    if (filters.luggage) list = list.filter((r) => r.preferences.luggage);
    const sorters: Record<SortKey, (a: Ride, b: Ride) => number> = {
      cheapest: (a, b) => a.pricePerSeat - b.pricePerSeat,
      earliest: (a, b) => a.departureAt.localeCompare(b.departureAt),
      latest: (a, b) => b.departureAt.localeCompare(a.departureAt),
      rating: (a, b) => getDriverRating(state, b.driverId).avg - getDriverRating(state, a.driverId).avg,
      seats: (a, b) => getSeatsAvailable(state, b.id) - getSeatsAvailable(state, a.id),
    };
    return [...list].sort(sorters[sort]);
  }, [rides, query, filters, sort]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const fromName = cityName(useStore.getState().cities.find((c) => c.id === query?.fromCityId), lang);
  const toName = cityName(useStore.getState().cities.find((c) => c.id === query?.toCityId), lang);

  const submit = async (q: SearchQuery) => {
    try {
      const res = await addRecentSearch(q);
      if (!res.ok) return toast(t(res.error), 'error');
      setParams({ from: q.fromCityId, to: q.toCityId, date: q.date, seats: String(q.seats) });
      setEditOpen(false);
      window.scrollTo(0, 0);
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={query ? t('search.resultsFor', { from: fromName, to: toName }) : t('nav.search')}
        right={query ? (
          <button className="icon-btn" aria-label={t('search.modify')} onClick={() => setEditOpen(true)}>
            <SlidersHorizontal size={18} />
          </button>
        ) : undefined}
      />
      <div className="screen-body">
        {!query ? (
          <SearchForm onSubmit={submit} />
        ) : (
          <>
            <div className="row between gap-8">
              <span className="small bold muted">{loading ? '…' : t('search.ridesFound', { count: results.length })}</span>
              <div className="row gap-8">
                <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
                  <SlidersHorizontal size={14} /> {t('search.filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </Button>
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'list', label: <><List size={14} /> {t('search.listView')}</> },
                    { value: 'map', label: <><MapIcon size={14} /> {t('search.mapView')}</> },
                  ]}
                />
              </div>
            </div>

            {loading ? (
              <div className="col gap-12"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={<SearchX size={32} />}
                title={t('search.noResults')}
                text={t('search.noResultsHint')}
                action={<Button onClick={() => navigate(`/requests?new=1&from=${query.fromCityId}&to=${query.toCityId}&date=${query.date}&seats=${query.seats}`)}><Plus size={16} /> {t('search.publishRequest')}</Button>}
              />
            ) : view === 'map' ? (
              <div className="col gap-12">
                <MapView fromCityId={query.fromCityId} toCityId={query.toCityId} height={260} />
                <div className="col gap-12 stagger">
                  {results.map((r) => <RideCard key={r.id} ride={r} />)}
                </div>
              </div>
            ) : (
              <div className="col gap-12 stagger">
                {results.map((r) => <RideCard key={r.id} ride={r} />)}
              </div>
            )}
          </>
        )}
      </div>

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t('search.filters')}>
        <div className="col gap-16">
          <div className="field">
            <span className="label">{t('search.sortBy')}</span>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="earliest">{t('search.sort.earliest')}</option>
              <option value="latest">{t('search.sort.latest')}</option>
              <option value="cheapest">{t('search.sort.cheapest')}</option>
              <option value="rating">{t('search.sort.rating')}</option>
              <option value="seats">{t('search.sort.seats')}</option>
            </Select>
          </div>
          <div className="col">
            <Toggle on={filters.quiet} onChange={(v) => setFilters((f) => ({ ...f, quiet: v }))} label={t('search.filter.quiet')} />
            <Toggle on={filters.chatty} onChange={(v) => setFilters((f) => ({ ...f, chatty: v }))} label={t('search.filter.chatty')} />
            <Toggle on={filters.womenOnly} onChange={(v) => setFilters((f) => ({ ...f, womenOnly: v }))} label={t('search.filter.womenOnly')} />
            <Toggle on={filters.ac} onChange={(v) => setFilters((f) => ({ ...f, ac: v }))} label={t('search.filter.ac')} />
            <Toggle on={filters.pets} onChange={(v) => setFilters((f) => ({ ...f, pets: v }))} label={t('search.filter.pets')} />
            <Toggle on={filters.luggage} onChange={(v) => setFilters((f) => ({ ...f, luggage: v }))} label={t('search.filter.luggage')} />
          </div>
          <div className="row gap-8">
            <Button variant="outline" block onClick={() => setFilters(DEFAULT_FILTERS)}>{t('search.reset')}</Button>
            <Button block onClick={() => setFilterOpen(false)}>{t('search.apply')}</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('search.modify')}>
        <SearchForm initial={query ?? undefined} onSubmit={submit} />
      </Sheet>
    </Screen>
  );
}