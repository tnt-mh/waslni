import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Ban, Flag, MessageCircle, Send } from 'lucide-react';
import { Screen, EmptyState, ConfirmDialog, useToast } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Banner, Button, IconButton, Input } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { cityName } from '../lib/cities';
import { formatDate, formatTime } from '../lib/utils';
import { useI18n } from '../i18n';

export function ConversationScreen() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useStore(currentUser)!;
  const conv = useStore((s) => s.conversations.find((c) => c.id === id));
  const msgs = useStore(useShallow((s) => s.messages.filter((m) => m.conversationId === id)));
  const ride = useStore((s) => s.rides.find((r) => r.id === conv?.rideId));
  const from = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.fromCityId), lang));
  const to = useStore((s) => cityName(s.cities.find((c) => c.id === ride?.toCityId), lang));
  const other = useStore((s) => s.users.find((u) => u.id === conv?.participantIds.find((p) => p !== me.id)));
  const sendMessage = useStore((s) => s.sendMessage);
  const markConversationRead = useStore((s) => s.markConversationRead);
  const blockInConversation = useStore((s) => s.blockInConversation);

  const [draft, setDraft] = useState('');
  const [blockOpen, setBlockOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!conv) return;
    let active = true;
    void (async () => {
      try {
        const res = await markConversationRead(conv.id);
        if (active && !res.ok) toast(t(res.error), 'error');
      } catch {
        if (active) toast(t('common.error'), 'error');
      }
    })();
    return () => { active = false; };
  }, [conv, msgs.length, markConversationRead, toast]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  if (!conv || !other) {
    return (
      <Screen noNav>
        <ScreenHeader title={t('msg.title')} />
        <div className="screen-body"><EmptyState icon={<MessageCircle size={28} />} title={t('msg.empty')} /></div>
      </Screen>
    );
  }

  const blockedByMe = conv.blockedBy === me.id;
  const blockedByOther = !!conv.blockedBy && !blockedByMe;
  const canSend = !conv.blockedBy;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const res = await sendMessage(conv.id, trimmed);
      if (!res.ok) return toast(t(res.error), 'error');
      setDraft('');
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen noNav className="chat-screen">
      <ScreenHeader
        title={
          <button type="button" className="row gap-8 center" style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }} onClick={() => navigate(`/user/${other.id}`)}>
            <Avatar user={other} size="sm" /> {other.fullName}
          </button>
        }
        right={
          <>
            <IconButton label={t('msg.reportUser')} onClick={() => navigate(`/report/user/${other.id}`)}><Flag size={17} /></IconButton>
            <IconButton label={t('report.block')} onClick={() => setBlockOpen(true)}><Ban size={17} /></IconButton>
          </>
        }
      />

      {ride && (
        <button
          type="button"
          className="banner info"
          style={{ margin: '8px 16px 0', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'start' }}
          onClick={() => navigate(ride.driverId === me.id ? `/driver/ride/${ride.id}` : `/ride/${ride.id}`)}
        >
          {t('msg.rideContext', { from, to, date: formatDate(ride.departureAt, lang) })}
        </button>
      )}

      <div className="chat-body">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.senderId === me.id ? 'mine' : 'theirs'}`}>
            {m.text}
            <span className="meta">
              {formatTime(m.createdAt, lang)}
              {m.autoReply && <span className="badge demo">{t('msg.demoReplyTag')}</span>}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {blockedByMe && (
        <div className="col gap-8" style={{ padding: '0 16px 8px' }}>
          <Banner kind="warning">{t('msg.blockedNotice')}</Banner>
          <Button block size="sm" variant="outline" onClick={async () => {
            try {
              const res = await blockInConversation(conv.id, false);
              if (!res.ok) toast(t(res.error), 'error');
            } catch {
              toast(t('common.error'), 'error');
            }
          }}>{t('msg.unblock')}</Button>
        </div>
      )}
      {blockedByOther && <div style={{ padding: '0 16px 8px' }}><Banner kind="warning">{t('msg.blocked')}</Banner></div>}

      {canSend && (
        <div className="quick-replies">
          {(['msg.quick1', 'msg.quick2', 'msg.quick3', 'msg.quick4'] as const).map((k) => (
            <button key={k} type="button" className="chip soft" onClick={async () => { await send(t(k)); }}>{t(k)}</button>
          ))}
        </div>
      )}

      <form
        className="chat-composer"
        onSubmit={async (e) => { e.preventDefault(); await send(draft); }}
      >
        <Input
          className="input grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('msg.placeholder')}
          disabled={!canSend}
          maxLength={1000}
        />
        <Button type="submit" round disabled={!canSend || !draft.trim()} aria-label={t('common.send')}>
          <Send size={18} />
        </Button>
      </form>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={async () => {
          try {
            const res = await blockInConversation(conv.id, true);
            if (!res.ok) return toast(t(res.error), 'error');
            toast(t('report.blocked'), 'success');
          } catch {
            toast(t('common.error'), 'error');
          }
        }}
        title={t('report.block')}
        message={t('report.blockConfirm')}
        confirmLabel={t('report.block')}
        danger
      />
    </Screen>
  );
}