import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function Dashboard({ user, onLogout, socket }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newBroadcast, setNewBroadcast] = useState({
    title: '',
    description: ''
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // Fetch broadcasts
  useEffect(() => {
    fetchBroadcasts();
  }, []);

  // Listen for WebSocket events
  useEffect(() => {
    if (!socket) return;

    socket.on('chat:receive', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    socket.on('reaction:receive', (reaction) => {
      setChatMessages(prev => [...prev, {
        type: 'reaction',
        ...reaction
      }]);
    });

    return () => {
      socket.off('chat:receive');
      socket.off('reaction:receive');
    };
  }, [socket]);

  const fetchBroadcasts = async () => {
    try {
      const response = await axios.get('/api/broadcasts');
      setBroadcasts(response.data.broadcasts || []);
    } catch (error) {
      toast.error('Failed to load broadcasts');
      console.error('Error fetching broadcasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        '/api/broadcasts',
        newBroadcast,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      setBroadcasts(prev => [...prev, response.data.broadcast]);
      setNewBroadcast({ title: '', description: '' });
      setShowCreateForm(false);
      toast.success('Broadcast created successfully!');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to create broadcast';
      toast.error(errorMessage);
      console.error('Error creating broadcast:', error);
    }
  };

  const handleStartBroadcast = async (broadcastId) => {
    try {
      const response = await axios.post(
        `/api/broadcasts/${broadcastId}/start`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      setBroadcasts(prev =>
        prev.map(b => (b.id === broadcastId ? response.data.broadcast : b))
      );
      toast.success('Broadcast started!');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to start broadcast';
      toast.error(errorMessage);
      console.error('Error starting broadcast:', error);
    }
  };

  const handleEndBroadcast = async (broadcastId) => {
    try {
      const response = await axios.post(
        `/api/broadcasts/${broadcastId}/end`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      setBroadcasts(prev =>
        prev.map(b => (b.id === broadcastId ? response.data.broadcast : b))
      );
      toast.success('Broadcast ended');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to end broadcast';
      toast.error(errorMessage);
      console.error('Error ending broadcast:', error);
    }
  };

  const handleJoinBroadcast = (broadcastId) => {
    toast.info('Join broadcast feature coming soon!');
    console.log('Join broadcast:', broadcastId);
  };

  const handleSendChat = (e) => {
    e.preventDefault();

    if (!chatInput.trim() || !socket) return;

    socket.emit('chat:send', { message: chatInput });
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">🎙️ LiveAudioCast Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">
              Welcome, <span className="font-medium text-white">{user?.displayName}</span>
            </span>
            <button
              onClick={onLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Create Broadcast Section */}
        <div className="mb-8">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium"
          >
            {showCreateForm ? 'Cancel' : '+ Create Broadcast'}
          </button>

          {showCreateForm && (
            <form onSubmit={handleCreateBroadcast} className="mt-4 bg-gray-800 p-6 rounded">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Broadcast Title
                  </label>
                  <input
                    type="text"
                    value={newBroadcast.title}
                    onChange={(e) =>
                      setNewBroadcast(prev => ({
                        ...prev,
                        title: e.target.value
                      }))
                    }
                    placeholder="e.g., My Awesome Show"
                    className="w-full px-4 py-2 rounded bg-gray-700 border border-gray-600 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description
                  </label>
                  <textarea
                    value={newBroadcast.description}
                    onChange={(e) =>
                      setNewBroadcast(prev => ({
                        ...prev,
                        description: e.target.value
                      }))
                    }
                    placeholder="Tell listeners about your broadcast..."
                    className="w-full px-4 py-2 rounded bg-gray-700 border border-gray-600 outline-none"
                    rows="3"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium"
                >
                  Create Broadcast
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Broadcasts List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-8">Loading broadcasts...</div>
          ) : broadcasts.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-400">
              No broadcasts yet. Create one to get started!
            </div>
          ) : (
            broadcasts.map(broadcast => (
              <div
                key={broadcast.id}
                className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-600 transition"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold">{broadcast.title}</h3>
                    <span
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        broadcast.status === 'active'
                          ? 'bg-green-900 text-green-200'
                          : broadcast.status === 'ended'
                          ? 'bg-gray-700 text-gray-200'
                          : 'bg-blue-900 text-blue-200'
                      }`}
                    >
                      {broadcast.status.charAt(0).toUpperCase() +
                        broadcast.status.slice(1)}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400 mb-4">
                    {broadcast.description}
                  </p>

                  <div className="text-xs text-gray-500 mb-4">
                    <p>Host: {broadcast.hostName}</p>
                    <p>Listeners: {broadcast.listeners}</p>
                  </div>

                  {broadcast.status === 'scheduled' && (
                    <button
                      onClick={() => handleStartBroadcast(broadcast.id)}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium text-sm"
                    >
                      Start Broadcasting
                    </button>
                  )}

                  {broadcast.status === 'active' && (
                    <div className="space-y-2">
                      <button
                        onClick={() => handleJoinBroadcast(broadcast.id)}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm"
                      >
                        Join Broadcast
                      </button>
                      <button
                        onClick={() => handleEndBroadcast(broadcast.id)}
                        className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium text-sm"
                      >
                        End Broadcasting
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat Section (if broadcast is active) */}
        {broadcasts.some(b => b.status === 'active') && (
          <div className="mt-12 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="border-b border-gray-700 p-4">
              <h2 className="text-lg font-bold">Live Chat</h2>
            </div>

            <div className="h-80 overflow-y-auto p-4">
              {chatMessages.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No messages yet...
                </p>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="font-medium text-blue-400">
                        {msg.username}:
                      </span>{' '}
                      <span className="text-gray-300">{msg.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="border-t border-gray-700 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message..."
                  className="flex-1 px-4 py-2 rounded bg-gray-700 border border-gray-600 outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
