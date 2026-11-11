import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { MessageCircle } from 'lucide-react';
import { Screen, EmptyState } from '../components/feedback';
import { ScreenHeader } from '../components/AppShell';
import { Avatar, Badge } from '../components/ui';
import { useStore, currentUser } from '../lib/store';
import { timeAgo } from '../lib/utils';
import { useI18n } from '../i18n';

export function MessagesScreen() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const me = useStore(currentUser)!;
  const conversations = useStore(useShallow((s) => s.conversations.filter((c) => c.participantIds.includes(me.id))));
  const messages = useStore((s) => s.messages);
  const users = useStore((s) => s.users);

  const rows = useMemo(() => conversations
    .map((c) => {
      const otherId = c.participantIds.find((p) => p !== me.id)!;
      const convMsgs = messages.filter((m) => m.conversationId === c.id);
      const last = convMsgs[convMsgs.length - 1];
      const unread = convMsgs.filter((m) => m.senderId !== me.id && !m.readBy.includes(me.id)).length;
      return { conv: c, other: users.find((u) => u.id === otherId), last, unread };
    })
    .sort((a, b) => (b.last?.createdAt ?? b.conv.createdAt).localeCompare(a.last?.createdAt ?? a.conv.createdAt)),
  [conversations, messages, users, me.id]);

  return (
    <Screen>
      <ScreenHeader title={t('msg.title')} back={false} />
      <div className="screen-body col gap-8">
        {rows.length === 0 ? (
          <EmptyState icon={<MessageCircle size={28} />} title={t('msg.empty')} text={t('msg.emptyHint')} />
        ) : (
          rows.map(({ conv, other, last, unread }) => (
            <button key={conv.id} className="list-row" onClick={() => navigate(`/chat/${conv.id}`)}>
              <Avatar user={other} size="md" />
              <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                <span className="row between">
                  <span className="small bold">{other?.fullName ?? '—'}</span>
                  {last && <span className="tiny muted-2">{timeAgo(last.createdAt, lang)}</span>}
                </span>
                <span className="tiny muted ellipsis">
                  {last ? `${last.senderId === me.id ? `${t('msg.you')} : ` : ''}${last.text}` : t('msg.empty')}
                </span>
              </span>
              {unread > 0 && <Badge variant="navy">{unread}</Badge>}
            </button>
          ))
        )}
      </div>
    </Screen>
  );
}