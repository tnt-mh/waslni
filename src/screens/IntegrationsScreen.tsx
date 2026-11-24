import { Cloud, KeyRound, MapPin, MessageSquare, Radio, ShieldCheck } from 'lucide-react';
import { Screen } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Badge, Banner, Card } from '../components/ui';
import { useStore } from '../lib/store';
import { mapsConfigured, pushConfigured, runtimeMode, supabaseConfigured } from '../lib/runtime';
import { useI18n } from '../i18n';

type ServiceStatus = 'connected' | 'configured' | 'notConnected' | 'local';

export function IntegrationsScreen() {
  const { t } = useI18n();
  const connectionStatus = useStore((s) => s.connectionStatus);
  const demo = runtimeMode === 'demo';
  const backendReady = !demo && connectionStatus === 'ready';
  const backendConfigured = !demo && supabaseConfigured;
  const services = [
    {
      icon: Cloud,
      title: 'integrations.supabase',
      desc: 'integrations.supabaseDesc',
      status: demo ? 'local' : backendReady ? 'connected' : backendConfigured ? 'configured' : 'notConnected',
    },
    { icon: MessageSquare, title: 'integrations.sms', desc: 'integrations.smsDesc', status: 'notConnected' },
    { icon: MapPin, title: 'integrations.maps', desc: 'integrations.mapsDesc', status: mapsConfigured ? 'configured' : 'notConnected' },
    { icon: Radio, title: 'integrations.push', desc: 'integrations.pushDesc', status: pushConfigured ? 'configured' : 'notConnected' },
    {
      icon: ShieldCheck,
      title: 'integrations.storage',
      desc: 'integrations.storageDesc',
      status: demo ? 'local' : backendConfigured ? 'configured' : 'notConnected',
    },
    { icon: KeyRound, title: 'integrations.location', desc: 'integrations.locationDesc', status: 'notConnected' },
  ] satisfies Array<{ icon: typeof Cloud; title: string; desc: string; status: ServiceStatus }>;

  return (
    <Screen>
      <ScreenHeader title={t('integrations.title')} />
      <div className="screen-body col gap-16">
        <p className="subtitle">{t(demo ? 'integrations.subtitle' : 'integrations.productionSubtitle')}</p>
        <div className="col gap-8">
          {services.map((service) => (
            <Card key={service.title} className="col gap-8">
              <div className="row between gap-8">
                <span className="row gap-8 small bold"><service.icon size={17} color="var(--navy)" /> {t(service.title)}</span>
                <Badge variant={service.status === 'connected' ? 'success' : service.status === 'local' || service.status === 'configured' ? 'warning' : 'neutral'}>
                  {t(`integrations.status.${service.status}`)}
                </Badge>
              </div>
              <p className="small muted">{t(service.desc)}</p>
            </Card>
          ))}
        </div>
        <Banner kind="info">{t('integrations.configNote')}</Banner>
      </div>
    </Screen>
  );
}
