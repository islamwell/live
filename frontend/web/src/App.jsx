import { useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';

const API_URL = 'http://localhost:4000';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking');

  // Check server health
  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await axios.get(`${API_URL}/health`);
        if (response.data.status === 'healthy') {
          setServerStatus('online');
        }
      } catch (error) {
        setServerStatus('offline');
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      verifyToken(savedToken);
    }
  }, []);

  // Initialize Socket.IO
  useEffect(() => {
    if (isLoggedIn && !socket) {
      const newSocket = io(API_URL, {
        auth: {
          token
        }
      });

      newSocket.on('connect', () => {
        console.log('WebSocket connected');
      });

      newSocket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isLoggedIn, token, socket]);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokenToVerify}`
        }
      });
      setUser(response.data.user);
      setToken(tokenToVerify);
      setIsLoggedIn(true);
    } catch (error) {
      localStorage.removeItem('token');
      setIsLoggedIn(false);
    }
  };

  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    setIsLoggedIn(true);
    localStorage.setItem('token', userToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setIsLoggedIn(false);
    localStorage.removeItem('token');
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Server Status Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 border border-gray-700">
          <div
            className={`w-2 h-2 rounded-full ${
              serverStatus === 'online'
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
          ></div>
          <span className="text-sm">
            Backend: {serverStatus === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      {isLoggedIn ? (
        <Dashboard user={user} onLogout={handleLogout} socket={socket} />
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
