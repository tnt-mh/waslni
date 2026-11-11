import { Cigarette, CigaretteOff, Luggage, MessageCircle, Music, PawPrint, Snowflake, VolumeX } from 'lucide-react';
import type { RidePreferences } from '../lib/types';
import { useI18n } from '../i18n';

export function PreferenceIcons({ prefs, size = 13 }: { prefs: RidePreferences; size?: number }) {
  const { t } = useI18n();
  const items: Array<{ on: boolean; icon: typeof Music; label: string }> = [
    { on: prefs.chatty, icon: MessageCircle, label: t('ride.pref.chatty') },
    { on: prefs.quiet, icon: VolumeX, label: t('ride.pref.quiet') },
    { on: prefs.music, icon: Music, label: t('ride.pref.music') },
    { on: prefs.luggage, icon: Luggage, label: t('ride.pref.luggage') },
    { on: true, icon: prefs.smokingAllowed ? Cigarette : CigaretteOff, label: prefs.smokingAllowed ? t('ride.pref.smoking') : t('ride.pref.nonSmoking') },
    { on: prefs.petsAllowed, icon: PawPrint, label: prefs.petsAllowed ? t('ride.pref.pets') : t('ride.pref.noPets') },
    { on: prefs.ac, icon: Snowflake, label: t('ride.pref.ac') },
  ];
  return (
    <span className="pref-icons">
      {items.filter((i) => i.on).map((i, idx) => (
        <span key={idx} className="pref" title={i.label} aria-label={i.label}>
          <i.icon size={size} />
        </span>
      ))}
    </span>
  );
}