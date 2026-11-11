import { Cloud, KeyRound, MapPin, MessageSquare, Radio, ShieldCheck } from 'lucide-react';
import { Screen } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Badge, Banner, Card } from '../components/ui';
import { useI18n } from '../i18n';

const SERVICES = [
  { icon: Cloud, title: 'integrations.supabase', desc: 'integrations.supabaseDesc', status: 'notConnected' },
  { icon: MessageSquare, title: 'integrations.sms', desc: 'integrations.smsDesc', status: 'notConnected' },
  { icon: MapPin, title: 'integrations.maps', desc: 'integrations.mapsDesc', status: 'local' },
  { icon: Radio, title: 'integrations.push', desc: 'integrations.pushDesc', status: 'notConnected' },
  { icon: ShieldCheck, title: 'integrations.storage', desc: 'integrations.storageDesc', status: 'local' },
  { icon: KeyRound, title: 'integrations.location', desc: 'integrations.locationDesc', status: 'notConnected' },
] as const;

export function IntegrationsScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <ScreenHeader title={t('integrations.title')} />
      <div className="screen-body col gap-16">
        <p className="subtitle">{t('integrations.subtitle')}</p>
        <div className="col gap-8">
          {SERVICES.map((s) => (
            <Card key={s.title} className="col gap-8">
              <div className="row between gap-8">
                <span className="row gap-8 small bold"><s.icon size={17} color="var(--navy)" /> {t(s.title)}</span>
                <Badge variant={s.status === 'local' ? 'warning' : 'neutral'}>
                  {t(`integrations.status.${s.status}`)}
                </Badge>
              </div>
              <p className="small muted">{t(s.desc)}</p>
            </Card>
          ))}
        </div>
        <Banner kind="info">{t('integrations.configNote')}</Banner>
      </div>
    </Screen>
  );
}