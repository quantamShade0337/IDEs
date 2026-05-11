import { useState, useEffect, useRef } from 'react';
import {
  Users, MessageSquare, Copy, Check, Send,
  Wifi, WifiOff, Crown, Circle, Activity, Rocket, TerminalSquare, FileCode,
} from 'lucide-react';
import {
  subscribePresence, subscribeChat, sendChatMessage,
  createCollabSession, endCollabSession, subscribeCollabSession,
  subscribeActivity, logCollabEvent,
} from '../lib/collaboration';
import { useStore } from '../store';
import { isFirebaseReady } from '../lib/firebase';

function Avatar({ user, size = 24 }) {
  const initials = (user.displayName || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
      title={user.displayName}
    >
      {initials}
    </div>
  );
}

function ChatMessage({ msg, isMe }) {
  const time = msg.createdAt?.toDate
    ? msg.createdAt.toDate().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return (
    <div className={`flex gap-2 mb-2 ${isMe ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 text-xs font-bold"
        style={{ background: msg.color }}
      >
        {(msg.displayName || 'U')[0].toUpperCase()}
      </div>
      <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs text-muted">{isMe ? 'You' : msg.displayName}</span>
          <span className="text-xs text-muted/40">{time}</span>
        </div>
        <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
          isMe
            ? 'bg-white text-black rounded-tr-sm'
            : 'bg-surface border border-border text-white rounded-tl-sm'
        }`}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ event, isMe }) {
  const time = event.createdAt?.toDate
    ? event.createdAt.toDate().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const actor = isMe ? 'You' : (event.displayName || 'Someone');

  let icon = Activity;
  let message = `${actor} updated the session`;

  if (event.type === 'session.joined') {
    icon = Wifi;
    message = `${actor} joined the session`;
  } else if (event.type === 'session.started') {
    icon = Crown;
    message = `${actor} started the session`;
  } else if (event.type === 'session.left') {
    icon = WifiOff;
    message = `${actor} left the session`;
  } else if (event.type === 'session.ended') {
    icon = Crown;
    message = `${actor} ended the session`;
  } else if (event.type === 'runtime.action') {
    icon = TerminalSquare;
    const action = event.details?.action || 'updated';
    const framework = event.details?.framework || 'workspace';
    const actionLabel = action === 'start' ? 'started' : action === 'stop' ? 'stopped' : action === 'restart' ? 'restarted' : `${action}ed`;
    message = `${actor} ${actionLabel} the ${framework} runtime`;
  } else if (event.type === 'task.started') {
    icon = TerminalSquare;
    message = `${actor} ran ${event.details?.label || event.details?.task || 'a workspace task'}`;
  } else if (event.type === 'deploy.completed') {
    icon = Rocket;
    message = `${actor} deployed ${event.details?.slug ? `/${event.details.slug}` : 'the project'}`;
  } else if (event.type === 'file.updated') {
    icon = FileCode;
    message = `${actor} updated ${event.details?.fileName || 'an important file'}`;
  }

  const Icon = icon;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-white/5 p-1.5 text-muted">
          <Icon size={12} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white">{message}</p>
          <p className="mt-1 text-[11px] text-muted">
            {time}
            {event.type === 'runtime.action' && event.details?.port ? ` · port ${event.details.port}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CollaborationPanel({ projectId, files = [] }) {
  const { user, notify } = useStore();
  const [tab, setTab] = useState('people'); // people | activity | chat
  const [activeUsers, setActiveUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [session, setSession] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const chatBottomRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const firebaseReady = isFirebaseReady();

  useEffect(() => {
    if (!projectId || !firebaseReady) return;
    const unsubs = [
      subscribePresence(projectId, setActiveUsers),
      subscribeChat(projectId, setMessages),
      subscribeCollabSession(projectId, setSession),
      subscribeActivity(projectId, setEvents),
    ];
    return () => unsubs.forEach(u => u());
  }, [projectId, firebaseReady]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const handleStartSession = async () => {
    if (!user || user.isGuest) {
      notify('Sign in to start a collaboration session', 'warning');
      return;
    }
    if (!projectId) {
      notify('Save your project first to enable collaboration', 'warning');
      return;
    }
    try {
      await createCollabSession(projectId, user.uid);
      await logCollabEvent(projectId, user, 'session.started');
      notify('Collaboration session started!', 'success');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const handleEndSession = async () => {
    try {
      await endCollabSession(projectId, user);
      notify('Session ended', 'info');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const shareLink = projectId
    ? `${window.location.origin}/editor?collab=${projectId}`
    : null;

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendMsg = async () => {
    if (!chatInput.trim() || sending || !user || !projectId) return;
    setSending(true);
    try {
      await sendChatMessage(projectId, user, chatInput.trim());
      setChatInput('');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const isSessionOwner = session?.ownerId === user?.uid;
  const collabActive = session?.active;
  const fileNamesById = Object.fromEntries(files.map((file) => [file.id, file.name]));

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users size={14} />
          <span className="text-sm font-medium">Collaboration</span>
          {collabActive && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Wifi size={10} /> Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeUsers.length > 0 && (
            <div className="flex -space-x-1.5 mr-2">
              {activeUsers.slice(0, 4).map(u => (
                <Avatar key={u.uid} user={u} size={20} />
              ))}
              {activeUsers.length > 4 && (
                <div className="w-5 h-5 rounded-full bg-border text-muted text-xs flex items-center justify-center">
                  +{activeUsers.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {[
          { id: 'people', icon: Users, label: 'People' },
          { id: 'activity', icon: Activity, label: 'Activity', badge: events.length },
          { id: 'chat', icon: MessageSquare, label: 'Chat', badge: messages.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors border-b-2 ${
              tab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'people' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Session control */}
            {!firebaseReady || !projectId ? (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                <p className="text-xs text-yellow-400 leading-relaxed">
                  {!firebaseReady
                    ? 'Configure Firebase to enable real-time collaboration.'
                    : 'Save your project to enable collaboration.'}
                </p>
              </div>
            ) : !collabActive ? (
              <div className="space-y-3">
                <p className="text-xs text-muted leading-relaxed">
                  Start a live session to collaborate in real-time with teammates.
                </p>
                <button
                  onClick={handleStartSession}
                  className="w-full bg-white text-black text-xs py-2 rounded-lg font-medium hover:bg-white/90 transition-colors"
                >
                  Start Session
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi size={12} className="text-green-400" />
                    <span className="text-xs text-green-400 font-medium">Session Active</span>
                  </div>
                  <p className="text-xs text-muted mb-3">Share this link to invite collaborators:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={shareLink || ''}
                      className="flex-1 bg-bg border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-muted"
                    />
                    <button
                      onClick={copyLink}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {isSessionOwner && (
                  <button
                    onClick={handleEndSession}
                    className="w-full border border-red-500/30 text-red-400 text-xs py-2 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    End Session
                  </button>
                )}
              </div>
            )}

            {/* Active users list */}
            {activeUsers.length > 0 && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Active now</p>
                <div className="space-y-2">
                  {activeUsers.map(u => (
                    <div key={u.uid} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white/5">
                      <Avatar user={u} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{u.displayName}</span>
                          {u.uid === session?.ownerId && (
                            <Crown size={10} className="text-yellow-400 shrink-0" />
                          )}
                          {u.uid === user?.uid && (
                            <span className="text-xs text-muted/60">(you)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Circle size={6} className="text-green-400 fill-green-400" />
                          <span className="text-xs text-muted/60">Online</span>
                        </div>
                        {(u.activeFileId || u.cursor?.line) && (
                          <div className="mt-1 text-[11px] text-muted/70">
                            {u.activeFileId && fileNamesById[u.activeFileId]
                              ? `Editing ${fileNamesById[u.activeFileId]}`
                              : 'Active in editor'}
                            {u.cursor?.line ? ` · Ln ${u.cursor.line}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <div className="flex-1 overflow-y-auto p-4">
            {!firebaseReady || !projectId ? (
              <div className="flex items-center justify-center h-full text-muted text-xs text-center px-4">
                {!firebaseReady ? 'Configure Firebase to enable shared activity' : 'Save project to enable shared activity'}
              </div>
            ) : events.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Activity size={24} className="text-muted mx-auto mb-2" />
                  <p className="text-xs text-muted">No collaboration activity yet</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <ActivityItem key={event.id} event={event} isMe={event.uid === user?.uid} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'chat' && (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {!firebaseReady || !projectId ? (
                <div className="flex items-center justify-center h-full text-muted text-xs text-center px-4">
                  {!firebaseReady ? 'Configure Firebase to enable chat' : 'Save project to enable chat'}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageSquare size={24} className="text-muted mx-auto mb-2" />
                    <p className="text-xs text-muted">No messages yet</p>
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <ChatMessage key={msg.id} msg={msg} isMe={msg.uid === user?.uid} />
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {firebaseReady && projectId && (
              <div className="p-3 border-t border-border shrink-0">
                <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                    placeholder="Send a message..."
                    className="flex-1 bg-transparent text-xs text-white placeholder-muted focus:outline-none"
                  />
                  <button
                    onClick={sendMsg}
                    disabled={!chatInput.trim() || sending || !user || user.isGuest}
                    className="text-muted hover:text-white transition-colors disabled:opacity-30"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
