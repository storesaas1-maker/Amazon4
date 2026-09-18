let socket;
let activeRole;

const ADMIN_ROLES = ['admin', 'super_admin'];

const emitRooms = () => {
  // Ensure the connection is actually established before emitting rooms
  if (!socket || !socket.connected || !activeRole) return;
  socket.emit('join_users');
  if (ADMIN_ROLES.includes(activeRole)) socket.emit('join_admin');
};

function createSocket() {
  if (typeof window === 'undefined' || !window.io) return null;

  const instance = window.io({
    withCredentials: true,
    // Restrict to websocket transport to avoid issues with sticky sessions
    transports: ['websocket'],
    // Reconnection settings
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  instance.on('connect', emitRooms);
  instance.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err?.message || err);
  });
  instance.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason);
  });

  return instance;
}

export function getSocket() {
  // True singleton: reuse existing instance
  if (!socket) socket = createSocket();
  return socket;
}

export function onEvent(name, handler) {
  const instance = getSocket();
  if (!instance) return () => {};
  instance.on(name, handler);
  return () => instance.off(name, handler);
}

export function joinRooms(role) {
  // Avoid re-emitting if already connected with same role
  if (activeRole === role && socket?.connected) return;
  activeRole = role;
  const instance = getSocket();
  // Emit immediately if connected, otherwise automatically when connected
  if (instance?.connected) emitRooms();
}

export function disconnectSocket() {
  if (!socket) return;
  socket.off('connect', emitRooms);
  socket.disconnect();
  socket = undefined;
  activeRole = undefined;
}
