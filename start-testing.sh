#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║   🎙️  LiveAudioCast Testing Setup     ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js detected: $(node -v)${NC}"

# Install root dependencies for mock server
echo -e "\n${YELLOW}📦 Installing mock server dependencies...${NC}"
npm install express cors socket.io > /dev/null 2>&1

# Install frontend dependencies
echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
cd frontend/web
npm install > /dev/null 2>&1
cd ../..

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Start backend in background
echo -e "\n${YELLOW}🚀 Starting Mock Backend Server on port 4000...${NC}"
node mock-server.js &
BACKEND_PID=$!
sleep 2

# Check if backend is running
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Backend running (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Failed to start backend${NC}"
    exit 1
fi

# Start frontend in background
echo -e "${YELLOW}🚀 Starting Frontend Dev Server on port 5173...${NC}"
cd frontend/web
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
sleep 3
cd ../..

# Check if frontend is running
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Frontend running (PID: $FRONTEND_PID)${NC}"
else
    echo -e "${RED}❌ Failed to start frontend${NC}"
    kill $BACKEND_PID
    exit 1
fi

echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         🎉 Ready for Testing!          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}📱 Open your browser:${NC}"
echo -e "   ${BLUE}http://localhost:5173${NC}"

echo -e "\n${GREEN}🔐 Test Credentials:${NC}"
echo -e "   Email: ${YELLOW}admin@liveaudiocast.com${NC}"
echo -e "   Password: ${YELLOW}admin123${NC}"

echo -e "\n${GREEN}📊 Server Status:${NC}"
echo -e "   Backend: ${BLUE}http://localhost:4000${NC}"
echo -e "   Frontend: ${BLUE}http://localhost:5173${NC}"

echo -e "\n${YELLOW}ℹ️  Press Ctrl+C to stop both servers${NC}"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}✓ Servers stopped${NC}"
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Keep script running
wait
